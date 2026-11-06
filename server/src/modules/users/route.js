/**
 * จัดการผู้ใช้ — /api/users/* (ผู้ดูแลระบบเท่านั้น)
 *
 *   GET    /            รายชื่อผู้ใช้ทั้งหมด
 *   POST   /            เพิ่มผู้ใช้ใหม่ (ตั้งรหัสชั่วคราว บังคับเปลี่ยนตอนเข้าครั้งแรก)
 *   PATCH  /:id         แก้ชื่อผู้ใช้ · ชื่อที่แสดง · อีเมล · ระดับสิทธิ์ · เปิด/ปิดบัญชี
 *   POST   /:id/password  ตั้งรหัสผ่านใหม่ให้ (กรณีผู้ใช้ลืม)
 *   DELETE /:id         **ลบบัญชีถาวร** (T1.253) — เดิมเป็นปิดบัญชี ซึ่งตอนนี้ทำผ่าน PATCH active=false
 *                       ลบแล้วบันทึกการเข้าใช้งานยังอ่านออก เพราะเก็บชื่อผู้ใช้ไว้ในแถวเหตุการณ์
 *
 * **ห้ามคืน `password_hash` ออกไปทุกกรณี** ต่อให้ผู้เรียกเป็นแอดมินก็ตาม
 */
import { Router } from "express";
import { logActivity } from "../../activity/log.js";
import { query, withTransaction } from "../../db/pool.js";
import { AppError, badRequest, notFound } from "../../lib/error.js";
import { hashPassword } from "../../lib/password.js";
import { ROLES, requireAdmin, requireAuth } from "../../lib/auth.js";

export const usersRouter = Router();

const MIN_PASSWORD = 8;
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
/* ตรวจแค่รูปร่างคร่าว ๆ — ระบบนี้ไม่ได้ส่งอีเมลหาใคร ใช้เป็นชื่อล็อกอินสำรองเท่านั้น */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** ผู้ดูแลระบบที่ยังใช้งานอยู่เหลือกี่คน — กันลด/ปิด/ลบจนไม่เหลือใครจัดการระบบได้ */
async function activeAdminCount() {
  const { rows } = await query(`select count(*)::int as n from app_user where role = 'admin' and active`);
  return rows[0].n;
}

usersRouter.use(requireAuth, requireAdmin);

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  email: u.email,
  displayName: u.display_name,
  role: u.role,
  active: u.active,
  mustChangePassword: u.must_change_password,
  createdAt: u.created_at,
  lastSignInAt: u.last_sign_in_at ?? null,
});

usersRouter.get("/", async (req, res, next) => {
  try {
    const { rows } = await query(
      `select u.*,
              (select max(at) from auth_event e
                where e.user_id = u.id and e.event = 'signin') as last_sign_in_at
         from app_user u
        order by u.role, lower(u.username)`,
    );
    res.json({ users: rows.map(publicUser) });
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/", async (req, res, next) => {
  try {
    const username = String(req.body?.username ?? "").trim().toLowerCase();
    const displayName = String(req.body?.displayName ?? "").trim();
    /* **ไม่มีค่าตั้งต้น** — ผู้ดูแลระบบต้องเลือกระดับเองทุกบัญชี (ผู้ใช้สั่ง "แล้วแต่ว่าเป็นใคร" · T1.251) */
    const role = String(req.body?.role ?? "");
    const password = String(req.body?.password ?? "");
    const email = String(req.body?.email ?? "").trim() || null;

    if (!USERNAME_RE.test(username)) {
      throw badRequest("ชื่อผู้ใช้ต้องเป็น a-z 0-9 . _ - ยาว 3–32 ตัว");
    }
    if (!displayName) throw badRequest("ต้องกรอกชื่อที่แสดง");
    if (!ROLES.includes(role)) throw badRequest("ต้องเลือกระดับสิทธิ์: viewer · editor · operator · admin");
    if (password.length < MIN_PASSWORD) {
      throw badRequest(`รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`);
    }

    /* บริษัทเดียวกับคนที่สร้าง — ระบบนี้ยังมีบริษัทเดียว แต่ schema เผื่อไว้หลายบริษัท */
    const { rows: co } = await query(`select id from company order by created_at limit 1`);
    if (!co[0]) throw new AppError(500, "no_company", "ยังไม่มีบริษัทในระบบ");

    const { rows } = await query(
      `insert into app_user (company_id, username, email, display_name, password_hash, role, must_change_password)
       values ($1, $2, $3, $4, $5, $6, true)
       returning *`,
      [co[0].id, username, email, displayName, await hashPassword(password), role],
    );
    await logActivity({ kind: "admin", action: "user.create", actor: req.user,
      target: `${displayName} (${username})`, detail: { role } });
    res.status(201).json({ user: publicUser(rows[0]) });
  } catch (err) {
    /* 23505 = unique_violation — บอกให้ตรงว่าซ้ำที่ช่องไหน ดีกว่าโยน 500 */
    if (err.code === "23505") {
      return next(badRequest("ชื่อผู้ใช้หรืออีเมลนี้มีอยู่แล้ว"));
    }
    next(err);
  }
});

usersRouter.patch("/:id", async (req, res, next) => {
  try {
    /* ★ อ่านสิทธิ์เดิมไว้ก่อนแก้ — ข้อความแจ้งเตือนต้องบอกได้ว่า "จากผู้ชม เป็นผู้บันทึก"
       ไม่ใช่แค่ "เป็นผู้บันทึก" ซึ่งอ่านแล้วไม่รู้ว่าเลื่อนขึ้นหรือลดลง (T1.364) */
    const { rows: prev } = await query(`select role, active from app_user where id = $1`, [
      req.params.id,
    ]);
    const patch = [];
    const params = [req.params.id];
    const set = (col, value) => {
      params.push(value);
      patch.push(`${col} = $${params.length}`);
    };

    /* ชื่อผู้ใช้ (ใช้ล็อกอิน) — เปลี่ยนแล้วต้องล็อกอินใหม่ด้วยชื่อใหม่ (ดูการถอน session ข้างล่าง) */
    const newUsername =
      req.body?.username !== undefined ? String(req.body.username).trim().toLowerCase() : undefined;
    if (newUsername !== undefined) {
      if (!USERNAME_RE.test(newUsername)) throw badRequest("ชื่อผู้ใช้ต้องเป็น a-z 0-9 . _ - ยาว 3–32 ตัว");
      set("username", newUsername);
    }
    /* อีเมล — ว่าง = ลบอีเมลออก (ล็อกอินด้วยชื่อผู้ใช้อย่างเดียว) */
    if (req.body?.email !== undefined) {
      const email = String(req.body.email ?? "").trim().toLowerCase();
      if (email && !EMAIL_RE.test(email)) throw badRequest("รูปแบบอีเมลไม่ถูกต้อง");
      set("email", email || null);
    }
    if (req.body?.displayName !== undefined) {
      const name = String(req.body.displayName).trim();
      if (!name) throw badRequest("ชื่อที่แสดงว่างไม่ได้");
      set("display_name", name);
    }
    if (req.body?.role !== undefined) {
      if (!ROLES.includes(req.body.role)) {
        throw badRequest("ระดับสิทธิ์ต้องเป็น viewer · editor · operator · admin");
      }
      set("role", req.body.role);
    }
    if (req.body?.active !== undefined) set("active", Boolean(req.body.active));
    if (patch.length === 0) throw badRequest("ไม่มีอะไรให้แก้");

    /* **กันตัวเองออกจากระบบ** — ลดสิทธิ์หรือปิดบัญชีตัวเองแล้วจะไม่เหลือใครแก้กลับได้
       (ระบบนี้ยังไม่มีทางกู้บัญชีแอดมินนอกจากแก้ในฐานข้อมูลตรง ๆ) */
    if (req.params.id === req.user.id && ((req.body?.role !== undefined && req.body.role !== "admin") || req.body?.active === false)) {
      throw badRequest("ลดสิทธิ์หรือปิดบัญชีของตัวเองไม่ได้");
    }

    /* ห้ามทำให้ไม่เหลือผู้ดูแลระบบที่ใช้งานอยู่เลย (มีแอดมินหลายคนแล้วกันแค่ "ตัวเอง" ไม่พอ) */
    const demoting = req.body?.role !== undefined && req.body.role !== "admin";
    if (demoting || req.body?.active === false) {
      const { rows: cur } = await query(`select role, active from app_user where id = $1`, [req.params.id]);
      if (cur[0]?.role === "admin" && cur[0]?.active && (await activeAdminCount()) <= 1) {
        throw badRequest("ต้องเหลือผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน");
      }
    }

    const { rows: before } = await query(`select username from app_user where id = $1`, [req.params.id]);
    let rows;
    try {
      ({ rows } = await query(`update app_user set ${patch.join(", ")} where id = $1 returning *`, params));
    } catch (err) {
      /* 23505 = ซ้ำกับบัญชีอื่น — บอกให้ตรงว่าช่องไหน */
      if (err.code === "23505") {
        throw badRequest(
          String(err.constraint || "").includes("email") ? "อีเมลนี้มีบัญชีอื่นใช้อยู่แล้ว" : "ชื่อผู้ใช้นี้มีบัญชีอื่นใช้อยู่แล้ว",
        );
      }
      throw err;
    }
    if (!rows[0]) throw notFound("ผู้ใช้รายนี้");

    /* เปลี่ยนชื่อผู้ใช้ของคนอื่น = เตะออกจากทุกเครื่อง ให้ล็อกอินใหม่ด้วยชื่อใหม่
       (ของตัวเองไม่เตะ — แอดมินคนเดียวจะหลุดออกทั้งที่แค่แก้ชื่อ หน้าเว็บโหลดใหม่ให้เอง) */
    if (newUsername !== undefined && before[0]?.username !== newUsername && req.params.id !== req.user.id) {
      await query(`update session set revoked_at = now() where user_id = $1 and revoked_at is null`, [
        req.params.id,
      ]);
    }

    /* ปิดบัญชีแล้วต้องเตะออกจากระบบทันที ไม่ใช่รอ session หมดอายุอีก 30 วัน */
    if (req.body?.active === false) {
      await query(`update session set revoked_at = now() where user_id = $1 and revoked_at is null`, [
        req.params.id,
      ]);
    }
    /* ★ เปลี่ยนสิทธิ์กับปิดบัญชีต้องเห็นชัดกว่าการแก้ชื่อ จึงส่ง role/active ไปประกอบข้อความ */
    await logActivity({ kind: "admin", action: "user.update", actor: req.user,
      target: `${rows[0].display_name} (${rows[0].username})`,
      detail: {
        role: req.body?.role, roleFrom: prev[0]?.role,
        active: req.body?.active,
      } });
    res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/:id/password", async (req, res, next) => {
  try {
    const password = String(req.body?.password ?? "");
    if (password.length < MIN_PASSWORD) {
      throw badRequest(`รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`);
    }
    const { rows } = await query(
      `update app_user set password_hash = $2, must_change_password = true
        where id = $1 returning id`,
      [req.params.id, await hashPassword(password)],
    );
    if (!rows[0]) throw notFound("ผู้ใช้รายนี้");
    /* ตั้งรหัสใหม่ให้ = เจ้าของเดิมอาจถูกสวมรอยอยู่ ถอน session ทั้งหมดของเขาทิ้ง */
    await query(`update session set revoked_at = now() where user_id = $1 and revoked_at is null`, [
      req.params.id,
    ]);
    /* ★ ไม่เก็บรหัสผ่านหรือความยาวของมันลงบันทึกเด็ดขาด — บันทึกนี้มีคนอ่านหลายคน */
    await logActivity({ kind: "admin", action: "user.password", actor: req.user,
      target: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * ลบบัญชีถาวร — ผู้ใช้สั่งให้ลบได้ (15 ก.ย. 2569 · T1.253) นอกเหนือจาก "ปิดบัญชี" ที่เก็บแถวไว้
 *
 * ทำใน transaction เดียว ล้มกลางทาง = ไม่มีอะไรเปลี่ยน:
 *   · ลบของที่เป็นของคนนี้คนเดียว: session · user_farm · user_pref · layout_preset
 *   · ประวัติที่ต้องอ่านได้ต่อ ปล่อยแถวไว้แต่ตัดการอ้างถึง (ตั้งเป็น null):
 *     auth_event (ชื่อผู้ใช้ยังอยู่ในคอลัมน์ username_tried) · ใครแก้เกณฑ์/ตั้งค่า · ใครรับทราบ/ปิดแจ้งเตือน
 * กันลบตัวเอง และกันลบผู้ดูแลระบบคนสุดท้าย
 */
usersRouter.delete("/:id", async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) throw badRequest("ลบบัญชีของตัวเองไม่ได้");
    const { rows: cur } = await query(`select username, role, active from app_user where id = $1`, [req.params.id]);
    if (!cur[0]) throw notFound("ผู้ใช้รายนี้");
    if (cur[0].role === "admin" && cur[0].active && (await activeAdminCount()) <= 1) {
      throw badRequest("ต้องเหลือผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน");
    }

    await withTransaction(async (db) => {
      const id = req.params.id;
      /* ชื่อผู้ใช้ติดไว้ในแถวเหตุการณ์ก่อนตัดการอ้างถึง — แถวเก่าบางแถวอาจไม่ได้เก็บชื่อไว้ */
      await db.query(
        `update auth_event set username_tried = coalesce(username_tried, $2), user_id = null where user_id = $1`,
        [id, cur[0].username],
      );
      await db.query(`update system_setting set updated_by = null where updated_by = $1`, [id]);
      await db.query(`update alert_rule set updated_by = null where updated_by = $1`, [id]);
      await db.query(`update alert set acked_by = null where acked_by = $1`, [id]);
      await db.query(`update alert set resolved_by = null where resolved_by = $1`, [id]);
      for (const table of ["session", "user_farm", "user_pref", "layout_preset"]) {
        await db.query(`delete from ${table} where user_id = $1`, [id]);
      }
      await db.query(`delete from app_user where id = $1`, [id]);
    });
    await logActivity({ kind: "admin", action: "user.delete", actor: req.user,
      target: cur[0].username, detail: { role: cur[0].role } });
    res.json({ ok: true, deleted: cur[0].username });
  } catch (err) {
    next(err);
  }
});
