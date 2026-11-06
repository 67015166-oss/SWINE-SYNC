import { Router } from "express";
import { logActivity } from "../../activity/log.js";
import { query, withTransaction } from "../../db/pool.js";
import { requireAuth, requireAdmin } from "../../lib/auth.js";
import { badRequest, notFound } from "../../lib/error.js";
import { normalizeBarn, normalizeFarm, updateParts } from "./validate.js";

export const farmsRouter = Router();

/* ข้อมูลฟาร์มจริงทั้งหมด — **ต้องล็อกอินก่อน** (T1.242)
   เดิมอ่านได้โดยไม่มี token และเว็บพอร์ต 8080 เปิดรับทั้งวง Wi-Fi ใครในวงเดียวกันก็ดึงได้ */
farmsRouter.use(requireAuth);

/**
 * GET /api/farms — รายการฟาร์ม + ตัวเลขสรุป (จาก v_farm_summary ที่เดียว)
 *
 * `?include=inactive` เอาฟาร์มที่ปิดการใช้งานไว้มาด้วย — หน้าจัดการต้องเห็นเพื่อกดกู้คืนได้
 * ค่าตั้งต้นไม่เอามา เพราะทุกหน้าที่เหลืออ่านเส้นทางนี้เพื่อแสดงฟาร์มที่ใช้งานอยู่
 */
farmsRouter.get("/", async (req, res, next) => {
  try {
    const all = String(req.query.include ?? "") === "inactive";
    const { rows } = await query(`
      select s.farm_id as id, s.code, s.name, s.province, s.data_source,
             s.barn_count, s.open_alerts, s.last_reading_at,
             f.district, f.lat, f.lng, f.active
      from v_farm_summary s
      join farm f on f.id = s.farm_id
      ${all ? "" : "where f.active"}
      order by s.code
    `);
    res.json({ farms: rows });
  } catch (err) { next(err); }
});

/**
 * ช่วงเวลาที่ย้อนไปเก็บหลักฐาน "เซนเซอร์ค้าง" ของไทล์ค่าปัจจุบัน (T1.315)
 *
 * 24 ชั่วโมงให้ 24 ช่วงรายชั่วโมง ซึ่งเกินขั้นต่ำ 12 จุด / 6 ชั่วโมงที่กติกาต้องการ
 * สั้นกว่านี้จะตัดสินไม่ได้ในวันที่เซนเซอร์เพิ่งกลับมาส่ง · ยาวกว่านี้ไม่ได้ช่วยอะไรเพิ่ม
 * เพราะคำถามคือ "ตอนนี้ยังวัดอยู่ไหม" ไม่ใช่ "เคยวัดได้ไหม"
 */
const STUCK_WINDOW_H = 24;

/**
 * หลักฐานว่าเซนเซอร์ของโรงเรือนเหล่านี้ "ส่งค่าเดิมซ้ำ" หรือ "วัดจริง" (T1.315)
 *
 * ═══ ★ ส่งหลักฐาน ไม่ใช่คำตัดสิน ═══
 * ที่นี่ไม่ตอบว่าค้างหรือไม่ค้าง — ตอบแค่ว่า **นับได้กี่ช่วง · กินเวลากี่ชั่วโมง ·
 * กี่ช่วงที่ต่ำสุดเท่ากับสูงสุด** แล้วให้ `stuckFromEvidence` ฝั่งหน้าจอเป็นคนตัดสิน
 * ซึ่งเป็นตัวเดียวกับที่กราฟย้อนหลังใช้อยู่
 *
 * ถ้าตัดสินด้วย SQL ที่นี่ จะมีกติกาสองชุด (SQL กับ JS) ที่เพี้ยนออกจากกันได้เงียบ ๆ
 * แล้ววันหนึ่งไทล์จะบอกว่า "ค้าง" ขณะที่กราฟข้างล่างยังวาดเส้นให้ — ซึ่งผิดข้อ
 * **"ระบบเดียวกันต้องไม่บอกคนละอย่าง"** (T1.312)
 *
 * ═══ ★★ ส่ง "จำนวนครั้งที่ค่าเปลี่ยนระหว่างชั่วโมง" ไม่ใช่ "กี่ชั่วโมงที่เข็มไม่ขยับ" ═══
 * กติกาค้างมีสองทางตัดสิน และ **เส้นแบ่ง 0.8 ของทางแรกวัดมาจากช่วงแบบ "รายวัน"**
 * (T1.304: ในเล้าไม่ขยับ 0/108 วัน · นอกอาคาร 23/27 วัน) ย้ายมาใช้ช่วง "รายชั่วโมง"
 * ตัวเลขชุดนั้น **ใช้ไม่ได้อีก** — วัดของจริง 14 วันย้อนหลัง (8 ต.ค. 2569) ได้:
 *
 *   สัดส่วนชั่วโมงที่เข็มไม่ขยับ    ในเล้า 0.29–0.93   นอกอาคาร 1.00   ← ★ คาบกับเส้น 0.8
 *   สัดส่วนชั่วโมงที่ค่าเปลี่ยน     ในเล้า 0.85–1.00   นอกอาคาร 0.00   ← ห่างกันคนละโลก
 *
 * วันที่ 27 ก.ย. เซนเซอร์ในเล้าที่ยังดีอยู่มีชั่วโมงที่ไม่ขยับถึง **0.93** ซึ่งเกิน 0.8
 * ถ้าส่งหลักฐานแบบ min/max ไปตัดสิน **เซนเซอร์ที่ดีจะถูกหาว่าค้าง** ในวันที่เล้านิ่ง
 *
 * เหตุผลที่สองทางให้คำตอบต่างกันขนาดนี้: ชั่วโมงเดียวของเล้าที่คุมอุณหภูมิได้ดี
 * "ไม่ขยับ" ได้เป็นเรื่องปกติ แต่ **ค่าของมันต่างจากชั่วโมงก่อนหน้าเสมอ** เพราะค่อย ๆ ไหล
 * ส่วนเซนเซอร์ที่ไม่ได้วัดเลยจะส่งเลขเดียวกันทุกชั่วโมงไม่มีข้อยกเว้น
 *
 * จึงจงใจ **ไม่ส่ง** `buckets`/`flatBuckets` ออกไป เพื่อให้ตัวตัดสินใช้ทางที่สอง
 * (`stuckFromEvidence` เลือกทางจากหลักฐานที่มี — ดู lib/sensorHealth.js)
 *
 * คีย์เป็น `"<ค่าที่วัด>|<in|out>"` ชุดเดียวกับที่หน้าจอใช้กับกราฟ
 */
async function stuckEvidenceByBarn(farmId) {
  const { rows } = await query(
    `with bucketed as (
       select sr.barn_id, sr.metric, d.outdoor,
              time_bucket('1 hour', sr.at) as bucket,
              avg(sr.value) as mid
         from sensor_reading sr
         join device d on d.id = sr.device_id
        where sr.barn_id in (select id from barn where farm_id = $1 and active)
          and d.active
          and sr.at >= now() - ($2 || ' hours')::interval
        group by 1, 2, 3, 4
     ),
     stepped as (
       select *,
              lag(mid) over (partition by barn_id, metric, outdoor order by bucket) as prev
         from bucketed
     )
     select barn_id, metric, outdoor,
            count(*)::int as points,
            (extract(epoch from (max(bucket) - min(bucket))) / 3600)::real as span_hours,
            count(*) filter (where prev is not null and mid is distinct from prev)::int as changes
       from stepped
      group by 1, 2, 3`,
    [farmId, String(STUCK_WINDOW_H)],
  );

  const byBarn = {};
  for (const r of rows) {
    const key = `${r.metric}|${r.outdoor ? "out" : "in"}`;
    (byBarn[r.barn_id] ??= {})[key] = {
      points: r.points,
      spanHours: r.span_hours,
      changes: r.changes,
    };
  }
  return byBarn;
}

/** GET /api/farms/:id/barns — โรงเรือนพร้อมค่าล่าสุดทุก metric */
farmsRouter.get("/:id/barns", async (req, res, next) => {
  try {
    /* `?include=inactive` — หน้าจัดการต้องเห็นโรงเรือนที่ปิดไว้เพื่อกดกู้คืนได้ (T1.316) */
    const all = String(req.query.include ?? "") === "inactive";
    const { rows } = await query(
      `select b.id, b.code, b.name, b.stage, b.capacity, b.data_source,
              coalesce(
                jsonb_object_agg(
                  c.metric,
                  jsonb_build_object('value', c.value, 'at', c.at, 'devices', c.device_count)
                ) filter (where c.metric is not null and not c.outdoor),
                '{}'::jsonb
              ) as current,
              coalesce(
                jsonb_object_agg(
                  c.metric,
                  jsonb_build_object('value', c.value, 'at', c.at, 'devices', c.device_count)
                ) filter (where c.metric is not null and c.outdoor),
                '{}'::jsonb
              ) as outdoor
       from barn b
       left join v_barn_current c on c.barn_id = b.id
       where b.farm_id = $1 ${all ? "" : "and b.active"}
       group by b.id
       order by b.code`,
      [req.params.id],
    );

    /* หลักฐานเซนเซอร์ค้าง — ★ คิวรีแยกโดยเจตนา ไม่ยัดรวมกับคิวรีค่าล่าสุด
       เพราะอันนั้นอ่านจาก view ที่สรุปมาแล้ว ส่วนอันนี้ต้องย้อนดูของดิบ 24 ชม.
       ถ้าเอามารวมเป็นคิวรีเดียว ค่าล่าสุดของทุกโรงเรือนจะพลอยช้าตามไปด้วย
       (บทเรียนจาก T1.313 — หน้าจอมีเพดานรอแค่ 8 วินาที) */
    const evidence = await stuckEvidenceByBarn(req.params.id);

    res.json({ barns: rows.map((b) => ({ ...b, stuck_evidence: evidence[b.id] ?? {} })) });
  } catch (err) { next(err); }
});

/**
 * GET /api/farms/:id/herd — ยอดเหตุการณ์สุกรของแต่ละเล้า สำหรับนับจำนวนสุกร (T1.321)
 *
 * ★ **ส่งยอดดิบแยกชนิด ไม่ใช่คำตอบว่า "มีกี่ตัว"** — ตัวตัดสินอยู่ที่ `lib/herdCount.js`
 *   ฝั่งเดียวกับที่หน้าโรงเรือนใช้ กติกาจึงมีชุดเดียวทั้งระบบ (แบบเดียวกับ T1.315)
 *   ที่สำคัญคือกติกานั้นแยก "ยังไม่รู้" ออกจาก "ศูนย์" ซึ่ง SQL ตอบแทนให้ไม่ได้
 *
 * ★ `barn_log.barn_key` เก็บเป็น **ไอดีระดับแอป** (`F-KPP-A1`) ไม่ใช่ uuid
 *   จึงต่อจาก `farm.code || '-' || barn.code` ไม่ใช่ join ด้วย id
 *   (ที่เป็นอย่างนี้เพราะหน้าจอบันทึกด้วยไอดีที่มันถืออยู่ ดู lib/barnLog.js)
 *
 * ★ กรองสองอย่างที่พลาดแล้วตัวเลขผิดเงียบ ๆ
 *   · `deleted_at is null` — รายการที่ถูกลบต้องไม่ถูกนับต่อ
 *   · `unit = 'ตัว'` — บันทึกให้อาหาร 200 กิโลกรัมต้องไม่กลายเป็นสุกร 200 ตัว
 */
farmsRouter.get("/:id/herd", async (req, res, next) => {
  try {
    const { rows } = await query(
      `select b.code as barn_code,
              f.code || '-' || b.code as barn_key,
              coalesce(sum(l.amount) filter (where l.type = 'moveIn'), 0)::real  as move_in,
              coalesce(sum(l.amount) filter (where l.type = 'moveOut'), 0)::real as move_out,
              coalesce(sum(l.amount) filter (where l.type = 'dead'), 0)::real    as dead,
              coalesce(sum(l.amount) filter (where l.type = 'missing'), 0)::real as missing,
              count(l.id)::int as entries,
              max(l.at) as last_at
         from barn b
         join farm f on f.id = b.farm_id
         left join barn_log l
               on l.barn_key = f.code || '-' || b.code
              and l.deleted_at is null
              and l.unit = 'ตัว'
        where b.farm_id = $1 and b.active
        group by b.id, b.code, f.code
        order by b.code`,
      [req.params.id],
    );
    res.json({ barns: rows });
  } catch (err) { next(err); }
});

/* ══════════════════════════════════════════════════════════════════
   จัดการฟาร์ม/โรงเรือน — ผู้ดูแลระบบเท่านั้น (T1.316)

   ★★ **ไม่มีการลบจริงในนี้เลยแม้แต่เส้นทางเดียว** — `DELETE` ทุกตัวแค่ตั้ง active = false

   เหตุผลไม่ใช่เรื่องความสุภาพ แต่เป็นเรื่องที่จะพังจริง:
   `sensor_reading` → `device` → `barn` → `farm` ผูกกันด้วย foreign key
   ลบฟาร์มจริงจะได้ผลหนึ่งในสองอย่าง — ฐานปฏิเสธเพราะมีลูกอยู่ (ดีหน่อย)
   หรือถ้าใครเผลอเติม `on delete cascade` วันหลัง **ค่าเซนเซอร์สี่แสนกว่าแถวหายไปด้วย**
   ซึ่งเอากลับมาไม่ได้เลยเพราะ MQTT เป็น QoS 0 ไม่มีใครเก็บต้นฉบับไว้

   ฝั่งหน้าจอก็ออกแบบมาแบบนี้อยู่แล้ว — ปุ่มลบมีปุ่ม "กู้คืน" คู่กันเสมอ
   ══════════════════════════════════════════════════════════════════ */

const manage = [requireAdmin];

/** รหัสซ้ำ — ฐานตอบ 23505 ซึ่งอ่านไม่รู้เรื่อง ต้องแปลงเป็นข้อความที่บอกได้ว่าต้องแก้อะไร */
function rethrowDuplicate(err, what, code) {
  if (err?.code === "23505") {
    return badRequest(`มี${what}รหัส ${code} อยู่แล้ว — รหัสต้องไม่ซ้ำ`, { code });
  }
  return err;
}

async function farmOr404(id) {
  const { rows } = await query(`select * from farm where id = $1`, [id]);
  if (rows.length === 0) throw notFound("ฟาร์มนี้");
  return rows[0];
}

async function barnOf(farmId, barnId) {
  const { rows } = await query(`select * from barn where id = $1 and farm_id = $2`, [barnId, farmId]);
  if (rows.length === 0) throw notFound("โรงเรือนนี้ในฟาร์มนี้");
  return rows[0];
}

/**
 * POST /api/farms — สร้างฟาร์มใหม่
 *
 * `company_id` ของฐานเป็น not null — ระบบนี้มีบริษัทเดียว จึงหยิบใบที่มีอยู่มาใช้
 * ไม่เปิดให้ส่งมาจากหน้าจอ เพราะยังไม่มีหน้าจัดการบริษัทและไม่ควรให้เดา id
 */
farmsRouter.post("/", manage, async (req, res, next) => {
  try {
    const fields = normalizeFarm(req.body);
    const { rows: [company] } = await query(`select id from company order by created_at limit 1`);
    if (!company) throw badRequest("ยังไม่มีบริษัทในฐานข้อมูล — ต้องรัน migrate/seed ก่อน");

    const { rows } = await query(
      `insert into farm (company_id, code, name, province, district, lat, lng, data_source)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning *`,
      [company.id, fields.code, fields.name, fields.province ?? null, fields.district ?? null,
       fields.lat ?? null, fields.lng ?? null, fields.data_source],
    );
    /* ★ บันทึกหลังของจริงสำเร็จแล้วเท่านั้น (ดูเหตุผลใน activity/log.js) */
    await logActivity({ kind: "admin", action: "farm.create", actor: req.user,
      target: `${rows[0].name} (${rows[0].code})`, detail: { id: rows[0].id } });
    res.status(201).json({ farm: rows[0] });
  } catch (err) { next(rethrowDuplicate(err, "ฟาร์ม", req.body?.code)); }
});

/** PATCH /api/farms/:id — แก้เฉพาะช่องที่ส่งมา ไม่ไปล้างช่องที่ไม่ได้ส่ง */
farmsRouter.patch("/:id", manage, async (req, res, next) => {
  try {
    await farmOr404(req.params.id);
    const fields = normalizeFarm(req.body, { partial: true });
    const { sql, values } = updateParts(fields, 2);
    const { rows } = await query(
      `update farm set ${sql} where id = $1 returning *`,
      [req.params.id, ...values],
    );
    await logActivity({ kind: "admin", action: "farm.update", actor: req.user,
      target: `${rows[0].name} (${rows[0].code})`, detail: { fields: Object.keys(fields) } });
    res.json({ farm: rows[0] });
  } catch (err) { next(rethrowDuplicate(err, "ฟาร์ม", req.body?.code)); }
});

/**
 * DELETE /api/farms/:id — ปิดการใช้งาน (กู้คืนได้)
 *
 * ★ ต้องปิดโรงเรือนของฟาร์มนั้นไปด้วย **ในรายการเดียวกัน** ไม่งั้น `v_farm_summary`
 *   จะนับโรงเรือนที่ยังเปิดอยู่ของฟาร์มที่ปิดแล้ว — ตัวเลขบนหน้าจอขัดกันเอง
 *   และถ้าเกิดล้มกลางทาง จะเหลือฟาร์มปิดที่มีโรงเรือนเปิด ซึ่งไม่มีหน้าไหนแสดงให้แก้ได้
 */
farmsRouter.delete("/:id", manage, async (req, res, next) => {
  try {
    await farmOr404(req.params.id);
    const result = await withTransaction(async (client) => {
      const { rows: [farm] } = await client.query(
        `update farm set active = false where id = $1 returning *`, [req.params.id]);
      const { rowCount } = await client.query(
        `update barn set active = false where farm_id = $1 and active`, [req.params.id]);
      return { farm, barnsClosed: rowCount };
    });
    await logActivity({ kind: "admin", action: "farm.delete", actor: req.user,
      target: `${result.farm.name} (${result.farm.code})`,
      detail: { barnsClosed: result.barnsClosed } });
    res.json({ ...result, note: "ปิดการใช้งานแล้ว ข้อมูลเดิมยังอยู่ครบและกู้คืนได้" });
  } catch (err) { next(err); }
});

/**
 * POST /api/farms/:id/restore — กู้คืนฟาร์ม
 *
 * ★ **ไม่เปิดโรงเรือนคืนให้เอง** เพราะแยกไม่ออกว่าโรงเรือนไหนถูกปิดไปพร้อมฟาร์ม
 *   กับโรงเรือนที่ผู้ดูแลสั่งปิดเองไว้ก่อนหน้านั้น เปิดคืนหมดจะเป็นการเดาแทนเจ้าของข้อมูล
 *   คืนจำนวนโรงเรือนที่ยังปิดอยู่กลับไป ให้หน้าจอบอกผู้ใช้ได้ว่าต้องไปเปิดต่อเอง
 */
farmsRouter.post("/:id/restore", manage, async (req, res, next) => {
  try {
    await farmOr404(req.params.id);
    const { rows: [farm] } = await query(
      `update farm set active = true where id = $1 returning *`, [req.params.id]);
    const { rows: [{ n }] } = await query(
      `select count(*)::int as n from barn where farm_id = $1 and not active`, [req.params.id]);
    await logActivity({ kind: "admin", action: "farm.restore", actor: req.user,
      target: `${farm.name} (${farm.code})`, detail: { barnsStillClosed: n } });
    res.json({ farm, barnsStillClosed: n });
  } catch (err) { next(err); }
});

/* ---------- โรงเรือน: อยู่ใต้ฟาร์มเสมอ ----------
   ★ เส้นทางมี farmId ติดมาด้วยทั้งที่ barn.id เป็น uuid ที่ไม่ซ้ำทั่วระบบอยู่แล้ว
     เพื่อให้ทุกคำขอพิสูจน์ความเป็นเจ้าของ — ส่ง uuid โรงเรือนของฟาร์มอื่นมาจะได้ 404
     ไม่ใช่แก้ข้ามฟาร์มได้เงียบ ๆ */

farmsRouter.post("/:id/barns", manage, async (req, res, next) => {
  try {
    const farm = await farmOr404(req.params.id);
    const fields = normalizeBarn(req.body);
    const { rows } = await query(
      `insert into barn (farm_id, code, name, zone, building, stage, capacity, data_source)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning *`,
      [farm.id, fields.code, fields.name, fields.zone ?? null, fields.building ?? null,
       fields.stage ?? null, fields.capacity ?? null, fields.data_source],
    );
    await logActivity({ kind: "admin", action: "barn.create", actor: req.user,
      target: `${farm.code}-${rows[0].code}`, detail: { name: rows[0].name } });
    res.status(201).json({ barn: rows[0] });
  } catch (err) { next(rethrowDuplicate(err, "โรงเรือน", req.body?.code)); }
});

farmsRouter.patch("/:id/barns/:barnId", manage, async (req, res, next) => {
  try {
    await barnOf(req.params.id, req.params.barnId);
    const fields = normalizeBarn(req.body, { partial: true });
    const { sql, values } = updateParts(fields, 2);
    const { rows } = await query(
      `update barn set ${sql} where id = $1 returning *`,
      [req.params.barnId, ...values],
    );
    await logActivity({ kind: "admin", action: "barn.update", actor: req.user,
      target: `${rows[0].name} (${rows[0].code})`, detail: { fields: Object.keys(fields) } });
    res.json({ barn: rows[0] });
  } catch (err) { next(rethrowDuplicate(err, "โรงเรือน", req.body?.code)); }
});

/**
 * DELETE /api/farms/:id/barns/:barnId — ปิดการใช้งานโรงเรือน
 *
 * ★ บอกไปด้วยว่าโรงเรือนนี้มีเซนเซอร์ที่ยังเปิดอยู่กี่ตัว — ปิดโรงเรือนที่ยังรับค่าจริงอยู่
 *   ทำให้ค่าที่ไหลเข้ามาหายจากหน้าจอทั้งที่อุปกรณ์ยังส่งอยู่ คนกดควรรู้ก่อนจะงงทีหลัง
 */
farmsRouter.delete("/:id/barns/:barnId", manage, async (req, res, next) => {
  try {
    await barnOf(req.params.id, req.params.barnId);
    const { rows: [barn] } = await query(
      `update barn set active = false where id = $1 returning *`, [req.params.barnId]);
    const { rows: [{ n }] } = await query(
      `select count(*)::int as n from device where barn_id = $1 and active and kind = 'sensor'`,
      [req.params.barnId]);
    await logActivity({ kind: "admin", action: "barn.delete", actor: req.user,
      target: `${barn.name} (${barn.code})`, detail: { activeSensors: n } });
    res.json({
      barn,
      activeSensors: n,
      note: n > 0
        ? `โรงเรือนนี้ยังมีเซนเซอร์เปิดอยู่ ${n} ตัว ค่าที่ส่งเข้ามาจะไม่แสดงบนหน้าจอแล้ว`
        : "ปิดการใช้งานแล้ว กู้คืนได้",
    });
  } catch (err) { next(err); }
});

farmsRouter.post("/:id/barns/:barnId/restore", manage, async (req, res, next) => {
  try {
    await barnOf(req.params.id, req.params.barnId);
    const { rows: [barn] } = await query(
      `update barn set active = true where id = $1 returning *`, [req.params.barnId]);
    await logActivity({ kind: "admin", action: "barn.restore", actor: req.user,
      target: `${barn.name} (${barn.code})` });
    res.json({ barn });
  } catch (err) { next(err); }
});
