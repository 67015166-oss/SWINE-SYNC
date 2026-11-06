/**
 * เลื่อนวันที่ของ "ข้อมูลตัวอย่าง" ให้ทันวันปัจจุบันเสมอ
 *
 * **ปัญหาที่แก้** (10 ก.ย. 2569): วันที่ในไฟล์ mock ถูกเขียนตายตัวไว้ตอนสร้างข้อมูล
 * โดยถือว่า "วันนี้" คือ 3 ส.ค. 2569 พอเวลาผ่านไปเดือนกว่า หน้าจอจึงขึ้นว่า
 * "ข้อมูล ณ 1 ส.ค." · "เดือนล่าสุด ก.ค." · กราฟอาหารจบที่ 1 ส.ค.
 * คนเปิดดูวันที่ 10 ก.ย. อ่านแล้วเข้าใจว่า **ระบบหยุดส่งข้อมูลไปตั้งแต่เดือนที่แล้ว**
 * ซึ่งไม่จริง — ฟาร์มที่ต่อเซนเซอร์จริงขึ้นเวลาปัจจุบันถูกต้องอยู่แล้ว เสียแค่ฝั่งตัวอย่าง
 *
 * **เลื่อนทั้งชุดด้วยระยะเดียวกัน** ไม่ใช่ไล่ตั้งวันใหม่ทีละไฟล์ — ระยะห่างระหว่างวันที่
 * ทุกคู่จึงเท่าเดิมเป๊ะ (ชุดเลี้ยงยังอายุเท่าเดิม · เหตุการณ์ยังเรียงเหมือนเดิม ·
 * ยอดรวมของเดือนล่าสุดยังตรงกับ `farms[].pigs` เหมือนเดิม)
 *
 * **ไม่แตะ "ค่า"** แตะแต่ "วันที่" — โครงสร้างข้อมูล (ชื่อฟิลด์/ชนิด) เหมือนเดิมทุกอย่าง
 * ตามกติกาใน CLAUDE.md
 *
 * ➜ เพิ่มวันที่ใหม่ในไฟล์ mock ต้องส่งผ่าน `shiftDate` / `shiftMonth` ด้วยเสมอ
 *   ไม่งั้นวันที่นั้นจะค้างอยู่ปี 2569 อยู่คนเดียวในขณะที่ทั้งชุดเลื่อนไปแล้ว
 */

/**
 * วันที่ที่ข้อมูลตัวอย่างทั้งชุดถือว่าเป็น "วันนี้" ตอนที่เขียนขึ้นมา
 * (มาจาก `farms[].updatedAt` ซึ่งเป็นวันที่ใหม่ที่สุดในชุด)
 */
const ANCHOR = { year: 2026, month: 8, day: 3 };

const pad = (n) => String(n).padStart(2, "0");

/** เที่ยงคืนของวันนั้นตามเวลาเครื่อง — เทียบวันต่อวัน ไม่ให้เศษชั่วโมงมาปัดผิด */
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const now = new Date();

/**
 * ต้องเลื่อนไปกี่วัน — คิดครั้งเดียวตอนโหลดไฟล์ เหมือนที่ mock เป็นค่าคงที่มาตลอด
 *
 * แอปที่เปิดค้างข้ามคืนจะยังใช้ค่าของเมื่อวาน ซึ่งรับได้ (คลาดไปหนึ่งวัน)
 * และดีกว่าให้ตัวเลขบนจอขยับเองระหว่างที่คนกำลังดูอยู่
 */
const DAY_MS = 86_400_000;
const dayShift = Math.round(
  (startOfDay(now) - startOfDay(new Date(ANCHOR.year, ANCHOR.month - 1, ANCHOR.day))) / DAY_MS,
);

/** ต้องเลื่อนไปกี่เดือน — นับเป็นเดือนเต็ม ไม่ใช่หารวันจาก dayShift (เดือนยาวไม่เท่ากัน) */
const monthShift =
  (now.getFullYear() - ANCHOR.year) * 12 + (now.getMonth() + 1 - ANCHOR.month);

/**
 * "2026-07-30" → วันที่เดียวกันหลังเลื่อนแล้ว · มีเวลาต่อท้ายก็คงเวลาเดิมไว้
 * ("2026-08-01T14:30:00" → "<วันที่ใหม่>T14:30:00" — 14:30 ยังเป็น 14:30)
 */
export function shiftDate(iso) {
  const [datePart, timePart] = String(iso).split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const shifted = new Date(year, month - 1, day + dayShift);
  const out = `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
  return timePart ? `${out}T${timePart}` : out;
}

/** "2026-07" → เดือนเดียวกันหลังเลื่อนแล้ว (เดือนล่าสุดของกราฟยังเป็น "เดือนที่แล้ว" เหมือนเดิม) */
export function shiftMonth(isoMonth) {
  const [year, month] = String(isoMonth).split("-").map(Number);
  const total = year * 12 + (month - 1) + monthShift;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** เลื่อนทั้งลิสต์ทีเดียว — `key` คือชื่อฟิลด์ที่เก็บวันที่ (date · time · at · updatedAt) */
export const shiftDatesIn = (rows, key = "date") =>
  rows.map((row) => ({ ...row, [key]: shiftDate(row[key]) }));

/** เลื่อนทั้งลิสต์ที่เก็บเป็นรายเดือน */
export const shiftMonthsIn = (rows, key = "month") =>
  rows.map((row) => ({ ...row, [key]: shiftMonth(row[key]) }));
