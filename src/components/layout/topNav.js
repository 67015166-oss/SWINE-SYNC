/**
 * เมนูหลักของแดชบอร์ด — ใช้ที่แถบเมนูบน (AppLayout)
 *
 * รายการเมนูไม่ได้ตายตัวอีกแล้ว: ธีมบทบาทที่ผู้ใช้เลือกเป็นตัวบอกว่าจะเอาเมนูไหนบ้าง
 * (ดู src/lib/theme/themes.js — แก้ชื่อ/ไอคอน/ปลายทางของแต่ละส่วนงานที่ SECTIONS ที่นั่น)
 *
 * เมนู "ภาพรวม" ถูกเติมเป็นอันแรกเสมอทุกธีม เพราะเป็นทั้งหน้าแรกและปุ่มพับ/คลี่เมนู
 */
import { SECTIONS, BARNS_HOME } from "../../lib/theme/themes.js";

export { BARNS_HOME };

export const OVERVIEW_ITEM = {
  to: "/dashboard",
  label: "ภาพรวม",
  icon: "chart",
  end: true,
};

/**
 * แปลง key ของส่วนงานเป็นรายการเมนูพร้อมใช้
 * @param {string[]} keys key จาก SECTIONS (ธีมบทบาทเป็นคนกำหนดลำดับ)
 */
export function buildTopNav(keys = []) {
  const items = keys
    .map((key) => SECTIONS[key])
    /* ส่วนงานที่ไม่มี URL ตายตัว (อุณหภูมิ ต้องเลือกโรงเรือนก่อน) ขึ้นเมนูบนไม่ได้ */
    .filter((s) => s?.nav && s.to)
    .map((s) => ({ to: s.to, label: s.label, icon: s.icon, end: s.end, match: s.match }));
  return [OVERVIEW_ITEM, ...items];
}
