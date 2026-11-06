/**
 * "เลื่อนหน้าลง = แถบลอยหลบลงไป · เลื่อนขึ้น = กลับมา" (ผู้ใช้สั่ง 16 ก.ย. 2569)
 *
 * แถบอยู่กลางล่างจอ จึงบังเนื้อหาแถวล่างสุดตลอดเวลา — เวลาไล่อ่านตารางหรือกราฟยาว ๆ
 * แถบจะขวางอยู่ตรงนั้นพอดี ซ่อนตอนกำลังอ่านลงไป แล้วคืนมาทันทีที่เลื่อนกลับขึ้น
 *
 * **ทั้งแอปเลื่อนที่ตัวหน้าต่าง** (`.app-shell` ใช้ min-height ไม่ได้ครอบ overflow ไว้)
 * จึงฟังที่ window ได้ตรง ๆ ถ้าวันหนึ่งย้ายการเลื่อนไปไว้ในกล่องด้านใน ต้องแก้ที่นี่ด้วย
 */
import { useEffect, useRef, useState } from "react";

/** เลื่อนน้อยกว่านี้ถือว่าไม่ได้ตั้งใจ — กันแถบกระพริบตอนขยับทีละนิดหรือหน้าขยับเอง */
const STEP = 8;

/** ยังอยู่ใกล้หัวหน้าเท่านี้ ให้เห็นแถบเสมอ ไม่ว่าจะเลื่อนทางไหน */
const TOP = 80;

/**
 * ตัดสินจากตำแหน่งเดิม→ใหม่ ว่าจะให้แถบซ่อนหรือโผล่ — **แยกออกมาเป็นฟังก์ชันล้วนเพื่อทดสอบได้**
 *
 * @returns `null` = ยังไม่ถึงเกณฑ์ อย่าเพิ่งทำอะไร (และ **อย่าจำตำแหน่งใหม่**)
 *          หรือ `{ hidden }` = ตัดสินแล้ว ให้จำตำแหน่งใหม่ไว้เทียบรอบหน้า
 */
export function scrollVerdict(y, lastY) {
  const dy = y - lastY;
  if (Math.abs(dy) < STEP) return null;
  return { hidden: y > TOP && dy > 0 };
}

export function useScrollHide() {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;

    const onScroll = () => {
      const y = Math.max(0, window.scrollY);
      const verdict = scrollVerdict(y, lastY.current);

      /* ยังไม่ถึงเกณฑ์ = **ห้ามอัปเดต lastY** ต้องปล่อยให้ระยะสะสมไปเรื่อย ๆ
         ไม่งั้นคนที่เลื่อนช้า ๆ ทีละ 2–3 px จะไม่มีวันครบเกณฑ์ แถบก็ไม่ขยับสักที */
      if (!verdict) return;

      lastY.current = y;
      /* ค่าเดิมซ้ำ = React ไม่ render ใหม่ ตัวจับจึงเบาพอที่จะทำงานทุกครั้งที่หน้าเลื่อน */
      setHidden(verdict.hidden);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return hidden;
}
