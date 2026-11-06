/**
 * ตัวเฝ้าระวัง "ไลน์ยิงเข้ามาหาเราได้ไหม" (T1.278)
 *
 * ใช้ `POST /v2/bot/channel/webhook/test` ของ LINE เอง — สั่งให้ **เซิร์ฟเวอร์ของ LINE**
 * ยิงมาที่ webhook ของเราแล้วรายงานผลกลับ จึงเป็นการทดสอบเส้นทางจริงทั้งเส้น
 * (ทดสอบเองในเครื่องไม่พอ: 23 ก.ย. 2569 ในเครื่องผ่าน 401 ปกติ แต่จากอินเทอร์เน็ตเข้าไม่ได้)
 *
 * **ไม่กินโควตาข้อความ** เพราะเป็นคำสั่งทดสอบ ไม่ใช่การส่งข้อความหาใคร
 * ส่วนข้อความแจ้งเตือนตอนพังจะส่งแค่ตอนเปลี่ยนสถานะ (พัง / กลับมา) ไม่ใช่ทุกชั่วโมง
 */
import { query } from "../db/pool.js";
import { log } from "../lib/log.js";
import { lineConfigured, sendLine } from "./client.js";
import { thaiDate } from "./flex.js";
import { lineEnabled } from "./notifier.js";
import { CHECK_EVERY_MIN, healthMessage, notifyKind, shouldCheck } from "./healthRules.js";

const TIMEOUT_MS = 15_000;

/** ให้ LINE ลองยิงเข้ามา แล้วบอกว่าได้ผลอะไร */
export async function probeWebhook() {
  const res = await fetch("https://api.line.me/v2/bot/channel/webhook/test", {
    method: "POST",
    headers: { Authorization: `Bearer ${(process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim()}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.json().catch(() => ({}));
  return {
    ok: body.success === true,
    reason: body.reason ?? (res.ok ? null : `HTTP ${res.status}`),
    detail: body.detail ?? null,
  };
}

/** ผลตรวจครั้งล่าสุด (ไว้เทียบว่าสถานะเปลี่ยนไหม) */
async function lastCheck() {
  const { rows } = await query(`select at, ok, reason from line_health order by at desc limit 1`);
  return rows[0] ?? null;
}

/** พังมาตั้งแต่เมื่อไร — เวลาของแถวที่ "พังครั้งแรกของช่วงพังปัจจุบัน" */
async function failingSince() {
  const { rows } = await query(
    `select min(at) as since from line_health
      where not ok and at > coalesce((select max(at) from line_health where ok), '-infinity'::timestamptz)`,
  );
  return rows[0]?.since ?? null;
}

/**
 * เดินหนึ่งรอบ — เรียกจากสะพานข้อมูล ตัวมันเองเป็นคนตัดสินว่าถึงเวลาตรวจหรือยัง
 * ห้ามโยน error ออกไป รอบซิงก์ต้องเดินต่อได้เสมอ
 */
export async function runHealthCheck(now = new Date(), { force = false } = {}) {
  if (!lineConfigured()) return { skipped: "ยังไม่ได้ตั้งกุญแจ LINE" };

  try {
    const previous = await lastCheck();
    if (!force && !shouldCheck(previous?.at ?? null, now)) return { skipped: "ยังไม่ถึงรอบตรวจ" };

    const result = await probeWebhook();
    await query(`insert into line_health (ok, reason, detail) values ($1, $2, $3)`,
      [result.ok, result.reason, result.detail]);

    const kind = notifyKind(result.ok, previous ? previous.ok : null);
    /* **ต้องเคารพ `LINE_NOTIFY` ให้เหมือนตัวส่งสรุป/แจ้งเตือน**
       ตอนย้ายระบบ (24 ก.ย. 2569) มีสองเครื่องรันชุดเดียวกันพร้อมกัน เครื่องที่ยังไม่ถึงคิว
       ตั้ง `LINE_NOTIFY=0` ไว้ — แต่ตรงนี้เรียก sendLine ตรง ๆ จึงยังส่งอยู่ คนจะได้ข้อความซ้ำสองชุด
       ยังตรวจและยังบันทึกลง `line_health` ตามปกติ เพราะบันทึกไม่ได้กวนใคร ที่กันคือการส่ง */
    if (kind && lineEnabled()) {
      const since = kind === "down" ? thaiDate(now, { withTime: true }) : null;
      /* ขาออกยังใช้ได้แม้ขาเข้าพัง — คนละทางกัน จึงบอกผู้ใช้ผ่านไลน์ได้อยู่ */
      const sent = await sendLine(healthMessage(kind, { since, reason: result.reason }));
      log.warn({ สถานะ: kind, เหตุผล: result.reason, ส่งแล้ว: sent.sent, โหมดซ้อม: sent.dry },
        "สถานะช่องทางไลน์เปลี่ยน");
    } else if (kind) {
      log.info({ สถานะ: kind }, "สถานะช่องทางไลน์เปลี่ยน แต่ปิดการส่งไว้ที่ LINE_NOTIFY=0");
    } else if (!result.ok) {
      log.warn({ เหตุผล: result.reason }, "ช่องทางไลน์ยังใช้ไม่ได้");
    }

    return { ok: result.ok, reason: result.reason, notified: kind };
  } catch (err) {
    log.error({ err: err.message }, "ตรวจช่องทางไลน์ไม่สำเร็จ");
    return { skipped: err.message };
  }
}

/** สรุปสถานะไว้ให้หน้า /api/line/status แสดง */
export async function healthSummary() {
  const [last, since] = await Promise.all([lastCheck(), failingSince()]);
  const { rows } = await query(
    `select count(*) filter (where not ok)::int as fails, count(*)::int as total
       from line_health where at > now() - interval '24 hours'`,
  );
  return {
    lastCheckedAt: last?.at ?? null,
    ok: last?.ok ?? null,
    reason: last?.reason ?? null,
    failingSince: last && !last.ok ? since : null,
    last24h: rows[0] ?? { fails: 0, total: 0 },
    everyMinutes: CHECK_EVERY_MIN,
  };
}
