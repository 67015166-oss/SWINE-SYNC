/**
 * เส้นทางให้ Node-RED มาดึงคำสั่งที่ค้างอยู่ แล้วบอกกลับว่าส่งให้ PLC สำเร็จไหม (T1.310)
 *
 * เหตุผลที่คำสั่งเดินทางแบบ "ให้มาดึง" แทนที่จะ "ยิงไปเลย" อยู่ใน `control/outbox.js`
 *
 * ═══ ★ ทำไมไม่ใช้ระบบล็อกอินปกติ ═══
 * เส้นทางอื่นใช้ `requireAuth` ซึ่งผูกกับบัญชีคน แต่ Node-RED ไม่ใช่คน
 * ถ้าให้มันล็อกอินด้วยบัญชีจริง แปลว่าต้องเอารหัสผ่านของใครสักคนไปฝังไว้ใน Node-RED
 * และเวลามีคนลาออกหรือเปลี่ยนรหัส ท่อส่งคำสั่งจะพังเงียบ ๆ โดยไม่มีใครโยงเหตุได้
 *
 * จึงใช้ **กุญแจเฉพาะของเครื่องต่อเครื่อง** (`CONTROL_OUTBOX_TOKEN`) แทน
 * ไม่ได้ตั้ง = เส้นทางนี้ปิดสนิท ตอบ 503 (ไม่ใช่เปิดทิ้งไว้แบบไม่มีรหัส)
 */
import { Router } from "express";
import { query } from "../../db/pool.js";
import { AppError, badRequest, notFound } from "../../lib/error.js";
import { safeEqual } from "../../lib/auth.js";
import { log } from "../../lib/log.js";
import { OUTBOX_STATUS, OUTBOX_TRANSPORT, ackStatus, checkAck, clampLimit, toOutboxItem } from "../../control/outbox.js";

export const outboxRouter = Router();

const secret = () => (process.env.CONTROL_OUTBOX_TOKEN || "").trim();

/**
 * ★ เทียบกุญแจด้วย `safeEqual` ไม่ใช่ `===`
 *   การเทียบสตริงแบบปกติหยุดทันทีที่เจอตัวอักษรต่าง เวลาที่ใช้จึงบอกใบ้ว่าเดาถูกกี่ตัว
 */
function requireOutboxToken(req, res, next) {
  const want = secret();
  if (!want) {
    next(new AppError(503, "outbox_disabled",
      "ยังไม่ได้เปิดกล่องขาออก — ตั้ง CONTROL_OUTBOX_TOKEN ใน .env ก่อน"));
    return;
  }
  const got = String(req.get("x-outbox-token") ?? "");
  if (!safeEqual(got, want)) {
    /* ★ บันทึกไว้ด้วย — มีคนพยายามเข้าท่อสั่งอุปกรณ์ด้วยกุญแจผิด เป็นเรื่องที่ต้องรู้ */
    log.warn({ ip: req.ip }, "กล่องขาออก: กุญแจไม่ถูกต้อง");
    next(new AppError(401, "bad_outbox_token", "กุญแจของกล่องขาออกไม่ถูกต้อง"));
    return;
  }
  next();
}

outboxRouter.use(requireOutboxToken);

/**
 * GET /api/control/outbox?limit=10 — คำสั่งที่รออยู่ เก่าก่อนใหม่
 *
 * เก่าก่อนใหม่เสมอ เพราะคำสั่งอุปกรณ์มีลำดับ — สั่ง "เปิด" แล้ว "ปิด"
 * ถ้าส่งสลับลำดับ ผลลัพธ์กลับด้านและไม่มีใครรู้ว่าเกิดอะไรขึ้น
 */
outboxRouter.get("/", async (req, res, next) => {
  try {
    const limit = clampLimit(req.query.limit);
    const { rows } = await query(
      `select c.id, c.barn_key, c.device_kind, c.device_id, c.action, c.hz, c.requested_at,
              d.remote_addr
         from control_command c
         left join control_device d
                on d.barn_key = c.barn_key and d.device_id = c.device_id
        where c.status = $1 and c.transport = $2
        order by c.requested_at asc
        limit $3`,
      [OUTBOX_STATUS, OUTBOX_TRANSPORT, limit],
    );
    res.json({ commands: rows.map(toOutboxItem).filter(Boolean) });
  } catch (err) { next(err); }
});

/**
 * POST /api/control/outbox/:id/ack — บอกผลว่าส่งให้ PLC สำเร็จไหม
 *
 * ★ ปิดได้ครั้งเดียว — ถ้ารายการนั้นถูกปิดไปแล้วจะตอบ 409 ไม่ใช่เขียนทับเงียบ ๆ
 *   เพราะการเขียนทับจะลบร่องรอยว่าเคยส่งไม่สำเร็จมาก่อน
 */
outboxRouter.post("/:id/ack", async (req, res, next) => {
  try {
    const verdict = checkAck(req.body);
    if (!verdict.ok) throw badRequest(verdict.message);

    const { rows } = await query(
      `update control_command
          set status = $1, detail = $2, settled_at = now()
        where id = $3 and status = $4 and transport = $5
        returning id, status, detail, settled_at`,
      [ackStatus(verdict.sent), verdict.detail, req.params.id, OUTBOX_STATUS, OUTBOX_TRANSPORT],
    );

    if (rows.length === 0) {
      const { rows: found } = await query(
        `select status, settled_at from control_command where id = $1`,
        [req.params.id],
      );
      if (found.length === 0) throw notFound("ไม่พบคำสั่งนี้");
      throw new AppError(409, "already_settled",
        `คำสั่งนี้ถูกปิดไปแล้ว (สถานะ ${found[0].status})`);
    }

    log.info(
      { คำสั่ง: req.params.id, ผล: rows[0].status, รายละเอียด: verdict.detail },
      "กล่องขาออก: Node-RED รายงานผล",
    );
    res.json({ command: rows[0] });
  } catch (err) { next(err); }
});
