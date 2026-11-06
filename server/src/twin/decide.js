/**
 * กติกาตัดสินของแบบจำลอง — คณิตล้วน ไม่มี import ใด ๆ (T1.264)
 *
 * แยกจาก barnTwin.js / twinAlerts.js ที่แตะฐานข้อมูล เพื่อให้เทสต์ที่ราก repo เรียกได้ตรง ๆ
 * (รากไม่มีแพ็กเกจ pg) — กติกาที่ตัดสินว่า "เตือนหรือไม่" ต้องมีเทสต์คุมเสมอ
 */

/** ระดับของส่วนต่าง "จริง − แบบจำลอง" — เกณฑ์มาจากความคลาดเคลื่อนที่วัดได้จริง ไม่ใช่เลขตั้งเอง */
export function residualTone(residual, rmse3h) {
  if (residual == null || !rmse3h) return "offline";
  const x = Math.abs(residual);
  if (x > 3 * rmse3h) return "serious";
  if (x > 2 * rmse3h) return "warning";
  return "good";
}

/**
 * ควรเปิด/ปิด/คงแจ้งเตือน "ร้อนกว่าที่แบบจำลองคาด" ไหม
 *
 * - เปิดเมื่อ **ร้อนกว่า** เกินเกณฑ์เตือนติดกัน `holdSteps` ช่องล่าสุด (กันค่ากระโดดชั่ววูบ)
 * - ระดับ: ช่องล่าสุดเกินเกณฑ์รุนแรง = serious ไม่งั้น warning
 * - ปิดเมื่อช่องล่าสุดกลับมาไม่เกินเกณฑ์เตือน
 * - อยู่ระหว่างกลาง (เกินแต่ยังไม่ครบช่วง) = คงสภาพเดิม ไม่เปิดใหม่และไม่ปิดของเดิม
 * - **เย็นกว่าที่คาดไม่เตือน** — ไม่เป็นอันตรายต่อสุกร หน้าแบบจำลองแสดงให้เห็นอยู่แล้ว
 *
 * @param {Array<{actual:number, twin:number|null}>} series ผลของ rollingForecast (เรียงเก่า→ใหม่)
 * @param {{warn:number, serious:number}} thresholds
 * @returns {{action:"open"|"resolve"|"hold", level?:string, residual?:number}}
 */
export function deviationDecision(series, thresholds, holdSteps = 3) {
  const usable = series.filter((p) => Number.isFinite(p.actual) && Number.isFinite(p.twin));
  const last = usable.at(-1);
  if (!last) return { action: "hold" };
  const residual = last.actual - last.twin;
  if (residual <= thresholds.warn) return { action: "resolve", residual };
  const tail = usable.slice(-holdSteps);
  const sustained = tail.length === holdSteps && tail.every((p) => p.actual - p.twin > thresholds.warn);
  if (!sustained) return { action: "hold", residual };
  return { action: "open", level: residual > thresholds.serious ? "serious" : "warning", residual };
}

/**
 * เซนเซอร์ค่าค้างไหม — ค่าเดิมเป๊ะทั้งหน้าต่างเวลา ทั้งที่มีค่าเข้ามามากพอ
 * ค่าน้อยเกินไป (เซนเซอร์เงียบ) ไม่นับว่าค้าง — เรื่องนั้นมีแจ้งเตือน "เซนเซอร์ไม่ส่งข้อมูล" ดูแลอยู่แล้ว
 *
 * @param {{n:number, distinct:number}} window จำนวนค่า และจำนวนค่าที่ไม่ซ้ำในหน้าต่าง
 * @param {number} minReadings ขั้นต่ำที่ถือว่า "ส่งค่ามาจริง" (ส่งทุก ~10 วิ · 3 ชม. ควรได้ราว 1,000)
 */
export const isStuck = ({ n, distinct }, minReadings = 60) => n >= minReadings && distinct === 1;
