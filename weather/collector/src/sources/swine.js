/**
 * ดึงค่าเซนเซอร์จาก **ฐานของแดชบอร์ด** (กล่อง box-mew)
 *
 * ═══ ทำไมย้ายมาทางนี้ (19 ต.ค. 2569) ═══
 * เดิมคลังนี้รับค่าเซนเซอร์จาก PlotNexus (`sources/plotnexus.js`) แต่กุญแจถูกถอนสิทธิ์
 * ตั้งแต่ 11 ก.ย. 2569 ตัวเก็บจึงได้ 403 ทุกนาทีติดกันหกสัปดาห์ — คลังมีแต่อากาศภายนอก
 * ส่วนค่าในเล้าหยุดอยู่ที่ 5 ก.ย.
 *
 * ของชุดเดียวกันอยู่ในฐานของแดชบอร์ดอยู่แล้ว และ**ดีกว่าของเดิมด้วย**
 *   · เป็นค่าดิบเต็มความละเอียดที่สะพานดูดจาก InfluxDB มาตรง ๆ
 *     (API ของ PlotNexus บีบ `/series` เหลือ ~120 จุดเสมอ ดูหัวไฟล์ `plotnexus.js`)
 *   · ไม่ต้องพึ่งกุญแจของใคร — เป็นฐานของเราเอง
 *
 * ═══ ★ ข้อที่พลาดแล้วข้อมูลเสียเงียบ ๆ ═══
 * 1. **ห้ามส่ง `outdoor` ของฐานนี้ไปที่ `kpp_mast`** มันคนละเซนเซอร์กับเสาอากาศ
 *    ที่ PlotNexus เคยส่งมา (ต่างกัน 6 องศาในเวลาเดียวกัน) และตัวนี้ค้างค่าอยู่
 *    รวมกันเมื่อไรได้ขั้นบันไดปลอมกลางชุดข้อมูลทันที → ลง `kpp_out_legacy`
 * 2. **`wind_ms` ในเล้ากับนอกอาคารคนละเรื่อง** ในเล้าคือลมจากพัดลม (0.3–0.8 m/s)
 *    นอกอาคารคือลมธรรมชาติ ถ้าเก็บชื่อเดียวกันโมเดลจะเรียนความสัมพันธ์ที่ไม่มีจริง
 * 3. **อ่านอย่างเดียว** ฐานนี้เป็นของแดชบอร์ด คลังนี้ไม่มีสิทธิ์แก้อะไรทั้งนั้น
 */
import pg from "pg";
import { config } from "../config.js";

/** ชื่อ metric ของฐานแดชบอร์ด → ชื่อกลางของคลังนี้ (แยกตามในเล้า/นอกอาคาร) */
export const SWINE_MEASURE = {
  temp_c: { indoor: "temp_c", outdoor: "temp_c" },
  humidity: { indoor: "rh", outdoor: "rh" },
  /* ดูข้อ 2 ที่หัวไฟล์ — ห้ามยุบสองช่องนี้เป็นชื่อเดียว */
  wind_ms: { indoor: "airflow_ms", outdoor: "wind_ms" },
  light_lux: { indoor: "light_lux", outdoor: "light_lux" },
  nh3: { indoor: "nh3_ppm", outdoor: "nh3_ppm" },
  co2: { indoor: "co2_ppm", outdoor: "co2_ppm" },
  h2s: { indoor: "h2s_ppm", outdoor: "h2s_ppm" },
};

/** สถานีปลายทางของแถวหนึ่ง — ดูข้อ 1 ที่หัวไฟล์ก่อนแก้ */
export const stationOf = (outdoor) => (outdoor ? "kpp_out_legacy" : "barn_R");

/**
 * แถวดิบจาก `sensor_reading` → แถวพร้อมเขียนลง `obs`
 * ใช้ร่วมกันทั้งตอนเก็บสดและตอน backfill จะได้ไม่มีวันแปลงคนละแบบ
 */
export const mapSensorRows = (rows) =>
  rows
    .map((r) => {
      const measure = SWINE_MEASURE[r.metric]?.[r.outdoor ? "outdoor" : "indoor"];
      if (!measure) return null;
      return { at: r.at, station: stationOf(r.outdoor), measure, value: r.value };
    })
    .filter(Boolean);

/**
 * แถวดิบจาก `power_reading` → แถวพร้อมเขียนลง `obs`
 *
 * ★ กระแสเก็บเป็น **ค่าเฉลี่ยต่อเฟส** ไม่ใช่ผลรวมสามเฟส — สามเฟสต่างเฟสกัน 120°
 *   บวกเลขตรง ๆ ไม่มีความหมายทางไฟฟ้า (กติกาเดียวกับที่แดชบอร์ดใช้)
 */
export function mapPowerRows(rows) {
  const out = [];
  for (const r of rows) {
    const push = (measure, value) => {
      if (value != null) out.push({ at: r.at, station: "barn_R", measure, value });
    };
    push("volt_v", r.voltage);
    push("power_kw", r.power_kw);
    push("energy_kwh", r.kwh_total);
    push("freq_hz", r.frequency);
    const phases = [r.current_a, r.current_b, r.current_c].filter((n) => n != null);
    if (phases.length) push("amp_a", phases.reduce((s, n) => s + n, 0) / phases.length);
  }
  return out;
}

export const swineReady = Boolean(config.swine.url);

let pool = null;
/** ต่อฐานแดชบอร์ดแบบสร้างครั้งเดียว — `max: 3` พอ เพราะยิงทีละคำสั่ง */
export function swinePool() {
  if (!pool) pool = new pg.Pool({ connectionString: config.swine.url, max: 3 });
  return pool;
}

export async function closeSwinePool() {
  if (pool) await pool.end().catch(() => {});
  pool = null;
}

/** ชื่อกลางที่มาจากตาราง `sensor_reading` / `power_reading` — ใช้หาจุดตั้งต้นแยกกัน */
export const SENSOR_MEASURES = [
  ...new Set(Object.values(SWINE_MEASURE).flatMap((m) => [m.indoor, m.outdoor])),
];
export const POWER_MEASURES = ["volt_v", "amp_a", "power_kw", "energy_kwh", "freq_hz"];

/**
 * ค่าที่เพิ่มเข้ามาหลังเวลาที่ให้มา — ใช้ในรอบเก็บสด
 *
 * ═══ ★★ ทำไมต้องจำเวลาแยกสองตาราง ═══
 * **เจอมาแล้วจริง 19 ต.ค. 2569** ตอนแรกใช้จุดตั้งต้นร่วมกันตัวเดียว แล้วเอา
 * "เวลาล่าสุดของทั้งสองตารางรวมกัน" ไปเป็นจุดตั้งต้นรอบถัดไป
 *
 *   รอบแรกหลังหยุดไปนาน: `sensor_reading` มีค้างเป็นแสนแถวจึงชน `MAX_ROWS`
 *   แล้วอ่านได้ถึงแค่ 14 ก.ย. · ส่วน `power_reading` มีน้อยกว่าจึงอ่านได้ถึงปัจจุบัน
 *   จุดตั้งต้นรวมเลยกระโดดไปเป็น "ตอนนี้" → **ค่าเซนเซอร์ 15 ก.ย.–18 ต.ค. ถูกข้ามถาวร**
 *
 * ไม่มีอะไรพัง ไม่มี error สักบรรทัด คลังแค่ขาดไปหนึ่งเดือนเงียบ ๆ
 * ➜ แต่ละตารางต้องเดินด้วยเวลาของตัวเอง ห้ามเอามารวมกัน
 *
 * ★ ถอยหลังนิดหน่อย (`OVERLAP_MS`) ทุกครั้ง เผื่อแถวที่สะพานเขียนตามมาทีหลัง
 *   ด้วยเวลาที่เก่ากว่า — เขียนซ้ำไม่เป็นไรเพราะ `insertObs` กันแถวซ้ำอยู่แล้ว
 *   แต่ข้ามไปแล้วคือข้ามถาวร
 *
 * @param {{sensor: Date|string|null, power: Date|string|null}} since จุดตั้งต้นของแต่ละตาราง
 * @returns {Promise<{rows: Array, newest: {sensor: Date|null, power: Date|null}, read: number}>}
 */
const OVERLAP_MS = 5 * 60_000;
const MAX_ROWS = 100_000;

const startFrom = (since) =>
  since ? new Date(new Date(since).getTime() - OVERLAP_MS) : new Date(Date.now() - 3600_000);

export async function fetchSince(since = {}) {
  const db = swinePool();

  const { rows: sensor } = await db.query(
    `select r.at, r.metric, r.value, d.outdoor
       from sensor_reading r
       join device d on d.id = r.device_id
      where r.at > $1
      order by r.at
      limit ${MAX_ROWS}`,
    [startFrom(since.sensor).toISOString()],
  );
  const { rows: power } = await db.query(
    `select at, voltage, current_a, current_b, current_c, frequency, power_kw, kwh_total
       from power_reading
      where at > $1
      order by at
      limit ${MAX_ROWS}`,
    [startFrom(since.power).toISOString()],
  );

  const rows = [...mapSensorRows(sensor), ...mapPowerRows(power)];
  /* เวลาล่าสุดที่ "อ่านมาได้" ไม่ใช่ที่ "เขียนลงได้" — แถวที่แปลงไม่ติด (metric ที่ยัง
     ไม่มีชื่อกลาง) ก็ต้องนับ ไม่งั้นรอบหน้าจะวนอ่านช่วงเดิมซ้ำไปเรื่อย ๆ

     ★ วนหาเอง ห้ามใช้ `Math.max(...times)` — รอบแรกหลังหยุดไปนานจะได้มาเป็นแสนแถว
       แล้วการกระจายอาร์เรย์เป็นอาร์กิวเมนต์จะล้นสแต็ก ("Maximum call stack size exceeded")
       ซึ่งเป็นความพังที่โผล่เฉพาะตอนข้อมูลเยอะ จึงไม่เจอตอนทดสอบด้วยข้อมูลไม่กี่แถว */
  const maxAt = (list) => {
    let ms = 0;
    for (const r of list) {
      const t = new Date(r.at).getTime();
      if (t > ms) ms = t;
    }
    return ms > 0 ? new Date(ms) : null;
  };

  return {
    rows,
    newest: { sensor: maxAt(sensor), power: maxAt(power) },
    read: sensor.length + power.length,
    /* ชน MAX_ROWS = ยังตามไม่ทัน รอบหน้าจะเก็บต่อเอง — บอกไว้ให้เห็นในล็อก */
    more: sensor.length >= MAX_ROWS || power.length >= MAX_ROWS,
  };
}
