/**
 * ตัดสินว่า "ตอนนี้ปกติไหม" และ "ควรทำอะไรต่อ" (T1.277) — ฟังก์ชันล้วน ไม่ import อะไรเลย
 *
 * ═══ กติกา: ทุกคำแนะนำต้องมีตัวเลขรองรับ ═══
 * ห้ามเขียนคำแนะนำลอย ๆ แบบ "ควรดูแลใกล้ชิด" — คนหน้างานอ่านแล้วทำอะไรไม่ได้
 * ทุกข้อต้องมาจากค่าที่วัดได้จริงเทียบกับเกณฑ์ที่แอดมินตั้งไว้ในฐานข้อมูล
 * ค่าไหนไม่มี = ไม่พูดถึง ไม่ใช่เดาว่าปกติ
 *
 * ถ้อยคำตรงกับที่หน้าเว็บใช้ (src/lib/api/alertText.js) เพื่อไม่ให้คนอ่านสองที่แล้วงง
 */

/** ดัชนีความร้อน-ความชื้น — สูตรเดียวกับหน้าเว็บ (src/data/mock/climate.js) */
export const thiOf = (tempC, humidity) =>
  tempC == null || humidity == null
    ? null
    : Number((0.8 * tempC + (humidity / 100) * (tempC - 14.4) + 46.4).toFixed(1));

/** ระดับความเครียดจากความร้อน — ช่วงเดียวกับหน้าเว็บ */
export function thiLevel(thi) {
  if (thi == null) return null;
  if (thi < 74) return { tone: "good", label: "สบายตัว" };
  if (thi < 79) return { tone: "warn", label: "เริ่มเครียด" };
  if (thi < 84) return { tone: "bad", label: "เครียดปานกลาง" };
  return { tone: "bad", label: "เครียดรุนแรง" };
}

const TONE_RANK = { good: 0, warn: 1, bad: 2 };
const worst = (a, b) => (TONE_RANK[b] > TONE_RANK[a] ? b : a);

/**
 * สรุปสถานะของโรงเรือนจากค่าล่าสุด
 *
 * @param {object} o
 * @param {number|null} o.temp อุณหภูมิในเล้า
 * @param {number|null} o.humidity ความชื้นในเล้า
 * @param {object} o.limits เกณฑ์จาก alert_rule เช่น { temp_c: {min, max}, humidity: {min, max} }
 * @param {number|null} [o.ageMinutes] ค่าล่าสุดเก่ากี่นาที
 * @param {object[]} [o.alerts] เหตุที่ยังไม่ปิดของโรงเรือนนี้
 * @returns {{tone: "good"|"warn"|"bad", headline: string, cautions: string[]}}
 */
export function barnStatus({ temp, humidity, limits = {}, ageMinutes = null, alerts = [] }) {
  const cautions = [];
  let tone = "good";

  const t = limits.temp_c ?? {};
  const h = limits.humidity ?? {};

  if (temp == null && humidity == null) {
    return { tone: "warn", headline: "ไม่มีค่าจากเซนเซอร์", cautions: ["ยังไม่มีค่าเข้ามา — ตรวจไฟและสัญญาณที่ตู้ควบคุม"] };
  }

  if (temp != null && t.max != null && temp > t.max) {
    tone = worst(tone, "bad");
    cautions.push(`อุณหภูมิสูงกว่าเกณฑ์ ${(temp - t.max).toFixed(1)} °C — เพิ่มรอบพัดลมหรือเปิดสเปรย์น้ำ`);
  }
  if (temp != null && t.min != null && temp < t.min) {
    tone = worst(tone, "bad");
    cautions.push(`อุณหภูมิต่ำกว่าเกณฑ์ ${(t.min - temp).toFixed(1)} °C — ลดรอบพัดลมและตรวจลมโกรกที่ผนัง`);
  }
  if (humidity != null && h.max != null && humidity > h.max) {
    tone = worst(tone, "bad");
    cautions.push(`ความชื้นสูงกว่าเกณฑ์ ${Math.round(humidity - h.max)}% — เพิ่มการระบายอากาศ ลดการฉีดน้ำ`);
  }
  if (humidity != null && h.min != null && humidity < h.min) {
    tone = worst(tone, "warn");
    cautions.push(`ความชื้นต่ำกว่าเกณฑ์ ${Math.round(h.min - humidity)}% — ตรวจระบบพ่นละอองน้ำ`);
  }

  const thi = thiOf(temp, humidity);
  const level = thiLevel(thi);
  if (level && level.tone !== "good") {
    tone = worst(tone, level.tone);
    cautions.push(`ดัชนีความร้อน THI ${thi} (${level.label}) — เฝ้าดูการกินอาหารและการหอบ`);
  }

  /* ค่าค้างนาน = สิ่งที่เห็นอาจไม่ใช่ของตอนนี้ ต้องเตือนเสมอ ไม่งั้นคนเชื่อเลขเก่า */
  if (ageMinutes != null && ageMinutes > 15) {
    tone = worst(tone, "warn");
    cautions.push(`ค่าล่าสุดเก่า ${Math.round(ageMinutes)} นาที — ข้อมูลอาจไม่ใช่สภาพตอนนี้`);
  }

  for (const a of alerts) {
    if (a.code === "sensor_stuck") {
      tone = worst(tone, "warn");
      cautions.push(`เซนเซอร์ ${a.params?.device ?? ""} ส่งค่าเดิมค้าง — แจ้งช่างตรวจอุปกรณ์`.replace("  ", " "));
    }
    if (a.code === "sensor_silent") {
      tone = worst(tone, "warn");
      cautions.push("เซนเซอร์เงียบ ไม่มีค่าใหม่เข้ามา — ตรวจไฟและสัญญาณ");
    }
  }

  const headline = tone === "good" ? "อยู่ในเกณฑ์ปกติ" : tone === "warn" ? "ควรเฝ้าระวัง" : "ผิดปกติ ต้องจัดการ";
  /* ตัดข้อความซ้ำ (เช่น THI กับอุณหภูมิสูงชี้เรื่องเดียวกัน) แต่คงลำดับความสำคัญไว้ */
  return { tone, headline, cautions: [...new Set(cautions)] };
}

/**
 * สิ่งที่ควรทำต่อในรายงานประจำวัน — เรียงจากด่วนสุด
 * คืนอาร์เรย์ว่างไม่ได้: ไม่มีอะไรต้องทำก็ต้องพูดออกมาให้ชัด
 */
export function dailyActions({ status, openAlerts = [], coveragePct = null }) {
  const actions = [...(status?.cautions ?? [])];

  const critical = openAlerts.filter((a) => a.level === "critical").length;
  if (critical > 0) actions.unshift(`มีเหตุระดับวิกฤต ${critical} รายการที่ยังไม่ปิด — จัดการก่อนเรื่องอื่น`);

  if (coveragePct != null && coveragePct < 80) {
    actions.push(`ข้อมูลเมื่อวานเข้ามาแค่ ${Math.round(coveragePct)}% — ตรวจว่าเครื่องรับข้อมูลเปิดอยู่ตลอดคืนหรือไม่`);
  }

  return actions.length > 0 ? [...new Set(actions)] : ["ไม่มีรายการเร่งด่วน ดูแลตามปกติ"];
}
