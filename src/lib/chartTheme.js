/**
 * ธีมกลางของกราฟ (Recharts) — ทุกกราฟในแอปต้อง import ค่าจากไฟล์นี้
 * เพื่อให้เส้น/สี/แกนหน้าตาเดียวกันทุกหน้า
 *
 * กติกาสำคัญ (ดูเต็มใน docs/DESIGN.md หัวข้อ "กราฟ"):
 * - สี series ใช้เรียงตามลำดับ SERIES เสมอ ห้ามสลับ ห้ามสุ่ม
 * - สีผูกกับ "สิ่งของ" ไม่ใช่ลำดับ: ถ้าโรงเรือน 3 เคยเป็นสีเหลือง ต้องเป็นเหลืองทุกกราฟ
 * - กราฟหนึ่งมีแกน Y เดียวเท่านั้น (ห้าม dual-axis)
 */

/* ทุกค่าสีในไฟล์นี้เขียนเป็น var(--token, ค่าสำรอง) เพราะโหมดโทนสีมืดต้องใช้สีที่สว่างกว่า
   เบราว์เซอร์แทนค่า var() ใน presentation attribute ของ SVG (stroke/fill) ให้อยู่แล้ว
   ค่าสำรองคือชุดโหมดครีมทอง — เผื่อกรณีที่ token ยังไม่ถูกโหลด */

/** สีชุดกราฟตามลำดับที่ผ่านการตรวจ colorblind-safety แล้ว */
export const SERIES = [
  "var(--series-1, #2a78d6)", // 1 น้ำเงิน
  "var(--series-2, #1baf7a)", // 2 เขียวน้ำทะเล
  "var(--series-3, #eda100)", // 3 เหลือง
  "var(--series-4, #008300)", // 4 เขียว
  "var(--series-5, #4a3aa7)", // 5 ม่วง
  "var(--series-6, #e34948)", // 6 แดง
  "var(--series-7, #e87ba4)", // 7 ชมพู
  "var(--series-8, #eb6834)", // 8 ส้ม
];

/** สีที่ผูกกับโรงเรือนถาวร — โรงเรือนเดิมต้องเป็นสีเดิมทุกกราฟทุกหน้า */
export const BARN_COLORS = {
  B4: SERIES[0],
  B5: SERIES[1],
  B6: SERIES[2],
};

/** สีที่ผูกกับชนิดก๊าซถาวร — ก๊าซเดิมต้องเป็นสีเดิมทุกกราฟทุกหน้า */
export const GAS_COLORS = {
  nh3: SERIES[4], // แอมโมเนีย — ม่วง
  co2: SERIES[3], // คาร์บอนไดออกไซด์ — เขียว
  h2s: SERIES[5], // ไฮโดรเจนซัลไฟด์ — แดง
};

/**
 * สีที่ผูกกับค่าที่เสาอากาศวัดถาวร — ใช้ในหน้าสภาพอากาศ
 * อุณหภูมิกับความชื้นใช้สีเดียวกับกราฟในหน้าสภาพแวดล้อม (ส้ม/น้ำเงิน) โดยตั้งใจ
 * ค่าเดียวกันข้ามหน้าต้องเป็นสีเดิม ไม่งั้นคนดูต้องอ่านคำอธิบายสีใหม่ทุกหน้า
 */
export const WEATHER_COLORS = {
  tempC: SERIES[7], // อุณหภูมิ — ส้ม
  humidity: SERIES[0], // ความชื้น — น้ำเงิน
  wind: SERIES[1], // ความเร็วลม — เขียวน้ำทะเล
  rainfall: SERIES[4], // ฝน — ม่วง
  light: SERIES[2], // ความสว่าง — เหลือง
};

/**
 * สีของกราฟแบบจำลองโรงเรือน (T1.261) — "ของจริง" ใช้สีอุณหภูมิเดิมของทั้งแอป (ส้ม)
 * "แบบจำลองคาด" ใช้ม่วง ซึ่งอยู่ถัดไปในลำดับที่ตรวจ colorblind แล้ว และวาดเป็นเส้นประให้แยกได้โดยไม่ต้องดูสี
 */
export const TWIN_COLORS = {
  actual: WEATHER_COLORS.tempC,
  twin: SERIES[4],
  /* ชั้นที่ 3 (T1.262): เส้น "ตามที่ปรับตัวเลื่อน" — น้ำเงิน แยกจากเส้นแบบจำลองตั้งต้นชัด */
  scenario: SERIES[0],
};

/** สีที่ผูกกับหมวดต้นทุนถาวร — ใช้ทุกกราฟการเงิน */
export const COST_COLORS = {
  feed: SERIES[0], // ค่าอาหาร
  medicine: SERIES[1], // ยา/วัคซีน
  labor: SERIES[2], // แรงงาน
  utility: SERIES[3], // น้ำ/ไฟ
  other: SERIES[4], // อื่น ๆ
};

/* ค่าสีของแกน/กริด/tooltip อ้าง token ตรง ๆ จึงเปลี่ยนตามโหมดโทนสีเองทั้งหมด */

/** props มาตรฐานของแกนและกริด — กระจายใส่ component ของ Recharts */
export const gridProps = {
  stroke: "var(--grid-line, #ece5d7)",
  strokeDasharray: "0",
  vertical: false,
};

export const axisProps = {
  stroke: "var(--axis-line, #cfc5b0)",
  tick: { fill: "var(--ink-muted, #928c80)", fontSize: 13, fontFamily: "inherit" },
  tickLine: false,
  axisLine: { stroke: "var(--axis-line, #cfc5b0)" },
};

export const tooltipStyle = {
  contentStyle: {
    background: "var(--bg-surface, #ffffff)",
    border: "1px solid var(--border)",
    borderRadius: 14, // = --radius-md
    fontSize: 15,
    fontFamily: "inherit",
    boxShadow: "var(--shadow-float)",
    color: "var(--ink-secondary, #5b5f68)",
  },
  labelStyle: { color: "var(--ink-primary, #1c2637)", fontWeight: 600 },
  itemStyle: { color: "var(--ink-secondary, #5b5f68)" },
};

/** แถบ "ช่วงที่เหมาะสม" ในกราฟ (ReferenceArea) — เขียวจางแบบเดียวกับป้ายสถานะ "ปกติ" */
export const comfortBandProps = {
  /* ต้องอยู่หลังเส้นกราฟเสมอ ไม่งั้นแถบจะทับเส้นจนมองไม่เห็น */
  isFront: false,
  fill: "var(--status-good-bg, #e7f5e7)",
  fillOpacity: 1,
  stroke: "var(--status-good, #0ca30c)",
  strokeOpacity: 0.25,
  strokeDasharray: "4 4",
};

/** ความสูงมาตรฐานของกราฟในการ์ด */
export const CHART_HEIGHT = 280;

/**
 * ขอบบน-ล่างของแกน Y ที่เผื่อที่ว่างไว้เล็กน้อย เส้นกราฟจึงไม่ไปแปะขอบการ์ด
 *
 * **ต้องกรองค่าที่ไม่ใช่ตัวเลขทิ้งก่อนเสมอ** — `Math.min(...[27.1, null])` คืน **0**
 * เพราะ null ถูกแปลงเป็น 0 ไม่ใช่ถูกข้าม บั๊กนี้เคยทำให้กราฟอุณหภูมิของฟาร์มจริง
 * ได้แกน [-2, 30] แทนที่จะเป็น [22, 30] เส้นกราฟเลยถูกบีบไปกองอยู่ครึ่งบนของการ์ด
 *
 * ที่มาของ null: เซนเซอร์ในและนอกโรงเรือนส่งค่าคนละจังหวะกัน **ช่วงเวลาหนึ่ง ๆ จึงมีได้
 * ทั้งค่าในและไม่มีค่านอก (หรือกลับกัน)** ฝั่งที่ขาดมาเป็น null ปนอยู่ในอาร์เรย์เดียวกัน
 * (ตรวจของจริงแล้วเซนเซอร์นอกอาคารส่งค่าอยู่ปกติ ไม่ได้ไม่มีทั้งชุด)
 *
 * ถ้ากราฟมีแถบ "ช่วงที่เหมาะสม" ต้องกินช่วงนั้นทั้งช่วง ไม่งั้นแถบจะหลุดออกนอกแกนแล้วหายไป
 *
 * @param {Array<number|null|undefined>} values ค่าทั้งหมดที่จะวาด (ใส่ null ปนมาได้)
 * @param {number} pad ระยะเผื่อบน-ล่าง
 * @param {{floor?: number, ceil?: number, band?: {min: number, max: number}}} [options]
 */
export function paddedDomain(values, pad, { floor = null, ceil = null, band = null } = {}) {
  const nums = values.filter((v) => Number.isFinite(v));
  /* ไม่มีค่าให้วาดเลย — คืนช่วงของ "เกณฑ์" ถ้ามี ไม่งั้นคืน [0, 1]
     (ห้ามปล่อยให้ตกไปถึง Math.min() ของอาร์เรย์ว่าง ซึ่งคืน Infinity) */
  if (nums.length === 0) return band ? [band.min, band.max] : [0, 1];

  let low = Math.floor(Math.min(...nums) - pad);
  let high = Math.ceil(Math.max(...nums) + pad);
  if (band) {
    low = Math.min(low, band.min);
    high = Math.max(high, band.max);
  }
  if (floor !== null) low = Math.max(floor, low);
  if (ceil !== null) high = Math.min(ceil, high);
  return [low, high];
}

/**
 * แกน Y ที่ขีดห่างเท่ากันทุกช่อง — ใช้คู่กับ `paddedDomain`
 *
 * ปัญหาที่เจอจริง (หน้าแบบจำลองโรงเรือน 18 ก.ย. 2569): ช่วง [24, 31] หารขั้น 2 ไม่ลงตัว
 * Recharts จะขีด 24·26·28·30 แล้ว**ต่อท้ายด้วยขอบบน 31** — 30 กับ 31 ชิดกันจนป้าย 30 ถูกซ่อน
 * บนจอเลยเห็น 24·26·28·31 ดูเหมือนแกนเพี้ยน ➜ ขยายขอบให้ลงขั้นพอดีแล้วส่งขีดไปเองทุกอัน
 */
export function evenTicks([low, high], maxTicks = 7) {
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
    return { domain: [low, high], ticks: undefined };
  }
  const steps = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  const fits = (s) => Math.ceil(high / s) - Math.floor(low / s) + 1 <= maxTicks;
  const step = steps.find(fits) ?? steps[steps.length - 1];
  const lo = Math.floor(low / step) * step;
  const hi = Math.ceil(high / step) * step;
  const ticks = [];
  /* ปัดทศนิยมกันเลขลอยแบบ 24.500000000000004 */
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { domain: [lo, hi], ticks };
}

/**
 * ขีดแกนเวลาที่ตกต้นชั่วโมงห่างเท่ากัน — คืน**ตำแหน่งในอาร์เรย์** (แกน X ของกราฟใช้ dataKey="i")
 *
 * ถ้าปล่อยให้ Recharts เลือกเอง มันเก็บจุดสุดท้ายไว้เสมอ ขีดท้ายเลยห่างไม่เท่าช่องอื่น
 * (เห็นจริง: …15:30 · 16:15 · **17:15**) และไปตกที่ :15 :45 ซึ่งอ่านยากกว่าต้นชั่วโมง
 *
 * @param {number[]} times  เวลาเป็นวินาที unix เรียงจากเก่าไปใหม่
 * @param {number} maxTicks จำนวนขีดสูงสุดที่ยอมให้วาง
 */
export function hourTicks(times, maxTicks = 8) {
  const onHour = [];
  times.forEach((t, i) => {
    const d = new Date(t * 1000);
    if (Number.isFinite(t) && d.getMinutes() === 0) onHour.push({ i, hour: d.getHours() });
  });
  for (const every of [1, 2, 3, 4, 6, 12]) {
    const picked = onHour.filter((p) => p.hour % every === 0);
    if (picked.length <= maxTicks) return picked.map((p) => p.i);
  }
  return onHour.filter((p) => p.hour % 12 === 0).map((p) => p.i);
}
