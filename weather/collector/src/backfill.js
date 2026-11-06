/**
 * เติมข้อมูลย้อนหลัง — งานที่ทำครั้งเดียวตอนตั้งระบบ (แต่รันซ้ำได้ ไม่พัง)
 *
 * ตัวเก็บข้อมูลหลักเริ่มนับหนึ่งจากวันที่เปิดใช้ ส่วนข้อมูลก่อนหน้านั้นต้องหามาใส่เอง
 * ซึ่งสำคัญมากสำหรับงานพยากรณ์อากาศ เพราะโมเดลต้องเห็นรอบวันและรอบฤดูกาลหลาย ๆ รอบ
 * ถึงจะแยกออกว่า "ร้อนเพราะบ่ายสองแล้ว" กับ "ร้อนเพราะอากาศเปลี่ยน" ต่างกันยังไง
 *
 * ═══ วิธีใช้ ═══
 *   node src/backfill.js archive [จำนวนวัน]     ← อากาศภายนอกย้อนหลัง (ทำได้เลย)
 *   node src/backfill.js swine-db               ← ค่าเซนเซอร์จากฐานของแดชบอร์ด
 *   node src/backfill.js csv <ไฟล์...>          ← ค่าเซนเซอร์จาก CSV ที่โหลดจากเว็บพี่เลี้ยง
 *   node src/backfill.js all                    ← archive + swine-db
 */
import { readFile } from "node:fs/promises";
import pg from "pg";
import { config } from "./config.js";
import { pool, insertObs, logCollect, query } from "./db.js";
import { fetchArchive } from "./sources/openmeteo.js";
/* ★ ใช้ตัวแปลงตัวเดียวกับรอบเก็บสด — เคยเขียนไว้สองที่ ถ้าวันหนึ่งแก้ที่เดียว
   ของเก่ากับของใหม่จะลงคนละชื่อ/คนละสถานี แล้วไม่มีอะไรฟ้องจนกว่าจะพล็อตกราฟออกมาดู */
import { mapSensorRows, mapPowerRows } from "./sources/swine.js";

const log = (...a) => console.log(...a);
const ymd = (d) => new Date(d).toISOString().slice(0, 10);

/* ═══════════════════════════════════════════════════════════════════
   ทางที่ 1 — อากาศภายนอกย้อนหลังจากคลัง ERA5 ของ Open-Meteo
   ═══════════════════════════════════════════════════════════════════ */
async function backfillArchive(days = 400) {
  const end = new Date(Date.now() - 5 * 86400_000); // คลัง ERA5 ตามหลังปัจจุบันราว 5 วัน
  const start = new Date(end.getTime() - days * 86400_000);
  log(`\n▸ อากาศภายนอกย้อนหลัง ${days} วัน (${ymd(start)} ถึง ${ymd(end)})`);

  /* ยิงทีละ 60 วัน — ขอทีเดียวเป็นปีบริการจะตอบก้อนใหญ่มากและเสี่ยง timeout
     ถ้าล้มกลางทางก็เสียแค่ก้อนเดียว รันซ้ำแล้วเก็บต่อจากเดิมได้ */
  const STEP_DAYS = 60;
  let total = 0;

  for (let t = start.getTime(); t < end.getTime(); t += STEP_DAYS * 86400_000) {
    const a = new Date(t);
    const b = new Date(Math.min(t + (STEP_DAYS - 1) * 86400_000, end.getTime()));
    try {
      const rows = await fetchArchive(ymd(a), ymd(b));
      const written = await insertObs(rows, "openmeteo_archive");
      total += written;
      log(`  ${ymd(a)} – ${ymd(b)}  ดึงมา ${rows.length} · เก็บใหม่ ${written}`);
    } catch (err) {
      log(`  ${ymd(a)} – ${ymd(b)}  ล้ม: ${err.message}`);
    }
    /* เว้นจังหวะให้บริการฟรีของเขาหายใจ — ไม่ได้บังคับ แต่เป็นมารยาทและกันโดนจำกัด */
    await new Promise((r) => setTimeout(r, 800));
  }

  await logCollect("openmeteo_archive", true, total, `backfill ${days} วัน`);
  log(`▸ รวมเก็บใหม่ ${total} ค่า`);
  return total;
}

/* ═══════════════════════════════════════════════════════════════════
   ทางที่ 2 — ค่าเซนเซอร์จากฐานของแดชบอร์ด (swine-db)

   ฐานนั้นเก็บ **ค่าดิบเต็มความละเอียด** ที่สะพานข้อมูลดูดจาก InfluxDB มาตั้งแต่
   ก.ค. 2569 ซึ่งเป็นของที่ API ของพี่เลี้ยงให้ไม่ได้ (`/series` บีบเหลือ 120 จุด)
   จึงเป็นแหล่ง backfill ที่ดีที่สุดที่มีอยู่ และไม่ต้องขอใครด้วย
   ═══════════════════════════════════════════════════════════════════ */

async function backfillSwineDb() {
  if (!config.swineDbUrl) {
    log("\n▸ ข้ามการดึงจากฐานแดชบอร์ด — ไม่ได้ตั้ง SWINE_DB_URL");
    return 0;
  }
  log("\n▸ ค่าเซนเซอร์จากฐานของแดชบอร์ด (swine-db)");

  const src = new pg.Pool({ connectionString: config.swineDbUrl, max: 3 });
  let total = 0;

  try {
    /* ─── ค่าเซนเซอร์ ─── */
    const { rows: span } = await src.query(
      `select min(at) as a, max(at) as b, count(*)::bigint as n from sensor_reading`,
    );
    log(`  พบค่าเซนเซอร์ ${span[0].n} แถว (${ymd(span[0].a)} ถึง ${ymd(span[0].b)})`);

    /* ยิงทีละ 7 วัน — ดึงทีเดียวสองแสนแถวจะกินหน่วยความจำของทั้งสองฝั่ง */
    const STEP = 7 * 86400_000;
    for (let t = new Date(span[0].a).getTime(); t <= new Date(span[0].b).getTime(); t += STEP) {
      const a = new Date(t);
      const b = new Date(t + STEP);
      const { rows } = await src.query(
        `select r.at, r.metric, r.value, d.outdoor
           from sensor_reading r
           join device d on d.id = r.device_id
          where r.at >= $1 and r.at < $2`,
        [a.toISOString(), b.toISOString()],
      );
      const mapped = mapSensorRows(rows);
      const written = await insertObs(mapped, "swine_db");
      total += written;
      if (rows.length) log(`  ${ymd(a)}  อ่าน ${rows.length} · เก็บใหม่ ${written}`);
    }

    /* ─── ค่าไฟฟ้า (อยู่คนละตาราง เพราะโครงสร้างต่างกัน) ───
       เก็บกระแสเป็น "ค่าเฉลี่ยต่อเฟส" ไม่ใช่ผลรวมสามเฟส
       กระแสสามเฟสต่างเฟสกัน 120° บวกเลขตรง ๆ ไม่มีความหมายทางไฟฟ้า
       (กติกาเดียวกับที่แดชบอร์ดใช้ใน lib/api/plotnexusFarms.js) */
    const { rows: pw } = await src.query(
      `select at, voltage, current_a, current_b, current_c, frequency, power_kw, kwh_total
         from power_reading order by at`,
    );
    const pwRows = mapPowerRows(pw);
    const pwWritten = await insertObs(pwRows, "swine_db");
    total += pwWritten;
    log(`  ค่าไฟฟ้า ${pw.length} แถว · เก็บใหม่ ${pwWritten} ค่า`);

    await logCollect("swine_db", true, total, "backfill จากฐานแดชบอร์ด");
  } catch (err) {
    log(`  ล้ม: ${err.message}`);
    await logCollect("swine_db", false, 0, err.message).catch(() => {});
  } finally {
    await src.end().catch(() => {});
  }

  log(`▸ รวมเก็บใหม่ ${total} ค่า`);
  return total;
}

/* ═══════════════════════════════════════════════════════════════════
   ทางที่ 3 — CSV ที่โหลดมาจากเว็บของพี่เลี้ยง

   เว็บมีปุ่ม "โหลดเป็นไฟล์ CSV" ที่เลือกช่วงเวลาได้ถึง 200,000 แถว และได้ของดิบ
   จริง ๆ (ต่างจาก API ที่บีบเหลือ 120 จุด) แต่ต้องล็อกอินโหลดเอง

   **ตัวอ่านนี้เขียนแบบเดาหัวคอลัมน์ให้** เพราะยังไม่เคยเห็นไฟล์จริง
   ถ้าอ่านไม่ออกจะพิมพ์หัวคอลัมน์ที่เจอออกมาให้ดู แล้วหยุด — ไม่เดาส่งเดชแล้ว
   เก็บของผิดลงฐาน เพราะข้อมูลผิดที่ปนเข้าไปแล้วหายากกว่าข้อมูลที่ไม่มีเลย
   ═══════════════════════════════════════════════════════════════════ */

/**
 * ชื่อหัวคอลัมน์ที่ยอมรับ → บทบาทของมัน (เผื่อทั้งไทยและอังกฤษ)
 *
 * ไฟล์จริงจากเว็บพี่เลี้ยง (ตาราง data_Min_Max_Mean_Avg_*) หัวคอลัมน์เป็นแบบนี้
 *   time,avg,count,farm,location,max,mean,measure,min,role,sensor_id,…,timestamp_th,zone
 *
 * **ไม่มีคอลัมน์ชื่อ `value`** — ค่าอยู่ในคอลัมน์ `mean` (และ `avg` ที่เท่ากัน)
 *
 * === กับดักที่เคยพลาดมาแล้ว: ตารางสรุปกับตารางดิบหน้าตาเหมือนกัน ===
 * เว็บพี่เลี้ยงมี 12 ตารางต่อชุดข้อมูล ทั้ง `data_realtime_raw` และ
 * `data_Min_Max_Mean_Avg_3hr` · `_6hrs` · `_12hrs` · `_24hrs` · `_7day` · `_1monuth`
 * ไฟล์ที่ export ออกมา **หัวคอลัมน์เหมือนกันทุกตาราง** แยกด้วยตาไม่ออก
 *
 * ตอนแรกเข้าใจว่า `12hrs` แปลว่า "ออกไฟล์ทุก 12 ชั่วโมง" -- ผิด
 * มันคือ **ค่าเฉลี่ยย้อนหลัง 12 ชั่วโมง เลื่อนทีละ 5 นาที** (count=144 = 144x5 นาที)
 * นำเข้าไปแล้วได้เส้นที่ถูกเกลี่ยแบนและเลื่อนไป ~5 ชั่วโมง:
 *   เซนเซอร์ตัวเดียวกัน ของดิบขึ้นสูงสุดบ่ายโมง แกว่ง 3.6 องศา
 *                       ของ 12hrs ขึ้นสูงสุด 2 ทุ่ม แกว่ง 0.7 องศา
 * เซนเซอร์แสงฟ้องชัดที่สุด -- ของ 12hrs อ่านได้ 505 lux ตอน 3 ทุ่ม
 *
 * โมเดลที่เทรนบนข้อมูลแบบนั้นจะได้คะแนนสวยเกินจริง เพราะเส้นเรียบทำนายง่าย
 * `assertNotRolling()` ข้างล่างจึงหยุดให้ตั้งแต่ปากทาง อย่าถอดออก
 *
 * **ใช้ `time` ไม่ใช่ `timestamp_th`** — `time` เป็น UTC และมี Z ต่อท้ายชัดเจน
 * ส่วน `timestamp_th` เป็นเวลาไทยที่ไม่มีเขตเวลาติดมา ถ้าหยิบตัวนั้นจะเหลื่อม 7 ชั่วโมง
 * โดยไม่มีอะไรฟ้อง และไปปนกับข้อมูลที่เก็บสดซึ่งเป็น UTC อยู่แล้ว
 */
const CSV_ROLE = {
  time: "at", _time: "at", timestamp: "at", datetime: "at", date: "at",
  เวลา: "at", วันเวลา: "at",
  location: "station", place: "station", จุดติดตั้ง: "station", ชื่อจุด: "station",
  measure: "measure", field: "measure", metric: "measure",
  วัด: "measure", วัดอะไร: "measure", ค่าที่วัด: "measure",
  value: "value", _value: "value", ค่า: "value", ค่าที่วัดได้: "value",
  /* ตาราง data_realtime_raw ใช้ชื่อนี้ และ **ไม่มีคอลัมน์ count/mean/min/max เลย**
     ซึ่งเป็นวิธีแยกไฟล์ดิบออกจากไฟล์สรุปได้เร็วที่สุดเวลาเปิดดูด้วยตา
     (ชื่อลงท้าย _text เพราะต้นทางเก็บเป็นข้อความ แต่ค่าข้างในเป็นตัวเลขปกติ) */
  value_text: "value",
  /* ต้องอยู่ท้ายสุด — ถ้าไฟล์ไหนมีคอลัมน์ `value` จริง ๆ ด้วย ให้ตัวนั้นชนะ
     (ตัวอ่านหยิบคอลัมน์แรกที่เจอของแต่ละบทบาท) */
  mean: "value", avg: "value",
  role: "role",
};

/**
 * หยุดไฟล์ที่มาจาก "ตารางสรุป" ไม่ให้เข้าคลัง
 *
 * ตัวชี้ขาดคือคอลัมน์ `count` -- จำนวนตัวอย่างที่ถูกยุบมาเป็นหนึ่งแถว
 *   ตารางดิบ      count = 1 (หรือไม่มีคอลัมน์นี้เลย)
 *   ตารางสรุป     count = 36 · 72 · 144 ... คงที่ทั้งไฟล์
 *
 * ดูค่ากลางแทนค่าเฉลี่ย เพราะไฟล์มีแถว meta ปนอยู่ไม่กี่แถว
 * ที่ count ต่างจากพวก แล้วค่าเฉลี่ยจะถูกดึงจนตัดสินผิด
 */
function assertNotRolling(header, lines, splitLine) {
  const ci = header.findIndex((h) => h.toLowerCase() === "count");
  if (ci < 0) return null;

  const counts = [];
  for (let i = 1; i < lines.length && counts.length < 400; i += 37) {
    const n = Number(splitLine(lines[i])[ci]);
    if (Number.isFinite(n) && n > 0) counts.push(n);
  }
  if (!counts.length) return null;

  counts.sort((a, b) => a - b);
  const mid = counts[Math.floor(counts.length / 2)];
  if (mid <= 3) return null;

  /* แถวห่างกัน 5 นาทีตามที่เว็บ export ออกมา -- คูณกลับได้ความกว้างของหน้าต่าง */
  return { mid, hours: Math.round((mid * 5) / 60) };
}

function splitCsvLine(line) {
  /* ตัวแยกแบบรองรับเครื่องหมายคำพูด — ชื่อจุดติดตั้งภาษาไทยอาจมีจุลภาคปนมาได้ */
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (c === "," && !quoted) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

async function backfillCsv(files, force = false) {
  const { STATION_OF, MEASURE_OF } = await import("./sources/plotnexus.js");
  let total = 0;

  for (const file of files) {
    log(`\n▸ อ่าน ${file}`);
    const text = await readFile(file, "utf8");
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { log("  ไฟล์ว่าง ข้าม"); continue; }

    /* ตัด BOM หน้าไฟล์ทิ้งก่อน — ไฟล์ที่ Excel/เว็บสร้างมักมี U+FEFF นำหน้า
       ถ้าไม่ตัด หัวคอลัมน์แรกจะกลายเป็น "\ufefftime" แล้วจับคู่ไม่ติด
       (เจอจริงกับไฟล์ที่โหลดจากเว็บพี่เลี้ยง) */
    const header = splitCsvLine(lines[0].replace(/^\uFEFF/, ""));

    /* === ตารางสรุปห้ามเข้า -- เหตุผลเต็มอยู่ที่หัวหัวข้อ CSV_ROLE === */
    const rolling = assertNotRolling(header, lines, splitCsvLine);
    if (rolling && !force) {
      log("  x ไฟล์นี้มาจากตารางสรุป ไม่ใช่ตารางดิบ -- ไม่นำเข้า");
      log(`    คอลัมน์ count มีค่ากลาง ${rolling.mid} = ค่าเฉลี่ยย้อนหลังราว ${rolling.hours} ชั่วโมง`);
      log("    ค่าที่ได้จะถูกเกลี่ยแบนและเลื่อนเวลาไปราวครึ่งหนึ่งของหน้าต่างนั้น");
      log("    ให้ export ใหม่โดยเลือกตาราง data_realtime_raw");
      log("    (ถ้าตั้งใจจะเอาจริง ๆ ให้ใส่ --force ต่อท้ายคำสั่ง)");
      continue;
    }
    if (rolling) log(`  ! ตารางสรุป ~${rolling.hours} ชม. -- นำเข้าเพราะสั่ง --force`);

    const role = header.map((h) => CSV_ROLE[h.toLowerCase()] ?? CSV_ROLE[h] ?? null);
    const idx = {};
    role.forEach((r, i) => { if (r && idx[r] === undefined) idx[r] = i; });

    if (idx.at === undefined || idx.value === undefined || idx.measure === undefined) {
      log("  ✗ อ่านหัวคอลัมน์ไม่ออก — ไม่เดาต่อ");
      log(`    หัวคอลัมน์ที่เจอ: ${header.join(" | ")}`);
      log("    ต้องมีอย่างน้อย: เวลา · ค่าที่วัด · ค่า");
      log("    ถ้าไฟล์ใช้ชื่ออื่น ให้เพิ่มชื่อนั้นลงใน CSV_ROLE ที่หัวหัวข้อนี้");
      continue;
    }

    const rows = [];
    const unknownStations = new Set();
    let skippedRole = 0;
    for (let i = 1; i < lines.length; i++) {
      const c = splitCsvLine(lines[i]);

      /* ═══ เก็บเฉพาะเซนเซอร์ตัวหลัก ═══
         ไฟล์มีคอลัมน์ `role` แยกเป็น primary · extra · meta
         `extra` คือเซนเซอร์สำรองที่วัดค่าเดียวกันแล้วส่งตามมาอีกไม่กี่วินาที
         ถ้าเก็บทั้งคู่จะได้ค่าซ้ำสองชุดที่เวลาต่างกันนิดเดียว ซึ่งไม่ผิดชัด ๆ
         แต่ทำให้ "จำนวนค่าต่อชั่วโมง" ดูเยอะเกินจริงเป็นเท่าตัว
         ส่วน `meta` เป็นค่าสถานะของอุปกรณ์ (active_slave) ไม่ใช่ค่าที่วัดได้ */
      if (idx.role !== undefined && c[idx.role] && c[idx.role] !== "primary") {
        skippedRole++;
        continue;
      }

      const rawStation = idx.station !== undefined ? c[idx.station] : "barn_R";
      const station = STATION_OF[rawStation] ?? null;
      if (!station) { unknownStations.add(rawStation); continue; }

      const rawMeasure = c[idx.measure];
      const measure = MEASURE_OF[rawMeasure] ?? `raw_${rawMeasure}`;
      const value = Number(c[idx.value]);
      /* เวลาในไฟล์เป็น ISO ที่มีเศษวินาทีถึงระดับนาโน (…10.565339136Z)
         ให้ Date แปลงให้เหลือมิลลิวินาทีก่อน Postgres จะได้ไม่ต้องเดา */
      const t = new Date(c[idx.at]);
      if (Number.isNaN(t.getTime()) || !Number.isFinite(value)) continue;

      rows.push({ at: t.toISOString(), station, measure, value });
    }

    const written = await insertObs(rows, "csv");
    total += written;
    log(`  อ่านได้ ${rows.length} แถว · เก็บใหม่ ${written}`);
    if (skippedRole) log(`  ข้ามเซนเซอร์สำรอง/ค่าสถานะ ${skippedRole} แถว (role ไม่ใช่ primary)`);
    if (unknownStations.size) {
      log(`  จุดติดตั้งที่ยังไม่รู้จัก (ข้ามไป): ${[...unknownStations].join(", ")}`);
      log("    ถ้าต้องการเก็บด้วย ให้เพิ่มลง STATION_OF ใน src/sources/plotnexus.js");
    }
  }

  await logCollect("csv", true, total, `นำเข้า ${files.length} ไฟล์`);
  log(`▸ รวมเก็บใหม่ ${total} ค่า`);
  return total;
}

/* ═══════════════════════════════════════════════════════════════════ */

async function summary() {
  const { rows } = await query(`
    select s.name as สถานี, count(*)::int as จำนวนค่า,
           min(o.at) as ตั้งแต่, max(o.at) as ถึง
      from obs o join station s on s.id = o.station
     group by s.name order by 2 desc
  `);
  log("\n═══ สรุปคลังข้อมูลตอนนี้ ═══");
  for (const r of rows) {
    log(`  ${r["สถานี"]}`);
    log(`    ${r["จำนวนค่า"].toLocaleString("th-TH")} ค่า · ${ymd(r["ตั้งแต่"])} ถึง ${ymd(r["ถึง"])}`);
  }
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);

  switch (mode) {
    case "archive":
      await backfillArchive(Number(args[0]) || 400);
      break;
    case "swine-db":
      await backfillSwineDb();
      break;
    case "csv": {
      /* --force = ยอมรับไฟล์จากตารางสรุปทั้งที่รู้ว่าข้อมูลถูกเกลี่ยแล้ว
         ปกติไม่ควรใช้ ดูเหตุผลที่หัวหัวข้อ CSV_ROLE */
      const force = args.includes("--force");
      const files = args.filter((a) => a !== "--force");
      if (files.length === 0) { log("ต้องบอกชื่อไฟล์ CSV อย่างน้อยหนึ่งไฟล์"); process.exit(1); }
      await backfillCsv(files, force);
      break;
    }
    case "all":
      await backfillSwineDb();
      await backfillArchive(Number(args[0]) || 400);
      break;
    default:
      log("วิธีใช้:");
      log("  node src/backfill.js archive [จำนวนวัน]   อากาศภายนอกย้อนหลัง");
      log("  node src/backfill.js swine-db             ค่าเซนเซอร์จากฐานแดชบอร์ด");
      log("  node src/backfill.js csv <ไฟล์...>        ค่าเซนเซอร์จาก CSV ของพี่เลี้ยง");
      log("      ต้องเป็น export จากตาราง data_realtime_raw เท่านั้น");
      log("      ตารางสรุป (…_12hrs ฯลฯ) จะถูกปฏิเสธ เว้นแต่ใส่ --force");
      log("  node src/backfill.js all [จำนวนวัน]       swine-db แล้วตามด้วย archive");
      process.exit(1);
  }

  await summary();
  await pool.end();
}

main().catch(async (err) => {
  console.error("backfill ล้ม:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
