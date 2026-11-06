/**
 * ทีมอื่นดึงข้อมูลจากตู้กลาง — /api/streams/* (T1.347)
 *
 *   GET /api/streams              ชุดที่กล่องนี้ดึงได้ (ของตัวเอง + ที่ได้รับสิทธิ์)
 *   GET /api/streams/:id/data     ข้อมูลของชุดนั้น
 *
 * ใช้กุญแจประจำกล่องเหมือน `/api/ingest` — กล่องเดียวกันทั้งส่งเข้าและดึงออก
 *
 * ═══ ★ ค่าตั้งต้นคือดึงไม่ได้ ═══
 * ต้องมีแถวใน `stream_grant` ถึงจะดึงชุดของคนอื่นได้ ไม่มีแถว = ไม่มีสิทธิ์
 * เจ้าของชุดดึงของตัวเองได้เสมอโดยไม่ต้องมีแถว
 *
 * ═══ ★★ ไม่บอกว่า "มีชุดนี้อยู่แต่คุณไม่มีสิทธิ์" ═══
 * ชุดที่ดึงไม่ได้ตอบ 404 เหมือนชุดที่ไม่มีจริง — ถ้าแยกข้อความ คนที่เดาไอดีไปเรื่อย ๆ
 * จะไล่หาได้ว่าทีมอื่นมีชุดข้อมูลอะไรบ้าง ซึ่งเป็นข้อมูลที่เจ้าของตู้ยังไม่ได้อนุญาตให้รู้
 */
import { Router } from "express";

import { query } from "../../db/pool.js";
import { badRequest, notFound } from "../../lib/error.js";
import { requireBox } from "./boxAuth.js";

export const streamsRouter = Router();

streamsRouter.use(requireBox);

/** ดึงครั้งละมากสุดเท่านี้ — กันคำขอเดียวลากทั้งตารางจนตู้กลางค้าง */
const MAX_LIMIT = 5000;
const DEFAULT_LIMIT = 1000;

/** ไม่ระบุช่วงเวลา = ย้อนหลัง 24 ชั่วโมง ซึ่งเป็นสิ่งที่คนถามบ่อยที่สุด */
const DEFAULT_HOURS = 24;

/**
 * ชุดที่กล่องนี้แตะได้ พร้อมบอกว่าแตะได้เพราะอะไร
 *
 * ★ คิวรีนี้เป็นด่านสิทธิ์ตัวจริง — เส้นทางด้านล่างทุกเส้นต้องผ่านตรงนี้ก่อน
 *   ห้ามเขียนคิวรีดึงข้อมูลที่ไม่ได้ join กับ `stream_grant` ไว้ที่อื่น
 */
async function visibleStream(boxId, streamId) {
  const { rows } = await query(
    `select s.id, s.name, s.kind, s.unit, s.box_id,
            b.code as owner_code,
            (s.box_id = $1) as is_owner
       from ingest_stream s
       join source_box b on b.id = s.box_id
      where s.id = $2
        and (s.box_id = $1 or exists (
              select 1 from stream_grant g
               where g.stream_id = s.id and g.grantee_id = $1))`,
    [boxId, streamId],
  );
  return rows[0] ?? null;
}

streamsRouter.get("/", async (req, res, next) => {
  try {
    const { rows } = await query(
      `select s.id, s.name, s.kind, s.unit, s.sample_count, s.last_seen_at,
              b.code as owner_code, (s.box_id = $1) as is_owner
         from ingest_stream s
         join source_box b on b.id = s.box_id
        where s.box_id = $1
           or exists (select 1 from stream_grant g
                       where g.stream_id = s.id and g.grantee_id = $1)
        order by b.code, s.name`,
      [req.box.id],
    );

    res.json({
      box: req.box.code,
      streams: rows.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        unit: s.unit ?? null,
        owner: s.owner_code,
        /* บอกให้ชัดว่าได้มาเพราะเป็นเจ้าของ หรือเพราะมีคนเปิดสิทธิ์ให้
           ทีมอื่นจะได้รู้ว่าถ้าหายไปต้องไปถามใคร */
        access: s.is_owner ? "owner" : "granted",
        sampleCount: Number(s.sample_count ?? 0),
        lastSeenAt: s.last_seen_at ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

streamsRouter.get("/:id/data", async (req, res, next) => {
  try {
    /* ★ ด่านสิทธิ์ — ไม่ผ่านตรงนี้ไม่มีทางไปแตะข้อมูลได้ */
    const stream = await visibleStream(req.box.id, req.params.id);
    if (!stream) throw notFound("ชุดข้อมูลนี้ หรือยังไม่ได้รับสิทธิ์ให้ดึง");

    const now = Date.now();
    const to = req.query.to ? new Date(req.query.to) : new Date(now);
    const from = req.query.from
      ? new Date(req.query.from)
      : new Date(to.getTime() - DEFAULT_HOURS * 3600_000);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()))
      throw badRequest("from กับ to ต้องเป็นเวลาแบบ ISO เช่น 2026-10-26T00:00:00Z");
    if (from >= to) throw badRequest("from ต้องมาก่อน to");

    const asked = Number(req.query.limit ?? DEFAULT_LIMIT);
    if (!Number.isFinite(asked) || asked < 1) throw badRequest("limit ต้องเป็นตัวเลขมากกว่า 0");
    const limit = Math.min(asked, MAX_LIMIT);

    /* เรียงใหม่→เก่า แล้วตัดด้วย limit — คนที่ขอมักอยากได้ของล่าสุดก่อน
       ถ้าเรียงเก่า→ใหม่แล้วตัด จะได้แต่ของเก่าและไม่มีทางรู้ว่าตกอะไรไป */
    const order = `order by at desc limit ${limit}`;

    let points;
    if (stream.kind === "reading") {
      const { rows } = await query(
        `select at, value from ingest_reading
          where stream_id = $1 and at >= $2 and at <= $3 ${order}`,
        [stream.id, from, to],
      );
      points = rows.map((r) => ({ at: r.at, value: r.value }));
    } else {
      const { rows } = await query(
        `select at, payload, file_url, file_type, file_bytes from ingest_event
          where stream_id = $1 and at >= $2 and at <= $3 ${order}`,
        [stream.id, from, to],
      );
      points = rows.map((r) => ({
        at: r.at,
        payload: r.payload ?? null,
        /* ตู้กลางเก็บแค่ที่อยู่ไฟล์ ผู้ดึงต้องไปเอาไฟล์เองจากที่นั่น */
        file: r.file_url ? { url: r.file_url, type: r.file_type, bytes: r.file_bytes } : null,
      }));
    }

    res.json({
      stream: {
        id: stream.id,
        name: stream.name,
        kind: stream.kind,
        unit: stream.unit ?? null,
        owner: stream.owner_code,
        access: stream.is_owner ? "owner" : "granted",
      },
      from: from.toISOString(),
      to: to.toISOString(),
      count: points.length,
      /* บอกตรง ๆ เมื่อชนเพดาน — ไม่งั้นผู้ดึงจะคิดว่าช่วงนั้นมีข้อมูลแค่นี้จริง ๆ */
      truncated: points.length >= limit,
      points,
    });
  } catch (err) {
    next(err);
  }
});
