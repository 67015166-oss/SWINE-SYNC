/**
 * ตั๋วชั่วคราวสำหรับภาพสดและไฟล์วิดีโอ (T1.356)
 *
 * ═══ ★★ ทำไมต้องมี — แท็ก <img> แนบ Authorization ไม่ได้ ═══
 * ภาพสด MJPEG แสดงด้วย `<img src="...">` ซึ่ง**เบราว์เซอร์เป็นคนไปดึงเอง**
 * เราใส่หัว `Authorization: Bearer …` ให้มันไม่ได้ ต่างจากคำขอที่โค้ดเรายิงเอง
 * เส้นทางภาพสดจึงรับตั๋วทางพารามิเตอร์ได้อีกทางหนึ่ง
 *
 * ★ **ห้ามเอา token ของ session มาใส่ใน URL แทน** — URL ไปโผล่ใน log ของทุกตัวกลาง
 *   ในประวัติเบราว์เซอร์ และในหัว Referer ของเว็บอื่น ใครเก็บไว้ได้ก็สวมสิทธิ์ได้ทั้งบัญชี
 *   ตั๋วใบนี้จึงเป็นคนละใบกับ token · อายุสั้น · และเปิดได้แค่ภาพกับวิดีโอเท่านั้น
 *
 * ★ เก็บในหน่วยความจำพอ รีสตาร์ตแล้วหายหมดโดยตั้งใจ — หน้าเว็บขอใบใหม่เองได้ทันที
 *   ไม่ต้องเพิ่มตารางในฐานข้อมูลให้เป็นภาระอีกที่ และของที่หายแล้วดีกว่าของที่ค้าง
 */
import { randomBytes } from "node:crypto";

/** อายุตั๋ว — สั้นพอที่ใบหลุดแล้วแทบไม่มีค่า แต่ยาวพอให้เปิดหน้าทันโดยไม่ต้องขอซ้ำ */
export const TICKET_TTL_MS = 60_000;

/** กันตั๋วงอกไม่หยุดถ้ามีใครขอรัว ๆ — เกินเพดานแล้วทิ้งใบเก่าสุดก่อน */
const MAX_TICKETS = 500;

const store = new Map();

/** เก็บกวาดใบหมดอายุ — เรียกทุกครั้งที่แตะคลัง ไม่ต้องตั้งตัวจับเวลาแยก */
function sweep(now) {
  for (const [id, t] of store) if (t.expiresAt <= now) store.delete(id);
}

export function issueTicket(userId, now = Date.now()) {
  sweep(now);
  /* ★ ทิ้งใบเก่าสุดก่อนเมื่อเต็ม ไม่ใช่ปฏิเสธคนใหม่ — ไม่งั้นคนขอรัว ๆ จะกันคนอื่นใช้ไม่ได้ */
  while (store.size >= MAX_TICKETS) store.delete(store.keys().next().value);
  const id = randomBytes(24).toString("hex");
  store.set(id, { userId, expiresAt: now + TICKET_TTL_MS });
  return { ticket: id, expiresInSec: Math.round(TICKET_TTL_MS / 1000) };
}

/**
 * ตั๋วใบนี้ใช้ได้ไหม — ใช้ซ้ำได้จนหมดอายุโดยตั้งใจ
 * เพราะภาพสดหลุดแล้วเบราว์เซอร์ต่อใหม่เอง ถ้าตั๋วใช้ได้ครั้งเดียวภาพจะดับถาวร
 */
export function checkTicket(id, now = Date.now()) {
  sweep(now);
  const t = id ? store.get(id) : null;
  return t && t.expiresAt > now ? { ok: true, userId: t.userId } : { ok: false };
}

/** ใช้ในชุดทดสอบเท่านั้น */
export function _clearTickets() {
  store.clear();
}
