/**
 * ตู้กลางรับข้อมูล — /api/ingest (T1.347)
 *
 *   POST /api/ingest            กล่องอื่นส่งข้อมูลเข้ามา   ← ต้องมีกุญแจประจำกล่อง
 *   GET  /api/ingest/streams    ดูว่าตัวเองส่งอะไรเข้ามาบ้าง
 *
 * ═══ ★ ทำไมเป็น API ไม่ใช่ MQTT ═══
 * ออกกุญแจแยกรายกล่องและเพิกถอนทีละใบได้ตรงไปตรงมา · ส่งไฟล์ได้ · ไม่ต้องตั้ง ACL เพิ่มอีกชั้น
 * และที่สำคัญ ระบบนี้เจอปัญหา broker MQTT สาธารณะตัดสายจนข้อมูลขาดเป็นช่วงมาแล้ว
 * ไม่ควรเพิ่มของที่พึ่ง MQTT อีก · Easy Pairing ส่งทุก 5 วินาทีซึ่ง API รับไหวสบาย
 *
 * ═══ รูปที่ส่งเข้ามา ═══
 * ```
 * POST /api/ingest
 * Authorization: Bearer box_jew_xxxxx
 * [
 *   { "stream": "camera.count", "kind": "reading", "value": 622, "at": "2026-10-26T10:30:00Z" },
 *   { "stream": "camera.clip",  "kind": "file",    "url": "https://.../clip.mp4", "bytes": 2500000 }
 * ]
 * ```
 * ส่งรายการเดียวแบบไม่ใส่อาเรย์ก็ได้ — ทีมอื่นเขียนคนละภาษา ไม่ควรบังคับรูปเดียว
 */
import { Router } from "express";

import { query, withTransaction } from "../../db/pool.js";
import { badRequest } from "../../lib/error.js";
import { requireBox } from "./boxAuth.js";
import { checkBatch } from "./validate.js";

export const ingestRouter = Router();

/**
 * หาไอดีของชุดข้อมูล — ขึ้นทะเบียนให้เองถ้าเพิ่งเจอครั้งแรก
 *
 * ★ นี่คือหัวใจของ "เพิ่มเซนเซอร์ใหม่แล้วขึ้นเอง ไม่ต้องแก้โค้ด"
 *   ฝั่งผู้ส่งตั้งชื่อชุดเอง ตู้กลางจดให้ แล้วเจ้าของตู้ค่อยมาตั้งสิทธิ์ทีหลัง
 *   `on conflict` ทำให้ส่งพร้อมกันหลายเส้นก็ไม่ได้แถวซ้ำ
 */
async function streamIdOf(client, boxId, { name, kind, unit }) {
  const { rows } = await client.query(
    `insert into ingest_stream (box_id, name, kind, unit, last_seen_at, sample_count)
       values ($1, $2, $3, $4, now(), 0)
     on conflict (box_id, name) do update
       set last_seen_at = now(),
           /* ไม่ทับหน่วยที่เคยมีด้วยค่าว่าง — ผู้ส่งอาจใส่หน่วยมาแค่ครั้งแรก */
           unit = coalesce(excluded.unit, ingest_stream.unit)
     returning id, kind`,
    [boxId, name, kind, unit],
  );
  return rows[0];
}

ingestRouter.post("/", requireBox, async (req, res, next) => {
  try {
    const checked = checkBatch(req.body);
    if (!checked.ok) throw badRequest("ข้อมูลที่ส่งมาไม่ผ่านการตรวจ", { errors: checked.errors });

    const stored = await withTransaction(async (client) => {
      /* จัดกลุ่มตามชื่อชุดก่อน เพื่อไม่ต้องถามฐานซ้ำทุกแถวในก้อนเดียวกัน */
      const streams = new Map();
      let readings = 0;
      let events = 0;
      /* แถวที่เกิดใหม่จริงต่อชุด — ส่วนที่ทับของเดิมไม่นับ ไม่งั้น sample_count พองทุกครั้งที่ส่งซ้ำ */
      const added = new Map();
      /* ส่งซ้ำ at เดิมแล้วทับของเดิม — บอกกลับไปให้ผู้ส่งเห็นว่าไม่ได้เกิดแถวใหม่ */
      let replaced = 0;

      for (const item of checked.items) {
        let s = streams.get(item.name);
        if (!s) {
          s = await streamIdOf(client, req.box.id, item);
          streams.set(item.name, s);
        }

        /* ★ ชื่อชุดเดิมแต่เปลี่ยนชนิด = ของคนละอย่างใช้ชื่อชนกัน ต้องปฏิเสธ
           ถ้าปล่อยผ่าน กราฟของชุดนั้นจะมีทั้งตัวเลขและข้อความปนกันจนอ่านไม่ได้ */
        if (s.kind !== item.kind)
          throw badRequest(
            `ชุด "${item.name}" ขึ้นทะเบียนไว้เป็น ${s.kind} แต่ส่งมาเป็น ${item.kind} — ใช้ชื่อชุดใหม่หรือแจ้งเจ้าของตู้กลาง`,
          );

        /* ส่งเวลาเดิมซ้ำ = ทับของเดิม ไม่ใช่เพิ่มแถว — ใช้กติกาเดียวกันทุกชนิด
           ผู้ส่งที่ลองใหม่หลังเน็ตหลุดจะไม่ได้แถวซ้ำ และแก้ของที่ส่งผิดได้ด้วยการส่ง at เดิม
           ★ เดิมทำแค่ reading ส่วน event ต่อท้ายอย่างเดียว ทั้งที่เอกสารบอกว่าทับ (T1.350)
           `xmax = 0` เป็นจริงเฉพาะแถวที่ insert ใหม่ — ใช้แยกว่าเกิดแถวใหม่หรือทับของเดิม */
        let inserted;
        if (item.kind === "reading") {
          const { rows } = await client.query(
            `insert into ingest_reading (stream_id, at, value) values ($1, $2, $3)
             on conflict (stream_id, at) do update set value = excluded.value, received_at = now()
             returning (xmax = 0) as inserted`,
            [s.id, item.at, item.value],
          );
          inserted = rows[0].inserted;
          readings += 1;
        } else {
          const { rows } = await client.query(
            `insert into ingest_event (stream_id, at, payload, file_url, file_type, file_bytes)
             values ($1, $2, $3, $4, $5, $6)
             on conflict (stream_id, at) do update
               set payload = excluded.payload, file_url = excluded.file_url,
                   file_type = excluded.file_type, file_bytes = excluded.file_bytes,
                   received_at = now()
             returning (xmax = 0) as inserted`,
            [s.id, item.at, item.payload ?? null, item.url ?? null, item.fileType ?? null, item.bytes ?? null],
          );
          inserted = rows[0].inserted;
          events += 1;
        }
        if (inserted) added.set(s.id, (added.get(s.id) ?? 0) + 1);
        else replaced += 1;
      }

      for (const [id, n] of added)
        await client.query(`update ingest_stream set sample_count = sample_count + $2 where id = $1`, [id, n]);

      return { readings, events, replaced, streams: [...streams.keys()] };
    });

    res.status(201).json({ ok: true, box: req.box.code, ...stored });
  } catch (err) {
    next(err);
  }
});

/** ชุดข้อมูลที่กล่องนี้ส่งเข้ามา — ให้ทีมอื่นตรวจเองได้ว่าของถึงหรือยัง */
ingestRouter.get("/streams", requireBox, async (req, res, next) => {
  try {
    const { rows } = await query(
      `select name, kind, unit, sample_count, first_seen_at, last_seen_at
         from ingest_stream where box_id = $1 order by name`,
      [req.box.id],
    );
    res.json({ box: req.box.code, streams: rows });
  } catch (err) {
    next(err);
  }
});
