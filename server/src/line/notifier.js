/**
 * ตัวส่งข้อความเข้า LINE — เดินพร้อมรอบซิงก์ของสะพานข้อมูล (T1.275)
 *
 * ทำสองอย่าง
 *   1. **เหตุแจ้งเตือน** ส่งทันทีที่เปิดใบใหม่ (รวบหลายใบไว้ในข้อความเดียว)
 *   2. **สรุปประจำวัน** ส่งวันละครั้งตามเวลาที่ตั้งใน `LINE_DAILY_AT`
 *
 * **กติกาที่ตั้งไว้เพื่อไม่ให้โควตาหมดและไม่ให้คนเลิกอ่าน**
 *   · ส่งทุกระดับที่ขึ้นบนแดชบอร์ด (ปรับได้ที่ `LINE_ALERT_LEVELS`)
 *     — เดิมตั้งไว้ "เฉพาะวิกฤต" (21 ก.ย.) แต่ของจริงไม่เคยมีเหตุวิกฤตเลยสักครั้ง จึงไม่เคยส่งอะไรออกไป
 *   · **เรื่องเดิมเตือนซ้ำได้ทุก `LINE_ALERT_COOLDOWN_HOURS` ชั่วโมง** (ค่าตั้งต้น 12)
 *     จำเป็นเพราะ `sensor_silent` เกิด 36 ครั้งใน 7 วัน (ทุกครั้งที่เครื่องหลับ)
 *     **ยกเว้นระดับวิกฤตที่ผ่านตลอด** — เรื่องด่วนต้องถึงมือแม้เพิ่งเตือนเรื่องเดียวกันไป
 *   · หลายเหตุในรอบเดียวกันรวมเป็นข้อความเดียว จึงไม่ได้กินโควตาตามจำนวนเหตุ
 *   · เหตุที่เปิดค้างมาเกิน 1 ชั่วโมงไม่ส่งย้อนหลัง (คอนเทนเนอร์เพิ่งขึ้นไม่ควรยิงของเมื่อวาน)
 *   · เพดานจำนวนครั้งต่อวัน (`LINE_MAX_PER_DAY`) เป็นตาข่ายกันบัค ไม่ใช่ค่าปกติที่ควรชน
 *   · ทุกครั้งที่ส่งจะถูกบันทึกลง `line_notice` ซึ่งเป็นตัวกันส่งซ้ำด้วย
 */
import { query } from "../db/pool.js";
import { log } from "../lib/log.js";
import { lineDryRun, sendLine } from "./client.js";
import { alertFlex, dailyFlex } from "./flex.js";
import { alertsToSend, bangkokDateKey, canSendMore, levelsFromEnv, parseTimeOfDay, shouldCooldown, shouldSendDaily, withinCooldown } from "./schedule.js";
import { buildSummary, yesterdayRange } from "./summary.js";
import { activityMessage } from "../activity/kinds.js";
import { ACTIVITY_EVERY_MIN, lineKinds } from "../activity/settings.js";

const DEFAULT_DAILY_AT = 7 * 60 + 30; // 07:30 น.

export const lineEnabled = () => (process.env.LINE_NOTIFY ?? "1") !== "0";

const dashboardUrl = () => (process.env.DASHBOARD_URL || "").trim() || null;
const maxPerDay = () => Number(process.env.LINE_MAX_PER_DAY || 20);

/** จำนวนครั้งที่ส่งไปแล้วในวันนี้ (เวลาไทย) — นับทั้งที่สำเร็จและที่พลาด */
async function sentToday() {
  const { rows } = await query(
    `select count(*)::int as n from line_notice
      where sent_at >= date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'`,
  );
  return rows[0]?.n ?? 0;
}

/**
 * บันทึกผลการส่ง — คืน false ถ้าแถวซ้ำ (มีคนอื่นส่งไปก่อนแล้ว)
 * ใช้ `on conflict do nothing` ให้ฐานเป็นคนตัดสิน ไม่ใช่เช็กก่อนแล้วค่อยเขียน (แข่งกันได้)
 */
async function record(kind, ref, result) {
  const { rowCount } = await query(
    `insert into line_notice (kind, ref, dry, ok, error) values ($1, $2, $3, $4, $5)
      on conflict do nothing`,
    [kind, ref, result.dry, result.sent || result.dry, result.error],
  );
  return rowCount > 0;
}

/** เหตุที่ยังไม่ปิด พร้อมชื่อฟาร์ม/โรงเรือนสำหรับใส่ในการ์ด */
async function openAlerts() {
  const { rows } = await query(
    `select a.id, a.barn_id, a.level, a.code, a.params, a.metric, a.value, a.threshold_used, a.opened_at,
            b.name as "barnName", f.name as "farmName"
       from alert a
       join barn b on b.id = a.barn_id
       join farm f on f.id = b.farm_id
      where a.status <> 'resolved'
      order by a.opened_at desc
      limit 50`,
  );
  return rows;
}

async function notifiedAlertIds(ids) {
  if (ids.length === 0) return new Set();
  const { rows } = await query(
    `select ref from line_notice where kind = 'alert' and ref = any($1::text[])`,
    [ids],
  );
  return new Set(rows.map((r) => r.ref));
}

/**
 * เตือนเรื่องเดียวกัน (โรงเรือน + รหัสเหตุ) ไปเมื่อไรล่าสุด
 * ผูกกับตาราง alert ผ่าน `line_notice.ref` ที่เก็บ id ของเหตุไว้
 */
async function lastSentByKey(alerts) {
  if (alerts.length === 0) return new Map();
  const { rows } = await query(
    `select a.barn_id, a.code, max(n.sent_at) as last_sent
       from line_notice n
       join alert a on a.id::text = n.ref
      where n.kind = 'alert' and n.ok
      group by a.barn_id, a.code`,
  );
  return new Map(rows.map((r) => [`${r.barn_id}|${r.code}`, r.last_sent]));
}

/** ส่งเหตุที่ยังไม่เคยส่ง */
async function passAlerts(now, budget) {
  const alerts = await openAlerts();
  if (alerts.length === 0) return 0;

  const already = await notifiedAlertIds(alerts.map((a) => a.id));
  const levels = levelsFromEnv(process.env.LINE_ALERT_LEVELS);
  const candidates = alertsToSend(alerts, already, now, Number(process.env.LINE_ALERT_MAX_AGE_MIN || 60), levels);

  /* กันเหตุที่เกิดซ้ำ ๆ (เช่นเซนเซอร์เงียบตอนเครื่องหลับ) ไม่ให้เตือนรัว */
  const cooldownHours = Number(process.env.LINE_ALERT_COOLDOWN_HOURS || 12);
  const lastByKey = await lastSentByKey(candidates);
  const due = candidates.filter(
    (a) => !shouldCooldown(a) || !withinCooldown(lastByKey.get(`${a.barn_id}|${a.code}`), now, cooldownHours),
  );
  if (due.length === 0) return 0;
  if (!canSendMore(budget.used, budget.max)) {
    log.warn({ เพดานต่อวัน: budget.max }, "ชนเพดานจำนวนข้อความ LINE ของวันนี้ — ไม่ส่งเหตุแจ้งเตือน");
    return 0;
  }

  const result = await sendLine(alertFlex(due, dashboardUrl()));
  budget.used += 1;

  if (result.error) {
    /* ส่งพลาด — บันทึกไว้แบบไม่มีกุญแจ เพื่อให้รอบหน้าลองใหม่ได้ แต่ยังนับเข้าเพดานวันนี้ */
    await record("error", null, result);
    return 0;
  }
  for (const a of due) await record("alert", a.id, result);
  return due.length;
}

/** ส่งสรุปประจำวันถ้าถึงเวลาและยังไม่ได้ส่งของวันนี้ */
async function passDaily(now, budget) {
  const { rows } = await query(
    `select max(ref) as last from line_notice where kind = 'daily' and ok`,
  );
  const sendAt = parseTimeOfDay(process.env.LINE_DAILY_AT) ?? DEFAULT_DAILY_AT;
  if (!shouldSendDaily({ now, sendAtMinutes: sendAt, lastSentDateKey: rows[0]?.last ?? null })) return false;
  if (!canSendMore(budget.used, budget.max)) return false;

  const { from, to } = yesterdayRange(now);
  const summary = await buildSummary(from, to);
  const result = await sendLine(dailyFlex(summary, dashboardUrl()));
  budget.used += 1;

  if (result.error) {
    await record("error", null, result);
    return false;
  }
  /* กุญแจเป็น "วันนี้" (วันที่ส่ง) ไม่ใช่วันของข้อมูล — กันส่งซ้ำวันละครั้งตามที่ตั้งใจ */
  return record("daily", bangkokDateKey(now), result);
}

/**
 * ★★ กิจกรรมของคน (T1.359) — "ใครไปแก้อะไร" ส่งรวบเป็นใบเดียว
 *
 * ต่างจากเหตุแจ้งเตือนตรงที่ **ไม่ใช่เรื่องด่วน** จึงไม่ต้องถึงมือทันที
 * แต่เกิดถี่กว่ามาก (วันที่มีคนจัดฟาร์มอาจมีหลายสิบรายการ)
 * กติกาจึงกลับกัน: รวบรอให้ครบช่วงแล้วส่งทีเดียว ไม่ใช่เห็นปุ๊บส่งปั๊บ
 *
 *   · เว้นอย่างน้อย `ACTIVITY_EVERY_MIN` นาทีระหว่างใบ
 *   · ส่งเฉพาะหมวดที่ตั้งไว้ (`system_setting.activityLineKinds`)
 *   · `line_notice.ref` เก็บ **id สูงสุดที่ส่งไปแล้ว** รอบหน้าจึงเริ่มต่อจากตรงนั้นพอดี
 *     — ใช้ id ไม่ใช่เวลา เพราะนาฬิกาเครื่องกับนาฬิกาฐานอาจไม่ตรงกัน
 */
async function passActivity(now, budget) {
  const kinds = await lineKinds();
  if (kinds.length === 0) return 0;

  const { rows: last } = await query(
    `select ref, sent_at from line_notice
      where kind = 'activity' and ok order by sent_at desc limit 1`,
  );
  const since = Number(last[0]?.ref ?? 0) || 0;
  if (last[0]?.sent_at) {
    const minsAgo = (now.getTime() - new Date(last[0].sent_at).getTime()) / 60000;
    if (minsAgo < ACTIVITY_EVERY_MIN) return 0;
  }

  const { rows } = await query(
    `select id, summary from activity
      where id > $1 and kind = any($2::text[])
      order by id asc limit 200`,
    [since, kinds],
  );
  if (rows.length === 0) return 0;
  if (!canSendMore(budget.used, budget.max)) {
    log.warn({ เพดานต่อวัน: budget.max }, "ชนเพดานข้อความ LINE ของวันนี้ — ไม่ส่งกิจกรรม");
    return 0;
  }

  /* ═══ ★★ จองที่ก่อนส่ง ไม่ใช่ส่งก่อนแล้วค่อยบันทึก (T1.365) ═══
     ของเดิมส่งก่อนแล้วค่อย `record()` — พอ `record()` ล้ม (ค่า kind ใหม่ชน CHECK constraint)
     ตัวชี้ `ref` ไม่ขยับ **รอบหน้าจึงส่งรายการเดิมซ้ำอีก** วนทุก 30 วินาที
     ของจริงที่เกิด: เสียโควตาไป ~177 จาก 300 ข้อความของเดือนนั้น

     จองที่ก่อนแล้วค่อยส่ง สลับความเสี่ยงให้ถูกทาง:
       จองไม่สำเร็จ → ไม่ส่งเลย → เสียสรุปหนึ่งรอบ (ยอมรับได้)
       ของเดิม      → ส่งสำเร็จแต่จำไม่ได้ → ส่งซ้ำไม่รู้จบ (ยอมรับไม่ได้) */
  const mark = String(rows[rows.length - 1].id);
  const reserved = await record("activity", mark, { dry: lineDryRun(), sent: false, error: null });
  /* มีคนอื่นจองไปแล้ว (แถวซ้ำ) — ปล่อยให้เขาส่ง อย่าส่งซ้อน */
  if (!reserved) return 0;

  const text = activityMessage(rows, { now });
  const result = await sendLine({ type: "text", text });
  budget.used += 1;

  /* ★ อัปเดตผลลงแถวที่จองไว้ — ล้มตรงนี้ก็ไม่เป็นไร เพราะแถวจองอยู่แล้ว ไม่ส่งซ้ำ */
  await query(
    `update line_notice set ok = $2, error = $3 where kind = 'activity' and ref = $1`,
    [mark, result.sent || result.dry, result.error ?? null],
  );
  if (result.error) {
    log.warn({ err: result.error }, "ส่งกิจกรรมเข้าไลน์ไม่สำเร็จ — ข้ามรอบนี้ ไม่ส่งซ้ำ");
    return 0;
  }
  return rows.length;
}

/**
 * เดินหนึ่งรอบ — เรียกจากสะพานข้อมูลหลังคิดแจ้งเตือนเสร็จ
 * ห้ามโยน error ออกไป รอบซิงก์ต้องเดินต่อได้แม้ LINE ล่ม
 */
export async function runLineNotifier(now = new Date()) {
  if (!lineEnabled()) return { alerts: 0, daily: false, activity: 0, skipped: "ปิดไว้ที่ LINE_NOTIFY=0" };

  const budget = { used: await sentToday(), max: maxPerDay() };
  try {
    const alerts = await passAlerts(now, budget);
    const daily = await passDaily(now, budget);
    const activity = await passActivity(now, budget);
    if (alerts > 0 || daily || activity > 0) {
      log.info(
        { เหตุที่ส่ง: alerts, สรุปประจำวัน: daily, กิจกรรมที่ส่ง: activity, โหมดซ้อม: lineDryRun() },
        "ตัวส่ง LINE ทำงาน",
      );
    }
    return { alerts, daily, activity, skipped: null };
  } catch (err) {
    log.error({ err: err.message }, "ตัวส่ง LINE พัง — รอบซิงก์เดินต่อ");
    return { alerts: 0, daily: false, activity: 0, skipped: err.message };
  }
}

/** ส่งสรุปของช่วงเวลาหนึ่งทันที (ใช้จากปุ่ม/เส้นทาง API — ไม่สนใจตารางเวลา) */
export async function sendSummaryNow(from, to) {
  const summary = await buildSummary(from, to);
  const result = await sendLine(dailyFlex(summary, dashboardUrl()));
  await record(result.error ? "error" : "test", null, result);
  return { result, summary };
}
