/**
 * บันทึกงานในโรงเรือนจากข้อความในไลน์ (T1.322)
 *
 * ═══ ทำไมต้องมี ═══
 * ตาราง `barn_log` มี 0 แถว ทั้งที่ API ฐานข้อมูล และหน้าจอเสร็จครบ
 * ต้นเหตุคือแรงกดของคน ไม่ใช่ระบบ — คนหน้าฟาร์มถือมือถือยืนในเล้า
 * เปิดเว็บแล้วกรอกฟอร์มหกช่องไม่ไหว แต่พิมพ์ในไลน์ที่เปิดอยู่แล้วทำได้
 *
 * ★ **ใช้โควตาไลน์เป็นศูนย์** เพราะเป็นการ `reply` ไม่ใช่ `push`
 *   (โควตาบัญชีนี้ 300 ข้อความ/เดือน และ reply ไม่นับ — ดู docs ของ LINE)
 *
 * ═══ ★★ ด่านสิทธิ์: ต้องถูกผูกบัญชีไว้ก่อน ═══
 * บัญชีไลน์ของฟาร์มเป็น Official Account ที่ใครก็กดเพิ่มเพื่อนได้
 * ถ้าปล่อยให้ทุกคนที่พิมพ์เข้ามาบันทึกได้ คนนอกจะเขียนข้อมูลลงฐานของฟาร์มจริง
 * แล้วเลขนั้นไปโผล่ในหน้าฝูงสุกร รายงานส่งเวร และตัวเลขที่ผู้บริหารอ่าน
 *
 * `line_user.app_user_id` ว่าง = อ่านได้แต่เขียนไม่ได้ (ค่าตั้งต้น)
 */
import { query } from "../db/pool.js";
import { roleAtLeast } from "../lib/auth.js";
import { MIN_ROLE, UNDO_WINDOW_MIN } from "./recordText.js";
import { LOG_TYPES as TYPES } from "../barnlog/validate.js";

/* ชนิดที่รับได้ — **ยืมจาก `barnlog/validate.js` ตรง ๆ ไม่ถือรายชื่อของตัวเอง**
   ★★ เดิมไฟล์นี้ก๊อปรายชื่อไว้เองอีกชุด แล้วตอนเพิ่ม 12 ชนิดใน T1.366 ก็ลืมแก้ที่นี่
     ผลคือพิมพ์ "ทำความสะอาด" ในไลน์แล้วโยน error ทั้งที่ทุกที่อื่นรองรับแล้ว
     เทสต์จับไม่ได้เพราะไฟล์นี้ต้องมีฐานข้อมูลถึงจะเรียกได้ — เจอตอนลองใช้จริงเท่านั้น
   ➜ ทางแก้คือ **ไม่ให้มีรายชื่อชุดที่สอง** ไม่ใช่ไปจำว่าต้องแก้กี่ที่ */

/**
 * บัญชีไลน์นี้บันทึกได้ไหม
 *
 * ═══ ★★ ตรวจสามชั้น ไม่ใช่ชั้นเดียว ═══
 *   1. **ผูกบัญชีไว้หรือยัง** — ไม่ผูก = อ่านได้แต่เขียนไม่ได้ (ค่าตั้งต้น)
 *   2. **บัญชียังเปิดใช้งานอยู่ไหม** — ปิดบัญชีในระบบแล้วต้องเขียนผ่านไลน์ไม่ได้ทันที
 *   3. **สิทธิ์ถึงระดับผู้บันทึกไหม** ← ชั้นนี้ขาดไปตอน T1.322 และเป็นช่องโหว่จริง
 *
 * ★ ชั้นที่สามสำคัญเพราะถ้าไม่มี การเอาบัญชี **ผู้ชม** ไปผูกกับไลน์จะทำให้คนนั้น
 *   บันทึกข้อมูลได้ ทั้งที่บนเว็บทำไม่ได้ — เป็นการเดินอ้อมด่านที่ตั้งไว้แล้ว
 *
 * ★ อ่านระดับสิทธิ์จากฐาน **ทุกครั้งที่เรียก** ไม่ได้จำไว้
 *   ลดสิทธิ์คนไหนในระบบแล้วมีผลกับไลน์ทันที ไม่ต้องไปแก้ที่ตารางของไลน์อีก
 *
 * @returns {{ok: true, userId: string, name: string, role: string}
 *          | {ok: false, why: "unlinked"|"role"}}
 */
export async function recorderOf(lineUserId) {
  if (!lineUserId) return { ok: false, why: "unlinked" };
  const { rows } = await query(
    `select u.id, u.display_name, u.username, u.active, u.role
       from line_user l
       join app_user u on u.id = l.app_user_id
      where l.line_user_id = $1`,
    [lineUserId],
  );
  const u = rows[0];
  /* ยังไม่ผูก หรือบัญชีถูกปิด — ทั้งสองกรณีคือ "ยังไม่มีสิทธิ์เขียน" เหมือนกัน
     และบอกเหมือนกันโดยเจตนา: ไม่บอกคนนอกว่าบัญชีไหนมีอยู่จริงหรือถูกปิดไป */
  if (!u || !u.active) return { ok: false, why: "unlinked" };
  /* ★ สิทธิ์ไม่ถึง — แยกข้อความ เพราะคนนี้ "มีตัวตนในระบบแล้ว" แค่สิทธิ์ไม่พอ
     ต้องบอกให้รู้ว่าไปขอเลื่อนสิทธิ์ ไม่ใช่ไปขอผูกบัญชีซ้ำ */
  if (!roleAtLeast(u, MIN_ROLE)) return { ok: false, why: "role", role: u.role };
  return { ok: true, userId: u.id, name: u.display_name || u.username, role: u.role };
}

/**
 * เขียนหนึ่งรายการ
 *
 * ★ `by_name` ติดคำว่า "ไลน์" ไว้ด้วย เพื่อให้ดูย้อนหลังแยกออกว่ารายการไหน
 *   บันทึกจากหน้าเว็บ รายการไหนจากไลน์ — ตอนไล่หาสาเหตุข้อมูลเพี้ยนจะต่างกันมาก
 */
export async function writeLog({ barnKey, type, amount, unit, note = "", recorder }) {
  if (!TYPES.includes(type)) throw new Error(`ชนิดบันทึกที่ไม่รู้จัก: ${type}`);
  const { rows } = await query(
    `insert into barn_log (barn_key, type, amount, unit, note, by_name, at, created_by)
     values ($1, $2, $3, $4, $7, $5, now(), $6)
     returning id, type, amount, unit, at`,
    /* ★ ตัดข้อความยาวก่อนเก็บ — คนพิมพ์ต่อท้ายได้ไม่จำกัด แต่ช่องนี้มีไว้จดสั้น ๆ */
    [barnKey, type, amount, unit, `ไลน์ · ${recorder.name}`, recorder.userId,
     String(note ?? "").trim().slice(0, 500)],
  );
  return rows[0];
}

/**
 * ถอนรายการล่าสุดที่ "คนนี้" บันทึกผ่านไลน์ในโรงเรือนนี้
 *
 * ★ จำกัดสามชั้นโดยเจตนา — เฉพาะของตัวเอง · เฉพาะที่มาจากไลน์ · เฉพาะที่ยังไม่ถูกลบ
 *   ไม่งั้นพิมพ์ "ยกเลิก" จะไปถอนรายการที่คนอื่นบันทึกไว้บนหน้าเว็บได้
 *
 * ★ จำกัดเวลาด้วย เพราะ "ยกเลิก" หมายถึงของที่เพิ่งกดผิด ไม่ใช่การแก้ประวัติเมื่อวาน
 *   การแก้ของเก่าต้องทำบนหน้าเว็บที่เห็นรายการทั้งหมดก่อนตัดสินใจ
 */

export async function undoLast({ barnKey, recorder }) {
  const { rows } = await query(
    `update barn_log
        set deleted_at = now(), deleted_by = $1
      where id = (
        select id from barn_log
         where barn_key = $2
           and created_by = $1
           and by_name like 'ไลน์ · %'
           and deleted_at is null
           and at > now() - ($3 || ' minutes')::interval
         order by at desc
         limit 1
      )
      returning id, type, amount, unit`,
    [recorder.userId, barnKey, String(UNDO_WINDOW_MIN)],
  );
  return rows[0] ?? null;
}

/* ส่งต่อให้ผู้เรียกเดิมไม่ต้องรู้ว่าย้ายไฟล์ */
export { UNDO_WINDOW_MIN, savedText } from "./recordText.js";
