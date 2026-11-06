/**
 * ประกอบข้อความแจ้งเตือนจาก `code` + `params` ที่หลังบ้านส่งมา
 *
 * **ทำไมหลังบ้านไม่ส่งข้อความไทยมาเลย** เพราะแจ้งเตือนถูกเก็บไว้เป็นประวัติถาวร
 * ถ้าเก็บข้อความสำเร็จรูปลงฐาน วันที่ผู้ใช้สลับเป็นอังกฤษหรือจีน แจ้งเตือนเก่าทั้งตาราง
 * จะยังเป็นไทยอยู่ตลอดไป — ฐานจึงเก็บแค่ "เกิดอะไรขึ้น" (code) กับ "ตัวเลขอะไร" (params)
 * แล้วให้หน้าจอเป็นคนแต่งประโยค (กติกาใน docs/DATABASE.md ข้อ 5)
 *
 * รูปแบบข้อความต้องเหมือนของฟาร์มตัวอย่างใน `data/mock/alerts.js`
 * ไม่งั้นแจ้งเตือนสองแบบมาอยู่รายการเดียวกันแล้วอ่านเหมือนคนละระบบ
 */
import { formatNumber, formatNumber1 } from "../format.js";

/** หน่วยของแต่ละ metric — ใช้ต่อท้ายตัวเลขในข้อความ */
const UNIT = {
  temp_c: "°C",
  humidity: "%",
  nh3: " ppm",
  co2: " ppm",
  h2s: " ppm",
};

/** ตัวเลขทศนิยมหนึ่งตำแหน่งเฉพาะอุณหภูมิ ที่เหลือเป็นจำนวนเต็ม */
const fmt = (metric, value) =>
  metric === "temp_c" ? formatNumber1(value) : formatNumber(value);

const num = (metric, value) => `${fmt(metric, value)}${UNIT[metric] ?? ""}`;

/**
 * @param {object} alert หนึ่งรายการจาก GET /api/alerts
 * @returns {{title: string, detail: string}}
 */
export function alertText(alert) {
  const p = alert.params ?? {};
  const metric = alert.metric ?? p.metric;
  const value = p.value ?? alert.value;
  const limit = p.threshold ?? alert.threshold_used;

  switch (alert.code) {
    case "temp_c_high":
      return {
        title: `อุณหภูมิสูงกว่าเกณฑ์ ${formatNumber1(value - limit)} °C`,
        titleKey: "อุณหภูมิสูงกว่าเกณฑ์ {n} °C",
        titleVars: { n: formatNumber1(value - limit) },
        detail: `วัดได้ ${num(metric, value)} (เพดาน ${num(metric, limit)}) — เพิ่มรอบพัดลมหรือเปิดสเปรย์น้ำ`,
        detailKey: "วัดได้ {value} (เพดาน {limit}) — เพิ่มรอบพัดลมหรือเปิดสเปรย์น้ำ",
        detailVars: { value: num(metric, value), limit: num(metric, limit) },
      };
    case "temp_c_low":
      return {
        title: `อุณหภูมิต่ำกว่าเกณฑ์ ${formatNumber1(limit - value)} °C`,
        titleKey: "อุณหภูมิต่ำกว่าเกณฑ์ {n} °C",
        titleVars: { n: formatNumber1(limit - value) },
        detail: `วัดได้ ${num(metric, value)} (ขั้นต่ำ ${num(metric, limit)}) — ลดรอบพัดลมและตรวจลมโกรกที่ผนัง`,
        detailKey: "วัดได้ {value} (ขั้นต่ำ {limit}) — ลดรอบพัดลมและตรวจลมโกรกที่ผนัง",
        detailVars: { value: num(metric, value), limit: num(metric, limit) },
      };
    case "humidity_high":
      return {
        title: `ความชื้นสูง ${num(metric, value)}`,
        titleKey: "ความชื้นสูง {value}",
        titleVars: { value: num(metric, value) },
        detail: `สูงกว่าเพดาน ${num(metric, limit)} — ระบายอากาศเพิ่มและตรวจจุดน้ำรั่วที่รางน้ำ`,
        detailKey: "สูงกว่าเพดาน {limit} — ระบายอากาศเพิ่มและตรวจจุดน้ำรั่วที่รางน้ำ",
        detailVars: { limit: num(metric, limit) },
      };
    case "humidity_low":
      return {
        title: `ความชื้นต่ำ ${num(metric, value)}`,
        titleKey: "ความชื้นต่ำ {value}",
        titleVars: { value: num(metric, value) },
        detail: `ต่ำกว่าขั้นต่ำ ${num(metric, limit)} — อากาศแห้งเกินไป ระคายทางเดินหายใจของสุกร`,
        detailKey: "ต่ำกว่าขั้นต่ำ {limit} — อากาศแห้งเกินไป ระคายทางเดินหายใจของสุกร",
        detailVars: { limit: num(metric, limit) },
      };
    case "nh3_high":
      return {
        title: `แอมโมเนีย ${num(metric, value)} สูงเกินเกณฑ์`,
        titleKey: "แอมโมเนีย {value} สูงเกินเกณฑ์",
        titleVars: { value: num(metric, value) },
        detail: `เพดานคือ ${num(metric, limit)} — เร่งระบายอากาศและตักมูลออกจากร่อง`,
        detailKey: "เพดานคือ {limit} — เร่งระบายอากาศและตักมูลออกจากร่อง",
        detailVars: { limit: num(metric, limit) },
      };
    case "sensor_silent":
      return {
        title: "เซนเซอร์ไม่ส่งข้อมูล",
        detail: "ไม่มีค่าใหม่เข้ามาเกินเวลาที่กำหนด — ตรวจไฟและสัญญาณที่ตู้ควบคุมท้ายโรงเรือน",
      };
    /* ---------- จากแบบจำลองโรงเรือน (T1.264) ----------
       alert.metric ของสองรหัสนี้เป็นกุญแจกันซ้ำ ("twin" · "stuck:SENSOR-OUT:temp_c")
       ไม่ใช่ชื่อค่าที่วัด — ชื่อค่าจริงอยู่ใน params.metric */
    case "twin_hotter":
      return {
        title: "ร้อนกว่าที่แบบจำลองคาด",
        detail: `วัดได้ ${num("temp_c", p.value)} แต่แบบจำลองคาด ${num("temp_c", p.expected)} — ตรวจพัดลม ระบบทำความเย็น และประตูที่อาจเปิดค้าง`,
        detailKey: "วัดได้ {value} แต่แบบจำลองคาด {expected} — ตรวจพัดลม ระบบทำความเย็น และประตูที่อาจเปิดค้าง",
        detailVars: { value: num("temp_c", p.value), expected: num("temp_c", p.expected) },
      };
    case "sensor_stuck":
      return {
        title: p.outdoor ? "เซนเซอร์นอกเล้าค่าค้าง" : "เซนเซอร์ในเล้าค่าค้าง",
        detail: `ส่งค่า ${num(p.metric, p.value)} ซ้ำเดิมมา ${p.hours} ชม. — ไม่ได้วัดจริง ตรวจตัวเซนเซอร์ ${p.device}`,
        detailKey: "ส่งค่า {value} ซ้ำเดิมมา {hours} ชม. — ไม่ได้วัดจริง ตรวจตัวเซนเซอร์ {device}",
        detailVars: { value: num(p.metric, p.value), hours: formatNumber(p.hours), device: p.device },
      };
    default:
      /* code ที่หน้าจอยังไม่รู้จัก (หลังบ้านเพิ่มเกณฑ์ใหม่แต่หน้าเว็บยังไม่อัปเดต)
         ต้องยังอ่านออก ไม่ใช่ขึ้นเป็นช่องว่าง — บอกเท่าที่รู้ไปก่อน */
      return {
        title: metric ? `${metric} ผิดเกณฑ์` : "พบค่าผิดปกติ",
        titleKey: metric ? "{metric} ผิดเกณฑ์" : undefined,
        titleVars: metric ? { metric } : undefined,
        detail:
          value != null && limit != null
            ? `วัดได้ ${fmt(metric, value)} เทียบกับเกณฑ์ ${fmt(metric, limit)}`
            : "ดูรายละเอียดที่หน้าศูนย์การแจ้งเตือน",
      };
  }
}

/**
 * แปลงแจ้งเตือนจากหลังบ้านให้เป็นรูปเดียวกับของ `data/mock/alerts.js`
 * หน้าจอที่มีอยู่แล้วจึงแสดงได้ทันทีโดยไม่ต้องแยกเคส
 *
 * @param {object} alert   หนึ่งรายการจาก GET /api/alerts
 * @param {string} farmKey รหัสฟาร์มแบบที่หน้าเว็บใช้ (code เช่น "F-KPP")
 * @param {string} barnKey รหัสโรงเรือนแบบที่หน้าเว็บใช้ (เช่น "F-KPP-A1")
 */
export function toUiAlert(alert, farmKey, barnKey) {
  const { title, titleKey, titleVars, detail, detailKey, detailVars } = alertText(alert);
  return {
    id: alert.id,
    farmId: farmKey,
    farmName: alert.farm_name,
    barnId: barnKey,
    barnName: alert.barn_name,
    zone: (alert.barn_name ?? "").slice(-2, -1),
    category: alert.category,
    level: alert.level,
    title,
    /* คีย์แปล + ตัวแปรของหัวข้อ — หัวข้อที่มีตัวเลขฝังอยู่แปลด้วย t(title) ตรง ๆ ไม่ได้
       (สลับเป็นอังกฤษแล้วยังเป็นไทย) · ใช้ผ่าน alertTitle() เสมอ */
    titleKey,
    titleVars,
    detail,
    /* คีย์แปล + ตัวแปรของบรรทัดรายละเอียด — หน้าจอเลือกใช้ตัวนี้ก่อนถ้ามี
       (`detail` ภาษาไทยยังอยู่เหมือนเดิม สำหรับที่ไหนที่ยังไม่ได้แปล) */
    detailKey,
    detailVars,
    status: alert.status,
    time: alert.opened_at,
    /* บอกให้หน้าจอรู้ว่ารายการนี้มาจากหลังบ้านจริง ไม่ใช่ข้อมูลตัวอย่าง */
    dataSource: "live",
    /* ★ ใบนี้ "ตรวจซ้ำไม่ได้" — โรงเรือนไม่มีค่าใหม่มาให้ตรวจแล้ว (T1.307)
       หน้าจอต้องแยกให้เห็น ไม่ใช่แสดงปนกับใบที่เพิ่งตรวจมาเมื่อกี้ */
    unverified: alert.unverified === true,
  };
}

/**
 * หัวข้อแจ้งเตือนในภาษาที่เลือก — ใช้แทน t(a.title) ทุกที่
 * หัวข้อที่มีตัวเลข (เช่น "อุณหภูมิสูงกว่าเกณฑ์ 1.5 °C") ต้องแปลผ่านคีย์ + ตัวแปร
 * ส่วนหัวข้อคงที่และแจ้งเตือนของฟาร์มตัวอย่างไม่มีคีย์ จึงตกไปใช้ t(title) ตามเดิม
 * @param {Function} t ผลของ useT()
 * @param {{title?: string, titleKey?: string, titleVars?: object}} alert
 */
export const alertTitle = (t, alert) =>
  alert?.titleKey ? t(alert.titleKey, alert.titleVars) : t(alert?.title ?? "");

