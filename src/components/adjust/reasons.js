/**
 * เหตุผลของการปรับจำนวน — แยกไฟล์เพราะไฟล์ที่ export component ห้าม export อย่างอื่นปน
 * (เหตุผลเดียวกับ useSettings.js / useAdjust.js — ไม่งั้น hot reload รีเฟรชทั้งหน้า)
 *
 * แยกตามทิศทางโดยตั้งใจ: เหตุผลของ "ลด" ไม่มีทางทำให้จำนวนเพิ่ม จึงไม่ควรอยู่ปนกัน
 * ผู้ใช้เลือกทิศทางก่อน แล้วเห็นเฉพาะเหตุผลที่เป็นไปได้จริง
 */
export const REASONS = {
  up: [
    { id: "move_in", label: "ย้ายเข้า" },
    { id: "birth", label: "ลูกสุกรเกิดใหม่" },
    { id: "recount_up", label: "นับใหม่ได้มากขึ้น" },
  ],
  down: [
    { id: "move_out", label: "ย้ายออก" },
    { id: "sold", label: "ขายออก" },
    { id: "dead", label: "ตาย" },
    { id: "recount_down", label: "นับใหม่ได้น้อยลง" },
  ],
};

/** ปุ่มลัดจำนวน — ครอบคลุมตั้งแต่ปรับทีละตัวจนถึงย้ายทั้งคอก */
export const QUICK = [1, 5, 10, 50, 100];

export const REASON_LABEL = Object.fromEntries(
  [...REASONS.up, ...REASONS.down].map((r) => [r.id, r.label])
);
