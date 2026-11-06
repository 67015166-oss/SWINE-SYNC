/**
 * เติมที่อยู่ฐานให้พาธของไฟล์ใน `public/`
 *
 * **ทำไมต้องมี** — Vite เติม base ให้เองเฉพาะพาธที่เขียนใน CSS กับ HTML
 * ส่วนพาธที่เป็น "ข้อความธรรมดาในโค้ด JS" มันไม่แตะ พอเอาไปวางในโฟลเดอร์ย่อย
 * อย่าง /p/mew/dashboard/ รูปทุกใบจึงชี้กลับไปรากโดเมนแล้วโหลดไม่ขึ้น
 *
 * ใช้แทนการเขียนพาธตรง ๆ ทุกที่ที่อ้างไฟล์ใน public/ เช่น asset("/barn.png")
 * ตอนรันปกติได้ "/barn.png" · ตอน build ด้วย VITE_BASE ได้ "/p/mew/dashboard/barn.png"
 */
const BASE = import.meta.env.BASE_URL || "/";

export const asset = (path) =>
  BASE.replace(/\/$/, "") + (path.startsWith("/") ? path : "/" + path);
