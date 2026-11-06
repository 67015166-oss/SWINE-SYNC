/**
 * อากาศนอกเล้าจาก Open-Meteo — ตัวขับของแบบจำลองโรงเรือนชั้นที่ 2 (T1.261)
 *
 * **ทำไมใช้ตัวนี้ ไม่ใช้เซนเซอร์นอกเล้า** SENSOR-OUT ส่งค่าเดิมซ้ำ 98% ของข้อมูลทั้งหมด
 * (ดู maskStuck ใน thermalModel.js) ผู้ใช้เลือกใช้ Open-Meteo ไปก่อน 17 ก.ย. 2569
 * จนกว่าเซนเซอร์จะซ่อม
 *
 * **นี่คือค่าจากแบบจำลองอากาศ ไม่ใช่ค่าที่วัดที่ฟาร์ม** — รายชั่วโมง ละเอียดเป็นตารางกริดหลายกิโลเมตร
 * หน้าเว็บต้องติดป้ายแยกทุกที่ ห้ามปนกับค่าที่เซนเซอร์วัด (กติกาใน CLAUDE.md)
 *
 * ใช้ endpoint forecast + past_days=92 ทั้งตอนสอนและตอนใช้งาน
 * จะได้เป็นแหล่งเดียวกันเป๊ะ ไม่ใช่สอนด้วยข้อมูลย้อนหลังชุดหนึ่งแล้วใช้งานด้วยอีกชุด
 */

const BASE = "https://api.open-meteo.com/v1/forecast";
/** Open-Meteo อัปเดตรายชั่วโมง ถามถี่กว่านี้ไม่ได้อะไรเพิ่ม */
const TTL_MS = 60 * 60 * 1000;
const cache = new Map();

/**
 * ดึงอากาศรายชั่วโมงย้อนหลัง 92 วัน + พยากรณ์ 2 วัน (ชั้นที่ 3 ต้องมองไปข้างหน้าอย่างน้อย 24 ชม.)
 * @returns {Promise<{time:number[], temp:number[], humidity:number[], radiation:number[]}>}
 */
export async function hourlyWeather(lat, lng, { now = Date.now() } = {}) {
  const key = `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.value;

  const url =
    `${BASE}?latitude=${lat}&longitude=${lng}` +
    "&hourly=temperature_2m,relative_humidity_2m,shortwave_radiation" +
    "&past_days=92&forecast_days=2&timezone=GMT&timeformat=unixtime";
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Open-Meteo ตอบ ${res.status}`);
  const { hourly } = await res.json();
  const value = {
    time: hourly.time,
    temp: hourly.temperature_2m,
    humidity: hourly.relative_humidity_2m,
    radiation: hourly.shortwave_radiation,
    /* เวลากลางชั่วโมงของรังสีแดด (ค่าเฉลี่ยของชั่วโมงที่ผ่านมา) — คิดครั้งเดียวตอนดึง */
    radiationTime: hourly.time.map((x) => x - 1800),
  };
  cache.set(key, { at: now, value });
  return value;
}

/** ค่าระหว่างสองชั่วโมงแบบเส้นตรง — นอกช่วงข้อมูลคืน null (ไม่ต่อเส้นเดาเอง) */
function interpolate(times, values, t) {
  if (!times.length || t < times[0] || t > times[times.length - 1]) return null;
  let lo = 0;
  let hi = times.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  const a = values[lo];
  const b = values[hi];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (times[hi] === times[lo]) return a;
  return a + ((b - a) * (t - times[lo])) / (times[hi] - times[lo]);
}

/**
 * อากาศนอก ณ เวลา t (วินาที)
 *
 * อุณหภูมิเป็นค่า ณ ต้นชั่วโมง ใช้ได้ตรง ๆ
 * ส่วนรังสีแดดเป็น **ค่าเฉลี่ยของชั่วโมงที่ผ่านมา** (ตามเอกสาร Open-Meteo)
 * จึงเลื่อนเวลาไปกลางชั่วโมงก่อนเทียบ ไม่งั้นแดดจะเร็วไปครึ่งชั่วโมงทั้งวัน
 */
export function weatherAt(w, t) {
  return {
    temp: interpolate(w.time, w.temp, t),
    humidity: interpolate(w.time, w.humidity, t),
    /* W/m² → kW/m² ให้สัมประสิทธิ์อยู่ในขนาดใกล้ตัวแปรอื่น */
    radiation: (() => {
      const v = interpolate(w.radiationTime, w.radiation, t);
      return v == null ? null : v / 1000;
    })(),
  };
}
