/**
 * ดึงค่าเซนเซอร์จากคลาวด์ของพี่เลี้ยง (PlotNexus Lab)
 *
 * ═══ ข้อจำกัดที่ต้องรู้ก่อนแตะไฟล์นี้ ═══
 * `/api/series` **บีบข้อมูลให้เหลือประมาณ 120 จุดเสมอ** ไม่ว่าจะขอช่วงยาวแค่ไหน
 *   ขอ 24 ชม. → ได้จุดละ 12 นาที
 *   ขอ 30 วัน → ได้จุดละ 6 ชั่วโมง
 *   ขอ 1 ปี   → ได้จุดละ 73 ชั่วโมง
 * เท่ากับ **ดึงข้อมูลดิบย้อนหลังผ่าน API ไม่ได้** ยอดแหลมถูกเฉลี่ยกลืนไปหมด
 * ซึ่งเป็นสิ่งที่โมเดลพยากรณ์ต้องการมากที่สุด
 *
 * ➜ ที่นี่จึงใช้ `/api/latest` อย่างเดียว แล้วถามซ้ำถี่ ๆ เก็บสะสมเอง
 *   ได้ความละเอียดเท่าที่เซนเซอร์ส่งจริง และเป็นเหตุผลทั้งหมดที่ต้องมี
 *   คลังข้อมูลของเราเองแทนที่จะเรียกของเขาตอนใช้งาน
 *   ส่วนข้อมูลก่อนหน้าที่ระบบนี้เริ่มเดิน ต้อง backfill มาทางอื่น (ดู backfill.js)
 */
import { config } from "../config.js";

const TIMEOUT_MS = 20_000;

/**
 * จุดติดตั้งของ PlotNexus → รหัสสถานีของเรา
 * เพิ่มฟาร์มใหม่ = เพิ่มบรรทัดที่นี่ แล้วเพิ่มแถวในตาราง station
 */
export const STATION_OF = {
  barn_R: "barn_R",
  kamphaengphet_office: "kpp_mast",
};

/**
 * ชื่อค่าที่ PlotNexus ใช้ → ชื่อกลางของคลังข้อมูลเรา
 *
 * **ต้องแปลงชื่อตั้งแต่ปากทาง** เพราะ Open-Meteo เรียกอุณหภูมิว่า `temperature_2m`
 * ส่วนที่นี่เรียก `temperature` ถ้าปล่อยชื่อเดิมไว้ทั้งคู่ ตอน join จะต้องมานั่ง
 * จำว่าแหล่งไหนเรียกว่าอะไร และจะพลาดจนได้
 */
export const MEASURE_OF = {
  temperature: "temp_c",
  humidity: "rh",
  /* ลมในเล้าคือ airflow ส่วน wind_speed เป็นลมที่เสาอากาศข้างนอก คนละตัวกัน
     ทั้งคู่หน่วย m/s เหมือนกัน แต่ความหมายต่างกันสิ้นเชิง ห้ามรวมเป็นชื่อเดียว */
  airflow: "airflow_ms",
  wind_speed: "wind_ms",
  wind_direction: "wind_dir_deg",
  rainfall: "rain_mm",
  rainfall_24h: "rain24_mm",
  light: "light_lux",
  co2: "co2_ppm",
  nh3: "nh3_ppm",
  voltage_avg: "volt_v",
  current_avg: "amp_a",
  power_kw: "power_kw",
  energy_kwh: "energy_kwh",
  frequency: "freq_hz",
  power_factor: "pf",
};

async function get(path, params) {
  if (!config.plotnexus.key) throw new Error("ยังไม่ได้ตั้ง PLOTNEXUS_KEY");
  const url = new URL(config.plotnexus.base + path);
  url.searchParams.set("key", config.plotnexus.key);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => null);
  /* บริการนี้ส่งคำอธิบายข้อผิดพลาดเป็นภาษาไทยมาให้อยู่แล้ว ส่งต่อตรง ๆ ดีกว่าเขียนเอง */
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `เรียก ${path} ไม่สำเร็จ (HTTP ${res.status})`);
  }
  return data;
}

/**
 * ค่าล่าสุดทุกตัว → รายการแถวพร้อมเขียนลง obs
 *
 * เวลาที่ใช้คือ **เวลาที่เซนเซอร์วัดจริง** ที่ API ส่งมาด้วย ไม่ใช่เวลาที่เราไปถาม
 * ข้อนี้สำคัญมาก: ถ้าใช้เวลาที่ถาม ค่าเดิมค่าเดียวจะถูกเก็บซ้ำทุกนาทีเป็นแถวใหม่
 * เพราะเวลาไม่ซ้ำ กลายเป็นข้อมูลปลอมที่ดูเหมือนเซนเซอร์ส่งถี่กว่าความจริง
 */
export async function fetchLatestRows() {
  const data = await get("/latest", { source: config.plotnexus.source });
  const rows = [];
  const skipped = new Set();

  for (const item of data?.["ค่า"] ?? []) {
    const station = STATION_OF[item["จุดติดตั้ง"]];
    if (!station) {
      skipped.add(`จุดติดตั้ง:${item["จุดติดตั้ง"]}`);
      continue;
    }
    const at = item["เวลา"];
    const value = item["ค่า"];
    if (!at || value === null || value === undefined) continue;

    const known = MEASURE_OF[item.id];
    /* ค่าที่ยังไม่มีชื่อกลาง เก็บไว้ด้วยแต่ใส่คำนำหน้า raw_ กันปนกับชื่อที่นิยามแล้ว
       ทิ้งไปเลยไม่ได้ — วันหลังพี่เขาต่อเซนเซอร์ตัวใหม่ เราจะได้มีข้อมูลย้อนหลัง
       ของมันตั้งแต่วันแรกที่เขาต่อ แทนที่จะเริ่มนับหนึ่งตอนที่เราเพิ่งรู้ตัว */
    const measure = known ?? `raw_${item.id}`;
    if (!known) skipped.add(item.id);

    rows.push({ at, station, measure, value: Number(value) });
  }

  return { rows, at: data?.["อัปเดตล่าสุด"] ?? null, skipped: [...skipped] };
}
