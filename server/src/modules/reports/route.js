import { Router } from "express";
import { query } from "../../db/pool.js";
import { badRequest, notFound } from "../../lib/error.js";
import { requireAuth, requireRole } from "../../lib/auth.js";
import { buildShiftReport } from "../../reports/shiftReport.js";

/**
 * รายงานส่งเวร (T1.268) — ต่อท้าย /api/barns ร่วมกับ readingsRouter
 *
 *   GET  /api/barns/:id/shift-report?from=<ISO>&to=<ISO>   อ่านได้ทุกระดับที่ล็อกอิน
 *   POST /api/barns/:id/shift-report/handover               "รับเวรแล้ว" — ผู้บันทึกขึ้นไป
 *
 * ช่วงเวลาเป็นของหน้าเว็บ (เวลากะของฟาร์มตั้งที่หน้าเว็บ) หลังบ้านแค่ตรวจว่าสมเหตุสมผล
 */
export const reportsRouter = Router();

reportsRouter.use(requireAuth);

/** ยาวสุดที่ยอม — กะยาวสุด 12 ชม. แต่เผื่อรายงานรายสัปดาห์ของสัตวแพทย์ไว้ในอนาคต */
const MAX_SPAN_MS = 7 * 24 * 60 * 60 * 1000;

function periodOf(src) {
  const from = Date.parse(src?.from ?? "");
  const to = Date.parse(src?.to ?? "");
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    throw badRequest("from และ to ต้องเป็นเวลาแบบ ISO", { from: src?.from, to: src?.to });
  }
  if (to <= from) throw badRequest("to ต้องอยู่หลัง from");
  if (to - from > MAX_SPAN_MS) throw badRequest("ช่วงรายงานยาวเกิน 7 วัน");
  if (from > Date.now()) throw badRequest("ช่วงรายงานยังไม่เริ่ม");
  return { from, to };
}

async function barnOr404(id) {
  const { rows } = await query(
    `select b.id, b.code, b.name, f.name as farm_name, f.code as farm_code
       from barn b join farm f on f.id = b.farm_id
      where b.id = $1`,
    [id],
  );
  if (rows.length === 0) throw notFound("โรงเรือนนี้");
  return rows[0];
}

reportsRouter.get("/:id/shift-report", async (req, res, next) => {
  try {
    const { from, to } = periodOf(req.query);
    const barn = await barnOr404(req.params.id);
    res.json(await buildShiftReport(barn, from, to));
  } catch (err) { next(err); }
});

/**
 * กะถัดไปกด "รับเวรแล้ว" — บันทึกว่าใครรับ เมื่อไหร่ พร้อมหมายเหตุ
 * รับได้ครั้งเดียวต่อกะ (ใบรับเวรเป็นหลักฐาน แก้ย้อนหลังไม่ได้) · รับกะที่ยังไม่จบไม่ได้
 */
reportsRouter.post("/:id/shift-report/handover", requireRole("editor"), async (req, res, next) => {
  try {
    const { from, to } = periodOf(req.body);
    if (to > Date.now()) throw badRequest("กะนี้ยังไม่จบ รับเวรไม่ได้");
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 500) : "";
    const barn = await barnOr404(req.params.id);

    const { rows } = await query(
      `insert into shift_handover (barn_id, period_from, period_to, received_by, note)
       values ($1, $2, $3, $4, nullif($5, ''))
       on conflict (barn_id, period_from, period_to) do nothing
       returning received_at`,
      [barn.id, new Date(from), new Date(to), req.user.id, note],
    );
    if (rows.length === 0) {
      return res.status(409).json({
        error: { code: "already_received", message: "กะนี้มีคนรับเวรไปแล้ว" },
      });
    }
    res.status(201).json({
      handover: { received_at: rows[0].received_at, note: note || null, received_by_name: req.user.display_name },
    });
  } catch (err) { next(err); }
});
