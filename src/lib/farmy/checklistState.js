/**
 * จำว่าติ๊กเช็กลิสต์ข้อไหนไปแล้ว (T1.291) — ฟังก์ชันล้วน เทสต์ได้ ไม่แตะ React
 *
 * ═══ ทำไมต้องมีเรื่อง "รอบ" ═══
 * เช็กลิสต์รายวันที่ติ๊กไว้เมื่อวาน **ต้องว่างเปล่าเมื่อขึ้นวันใหม่** ไม่งั้นคนจะเปิดมาเจอ
 * ติ๊กครบแล้วตั้งแต่เช้าโดยที่ยังไม่ได้เดินดูหมูสักคอก — อันตรายกว่าไม่มีเช็กลิสต์เลย
 * เพราะมันสร้างหลักฐานปลอมว่าตรวจแล้ว
 *
 * จึงเก็บ **รหัสรอบ** ไว้กับผลติ๊กเสมอ ถ้ารหัสรอบไม่ตรงกับตอนนี้ = ถือว่ายังไม่ได้ติ๊กอะไร
 * (ไม่ได้ลบของเก่าทิ้งทันที — ลบตอนบันทึกครั้งถัดไป จะได้ไม่ต้องเขียนดิสก์ตอนแค่เปิดดู)
 *
 * รอบของ `batch` (ทุกรุ่น) ไม่มีวันขึ้นรอบเอง — คนกดปุ่ม "เริ่มรอบใหม่" เท่านั้น
 * เพราะระบบไม่มีทางรู้ว่าฟาร์มย้ายหมูเข้ารุ่นใหม่ตอนไหน เดาแล้วผิดแน่นอน
 */

/** คีย์ใน localStorage — ขึ้นต้นเหมือนของอื่นในแอปเพื่อไม่ชนกับใคร */
export const STORE_KEY = "swine-sync:farm-checklist";

/** วันจันทร์เป็นวันแรกของสัปดาห์ — คืนเลขสัปดาห์แบบ ISO */
function weekId(d) {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  /* เลื่อนไปวันพฤหัสของสัปดาห์นั้นก่อนค่อยนับ — วิธีมาตรฐานของ ISO week
     ไม่งั้นสัปดาห์คร่อมปีจะได้เลขซ้ำกับสัปดาห์แรกของปีถัดไป */
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const first = new Date(t.getFullYear(), 0, 4);
  const week = 1 + Math.round(((t - first) / 86_400_000 - 3 + ((first.getDay() + 6) % 7)) / 7);
  return `${t.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * รหัสรอบปัจจุบันของความถี่หนึ่ง
 * @param {"daily"|"weekly"|"monthly"|"batch"} freq
 * @param {Date} [now]
 * @param {string} [batchId] รหัสรุ่นที่ผู้ใช้กดเริ่มไว้
 */
export function periodId(freq, now = new Date(), batchId = "") {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  if (freq === "daily") return `${y}-${m}-${d}`;
  if (freq === "weekly") return weekId(now);
  if (freq === "monthly") return `${y}-${m}`;
  return batchId || "batch-1";
}

/**
 * ผลติ๊กที่ยังใช้ได้ของความถี่หนึ่ง — ของที่รอบไม่ตรงถือว่าไม่มี
 * @returns {{period: string, done: string[]}}
 */
export function activeTicks(store, freq, now = new Date()) {
  const slot = store?.[freq];
  const period = periodId(freq, now, store?.batchId);
  if (!slot || slot.period !== period) return { period, done: [] };
  return { period, done: Array.isArray(slot.done) ? slot.done : [] };
}

/** ติ๊ก/เอาติ๊กออกหนึ่งข้อ — คืน store ชุดใหม่ (ไม่แก้ของเดิม) */
export function toggleTick(store, freq, id, now = new Date()) {
  const { period, done } = activeTicks(store, freq, now);
  const next = done.includes(id) ? done.filter((x) => x !== id) : [...done, id];
  return { ...(store ?? {}), [freq]: { period, done: next } };
}

/** เริ่มรอบใหม่ของ "ทุกรุ่น" — ล้างผลติ๊กของ batch อย่างเดียว ไม่ยุ่งกับความถี่อื่น */
export function startNewBatch(store) {
  const n = Number(String(store?.batchId ?? "batch-1").split("-")[1] ?? 1) + 1;
  const batchId = `batch-${n}`;
  return { ...(store ?? {}), batchId, batch: { period: batchId, done: [] } };
}
