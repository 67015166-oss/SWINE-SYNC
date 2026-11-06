import { Router } from "express";
import { logActivity } from "../../activity/log.js";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../lib/auth.js";
import { comfortChanges } from "../../alerts/changed.js";

export const alertsRouter = Router();

/**
 * GET /api/alerts — แจ้งเตือนที่ยังไม่ปิด (ใหม่→เก่า)
 *
 * **ไม่มีคอลัมน์ข้อความไทยในคำตอบ** — ส่ง `code` + `params` ไปให้หน้าจอประกอบเอง
 * ผ่าน `t()` ไม่งั้นสลับภาษาแล้วแจ้งเตือนจะยังเป็นไทยอยู่ทั้งตาราง
 * (`barn_name` / `farm_name` เป็นชื่อเฉพาะ ไม่ใช่ข้อความที่ต้องแปล)
 *
 * ?status=open|acknowledged|resolved|all  (ค่าตั้งต้น = ที่ยังไม่ปิด)
 * ?farm=<id>                               กรองเฉพาะฟาร์มเดียว
 */
alertsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const { status = "", farm = "" } = req.query;
    const where = [];
    const params = [];

    if (status === "all") {
      /* ไม่กรอง */
    } else if (["open", "acknowledged", "resolved"].includes(status)) {
      params.push(status);
      where.push(`a.status = $${params.length}`);
    } else {
      where.push(`a.status <> 'resolved'`);
    }

    if (farm) {
      params.push(farm);
      where.push(`b.farm_id = $${params.length}`);
    }

    const { rows } = await query(
      `select a.id, a.barn_id, b.farm_id, b.name as barn_name, f.name as farm_name,
              a.category, a.level, a.code, a.params, a.metric, a.value,
              a.threshold_used, a.opened_at, a.status
       from alert a
       join barn b on b.id = a.barn_id
       join farm f on f.id = b.farm_id
       ${where.length ? `where ${where.join(" and ")}` : ""}
       order by
         case a.level when 'critical' then 0 when 'serious' then 1 else 2 end,
         a.opened_at desc
       limit 200`,
      params,
    );
    res.json({ alerts: rows });
  } catch (err) { next(err); }
});

/**
 * GET /api/alerts/rules — เกณฑ์ที่เครื่องคิดแจ้งเตือนใช้อยู่จริง
 *
 * มีไว้ให้หน้าตั้งค่าเทียบได้ว่า "เลขที่เห็นบนจอ" กับ "เลขที่หลังบ้านใช้ตัดสิน" ตรงกันไหม
 * เคยพลาดมาแล้วว่าสองฝั่งใช้คนละเกณฑ์แล้วไม่มีใครรู้
 */
/* ต้องล็อกอิน (T1.242) — หน้าเว็บดึงใหม่เองทุกครั้งที่มีคนเข้าระบบ ดู useAlertRuleSync */
alertsRouter.get("/rules", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `select id, scope, farm_id, barn_id, metric, comparator,
              threshold_min, threshold_max, level, hold_minutes, enabled
       from alert_rule
       order by metric, scope`,
    );
    res.json({ rules: rows });
  } catch (err) { next(err); }
});

/* ---------- ขอบเขตที่ยอมรับได้ของแต่ละเกณฑ์ ----------
   ต้องตรงกับ LIMITS ในหน้าตั้งค่าฝั่งหน้าเว็บ (src/lib/settings/defaults.js)
   **ตรวจซ้ำที่นี่ด้วย ไม่เชื่อค่าที่ส่งมา** — หลังบ้านยังไม่มีระบบยืนยันตัวตน
   ใครยิงตรงเข้ามาก็ได้ ถ้าไม่ตรวจแล้วมีคนตั้งเพดานความชื้นเป็น 0
   ทุกโรงเรือนจะเตือนพร้อมกันทั้งเครือจนใช้งานไม่ได้ */
const BOUNDS = {
  tempMin: [10, 30],
  tempMax: [20, 40],
  humidityMin: [20, 80],
  humidityMax: [40, 100],
  nh3Limit: [5, 50],
};

const isValid = (key, value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= BOUNDS[key][0] &&
  value <= BOUNDS[key][1];

/**
 * PUT /api/alerts/rules — ตั้งเกณฑ์ระดับระบบจากหน้าตั้งค่า
 *
 * แก้ได้เฉพาะ **ตัวเลขของเกณฑ์ระดับ global** เท่านั้น — เพิ่ม/ลบกฎ หรือแก้กฎรายฟาร์ม
 * ยังทำไม่ได้จากที่นี่ ตั้งใจให้ทำได้แคบที่สุดเท่าที่หน้าตั้งค่าต้องใช้จริง
 *
 * **ต้องเป็นผู้บันทึกขึ้นไป** (T1.251 — ผู้ใช้เลือกให้เกณฑ์และการแจ้งเตือนอยู่ใน "แก้ไขบางส่วน")
 * เกณฑ์นี้มีผลกับทุกคนที่ใช้ระบบ ไม่ใช่ค่าส่วนตัวของใคร
 * (ฝั่งหน้าเว็บกันไว้ด้วย `can("rules.write")` อยู่แล้ว ตรงนี้คือด่านจริง)
 */
alertsRouter.put("/rules", requireAuth, requireRole("editor"), async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const bad = Object.keys(BOUNDS).filter(
      (k) => body[k] !== undefined && !isValid(k, body[k]),
    );
    if (bad.length > 0) {
      return res.status(400).json({
        error: { code: "bad_threshold", message: `ค่านอกขอบเขตที่ยอมรับ: ${bad.join(", ")}` },
      });
    }

    /* ช่วงต้องไม่กลับหัว — ขั้นต่ำสูงกว่าเพดานแล้วทุกค่าจะผิดเกณฑ์ตลอดเวลา */
    if (body.tempMin !== undefined && body.tempMax !== undefined && body.tempMin >= body.tempMax) {
      return res.status(400).json({
        error: { code: "bad_range", message: "อุณหภูมิขั้นต่ำต้องน้อยกว่าเพดาน" },
      });
    }
    if (
      body.humidityMin !== undefined &&
      body.humidityMax !== undefined &&
      body.humidityMin >= body.humidityMax
    ) {
      return res.status(400).json({
        error: { code: "bad_range", message: "ความชื้นขั้นต่ำต้องน้อยกว่าเพดาน" },
      });
    }

    const updates = [
      ["temp_c", body.tempMin, body.tempMax],
      ["humidity", body.humidityMin, body.humidityMax],
      /* NH3 มีแต่เพดาน ไม่มีขั้นต่ำ — ต้องเป็น `undefined` ไม่ใช่ `null`
         ไม่งั้นบรรทัด "ไม่มีอะไรให้แก้ก็ข้าม" ข้างล่างไม่ทำงาน แล้วแถว NH3 จะถูกเขียนทับ
         ด้วยค่าเดิมทุกครั้งที่มีคนบันทึกเกณฑ์อื่น ทำให้ updated_at ขยับทั้งที่ไม่มีใครแก้ */
      ["nh3", undefined, body.nh3Limit],
    ];

    /* ★★ อ่านค่าเดิมไว้ก่อนเขียน — ต้องอยู่ตรงนี้ ไม่ใช่หลังลูป
       ถ้าไปอ่านทีหลังจะได้ค่าใหม่ แล้วการเทียบ "เปลี่ยนจริงไหม" จะตอบว่าไม่เปลี่ยนเสมอ */
    const { rows: beforeRows } = await query(
      `select metric, threshold_min, threshold_max from alert_rule where scope = 'global'`,
    );

    for (const [metric, min, max] of updates) {
      if (min === undefined && max === undefined) continue;
      await query(
        `update alert_rule
         set threshold_min = coalesce($2, threshold_min),
             threshold_max = coalesce($3, threshold_max),
             updated_at = now()
         where scope = 'global' and metric = $1`,
        [metric, min ?? null, max ?? null],
      );
    }

    const { rows } = await query(
      `select metric, threshold_min, threshold_max from alert_rule where scope = 'global'`,
    );
    /* ★★ บันทึกเฉพาะช่องที่ **ค่าเปลี่ยนจริง** ไม่ใช่ทุกช่องที่ส่งมา
       เหตุผลเต็มและกับดักการเทียบตัวเลขอยู่ใน `alerts/changed.js` */
    const changes = comfortChanges(beforeRows, body);

    if (changes.length > 0) {
      /* ★ ส่งคู่ "ค่าเก่า → ค่าใหม่" ไปด้วย ข้อความแจ้งเตือนจะได้บอกได้ว่าเปลี่ยนเท่าไร
         ไม่ใช่แค่บอกว่าแตะช่องไหน (ดู activity/kinds.js) */
      await logActivity({ kind: "settings", action: "comfort.update", actor: req.user,
        target: "", detail: { changes, changed: changes.map((c) => c.field) } });
    }
    res.json({ rules: rows });
  } catch (err) { next(err); }
});
