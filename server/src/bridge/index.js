/**
 * สะพานข้อมูล: InfluxDB (ของ Node-RED) → PostgreSQL/TimescaleDB
 *
 * หลักการที่ห้ามละเมิด: **อ่านอย่างเดียว ไม่แตะ Influx และไม่แตะ Node-RED**
 * ถ้าสะพานพัง ท่อเดิมยังเดินต่อได้ตามปกติ ข้อมูลดิบไม่หายไปไหน
 *
 * งานที่ทำสามอย่าง
 *   1. แปลงชื่อ field ("temperature_2") เป็นโรงเรือน/อุปกรณ์/metric ผ่าน sensor_source_map
 *   2. ทิ้งค่าที่เป็นไปไม่ได้ — อุปกรณ์ที่อ่าน RS485 ไม่ได้จะคืน 0 มา
 *      ซึ่ง 0 °C ในโรงเรือนหมูคือ "ไม่มีค่า" ไม่ใช่ค่าที่วัดได้
 *   3. เขียนแบบส่งซ้ำไม่เกิดแถวซ้ำ (on conflict do nothing)
 */
import { pool, query } from "../db/pool.js";
import { log } from "../lib/log.js";
import { fetchReadings, ping } from "./influx.js";
import { runAlertPass } from "../alerts/engine.js";
import { runTwinAlertPass } from "../twin/twinAlerts.js";
import { runLineNotifier } from "../line/notifier.js";
import { runHealthCheck } from "../line/health.js";
import { runPrimaryWatch } from "../watchdog/primary.js";
import { runDataFlowWatch } from "../watchdog/dataflow.js";
import { runBoxRecorder } from "../watchdog/boxRecorder.js";

/**
 * ═══ บทบาทของสะพานตัวนี้ (`BRIDGE_ROLE`) ═══
 *
 * เดิมสะพานทำทุกอย่างในตัวเดียว เพราะเครื่องที่อ่าน InfluxDB กับเครื่องที่ส่งไลน์เป็นเครื่องเดียวกัน
 * **24 ก.ย. 2569 ไม่ใช่แล้ว** — ระบบย้ายไปอยู่กล่อง `box-mew` ที่เปิดตลอด 24 ชม.
 * แต่กล่องนั้น **ต่อออกไปหาเครื่องในเทลเน็ตไม่ได้** (tailscaled เป็น userspace-networking
 * รับเข้าได้ทางเดียว · `tailscale ping` ตอบ pong แต่ TCP ตันทุกพอร์ต แม้ผ่าน `tailscale nc`)
 * ส่วน InfluxDB อยู่บนเครื่องผู้พัฒนา จึงต้องให้ **เครื่องผู้พัฒนาเป็นฝ่ายผลักข้อมูลเข้ามา**
 *
 *   `sync`   อ่าน InfluxDB แล้วเขียนลงฐาน — รันบนเครื่องที่เห็น InfluxDB (เครื่องผู้พัฒนา)
 *   `alerts` คิดแจ้งเตือน · ส่งไลน์ · เฝ้าระวังช่องทาง — รันบนเครื่องที่เปิดตลอด (box-mew)
 *   `full`   ทำทั้งสองอย่าง (ค่าตั้งต้น · เครื่องเดียวจบเหมือนเดิม)
 *
 * **ห้ามรัน `alerts` หรือ `full` สองที่พร้อมกันบนฐานเดียวกัน** — เครื่องคิดแจ้งเตือนจะแข่งกัน
 * เปิดใบซ้ำ และคนจะได้ข้อความไลน์สองชุด
 */
const ROLE = (process.env.BRIDGE_ROLE || "full").trim();
if (!["full", "sync", "alerts"].includes(ROLE)) {
  /* ล้มดังกว่าเดินเงียบ ๆ แบบไม่ทำอะไร — พิมพ์ผิดตัวเดียวแล้วแจ้งเตือนหายทั้งระบบคือเรื่องที่ตามไม่เจอ */
  log.error({ BRIDGE_ROLE: ROLE }, "BRIDGE_ROLE ต้องเป็น full · sync · alerts เท่านั้น");
  process.exit(1);
}
const doesSync = ROLE === "full" || ROLE === "sync";
const doesAlerts = ROLE === "full" || ROLE === "alerts";

const INTERVAL_MS = Number(process.env.BRIDGE_INTERVAL_SEC || 30) * 1000;
const BACKFILL_DAYS = Number(process.env.BRIDGE_BACKFILL_DAYS || 60);

/* ดึงซ้ำช่วงท้ายเผื่อไว้ 5 นาที — ข้อมูลที่มาช้าจะได้ไม่ตกหล่น
   เขียนซ้ำไม่เป็นไรเพราะ primary key กันแถวซ้ำอยู่แล้ว */
const OVERLAP_MS = 5 * 60 * 1000;

/* ยิงทีละ 1 วันตอน backfill — ขอ 60 วันรวดเดียว Influx จะตอบก้อนใหญ่มาก */
const WINDOW_MS = 24 * 60 * 60 * 1000;

/** โหลดตารางแปลงใหม่ทุกรอบ — แก้ mapping ในฐานแล้วมีผลทันที ไม่ต้อง deploy ใหม่ */
async function loadMap() {
  const { rows } = await query(`select * from sensor_source_map`);
  return new Map(rows.map((r) => [r.influx_field, r]));
}

/** เขียนไปถึงไหนแล้ว — ใช้ค่าล่าสุดในฐานเป็นตัวตั้ง ไม่ต้องเก็บ state แยก */
async function highWaterMark() {
  const { rows } = await query(`
    select greatest(
      coalesce((select max(at) from sensor_reading), 'epoch'::timestamptz),
      coalesce((select max(at) from power_reading), 'epoch'::timestamptz)
    ) as at
  `);
  const at = rows[0]?.at;
  if (!at || at.getTime() === 0) {
    return new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000);
  }
  return new Date(at.getTime() - OVERLAP_MS);
}

/** ตัดค่าที่เป็นไปไม่ได้ทิ้ง — หัวใจของการไม่ให้ 0 ปลอมขึ้นหน้าจอ */
function isPlausible(map, value) {
  if (map.plausible_min != null && value < map.plausible_min) return false;
  if (map.plausible_max != null && value > map.plausible_max) return false;
  return true;
}

async function insertSensorRows(rows) {
  if (rows.length === 0) return 0;
  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const values = [];
    const params = [];
    chunk.forEach((r, n) => {
      const b = n * 5;
      values.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`);
      params.push(r.at, r.barn_id, r.device_id, r.metric, r.value);
    });
    const res = await query(
      `insert into sensor_reading (at, barn_id, device_id, metric, value)
       values ${values.join(", ")}
       on conflict do nothing`,
      params,
    );
    written += res.rowCount;
  }
  return written;
}

const POWER_COLUMNS = ["voltage", "current_a", "current_b", "current_c", "frequency", "power_kw", "kwh_total"];

async function insertPowerRows(byKey) {
  let written = 0;
  for (const row of byKey.values()) {
    const cols = POWER_COLUMNS.filter((c) => row[c] != null);
    if (cols.length === 0) continue;
    const params = [row.at, row.barn_id, row.device_id, ...cols.map((c) => row[c])];
    const placeholders = cols.map((_, i) => `$${i + 4}`);
    /* do update ไม่ใช่ do nothing — ค่าจากมิเตอร์ทยอยมาคนละ field
       รอบหลังจึงต้องเติมคอลัมน์ที่ยังว่างของแถวเดิมได้ */
    const res = await query(
      `insert into power_reading (at, barn_id, device_id, ${cols.join(", ")})
       values ($1, $2, $3, ${placeholders.join(", ")})
       on conflict (barn_id, device_id, at) do update set
         ${cols.map((c) => `${c} = coalesce(excluded.${c}, power_reading.${c})`).join(", ")}`,
      params,
    );
    written += res.rowCount;
  }
  return written;
}

/** ดึงและเขียนหนึ่งช่วงเวลา */
async function syncWindow(map, start, stop) {
  const readings = await fetchReadings(start.toISOString(), stop.toISOString());
  if (readings.length === 0) return { read: 0, sensor: 0, power: 0, dropped: 0 };

  const sensorRows = [];
  const powerByKey = new Map();
  let dropped = 0;
  /* **นับแยกว่า field ไหนถูกทิ้ง** — ของเดิมรายงานแต่ยอดรวม ("ทิ้ง 252 ค่า") ซึ่งแยกไม่ออก
     ระหว่าง "เซนเซอร์ตัวนี้ไม่ได้ติดตั้ง เลยคืน 0 มาตลอด" (ปกติ ไม่ต้องทำอะไร)
     กับ "เซนเซอร์ที่เคยดีเพิ่งพัง" (ต้องรีบไปดู) — เห็นชื่อ field แล้วแยกออกทันที */
  const droppedBy = new Map();

  for (const r of readings) {
    const m = map.get(r.field);
    if (!m) continue;                       // field ที่ยังไม่ได้ผูกกับอุปกรณ์ไหน — ข้ามเงียบ ๆ
    if (!isPlausible(m, r.value)) {
      dropped += 1;
      droppedBy.set(r.field, (droppedBy.get(r.field) ?? 0) + 1);
      continue;
    }

    if (m.target === "sensor") {
      sensorRows.push({
        at: r.at, barn_id: m.barn_id, device_id: m.device_id, metric: m.metric, value: r.value,
      });
    } else {
      const key = `${m.device_id}|${r.at.getTime()}`;
      const row = powerByKey.get(key) ?? { at: r.at, barn_id: m.barn_id, device_id: m.device_id };
      row[m.metric] = r.value;
      powerByKey.set(key, row);
    }
  }

  const sensor = await insertSensorRows(sensorRows);
  const power = await insertPowerRows(powerByKey);
  return { read: readings.length, sensor, power, dropped, droppedBy };
}

async function tick() {
  /* ★ เฝ้าเครื่องหลักก่อนเสมอ และทำทุกบทบาท (T1.285)
     ตัวนี้ **ไม่แตะฐานข้อมูลเลย** จึงยังทำงานได้ตอนฐานล่ม ซึ่งเป็นตอนที่ต้องการมันที่สุด
     ต้องอยู่บรรทัดแรก เพราะ syncPass() ล้มตั้งแต่ loadMap() เมื่อฐานไม่ตอบ
     ถ้าวางไว้ทีหลัง มันจะไม่ได้ทำงานในสถานการณ์เดียวที่มันมีอยู่เพื่อสิ่งนั้น */
  await runPrimaryWatch();
  /* ★ เฝ้าว่า "ข้อมูลยังไหลอยู่ไหม" (T1.295) — ก่อน syncPass() ด้วยเหตุผลเดียวกัน
     ตัวนี้อ่าน InfluxDB อย่างเดียว ไม่แตะฐาน จึงยังทำงานตอนฐานล่ม
     และต้องทำงานตอน syncPass() ไม่มีอะไรจะซิงก์ ซึ่งคือตอนที่มันมีอยู่เพื่อสิ่งนั้นพอดี */
  await runDataFlowWatch();
  /* ★ สมุดบันทึกสุขภาพกล่อง (T1.308) — ไม่แตะฐาน ไม่แตะเครือข่าย เขียนไฟล์อย่างเดียว
     อยู่ก่อน syncPass() ด้วยเหตุผลเดียวกับสองตัวบน: ต้องเขียนได้แม้ตอนอย่างอื่นล่ม
     เพราะช่วงที่อย่างอื่นล่มคือช่วงที่เราอยากรู้ว่าเครื่องกำลังเจออะไรที่สุด */
  await runBoxRecorder();
  if (doesSync) await syncPass();
  if (doesAlerts) await alertPass();
}

/** อ่าน InfluxDB แล้วเขียนลงฐาน — บทบาท `sync` */
async function syncPass() {
  const map = await loadMap();
  if (map.size === 0) {
    log.warn("sensor_source_map ว่าง — ยังไม่ได้รัน seed จึงยังไม่รู้ว่า field ไหนเป็นของโรงเรือนไหน");
    return;
  }

  /* ═══ ซิงก์ข้อมูลดิบจาก InfluxDB — **ห่อ try ของตัวเองเหมือนอีกสามก้อนล่าง** ═══
     ต่อ Influx ไม่ได้ต้องไม่ทำให้การคิดแจ้งเตือน ส่งไลน์ และเฝ้าระวังหยุดตาม
     เจอจริง 24 ก.ย. 2569 ตอนย้ายมารันที่ box-mew ซึ่งต่อ Influx บนเครื่องผู้พัฒนาไม่ได้
     (tailscaled ที่นั่นเป็น userspace-networking จึงต่อออกไปหา 100.x ไม่ได้)
     ผลคือแจ้งเตือนเงียบสนิททั้งที่ข้อมูลในฐานมีให้คิดอยู่แล้ว
     **เรื่องเดียวกันเกิดบนเครื่องผู้พัฒนาได้ด้วย** ถ้า container ของ Influx ล่ม แล้วไม่มีใครรู้ */
  try {
    const start = await highWaterMark();
    const now = new Date();
    const total = { read: 0, sensor: 0, power: 0, dropped: 0 };
    const droppedBy = new Map();

    for (let from = start; from < now; from = new Date(from.getTime() + WINDOW_MS)) {
      const to = new Date(Math.min(from.getTime() + WINDOW_MS, now.getTime()));
      const r = await syncWindow(map, from, to);
      total.read += r.read;
      total.sensor += r.sensor;
      total.power += r.power;
      total.dropped += r.dropped;
      r.droppedBy?.forEach((n, field) => droppedBy.set(field, (droppedBy.get(field) ?? 0) + n));
    }

    if (total.read > 0) {
      log.info(
        {
          อ่านมา: total.read,
          เขียนเซนเซอร์: total.sensor,
          เขียนมิเตอร์: total.power,
          ทิ้งค่าที่เป็นไปไม่ได้: total.dropped,
          /* เรียงมากไปน้อย — ตัวที่ถูกทิ้งเยอะสุดคือตัวที่ต้องดูก่อน */
          ทิ้งแยกตาม_field: Object.fromEntries(
            [...droppedBy.entries()].sort((a, b) => b[1] - a[1]),
          ),
        },
        "ซิงก์จาก InfluxDB",
      );
    }
  } catch (err) {
    log.error({ err: err.message }, "ซิงก์จาก InfluxDB รอบนี้ล้มเหลว — แจ้งเตือน/ไลน์/เฝ้าระวังยังทำงานปกติ");
  }

}

/** คิดแจ้งเตือน · ส่งไลน์ · เฝ้าระวังช่องทาง — บทบาท `alerts` */
async function alertPass() {
  /* ประเมินแจ้งเตือนทุกรอบ **ไม่ว่ารอบนี้จะมีค่าใหม่หรือไม่** —
     การตรวจ "เซนเซอร์เงียบ" ต้องทำงานตอนที่ไม่มีข้อมูลเข้ามาโดยเฉพาะ
     แยก try ของตัวเอง: เครื่องคิดแจ้งเตือนพังต้องไม่ทำให้การซิงก์ข้อมูลดิบพังตาม */
  try {
    const a = await runAlertPass();
    if (a.opened > 0 || a.resolved > 0) {
      log.info({ เปิดใหม่: a.opened, ปิดอัตโนมัติ: a.resolved, ตรวจ: a.checked }, "ประเมินแจ้งเตือน");
    }
  } catch (err) {
    log.error({ err: err.message }, "ประเมินแจ้งเตือนรอบนี้ล้มเหลว — ข้อมูลดิบยังซิงก์ปกติ");
  }

  /* แจ้งเตือนจากแบบจำลองโรงเรือน (T1.264) — แยก try อีกชั้น: ต่อ Open-Meteo ไม่ได้
     หรือแบบจำลองพัง ต้องไม่ทำให้แจ้งเตือนหลักกับการซิงก์เสียไปด้วย */
  try {
    const tw = await runTwinAlertPass({ log });
    if (!tw.skipped && (tw.opened > 0 || tw.resolved > 0)) {
      log.info({ เปิดใหม่: tw.opened, ปิดอัตโนมัติ: tw.resolved }, "แจ้งเตือนจากแบบจำลอง");
    }
  } catch (err) {
    log.error({ err: err.message }, "แจ้งเตือนจากแบบจำลองรอบนี้ล้มเหลว — แจ้งเตือนหลักยังทำงานปกติ");
  }

  /* ส่งเข้า LINE (T1.275) — ต้องอยู่**หลัง**การประเมินแจ้งเตือนเสมอ ไม่งั้นเหตุที่เพิ่งเปิด
     รอบนี้จะต้องรออีกรอบหนึ่งถึงจะถูกส่ง · ตัวมันเองไม่โยน error ออกมา แต่ห่อ try ไว้อีกชั้น
     ตามแบบเดียวกับสองก้อนบน: ส่งไลน์ไม่ได้ต้องไม่ทำให้รอบซิงก์ล้ม */
  try {
    await runLineNotifier();
  } catch (err) {
    log.error({ err: err.message }, "ส่งเข้า LINE รอบนี้ล้มเหลว — งานอื่นยังทำงานปกติ");
  }

  /* เฝ้าระวังว่าไลน์ยิงเข้ามาหาเราได้ไหม (T1.278) — ตัวมันเองรู้ว่าถึงรอบชั่วโมงหรือยัง
     เรียกทุกรอบซิงก์ก็ไม่เปลืองอะไร เพราะรอบที่ยังไม่ถึงเวลาจะคืนทันทีโดยไม่ยิงเครือข่าย */
  try {
    await runHealthCheck();
  } catch (err) {
    log.error({ err: err.message }, "ตรวจช่องทางไลน์รอบนี้ล้มเหลว — งานอื่นยังทำงานปกติ");
  }
}

async function main() {
  /* ทักทาย InfluxDB ไว้ใน log เพื่อให้รู้ว่าต่อถึงจริง — **แต่ต่อไม่ได้ต้องไม่ตาย**
     เดิมบรรทัดนี้ไม่ได้ห่อ try เลย สะพานจึงจบทันทีที่ Influx ไม่ตอบ และไม่มีใครคิดแจ้งเตือนอีก
     ทั้งที่งานที่เหลือทั้งหมดใช้แค่ฐานข้อมูลของเราเอง (24 ก.ย. 2569 · ย้ายไป box-mew) */
  log.info({ บทบาท: ROLE, ซิงก์Influx: doesSync, คิดแจ้งเตือนและส่งไลน์: doesAlerts }, "สะพานข้อมูลเริ่มทำงาน");

  if (doesSync) {
    try {
      const health = await ping();
      log.info({ influx: health.version }, "ต่อ InfluxDB ได้");
    } catch (err) {
      log.warn({ err: err.message },
        "ต่อ InfluxDB ไม่ได้ — สะพานเดินต่อ (แจ้งเตือน · ส่งไลน์ · เฝ้าระวัง ทำงานปกติ) แล้วลองซิงก์ใหม่ทุกรอบ");
    }
  }

  let running = false;
  const run = async () => {
    if (running) return;                    // รอบก่อนยังไม่จบ (backfill ยาว) — ข้ามรอบนี้ไป
    running = true;
    try {
      await tick();
    } catch (err) {
      log.error({ err: err.message }, "ซิงก์รอบนี้ล้มเหลว — จะลองใหม่รอบหน้า");
    } finally {
      running = false;
    }
  };

  await run();
  const timer = setInterval(run, INTERVAL_MS);

  const stop = async () => {
    clearInterval(timer);
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((err) => {
  log.error({ err: err.message }, "สะพานข้อมูลเริ่มทำงานไม่ได้");
  process.exit(1);
});
