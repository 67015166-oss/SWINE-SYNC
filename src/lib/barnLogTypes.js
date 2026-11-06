/**
 * ประเภทของ "บันทึกข้อมูลผู้ใช้งาน" ในโรงเรือน — ใช้ร่วมกันสองหน้า (T1.269)
 *   หน้ารายละเอียดโรงเรือน (กรอก) · หน้ารายงานส่งเวร (สรุป)
 * ต้องตรงกับ LOG_TYPES · UNITS ใน server/src/barnlog/validate.js (หลังบ้านไม่รับค่าที่ไม่อยู่ในรายการ)
 *
 * affects บอกว่าไปเพิ่มยอดช่องไหนของ "วันนี้" ในหน้าโรงเรือน
 *
 * ★★ ชนิดที่เพิ่มใน T1.366 ตั้ง `affects: null` ทั้งหมดโดยตั้งใจ
 *   ถ้าไปผูกกับช่องสรุปที่มีอยู่ (เช่นให้ "หมูคลอด" ไปเพิ่มยอด "ย้ายเข้า")
 *   ตัวเลขเดิมบนหน้าจอจะเปลี่ยนความหมายเงียบ ๆ โดยไม่มีใครรู้
 *   ชนิดใหม่จึงเป็นบันทึกของตัวเองก่อน ค่อยตัดสินใจทีหลังว่าควรรวมกับอะไร
 */
export const LOG_TYPES = [
  { value: "dead", label: "หมูตาย", unit: "ตัว", affects: "dead", tone: "bad" },
  { value: "sick", label: "หมูป่วย", unit: "ตัว", affects: "sick", tone: "warn" },
  { value: "missing", label: "สุกรขาดหาย", unit: "ตัว", affects: "missing", tone: "warn" },
  { value: "moveIn", label: "ย้ายสุกรเข้า", unit: "ตัว", affects: "in", tone: "info" },
  { value: "moveOut", label: "ย้ายสุกรออก", unit: "ตัว", affects: "out", tone: "info" },
  { value: "feed", label: "ให้อาหาร", unit: "กิโลกรัม", affects: null, tone: "good" },
  { value: "medicine", label: "ให้ยา", unit: "โดส", affects: null, tone: "good" },
  /* ═══ วงจรสุกร (T1.366) ═══ */
  { value: "birth", label: "หมูคลอด", unit: "ตัว", affects: null, tone: "good" },
  { value: "wean", label: "หย่านม", unit: "ตัว", affects: null, tone: "info" },
  { value: "mate", label: "ผสมพันธุ์", unit: "ตัว", affects: null, tone: "info" },
  { value: "weigh", label: "ชั่งน้ำหนัก", unit: "กิโลกรัม", affects: null, tone: "info" },
  /* ═══ ทรัพยากร ═══ */
  { value: "water", label: "ให้น้ำ", unit: "ลิตร", affects: null, tone: "good" },
  { value: "feedStock", label: "อาหารคงเหลือ", unit: "กิโลกรัม", affects: null, tone: "info" },
  { value: "vaccine", label: "ให้วัคซีน", unit: "โดส", affects: null, tone: "good" },
  /* ═══ งานในเล้า — ไม่มีจำนวน เก็บเป็น 1 ครั้ง ═══ */
  { value: "clean", label: "ทำความสะอาด", unit: "ครั้ง", affects: null, tone: "good" },
  { value: "repair", label: "ซ่อมอุปกรณ์", unit: "ครั้ง", affects: null, tone: "info" },
  { value: "check", label: "ตรวจเล้า", unit: "ครั้ง", affects: null, tone: "info" },
  { value: "visitor", label: "คนเข้าเล้า", unit: "ครั้ง", affects: null, tone: "warn" },
  { value: "note", label: "จดบันทึก", unit: "ครั้ง", affects: null, tone: "info" },
];

export const UNITS = ["ตัว", "กิโลกรัม", "โดส", "ลิตร", "ครั้ง"];
