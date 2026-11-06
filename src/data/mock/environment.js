/**
 * Mock data: สภาพแวดล้อมโรงเรือน (อุณหภูมิ/ความชื้น)
 * ค่าที่เหมาะสม: อุณหภูมิ 22–28°C (ลูกสุกร 28–32), ความชื้น 60–80%
 */
import { shiftDatesIn } from "./asOf.js";


/** ค่าล่าสุดจากเซนเซอร์แต่ละโรงเรือน
 * status: "good" | "warning" | "critical" — คำนวณจากช่วงที่เหมาะสมของ stage นั้น
 */
export const sensorNow = shiftDatesIn([
  { barnId: "B1", tempC: 26.4, humidity: 71, status: "good", updatedAt: "2026-08-01T14:30:00" },
  { barnId: "B2", tempC: 30.1, humidity: 68, status: "good", updatedAt: "2026-08-01T14:30:00" },
  { barnId: "B3", tempC: 29.6, humidity: 83, status: "warning", updatedAt: "2026-08-01T14:30:00" },
  { barnId: "B4", tempC: 27.2, humidity: 74, status: "good", updatedAt: "2026-08-01T14:30:00" },
  { barnId: "B5", tempC: 31.8, humidity: 79, status: "critical", updatedAt: "2026-08-01T14:30:00" },
  { barnId: "B6", tempC: 26.9, humidity: 72, status: "good", updatedAt: "2026-08-01T14:30:00" },
], "updatedAt");

/** อุณหภูมิย้อนหลัง 24 ชม. (บันทึกทุก 2 ชม.) ของโรงเรือนขุน */
export const tempHistory = [
  { time: "16:00", B4: 28.9, B5: 30.2, B6: 28.4 },
  { time: "18:00", B4: 28.1, B5: 29.6, B6: 27.8 },
  { time: "20:00", B4: 27.0, B5: 28.8, B6: 26.9 },
  { time: "22:00", B4: 26.2, B5: 28.1, B6: 26.1 },
  { time: "00:00", B4: 25.6, B5: 27.5, B6: 25.4 },
  { time: "02:00", B4: 25.1, B5: 27.0, B6: 24.9 },
  { time: "04:00", B4: 24.8, B5: 26.8, B6: 24.6 },
  { time: "06:00", B4: 25.0, B5: 27.2, B6: 24.8 },
  { time: "08:00", B4: 25.9, B5: 28.4, B6: 25.7 },
  { time: "10:00", B4: 26.8, B5: 29.9, B6: 26.5 },
  { time: "12:00", B4: 27.5, B5: 31.1, B6: 27.1 },
  { time: "14:00", B4: 27.2, B5: 31.8, B6: 26.9 },
];

/** การแจ้งเตือนล่าสุด (ใหม่→เก่า) */
export const alerts = shiftDatesIn([
  {
    id: "A-104",
    time: "2026-08-01T12:40:00",
    barnId: "B5",
    severity: "critical",
    message: "อุณหภูมิสูงเกิน 31°C ต่อเนื่อง 2 ชม. — ตรวจพัดลม/ระบบ EVAP",
  },
  {
    id: "A-103",
    time: "2026-08-01T09:15:00",
    barnId: "B3",
    severity: "warning",
    message: "ความชื้นสูงกว่า 80% — เพิ่มการระบายอากาศ",
  },
  {
    id: "A-102",
    time: "2026-07-31T22:05:00",
    barnId: "B5",
    severity: "warning",
    message: "อุณหภูมิเริ่มสูงกว่าช่วงเหมาะสม",
  },
  {
    id: "A-101",
    time: "2026-07-30T06:50:00",
    barnId: "B2",
    severity: "good",
    message: "ระบบกกลูกสุกรกลับมาทำงานปกติ",
  },
], "time");
