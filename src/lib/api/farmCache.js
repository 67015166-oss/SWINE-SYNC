/**
 * จำฟาร์มจริงที่เคยโหลดได้ไว้ในเครื่อง (T1.314)
 *
 * ═══ ทำไมต้องมี ═══
 * เดิมพอต่อหลังบ้านไม่ได้ **ฟาร์มจริงหายไปจากหน้าจอทั้งใบ** เหลือแต่ฟาร์มตัวอย่าง
 * ซึ่งคนอ่านตีความว่า "ไม่มีฟาร์มนี้ในระบบ" — ผิดและน่าตกใจกว่าความจริงมาก
 * ความจริงคือ "ฟาร์มยังอยู่ แต่ตอนนี้เราติดต่อไม่ได้" ซึ่งเป็นคนละเรื่องกันสิ้นเชิง
 *
 * ═══ ★ เก็บ "คำตอบดิบจากหลังบ้าน" ไม่ใช่ค่าที่แปลงแล้ว ═══
 * สำคัญมาก เพราะคำตอบดิบมี **เวลาที่วัด** ติดมาด้วย
 * พอเอามาแปลงใหม่ตอนออฟไลน์ ตัวแปลงจะเห็นว่าค่าเก่าเกิน 15 นาที
 * แล้ว **ล้างค่าทิ้งเป็นขีดกลางและตั้งสถานะเป็นออฟไลน์ให้เอง** (ดู `toBarn`)
 *
 * ผลคือได้สิ่งที่ต้องการพอดี: **โครงของฟาร์มยังอยู่ · ตัวเลขไม่ขึ้น**
 * ถ้าเก็บค่าที่แปลงแล้ว เราจะต้องไปไล่ล้างค่าเองทีละช่อง และวันหนึ่งจะลืมช่องใดช่องหนึ่ง
 * กลายเป็นเอาค่าเก่ามาโชว์เป็นค่าปัจจุบัน ซึ่งคือสิ่งที่ไล่แก้กันมาทั้งสัปดาห์
 *
 * ═══ ขอบเขต ═══
 * เก็บในเครื่องของผู้ใช้เท่านั้น · ใช้เฉพาะตอนล็อกอินอยู่แล้วแต่ต่อหลังบ้านไม่ได้
 * ถ้าออกจากระบบ จะไม่หยิบของในนี้มาแสดง
 */

const KEY = "swine-sync:farm-cache";

/** ขึ้นเลขนี้เมื่อรูปของสิ่งที่เก็บเปลี่ยน — ของรุ่นเก่าจะถูกทิ้งแทนที่จะแปลงพัง */
const VERSION = 1;

/** เก่ากว่านี้ไม่ใช้แล้ว — ฟาร์มอาจถูกลบหรือเปลี่ยนชื่อไปนานแล้ว */
export const MAX_AGE_DAYS = 14;

export const isFresh = (capturedAt, now = Date.now(), maxDays = MAX_AGE_DAYS) => {
  const t = new Date(capturedAt ?? 0).getTime();
  if (!Number.isFinite(t) || t === 0) return false;
  return now - t <= maxDays * 24 * 60 * 60 * 1000;
};

/**
 * เก็บคำตอบดิบของรอบที่โหลดสำเร็จ
 * @param {{farms: Array, lists: Array, powerByBarn: object, alerts: Array|null}} raw
 */
export function saveFarmCache(raw, now = new Date()) {
  try {
    if (!raw?.farms?.length) return false;
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: VERSION, capturedAt: now.toISOString(), ...raw }),
    );
    return true;
  } catch {
    /* โหมดส่วนตัว/พื้นที่เต็ม — ไม่ใช่เรื่องคอขาดบาดตาย ข้ามไปเงียบ ๆ */
    return false;
  }
}

/**
 * อ่านของที่จำไว้ — คืน null ถ้าไม่มี รุ่นไม่ตรง หรือเก่าเกินไป
 * @returns {{capturedAt: string, farms: Array, lists: Array, powerByBarn: object, alerts: Array|null}|null}
 */
export function readFarmCache(now = Date.now()) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!raw || raw.v !== VERSION || !Array.isArray(raw.farms) || raw.farms.length === 0) return null;
    if (!isFresh(raw.capturedAt, now)) return null;
    return raw;
  } catch {
    return null;
  }
}

/** ลืมของที่จำไว้ — ใช้ตอนออกจากระบบ */
export function clearFarmCache() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* ไม่เป็นไร */ }
}
