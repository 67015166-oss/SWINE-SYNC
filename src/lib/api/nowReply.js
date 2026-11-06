/**
 * เรียบเรียง "ค่าเซนเซอร์ตอนนี้" ให้เป็นคำตอบภาษาคน — **ประกอบเองในโค้ด ไม่ผ่านโมเดล**
 *
 * ตัวเลขมาจากฐานข้อมูลตรง ๆ (สะพานดึงจาก InfluxDB เข้ามาทุก 30 วินาที) จึงไม่มีอะไร
 * ต้องตีความ เขียนเองได้คำตอบเหมือนกันทุกครั้ง เร็วกว่ารอโมเดลคิด 28–150 วินาที
 * และไม่มีทางแต่งตัวเลขเกินจริง
 *
 * **แยกออกมาจาก Assistant.jsx (16 ก.ย. 2569)** เพราะแผงวอยซ์ต้องใช้ตัวเดียวกัน —
 * ถ้าปล่อยให้ต่างคนต่างเรียบเรียง วันหนึ่งห้องแชทกับวอยซ์จะตอบค่าคนละแบบจากข้อมูลชุดเดียวกัน
 */
import { formatDateTime, formatNumber, formatNumber1, formatTime } from "../format.js";

/** ไม่มีค่าใหม่เกินเท่านี้ = เซนเซอร์เงียบ — **ต้องตรงกับ `STALE_MS` ใน lib/api/LiveFarmsProvider.jsx**
    ไม่งั้นผู้ช่วยจะตอบค่าเป็น "ตอนนี้" ในขณะที่หน้าจอข้าง ๆ ขึ้น "ไม่มีสัญญาณ" */
export const STALE_MS = 15 * 60_000;

/** "เงียบมาแล้วนานเท่าไร" แบบที่คนอ่านแล้วรู้ทันทีว่านานผิดปกติหรือเปล่า */
export function describeAge(ms) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${formatNumber(minutes)} นาที`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${formatNumber(hours)} ชั่วโมง`;
  return `${formatNumber(Math.round(hours / 24))} วัน`;
}

/** ชื่อไทยของค่าที่วัด + หน่วย — เรียงตามลำดับที่คนอ่านเข้าใจง่ายที่สุด */
const METRIC_LABEL = {
  temp_c: ["อุณหภูมิ", "°C"],
  humidity: ["ความชื้น", "%"],
  wind_ms: ["ลม", "m/s"],
  nh3: ["แอมโมเนีย", "ppm"],
  co2: ["CO₂", "ppm"],
  h2s: ["H₂S", "ppm"],
};

/**
 * @param {Array} barns ผลจาก `fetchNow()`
 * @param {string[]} asked ชื่อค่าที่ผู้ใช้ถามถึง (ว่าง = เอาทุกค่าที่มี) จาก `currentReadingAsk()`
 * @returns {{text: string, bullets: string[], stale?: boolean}|null}
 *          `null` = ตอบไม่ได้ ให้ผู้เรียกส่งต่อไปถาม AI ต่อ
 */
export function nowReply(barns, asked) {
  const pick = (obj) => {
    const keys = asked.length > 0 ? asked : Object.keys(obj);
    return keys
      .filter((k) => obj[k] != null && METRIC_LABEL[k])
      .map((k) => `${METRIC_LABEL[k][0]} ${formatNumber1(obj[k])} ${METRIC_LABEL[k][1]}`);
  };

  const bullets = [];
  for (const b of barns) {
    const inside = pick(b.indoor);
    const outside = pick(b.outdoor);
    if (inside.length > 0) bullets.push(`${b.barn} ในโรงเรือน · ${inside.join(" · ")}`);
    if (outside.length > 0) bullets.push(`${b.barn} นอกโรงเรือน · ${outside.join(" · ")}`);
  }

  /* ถามค่าที่โรงเรือนนี้ไม่มีเซนเซอร์วัด (เช่นแอมโมเนีย ที่กำแพงเพชรมีแค่
     อุณหภูมิ/ความชื้น/ลม) → ไม่มีบรรทัดไหนออกมาเลย
     **ห้ามตอบหัวข้อเปล่า ๆ** ต้องคืน null ให้ผู้เรียกส่งต่อไปถาม AI
     ซึ่งจะบอกได้ว่า "จุดนี้ไม่มีเซนเซอร์วัดค่านั้น" — เป็นคำตอบที่ถูกต้องกว่าความเงียบ */
  if (bullets.length === 0) return null;

  /* เวลาที่วัดต้องบอกเสมอ — ค่าเซนเซอร์ที่ไม่รู้ว่าเก่าแค่ไหน เอาไปตัดสินใจไม่ได้
     (และถ้าสะพานหยุดทำงาน ตัวเลขจะยังขึ้นเหมือนเดิมแต่เวลาจะค้าง ซึ่งต้องเห็น) */
  const at = barns[0]?.at;
  /* **บอกแค่เวลาไม่พอ** — `formatTime` ให้แค่ "21:36 น." ซึ่งอ่านเหมือนวันนี้
     ตอนท่อข้อมูลหยุด ค่าอายุ 20 ชั่วโมงจึงถูกตอบว่าเป็นค่า "ตอนนี้"
     ทั้งที่หน้าจออื่นขึ้น "ไม่มีสัญญาณ" อยู่ — ผู้ช่วยต้องไม่พูดสวนกับแดชบอร์ด */
  const ageMs = at ? Date.now() - new Date(at).getTime() : Infinity;
  const farmName = barns[0]?.farm ?? "ฟาร์ม";

  if (ageMs > STALE_MS) {
    return {
      text: `${farmName} — เซนเซอร์เงียบอยู่ ค่าข้างล่างนี้ไม่ใช่ค่าปัจจุบัน`,
      bullets: [
        ...bullets,
        `วัดไว้เมื่อ ${formatDateTime(at)} · เงียบมาแล้ว ${describeAge(ageMs)}`,
      ],
      stale: true,
    };
  }

  return {
    text: `${farmName} — ค่าล่าสุดเมื่อ ${formatTime(at)}`,
    bullets,
  };
}
