/**
 * เครื่องคิดแจ้งเตือน — เทียบค่าล่าสุดของทุกโรงเรือนกับเกณฑ์ใน `alert_rule`
 * แล้วเปิด/ปิดแถวในตาราง `alert` (docs/BACKEND.md ข้อ 7)
 *
 * **ทำไมต้องคิดที่หลังบ้าน ไม่คิดที่หน้าเว็บ**
 *   1. แจ้งเตือนต้องมี "ประวัติ" — เปิดเมื่อไร ใครรับทราบ ปิดตอนไหน
 *      คิดสด ๆ ที่หน้าเว็บจะได้แค่ภาพ ณ วินาทีที่เปิดหน้า รีเฟรชแล้วเริ่มใหม่หมด
 *   2. ต้องดู "ผิดเกณฑ์ต่อเนื่องกี่นาที" ซึ่งต้องอ่านค่าย้อนหลัง ไม่ใช่ค่าล่าสุดค่าเดียว
 *   3. ทุกเครื่องต้องเห็นตรงกัน — สองคนเปิดคนละจอต้องได้แจ้งเตือนชุดเดียวกัน
 *
 * **กติกาที่ห้ามละเมิด: ห้ามเก็บข้อความไทยสำเร็จรูปลงฐาน**
 * เก็บ `code` + `params` แล้วให้หน้าจอประกอบข้อความเองผ่าน `t()`
 * ไม่งั้นสลับภาษาเป็น en/zh แล้วแจ้งเตือนเก่าจะยังเป็นไทยอยู่ทั้งตาราง
 *
 * **ทำงานเมื่อไร**: เรียกจากสะพานข้อมูลทุกรอบหลังซิงก์เสร็จ (ดู bridge/index.js)
 * ผูกกับรอบซิงก์เพราะสองอย่างนี้ต้องเดินคู่กันเสมอ — มีค่าใหม่เข้ามาก็ต้องประเมินใหม่
 * และรอบซิงก์เดินทุก 30 วินาทีไม่ว่าจะมีค่าใหม่หรือไม่ การตรวจ "เซนเซอร์เงียบ" จึงยังทำงาน
 */
import { query } from "../db/pool.js";
import { log } from "../lib/log.js";

/** ไม่มีค่าใหม่เกินเท่านี้ = ถือว่าเซนเซอร์เงียบ (ต้องตรงกับ STALE_MS ฝั่งหน้าเว็บ) */
const SILENT_MINUTES = Number(process.env.ALERT_SILENT_MINUTES || 15);

/** metric ไหนนับเป็นเรื่องอะไร — ใช้เป็นหมวดของแจ้งเตือนบนหน้าจอ */
const CATEGORY = {
  temp_c: "temp",
  humidity: "humidity",
  nh3: "nh3",
  co2: "nh3",
  h2s: "nh3",
};

const categoryOf = (metric) => CATEGORY[metric] ?? "sensor";

/**
 * ค่านี้ผิดเกณฑ์ไหม
 * @returns {{breached: boolean, code: string, threshold: number|null}}
 */
function evaluate(rule, value) {
  const min = rule.threshold_min;
  const max = rule.threshold_max;

  if (rule.comparator === ">") {
    return { breached: value > max, code: `${rule.metric}_high`, threshold: max };
  }
  if (rule.comparator === "<") {
    return { breached: value < min, code: `${rule.metric}_low`, threshold: min };
  }
  /* outside — เกินได้สองทาง ต้องแยก code ให้รู้ว่าสูงไปหรือต่ำไป
     ไม่งั้นหน้าจอเขียนได้แค่ "ผิดเกณฑ์" ซึ่งไม่บอกว่าให้ไปทำอะไร */
  if (value > max) return { breached: true, code: `${rule.metric}_high`, threshold: max };
  if (value < min) return { breached: true, code: `${rule.metric}_low`, threshold: min };
  return { breached: false, code: "", threshold: null };
}

/**
 * ผิดเกณฑ์ต่อเนื่องครบ hold_minutes แล้วหรือยัง
 *
 * เช็กด้วยการ **หาค่าที่ยังอยู่ในเกณฑ์** ในช่วงเวลานั้น ถ้าเจอแม้แต่ค่าเดียวแปลว่ายังไม่ต่อเนื่อง
 * (ถามแบบนี้ถูกกว่าถามว่า "ผิดทุกค่าไหม" เพราะ Postgres หยุดทันทีที่เจอแถวแรก)
 */
async function sustained(rule, barnId) {
  const inside =
    rule.comparator === ">"
      ? `value <= $3`
      : rule.comparator === "<"
        ? `value >= $3`
        : `value between $3 and $4`;

  const params = [barnId, rule.metric];
  if (rule.comparator === "outside") params.push(rule.threshold_min, rule.threshold_max);
  else params.push(rule.comparator === ">" ? rule.threshold_max : rule.threshold_min);

  const { rows } = await query(
    `select 1
     from sensor_reading
     where barn_id = $1 and metric = $2
       and at > now() - interval '${Number(rule.hold_minutes)} minutes'
       and ${inside}
     limit 1`,
    params,
  );
  return rows.length === 0;
}

/**
 * เปิดแจ้งเตือน — ซ้ำไม่ได้เพราะมี unique index (barn_id, metric) where status <> 'resolved'
 * @returns {boolean} เปิดใหม่จริงหรือไม่ (false = มีใบเดิมเปิดค้างอยู่แล้ว)
 */
async function open(barnId, rule, code, value, threshold) {
  const res = await query(
    `insert into alert (barn_id, rule_id, category, level, code, params, metric, value, threshold_used)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict do nothing`,
    [
      barnId,
      rule.id ?? null,
      categoryOf(rule.metric),
      rule.level,
      code,
      /* params = ตัวเลขล้วน หน้าจอเอาไปประกอบข้อความเอง — ห้ามใส่ข้อความไทยที่นี่ */
      JSON.stringify({ value, threshold, metric: rule.metric }),
      rule.metric,
      value,
      threshold,
    ],
  );
  return res.rowCount > 0;
}

/** ปิดแจ้งเตือนอัตโนมัติเมื่อค่ากลับเข้าเกณฑ์ — ไม่ลบทิ้ง ประวัติต้องอยู่ */
async function autoResolve(barnId, metric) {
  const res = await query(
    `update alert
     set status = 'resolved', resolved_at = now(), auto_resolved = true
     where barn_id = $1 and metric = $2 and status <> 'resolved'`,
    [barnId, metric],
  );
  return res.rowCount;
}

/** เกณฑ์ที่ใช้กับโรงเรือนนี้ — เจาะจงกว่าชนะกว้างกว่า (barn > farm > global) */
function rulesFor(rules, barn) {
  const byMetric = new Map();
  for (const r of rules) {
    if (r.scope === "farm" && r.farm_id !== barn.farm_id) continue;
    if (r.scope === "barn" && r.barn_id !== barn.id) continue;
    const rank = { global: 0, farm: 1, barn: 2 }[r.scope];
    const cur = byMetric.get(r.metric);
    if (!cur || rank > cur.rank) byMetric.set(r.metric, { ...r, rank });
  }
  return [...byMetric.values()];
}

/**
 * ประเมินทุกโรงเรือนหนึ่งรอบ
 * @returns {{opened: number, resolved: number, checked: number}}
 */
export async function runAlertPass() {
  const [{ rows: rules }, { rows: barns }, { rows: current }] = await Promise.all([
    query(`select * from alert_rule where enabled`),
    query(`select id, farm_id from barn where active`),
    query(`select barn_id, metric, value, at from v_barn_current where not outdoor`),
  ]);

  if (rules.length === 0) {
    log.warn("alert_rule ว่าง — ยังไม่ได้รัน migrate จึงไม่มีเกณฑ์ให้เทียบ ไม่มีทางเตือนอะไรได้เลย");
    return { opened: 0, resolved: 0, checked: 0 };
  }

  /* ค่าล่าสุดของแต่ละโรงเรือน จัดเป็น map ไว้ก่อน จะได้ไม่ยิง query ต่อโรงเรือนต่อ metric */
  const latest = new Map();
  for (const c of current) {
    if (!latest.has(c.barn_id)) latest.set(c.barn_id, new Map());
    latest.get(c.barn_id).set(c.metric, c);
  }

  let opened = 0;
  let resolved = 0;
  let checked = 0;

  for (const barn of barns) {
    const readings = latest.get(barn.id) ?? new Map();

    /* ---------- เซนเซอร์เงียบ ----------
       ต้องมาก่อนเกณฑ์อื่น เพราะถ้าไม่มีค่าใหม่ ค่าที่ค้างอยู่ก็ไม่ได้แปลว่าตอนนี้เป็นแบบนั้น
       "ไม่มีค่า" ไม่เท่ากับ "ทุกอย่างปกติ" — เงียบไปเฉย ๆ อันตรายกว่าค่าเกินเสียอีก */
    const newest = [...readings.values()].reduce(
      (max, r) => (!max || r.at > max ? r.at : max),
      null,
    );
    const silentFor = newest ? (Date.now() - new Date(newest).getTime()) / 60000 : Infinity;

    if (readings.size > 0 && silentFor > SILENT_MINUTES) {
      const fake = { id: null, metric: "sensor", level: "serious", hold_minutes: 0 };
      if (await open(barn.id, fake, "sensor_silent", null, null)) opened += 1;
      /* เงียบอยู่ก็ไม่ต้องเทียบเกณฑ์ต่อ — ค่าที่ค้างอยู่เป็นของเมื่อกี้ ไม่ใช่ของตอนนี้ */
      continue;
    }
    resolved += await autoResolve(barn.id, "sensor");

    for (const rule of rulesFor(rules, barn)) {
      const reading = readings.get(rule.metric);
      if (!reading || reading.value == null) continue;
      checked += 1;

      const { breached, code, threshold } = evaluate(rule, reading.value);

      if (!breached) {
        resolved += await autoResolve(barn.id, rule.metric);
        continue;
      }
      /* ผิดเกณฑ์แต่ยังไม่ครบเวลา — ยังไม่เตือน และยังไม่ปิดใบเดิมด้วย
         (ค่าแกว่งกลับเข้ามาชั่ววูบไม่ควรทำให้แจ้งเตือนที่เปิดค้างอยู่หายไป) */
      if (!(await sustained(rule, barn.id))) continue;

      if (await open(barn.id, rule, code, reading.value, threshold)) opened += 1;
    }
  }

  return { opened, resolved, checked };
}
