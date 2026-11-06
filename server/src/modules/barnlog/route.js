import { Router } from "express";
import { logActivity } from "../../activity/log.js";
import { query } from "../../db/pool.js";
import { badRequest, notFound } from "../../lib/error.js";
import { requireAuth, requireRole } from "../../lib/auth.js";
import { BARN_KEY, checkEntry } from "../../barnlog/validate.js";
/* ชื่อไทยของชนิดบันทึก — ใช้ตัวเดียวกับที่ไลน์และหน้าเว็บใช้ ไม่สร้างชุดที่สอง
   (ถ้าแยกกันถือ รายการเดียวกันจะถูกเรียกคนละชื่อในแจ้งเตือนกับบนหน้าจอ) */
import { LOG_LABEL } from "../../line/recordText.js";

/**
 * บันทึกของคนในโรงเรือน (T1.269) — /api/barn-logs/:barnKey
 *
 *   GET    /:barnKey             อ่านได้ทุกระดับที่ล็อกอิน
 *   POST   /:barnKey             เพิ่ม            ┐
 *   PATCH  /:barnKey/:id         แก้              ├ ผู้บันทึกขึ้นไป (record.write ฝั่งหน้าเว็บ)
 *   DELETE /:barnKey/:id         ลบแบบซ่อน        │
 *   POST   /:barnKey/import      ย้ายของในเครื่อง ┘ ส่งซ้ำได้ ไม่ได้แถวซ้ำ (client_id)
 *
 * รูปหนึ่งรายการที่ตอบกลับ = รูปเดิมของ lib/barnLog.js: { id, type, amount, unit, note, by, at }
 * `at` เป็นเวลาไทยไม่มีโซน ("2026-09-18T14:05:00") หน้าเว็บจึงใช้ต่อได้โดยไม่ต้องแก้
 */
export const barnLogRouter = Router();

barnLogRouter.use(requireAuth);

const COLUMNS = `id, type, amount, unit, note, by_name as "by",
  to_char(at at time zone 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS') as at`;

function keyOf(req) {
  const key = req.params.barnKey;
  if (!BARN_KEY.test(key)) throw badRequest("รหัสโรงเรือนไม่ถูกต้อง", { got: key });
  return key;
}

function valid(body, opt) {
  const r = checkEntry(body, opt);
  if (!r.ok) throw badRequest("ข้อมูลบันทึกไม่ถูกต้อง", { fields: r.errors });
  return r.value;
}

const UUID = /^[0-9a-f-]{36}$/i;

barnLogRouter.get("/:barnKey", async (req, res, next) => {
  try {
    const key = keyOf(req);
    const { rows } = await query(
      `select ${COLUMNS} from barn_log
        where barn_key = $1 and deleted_at is null
        order by at desc, created_at desc
        limit 500`,
      [key],
    );
    res.json({ barnKey: key, entries: rows });
  } catch (err) { next(err); }
});

barnLogRouter.post("/:barnKey", requireRole("editor"), async (req, res, next) => {
  try {
    const key = keyOf(req);
    const v = valid(req.body);
    const { rows } = await query(
      `insert into barn_log (barn_key, type, amount, unit, note, by_name, at, created_by)
       values ($1, $2, $3, $4, $5, $6, ($7::timestamp at time zone 'Asia/Bangkok'), $8)
       returning ${COLUMNS}`,
      [key, v.type, v.amount, v.unit, v.note ?? "", v.by ?? "", v.at, req.user.id],
    );
    await logActivity({ kind: "barnlog", action: "barnlog.create", actor: req.user,
      target: key, detail: { label: LOG_LABEL[v.type] ?? v.type, amount: v.amount, unit: v.unit } });
    res.status(201).json({ entry: rows[0] });
  } catch (err) { next(err); }
});

barnLogRouter.patch("/:barnKey/:id", requireRole("editor"), async (req, res, next) => {
  try {
    const key = keyOf(req);
    if (!UUID.test(req.params.id)) throw notFound("รายการนี้");
    const v = valid(req.body, { partial: true });
    const { rows } = await query(
      `update barn_log set
         type    = coalesce($3, type),
         amount  = coalesce($4, amount),
         unit    = coalesce($5, unit),
         note    = coalesce($6, note),
         at      = coalesce(($7::timestamp at time zone 'Asia/Bangkok'), at),
         updated_by = $8, updated_at = now()
       where barn_key = $1 and id = $2 and deleted_at is null
       returning ${COLUMNS}`,
      [key, req.params.id, v.type ?? null, v.amount ?? null, v.unit ?? null, v.note ?? null, v.at ?? null, req.user.id],
    );
    if (rows.length === 0) throw notFound("รายการนี้");
    res.json({ entry: rows[0] });
  } catch (err) { next(err); }
});

barnLogRouter.delete("/:barnKey/:id", requireRole("editor"), async (req, res, next) => {
  try {
    const key = keyOf(req);
    if (!UUID.test(req.params.id)) throw notFound("รายการนี้");
    const { rowCount } = await query(
      `update barn_log set deleted_by = $3, deleted_at = now()
        where barn_key = $1 and id = $2 and deleted_at is null`,
      [key, req.params.id, req.user.id],
    );
    if (rowCount === 0) throw notFound("รายการนี้");
    await logActivity({ kind: "barnlog", action: "barnlog.delete", actor: req.user, target: key });
    res.status(204).end();
  } catch (err) { next(err); }
});

/**
 * ย้ายบันทึกที่ค้างในเครื่องขึ้นฐาน — แถวที่ข้อมูลเพี้ยนข้ามไป (บอกจำนวนกลับไป) ไม่ทำให้ทั้งชุดล้ม
 * `client_id` กันซ้ำ: เครื่องเดิมกดซ้ำ หรือหน้าจอส่งซ้ำตอนเน็ตกระตุก ก็ได้แถวเดียว
 */
barnLogRouter.post("/:barnKey/import", requireRole("editor"), async (req, res, next) => {
  try {
    const key = keyOf(req);
    const list = Array.isArray(req.body?.entries) ? req.body.entries.slice(0, 500) : null;
    if (!list) throw badRequest("ต้องส่ง entries เป็นรายการ");

    let added = 0;
    let skipped = 0;
    for (const e of list) {
      const r = checkEntry(e);
      const clientId = typeof e?.id === "string" ? e.id.slice(0, 64) : null;
      if (!r.ok || !clientId) { skipped += 1; continue; }
      const v = r.value;
      const { rowCount } = await query(
        `insert into barn_log (barn_key, type, amount, unit, note, by_name, at, client_id, created_by)
         values ($1, $2, $3, $4, $5, $6, ($7::timestamp at time zone 'Asia/Bangkok'), $8, $9)
         on conflict (barn_key, client_id) do nothing`,
        [key, v.type, v.amount, v.unit, v.note ?? "", v.by ?? "", v.at, clientId, req.user.id],
      );
      added += rowCount;
    }
    res.json({ added, skipped, already: list.length - added - skipped });
  } catch (err) { next(err); }
});
