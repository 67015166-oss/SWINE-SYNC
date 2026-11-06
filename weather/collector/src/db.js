/**
 * ทางเข้าฐานข้อมูลทางเดียวของตัวเก็บข้อมูล
 *
 * เขียนแบบ "ส่งซ้ำแล้วไม่เกิดแถวซ้ำ" ทุกที่ (on conflict do nothing) เพราะตัวเก็บ
 * จะถูกรันซ้ำ ถูกปิดกลางคัน และ backfill ทับช่วงเดิมอยู่เรื่อย ๆ ถ้าไม่กันไว้
 * ข้อมูลจะซ้อนกันหลายชั้นโดยไม่มีอะไรฟ้อง แล้วค่าเฉลี่ยทุกตัวจะเพี้ยนแบบเงียบ ๆ
 */
import pg from "pg";
import { config } from "./config.js";

/* Postgres คืน numeric/int8 มาเป็น string เพื่อกันค่าเกินความละเอียดของ float
   ค่าที่นี่ไม่มีตัวไหนใหญ่ขนาดนั้น อ่านเป็นตัวเลขไปเลยจะได้ไม่ต้องแปลงทุกที่
   (กติกาเดียวกับ server/src/db/pool.js ของแดชบอร์ด) */
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 8,
  idleTimeoutMillis: 30_000,
});

export const query = (text, params) => pool.query(text, params);

/**
 * เขียนค่าที่สังเกตได้ลงตาราง obs
 *
 * ส่งเป็นก้อนใหญ่ก้อนเดียวด้วย `unnest` แทนการวน insert ทีละแถว —
 * ตอน backfill มีเป็นแสนแถว ถ้ายิงทีละแถวจะใช้เวลาเป็นชั่วโมงแทนที่จะเป็นวินาที
 *
 * @param {Array<{at: Date|string, station: string, measure: string, value: number}>} rows
 * @param {string} source ชื่อแหล่งที่มา ใช้สืบย้อนว่าแถวนี้มาจากไหน
 * @returns {Promise<number>} จำนวนแถวที่เขียนเข้าไปจริง (ไม่นับแถวที่ซ้ำแล้วถูกทิ้ง)
 */
export async function insertObs(rows, source) {
  const clean = rows.filter(
    (r) => r && r.at && r.station && r.measure && Number.isFinite(Number(r.value)),
  );
  if (clean.length === 0) return 0;

  /* แบ่งเป็นก้อนละ 5,000 แถว — ก้อนใหญ่กว่านี้ Postgres เริ่มกินหน่วยความจำมาก
     และถ้าล้มกลางทางจะเสียงานทั้งก้อน ก้อนเล็กลงหน่อยเสียหายน้อยกว่า */
  const CHUNK = 5000;
  let written = 0;

  for (let i = 0; i < clean.length; i += CHUNK) {
    const part = clean.slice(i, i + CHUNK);
    const res = await query(
      `insert into obs (at, station, measure, value, source)
       select * from unnest(
         $1::timestamptz[], $2::text[], $3::text[], $4::float8[], $5::text[]
       )
       on conflict (station, measure, at) do nothing`,
      [
        part.map((r) => (r.at instanceof Date ? r.at.toISOString() : r.at)),
        part.map((r) => r.station),
        part.map((r) => r.measure),
        part.map((r) => Number(r.value)),
        part.map(() => source),
      ],
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

/**
 * เขียนคำพยากรณ์ลงตาราง fcst
 *
 * ต่างจาก obs ตรงที่มีสองเวลา — ดูเหตุผลเต็มในหัวตาราง `fcst` ของ 001_schema.sql
 * สรุปสั้น ๆ คือ ถ้าไม่แยก จะเผลอเอาข้อมูลอนาคตไปเทรนโดยไม่รู้ตัว
 */
export async function insertFcst(rows, source) {
  const clean = rows.filter(
    (r) => r && r.issuedAt && r.validAt && r.station && r.measure && Number.isFinite(Number(r.value)),
  );
  if (clean.length === 0) return 0;

  const res = await query(
    `insert into fcst (issued_at, valid_at, station, measure, value, source)
     select * from unnest(
       $1::timestamptz[], $2::timestamptz[], $3::text[], $4::text[], $5::float8[], $6::text[]
     )
     on conflict (station, measure, valid_at, issued_at) do nothing`,
    [
      clean.map((r) => new Date(r.issuedAt).toISOString()),
      clean.map((r) => new Date(r.validAt).toISOString()),
      clean.map((r) => r.station),
      clean.map((r) => r.measure),
      clean.map((r) => Number(r.value)),
      clean.map(() => source),
    ],
  );
  return res.rowCount ?? 0;
}

/** บันทึกว่ารอบนี้ไปดึงมาแล้วเป็นยังไง — ใช้แยกแยะทีหลังว่าข้อมูลที่ขาดเพราะอะไร */
export async function logCollect(source, ok, rowsIn, note) {
  await query(
    `insert into collect_log (source, ok, rows_in, note) values ($1, $2, $3, $4)`,
    [source, ok, rowsIn ?? 0, note ? String(note).slice(0, 500) : null],
  );
}

/**
 * เวลาล่าสุดที่เก็บมาจากแหล่งหนึ่ง — จุดตั้งต้นของรอบเก็บสดแบบ "เอาเฉพาะที่ยังไม่มี"
 *
 * ★ แยกตาม `source` ไม่ใช่ตาม `station` — สถานีเดียวกันเคยมีหลายแหล่งเขียนลงไป
 *   (csv · plotnexus · swine_db) ถ้าดูที่สถานี จะได้เวลาของแหล่งอื่นมาเป็นจุดตั้งต้น
 *   แล้วข้ามช่วงที่แหล่งนี้ยังไม่เคยเก็บไปเงียบ ๆ
 */
export async function latestFromSource(source, measures = null) {
  const { rows } = measures
    ? await query(
        `select max(at) as at from obs where source = $1 and measure = any($2::text[])`,
        [source, measures],
      )
    : await query(`select max(at) as at from obs where source = $1`, [source]);
  return rows[0]?.at ?? null;
}

/** เวลาล่าสุดที่มีข้อมูลของสถานีหนึ่ง — ใช้เป็นจุดตั้งต้นตอน backfill ต่อจากของเดิม */
export async function latestAt(station) {
  const { rows } = await query(`select max(at) as at from obs where station = $1`, [station]);
  return rows[0]?.at ?? null;
}
