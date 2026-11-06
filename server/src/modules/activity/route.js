/**
 * ใครทำอะไรในระบบ (T1.359) — /api/activity
 *
 *   GET /              รายการล่าสุด (ทุกคนที่ล็อกอินดูได้)
 *   GET /settings      หมวดที่ตั้งไว้ว่าให้ส่งเข้าไลน์
 *   PUT /settings      ตั้งใหม่ ← ผู้บันทึกขึ้นไป
 *
 * ★ อ่านได้ทุกระดับโดยตั้งใจ — "ใครแก้เกณฑ์ไป" เป็นข้อมูลที่คนเฝ้าเวรต้องเห็น
 *   ไม่ใช่ความลับของผู้ดูแลระบบ และไม่มีอะไรอ่อนไหวอยู่ในนั้น
 *   (รหัสผ่านและกุญแจไม่เคยถูกเขียนลงตารางนี้ — ดู users/route.js ตอน user.password)
 *
 * ★★ การตั้งค่า **มีผลกับทุกคน** ไม่ใช่ค่าหน้าจอส่วนตัว เพราะตัวส่งไลน์มีตัวเดียว
 *   ระดับสิทธิ์จึงเท่ากับการแก้เกณฑ์แจ้งเตือน (ผู้บันทึกขึ้นไป) ไม่ใช่ใครก็ตั้งได้
 */
import { Router } from "express";
import { query } from "../../db/pool.js";
import { badRequest } from "../../lib/error.js";
import { requireAuth, requireRole } from "../../lib/auth.js";
import { ACTIVITY_KINDS, isActivityKind } from "../../activity/kinds.js";
import { ACTIVITY_EVERY_MIN, lineKinds, setLineKinds } from "../../activity/settings.js";

export const activityRouter = Router();

activityRouter.use(requireAuth);

/** เพดานจำนวนแถวต่อหนึ่งคำขอ — หน้าจอแสดงไม่เกินนี้อยู่แล้ว และกันดึงทั้งตาราง */
const MAX_LIMIT = 200;

activityRouter.get("/", async (req, res) => {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || 50));
  /* กรองหมวดได้ แต่ต้องเป็นหมวดที่รู้จักเท่านั้น — ค่าแปลกปลอมถือว่าไม่กรอง */
  const kinds = String(req.query.kinds ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(isActivityKind);

  const { rows } = await query(
    `select id, at, kind, action, actor_name as "actorName", target, summary, detail
       from activity
      where ($1::text[] is null or kind = any($1::text[]))
      order by id desc
      limit $2`,
    [kinds.length ? kinds : null, limit],
  );
  res.json({ activity: rows, kinds: ACTIVITY_KINDS });
});

activityRouter.get("/settings", async (_req, res) => {
  res.json({
    kinds: ACTIVITY_KINDS,
    lineKinds: await lineKinds(),
    /* บอกช่วงเว้นไปด้วย หน้าจอจะได้อธิบายได้ว่าทำไมไม่เด้งทันที */
    everyMinutes: ACTIVITY_EVERY_MIN,
  });
});

activityRouter.put("/settings", requireRole("editor"), async (req, res) => {
  const raw = req.body?.lineKinds;
  if (!Array.isArray(raw)) throw badRequest("ต้องส่ง lineKinds เป็นรายการของหมวด");
  const bad = raw.filter((k) => !isActivityKind(k));
  if (bad.length) throw badRequest(`หมวดที่ไม่รู้จัก: ${bad.join(", ")}`);
  res.json({ lineKinds: await setLineKinds(raw, req.user.id) });
});
