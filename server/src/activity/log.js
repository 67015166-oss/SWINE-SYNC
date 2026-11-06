/**
 * เขียนบันทึก "ใครทำอะไร" (T1.359)
 *
 * ★★ **ห้ามทำให้คำขอหลักล้มเพราะบันทึกไม่สำเร็จ**
 * ถ้าเขียน log ไม่ได้แล้วโยน error ออกไป การลบฟาร์มที่สำเร็จไปแล้วจะตอบ 500
 * กลับไปหาหน้าเว็บ ผู้ใช้จะกดซ้ำเพราะคิดว่าไม่สำเร็จ — เสียหายกว่าการไม่มีบันทึกมาก
 * จึงจับ error ไว้แล้วบันทึกลง log ของเซิร์ฟเวอร์แทน
 *
 * ★ เรียก **หลังจากของจริงสำเร็จแล้วเท่านั้น** ไม่ใช่ก่อน
 *   ไม่งั้นจะมีบรรทัด "สมชายลบฟาร์ม" ทั้งที่การลบล้มเหลว
 */
import { query } from "../db/pool.js";
import { log } from "../lib/log.js";
import { clip, isActivityKind, summaryOf } from "./kinds.js";

/**
 * @param {object} o
 * @param {string} o.kind     หมวดใหญ่ — settings | admin | barnlog | control
 * @param {string} o.action   การกระทำแบบละเอียด เช่น "farm.create"
 * @param {object} [o.actor]  ผู้ทำ — `req.user`
 * @param {string} [o.target] สิ่งที่ถูกกระทำ (ชื่อฟาร์ม / รหัสโรงเรือน / ชื่อผู้ใช้)
 * @param {object} [o.detail] ข้อมูลเพิ่มสำหรับประกอบข้อความและดูย้อนหลัง
 */
export async function logActivity({ kind, action, actor, target = "", detail = {} }) {
  try {
    if (!isActivityKind(kind)) throw new Error(`หมวดกิจกรรมที่ไม่รู้จัก: ${kind}`);
    const actorName = actor?.display_name || actor?.username || "";
    const summary = summaryOf({ action, actorName, target, detail });
    await query(
      `insert into activity (kind, action, actor_id, actor_name, target, summary, detail)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [kind, action, actor?.id ?? null, clip(actorName, 80), clip(target, 120), summary,
       JSON.stringify(detail ?? {})],
    );
  } catch (err) {
    log.warn({ err: err?.message, kind, action }, "บันทึกกิจกรรมไม่สำเร็จ");
  }
}
