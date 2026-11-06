/**
 * ทะเบียนชนิดค่าที่ระบบรู้จัก — แหล่งความจริงเดียวของ "ค่าหนึ่งตัวมีหน้าตายังไง" (T1.346)
 *
 * ═══ ทำไมต้องมีไฟล์นี้ ═══
 * เดิมความรู้เรื่องค่าหนึ่งตัวกระจายอยู่อย่างน้อยสี่ที่ — ตารางแปลงชื่อใน `serverFarms.js`
 * เกณฑ์ใน `AIR_LIMITS` ช่วงสบายใน `COMFORT` และไอคอนกับหน่วยที่เขียนซ้ำในแต่ละหน้า
 * เพิ่มค่าที่วัดใหม่หนึ่งตัวจึงต้องไล่แก้หลายไฟล์ และลืมที่ใดที่หนึ่งแล้วอาการจะเงียบ
 * (ค่าไม่ขึ้นบนจอโดยไม่มี error — ดูคอมเมนต์ของ `bagOf`)
 *
 * ไฟล์นี้ย้ายความรู้นั้นมาเป็น **ข้อมูล** เพื่อให้แหล่งข้อมูลใหม่อย่าง Easy Pairing
 * เพิ่มชนิดค่าเข้ามาได้โดยแก้ที่เดียว และค่าที่ยังไม่มีใครขึ้นทะเบียนก็ไม่หายไปเงียบ ๆ
 *
 * ═══ ★ สิ่งที่ไฟล์นี้ตั้งใจ "ไม่" ทำ ═══
 * ไม่เปลี่ยนพฤติกรรมของของเดิมแม้แต่น้อย — ตารางแปลงชื่อที่ `serverFarms.js` ใช้
 * ถูก **คำนวณจากทะเบียนนี้** และมีเทสต์บังคับว่าต้องได้ผลเท่ากับตารางเดิมเป๊ะ
 * ค่าที่ยังไม่รู้จักจะไม่ถูกยัดเข้าถุงของ `toBarn` (จะทำให้หน้าจอเดิมได้คีย์แปลกปลอม)
 * แต่เก็บแยกไว้ที่ `extras` ให้หน้าจอรุ่นใหม่หยิบไปวาดเอง
 *
 * ═══ ★★ กติกาเรื่องเกณฑ์ ═══
 * **ค่าที่ไม่มี `range` ห้ามมีป้ายสถานะ** — เกณฑ์ของค่าหนึ่งตัวมาจากความรู้เฉพาะทาง
 * (NH₃ 15 ppm มาจากค่าแนะนำสำหรับสุกรกับเพดานความปลอดภัยของคนทำงาน) เซนเซอร์ชนิดใหม่
 * ที่เสียบเข้ามาไม่มีเกณฑ์ติดมาด้วย เดาเกณฑ์ให้คือการบอกว่า "ปกติ" ทั้งที่ไม่มีใครรู้
 * ตรงกับหลักของทั้งระบบ: **ไม่รู้ ต้องไม่เท่ากับ ปกติ และต้องไม่หน้าตาเหมือนกัน**
 */

/**
 * @typedef {object} MetricSpec
 * @property {string}  key          ชื่อค่าที่ฐานข้อมูลใช้ (คีย์ของทะเบียน)
 * @property {string}  label        ชื่อที่แสดงบนจอ
 * @property {string|null} unit     หน่วย — null เมื่อไม่มีหน่วย
 * @property {number}  decimals     ทศนิยมที่ควรแสดง
 * @property {string}  icon         ชื่อไอคอนใน components/ui/Icon.jsx
 * @property {string|null} field    ชื่อที่ `toBarn` รอรับเมื่อวัดในเล้า — null = ไม่รับเข้าถุง
 * @property {string|null} outdoorField ชื่อที่ `toBarn` รอรับเมื่อวัดนอกเล้า
 * @property {{min?: number, max?: number}|null} range เกณฑ์ตัดสิน — null = ยังไม่มีเกณฑ์
 * @property {{floor: number, ceil: number}|null} scale ช่วงของหลอด/แกนกราฟ
 * @property {boolean} known        true = ขึ้นทะเบียนไว้แล้ว
 */

/**
 * ★ ค่าในนี้ต้องตรงกับที่อื่นที่ถือเกณฑ์ชุดเดียวกัน — `COMFORT` (data/mock/climate.js)
 *   `AIR_LIMITS` (data/mock/airQuality.js) และ `alert_rule` ที่หลังบ้าน
 *   มีเทสต์ตรวจว่าตรงกันอยู่ เปลี่ยนที่นี่ที่เดียวแล้วเทสต์จะบอกว่าต้องตามแก้ตรงไหน
 */
export const METRICS = {
  temp_c: {
    key: "temp_c",
    label: "อุณหภูมิ",
    unit: "°C",
    decimals: 1,
    icon: "thermometer",
    field: "temperature",
    outdoorField: "temperature",
    range: { min: 22, max: 28 },
    scale: { floor: 14, ceil: 38 },
  },
  humidity: {
    key: "humidity",
    label: "ความชื้น",
    unit: "%RH",
    decimals: 0,
    icon: "drop",
    field: "humidity",
    outdoorField: "humidity",
    range: { min: 60, max: 75 },
    scale: { floor: 30, ceil: 100 },
  },
  wind_ms: {
    key: "wind_ms",
    label: "ความเร็วลม",
    unit: "ม./วิ",
    decimals: 1,
    icon: "fan",
    /* ★ ในเล้ากับนอกเล้าใช้คนละชื่อโดยตั้งใจ — `airflow` คือลมที่พัดลมทำให้เกิดในเล้า
       ส่วน `wind_speed` คือลมธรรมชาติที่เสาอากาศวัด คนละเรื่องกัน ห้ามรวมเป็นชื่อเดียว */
    field: "airflow",
    outdoorField: "wind_speed",
    range: { min: 0.5, max: 3 },
    scale: { floor: 0, ceil: 4 },
  },
  nh3: {
    key: "nh3",
    label: "แอมโมเนีย NH₃",
    unit: "ppm",
    decimals: 0,
    icon: "wind",
    field: "nh3",
    outdoorField: null,
    range: { max: 15 },
    scale: { floor: 0, ceil: 40 },
  },
  co2: {
    key: "co2",
    label: "คาร์บอนไดออกไซด์ CO₂",
    unit: "ppm",
    decimals: 0,
    icon: "cloud",
    field: "co2",
    outdoorField: null,
    range: { max: 2000 },
    scale: { floor: 0, ceil: 3000 },
  },
  h2s: {
    key: "h2s",
    label: "ไฮโดรเจนซัลไฟด์ H₂S",
    unit: "ppm",
    decimals: 1,
    icon: "warn",
    /* ★ ไม่มีเซนเซอร์ตัวนี้ติดตั้งจริง จึง **ไม่รับเข้าถุง** (field เป็น null)
       แต่ยังอยู่ในทะเบียนเพราะหน้าจอมีช่องของมันและต้องรู้ว่าหน่วยกับเกณฑ์คืออะไร
       วันที่ติดเซนเซอร์จริง เปลี่ยน field เป็น "h2s" ที่บรรทัดเดียวก็พอ */
    field: null,
    outdoorField: null,
    range: { max: 5 },
    scale: { floor: 0, ceil: 8 },
  },
};

/** ลำดับที่ควรเรียงบนหน้าจอ — ค่าที่คนดูบ่อยที่สุดอยู่ก่อน */
export const METRIC_ORDER = ["temp_c", "humidity", "wind_ms", "nh3", "co2", "h2s"];

/**
 * ตารางแปลงชื่อสำหรับ `bagOf` — **คำนวณจากทะเบียน ไม่ใช่เขียนซ้ำ**
 *
 * @param {"in"|"out"} place
 * @returns {Record<string, string>}
 */
export function fieldMapFor(place) {
  const prop = place === "out" ? "outdoorField" : "field";
  const map = {};
  for (const key of METRIC_ORDER) {
    const field = METRICS[key]?.[prop];
    if (field) map[key] = field;
  }
  return map;
}

/** ค่าที่ยังไม่มีใครขึ้นทะเบียน — ใช้หน้าตากลาง ๆ และ **ไม่มีเกณฑ์** */
function fallbackSpec(key, hint = {}) {
  return {
    key,
    /* ใช้ชื่อดิบเป็นป้ายไปก่อน ดีกว่าเขียนว่า "ไม่ทราบ" ซึ่งไม่ได้บอกอะไรกับคนอ่านเลย */
    label: hint.label ?? key,
    unit: hint.unit ?? null,
    decimals: hint.decimals ?? 1,
    icon: "pulse",
    field: null,
    outdoorField: null,
    /* ★ ห้ามเดาเกณฑ์ให้ — ดูหัวข้อ "กติกาเรื่องเกณฑ์" ด้านบน */
    range: null,
    scale: null,
    known: false,
  };
}

/**
 * หน้าตาของค่าหนึ่งตัว — คืนของกลางเสมอ ไม่เคยคืน null
 *
 * @param {string} key ชื่อค่าจากฐานข้อมูลหรือจากแหล่งภายนอก
 * @param {{label?: string, unit?: string, decimals?: number}} [hint] ข้อมูลที่แหล่งนั้นส่งมาด้วย
 * @returns {MetricSpec}
 */
export function describeMetric(key, hint = {}) {
  const spec = METRICS[key];
  if (!spec) return fallbackSpec(key, hint);
  return { ...spec, known: true };
}

/** ขึ้นทะเบียนไว้แล้วหรือยัง */
export const isKnownMetric = (key) => Object.hasOwn(METRICS, key);

/**
 * ค่าที่หลังบ้านส่งมาแต่ยังไม่มีใครขึ้นทะเบียน
 *
 * เดิมค่าพวกนี้ถูกข้ามเงียบ ๆ ที่ `bagOf` — เซนเซอร์ตัวใหม่จึงไม่ขึ้นบนจอ
 * โดยไม่มีอะไรบอก ฟังก์ชันนี้เก็บมันไว้ให้หน้าจอรุ่นใหม่หยิบไปวาด
 * และให้คนดูแลระบบเห็นว่ามีค่าอะไรไหลเข้ามาแต่ยังไม่ได้ตั้งเกณฑ์
 *
 * @param {Record<string, {value?: number, at?: string, unit?: string}>} current
 * @param {"in"|"out"} [place]
 * @returns {Array<{spec: MetricSpec, value: number|null, at: string|null}>}
 */
export function extrasOf(current, place = "in") {
  const mapped = fieldMapFor(place);
  const out = [];
  for (const [key, cell] of Object.entries(current ?? {})) {
    if (cell == null || mapped[key]) continue;
    /* ค่าที่อยู่ในทะเบียนแต่ place นี้ไม่รับ (เช่น NH₃ ฝั่งนอกเล้า) ไม่ใช่ของแปลกปลอม
       ยังหยิบสเปกจริงมาใช้ได้ จะได้หน่วยกับไอคอนที่ถูกต้อง */
    out.push({
      spec: describeMetric(key, { unit: cell.unit }),
      value: cell.value ?? null,
      at: cell.at ?? null,
    });
  }
  return out;
}

/**
 * ตัดสินสถานะจากเกณฑ์ในทะเบียน — **คืน null เมื่อไม่มีเกณฑ์หรือไม่มีค่า**
 *
 * ★ ที่คืน null ไม่ใช่ "ปกติ" เป็นเรื่องตั้งใจ หน้าจอต้องแปล null เป็น "ไม่มีเกณฑ์"
 *   ไม่ใช่ขึ้นป้ายเขียว ถ้าแปลผิดตรงนี้ เซนเซอร์ชนิดใหม่จะขึ้นเขียวทั้งแถบตั้งแต่วันแรก
 *
 * @param {string} key
 * @param {number|null} value
 * @param {{min?: number, max?: number}} [override] เกณฑ์ที่ผู้ใช้ตั้งเอง
 * @returns {"good"|"warn"|null}
 */
export function statusOf(key, value, override = null) {
  if (value == null) return null;
  const range = override ?? describeMetric(key).range;
  if (!range) return null;
  if (range.min != null && value < range.min) return "warn";
  if (range.max != null && value > range.max) return "warn";
  return "good";
}
