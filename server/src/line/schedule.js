/**
 * ตัวตัดสินใจของตัวส่ง LINE — ฟังก์ชันล้วน ไม่แตะฐานข้อมูลและไม่ดูนาฬิกาเอง (T1.275)
 * เวลาปัจจุบันต้องส่งเข้ามาเสมอ เพื่อให้เทสต์ย้อนเวลาได้โดยไม่ต้องแก้นาฬิกาเครื่อง
 */

/** วันที่แบบ YYYY-MM-DD ตามเวลาไทย — ใช้เป็นกุญแจกันส่งซ้ำวันละครั้ง */
export function bangkokDateKey(at) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(at);
}

/** นาทีจากเที่ยงคืนตามเวลาไทย */
export function bangkokMinutes(at) {
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(at).split(":");
  return Number(h) * 60 + Number(m);
}

/** "07:30" → 450 · รูปแบบผิดให้คืน null แล้วให้ผู้เรียกใช้ค่าตั้งต้นแทน */
export function parseTimeOfDay(text) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(text ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * ถึงเวลาส่งสรุปประจำวันหรือยัง
 *
 * **ต้องส่งช้ากว่าเวลาที่ตั้งไว้ได้** เพราะเครื่องอาจหลับหรือคอนเทนเนอร์เพิ่งขึ้น
 * (ข้อมูลกลางคืนหายเป็นเรื่องที่เจอจริงในโปรเจกต์นี้ — ดู T1.263)
 * แต่ถ้าเลยมานานเกิน `graceMinutes` ถือว่าข้ามวันนั้นไป ดีกว่าส่งสรุปเมื่อวานตอนบ่าย
 *
 * @param {object} o
 * @param {Date} o.now
 * @param {number} o.sendAtMinutes เวลาที่ตั้งไว้ (นาทีจากเที่ยงคืน เวลาไทย)
 * @param {string|null} o.lastSentDateKey วันที่ที่ส่งไปแล้วล่าสุด (YYYY-MM-DD เวลาไทย)
 * @param {number} [o.graceMinutes]
 */
export function shouldSendDaily({ now, sendAtMinutes, lastSentDateKey, graceMinutes = 180 }) {
  const today = bangkokDateKey(now);
  if (lastSentDateKey === today) return false;
  const minutes = bangkokMinutes(now);
  return minutes >= sendAtMinutes && minutes <= sendAtMinutes + graceMinutes;
}

/**
 * ระดับที่ส่งเข้าไลน์ตามค่าตั้งต้น
 *
 * **เดิมตั้งไว้ว่า "เฉพาะวิกฤต" แต่ของจริงไม่เคยมีเหตุระดับวิกฤตเลยสักครั้ง** (ตรวจ 24 ก.ย. 2569:
 * 221 เหตุที่ผ่านมาเป็น serious 177 · warning 44 · critical 0) แจ้งเตือนจึงไม่เคยถูกส่งออกไปเลย
 * ผู้ใช้สั่ง 24 ก.ย. 2569 ว่า "มีแจ้งเตือนให้ส่งเข้าไลน์อัตโนมัติ" จึงส่งทุกระดับที่ขึ้นบนแดชบอร์ด
 * ตัวที่กันความถี่คือ `withinCooldown` ไม่ใช่การตัดระดับทิ้ง — เปลี่ยนได้ที่ `LINE_ALERT_LEVELS`
 */
export const DEFAULT_LEVELS = ["critical", "serious", "warning"];

export const levelsFromEnv = (raw) =>
  String(raw ?? "").trim()
    ? String(raw).split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_LEVELS;

/**
 * เคยเตือนเรื่องเดียวกันไปเมื่อเร็ว ๆ นี้หรือยัง
 *
 * **จำเป็นมากกับเหตุที่เกิดซ้ำ ๆ** เช่น `sensor_silent` เกิด 36 ครั้งใน 7 วัน (เครื่องหลับ)
 * ถ้าเตือนทุกครั้งจะได้ข้อความวันละ 5–8 ข้อความ ซึ่งทั้งเปลืองโควตาและทำให้คนเลิกอ่าน
 * นับเป็นคู่ (โรงเรือน + รหัสเหตุ) ไม่ใช่รายใบ — เหตุเดิมที่เปิด-ปิด-เปิดใหม่ถือเป็นเรื่องเดียวกัน
 *
 * **ระดับวิกฤตไม่เข้าช่วงพัก** (ดู `shouldCooldown`) เรื่องด่วนต้องถึงมือเสมอ
 * ต่อให้เพิ่งเตือนเรื่องเดียวกันไปเมื่อชั่วโมงที่แล้ว
 */
export function withinCooldown(lastSentAt, now, hours) {
  if (!lastSentAt) return false;
  return (now.getTime() - new Date(lastSentAt).getTime()) / 3600000 < hours;
}

/** เหตุใบนี้ต้องผ่านช่วงพักไหม — วิกฤตผ่านตลอด ที่เหลือโดนกันความถี่ */
export const shouldCooldown = (alert) => alert.level !== "critical";

/**
 * เหตุที่ควรส่งเข้าไลน์รอบนี้
 *
 * ไม่ส่งของเก่า — เหตุที่เปิดค้างมาก่อนหน้านี้นานแล้วไม่ต้องตามไปเตือนย้อนหลัง
 * (เช่น คอนเทนเนอร์เพิ่งขึ้นแล้วเจอเหตุค้างจากเมื่อวาน)
 *
 * @param {object[]} alerts เหตุที่ยังไม่ปิด พร้อมฟิลด์ level · opened_at
 * @param {Set<string>} notifiedIds id ที่เคยส่งไปแล้ว
 * @param {Date} now
 * @param {number} [maxAgeMinutes]
 * @param {string[]} [levels] ระดับที่ยอมส่ง
 */
export function alertsToSend(alerts, notifiedIds, now, maxAgeMinutes = 60, levels = DEFAULT_LEVELS) {
  return alerts.filter((a) => {
    if (!levels.includes(a.level)) return false;
    if (notifiedIds.has(a.id)) return false;
    const ageMin = (now.getTime() - new Date(a.opened_at).getTime()) / 60000;
    return ageMin <= maxAgeMinutes;
  });
}

/**
 * ยังส่งได้อีกไหมในวันนี้ — กันบัคที่ยิงรัว ๆ จนโควตาเดือนหมดในชั่วโมงเดียว
 * นับ "จำนวนครั้งที่ส่ง" ไม่ใช่จำนวนเหตุ เพราะหลายเหตุรวมส่งครั้งเดียวได้
 */
export const canSendMore = (sentToday, maxPerDay) => sentToday < maxPerDay;
