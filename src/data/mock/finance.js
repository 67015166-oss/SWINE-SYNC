/**
 * Mock data: การเงิน/ต้นทุน (หน่วย: บาท)
 * หมวดต้นทุน 5 หมวดนี้ผูกสีถาวรใน chartTheme.js (COST_COLORS) — ห้ามเพิ่มหมวดโดยไม่ผูกสี
 */
import { shiftMonth, shiftMonthsIn } from "./asOf.js";


/** ต้นทุนรายเดือนแยกหมวด */
export const monthlyCost = shiftMonthsIn([
  { month: "2026-02", feed: 1620000, medicine: 118000, labor: 265000, utility: 92000, other: 45000 },
  { month: "2026-03", feed: 1685000, medicine: 104000, labor: 265000, utility: 98000, other: 52000 },
  { month: "2026-04", feed: 1721000, medicine: 142000, labor: 278000, utility: 109000, other: 47000 },
  { month: "2026-05", feed: 1668000, medicine: 156000, labor: 278000, utility: 118000, other: 61000 },
  { month: "2026-06", feed: 1754000, medicine: 97000, labor: 278000, utility: 121000, other: 44000 },
  { month: "2026-07", feed: 1802000, medicine: 97000, labor: 291000, utility: 116000, other: 49000 },
]);

/** รายรับจากการขายรายเดือน */
export const monthlyRevenue = shiftMonthsIn([
  { month: "2026-02", amount: 2610000, pigsSold: 372 },
  { month: "2026-03", amount: 2480000, pigsSold: 351 },
  { month: "2026-04", amount: 2895000, pigsSold: 404 },
  { month: "2026-05", amount: 3120000, pigsSold: 428 },
  { month: "2026-06", amount: 2740000, pigsSold: 379 },
  { month: "2026-07", amount: 3055000, pigsSold: 415 },
]);

/** ราคาขายหน้าฟาร์มเฉลี่ย (บาท/กก.) */
export const farmGatePrice = shiftMonthsIn([
  { month: "2026-02", price: 68.5 },
  { month: "2026-03", price: 66.0 },
  { month: "2026-04", price: 70.2 },
  { month: "2026-05", price: 72.8 },
  { month: "2026-06", price: 71.5 },
  { month: "2026-07", price: 73.0 },
]);

/** ตัวเลขสรุปเดือนล่าสุด */
export const financeSummary = {
  month: shiftMonth("2026-07"),
  totalCost: 2355000,
  totalRevenue: 3055000,
  profit: 700000,
  costPerPigSold: 5675, // ต้นทุนเฉลี่ยต่อตัวที่ขาย
  breakEvenPriceKg: 62.4, // ราคาคุ้มทุน (บาท/กก.)
};
