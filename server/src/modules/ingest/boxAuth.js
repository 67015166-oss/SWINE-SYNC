/**
 * ด่านตรวจกุญแจของกล่องที่ส่งข้อมูลเข้าตู้กลาง (T1.347)
 *
 * ต่างจาก `requireAuth` ของคน — ตัวนั้นอ่านเซสชันที่ออกตอนล็อกอิน
 * ตัวนี้อ่านกุญแจประจำกล่องจากหัว `Authorization` แล้วเทียบกับทะเบียน `source_box`
 *
 * ═══ ★ ตอบ 401 เหมือนกันหมดทุกกรณีที่ไม่ผ่าน ═══
 * ไม่มีกุญแจ · กุญแจผิด · กล่องถูกปิด — ตอบข้อความเดียวกัน
 * ถ้าแยกข้อความ คนที่เดากุญแจจะรู้ว่า "ชื่อกล่องนี้มีอยู่จริง แค่กุญแจผิด"
 * ซึ่งเป็นข้อมูลที่ไม่ควรแจกฟรี
 */
import { query } from "../../db/pool.js";
import { AppError } from "../../lib/error.js";
import { boxKeyFrom, boxKeyMatches, codeFromKey } from "../../lib/boxKey.js";

const denied = () => new AppError(401, "unauthorized", "กุญแจไม่ถูกต้องหรือกล่องถูกปิดอยู่");

/**
 * ต้องมีกุญแจกล่องที่ใช้ได้ — วางไว้หน้าเส้นทางที่กล่องอื่นเรียก
 * เมื่อผ่านแล้วจะได้ `req.box = { id, code, name }`
 */
export async function requireBox(req, res, next) {
  try {
    const key = boxKeyFrom(req.get("authorization"));
    if (!key) throw denied();

    /* หาแถวจากชื่อที่ฝังในกุญแจก่อน จะได้ไม่ต้องดึงทั้งตารางมาเทียบทีละใบ */
    const code = codeFromKey(key);
    if (!code) throw denied();

    const { rows } = await query(
      `select id, code, name, key_hash, active from source_box where code = $1`,
      [code],
    );
    const box = rows[0];

    /* ★ เทียบแฮชก่อนเสมอ แม้จะรู้แล้วว่าไม่มีแถวนี้ — ให้เวลาที่ใช้ตอบใกล้เคียงกัน
       ไม่งั้นชื่อกล่องที่มีจริงจะตอบช้ากว่าชื่อที่ไม่มี ซึ่งเดาต่อได้ */
    const ok = box ? boxKeyMatches(key, box.key_hash) : boxKeyMatches(key, "0".repeat(64));
    if (!box || !ok || !box.active) throw denied();

    req.box = { id: box.id, code: box.code, name: box.name };

    /* จดว่าเห็นล่าสุดเมื่อไร — ใช้ตอบคำถาม "กล่องไหนเงียบไปแล้ว"
       ไม่ await เพราะเป็นข้อมูลประกอบ ไม่ควรถ่วงการรับข้อมูลจริง */
    query(`update source_box set last_seen_at = now() where id = $1`, [box.id]).catch(() => {});

    next();
  } catch (err) {
    next(err);
  }
}
