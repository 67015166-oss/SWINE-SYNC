/**
 * บริบทของแถบเมนูซ้าย — ประกาศไว้ไฟล์เดียวกับ hook ตามแบบเดียวกับ useSettings/useTheme
 * (ถ้าประกาศไว้ในไฟล์ Provider จะทำให้ hot reload ของ Vite ทำงานไม่ครบ)
 */
import { createContext, useContext } from "react";

export const SidebarContext = createContext(null);

/**
 * สถานะแถบเมนูซ้าย — { open, openSidebar, closeSidebar, toggleSidebar }
 *
 * นอก Provider คืนค่าที่ "ปิดอยู่และกดไม่ได้" แทนที่จะ throw
 * เพราะหน้าเข้าสู่ระบบกับหน้า 404 อยู่นอกแดชบอร์ดและไม่มีแถบเมนู
 */
const CLOSED = {
  open: false,
  openSidebar: () => {},
  closeSidebar: () => {},
  toggleSidebar: () => {},
};

export const useSidebar = () => useContext(SidebarContext) ?? CLOSED;
