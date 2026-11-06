/**
 * ตัวกลางของการตั้งค่า — แยกจาก SettingsProvider.jsx เพราะไฟล์ที่ export component
 * ห้าม export อย่างอื่นปน ไม่งั้น hot reload ตอน dev จะรีเฟรชทั้งหน้า
 * (เหตุผลเดียวกับที่ lib/theme/ แยก useTheme.js ออกจาก ThemeProvider.jsx)
 */
import { createContext, useContext } from "react";

export const SettingsContext = createContext(null);

/**
 * อ่านการตั้งค่าปัจจุบัน + ฟังก์ชันแก้ค่า
 * @returns {{settings: object, comfort: object, set: Function, setComfort: Function,
 *            toggleCategory: Function, isMuted: Function, passesLevel: Function,
 *            reset: Function, clearAll: Function}}
 */
export function useSettings() {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings ต้องอยู่ภายใน <SettingsProvider>");
  return value;
}
