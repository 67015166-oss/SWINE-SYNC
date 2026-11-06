/**
 * ชนิด error ที่หน้าจอทั้งแอปใช้ร่วมกัน
 *
 * แยกออกจาก `client.js` (T1.349) เพราะไฟล์นั้นอ่าน `import.meta.env` ของ Vite
 * ตั้งแต่บรรทัดบน ๆ ใครที่อยากใช้แค่ชนิด error จึง `import` เข้ามาทดสอบใน Node ไม่ได้
 * ไฟล์นี้ไม่พึ่งอะไรเลย — `client.js` ยัง re-export ให้ ที่เรียกใช้เดิมไม่ต้องแก้
 */
export class ApiError extends Error {
  /**
   * `details` = ก้อน details ที่หลังบ้านแนบมา (ไม่มีก็ null)
   *
   * มีไว้เพราะบาง error **ไม่ใช่ความล้มเหลว แต่เป็นคำถามกลับ** — เช่นด่านความปลอดภัย
   * ของคำสั่งอุปกรณ์ตอบ 422 พร้อม `needsConfirm: true` ซึ่งหน้าจอต้องเอาไปถามคนกด
   * ถ้าเก็บแต่ข้อความ หน้าจอจะแยก "ยืนยันแล้วทำได้" กับ "ห้ามเด็ดขาด" ไม่ออก (T1.284)
   */
  constructor(status, code, message, details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
