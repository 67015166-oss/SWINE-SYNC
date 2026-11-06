/**
 * เวลากะของฟาร์ม — ใช้ในหน้ารายงานส่งเวร (T1.268)
 *
 * **ไม่มี import** เทสต์ด้วย node:test ได้ตรง ๆ
 *
 * คิดเป็นเวลาไทยเสมอ (UTC+7 ไม่มีเวลาออมแสง) ไม่ใช่เวลาของเครื่องที่เปิดดู —
 * คนเปิดจากเครื่องที่ตั้งโซนเวลาอื่นต้องเห็นกะดึกเริ่มสองทุ่มเหมือนกันทุกคน
 *
 * ตอนนี้ตรึงไว้สองกะ 07:00–19:00 / 19:00–07:00 (กะที่ฟาร์มสุกรไทยใช้กันมากที่สุด)
 * ถ้าฟาร์มไหนใช้สามกะ แก้ที่ SHIFTS ที่เดียว — ทุกอย่างข้างล่างคิดจากรายการนี้
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** เวลาไทย = UTC + 7 ชั่วโมง */
const TH_OFFSET_MS = 7 * HOUR_MS;

/** เรียงตามชั่วโมงที่เริ่ม — กะสุดท้ายจบตอนกะแรกของวันถัดไปเริ่ม */
export const SHIFTS = [
  { id: "day", label: "กะกลางวัน", startHour: 7 },
  { id: "night", label: "กะดึก", startHour: 19 },
];

/**
 * กะที่ครอบเวลา `t`
 * @param {number} t เวลา (ms)
 * @returns {{id: string, label: string, from: number, to: number}}
 */
export function shiftAt(t) {
  const local = t + TH_OFFSET_MS;
  const dayStart = Math.floor(local / DAY_MS) * DAY_MS;
  /* ต้นกะทั้งหมดของเมื่อวาน วันนี้ และพรุ่งนี้ — กะดึกคร่อมเที่ยงคืนจึงหาเจอเสมอ */
  const starts = [-1, 0, 1].flatMap((d) =>
    SHIFTS.map((s) => ({ shift: s, at: dayStart + d * DAY_MS + s.startHour * HOUR_MS })),
  );
  let current = null;
  let next = null;
  for (const s of starts) {
    if (s.at <= local && (!current || s.at > current.at)) current = s;
  }
  for (const s of starts) {
    if (s.at > current.at && (!next || s.at < next.at)) next = s;
  }
  return {
    id: current.shift.id,
    label: current.shift.label,
    from: current.at - TH_OFFSET_MS,
    to: next.at - TH_OFFSET_MS,
  };
}

/** กะก่อนหน้าของกะนี้ */
export const previousShift = (shift) => shiftAt(shift.from - 1);

/** กะถัดไปของกะนี้ */
export const nextShift = (shift) => shiftAt(shift.to);

/**
 * กะที่เพิ่งจบล่าสุด — หน้ารายงานเปิดมาที่นี่ก่อน เพราะเป็นกะที่ "รอส่งเวร" อยู่
 * (กะที่กำลังเดินอยู่ยังไม่มีอะไรให้ส่ง)
 */
export const lastEndedShift = (now) => previousShift(shiftAt(now));

/** กะนี้จบแล้วหรือยัง */
export const hasEnded = (shift, now) => shift.to <= now;

/** รหัสกะสำหรับเก็บใน URL (?shift=) — ต้นกะเป็นวินาที อ่านกลับด้วย shiftFromKey */
export const shiftKey = (shift) => String(Math.round(shift.from / 1000));

/**
 * อ่านรหัสกะจาก URL กลับเป็นกะ — ค่าเพี้ยนหรือเป็นกะอนาคตคืน null (หน้าจะใช้กะล่าสุดแทน)
 * ใช้ `shiftAt` ครอบอีกชั้น เวลาที่ไม่ตรงต้นกะพอดีจึงยังได้กะที่ถูก
 */
export function shiftFromKey(key, now) {
  const sec = Number(key);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  const shift = shiftAt(sec * 1000);
  return shift.from > now ? null : shift;
}
