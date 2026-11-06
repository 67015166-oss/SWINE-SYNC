/**
 * แจ้งเตือนจากแบบจำลองโรงเรือน — ปิดวงจรที่แบบจำลองสร้างมาเพื่อ "จับความผิดปกติ" (T1.264)
 *
 * สองเรื่องที่เกณฑ์ธรรมดา (อุณหภูมิเกินเพดาน) จับไม่ได้:
 *
 *   twin_hotter   ในเล้าร้อนกว่าที่แบบจำลองคาดเกินกว่าที่แบบจำลองเคยพลาด ติดกัน 45 นาที
 *                 ยังไม่เกินเพดานก็เตือนได้ — "27.5°C" ดูปกติ แต่ถ้าแบบจำลองคาด 24.5°C
 *                 แปลว่ามีบางอย่างผิด (พัดลมไม่หมุน · ระบบทำความเย็นหยุด · ประตูเปิดค้าง)
 *   sensor_stuck  เซนเซอร์ส่งค่าเดิมเป๊ะมา 3 ชม. — เจอจริงกับเซนเซอร์นอกเล้าที่ค้างมาเป็นสัปดาห์
 *                 โดยไม่มีแจ้งเตือนไหนรู้ตัว เพราะค่ายังเข้ามาเรื่อย ๆ (ไม่ใช่ "เงียบ")
 *
 * เรียกจากสะพานข้อมูลหลังเครื่องคิดแจ้งเตือนหลักทุกรอบ แต่ทำงานจริงทุก 5 นาที
 * (แบบจำลองคิดรายช่อง 15 นาที ถี่กว่านี้ไม่ได้อะไรเพิ่ม)
 * ห้ามเก็บข้อความไทยลงฐาน — เก็บ code + params ให้หน้าจอประกอบเอง (กติกาเดียวกับ engine.js)
 */
import { query } from "../db/pool.js";
import { twinLive, twinBarnIds } from "./barnTwin.js";
import { deviationDecision, isStuck } from "./decide.js";

const EVERY_MS = 5 * 60 * 1000;
const STUCK_WINDOW_HOURS = 3;
let lastRun = 0;

async function openAlert(barnId, { metric, category, level, code, params, value, threshold }) {
  const res = await query(
    `insert into alert (barn_id, category, level, code, params, metric, value, threshold_used)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict do nothing`,
    [barnId, category, level, code, JSON.stringify(params), metric, value, threshold],
  );
  return res.rowCount > 0;
}

/** ปิดอัตโนมัติ — ไม่ลบ ประวัติต้องอยู่ */
async function resolveAlert(barnId, metric) {
  const res = await query(
    `update alert set status = 'resolved', resolved_at = now(), auto_resolved = true
      where barn_id = $1 and metric = $2 and status <> 'resolved'`,
    [barnId, metric],
  );
  return res.rowCount;
}

/* ---------- ร้อนกว่าที่แบบจำลองคาด ---------- */
async function checkDeviation(barnId) {
  const { live } = await twinLive(barnId);
  if (live.status === "nomodel") return { opened: 0, resolved: await resolveAlert(barnId, "twin") };
  /* ข้อมูลไม่สด/เพิ่งกลับมา = ตัดสินไม่ได้ ไม่เปิดและไม่ปิด (เงียบมีแจ้งเตือนของมันเองอยู่แล้ว) */
  if (live.status !== "ok") return { opened: 0, resolved: 0 };

  const d = deviationDecision(live.series, live.thresholds);
  if (d.action === "resolve") return { opened: 0, resolved: await resolveAlert(barnId, "twin") };
  if (d.action !== "open") return { opened: 0, resolved: 0 };

  const params = {
    metric: "temp_c",
    value: live.actual,
    expected: live.expected,
    residual: d.residual,
    threshold: live.thresholds.warn,
  };
  const opened = await openAlert(barnId, {
    metric: "twin",
    category: "temp",
    level: d.level,
    code: "twin_hotter",
    params,
    value: live.actual,
    threshold: live.expected,
  });
  if (!opened && d.level === "serious") {
    /* มีใบเดิมระดับเตือนอยู่แล้ว แต่ตอนนี้หนักขึ้น — ยกระดับใบเดิม ไม่เปิดใบซ้อน */
    await query(
      `update alert set level = 'serious', params = $2, value = $3
        where barn_id = $1 and metric = 'twin' and status <> 'resolved' and level = 'warning'`,
      [barnId, JSON.stringify(params), live.actual],
    );
  }
  return { opened: opened ? 1 : 0, resolved: 0 };
}

/* ---------- เซนเซอร์ค่าค้าง ---------- */
async function checkStuck(barnId) {
  const { rows } = await query(
    `select d.id as device_id, d.code, d.outdoor, r.metric,
            count(*)::int as n, count(distinct r.value)::int as distinct, max(r.value) as value
       from sensor_reading r join device d on d.id = r.device_id
      where r.barn_id = $1 and r.metric in ('temp_c', 'humidity')
        and r.at > now() - make_interval(hours => $2)
      group by d.id, d.code, d.outdoor, r.metric`,
    [barnId, STUCK_WINDOW_HOURS],
  );
  let opened = 0;
  let resolved = 0;
  const stuckKeys = new Set();

  for (const w of rows) {
    const key = `stuck:${w.code}:${w.metric}`;
    if (!isStuck(w)) continue;
    stuckKeys.add(key);
    /* ค้างมานานแค่ไหน — ย้อนหาครั้งล่าสุดที่ค่าไม่เท่านี้ (มองย้อนไม่เกิน 30 วัน) */
    const { rows: since } = await query(
      `select max(at) as at from sensor_reading
        where device_id = $1 and metric = $2 and value <> $3 and at > now() - interval '30 days'`,
      [w.device_id, w.metric, w.value],
    );
    const hours = since[0].at ? (Date.now() - new Date(since[0].at).getTime()) / 3600000 : 30 * 24;
    const ok = await openAlert(barnId, {
      metric: key,
      category: "sensor",
      level: "warning",
      code: "sensor_stuck",
      params: { metric: w.metric, value: w.value, device: w.code, outdoor: w.outdoor, hours: Math.round(hours) },
      value: w.value,
      threshold: null,
    });
    if (ok) opened += 1;
  }

  /* ใบค้างที่เปิดอยู่แต่ตอนนี้ค่ากลับมาเปลี่ยนแล้ว → ปิด */
  const { rows: openStuck } = await query(
    `select metric from alert where barn_id = $1 and code = 'sensor_stuck' and status <> 'resolved'`,
    [barnId],
  );
  for (const a of openStuck) {
    if (!stuckKeys.has(a.metric)) resolved += await resolveAlert(barnId, a.metric);
  }
  return { opened, resolved };
}

/**
 * หนึ่งรอบ — ข้ามถ้ายังไม่ครบ 5 นาทีจากรอบก่อน
 * แต่ละโรงเรือน แต่ละเรื่อง แยก try กัน: แบบจำลองของหลังหนึ่งพังต้องไม่ทำให้เรื่องเซนเซอร์ค้างเงียบไปด้วย
 */
export async function runTwinAlertPass({ now = Date.now(), log } = {}) {
  if (now - lastRun < EVERY_MS) return { skipped: true, opened: 0, resolved: 0 };
  lastRun = now;
  let opened = 0;
  let resolved = 0;
  for (const barnId of await twinBarnIds()) {
    for (const check of [checkStuck, checkDeviation]) {
      try {
        const r = await check(barnId);
        opened += r.opened;
        resolved += r.resolved;
      } catch (err) {
        log?.warn({ err: err.message, barnId, check: check.name }, "ตรวจแจ้งเตือนจากแบบจำลองไม่สำเร็จรอบนี้");
      }
    }
  }
  return { skipped: false, opened, resolved };
}
