/**
 * ตัวกลางของธีม — แยกออกจาก ThemeProvider.jsx เพราะไฟล์ที่ export component
 * ห้าม export อย่างอื่นปนด้วย ไม่งั้น hot reload ตอน dev จะรีเฟรชทั้งหน้าแทนที่จะเปลี่ยนเฉพาะส่วน
 */
import { createContext, useContext } from "react";

export const ThemeContext = createContext(null);

/** อ่านธีมที่ใช้อยู่ + ฟังก์ชันเปลี่ยนธีม (ดูรายละเอียดที่ ThemeProvider.jsx) */
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme ต้องอยู่ภายใน <ThemeProvider>");
  return value;
}
