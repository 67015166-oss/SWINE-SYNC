/**
 * ตรวจลายเซ็นของคำขอที่ LINE ยิงเข้ามา (T1.276)
 *
 * **แยกไฟล์ไว้โดยตั้งใจ** — ไฟล์นี้ต้องไม่ import อะไรนอกจากของที่มากับ Node
 * เพื่อให้ชุดทดสอบที่รากโปรเจกต์เรียกใช้ได้โดยไม่ต้องติดตั้ง express/pg ของฝั่งเซิร์ฟเวอร์
 *
 * ลายเซ็น = base64( HMAC-SHA256( เนื้อคำขอดิบ, Channel secret ) )
 * ต้องใช้ "เนื้อดิบ" เท่านั้น ห้ามเอา JSON ที่ parse แล้วมาแปลงกลับ (ลำดับคีย์/ช่องว่างเปลี่ยน)
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySignature(rawBody, signature, channelSecret) {
  if (!channelSecret || !signature || !rawBody) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBody).digest();
  let got;
  try {
    got = Buffer.from(String(signature), "base64");
  } catch {
    return false;
  }
  /* ความยาวต่างกัน timingSafeEqual จะโยน error — เช็กก่อน (ความยาวไม่ใช่ความลับ)
     ที่เหลือเทียบด้วย timingSafeEqual ไม่ใช่ === เพราะการเทียบสตริงหยุดทันทีที่เจอตัวต่าง
     เวลาที่ใช้จึงบอกใบ้ว่าเดาถูกไปกี่ตัว */
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}
