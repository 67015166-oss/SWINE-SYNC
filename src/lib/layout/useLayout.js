/**
 * ตัวกลางของ "เลย์เอาต์ที่ผู้ใช้จัดเอง" — แยกจาก LayoutProvider.jsx
 * เพราะไฟล์ที่ export component ห้าม export อย่างอื่นปน (ไม่งั้น hot reload รีเฟรชทั้งหน้า)
 */
import { createContext, useContext } from "react";

export const LayoutContext = createContext(null);

/** อ่าน/แก้เลย์เอาต์ของหน้าปัจจุบัน (ดูรายละเอียดที่ LayoutProvider.jsx) */
export function useLayout() {
  const value = useContext(LayoutContext);
  if (!value) throw new Error("useLayout ต้องอยู่ภายใน <LayoutProvider>");
  return value;
}
