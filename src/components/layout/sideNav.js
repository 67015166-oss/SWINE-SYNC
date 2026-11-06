/**
 * เมนูของแถบด้านซ้าย (SideLayout) — ใช้ร่วมกันทุกหน้าที่ใช้โครงนี้
 * รวมไว้ที่เดียวเพื่อให้เมนูของทุกหน้าตรงกันเสมอ (แก้ที่นี่ที่เดียว)
 *
 * "โรงเรือน" ชี้ไปหน้ารายการโรงเรือน (`/dashboard/farms/:farmId`) เหมือนเมนูบน
 * — สลับฟาร์มได้จากหน้านั้น · "ฟาร์ม" ใช้ end จึงไม่ไฮไลต์ซ้อนกับ "โรงเรือน"
 */
import { BARNS_HOME } from "./topNav.js";

export const SIDE_NAV = [
  { to: "/dashboard", label: "ภาพรวม", icon: "chart", end: true },
  { to: "/dashboard/farms", label: "ฟาร์ม", icon: "pin", end: true },
  { to: BARNS_HOME, label: "โรงเรือน", icon: "home" },
  /* แบบจำลองโรงเรือน — ผังโรงเรือนที่สะท้อนค่าที่วัดได้จริง (T1.260) */
  { to: "/dashboard/twin", label: "แบบจำลองโรงเรือน", icon: "monitor" },
  { to: "/dashboard/pigs", label: "จำนวนสุกร", icon: "pig" },
  { to: "/dashboard/herd", label: "สุขภาพสุกร", icon: "pulse" },
  { to: "/dashboard/shift-report", label: "รายงานส่งเวร", icon: "clock" },
  { to: "/dashboard/finance", label: "รายงาน", icon: "list" },
  /* action = ให้ SideLayout วาดเป็นปุ่ม แล้วเรียกฟังก์ชันแทนการเปลี่ยนหน้า
     (การตั้งค่าเป็นป๊อบอัพ ไม่ใช่หน้า จึงไม่มี URL ให้ลิงก์ไป) */
  { action: "settings", label: "ตั้งค่า", icon: "gear" },
];
