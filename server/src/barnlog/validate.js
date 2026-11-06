/**
 * บันทึกของคนในโรงเรือน (T1.269) — ตรวจค่าที่ส่งมา
 *
 * **ไม่มี import** เทสต์จากราก repo ได้ (แบบเดียวกับ reports/shiftCalc.js)
 * ชนิด/หน่วยต้องตรงกับ LOG_TYPES · UNITS ใน src/pages/BarnDetail.jsx
 */

export const LOG_TYPES = [
  "dead", "sick", "missing", "moveIn", "moveOut", "feed", "medicine",
  /* ═══ เพิ่มใน T1.366 — ต้องตรงกับ CHECK constraint ของ barn_log.type ═══
     ★★ เพิ่มชนิดใหม่ต้องแก้ **สี่ที่พร้อมกัน**: constraint ในฐาน · ไฟล์นี้
        · src/lib/barnLogTypes.js (หน้าเว็บ) · server/src/line/intent.js (คำสั่งในไลน์)
        แก้ไม่ครบแล้วจะพังคนละแบบกันทุกที่ และบางที่พังเงียบ */
  "birth", "wean", "mate", "weigh",
  "water", "feedStock", "vaccine",
  "clean", "repair", "check", "visitor", "note",
];
export const UNITS = ["ตัว", "กิโลกรัม", "โดส", "ลิตร", "ครั้ง"];

/** รหัสโรงเรือนแบบที่หน้าเว็บใช้ เช่น "F-KPP-A1" — ตัวอักษร ตัวเลข ขีด เท่านั้น */
export const BARN_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** เวลาแบบที่หน้าเว็บเขียน: "2026-09-18T14:05:00" (เวลาไทย ไม่มีโซน) */
const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

const MAX_AMOUNT = 100_000;

/**
 * @param {object} body ค่าที่ส่งมา
 * @param {{partial?: boolean}} opt partial = แก้ไข (ส่งมาเฉพาะช่องที่เปลี่ยนได้)
 * @returns {{ok: true, value: object} | {ok: false, errors: string[]}}
 */
export function checkEntry(body, { partial = false } = {}) {
  const b = body ?? {};
  const errors = [];
  const value = {};
  const has = (k) => b[k] !== undefined;

  if (has("type") || !partial) {
    if (LOG_TYPES.includes(b.type)) value.type = b.type;
    else errors.push("type");
  }
  if (has("amount") || !partial) {
    const n = Number(b.amount);
    if (Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT) value.amount = n;
    else errors.push("amount");
  }
  if (has("unit") || !partial) {
    if (UNITS.includes(b.unit)) value.unit = b.unit;
    else errors.push("unit");
  }
  if (has("at") || !partial) {
    if (typeof b.at === "string" && LOCAL_TIME.test(b.at) && !Number.isNaN(Date.parse(`${b.at}+07:00`))) {
      value.at = b.at.length === 16 ? `${b.at}:00` : b.at;
    } else errors.push("at");
  }
  if (has("note")) {
    if (typeof b.note === "string") value.note = b.note.trim().slice(0, 500);
    else errors.push("note");
  }
  if (has("by")) {
    if (typeof b.by === "string") value.by = b.by.trim().slice(0, 120);
    else errors.push("by");
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
