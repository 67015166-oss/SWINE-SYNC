/**
 * ช่องไหนของเกณฑ์สภาพแวดล้อม "เปลี่ยนค่าจริง" (T1.362)
 *
 * ═══ ★★ ทำไมต้องมีตัวนี้ ═══
 * หน้าเว็บซิงก์เกณฑ์ขึ้นมาเองตอนมีคนเข้าระบบ (`lib/settings/useAlertRuleSync.js`)
 * และส่งมา **ครบทุกช่องเสมอ** ไม่ได้ส่งเฉพาะช่องที่คนแก้
 *
 * ตอนเปิดใช้งานการบันทึกกิจกรรม (T1.359) นับว่า "ส่งมา = แก้" จึงมีบรรทัด
 * "ใครบางคนแก้เกณฑ์สภาพแวดล้อม" โผล่ทุกครั้งที่มีคนเปิดแอป
 * **ของจริงที่เจอ: 3 บรรทัดใน 6 วินาที ทั้งที่ไม่มีใครแตะอะไรเลย**
 *
 * ★ แยกเป็นไฟล์ล้วนเพื่อให้ชุดทดสอบที่รากโครงงานเรียกได้โดยไม่ต้องมีฐานข้อมูล
 *   (กติกาเดียวกับ `line/recordText.js` · `activity/kinds.js`)
 */

/** คู่ของ "ชื่อช่องที่หน้าเว็บส่งมา" ↔ "แถวในตาราง alert_rule" */
export const COMFORT_FIELDS = [
  ["tempMin", "temp_c", "threshold_min"],
  ["tempMax", "temp_c", "threshold_max"],
  ["humidityMin", "humidity", "threshold_min"],
  ["humidityMax", "humidity", "threshold_max"],
  /* NH3 มีแต่เพดาน ไม่มีขั้นต่ำ */
  ["nh3Limit", "nh3", "threshold_max"],
];

/**
 * ช่องที่เปลี่ยนจริง พร้อม **ค่าเก่าและค่าใหม่** (T1.364)
 *
 * ★ ต้องคืนค่าคู่ไปด้วย ไม่ใช่แค่ชื่อช่อง — ข้อความแจ้งเตือนต้องบอกได้ว่า
 *   "เพิ่มอุณหภูมิสูงสุด จาก 26 °C เป็น 29 °C" ไม่ใช่แค่ "แก้ tempMax"
 *   คนอ่านในไลน์ต้องตัดสินใจได้จากข้อความใบเดียว โดยไม่ต้องเปิดเว็บดูต่อ
 *
 * @returns {Array<{field: string, from: number|null, to: number}>}
 */
export function comfortChanges(beforeRows, body = {}) {
  const before = new Map((beforeRows ?? []).map((r) => [r.metric, r]));
  /* ★ เทียบเป็นตัวเลขเสมอ — ฐานคืนค่าคอลัมน์ numeric มาเป็นสตริง `"28.0"`
     ซึ่งไม่เท่ากับ `28` ถ้าเทียบด้วย `!==` แล้วทุกช่องจะถูกนับว่าเปลี่ยนตลอดไป */
  const num = (v) => (v == null || v === "" ? null : Number(v));
  const out = [];
  for (const [key, metric, col] of COMFORT_FIELDS) {
    if (body[key] === undefined) continue;
    const now = num(body[key]);
    const was = num(before.get(metric)?.[col]);
    /* ค่าที่ไม่ใช่ตัวเลขถือว่า "เทียบไม่ได้" — นับเป็นเปลี่ยน ดีกว่าเงียบแล้วตกหล่น */
    if (!Number.isFinite(now) || now !== was) out.push({ field: key, from: was, to: body[key] });
  }
  return out;
}

/** เฉพาะชื่อช่องที่เปลี่ยน — ตัวเดิมที่ของอื่นเรียกอยู่ */
export function changedComfortFields(beforeRows, body = {}) {
  return comfortChanges(beforeRows, body).map((c) => c.field);
}
