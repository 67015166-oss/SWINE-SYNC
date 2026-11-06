/**
 * ค่าที่ "ค้างไว้" เมื่อเซนเซอร์เงียบ — กติกาเดียวสำหรับทุกจุดที่แสดงค่า (T1.345)
 *
 * ผู้ใช้สั่งเมื่อ 21 ต.ค. 2569: "อย่าทำให้มันหาย ถ้าขัดข้องให้ค้างที่ค่าล่าสุดไว้ก่อน"
 *
 * ═══ ★ ทำไมต้องมีไฟล์นี้ แทนที่จะแก้ `barn.tempC` ให้ค้างค่าเองตรง ๆ ═══
 * มี 33 ไฟล์ที่อ่าน `barn.tempC` ไปเทียบเกณฑ์ ถ้าปล่อยค่าเก่าไหลเข้าช่องนั้น
 * **เซนเซอร์ที่ตายแล้วจะขึ้น "อยู่ในเกณฑ์" เขียวทั้งแถบ** — บั๊กที่ไล่แก้ไปเมื่อ 3 ต.ค. 2569
 *
 * จึงแยกเป็นสองชั้นถาวร:
 *   - `barn.tempC` (และพวก) = **ค่าที่ตรรกะใช้** · เป็น null เมื่อเก่าเกินเกณฑ์ ตามเดิม
 *   - `barn.held.*`          = **ค่าที่หน้าจอแสดง** · ค้างค่าล่าสุดไว้พร้อมเวลาที่วัด
 *
 * ทุกจุดที่แสดงค่าเซนเซอร์ให้เรียก `heldDisplay` ตัวนี้ ห้ามเขียนเงื่อนไขเอง
 * ไม่งั้นวันหนึ่งจะมีจุดที่ค้างค่าโดยไม่บอกอายุ ซึ่งอ่านได้ว่าเป็นค่าตอนนี้
 */
import { updatedText } from "./duration.js";

/** ขีดกลางตัวเดียวกับที่ `lib/format.js` ใช้ — คนละไฟล์แต่ต้องหน้าตาเหมือนกัน */
const DASH = "—";

/**
 * @param {object}   args
 * @param {number|null} args.live   ค่าที่ตรรกะใช้ (null = เก่าเกินเกณฑ์แล้ว)
 * @param {number|null} args.held   ค่าล่าสุดที่เคยวัดได้ (`barn.held.*`)
 * @param {string|null} args.at     เวลาที่วัดค่าล่าสุด (`barn.held.at`)
 * @param {(n: number) => string} args.format ตัวจัดรูปตัวเลข
 * @param {(key: string, vars?: object) => string} args.t
 * @param {Date} [args.now]
 * @returns {{text: string, note: string|null, isHeld: boolean}}
 */
export function heldDisplay({ live, held, at, format, t, now = new Date() }) {
  if (live != null) return { text: format(live), note: null, isHeld: false };

  /* ไม่เคยวัดได้เลย (ไม่มีเซนเซอร์ตัวนั้น) — ต่างจาก "เคยวัดได้แต่เงียบไป"
     ตรงนี้ต้องเป็นขีดกลางจริง ๆ ห้ามเดาเลขให้ */
  if (held == null || !at) return { text: DASH, note: null, isHeld: false };

  return {
    text: format(held),
    note: `${t("ค่าค้างไว้")} · ${updatedText(t, { at }, now)}`,
    isHeld: true,
  };
}
