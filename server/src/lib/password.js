/**
 * เก็บและตรวจรหัสผ่านด้วย scrypt ที่มากับ Node เอง — **ไม่เพิ่ม dependency ใหม่**
 *
 * ทำไมไม่ใช้ bcrypt/argon2 ที่คนนิยมกัน: เครือข่ายของ CPF ดักใบรับรอง TLS อยู่
 * npm install จากในออฟฟิศจึงล้มเป็นประจำ (ดู docs/RUNBOOK.md) — และ scrypt
 * เป็นอัลกอริทึมที่ออกแบบมาสำหรับงานนี้โดยเฉพาะ (memory-hard) ไม่ได้ด้อยกว่ากัน
 *
 * รูปแบบที่เก็บลงคอลัมน์ `password_hash`:
 *   scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>
 * เก็บพารามิเตอร์ไว้ในสตริงด้วย เพราะวันหนึ่งจะขึ้นค่า N ให้แรงขึ้นได้
 * โดยที่รหัสผ่านเก่ายังตรวจผ่านตามพารามิเตอร์ของตัวเอง
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

/* N=16384 คือค่าที่ Node แนะนำเป็นพื้น ใช้เวลา ~60ms ต่อครั้งบนเครื่องทั่วไป
   ช้าพอที่การเดารหัสทีละล้านครั้งไม่คุ้ม แต่ไม่ช้าจนหน้าล็อกอินหน่วง
   maxmem ต้องตั้งเอง — ค่าเริ่มต้นของ Node (32MB) ไม่พอสำหรับ N นี้ */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(plain) {
  const salt = randomBytes(16);
  const key = await scrypt(plain, salt, KEY_LEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/**
 * ตรวจรหัสผ่าน — คืน false เสมอเมื่อรูปแบบที่เก็บไว้อ่านไม่ออก ไม่ throw
 * (แถวที่ข้อมูลเพี้ยนต้องล็อกอินไม่ผ่าน ไม่ใช่ทำทั้ง API พัง)
 */
export async function verifyPassword(plain, stored) {
  try {
    const [scheme, n, r, p, salt, key] = String(stored).split("$");
    if (scheme !== "scrypt") return false;
    const expected = Buffer.from(key, "base64");
    const actual = await scrypt(plain, Buffer.from(salt, "base64"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: MAXMEM,
    });
    /* เทียบแบบเวลาคงที่ — เทียบด้วย === จะบอกใบ้ความยาวที่ตรงกันจากเวลาที่ใช้ */
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
