/**
 * Mock data: ฝูงสุกร/ประชากร
 * โครงสร้างนี้คือ "สัญญา" ของข้อมูล — ภายหลังเมื่อต่อข้อมูลจริง
 * ให้แปลงข้อมูลจริงมาเป็นรูปแบบเดียวกันนี้ แล้วหน้าจอไม่ต้องแก้
 *
 * วันที่ทุกตัวส่งผ่าน asOf.js ให้เลื่อนตามวันปัจจุบัน — อ่านเหตุผลที่ไฟล์นั้น
 */
import { shiftDate, shiftDatesIn, shiftMonthsIn } from "./asOf.js";

/** โรงเรือนทั้งหมดในฟาร์ม — barnId ใช้อ้างอิงข้ามไฟล์ (feed, environment) */
export const barns = [
  { id: "B1", name: "โรงเรือน 1", stage: "แม่พันธุ์", capacity: 320, count: 296 },
  { id: "B2", name: "โรงเรือน 2", stage: "คลอด/ลูกสุกร", capacity: 480, count: 452 },
  { id: "B3", name: "โรงเรือน 3", stage: "อนุบาล", capacity: 900, count: 838 },
  { id: "B4", name: "โรงเรือน 4", stage: "ขุน", capacity: 1100, count: 1024 },
  { id: "B5", name: "โรงเรือน 5", stage: "ขุน", capacity: 1100, count: 1061 },
  { id: "B6", name: "โรงเรือน 6", stage: "ขุน", capacity: 1100, count: 247 },
];

/** สรุปประชากรตามช่วงวัย (ตัว) */
export const herdSummary = {
  updatedAt: shiftDate("2026-08-01"),
  total: 3918,
  sows: 296, // แม่พันธุ์
  boars: 8, // พ่อพันธุ์
  piglets: 452, // ลูกสุกรดูดนม
  nursery: 838, // อนุบาล
  fatteners: 2324, // ขุน
};

/** จำนวนสุกรรวมย้อนหลังรายเดือน (ใช้วาดเส้นแนวโน้ม) */
export const populationTrend = shiftMonthsIn([
  { month: "2026-02", total: 3610 },
  { month: "2026-03", total: 3705 },
  { month: "2026-04", total: 3782 },
  { month: "2026-05", total: 3690 },
  { month: "2026-06", total: 3844 },
  { month: "2026-07", total: 3918 },
]);

/** เหตุการณ์สูญเสียล่าสุด (เรียงใหม่→เก่า) */
export const mortalityEvents = shiftDatesIn([
  { date: "2026-07-30", barnId: "B3", count: 3, cause: "ท้องเสีย" },
  { date: "2026-07-28", barnId: "B4", count: 1, cause: "ไม่ทราบสาเหตุ" },
  { date: "2026-07-25", barnId: "B2", count: 4, cause: "ถูกทับ" },
  { date: "2026-07-21", barnId: "B3", count: 2, cause: "ท้องเสีย" },
  { date: "2026-07-18", barnId: "B5", count: 1, cause: "ระบบหายใจ" },
]);

/** อัตราตายรายเดือน (%) เทียบเป้าหมาย */
export const mortalityRate = shiftMonthsIn([
  { month: "2026-02", rate: 0.42, target: 0.5 },
  { month: "2026-03", rate: 0.38, target: 0.5 },
  { month: "2026-04", rate: 0.55, target: 0.5 },
  { month: "2026-05", rate: 0.61, target: 0.5 },
  { month: "2026-06", rate: 0.35, target: 0.5 },
  { month: "2026-07", rate: 0.28, target: 0.5 },
]);
