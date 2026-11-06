/**
 * สร้างบัญชีผู้ดูแลระบบคนแรก — `docker compose exec api npm run seed:admin`
 *
 * **ทำงานเมื่อยังไม่มีผู้ดูแลระบบในฐานเท่านั้น** รันซ้ำแล้วไม่เขียนทับของเดิม
 * (ไม่งั้นรันผิดครั้งเดียวรหัสผ่านของแอดมินตัวจริงหายทั้งระบบ)
 *
 * รหัสผ่านมาจาก `ADMIN_PASSWORD` ใน .env — **ไม่มีค่าตั้งต้นให้โดยตั้งใจ**
 * ระบบที่แจกรหัสตั้งต้นมาให้คือระบบที่คนลืมเปลี่ยน แล้วรหัสนั้นก็อยู่ในโค้ดตลอดไป
 * (ของเดิมฝัง "1234" ไว้ในหน้าเว็บ ซึ่งเป็นเหตุผลที่ต้องทำงานนี้ตั้งแต่แรก)
 */
import { pool, query } from "../pool.js";
import { log } from "../../lib/log.js";
import { hashPassword } from "../../lib/password.js";

const MIN_PASSWORD = 8;

export async function seedAdmin() {
  const username = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
  const displayName = process.env.ADMIN_DISPLAY_NAME || "ผู้ดูแลระบบ";
  const password = process.env.ADMIN_PASSWORD || "";

  const { rows: existing } = await query(
    `select username from app_user where role = 'admin' and active limit 1`,
  );
  if (existing[0]) {
    log.info({ username: existing[0].username }, "มีผู้ดูแลระบบอยู่แล้ว — ไม่สร้างซ้ำ");
    return { created: false, username: existing[0].username };
  }

  if (password.length < MIN_PASSWORD) {
    throw new Error(
      `ต้องตั้ง ADMIN_PASSWORD ใน .env ให้ยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษรก่อนสร้างผู้ดูแลระบบ`,
    );
  }

  const { rows: co } = await query(`select id from company order by created_at limit 1`);
  if (!co[0]) throw new Error("ยังไม่มีบริษัทในระบบ — รัน npm run seed ก่อน");

  await query(
    `insert into app_user (company_id, username, display_name, password_hash, role, must_change_password)
     values ($1, $2, $3, $4, 'admin', false)`,
    [co[0].id, username, displayName, await hashPassword(password)],
  );
  log.info({ username }, "สร้างผู้ดูแลระบบคนแรกแล้ว");
  return { created: true, username };
}

/* เรียกจากบรรทัดคำสั่งได้โดยตรง */
if (import.meta.url === `file://${process.argv[1]}`) {
  seedAdmin()
    .then((r) => {
      log.info(r, "เสร็จ");
      return pool.end();
    })
    .catch(async (err) => {
      log.error({ err: err.message }, "สร้างผู้ดูแลระบบไม่สำเร็จ");
      await pool.end();
      process.exit(1);
    });
}
