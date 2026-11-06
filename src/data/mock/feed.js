/**
 * Mock data: อาหาร & น้ำหนัก
 * batch = ชุดสุกรขุนที่เข้าเลี้ยงพร้อมกัน ใช้ติดตาม FCR/ADG
 */
import { shiftDatesIn } from "./asOf.js";


/** ชุดเลี้ยงปัจจุบัน
 * fcr = Feed Conversion Ratio (กินกี่ กก. ต่อน้ำหนักขึ้น 1 กก. — ยิ่งต่ำยิ่งดี, เป้า ≤ 2.60)
 * adgGram = น้ำหนักขึ้นเฉลี่ยต่อวัน (กรัม/วัน — เป้า ≥ 800)
 */
export const batches = shiftDatesIn([
  {
    id: "L2604",
    barnId: "B4",
    startDate: "2026-04-18",
    pigCount: 1024,
    avgWeightKg: 82.4,
    adgGram: 815,
    fcr: 2.52,
  },
  {
    id: "L2605",
    barnId: "B5",
    startDate: "2026-05-22",
    pigCount: 1061,
    avgWeightKg: 61.8,
    adgGram: 792,
    fcr: 2.61,
  },
  {
    id: "L2607",
    barnId: "B6",
    startDate: "2026-07-15",
    pigCount: 247,
    avgWeightKg: 28.3,
    adgGram: 688,
    fcr: 2.38,
  },
], "startDate");

/** ปริมาณอาหารที่ให้รายวัน (กก.) แยกโรงเรือนขุน — 14 วันล่าสุด */
export const feedDaily = shiftDatesIn([
  { date: "2026-07-19", B4: 2255, B5: 1980, B6: 310 },
  { date: "2026-07-20", B4: 2260, B5: 1992, B6: 318 },
  { date: "2026-07-21", B4: 2281, B5: 2005, B6: 325 },
  { date: "2026-07-22", B4: 2274, B5: 2018, B6: 331 },
  { date: "2026-07-23", B4: 2296, B5: 2011, B6: 342 },
  { date: "2026-07-24", B4: 2310, B5: 2034, B6: 350 },
  { date: "2026-07-25", B4: 2305, B5: 2049, B6: 356 },
  { date: "2026-07-26", B4: 2322, B5: 2060, B6: 365 },
  { date: "2026-07-27", B4: 2318, B5: 2072, B6: 371 },
  { date: "2026-07-28", B4: 2340, B5: 2081, B6: 380 },
  { date: "2026-07-29", B4: 2352, B5: 2095, B6: 388 },
  { date: "2026-07-30", B4: 2349, B5: 2104, B6: 394 },
  { date: "2026-07-31", B4: 2361, B5: 2118, B6: 402 },
  { date: "2026-08-01", B4: 2370, B5: 2126, B6: 410 },
]);

/** น้ำหนักเฉลี่ยรายสัปดาห์ของแต่ละ batch (กก.) — ใช้วาดเส้นการเจริญเติบโต */
export const weightWeekly = [
  { week: "สัปดาห์ 1", L2604: 27.5, L2605: 27.1, L2607: 26.8 },
  { week: "สัปดาห์ 3", L2604: 38.2, L2605: 37.6, L2607: 28.3 },
  { week: "สัปดาห์ 5", L2604: 49.8, L2605: 48.5, L2607: null },
  { week: "สัปดาห์ 7", L2604: 61.5, L2605: 61.8, L2607: null },
  { week: "สัปดาห์ 9", L2604: 72.9, L2605: null, L2607: null },
  { week: "สัปดาห์ 11", L2604: 82.4, L2605: null, L2607: null },
];

/** สต็อกอาหารคงเหลือ (กก.) แยกสูตร */
export const feedStock = [
  { formula: "สูตรลูกสุกร", remainingKg: 4200, daysLeft: 9 },
  { formula: "สูตรอนุบาล", remainingKg: 11800, daysLeft: 12 },
  { formula: "สูตรขุน", remainingKg: 38500, daysLeft: 8 },
  { formula: "สูตรแม่พันธุ์", remainingKg: 6900, daysLeft: 14 },
];
