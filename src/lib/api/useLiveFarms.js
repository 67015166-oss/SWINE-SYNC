/**
 * Context ของฟาร์มที่มีเซนเซอร์จริง — แยกจาก LiveFarmsProvider.jsx
 * ตามแบบเดียวกับ lib/records/useRecords.js (ไฟล์ที่ export component
 * ต้อง export แต่ component เท่านั้น ไม่งั้น fast refresh ตอน dev ไม่ทำงาน)
 */
import { createContext, useContext } from "react";

/** ค่าเริ่มต้นเผื่อ component ที่อยู่นอก provider (เช่นในเทสต์) */
export const LiveFarmsContext = createContext({
  farms: [],
  barnsByFarm: {},
  /* แจ้งเตือนดิบจากหลังบ้าน (code + params ยังไม่ได้แต่งเป็นประโยค) */
  alerts: [],
  status: "loading",
  error: null,
  /**
   * สาเหตุที่ยังไม่มีข้อมูลจริง ใช้เลือกข้อความบนป้ายเตือน
   *   "needlogin"   ยังไม่ได้เข้าสู่ระบบ (ทางแก้: กดเข้าสู่ระบบ) — พบบ่อยที่สุด
   *   "noserver"    สำเนานี้ไม่ได้ต่อหลังบ้านเลย (build:host)
   *   "denied"      หลังบ้าน/แหล่งข้อมูลปฏิเสธสิทธิ์
   *   "unreachable" ต่อไม่ติด
   *   "nokey"       (เลิกใช้แล้ว ตั้งแต่ T1.342 — เคยหมายถึงไม่ได้ตั้งกุญแจ PlotNexus)
   */
  errorKind: null,
  refresh: () => {},
});

export const useLiveFarms = () => useContext(LiveFarmsContext);
