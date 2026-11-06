/**
 * เส้นทางเข้าสู่ระบบ — /api/auth/*
 *
 *   POST /login   ตรวจรหัสผ่าน → สร้าง session → คืน token
 *   POST /logout  ถอน session ที่ใช้อยู่
 *   GET  /me      บอกว่า token นี้เป็นของใคร (หน้าเว็บใช้ตอนเปิดแอป)
 *   POST /password เปลี่ยนรหัสผ่านของตัวเอง
 *   GET  /events  บันทึกการเข้าใช้งาน — ผู้ดูแลระบบเห็นทุกบัญชี · คนอื่นเห็นเฉพาะของตัวเอง
 *
 * ทุกครั้งที่ล็อกอินสำเร็จ/ไม่สำเร็จ/ออกจากระบบ บันทึกลง `auth_event`
 * — เป็นบันทึกฝั่งเซิร์ฟเวอร์ที่ผู้ใช้ลบเองไม่ได้ ต่างจากบันทึกใน localStorage ของเครื่อง
 */
import { Router } from "express";
import { query } from "../../db/pool.js";
import { AppError, badRequest } from "../../lib/error.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import {
  SESSION_DAYS,
  clientIp,
  hashToken,
  newToken,
  requireAuth,
  roleAtLeast,
} from "../../lib/auth.js";

export const authRouter = Router();

/** รหัสผ่านสั้นกว่านี้เดาได้ในไม่กี่นาที ต่อให้ hash แน่นแค่ไหนก็ช่วยไม่ได้ */
const MIN_PASSWORD = 8;

const record = (event, { userId = null, username = null, req }) =>
  query(
    `insert into auth_event (user_id, username_tried, event, ip, user_agent)
     values ($1, $2, $3, $4, $5)`,
    [userId, username, event, clientIp(req), req.headers["user-agent"] ?? null],
  ).catch(() => {
    /* บันทึกไม่ลงไม่ควรทำให้ล็อกอินล้ม — แต่ต้องไม่เงียบสนิท ตัวจับ error กลางจะเห็นเอง */
  });

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  displayName: u.display_name,
  role: u.role,
  mustChangePassword: u.must_change_password,
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const username = String(req.body?.username ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    if (!username || !password) throw badRequest("ต้องกรอกชื่อผู้ใช้และรหัสผ่าน");

    const { rows } = await query(
      `select id, username, display_name, role, password_hash, must_change_password, active
         from app_user
        where lower(username) = $1 or lower(email) = $1`,
      [username],
    );
    const user = rows[0];

    /* **ตรวจรหัสผ่านเสมอแม้ไม่เจอบัญชี** — ถ้า return ทันทีตอนไม่เจอ เวลาที่ใช้จะสั้นกว่า
       ชัดเจน คนเดาจึงแยกออกว่า "ชื่อผู้ใช้นี้มีอยู่จริงไหม" จากเวลาที่รอ */
    const ok = await verifyPassword(password, user?.password_hash ?? "scrypt$1$1$1$AA==$AA==");

    if (!user || !user.active || !ok) {
      await record("failed", { userId: user?.id ?? null, username, req });
      throw new AppError(401, "bad_credentials", "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    }

    const token = newToken();
    await query(
      `insert into session (user_id, token_hash, user_agent, ip, expires_at)
       values ($1, $2, $3, $4, now() + ($5 || ' days')::interval)`,
      [user.id, hashToken(token), req.headers["user-agent"] ?? null, clientIp(req), SESSION_DAYS],
    );
    await record("signin", { userId: user.id, username: user.username, req });

    res.json({ token, expiresInDays: SESSION_DAYS, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await query(`update session set revoked_at = now() where id = $1`, [req.user.session_id]);
    await record("signout", { userId: req.user.id, username: req.user.username, req });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser({ ...req.user, display_name: req.user.display_name }) });
});

/** จำนวนบรรทัดที่ส่งให้หน้าตั้งค่าเมื่อไม่ได้ระบุ · สูงสุดที่ยอมส่งต่อครั้ง */
const EVENT_LIMIT = 20;
const EVENT_LIMIT_MAX = 200;

/**
 * บันทึกการเข้าใช้งาน (ใหม่สุดขึ้นก่อน) — **ที่มาเดียวกับช่อง "เข้าล่าสุด" ของหน้าจัดการผู้ใช้**
 *
 * เดิมหน้าตั้งค่าจดบันทึกนี้ไว้ใน localStorage ของเบราว์เซอร์เอง จึงเห็นแค่การเข้าจากเบราว์เซอร์นั้น
 * ส่วนช่อง "เข้าล่าสุด" นับจากทุกเครื่อง เวลาสองที่เลยไม่ตรงกัน (ผู้ใช้เจอ 15 ก.ย. 2569)
 *
 * ผู้ดูแลระบบเห็นทุกบัญชี รวมชื่อผู้ใช้ที่ไม่มีอยู่จริงที่มีคนลองกรอก
 * คนอื่นเห็นเฉพาะแถวของบัญชีตัวเอง — รวม "รหัสผ่านไม่ถูกต้อง" ที่มีคนลองเข้าบัญชีนี้
 * ไม่มีทางลบจากหน้าเว็บ (หลักฐานว่าใครเข้าเมื่อไร ต้องไม่ถูกคนที่กรอกผิดลบทิ้งได้)
 */
authRouter.get("/events", requireAuth, async (req, res, next) => {
  try {
    const asked = Number.parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(Number.isFinite(asked) ? asked : EVENT_LIMIT, 1), EVENT_LIMIT_MAX);
    const all = roleAtLeast(req.user, "admin");
    const { rows } = await query(
      `select e.at, e.event, coalesce(u.username, e.username_tried) as username
         from auth_event e
         left join app_user u on u.id = e.user_id
        where $1::boolean or e.user_id = $2
        order by e.at desc
        limit $3`,
      [all, req.user.id, limit],
    );
    res.json({
      scope: all ? "all" : "self",
      events: rows.map((r) => ({ at: r.at, event: r.event, username: r.username ?? "" })),
    });
  } catch (err) {
    next(err);
  }
});

/** เปลี่ยนรหัสผ่านของตัวเอง — ต้องยืนยันรหัสเดิมด้วย กันคนที่ยืมเครื่องเปิดทิ้งไว้ */
authRouter.post("/password", requireAuth, async (req, res, next) => {
  try {
    const current = String(req.body?.current ?? "");
    const next_ = String(req.body?.next ?? "");
    if (next_.length < MIN_PASSWORD) {
      throw badRequest(`รหัสผ่านใหม่ต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`);
    }

    const { rows } = await query(`select password_hash from app_user where id = $1`, [req.user.id]);
    if (!(await verifyPassword(current, rows[0]?.password_hash ?? ""))) {
      throw new AppError(401, "bad_credentials", "รหัสผ่านเดิมไม่ถูกต้อง");
    }

    await query(
      `update app_user set password_hash = $2, must_change_password = false where id = $1`,
      [req.user.id, await hashPassword(next_)],
    );
    /* เปลี่ยนรหัสแล้วถอน session อื่นทั้งหมด — เผื่อเปลี่ยนเพราะสงสัยว่ารหัสรั่ว
       เว้น session ปัจจุบันไว้ ไม่งั้นเปลี่ยนเสร็จแล้วเด้งออกจากระบบทันที */
    await query(
      `update session set revoked_at = now()
        where user_id = $1 and id <> $2 and revoked_at is null`,
      [req.user.id, req.user.session_id],
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
