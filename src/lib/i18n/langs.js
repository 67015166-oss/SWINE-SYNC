/**
 * ภาษาของแอป — ไทย · อังกฤษ · จีน (ตัวย่อ)
 *
 * **คีย์ของพจนานุกรมคือ "ข้อความไทย" ตัวจริงที่เขียนอยู่ในโค้ด** ไม่ใช่รหัสอย่าง `nav.farms`
 * เลือกแบบนี้เพราะแอปนี้เขียนด้วยภาษาไทยมาก่อนทั้งหมด:
 *   - โค้ดยังอ่านรู้เรื่องเหมือนเดิม เห็นข้อความจริงตรงที่ใช้ ไม่ต้องเปิดพจนานุกรมควบ
 *   - ถ้าลืมแปลคำไหน ผู้ใช้จะเห็น "ภาษาไทย" ไม่ใช่รหัสดิบ ๆ อย่าง nav.farms โผล่กลางจอ
 *   - ไม่ต้องคิดชื่อคีย์ใหม่ให้ทุกคำ (ของแบบนั้นพังง่ายเวลาข้อความไทยเปลี่ยน)
 *
 * ตัวแปรในข้อความใช้ปีกกา `{ชื่อ}` เสมอ — ห้ามต่อสตริงเอง เพราะลำดับคำของแต่ละภาษาไม่เหมือนกัน
 *   t("เฉลี่ย {n} ตัว/โรงเรือน", { n: formatNumber(x) })
 */
import { EN } from "./en.js";
import { ZH } from "./zh.js";

/** ภาษาที่เลือกได้ — `locale` ใช้กับ Intl (ตัวเลข/วันที่) · ชื่อภาษาเขียนด้วยภาษานั้นเอง */
export const LANGS = [
  { id: "th", name: "ไทย", locale: "th-TH" },
  { id: "en", name: "English", locale: "en-US" },
  { id: "zh", name: "中文", locale: "zh-CN" },
];

export const DEFAULT_LANG = "th";

const DICTS = { en: EN, zh: ZH };

/**
 * ชื่อที่ข้อมูลสร้างขึ้นเองตอนรันไทม์ (เช่น `โรงเรือน A1`) ใส่เป็นคีย์ตายตัวไม่ได้
 * เพราะมีได้ไม่จำกัดตัว — เทียบด้วยรูปแบบแทน แล้วเอาส่วนที่จับได้มาต่อในภาษาปลายทาง
 * (ใช้เฉพาะกรณีที่ชื่อถูกประกอบจากรหัสจริง ๆ เท่านั้น ข้อความทั่วไปให้ใส่พจนานุกรมตามปกติ)
 */
const PATTERNS = [
  { re: /^โรงเรือน (.+)$/, en: "Barn $1", zh: "$1 猪舍" },
  { re: /^ฟาร์ม(.+)$/, en: "$1 Farm", zh: "$1猪场" },
  /* ป้ายแกนของกราฟการเจริญเติบโต (data/mock/feed.js) — มีได้ไม่จำกัดสัปดาห์ */
  { re: /^สัปดาห์ (\d+)$/, en: "Week $1", zh: "第 $1 周" },
  /* รหัสชุดเลี้ยง เช่น "ชุด L2604" — รหัสเป็นตัวเลขโรมัน ไม่ต้องแปล แปลแต่คำนำหน้า */
  { re: /^ชุด (.+)$/, en: "Batch $1", zh: "$1 批次" },
  /* หัวข้อแจ้งเตือนที่ประกอบตัวเลขเข้าไป (data/mock/alerts.js) — ตัวเลขไม่ต้องแปล */
  { re: /^อุณหภูมิสูงกว่าเกณฑ์ (.+)$/, en: "Temperature $1 above range", zh: "温度高出范围 $1" },
  { re: /^ความชื้นสูง (.+)$/, en: "Humidity high at $1", zh: "湿度偏高 $1" },
  { re: /^แอมโมเนีย (.+) สูงเกินเกณฑ์$/, en: "Ammonia $1 above limit", zh: "氨气 $1 超标" },
  { re: /^พบสุกรท่าทางผิดปกติ (.+) ตัว$/, en: "$1 pigs behaving abnormally", zh: "发现 $1 头猪行为异常" },
  { re: /^AI นับได้น้อยกว่าที่ควรมี (.+) ตัว$/, en: "AI counted $1 pigs fewer than expected", zh: "AI 点数比应有数量少 $1 头" },
  { re: /^อาหารในไซโลเหลือ (.+)$/, en: "Feed silo down to $1", zh: "料塔剩余 $1" },
  { re: /^น้ำในถังเหลือ (.+)$/, en: "Water tank down to $1", zh: "水箱剩余 $1" },
];

/** กันค่าเพี้ยนจาก localStorage — ต้องเป็นภาษาที่มีจริงเท่านั้น */
export const getLang = (id) =>
  LANGS.find((l) => l.id === id) ?? LANGS.find((l) => l.id === DEFAULT_LANG);

/**
 * เอกพจน์/พหูพจน์ของภาษาอังกฤษ — เขียนคำแปลเป็น "เอกพจน์||พหูพจน์"
 * แล้วส่งจำนวนมาในตัวแปรชื่อ `n` เช่น "{n} alert||{n} alerts"
 * (ไทยกับจีนไม่มีรูปพหูพจน์ จึงไม่มีคำแปลไหนใช้ "||" อยู่แล้ว — ไม่กระทบกัน)
 */
function plural(text, n) {
  if (!text.includes("||")) return text;
  const [one, many] = text.split("||");
  /* n ที่ส่งมามัก format แล้ว ("1,234") — ตัดตัวคั่นหลักพันออกก่อนเทียบ */
  const count = Number(String(n ?? "").replace(/[^\d.-]/g, ""));
  return count === 1 ? one : many;
}

/** ลองเทียบชื่อที่ประกอบจากรหัส — ไม่เข้าเงื่อนไขไหนเลยคืน null ให้ตกกลับเป็นไทย */
function matchPattern(langId, text) {
  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (m && p[langId]) return p[langId].replace("$1", m[1]);
  }
  return null;
}

/**
 * แปลข้อความหนึ่งชิ้น
 *
 * @param {string} langId ภาษาปลายทาง
 * @param {string} text   ข้อความไทยตัวจริง (เป็นคีย์ในพจนานุกรมด้วย)
 * @param {object} [vars] ค่าที่จะแทนใน `{ชื่อ}`
 */
export function translate(langId, text, vars) {
  if (typeof text !== "string") return text;
  /* คำไทยคำเดียวกันแปลไม่เหมือนกันได้ตามที่ใช้ — เขียนบริบทต่อท้ายด้วย "|"
     เช่น "โรงเรือน" (เมนู = Barns) กับ "โรงเรือน|หน่วยนับ" (หน่วยหลังตัวเลข = barns)
     ฝั่งไทยตัดบริบททิ้งเสมอ ผู้ใช้จึงไม่มีวันเห็นเครื่องหมาย | โผล่บนจอ */
  const base = text.includes("|") ? text.slice(0, text.indexOf("|")) : text;
  /* ไทยคือต้นฉบับ ไม่ต้องเปิดพจนานุกรม · ภาษาอื่นถ้ายังไม่ได้แปลให้ตกกลับเป็นไทย */
  const dict = DICTS[langId];
  const raw =
    langId === "th"
      ? base
      : (dict?.[text] ?? dict?.[base] ?? matchPattern(langId, base) ?? base);
  if (!vars) return plural(raw, undefined);
  const picked = plural(raw, vars.n);
  return picked.replace(/\{(\w+)\}/g, (whole, key) =>
    Object.hasOwn(vars, key) ? String(vars[key]) : whole
  );
}
