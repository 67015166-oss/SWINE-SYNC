/**
 * เปิด/ปิดแถบเมนูซ้าย — **ปิดไว้เป็นค่าตั้งต้นทุกหน้า** (ผู้ใช้สั่ง 2 ก.ย. 2569)
 *
 * *"ฉันอยากให้ทุกหน้ายังไม่แสดง sidebar ซ้าย เพราะฉันอยากทำให้เป็นขีดสามขีด
 * หน้า SWINE SYNC SMART FARM SOLUTION พอกดแล้ว sidebar ซ้ายจะค่อย ๆ แสดงโชว์"*
 *
 * **ไม่เก็บลง localStorage โดยตั้งใจ** — ถ้าจำสถานะไว้ เปิดแอปครั้งหน้าแถบจะกางค้างอยู่
 * ซึ่งขัดกับที่สั่งว่า "ทุกหน้ายังไม่แสดง" และแถบเป็นของที่กดเปิดง่ายมากอยู่แล้ว
 *
 * เก็บ **ปุ่มที่กดเปิด** ไว้ด้วย เพื่อคืนโฟกัสกลับไปที่ปุ่มนั้นตอนปิด —
 * คนที่ใช้แป้นพิมพ์อย่างเดียวจะได้ไม่หลุดไปเริ่มไล่แท็บใหม่จากต้นหน้า
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { SidebarContext } from "./useSidebar.js";

export function SidebarProvider({ children }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  const openSidebar = useCallback((trigger = null) => {
    triggerRef.current = trigger;
    setOpen(true);
  }, []);

  /** ปิดแล้วคืนโฟกัสให้ปุ่มที่กดเปิด (ถ้ายังอยู่ในหน้า) */
  const closeSidebar = useCallback(() => {
    setOpen((was) => {
      if (was) triggerRef.current?.focus?.();
      return false;
    });
  }, []);

  const toggleSidebar = useCallback(
    (trigger = null) => {
      setOpen((was) => {
        if (was) {
          triggerRef.current?.focus?.();
          return false;
        }
        triggerRef.current = trigger;
        return true;
      });
    },
    [],
  );

  const value = useMemo(
    () => ({ open, openSidebar, closeSidebar, toggleSidebar }),
    [open, openSidebar, closeSidebar, toggleSidebar],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}
