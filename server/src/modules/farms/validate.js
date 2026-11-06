/**
 * ตรวจและปรับรูปค่าที่ส่งมาสร้าง/แก้ฟาร์มกับโรงเรือน (T1.316)
 *
 * แยกจาก route.js เพราะสองเหตุผล
 *   1. ทดสอบได้โดยไม่ต้องมี Express และไม่ต้องมีฐานข้อมูล
 *   2. กติกาเดียวกันใช้ได้ทั้งตอนสร้างและตอนแก้ (`partial`) ไม่ต้องเขียนสองชุด
 *
 * ★ **ที่นี่ไม่แตะฐานข้อมูลเลย** เรื่องชนรหัสซ้ำกับการมีอยู่จริงเป็นหน้าที่ของ route
 *   เพราะต้องถามฐานถึงจะรู้ — แยกกันไว้จะได้ไม่ต้องจำลองฐานตอนเขียนเทสต์
 */
import { badRequest } from "../../lib/error.js";

/** ขั้นการเลี้ยงที่ฐานยอมรับ (ตรงกับ check constraint ของตาราง barn) */
export const STAGES = ["แม่พันธุ์", "ลูกสุกร", "อนุบาล", "ขุน"];

/** ป้ายบอกว่าตัวเลขเชื่อได้ไหม — ตรงกับ check constraint ของทั้งสองตาราง */
export const SOURCES = ["live", "demo"];

/**
 * รหัสฟาร์มแบบ `F-KPP` · รหัสโรงเรือนแบบ `A1`
 *
 * ★ **หน้าจอใช้รหัสนี้เป็น id** ไม่ใช่ uuid (ดู lib/api/serverFarms.js)
 *   เลย์เอาต์กระดาน บันทึกของผู้ใช้ และค่าตั้งรายโรงเรือนผูกกับรหัสนี้
 *   จึงห้ามมีช่องว่างหรืออักขระที่ใส่ใน URL ไม่ได้ และ**ห้ามเปลี่ยนทีหลังพร่ำเพรื่อ**
 */
const FARM_CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,15}$/;
const BARN_CODE_RE = /^[A-Z][0-9]{1,3}$/;

/**
 * อ่านตัวเลข โดยแยก "ไม่ได้ส่งมา" ออกจาก "ส่งมาแต่อ่านไม่ออก"
 *
 * ★★ กับดักที่เจอซ้ำสามรอบในโครงงานนี้ (T1.295 · T1.308 · T1.311):
 *   `Number(null)` คือ **0** และ `Number("")` ก็ **0** ทั้งคู่ผ่าน `Number.isFinite`
 *   ถ้าใช้ตัวเดียวตัดสิน ฟาร์มที่ไม่ได้กรอกพิกัดจะถูกบันทึกเป็น **ละติจูด 0 ลองจิจูด 0**
 *   ซึ่งเป็นจุดกลางมหาสมุทรแอตแลนติก แล้วหมุดจะไปโผล่ที่นั่นบนแผนที่
 *   — ดูเหมือนข้อมูลครบ แต่ผิดแบบที่ไม่มีอะไรฟ้อง
 *
 * @returns {number|null|undefined} ค่า · null = ไม่ได้ส่งมา/ว่าง · undefined = อ่านไม่ออก
 */
const readNumber = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const text = (v) => (v == null ? null : String(v).trim());

/** ข้อความที่ต้องมี — ว่างเปล่าไม่ผ่าน เพราะชื่อฟาร์มว่างทำให้การ์ดบนหน้าจออ่านไม่ออก */
function required(v, field, max = 120) {
  const s = text(v);
  if (!s) throw badRequest(`ต้องกรอก${field}`);
  if (s.length > max) throw badRequest(`${field}ยาวเกิน ${max} ตัวอักษร`, { got: s.length });
  return s;
}

function optionalText(v, field, max = 120) {
  const s = text(v);
  if (s == null || s === "") return null;
  if (s.length > max) throw badRequest(`${field}ยาวเกิน ${max} ตัวอักษร`, { got: s.length });
  return s;
}

/** พิกัดที่อยู่นอกโลกต้องไม่ถูกบันทึก — หมุดจะไปโผล่ที่ไม่มีอยู่จริง */
function coordinate(v, field, limit) {
  const n = readNumber(v);
  if (n === undefined) throw badRequest(`${field}ต้องเป็นตัวเลข`, { got: v });
  if (n === null) return null;
  if (n < -limit || n > limit) throw badRequest(`${field}ต้องอยู่ระหว่าง -${limit} ถึง ${limit}`, { got: n });
  return n;
}

function wholeNumber(v, field, max) {
  const n = readNumber(v);
  if (n === undefined) throw badRequest(`${field}ต้องเป็นตัวเลข`, { got: v });
  if (n === null) return null;
  if (!Number.isInteger(n)) throw badRequest(`${field}ต้องเป็นจำนวนเต็ม`, { got: n });
  if (n < 0) throw badRequest(`${field}ติดลบไม่ได้`, { got: n });
  if (max != null && n > max) throw badRequest(`${field}มากเกินไป`, { got: n, max });
  return n;
}

function source(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (!SOURCES.includes(s)) throw badRequest("ป้ายข้อมูลต้องเป็น live หรือ demo", { got: v });
  return s;
}

export function farmCode(v) {
  const s = text(v)?.toUpperCase() ?? "";
  if (!FARM_CODE_RE.test(s)) {
    throw badRequest("รหัสฟาร์มต้องเป็นตัวอักษรอังกฤษ/เลข/ขีด ยาว 2–16 ตัว เช่น F-KPP", { got: v });
  }
  return s;
}

export function barnCode(v) {
  const s = text(v)?.toUpperCase() ?? "";
  if (!BARN_CODE_RE.test(s)) {
    throw badRequest("รหัสโรงเรือนต้องเป็นตัวอักษรหนึ่งตัวตามด้วยเลข เช่น A1", { got: v });
  }
  return s;
}

/**
 * ค่าของฟาร์มที่พร้อมเขียนลงฐาน
 *
 * `partial` = true สำหรับการแก้ไข — ส่งมาแค่ช่องที่อยากเปลี่ยน
 * ช่องที่ไม่ได้ส่งมาจะไม่อยู่ในผลลัพธ์เลย (ไม่ใช่กลายเป็น null) เพื่อให้ route
 * เขียน `update` เฉพาะช่องนั้น ไม่ไปล้างช่องอื่นทิ้งโดยไม่ได้ตั้งใจ
 */
export function normalizeFarm(body, { partial = false } = {}) {
  const b = body ?? {};
  const has = (k) => Object.hasOwn(b, k);
  const out = {};

  if (!partial || has("code")) out.code = farmCode(b.code);
  if (!partial || has("name")) out.name = required(b.name, "ชื่อฟาร์ม");
  if (has("province")) out.province = optionalText(b.province, "จังหวัด", 60);
  if (has("district")) out.district = optionalText(b.district, "อำเภอ", 60);
  if (has("lat")) out.lat = coordinate(b.lat, "ละติจูด", 90);
  if (has("lng")) out.lng = coordinate(b.lng, "ลองจิจูด", 180);

  /* ★ ฟาร์มที่คนกรอกเองต้องเป็น demo เสมอจนกว่าจะมีเซนเซอร์จริงส่งค่าเข้ามา
     ป้าย "ข้อมูลจริง" บนหน้าจอมาจากช่องนี้ ตั้งเป็น live ตอนสร้างเมื่อไร
     ฟาร์มที่ยังไม่มีเซนเซอร์เลยจะถูกติดป้ายว่าเชื่อตัวเลขได้ ซึ่งไม่จริง */
  if (has("dataSource") || has("data_source")) {
    out.data_source = source(b.dataSource ?? b.data_source) ?? "demo";
  } else if (!partial) {
    out.data_source = "demo";
  }

  if (partial && Object.keys(out).length === 0) throw badRequest("ไม่มีช่องไหนให้แก้");
  return out;
}

/**
 * ค่าของโรงเรือนที่พร้อมเขียนลงฐาน
 *
 * ★ `zone` กับ `building` **คิดจากรหัสให้เอง** ถ้าไม่ได้ส่งมา — `A1` → โซน A อาคาร 1
 *   เพราะหน้าจอคิดแบบนี้อยู่แล้ว (`toBarn` ตัดอักษรแรกกับเลขที่เหลือ)
 *   ถ้าปล่อยให้สองที่คิดคนละแบบ โรงเรือนเดียวกันจะถูกจัดกลุ่มคนละโซนในแต่ละหน้า
 */
export function normalizeBarn(body, { partial = false } = {}) {
  const b = body ?? {};
  const has = (k) => Object.hasOwn(b, k);
  const out = {};

  if (!partial || has("code")) {
    out.code = barnCode(b.code);
    if (!has("zone")) out.zone = out.code.slice(0, 1);
    if (!has("building")) out.building = Number(out.code.slice(1));
  }
  if (!partial || has("name")) out.name = required(b.name, "ชื่อโรงเรือน");
  if (has("zone")) out.zone = optionalText(b.zone, "โซน", 4);
  if (has("building")) out.building = wholeNumber(b.building, "เลขอาคาร", 999);
  if (has("capacity")) out.capacity = wholeNumber(b.capacity, "ความจุ", 1_000_000);

  if (has("stage")) {
    const s = optionalText(b.stage, "ขั้นการเลี้ยง", 20);
    if (s != null && !STAGES.includes(s)) {
      throw badRequest(`ขั้นการเลี้ยงต้องเป็นหนึ่งใน ${STAGES.join(" · ")}`, { got: b.stage });
    }
    out.stage = s;
  }

  if (has("dataSource") || has("data_source")) {
    out.data_source = source(b.dataSource ?? b.data_source) ?? "demo";
  } else if (!partial) {
    out.data_source = "demo";
  }

  if (partial && Object.keys(out).length === 0) throw badRequest("ไม่มีช่องไหนให้แก้");
  return out;
}

/**
 * แปลงค่าที่ปรับรูปแล้วเป็นชิ้นส่วนของคำสั่ง `update ... set`
 * @returns {{sql: string, values: Array}} `sql` ว่าง = ไม่มีอะไรให้แก้
 */
export function updateParts(fields, startAt = 1) {
  const keys = Object.keys(fields);
  return {
    sql: keys.map((k, i) => `${k} = $${startAt + i}`).join(", "),
    values: keys.map((k) => fields[k]),
  };
}
