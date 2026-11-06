/**
 * เส้นทางจัดการการส่งเข้า LINE (T1.275)
 *
 *   GET  /api/line/status        ตั้งค่าอยู่ครบไหม · โหมดซ้อมเปิดอยู่ไหม · โควตาเดือนนี้ · 10 ครั้งล่าสุด
 *   POST /api/line/test          ส่งข้อความทดสอบ — ผู้ดูแลระบบเท่านั้น
 *   POST /api/line/daily         ส่งสรุปประจำวันเดี๋ยวนี้ (ไม่รอเวลาที่ตั้งไว้) — ผู้ดูแลระบบเท่านั้น
 *
 * **ทำไมต้องเป็นผู้ดูแลระบบ** การกดปุ่มนี้ส่งข้อความออกไปหาคนข้างนอกจริง ๆ และกินโควตา
 * ของบัญชีจริง เรียกคืนไม่ได้ — จัดเป็นการกระทำระดับเดียวกับการตั้งค่าระบบ
 * (`system.settings` ใน src/lib/auth/roles.js)
 */
import { Router } from "express";
import { query } from "../../db/pool.js";
import { badRequest } from "../../lib/error.js";
import { requireAdmin, requireAuth, roleAtLeast } from "../../lib/auth.js";
import { logActivity } from "../../activity/log.js";
/* ระดับสิทธิ์ขั้นต่ำที่บันทึกข้อมูลได้ — ใช้ตัวเดียวกับที่ฝั่งไลน์บังคับจริง ห้ามตั้งเลขใหม่ */
import { MIN_ROLE } from "../../line/recordText.js";
import { lineConfigured, lineDryRun, lineQuota, lineTarget, sendLine } from "../../line/client.js";
import { testMessage } from "../../line/flex.js";
import { lineEnabled, sendSummaryNow } from "../../line/notifier.js";
import { healthSummary, runHealthCheck } from "../../line/health.js";
import { yesterdayRange } from "../../line/summary.js";

export const lineRouter = Router();

lineRouter.use(requireAuth);

lineRouter.get("/status", async (_req, res, next) => {
  try {
    const { rows: recent } = await query(
      `select kind, ref, sent_at, dry, ok, error from line_notice order by sent_at desc limit 10`,
    );
    res.json({
      enabled: lineEnabled(),
      configured: lineConfigured(),
      dryRun: lineDryRun(),
      target: lineTarget(),
      dailyAt: process.env.LINE_DAILY_AT || "07:30",
      maxPerDay: Number(process.env.LINE_MAX_PER_DAY || 20),
      quota: await lineQuota(),
      /* ช่องทางขาเข้า (webhook) ยังใช้ได้ไหม — คนละเรื่องกับขาออกที่ส่งสรุป/แจ้งเตือน */
      health: await healthSummary(),
      recent,
    });
  } catch (err) {
    next(err);
  }
});

lineRouter.post("/test", requireAdmin, async (_req, res, next) => {
  try {
    const result = await sendLine(testMessage());
    await query(
      `insert into line_notice (kind, ref, dry, ok, error) values ('test', null, $1, $2, $3)`,
      [result.dry, result.sent || result.dry, result.error],
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** สั่งตรวจช่องทางขาเข้าเดี๋ยวนี้ ไม่ต้องรอรอบชั่วโมง */
lineRouter.post("/health-check", requireAdmin, async (_req, res, next) => {
  try {
    res.json(await runHealthCheck(new Date(), { force: true }));
  } catch (err) {
    next(err);
  }
});

lineRouter.post("/daily", requireAdmin, async (req, res, next) => {
  try {
    /* ไม่ส่งช่วงเวลามา = สรุปของเมื่อวานตามเวลาไทย เหมือนรอบอัตโนมัติ */
    const fromRaw = req.body?.from;
    const toRaw = req.body?.to;
    let range = yesterdayRange(new Date());
    if (fromRaw || toRaw) {
      const from = Date.parse(fromRaw ?? "");
      const to = Date.parse(toRaw ?? "");
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
        throw badRequest("ช่วงเวลาไม่ถูกต้อง");
      }
      range = { from: new Date(from), to: new Date(to) };
    }
    const { result, summary } = await sendSummaryNow(range.from, range.to);
    res.json({ ...result, summary });
  } catch (err) {
    next(err);
  }
});

/* ═══════════════════════════════════════════════════════════════════
   ผูกบัญชีไลน์กับผู้ใช้ในระบบ (T1.363)

   ★★ **ค่าตั้งต้นของทุกบัญชีไลน์คือ "อ่านได้ แต่เขียนไม่ได้"**
   บัญชีไลน์ของฟาร์มเป็น Official Account ที่ใครก็กดเพิ่มเพื่อนได้ ถ้าปล่อยให้ทุกคน
   ที่ทักเข้ามาบันทึกข้อมูลได้ คนนอกจะเขียนตัวเลขลงฐานของฟาร์มจริง แล้วเลขนั้น
   ไปโผล่ในหน้าฝูงสุกร รายงานส่งเวร และตัวเลขที่ผู้บริหารอ่าน

   การ "ผูก" คือการยกให้บัญชีไลน์หนึ่งพูดแทนผู้ใช้คนหนึ่ง — เป็นการให้สิทธิ์
   จึงเป็นของผู้ดูแลระบบเท่านั้น และต้องถูกบันทึกลงประวัติกิจกรรมทุกครั้ง

   ★ เดิมทำได้แค่สั่ง SQL ที่ฐานเอง (ดู RUNBOOK) ซึ่งแปลว่าในทางปฏิบัติ
     ไม่มีใครผูกให้ใครเลย — มีบัญชีเดียวที่ผูกไว้ตั้งแต่วันติดตั้ง
   ═══════════════════════════════════════════════════════════════════ */

/** รหัสไลน์ของจริงขึ้นต้นด้วย U แล้วตามด้วยเลขฐานสิบหก 32 ตัว */
const LINE_ID = /^U[0-9a-f]{32}$/i;

/**
 * GET /api/line/links — บัญชีไลน์ทั้งหมดที่เคยทักเข้ามา
 *
 * ★ เรียงจาก "ทักล่าสุด" ลงมา เพราะขั้นตอนจริงคือให้คนนั้นทักบอทก่อนหนึ่งครั้ง
 *   แล้วผู้ดูแลเข้ามาผูก — คนที่เพิ่งทักจึงต้องอยู่บนสุดเสมอ
 */
lineRouter.get("/links", requireAdmin, async (_req, res, next) => {
  try {
    const { rows } = await query(
      `select l.line_user_id as "lineUserId", l.farm_code as "farmCode",
              l.barn_code as "barnCode", l.updated_at as "updatedAt",
              u.id as "userId", u.username, u.display_name as "displayName",
              u.role, u.active
         from line_user l
         left join app_user u on u.id = l.app_user_id
        order by l.updated_at desc nulls last
        limit 200`,
    );
    res.json({ links: rows });
  } catch (err) { next(err); }
});

/**
 * PUT /api/line/links/:lineUserId — ผูกกับผู้ใช้คนหนึ่ง หรือส่ง userId เป็น null เพื่อถอน
 *
 * ★★ **ผูกกับบัญชีของคนนั้นเอง ไม่ใช่บัญชีผู้ดูแลระบบ** ช่องนี้คือคำตอบของคำถาม
 *   "ใครเป็นคนบันทึก" ซึ่งต้องตอบได้จริงเวลาตัวเลขเพี้ยนแล้วต้องไล่หาสาเหตุ
 *
 * ★ ไม่ได้ห้ามผูกบัญชีที่สิทธิ์ยังไม่ถึงผู้บันทึก — ผูกไว้ก่อนแล้วค่อยเลื่อนสิทธิ์ทีหลังได้
 *   แต่ตอบกลับไปด้วยว่าคนนี้ยังเขียนไม่ได้ หน้าจอจะได้บอกตรง ๆ ไม่ใช่ให้ไปงงเอาเอง
 *   (ด่านจริงอยู่ที่ `line/record.js` ซึ่งอ่านสิทธิ์จากฐานใหม่ทุกครั้งที่มีคนพิมพ์)
 */
lineRouter.put("/links/:lineUserId", requireAdmin, async (req, res, next) => {
  try {
    const lineUserId = String(req.params.lineUserId);
    if (!LINE_ID.test(lineUserId)) throw badRequest("รหัสไลน์ไม่ถูกต้อง");

    const userId = req.body?.userId ?? null;
    let user = null;
    if (userId !== null) {
      const { rows } = await query(
        `select id, username, display_name, role, active from app_user where id = $1`,
        [userId],
      );
      user = rows[0];
      if (!user) throw badRequest("ไม่พบบัญชีผู้ใช้ที่เลือก");
    }

    /* ★ อัปเดตเฉพาะแถวที่มีอยู่แล้ว — รหัสไลน์ที่ยังไม่เคยทักเข้ามาต้องไม่ถูกสร้างขึ้นมาลอย ๆ
       (พิมพ์รหัสผิดหนึ่งตัวแล้วได้แถวใหม่ที่ไม่มีวันมีคนใช้ ซึ่งหาไม่เจอทีหลัง) */
    const { rowCount } = await query(
      `update line_user set app_user_id = $2, updated_at = now() where line_user_id = $1`,
      [lineUserId, user?.id ?? null],
    );
    if (rowCount === 0) throw badRequest("ยังไม่มีบัญชีไลน์นี้ — ให้คนนั้นทักบอทก่อนหนึ่งครั้ง");

    await logActivity({
      kind: "admin",
      action: user ? "line.link" : "line.unlink",
      actor: req.user,
      target: user ? `${user.display_name} (${user.username})` : lineUserId.slice(0, 9) + "…",
      detail: { lineUserId, role: user?.role },
    });

    res.json({
      lineUserId,
      user: user && {
        id: user.id, username: user.username, displayName: user.display_name,
        role: user.role, active: user.active,
      },
      /* ผูกแล้วแต่ยังเขียนไม่ได้ — หน้าจอต้องบอก ไม่ใช่ให้ไปลองเองแล้วงง */
      canRecord: Boolean(user && user.active && roleAtLeast(user, MIN_ROLE)),
    });
  } catch (err) { next(err); }
});
