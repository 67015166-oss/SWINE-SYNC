/**
 * ตรวจสิ่งที่กล่องอื่นส่งเข้ามา ก่อนปล่อยลงฐาน (T1.347)
 *
 * ═══ ★ หลักของไฟล์นี้: ปฏิเสธให้ชัด ดีกว่ารับแล้วเก็บของเสีย ═══
 * ตู้กลางรับของจากสี่ทีมที่เขียนคนละภาษา คนละสไตล์ ถ้ารับหมดแล้วค่อยไปแก้ทีหลัง
 * ของเสียจะปนอยู่ในฐานโดยไม่มีใครรู้ว่ามาจากตรงไหน — และ **ตามแก้ย้อนหลังไม่ได้**
 * ข้อความ error จึงบอกตรง ๆ ว่าช่องไหนผิดและควรเป็นอะไร เพื่อให้ทีมอื่นแก้ได้เอง
 */

/** ชื่อชุดข้อมูล — ให้ใช้จุดคั่นเป็นลำดับชั้นได้ เช่น `env.temp` หรือ `camera.count` */
const STREAM_NAME = /^[a-z0-9][a-z0-9_.-]{0,99}$/i;

const KINDS = new Set(["reading", "event", "file"]);

/** กันเนื้อหาก้อนเดียวใหญ่เกินจนฐานอืด — 64 KB พอสำหรับข้อความถาม-ตอบยาว ๆ */
const MAX_PAYLOAD_BYTES = 64 * 1024;

/** ส่งเข้ามาทีละก้อนได้ไม่เกินเท่านี้ กันคำขอเดียวล็อกตารางนานเกินไป */
export const MAX_BATCH = 500;

/**
 * เวลาที่ยอมรับ — อนาคตได้ไม่เกิน 5 นาที (เผื่อนาฬิกาสองเครื่องไม่ตรงกัน)
 * ★ ถ้าปล่อยเวลาอนาคตไกล ๆ เข้ามา กราฟจะมีจุดลอยไปข้างหน้าแล้วแกนเวลาเพี้ยนทั้งใบ
 */
const FUTURE_SLACK_MS = 5 * 60_000;

/** ย้อนหลังได้ไม่เกิน 1 ปี — เก่ากว่านั้นน่าจะเป็นนาฬิกาเพี้ยนมากกว่าข้อมูลจริง */
const PAST_LIMIT_MS = 365 * 24 * 60 * 60_000;

const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * ตรวจหนึ่งรายการ
 *
 * @param {object} item
 * @param {Date} [now]
 * @returns {{ok: true, value: object} | {ok: false, error: string}}
 */
export function checkItem(item, now = new Date()) {
  if (!item || typeof item !== "object" || Array.isArray(item))
    return { ok: false, error: "แต่ละรายการต้องเป็นอ็อบเจกต์" };

  const name = String(item.stream ?? "").trim();
  if (!STREAM_NAME.test(name))
    return { ok: false, error: `stream "${name}" ใช้ไม่ได้ — ใช้ a-z 0-9 . _ - ยาวไม่เกิน 100` };

  const kind = String(item.kind ?? "reading");
  if (!KINDS.has(kind))
    return { ok: false, error: `kind ต้องเป็น reading, event หรือ file (ได้รับ "${kind}")` };

  /* ไม่ส่งเวลามา = ถือว่าเป็นตอนนี้ ซึ่งถูกสำหรับค่าที่วัดแล้วส่งทันที */
  const at = item.at == null ? now : new Date(item.at);
  if (Number.isNaN(at.getTime()))
    return { ok: false, error: "at ต้องเป็นเวลาแบบ ISO เช่น 2026-10-26T10:30:00Z" };

  const drift = at.getTime() - now.getTime();
  if (drift > FUTURE_SLACK_MS)
    return { ok: false, error: "at อยู่ในอนาคตเกิน 5 นาที — ตรวจนาฬิกาของเครื่องที่ส่ง" };
  if (-drift > PAST_LIMIT_MS)
    return { ok: false, error: "at เก่ากว่า 1 ปี — ถ้าตั้งใจส่งย้อนหลังจริง แจ้งเจ้าของตู้กลางก่อน" };

  const base = { name, kind, at, unit: item.unit == null ? null : String(item.unit).slice(0, 32) };

  if (kind === "reading") {
    if (!isFiniteNumber(item.value))
      return { ok: false, error: "reading ต้องมี value เป็นตัวเลข (ไม่ใช่ข้อความหรือ null)" };
    return { ok: true, value: { ...base, value: item.value } };
  }

  if (kind === "file") {
    const url = String(item.url ?? "").trim();
    /* ★ ตู้กลางเก็บแค่ที่อยู่ไฟล์ ไม่เก็บตัวไฟล์ — ดูเหตุผลใน migration ของตู้กลาง */
    if (!/^https?:\/\/\S+$/i.test(url))
      return { ok: false, error: "file ต้องมี url ขึ้นต้นด้วย http หรือ https" };
    if (item.bytes != null && !isFiniteNumber(item.bytes))
      return { ok: false, error: "bytes ต้องเป็นตัวเลขหรือไม่ส่งมาเลย" };
    return {
      ok: true,
      value: {
        ...base,
        url,
        fileType: item.type == null ? null : String(item.type).slice(0, 64),
        bytes: item.bytes ?? null,
        payload: item.payload ?? null,
      },
    };
  }

  /* kind === "event" */
  if (item.payload == null)
    return { ok: false, error: "event ต้องมี payload" };
  let size = 0;
  try {
    size = Buffer.byteLength(JSON.stringify(item.payload));
  } catch {
    return { ok: false, error: "payload แปลงเป็น JSON ไม่ได้" };
  }
  if (size > MAX_PAYLOAD_BYTES)
    return { ok: false, error: `payload ใหญ่ ${size} ไบต์ — เกิน 64 KB ให้ส่งเป็นไฟล์แทน` };

  return { ok: true, value: { ...base, payload: item.payload } };
}

/**
 * ตรวจทั้งก้อน — รับได้ทั้งรายการเดียวและอาเรย์
 *
 * ★ รายงาน **ทุกรายการที่ผิดพร้อมเลขลำดับ** ไม่ใช่หยุดที่ตัวแรก
 *   ทีมอื่นจะได้แก้รอบเดียวจบ ไม่ต้องส่งมาลองทีละตัว
 */
export function checkBatch(body, now = new Date()) {
  const raw = Array.isArray(body) ? body : [body];
  if (raw.length === 0) return { ok: false, errors: ["ไม่มีรายการให้บันทึก"] };
  if (raw.length > MAX_BATCH)
    return { ok: false, errors: [`ส่งมา ${raw.length} รายการ — ครั้งละไม่เกิน ${MAX_BATCH}`] };

  const items = [];
  const errors = [];
  raw.forEach((item, i) => {
    const got = checkItem(item, now);
    if (got.ok) items.push(got.value);
    else errors.push(`รายการที่ ${i + 1}: ${got.error}`);
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, items };
}
