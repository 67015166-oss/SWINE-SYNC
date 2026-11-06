/**
 * แยก "ละติจูด, ลองจิจูด" ออกจากข้อความช่องเดียว
 *
 * แยกไฟล์เพราะไฟล์ที่ export component ห้าม export อย่างอื่นปน (เหตุผลเดียวกับ useSettings.js)
 * รับทุกรูปแบบที่ก๊อปมาจาก Google Maps ได้ตรง ๆ เพราะคนก๊อปมาไม่เหมือนกัน:
 *   18.2812, 99.4906            — คลิกขวาบนแผนที่แล้วก๊อปพิกัด (แบบที่พบบ่อยสุด)
 *   18.2812 99.4906             — เว้นวรรคแทนคอมมา
 *   18.2812° N, 99.4906° E      — ก๊อปจากแถบข้อมูลสถานที่
 *   18°16'52.3"N 99°29'26.2"E   — องศา-ลิปดา-ฟิลิปดา
 *   https://www.google.com/maps/@18.2812,99.4906,15z — ก๊อป URL จากแถบที่อยู่
 * ถ้าใส่ซีกโลกสลับกัน (ลองจิจูดมาก่อน) จะสลับกลับให้เอง
 *
 * @returns {{lat:number, lng:number}|null|"error"}
 *   null = ยังไม่ได้กรอก · "error" = กรอกแล้วแต่อ่านไม่ออก/นอกช่วงที่เป็นไปได้บนโลก
 */
export function parseLatLng(text) {
  const raw = String(text ?? "").trim();
  if (raw === "") return null;

  const pair = fromUrl(raw) ?? fromDegrees(raw) ?? fromPlain(raw);
  if (!pair) return "error";

  const { lat, lng } = pair;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "error";
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return "error";
  return { lat, lng };
}

/* ---------- ลิงก์ Google Maps ---------- */

/* ลำดับสำคัญ: @lat,lng คือกรอบที่ผู้ใช้เห็นอยู่จริง ส่วน !3d!4d คือหมุดของสถานที่
   ถ้าลิงก์มีทั้งคู่ ให้เอาหมุดของสถานที่ก่อน เพราะตรงกับที่ผู้ใช้ตั้งใจชี้มากกว่า */
const URL_PATTERNS = [
  /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
  /[?&](?:q|ll|daddr|sll)=(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/,
  /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
];

function fromUrl(raw) {
  if (!/https?:\/\/|maps\.|\/maps/i.test(raw)) return null;
  for (const re of URL_PATTERNS) {
    const m = raw.match(re);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  /* ลิงก์ย่อ (maps.app.goo.gl) ไม่มีพิกัดอยู่ในตัวลิงก์ ต้องเปิดเน็ตตามไปดู
     — บอกว่าอ่านไม่ออกดีกว่าเดามั่ว */
  return null;
}

/* ---------- องศา (°) และซีกโลก (N/S/E/W) ---------- */

const DMS_RE =
  /(-?\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*['′])?\s*(?:(\d+(?:\.\d+)?)\s*["″])?\s*([NSEW])?/gi;

function fromDegrees(raw) {
  if (!raw.includes("°")) return null;
  const found = [...raw.matchAll(DMS_RE)]
    .filter((m) => m[0].trim() !== "")
    .map((m) => ({
      value: toDecimal(Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0), m[4]),
      axis: axisOf(m[4]),
    }));
  return found.length === 2 ? order(found) : null;
}

function toDecimal(deg, min, sec, hemi) {
  const size = Math.abs(deg) + min / 60 + sec / 3600;
  const negative = deg < 0 || /[SW]/i.test(hemi ?? "");
  return negative ? -size : size;
}

/* ---------- ตัวเลขล้วน (คั่นด้วยคอมมาหรือเว้นวรรค) ---------- */

function fromPlain(raw) {
  const parts = raw
    .replace(/[()[\]]/g, " ")
    .split(/[,\s]+/)
    .filter(Boolean);
  if (parts.length !== 2) return null;

  const found = parts.map((p) => {
    /* ตัวอักษรซีกโลกอาจติดมาท้ายตัวเลข เช่น 18.2812N — ต้องถอดออกก่อนแปลงเป็นตัวเลข */
    const hemi = p.match(/[NSEW]/i)?.[0];
    const value = Number(p.replace(/[NSEW]/gi, ""));
    return {
      value: /[SW]/i.test(hemi ?? "") ? -Math.abs(value) : value,
      axis: axisOf(hemi),
    };
  });
  return order(found);
}

/* ---------- ใช้ร่วมกัน ---------- */

function axisOf(hemi) {
  if (!hemi) return null;
  return /[NS]/i.test(hemi) ? "lat" : "lng";
}

/* ถ้าผู้ใช้บอกซีกโลกมาด้วยและใส่ลองจิจูดขึ้นก่อน ให้สลับกลับให้
   (ในไทย lat ~5–21 · lng ~97–106 สลับกันแล้วหมุดหลุดไปกลางมหาสมุทร) */
function order([a, b]) {
  if (a.axis === "lng" || b.axis === "lat") return { lat: b.value, lng: a.value };
  return { lat: a.value, lng: b.value };
}
