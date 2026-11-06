/**
 * ข้อมูลอากาศภายนอกจาก Open-Meteo — ฟรี ไม่ต้องมีกุญแจ ไม่มีโควตาสำหรับงานขนาดนี้
 *
 * เลือกเจ้านี้เพราะ (1) แดชบอร์ดใช้อยู่แล้วใน server/src/modules/assistant/weather.js
 * (2) มี **ข้อมูลย้อนหลังจริงเป็นสิบปี** ผ่าน archive API ซึ่งเป็นของหายากในบริการฟรี
 * และ (3) ให้ค่าที่เซนเซอร์ที่ฟาร์มไม่มีเลย — ที่สำคัญที่สุดคือ **ความกดอากาศ**
 * กับ **รังสีดวงอาทิตย์** ซึ่งเป็นตัวขับอุณหภูมิที่แรงที่สุดสองตัว
 *
 * ═══ สอง endpoint นี้ทำคนละหน้าที่ อย่าสลับกัน ═══
 *   archive  = ค่าที่วิเคราะห์ย้อนหลังแล้ว (ERA5) แม่นที่สุด แต่ตามหลังปัจจุบันราว 5 วัน
 *   forecast = ครอบทั้งอดีตใกล้ ๆ (past_days) และอนาคต ใช้ต่อช่องว่างที่ archive ยังมาไม่ถึง
 */
import { config } from "../config.js";

const TIMEOUT_MS = 25_000;
const STATION = "openmeteo_kpp";

/**
 * ตัวแปรที่ขอ → ชื่อกลางของคลังข้อมูลเรา
 *
 * **สังเกตว่าไม่มี `airflow`** — Open-Meteo ให้ลมที่ความสูง 10 เมตรกลางแจ้ง
 * ซึ่งไม่มีอะไรเกี่ยวกับลมที่พัดผ่านตัวสุกรในเล้าเลย ตั้งชื่อให้ต่างกันไว้
 * จะได้ไม่มีใครเผลอเอาสองค่านี้มาแทนกัน
 */
const VARS = {
  temperature_2m: "temp_c",
  relative_humidity_2m: "rh",
  dew_point_2m: "dew_c",
  apparent_temperature: "app_temp_c",
  precipitation: "rain_mm",
  surface_pressure: "pres_sfc_hpa",
  pressure_msl: "pres_msl_hpa",
  cloud_cover: "cloud_pct",
  wind_speed_10m: "wind_ms",
  wind_direction_10m: "wind_dir_deg",
  wind_gusts_10m: "gust_ms",
  shortwave_radiation: "rad_wm2",
};

const HOURLY = Object.keys(VARS).join(",");

async function get(url, params) {
  const u = new URL(url);
  u.searchParams.set("latitude", String(config.openMeteo.lat));
  u.searchParams.set("longitude", String(config.openMeteo.lon));
  u.searchParams.set("hourly", HOURLY);
  /* ═══ สองบรรทัดนี้ห้ามลบ ═══
     wind_speed_unit: ค่าตั้งต้นของบริการนี้คือ กม./ชม. ส่วนเซนเซอร์ที่ฟาร์มเป็น m/s
       ถ้าไม่ตั้ง จะได้ตัวเลขที่ใหญ่กว่าความจริง 3.6 เท่าโดยไม่มีอะไรฟ้อง
       และดูสมเหตุสมผลพอที่จะไม่มีใครสังเกตจนกว่าจะเทรนโมเดลเสร็จแล้วผลเพี้ยน
     timezone=UTC: ให้เวลาที่ส่งกลับมาเป็น UTC ตรง ๆ จะได้ต่อ "Z" แล้วเก็บได้เลย
       ถ้าขอเป็นเวลาไทย บริการจะส่งสตริงที่ไม่มีเขตเวลาติดมา แล้ว JavaScript
       จะตีความเป็นเวลาเครื่อง ซึ่งในคอนเทนเนอร์กับบนเครื่องเราไม่เหมือนกัน */
  u.searchParams.set("wind_speed_unit", "ms");
  u.searchParams.set("timezone", "UTC");
  for (const [k, v] of Object.entries(params ?? {})) u.searchParams.set(k, String(v));

  const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    throw new Error(data?.reason || `เรียก Open-Meteo ไม่สำเร็จ (HTTP ${res.status})`);
  }
  return data;
}

/** คลี่คำตอบรูป { time: [...], temperature_2m: [...] } ออกเป็นแถวละค่า */
function unpack(hourly) {
  const times = hourly?.time ?? [];
  const rows = [];
  for (const [apiName, measure] of Object.entries(VARS)) {
    const series = hourly?.[apiName];
    if (!Array.isArray(series)) continue;
    for (let i = 0; i < times.length; i++) {
      const v = series[i];
      if (v === null || v === undefined) continue;
      rows.push({ at: `${times[i]}Z`, station: STATION, measure, value: Number(v) });
    }
  }
  return rows;
}

/**
 * ค่าย้อนหลังจากคลัง ERA5 — ใช้ตอน backfill
 *
 * ดึงย้อนได้ถึงปี 1940 ตามที่บริการประกาศไว้ แต่สำหรับงานนี้เอาแค่คลุมช่วงที่มี
 * ข้อมูลเซนเซอร์ก็พอ เพราะแถวที่มีอากาศข้างนอกแต่ไม่มีค่าในเล้า เทรนอะไรไม่ได้
 *
 * @param {string} startDate 'YYYY-MM-DD'
 * @param {string} endDate   'YYYY-MM-DD'
 */
export async function fetchArchive(startDate, endDate) {
  const data = await get(config.openMeteo.archiveUrl, {
    start_date: startDate,
    end_date: endDate,
  });
  return unpack(data?.hourly);
}

/**
 * ค่าล่าสุด + คำพยากรณ์ล่วงหน้า
 *
 * แยกผลลัพธ์เป็นสองกอง **ตามเส้นแบ่งที่เวลาปัจจุบัน**:
 *   อดีต   → obs   (สิ่งที่เกิดขึ้นแล้ว)
 *   อนาคต  → fcst  (สิ่งที่ยังเป็นแค่คำทำนาย พร้อมบันทึกว่าทำนายไว้ตอนไหน)
 *
 * การแยกนี้คือสิ่งที่ทำให้เอาคำพยากรณ์ไปเป็นตัวแปรต้นได้อย่างซื่อสัตย์
 * เพราะตอนสร้างชุดเทรนจะเลือกได้ว่า "ณ เวลานั้นเรารู้คำพยากรณ์รุ่นไหน"
 *
 * @param {number} pastDays ย้อนหลังกี่วัน (ต่อช่องว่างที่ archive ยังมาไม่ถึง)
 */
export async function fetchNowAndForecast(pastDays = 3, forecastDays = 3) {
  const issuedAt = new Date();
  const data = await get(config.openMeteo.forecastUrl, {
    past_days: Math.min(Math.max(pastDays, 0), 92),
    forecast_days: Math.min(Math.max(forecastDays, 1), 16),
  });

  const all = unpack(data?.hourly);
  const cut = issuedAt.getTime();
  const obs = [];
  const fcst = [];

  for (const r of all) {
    if (new Date(r.at).getTime() <= cut) obs.push(r);
    else fcst.push({ issuedAt, validAt: r.at, station: r.station, measure: r.measure, value: r.value });
  }
  return { obs, fcst, issuedAt };
}

export { STATION as OPEN_METEO_STATION };
