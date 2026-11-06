/**
 * ยืนยันตัวตนด้วย session token — ตัวกลางที่ทุกเส้นทางที่ต้องล็อกอินเรียกใช้
 *
 * **ทำไมไม่ใช้ JWT** ระบบนี้ต้อง "ถอนสิทธิ์ได้ทันที" (ปิดบัญชี · บังคับออกจากระบบ)
 * JWT ที่ออกไปแล้วเรียกคืนไม่ได้จนกว่าจะหมดอายุ ส่วน session ในฐานข้อมูลลบแถวเดียวก็จบ
 * แลกกับการ query หนึ่งครั้งต่อคำขอ ซึ่งไม่ใช่ปัญหาที่ปริมาณระดับนี้
 *
 * **token เก็บเป็น hash ไม่ใช่ตัวจริง** ใครอ่านฐานข้อมูลได้ก็สวมรอยไม่ได้
 * ใช้ sha256 เฉย ๆ ไม่ต้อง scrypt เพราะ token เป็นค่าสุ่ม 256 บิตอยู่แล้ว
 * ไม่มีอะไรให้เดาแบบ dictionary attack (ต่างจากรหัสผ่านที่คนตั้งเอง)
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { query } from "../db/pool.js";
import { AppError } from "./error.js";
import { ROLE_NAME, roleAtLeast } from "./roles.js";

/** อายุ session — 30 วัน เท่ากับที่หน้าเว็บจำการเข้าใช้งานไว้ */
export const SESSION_DAYS = 30;

export const newToken = () => randomBytes(32).toString("hex");
export const hashToken = (token) => createHash("sha256").update(token).digest("hex");

/** ที่อยู่ผู้เรียก — ผ่าน nginx มา ip จริงอยู่ใน X-Real-IP (ตั้งไว้ใน web/nginx.conf) */
export const clientIp = (req) =>
  req.headers["x-real-ip"] || req.ip?.replace(/^::ffff:/, "") || null;

/** อ่าน token จากหัว Authorization — รูปแบบเดียวเท่านั้น ไม่รับ query string */
function tokenOf(req) {
  const header = req.headers.authorization || "";
  const [scheme, value] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && value ? value.trim() : null;
}

/**
 * หาเจ้าของ token — คืน null ถ้าไม่มี/หมดอายุ/ถูกถอน/บัญชีถูกปิด
 * อัปเดต `last_used_at` ให้ด้วย จะได้รู้ว่า session ไหนยังมีคนใช้จริง
 */
export async function userOfToken(token) {
  if (!token) return null;
  const { rows } = await query(
    `update session s
        set last_used_at = now()
       from app_user u
      where s.user_id = u.id
        and s.token_hash = $1
        and s.revoked_at is null
        and s.expires_at > now()
        and u.active
     returning u.id, u.username, u.display_name, u.role, u.must_change_password, s.id as session_id`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

/**
 * ต้องล็อกอินก่อน — ใส่หน้าเส้นทางที่ **เขียนข้อมูล** ทุกเส้นทาง
 *
 * เส้นทางอ่านอย่างเดียวยังเปิดไว้ก่อนโดยตั้งใจ (หน้าจอต้องโหลดข้อมูลได้ก่อนล็อกอิน
 * เช่นหน้าเข้าสู่ระบบเองก็เรียก /api/health) — ถ้าจะปิดด้วยต้องแก้ฝั่งหน้าเว็บพร้อมกัน
 */
export async function requireAuth(req, res, next) {
  try {
    const user = await userOfToken(tokenOf(req));
    if (!user) throw new AppError(401, "unauthorized", "ต้องเข้าสู่ระบบก่อน");
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * ระดับสิทธิ์ไล่ขั้น (T1.251) — ขั้นสูงทำได้ทุกอย่างที่ขั้นต่ำทำได้
 * ต้องตรงกับ ROLE_ORDER ใน src/lib/auth/roles.js ของหน้าเว็บ
 */
/* ★ กติกาสิทธิ์ย้ายไปไฟล์ล้วนที่ `roles.js` แล้ว (T1.325) เพื่อให้ชุดทดสอบที่ราก
   เรียกได้โดยไม่ต้องมี `pg` — ไฟล์นี้ส่งต่อให้ของเดิมที่ import จากที่นี่ยังใช้ได้ */
export { ROLES, ROLE_NAME, roleAtLeast } from "./roles.js";

/**
 * ด่านตามระดับ — ใช้ต่อจาก requireAuth เสมอ
 *   requireRole("editor")    เกณฑ์/การแจ้งเตือน · งานบันทึก
 *   requireRole("operator")  สั่งอุปกรณ์ (PLC)
 *   requireRole("admin")     จัดการผู้ใช้ · ฟาร์ม
 * อ่านระดับจากแถวในฐานทุกคำขอ (ผ่าน userOfToken) ลดระดับแล้วมีผลทันที
 */
export const requireRole = (min) => (req, res, next) => {
  if (!roleAtLeast(req.user, min)) {
    return next(
      new AppError(
        403,
        "forbidden",
        min === "admin"
          ? "ต้องเป็นผู้ดูแลระบบจึงจะทำรายการนี้ได้"
          : `ต้องมีสิทธิ์ระดับ${ROLE_NAME[min]}ขึ้นไปจึงจะทำรายการนี้ได้`,
      ),
    );
  }
  next();
};

/** ต้องเป็นผู้ดูแลระบบ — ใช้ต่อจาก requireAuth เสมอ */
export const requireAdmin = requireRole("admin");

/** สั่งอุปกรณ์ (PLC) — ผู้ควบคุมอุปกรณ์ขึ้นไป */
export const requireEquipmentControl = requireRole("operator");

/** เทียบสตริงลับแบบเวลาคงที่ (ความยาวต่างกันก็ไม่ throw) */
export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}
