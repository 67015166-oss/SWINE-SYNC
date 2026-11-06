/**
 * แปลรายการของช่องค้นหา — แยกจาก search.js เพราะไฟล์นั้นดึงข้อมูลตัวอย่างที่พึ่ง import.meta.env ของ Vite
 * ไฟล์นี้ไม่มี import เลย เทสต์จึงเรียกได้ตรง ๆ (T2.1 · 18 ก.ย. 2569)
 */
/** ค่าตั้งต้นของตัวแปลตอนไม่ได้ส่ง t() มา — เติม {ตัวแปร} ลงข้อความไทยตรง ๆ */
export const thaiOnly = (text, vars) =>
  vars ? String(text).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "")) : text;

/**
 * แปลรายการค้นหาเป็นภาษาที่ผู้ใช้เลือก **ก่อน** เทียบคำค้น (T2.1)
 * เทียบกับตัวหนังสือที่ผู้ใช้เห็นจริงเท่านั้น (กติกาเดียวกับ hit() ใน search.js) — ดูหน้าภาษาอังกฤษอยู่
 * ก็ต้องพิมพ์ "weather" เจอ ไม่ใช่ต้องพิมพ์ "สภาพอากาศ" ที่ไม่ได้อยู่บนจอ
 */
export const translateItem = (tr) => (item) => ({
  ...item,
  label: tr(item.label),
  meta: Array.isArray(item.metaParts)
    ? item.metaParts
      .filter(Boolean)
      .map((part) => (typeof part === "string" ? tr(part) : tr(part.key, part.vars)))
      .join(" · ")
    : item.meta && tr(item.meta),
  unit: item.unit && tr(item.unit),
});
