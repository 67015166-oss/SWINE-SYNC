/**
 * นับวันสำคัญจากวันผสม (T1.293)
 *
 * ข้อมูล `BREEDING_TIMELINE` ของทีม Farmy เขียนกำกับไว้เองว่า "(ใช้ในเครื่องคำนวณ)"
 * แต่ในชุดที่เขาส่งมามีแต่ตัวเลขวัน ไม่มีตัวนับ — ไฟล์นี้คือตัวนับนั้น
 *
 * ★ **เลขที่ออกจากไฟล์นี้คือกำหนดคลอด** ผิดแล้วคนเตรียมคอกคลอดผิดวัน
 *   จึงเขียนเป็นฟังก์ชันล้วน ไม่แตะ React ไม่แตะเวลาปัจจุบัน เพื่อให้เทสต์จับได้จริง
 *
 * ★ **บวกวันแบบ "วันตามปฏิทิน" ไม่ใช่บวกมิลลิวินาที** — `+114 * 86400000`
 *   จะเพี้ยนไปหนึ่งวันทุกครั้งที่ช่วงนั้นคร่อมการเปลี่ยนเวลา และเพี้ยนแบบเงียบ ๆ
 *   ไทยไม่มี DST ก็จริง แต่เบราว์เซอร์ใช้เขตเวลาของเครื่อง ซึ่งเราไม่ได้เป็นคนกำหนด
 *   ➜ ใช้ `new Date(ปี, เดือน, วัน + n)` ให้ JS เดินปฏิทินให้ ข้ามเดือนข้ามปีเองถูกต้อง
 */

const pad = (n) => String(n).padStart(2, "0");

/** "2026-09-29" → { y, m, d } · รูปแบบผิดหรือวันที่ไม่มีจริงคืน null */
const parse = (iso) => {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  /* กันวันที่ที่ "อ่านได้แต่ไม่มีจริง" เช่น 2026-02-31 ซึ่ง JS จะเลื่อนให้เป็น 3 มี.ค.
     แบบไม่บอกอะไรเลย — ของแบบนี้ต้องเป็น null ไม่ใช่วันที่อื่นที่ดูสมเหตุสมผล */
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
};

/** บวกวันตามปฏิทิน — "2026-09-29" + 114 → "2027-01-21" (วันที่ผิดคืน null) */
export function addDays(iso, days) {
  const base = parse(iso);
  if (!base || !Number.isInteger(days)) return null;
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

/**
 * เติมวันที่จริงให้ทุกหมุดในไทม์ไลน์
 *
 * ไม่ได้รับ `BREEDING_TIMELINE` มาเป็นค่าตั้งต้นโดยตั้งใจ — ส่งเข้ามาเองทุกครั้ง
 * เทสต์จึงตรวจสูตรได้โดยไม่ต้องพึ่งข้อมูลของทีมอื่นที่อาจเปลี่ยนวันหลัง
 */
export function timelineFor(iso, milestones) {
  return milestones.map((m) => ({ ...m, date: addDays(iso, m.day) }));
}

/** วันนี้ในรูปแบบ "YYYY-MM-DD" ตามเวลาเครื่อง (ใช้เป็นค่าตั้งต้นของช่องกรอก) */
export const todayIso = (now = new Date()) =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
