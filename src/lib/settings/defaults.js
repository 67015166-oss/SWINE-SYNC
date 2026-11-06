/**
 * ค่าตั้งต้นของ "การตั้งค่า" ทั้งหมด + รายการตัวเลือกที่หน้าตั้งค่าเอาไปวาดเป็นปุ่ม
 *
 * แยกจากธีม (src/lib/theme/) โดยตั้งใจ:
 *   ธีม    = บทบาทและโทนสี — เปลี่ยนว่า "เห็นอะไร" กับ "สีอะไร"
 *   ตั้งค่า = พฤติกรรมของระบบ — ขนาดตัวอักษร เกณฑ์ตัดสินสถานะ การแจ้งเตือน ค่าไฟ
 * ทั้งสองเก็บคนละคีย์ใน localStorage จะได้ล้างอันเดียวโดยไม่กระทบอีกอัน
 *
 * ➜ เพิ่มค่าใหม่ต้องเติมทั้งใน DEFAULT_SETTINGS และตัว sanitize ใน SettingsProvider.jsx
 */
import { COMFORT } from "../../data/mock/climate.js";
import { SECTIONS } from "../theme/themes.js";

/**
 * หน้าที่เลือกเป็น "หน้าแรก" ได้ — ภาพรวม บวกกับส่วนงานที่มี URL ตายตัว
 *
 * คิดจาก SECTIONS โดยตรง ไม่ได้เขียนรายชื่อซ้ำไว้ที่นี่ — เพิ่มส่วนงานใหม่ใน
 * `lib/theme/themes.js` แล้วรายการนี้ตามเอง (ตราบใดที่ส่วนงานนั้นมี `nav` กับ `to`)
 */
export const HOME_PAGES = [
  { id: "overview", label: "ภาพรวม", icon: "chart", to: "/dashboard" },
  ...Object.entries(SECTIONS)
    .filter(([, section]) => section.nav && section.to)
    .map(([id, section]) => ({
      id,
      label: section.label,
      icon: section.icon,
      to: section.to,
    })),
];

/** แปลง id ของหน้าแรกเป็น path จริง — id ที่ไม่รู้จักถอยไปหน้าภาพรวม */
export const homePathOf = (id) =>
  HOME_PAGES.find((page) => page.id === id)?.to ?? HOME_PAGES[0].to;

/**
 * ขนาดตัวอักษรทั้งแอปเป็น "เปอร์เซ็นต์" ปรับต่อเนื่องด้วยแถบเลื่อน
 * ค่าไปคูณกับ --text-scale ใน tokens.css ทุกขั้นจึงขยายพร้อมกัน
 *
 * ต่ำกว่า 80% ตัวเล็กจนป้ายแกนกราฟ (13px) อ่านไม่ออก · เกิน 150% การ์ดเริ่มพัง
 * step 5 คือละเอียดพอให้รู้สึกลื่นแต่ยังกดลูกศรทีละขั้นได้
 */
export const TEXT_SCALE = { min: 80, max: 150, step: 5, base: 100 };

/** จุดสังเกตบนแถบเลื่อน — โชว์เป็นขีดใต้แถบให้เล็งได้ง่าย */
export const TEXT_SCALE_MARKS = [
  { value: 80, label: "เล็ก" },
  { value: 100, label: "ปกติ" },
  { value: 125, label: "ใหญ่" },
  { value: 150, label: "ใหญ่มาก" },
];

/**
 * ความเข้มของภาพพื้นหลังทั้งหน้า (%) — ปรับต่อเนื่องด้วยแถบเลื่อน
 * 0 = ม่านทึบจนแทบไม่เห็นภาพ · 100 = เห็นภาพเต็มที่ · 50 = ค่าเดิมของระบบ
 * ค่าไปเป็น --photo-strength ใน tokens.css แล้วม่านคลุมภาพจะจาง/เข้มตาม
 */
export const PHOTO_STRENGTH = { min: 0, max: 100, step: 5, base: 50 };

/** จุดสังเกตบนแถบเลื่อนความเข้มพื้นหลัง */
export const PHOTO_STRENGTH_MARKS = [
  { value: 0, label: "จางสุด" },
  { value: 50, label: "ปกติ" },
  { value: 100, label: "ชัดสุด" },
];

/** ความหนาแน่นของเลย์เอาต์ — ปรับระยะห่างทั้งแอป */
export const DENSITIES = [
  { id: "normal", label: "ปกติ" },
  { id: "compact", label: "กระชับ" },
];

/** ระดับการแจ้งเตือนต่ำสุดที่จะแสดง — เรียงจากเข้มไปเบา */
export const ALERT_MIN_LEVELS = [
  { id: "critical", label: "เฉพาะวิกฤต" },
  { id: "serious", label: "ต้องจัดการขึ้นไป" },
  { id: "warning", label: "ทั้งหมด" },
];

/** ลำดับความรุนแรง (มากไปน้อย) — ใช้เทียบว่าแจ้งเตือนหนึ่งผ่านเกณฑ์ที่ตั้งไว้ไหม */
export const LEVEL_RANK = { critical: 3, serious: 2, warning: 1 };

/** ช่วงที่ยอมให้ปรับได้ของแต่ละเกณฑ์ — กันตั้งค่าจนระบบเตือนตลอดเวลาหรือไม่เตือนเลย */
export const COMFORT_LIMITS = {
  tempMin: { min: 10, max: 30, step: 1, unit: "°C" },
  tempMax: { min: 20, max: 40, step: 1, unit: "°C" },
  humidityMin: { min: 20, max: 80, step: 5, unit: "%" },
  humidityMax: { min: 40, max: 100, step: 5, unit: "%" },
  nh3Limit: { min: 5, max: 40, step: 1, unit: "ppm" },
};

/** ค่าไฟต่อหน่วยที่ยอมให้กรอก (บาท/kWh) */
export const KWH_RATE_LIMITS = { min: 1, max: 12, step: 0.25 };

export const DEFAULT_SETTINGS = {
  /* ---------- หน้าที่เปิดตอนเข้าระบบ ---------- */
  /* หน้าที่ระบบพาไปหลังเข้าสู่ระบบและตอนกดโลโก้
     **ไม่ใช่ปลายทางของปุ่ม "หน้าแรก" บนแถบเมนู** — ปุ่มนั้นไปหน้าภาพรวมเสมอ
     (เคยผูกกันไว้ พอผู้ใช้ตั้งค่านี้เป็นหน้าสภาพแวดล้อม ปุ่มหน้าแรกก็เด้งไปที่นั่น) */
  homePage: "overview",

  /* ---------- การแสดงผล ---------- */
  textScalePct: TEXT_SCALE.base,
  photoStrengthPct: PHOTO_STRENGTH.base,
  density: "normal",
  reduceMotion: false,
  /* ปุ่มสองตัวบนแถบลอยล่างจอ — ปิดได้จากกากบาทบนตัวปุ่มเอง หรือสวิตช์ในแท็บนี้
     เป็นคนละระบบกัน จึงปิดแยกกันได้ · ปิดทั้งคู่ = ไม่มีแถบลอยเลย */
  showAssistant: true,
  showVoiceAi: true,
  /* แผงวอยซ์อ่านคำตอบออกเสียงไหม — ปิดได้จากปุ่มลำโพงบนหัวแผง
     (ปิดแล้วยังใช้พูดถามได้เหมือนเดิม แค่ตอบเป็นตัวหนังสืออย่างเดียว) */
  speakAnswers: true,

  /* ---------- เกณฑ์สภาพแวดล้อม (ค่าตั้งต้น = ค่าเดิมใน data/mock/climate.js) ---------- */
  comfort: {
    tempMin: COMFORT.tempC.min,
    tempMax: COMFORT.tempC.max,
    humidityMin: COMFORT.humidity.min,
    humidityMax: COMFORT.humidity.max,
    nh3Limit: 15,
  },

  /* ═══ เกณฑ์ของค่าชนิดที่เพิ่มเข้ามาภายหลัง (T1.346) ═══
     คู่คือ `{ ชื่อค่า: { min?, max? } }` — คีย์เปิด ไม่ได้กำหนดตายตัว
     ต่างจาก `comfort` ข้างบนที่มีช่องตายตัว เพราะเซนเซอร์ชนิดใหม่เกิดขึ้นได้เรื่อย ๆ
     ★ ว่างไว้เป็นค่าตั้งต้นโดยตั้งใจ — ค่าที่ยังไม่มีใครตั้งเกณฑ์ ต้องไม่มีป้ายสถานะ
       เดาเกณฑ์ให้คือการบอกว่า "ปกติ" ทั้งที่ไม่มีใครรู้ว่าปกติของค่านั้นคือเท่าไร */
  metricRanges: {},

  /* ---------- การแจ้งเตือน ---------- */
  alertMinLevel: "warning",
  /* หมวดที่ปิดไว้ — เก็บเป็นรายการ "ที่ปิด" เพราะหมวดใหม่ที่เพิ่มทีหลังควรเปิดเองอัตโนมัติ */
  mutedCategories: [],

  /* ---------- บัญชีและระบบ ---------- */
  userName: "สมชาย ฟาร์มสุข",
  bahtPerKwh: 4,
};

/**
 * แปลงค่าเกณฑ์ในการตั้งค่าให้อยู่ในรูปเดียวกับ COMFORT ของ data/mock/climate.js
 * (floor/ceil เป็นขอบของ "หน้าปัดเกจ" ไม่ใช่เกณฑ์ตัดสิน จึงไม่ให้ผู้ใช้ปรับ)
 */
export const comfortOf = (settings) => ({
  tempC: {
    ...COMFORT.tempC,
    min: settings.comfort.tempMin,
    max: settings.comfort.tempMax,
  },
  humidity: {
    ...COMFORT.humidity,
    min: settings.comfort.humidityMin,
    max: settings.comfort.humidityMax,
  },
});
