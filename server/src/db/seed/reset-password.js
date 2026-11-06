/**
 * ตั้งรหัสผ่านใหม่ให้บัญชีใดบัญชีหนึ่งจากบรรทัดคำสั่ง — **ทางกู้คืนเมื่อลืมรหัสแอดมิน**
 *
 *   docker compose exec -e RESET_USER=admin -e RESET_PASSWORD='รหัสใหม่ยาว ๆ' api npm run reset:password
 *
 * **ทำไมต้องมี** — ระบบนี้ไม่มีการส่งอีเมลรีเซ็ตรหัสผ่าน และแอดมินคนเดียวที่ลืมรหัส
 * ก็ไม่มีใครตั้งให้ใหม่ได้ (หน้าจัดการผู้ใช้ต้องล็อกอินเป็นแอดมินก่อน — ไก่กับไข่)
 * ก่อนหน้านี้ทางออกเดียวคือแก้ในฐานข้อมูลตรง ๆ ซึ่งต้องรู้ว่า hash เก็บรูปแบบไหน
 *
 * **ต้องรันจากในเครื่องที่ติดตั้งระบบเท่านั้น** — ใครเข้าถึง shell ของเซิร์ฟเวอร์ได้
 * ก็เข้าถึงฐานข้อมูลได้อยู่แล้ว คำสั่งนี้จึงไม่ได้เปิดช่องอะไรใหม่
 *
 * รับรหัสผ่านทาง environment variable ไม่ใช่ argument ของคำสั่ง เพราะ argument
 * โผล่ใน `ps` ให้ผู้ใช้อื่นในเครื่องเดียวกันเห็นได้ (env ของ process อื่นอ่านยากกว่ามาก)
 */
import { pool, query } from "../pool.js";
import { log } from "../../lib/log.js";
import { hashPassword } from "../../lib/password.js";

const MIN_PASSWORD = 8;

export async function resetPassword() {
  const username = (process.env.RESET_USER || "").trim().toLowerCase();
  const password = process.env.RESET_PASSWORD || "";

  if (!username) throw new Error("ต้องระบุ RESET_USER ว่าจะตั้งรหัสให้บัญชีไหน");
  if (password.length < MIN_PASSWORD) {
    throw new Error(`RESET_PASSWORD ต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`);
  }

  const { rows } = await query(
    `update app_user
        set password_hash = $2,
            /* ไม่บังคับเปลี่ยนซ้ำ — คนที่รันคำสั่งนี้คือเจ้าตัวที่เพิ่งตั้งรหัสเอง */
            must_change_password = false,
            /* ปลดล็อกบัญชีให้ด้วย เผื่อโดนปิดไปแล้วไม่มีแอดมินคนอื่นเปิดคืน */
            active = true
      where lower(username) = $1
      returning id, username, role`,
    [username, await hashPassword(password)],
  );
  if (!rows[0]) throw new Error(`ไม่พบบัญชี "${username}"`);

  /* ถอน session ทั้งหมดของบัญชีนี้ — ถ้ารหัสรั่วจนต้องมารีเซ็ต คนที่ค้างล็อกอินอยู่ต้องหลุดด้วย */
  const { rowCount } = await query(
    `update session set revoked_at = now() where user_id = $1 and revoked_at is null`,
    [rows[0].id],
  );
  return { username: rows[0].username, role: rows[0].role, ถอนsession: rowCount };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  resetPassword()
    .then(async (r) => {
      log.info(r, "ตั้งรหัสผ่านใหม่แล้ว");
      await pool.end();
    })
    .catch(async (err) => {
      log.error({ err: err.message }, "ตั้งรหัสผ่านใหม่ไม่สำเร็จ");
      await pool.end();
      process.exit(1);
    });
}
