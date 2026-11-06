/**
 * จัดการตู้กลาง — /api/hub/* (ผู้ดูแลระบบเท่านั้น) (T1.347)
 *
 *   GET    /boxes              กล่องทั้งหมด + จำนวนชุดข้อมูลที่ส่งเข้ามา
 *   POST   /boxes              เพิ่มกล่องใหม่ + ออกกุญแจใบแรก
 *   POST   /boxes/:id/key      ออกกุญแจใบใหม่ (ของเดิมใช้ไม่ได้ทันที)
 *   PATCH  /boxes/:id          เปิด/ปิดกล่อง · แก้ชื่อ · แก้หมายเหตุ
 *   GET    /streams            ชุดข้อมูลทั้งหมด + ใครดึงได้บ้าง
 *   PUT    /streams/:id/grants/:boxId   เปิดสิทธิ์ให้กล่องนั้นดึงชุดนี้ (หน้าจอใช้ทีละช่อง)
 *   DELETE /streams/:id/grants/:boxId   ปิดสิทธิ์
 *   PUT    /streams/:id/grants ตั้งทั้งชุดในครั้งเดียว (ให้สคริปต์ใช้)
 *
 * ═══ ★ ทำไมแยกจาก /api/ingest ═══
 * `/api/ingest` ใช้กุญแจประจำกล่อง (เครื่องคุยกับเครื่อง) ส่วนไฟล์นี้ใช้เซสชันของคน
 * และต้องเป็นผู้ดูแลระบบ — คนละด่าน คนละผู้ใช้ จึงไม่ควรปนกันในโมดูลเดียว
 *
 * ═══ ★★ กุญแจตัวจริงโชว์ครั้งเดียว ═══
 * ตอนออกให้จะคืนกุญแจเต็มกลับไปครั้งเดียว หลังจากนั้นอ่านย้อนไม่ได้อีก รวมถึงแอดมินเอง
 * เพราะฐานเก็บแต่แฮช — หายแล้วออกใบใหม่ ไม่ใช่ไปขุดของเดิม
 */
import { Router } from "express";

import { query, withTransaction } from "../../db/pool.js";
import { badRequest, notFound } from "../../lib/error.js";
import { requireAdmin, requireAuth } from "../../lib/auth.js";
import { canRevealKeys, hashBoxKey, mintBoxKey, openBoxKey, sealBoxKey } from "../../lib/boxKey.js";

export const hubRouter = Router();

hubRouter.use(requireAuth, requireAdmin);

/** ชื่อกล่องใช้เป็นส่วนหนึ่งของกุญแจด้วย จึงจำกัดให้เป็นอักษรอังกฤษกับตัวเลขเท่านั้น */
const CODE_RE = /^[a-z0-9]{2,20}$/;

const publicBox = (b) => ({
  id: b.id,
  code: b.code,
  name: b.name,
  active: b.active,
  note: b.note ?? null,
  createdAt: b.created_at,
  lastSeenAt: b.last_seen_at ?? null,
  streamCount: Number(b.stream_count ?? 0),
  keyIssuedAt: b.key_issued_at ?? null,
  /* ★ บอกว่า "ดูย้อนหลังได้ไหม" ไม่ใช่ตัวกุญแจ — ตัวจริงต้องกดขอทีละใบ
     กล่องที่ออกกุญแจก่อน T1.347 ไม่มี cipher จึงดูย้อนไม่ได้จนกว่าจะออกใบใหม่ */
  canReveal: Boolean(b.key_cipher) && canRevealKeys(),
});

/* ---------- กล่อง ---------- */

hubRouter.get("/boxes", async (req, res, next) => {
  try {
    const { rows } = await query(
      `select b.*, count(s.id) as stream_count
         from source_box b left join ingest_stream s on s.box_id = b.id
        group by b.id order by b.code`,
    );
    res.json({ boxes: rows.map(publicBox) });
  } catch (err) {
    next(err);
  }
});

hubRouter.post("/boxes", async (req, res, next) => {
  try {
    const code = String(req.body?.code ?? "").trim().toLowerCase();
    const name = String(req.body?.name ?? "").trim();
    if (!CODE_RE.test(code))
      throw badRequest("ชื่อย่อกล่องใช้ a-z กับ 0-9 ยาว 2–20 ตัว เช่น jew หรือ muey");
    if (!name) throw badRequest("ต้องมีชื่อกล่อง");

    const { rows: dup } = await query(`select 1 from source_box where code = $1`, [code]);
    if (dup.length > 0) throw badRequest(`มีกล่องชื่อ "${code}" อยู่แล้ว`);

    const key = mintBoxKey(code);
    const { rows } = await query(
      `insert into source_box (code, name, key_hash, key_cipher, key_issued_at, note)
       values ($1, $2, $3, $4, now(), $5) returning *`,
      [code, name, hashBoxKey(key), sealBoxKey(key), String(req.body?.note ?? "").trim() || null],
    );

    /* ★ `key` คืนกลับไปที่นี่ครั้งเดียวในชีวิต — หน้าจอต้องบอกผู้ใช้ให้คัดลอกเก็บทันที */
    res.status(201).json({ box: publicBox({ ...rows[0], stream_count: 0 }), key });
  } catch (err) {
    next(err);
  }
});

hubRouter.post("/boxes/:id/key", async (req, res, next) => {
  try {
    const { rows } = await query(`select code from source_box where id = $1`, [req.params.id]);
    if (rows.length === 0) throw notFound("กล่องนี้");

    const key = mintBoxKey(rows[0].code);
    await query(
      `update source_box set key_hash = $2, key_cipher = $3, key_issued_at = now() where id = $1`,
      [req.params.id, hashBoxKey(key), sealBoxKey(key)],
    );

    /* ออกใบใหม่ = ใบเก่าใช้ไม่ได้ทันที เพราะมีช่องแฮชช่องเดียว
       ตั้งใจให้เป็นแบบนี้ — กุญแจรั่วแล้วต้องตัดขาดทันที ไม่ใช่ค่อย ๆ ย้าย */
    res.json({ key, warning: "กุญแจใบเดิมใช้ไม่ได้แล้ว ต้องแจ้งทีมนั้นให้เปลี่ยนทันที" });
  } catch (err) {
    next(err);
  }
});

hubRouter.patch("/boxes/:id", async (req, res, next) => {
  try {
    const patch = [];
    const vals = [req.params.id];
    const add = (col, value) => {
      vals.push(value);
      patch.push(`${col} = $${vals.length}`);
    };

    if (req.body?.name != null) {
      const name = String(req.body.name).trim();
      if (!name) throw badRequest("ชื่อกล่องว่างไม่ได้");
      add("name", name);
    }
    if (req.body?.active != null) add("active", req.body.active === true);
    if (req.body?.note !== undefined) add("note", String(req.body.note ?? "").trim() || null);
    if (patch.length === 0) throw badRequest("ไม่มีอะไรให้แก้");

    const { rows } = await query(
      `update source_box set ${patch.join(", ")} where id = $1 returning *`,
      vals,
    );
    if (rows.length === 0) throw notFound("กล่องนี้");
    res.json({ box: publicBox({ ...rows[0], stream_count: 0 }) });
  } catch (err) {
    next(err);
  }
});

/**
 * ดูกุญแจที่ออกไปแล้ว (T1.347 · ผู้ใช้ขอ 27 ต.ค. 2569 เผื่อลืมว่าส่งใบไหนให้ใคร)
 *
 * ★ เป็น POST ไม่ใช่ GET โดยตั้งใจ — ที่อยู่ของ GET ไปโผล่ในประวัติเบราว์เซอร์
 *   และในล็อกของตัวกลางทุกชั้น การขอดูความลับไม่ควรทิ้งร่องรอยแบบนั้น
 */
hubRouter.post("/boxes/:id/reveal", async (req, res, next) => {
  try {
    const { rows } = await query(
      `select code, key_cipher, key_issued_at from source_box where id = $1`,
      [req.params.id],
    );
    if (rows.length === 0) throw notFound("กล่องนี้");

    if (!canRevealKeys())
      throw badRequest("ยังไม่ได้ตั้ง HUB_KEY_SECRET ใน .env — ดูกุญแจย้อนหลังไม่ได้");

    /* ★ ใบที่ออกก่อนเปิดระบบนี้ไม่มีของเข้ารหัสเก็บไว้ — กุญแจยังใช้ได้ แค่อ่านย้อนไม่ได้
       ต้องบอกให้ตรง ห้ามขึ้นว่า "ไม่มีกุญแจ" เพราะคนอ่านจะนึกว่ากล่องใช้ไม่ได้แล้ว */
    if (!rows[0].key_cipher)
      throw badRequest("ใบนี้ออกก่อนเปิดระบบดูย้อนหลัง — กดออกกุญแจใหม่ถึงจะดูได้");

    const key = openBoxKey(rows[0].key_cipher);
    if (!key)
      throw badRequest("ถอดกุญแจไม่ได้ — HUB_KEY_SECRET อาจถูกเปลี่ยน ให้ออกกุญแจใหม่");

    res.json({ code: rows[0].code, key, issuedAt: rows[0].key_issued_at });
  } catch (err) {
    next(err);
  }
});

/* ---------- ชุดข้อมูลและสิทธิ์ ---------- */

hubRouter.get("/streams", async (req, res, next) => {
  try {
    const { rows } = await query(
      `select s.id, s.name, s.kind, s.unit, s.sample_count, s.first_seen_at, s.last_seen_at,
              b.code as owner_code, b.name as owner_name,
              coalesce(
                array_agg(g.grantee_id) filter (where g.grantee_id is not null),
                '{}'
              ) as grantees
         from ingest_stream s
         join source_box b on b.id = s.box_id
         left join stream_grant g on g.stream_id = s.id
        group by s.id, b.code, b.name
        order by b.code, s.name`,
    );

    res.json({
      streams: rows.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        unit: s.unit ?? null,
        sampleCount: Number(s.sample_count ?? 0),
        owner: { code: s.owner_code, name: s.owner_name },
        firstSeenAt: s.first_seen_at,
        lastSeenAt: s.last_seen_at ?? null,
        /* รายชื่อกล่องที่เปิดสิทธิ์ให้แล้ว — ว่าง = ยังไม่มีใครดึงได้ */
        grantees: s.grantees,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ตรวจคู่ "ชุดข้อมูล + กล่องผู้รับสิทธิ์" ก่อนเปิด/ปิดทีละช่อง
 * ★ ไอดีที่ไม่ใช่ uuid ต้องตอบ 400 เอง — ปล่อยถึง Postgres จะกลายเป็น 500 ที่อ่านไม่รู้เรื่อง
 */
async function grantPair(streamId, boxId) {
  if (!UUID_RE.test(streamId) || !UUID_RE.test(boxId)) throw badRequest("ไอดีชุดข้อมูลหรือไอดีกล่องไม่ถูกรูปแบบ");
  const { rows } = await query(
    `select s.id, s.box_id, s.name, b.code as grantee_code
       from ingest_stream s, source_box b
      where s.id = $1 and b.id = $2`,
    [streamId, boxId],
  );
  if (rows.length === 0) throw notFound("ชุดข้อมูลหรือกล่องนี้");
  if (rows[0].box_id === boxId) throw badRequest("เจ้าของชุดข้อมูลดึงของตัวเองได้อยู่แล้ว ไม่ต้องเปิดสิทธิ์ให้");
  return rows[0];
}

/**
 * เปิด/ปิดสิทธิ์ทีละช่อง — หน้าจอใช้สองเส้นนี้ (T1.351)
 *
 * ★★ ทำไมไม่ใช้ PUT ทั้งชุดแบบเดิม
 *   เดิมหน้าจอส่ง "รายชื่อทั้งชุด" ทุกครั้งที่ติ๊ก ติ๊กสามช่องเร็ว ๆ = คำขอสามก้อน
 *   [a] · [a,b] · [a,b,c] ถ้าก้อน [a,b] ไปถึงทีหลัง [a,b,c] ช่อง c หายเงียบ ๆ
 *   (ทดสอบจริงด้วยเน็ตหน่วง: ติ๊ก 3 ช่อง ฐานเหลือ 2 ช่อง จอก็เด้งกลับเหลือ 2)
 *   ทีละช่องไม่มีปัญหานี้ — แต่ละคำขอแตะแค่ช่องตัวเอง ถึงช้าเร็วต่างกันผลก็ตรงกับที่กด
 */
hubRouter.put("/streams/:id/grants/:boxId", async (req, res, next) => {
  try {
    const pair = await grantPair(req.params.id, req.params.boxId);
    await query(
      `insert into stream_grant (stream_id, grantee_id, granted_by) values ($1, $2, $3)
       on conflict do nothing`,
      [pair.id, req.params.boxId, req.user?.id ?? null],
    );
    res.json({ ok: true, streamId: pair.id, boxId: req.params.boxId, granted: true });
  } catch (err) {
    next(err);
  }
});

hubRouter.delete("/streams/:id/grants/:boxId", async (req, res, next) => {
  try {
    const pair = await grantPair(req.params.id, req.params.boxId);
    await query(`delete from stream_grant where stream_id = $1 and grantee_id = $2`, [pair.id, req.params.boxId]);
    res.json({ ok: true, streamId: pair.id, boxId: req.params.boxId, granted: false });
  } catch (err) {
    next(err);
  }
});

/** ตั้งทั้งชุดในครั้งเดียว — เก็บไว้ให้สคริปต์ใช้ หน้าจอไม่ได้ใช้แล้ว (ดูเหตุผลด้านบน) */
hubRouter.put("/streams/:id/grants", async (req, res, next) => {
  try {
    const wanted = Array.isArray(req.body?.grantees) ? req.body.grantees : null;
    if (!wanted) throw badRequest("ต้องส่ง grantees เป็นอาเรย์ของไอดีกล่อง (ส่งอาเรย์ว่างเพื่อปิดทั้งหมด)");

    const { rows: stream } = await query(
      `select s.id, s.box_id, s.name from ingest_stream s where s.id = $1`,
      [req.params.id],
    );
    if (stream.length === 0) throw notFound("ชุดข้อมูลนี้");

    /* ★ เจ้าของชุดไม่ต้องขอสิทธิ์ดึงของตัวเอง — ถ้าปล่อยให้ตั้งได้จะงงว่าทำไมต้องเปิดให้ตัวเอง */
    if (wanted.includes(stream[0].box_id))
      throw badRequest("เจ้าของชุดข้อมูลดึงของตัวเองได้อยู่แล้ว ไม่ต้องเปิดสิทธิ์ให้");

    await withTransaction(async (client) => {
      /* ลบของเดิมแล้วใส่ชุดใหม่ — หน้าจอส่งรายชื่อที่ต้องการทั้งชุดมา ไม่ใช่ส่งทีละการเปลี่ยนแปลง
         วิธีนี้ทำให้กดเร็ว ๆ หลายครั้งแล้วผลลัพธ์ยังตรงกับที่เห็นบนจอเสมอ */
      await client.query(`delete from stream_grant where stream_id = $1`, [req.params.id]);
      for (const id of wanted) {
        await client.query(
          `insert into stream_grant (stream_id, grantee_id, granted_by) values ($1, $2, $3)
           on conflict do nothing`,
          [req.params.id, id, req.user?.id ?? null],
        );
      }
    });

    res.json({ ok: true, streamId: req.params.id, grantees: wanted });
  } catch (err) {
    next(err);
  }
});
