/**
 * กุญแจประจำกล่อง — ใช้ให้เครื่องคุยกับเครื่อง ไม่ใช่ให้คนล็อกอิน (T1.347)
 *
 * ═══ ★ ทำไมไม่ใช้ระบบบัญชีผู้ใช้เดิม ═══
 * ระบบเดิมเป็น ชื่อผู้ใช้ + รหัสผ่าน + เซสชันที่หมดอายุ ซึ่งออกแบบมาให้คนนั่งกรอก
 * กล่องของทีมอื่นเป็นเครื่องที่ยิงข้อมูลเข้ามาเองตลอดเวลา ต้องการของที่
 *   - ไม่หมดอายุเอง (ไม่งั้นข้อมูลหยุดไหลตอนตีสามโดยไม่มีใครรู้)
 *   - เพิกถอนได้ทีละใบ โดยไม่กระทบกล่องอื่น
 *   - ไม่ต้องเก็บ cookie หรือ state ฝั่งผู้ส่ง
 *
 * ═══ รูปของกุญแจ ═══
 *   `box_<code>_<สุ่ม 32 ไบต์>`
 * ขึ้นต้นด้วยชื่อกล่องเพื่อให้ **ดูด้วยตาก็รู้ว่าใบไหนของใคร** เวลาไปโผล่ในล็อกหรือแชท
 * (ส่วนที่สุ่มยาวพอจนเดาไม่ได้ ชื่อข้างหน้าไม่ได้ทำให้อ่อนลง)
 *
 * ═══ ★★ เก็บแฮชเท่านั้น ═══
 * ตัวจริงโชว์ครั้งเดียวตอนออกให้ แล้วไม่มีใครอ่านย้อนได้อีก รวมถึงเจ้าของตู้เอง
 * ถ้าเก็บตัวจริงไว้ ใครอ่านฐานได้ก็สวมรอยเป็นกล่องนั้นได้ทันที — หายแล้วออกใบใหม่
 */
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";

/** ขึ้นต้นแบบนี้เสมอ — ใช้คัดทิ้งเร็ว ๆ ก่อนไปแตะฐานข้อมูล */
const PREFIX = "box_";

/** 32 ไบต์ = 256 บิต เดาไม่ได้ในทางปฏิบัติ */
const SECRET_BYTES = 32;

/**
 * ออกกุญแจใบใหม่ให้กล่องหนึ่งตัว
 *
 * @param {string} code ชื่อกล่อง เช่น "jew"
 * @returns {string} กุญแจตัวจริง — **โชว์ครั้งเดียว** แล้วเก็บแต่แฮช
 */
export function mintBoxKey(code) {
  const safe = String(code).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!safe) throw new Error("ชื่อกล่องต้องมีตัวอักษรหรือตัวเลขอย่างน้อยหนึ่งตัว");
  return `${PREFIX}${safe}_${randomBytes(SECRET_BYTES).toString("base64url")}`;
}

/**
 * แฮชกุญแจเพื่อเก็บลงฐาน
 *
 * ★ ใช้ SHA-256 ธรรมดา **ไม่ใช่ scrypt แบบรหัสผ่านคน** โดยตั้งใจ
 *   - กุญแจสุ่ม 256 บิต ไม่มีใครเดาด้วยพจนานุกรมได้ จึงไม่ต้องการตัวถ่วงเวลา
 *   - ตู้กลางต้องตรวจกุญแจ **ทุกครั้งที่มีข้อมูลเข้า** ซึ่งอาจถี่ระดับวินาที
 *     scrypt ที่ตั้งใจให้ช้า (64 MB ต่อครั้ง) จะกลายเป็นคอขวดของทั้งระบบ
 *   รหัสผ่านคนยังต้องใช้ scrypt เหมือนเดิม เพราะคนตั้งรหัสที่เดาได้
 */
export const hashBoxKey = (key) => createHash("sha256").update(String(key)).digest("hex");

/** เทียบแฮชแบบเวลาคงที่ — กันการเดาทีละตัวอักษรจากเวลาที่ใช้ตอบ */
export function boxKeyMatches(key, storedHash) {
  try {
    const a = Buffer.from(hashBoxKey(key), "hex");
    const b = Buffer.from(String(storedHash), "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    /* แฮชที่เก็บไว้เพี้ยน = ตรวจไม่ผ่าน ไม่ใช่ทำให้ทั้ง API พัง */
    return false;
  }
}

/**
 * ดึงกุญแจออกจากหัว Authorization
 *
 * รับทั้ง `Bearer box_...` และ `box_...` เปล่า ๆ เพราะทีมอื่นเขียนคนละภาษา
 * บางภาษาใส่ Bearer ให้เอง บางภาษาไม่ใส่ — ไม่ใช่เรื่องที่ควรทำให้ข้อมูลหาย
 *
 * @returns {string|null}
 */
export function boxKeyFrom(header) {
  const raw = String(header ?? "").trim();
  if (!raw) return null;
  const value = raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : raw;
  return value.startsWith(PREFIX) ? value : null;
}

/** ชื่อกล่องที่ฝังอยู่ในกุญแจ — ใช้หาแถวในฐานก่อนเทียบแฮช */
export function codeFromKey(key) {
  const m = /^box_([a-z0-9]+)_/.exec(String(key ?? ""));
  return m ? m[1] : null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   เก็บกุญแจไว้ให้อ่านย้อนหลังได้ (T1.347 · ผู้ใช้เลือกเอง 27 ต.ค. 2569)
   ═══════════════════════════════════════════════════════════════════════════

   ★ เดิมเก็บแต่แฮช ซึ่งอ่านย้อนไม่ได้เลยแม้แต่เจ้าของตู้ — ปลอดภัยที่สุดแต่ลืมแล้วจบ
     ผู้ใช้ขอให้ดูย้อนหลังได้ เผื่อลืมว่าส่งใบไหนให้ใคร

   ★★ **ไม่เก็บแบบดิบ ๆ** แต่เข้ารหัสด้วยความลับที่อยู่ใน `.env` (คนละที่กับฐานข้อมูล)
      เหตุผล: ไฟล์สำรองฐานข้อมูลถูกคัดลอกไปมาได้ง่าย และโปรเจกต์นี้เคยมีกุญแจหลุด
      ไปอยู่ในประวัติ git มาแล้ว (ดู RUNBOOK ภาคผนวก ข.) ถ้าเก็บดิบ ๆ ใครได้ไฟล์สำรอง
      ไปก็สวมรอยเป็นกล่องไหนก็ได้ทันที — เข้ารหัสไว้แล้วต้องได้ `.env` ไปด้วยถึงจะใช้ได้

   ⚠ ทำไมยังต้องเก็บแฮชไว้ด้วย: การตรวจกุญแจตอนรับข้อมูลเกิดขึ้นทุกวินาที
     ต้องเร็วและเทียบแบบเวลาคงที่ ส่วนการถอดรหัสใช้เฉพาะตอนเจ้าของตู้กดดู
*/
import { createCipheriv, createDecipheriv, scryptSync } from "node:crypto";

const ALG = "aes-256-gcm";
/* เกลือคงที่ได้ เพราะความลับตัวจริงอยู่ใน .env และแต่ละกุญแจมี IV ของตัวเอง */
const SALT = "swine-sync.hub.boxkey.v1";

let cachedKey = null;

/** คืน null เมื่อยังไม่ได้ตั้งความลับ — ผู้เรียกต้องบอกผู้ใช้ ไม่ใช่เก็บดิบ ๆ แทนเงียบ ๆ */
function cipherKey() {
  const secret = process.env.HUB_KEY_SECRET;
  if (!secret || secret.length < 16) return null;
  if (!cachedKey) cachedKey = scryptSync(secret, SALT, 32);
  return cachedKey;
}

export const canRevealKeys = () => cipherKey() !== null;

/**
 * เข้ารหัสกุญแจเพื่อเก็บลงฐาน
 * @returns {string|null} `iv:tag:cipher` (base64 ทั้งสามส่วน) — null เมื่อยังไม่ได้ตั้งความลับ
 */
export function sealBoxKey(key) {
  const k = cipherKey();
  if (!k) return null;
  /* IV 12 ไบต์ตามที่ GCM กำหนด และต้องไม่ซ้ำกันในแต่ละครั้งที่เข้ารหัส */
  const iv = randomBytes(12);
  const c = createCipheriv(ALG, k, iv);
  const out = Buffer.concat([c.update(String(key), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), out].map((b) => b.toString("base64")).join(":");
}

/**
 * ถอดกุญแจกลับมาอ่าน
 * @returns {string|null} null เมื่อถอดไม่ได้ — ความลับเปลี่ยน ของเสีย หรือยังไม่ได้ตั้ง
 */
export function openBoxKey(sealed) {
  const k = cipherKey();
  if (!k || !sealed) return null;
  try {
    const [iv, tag, data] = String(sealed).split(":").map((p) => Buffer.from(p, "base64"));
    const d = createDecipheriv(ALG, k, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString("utf8");
  } catch {
    /* ★ ถอดไม่ได้ = บอกว่าอ่านไม่ได้ ไม่ใช่ทำให้ทั้งหน้าพัง — ออกกุญแจใหม่ได้เสมอ */
    return null;
  }
}
