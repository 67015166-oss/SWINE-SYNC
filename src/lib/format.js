/**
 * ตัวช่วย format ตัวเลข/วันที่ — ใช้ตัวนี้เสมอ ห้าม format เองในเพจ
 *
 * รูปแบบเปลี่ยนตามภาษาที่ผู้ใช้เลือก (ไทย/อังกฤษ/จีน) — `LangProvider` เป็นคนสั่ง
 * ผ่าน `setFormatLocale()` ตอนสลับภาษา ที่นี่จึงเก็บ locale ปัจจุบันไว้ตัวเดียวทั้งไฟล์
 * (ไม่ส่ง locale เข้าทุกฟังก์ชัน เพราะจุดเรียกมีหลายร้อยจุดทั่วแอป)
 *
 * ข้อควรรู้: ปฏิทินไทยของ Intl เป็นพุทธศักราชอยู่แล้ว ("ก.ค. 69" = ก.ค. 2569)
 * ส่วนอังกฤษ/จีนได้คริสต์ศักราชตามปกติ ไม่ต้องแปลงเอง
 */

const DEFAULT_LOCALE = "th-TH";
let locale = DEFAULT_LOCALE;

/* Intl.* สร้างใหม่ทุกครั้งช้ากว่าที่คิด — เก็บไว้ใช้ซ้ำ แยกตาม locale */
const cache = new Map();
const fmt = (kind, make) => {
  const key = `${locale}:${kind}`;
  if (!cache.has(key)) cache.set(key, make(locale));
  return cache.get(key);
};

/** ตั้ง locale ของทั้งไฟล์ — เรียกจาก LangProvider เท่านั้น */
export function setFormatLocale(next) {
  locale = next || DEFAULT_LOCALE;
}

const num = () => fmt("num", (l) => new Intl.NumberFormat(l));
const num1 = () =>
  fmt(
    "num1",
    (l) =>
      new Intl.NumberFormat(l, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  );
const num2 = () =>
  fmt(
    "num2",
    (l) =>
      new Intl.NumberFormat(l, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
const money = () =>
  fmt(
    "baht",
    (l) =>
      new Intl.NumberFormat(l, {
        style: "currency",
        currency: "THB",
        /* บังคับสัญลักษณ์ ฿ ทุกภาษา — ไม่งั้นอังกฤษ/จีนจะขึ้นว่า "THB 125,000" ซึ่งอ่านช้ากว่า */
        currencyDisplay: "narrowSymbol",
        maximumFractionDigits: 0,
      })
  );

/**
 * ขีดกลางที่ใช้แทน "ไม่มีค่าให้แสดง" — ตัวเดียวกับที่การ์ดทั้งแอปใช้อยู่แล้ว
 *
 * ทำไมต้องมี: `Intl.DateTimeFormat.format()` **โยน RangeError** เมื่อได้วันที่ไม่ถูกต้อง
 * (undefined / null / สตริงมั่ว) และเพราะทุกหน้าเรียกฟังก์ชันพวกนี้ตอน render
 * ข้อมูลที่ขาดไปค่าเดียวจึงทำให้ทั้งหน้าขาวโพลน — เคสจริงที่เจอคือผู้ใช้ลบฟาร์มจนหมด
 * แล้ว `summarizeFarms([]).updatedAt` เป็น undefined หน้าฟาร์มทั้งหมดจึงพังทั้งหน้า
 * ➜ ค่าที่ format ไม่ได้ให้แสดงขีดกลางแทน หน้ายังอยู่ครบและผู้ใช้เห็นว่า "ตรงนี้ยังไม่มีข้อมูล"
 */
const DASH = "—";

/** วันที่ใช้ได้จริงไหม — กันทั้ง undefined/null/สตริงมั่ว และ Invalid Date */
const dateOf = (value) => {
  if (value == null || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * ตัวเลขที่ format ได้จริงไหม — คืน null เมื่อ format ไม่ได้ (ให้ผู้เรียกขึ้นขีดกลางแทน)
 *
 * **ต้องกันค่าว่างด้วย ไม่ใช่กันแค่ NaN/Infinity** — `Intl.NumberFormat` ไม่โยน error
 * เหมือนตัว format วันที่ แต่ตอบค่าที่หลอกคนอ่าน:
 *   `format(null)` → "0"     ← อันตรายที่สุด "ไม่มีข้อมูล" กลายเป็น "ศูนย์"
 *   `format(undefined)` → "NaN"  ← โผล่คำว่า NaN กลางการ์ด
 * ทั้งสองแบบเกิดจากฟิลด์ที่หลังบ้าน/เซนเซอร์ยังไม่ส่งมา ซึ่งเป็นเรื่องปกติของแอปนี้
 *
 * สตริงที่เป็นตัวเลข ("3918") ยังใช้ได้เหมือนเดิม — แปลงให้ก่อนแล้วค่อยตัดสิน
 */
const numOf = (value) => {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

/** 3918 → "3,918" */
export const formatNumber = (n) => {
  const value = numOf(n);
  return value == null ? DASH : num().format(value);
};

/** 28.456 → "28.5" */
export const formatNumber1 = (n) => {
  const value = numOf(n);
  return value == null ? DASH : num1().format(value);
};

/** 2.4567 → "2.46" (ใช้กับ FCR) */
export const formatNumber2 = (n) => {
  const value = numOf(n);
  return value == null ? DASH : num2().format(value);
};

/** 125000 → "฿125,000" */
export const formatBaht = (n) => {
  const value = numOf(n);
  return value == null ? DASH : money().format(value);
};

/** "2026-07-28" → ไทย "28 ก.ค." · อังกฤษ "Jul 28" · จีน "7月28日" */
export const formatDateShort = (isoDate) => {
  const date = dateOf(isoDate);
  if (!date) return DASH;
  return fmt("date", (l) =>
    new Intl.DateTimeFormat(l, { day: "numeric", month: "short" })
  ).format(date);
};

/** "2026-08-01T14:30:00" → ไทย "14:30 น." · อังกฤษ/จีน "14:30" */
export const formatTime = (iso) => {
  const date = dateOf(iso);
  if (!date) return DASH;
  const time = fmt("time", (l) =>
    new Intl.DateTimeFormat(l, { hour: "2-digit", minute: "2-digit", hour12: false })
  ).format(date);
  /* "น." เป็นคำไทย ไม่ใช่ส่วนหนึ่งของตัวเลข — ภาษาอื่นไม่มีคำนี้ */
  return locale.startsWith("th") ? `${time} น.` : time;
};

/** "2026-08-01T14:30:00" → "1 ส.ค. 14:30 น." */
export const formatDateTime = (iso) =>
  dateOf(iso) ? `${formatDateShort(iso)} ${formatTime(iso)}` : DASH;

/**
 * เวลาที่ "วัดได้ล่าสุด" — **ขึ้นวันที่ให้ด้วยถ้าไม่ใช่วันนี้** (T1.305)
 *
 * ★ `formatTime` อย่างเดียวอันตรายกับคำว่า "อัปเดตล่าสุด"
 *   ของจริงที่เห็นบนหน้าจอ 3 ต.ค. 2569: หน้าโรงเรือนเขียน **"อัปเดต 01:59 น."**
 *   ทั้งที่เป็นค่าของ **29 ก.ย.** — คนอ่านเข้าใจว่าเมื่อเช้านี้ ซึ่งคลาดไปสี่วันเต็ม
 *   เวลาอย่างเดียวจะไม่มีวันบอกได้ว่าเป็นของวันไหน และ "ไม่บอก" กับ "บอกว่าวันนี้"
 *   หน้าตาเหมือนกันสำหรับคนอ่าน
 *
 * วันนี้ → "01:59 น." (สั้น อ่านง่าย ไม่รกโดยไม่จำเป็น)
 * วันอื่น → "29 ก.ย. 01:59 น."
 */
export const formatWhen = (iso, now = new Date()) => {
  const date = dateOf(iso);
  if (!date) return DASH;
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return sameDay ? formatTime(iso) : formatDateTime(iso);
};

/**
 * "2026-07-28" → ไทย "28 ก.ค. 69" · อังกฤษ "Jul 28, 26" · จีน "26年7月28日"
 *
 * ต่างจาก `formatDateShort` ตรงที่มีปี — ใช้กับวันที่ที่อยู่ไกลจากวันนี้จนปีอาจไม่ตรง
 * (เช่นกำหนดคลอดที่นับไป 114 วัน ซึ่งข้ามปีได้) ถ้าไม่มีปี คนจะอ่านเป็นปีนี้เสมอ
 */
export const formatDateYear = (isoDate) => {
  const date = dateOf(isoDate);
  if (!date) return DASH;
  return fmt("dateYear", (l) =>
    new Intl.DateTimeFormat(l, { day: "numeric", month: "short", year: "2-digit" })
  ).format(date);
};

/** "2026-07" → ไทย "ก.ค. 69" · อังกฤษ "Jul 26" · จีน "26年7月" */
export const formatMonth = (isoMonth) => {
  const date = dateOf(isoMonth ? `${isoMonth}-01` : null);
  if (!date) return DASH;
  return fmt("month", (l) =>
    new Intl.DateTimeFormat(l, { month: "short", year: "2-digit" })
  ).format(date);
};
