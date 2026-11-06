/**
 * อากาศของ "ที่อื่น" ที่ไม่ใช่ฟาร์มเรา — ใช้ Open-Meteo (ฟรี ไม่ต้องมีกุญแจ)
 *
 * **ทำไมไม่ปล่อยให้ AI ตอบ** ทดสอบแล้วมันตอบไม่ได้เรื่องนี้:
 *   · ถาม "อุณหภูมิที่เชียงใหม่ตอนนี้เท่าไร" → ตัวจัดเส้นทางของมันดักคำว่า "อุณหภูมิ"
 *     แล้วย้อนถามว่า "จะดูเซนเซอร์จุดไหน 1. กำแพงเพชร สำนักงาน 2. เล้า R 5/2"
 *     มองข้ามคำว่าเชียงใหม่ไปทั้งคำ ใส่คำสั่งกำกับนำหน้าก็ยังโดนดักเหมือนเดิม
 *   · เลี่ยงคำว่า "อุณหภูมิ" แล้วถึงจะหลุดไปที่โมเดล แต่คำตอบไม่แน่นอน —
 *     เชียงใหม่มันค้นเน็ตให้ ส่วนขอนแก่นมันบอกว่า "ไม่มีสิทธิ์อ่านข้อมูลขอนแก่น"
 *
 * ➜ เรื่องนี้มีคำตอบที่ถูกต้องแน่นอนอยู่แล้ว ไม่ต้องเดา ไม่ต้องค้น — ยิงถามบริการพยากรณ์ตรง ๆ
 *   ได้ตัวเลขจริงทุกครั้ง เร็วกว่า และไม่กินโควตา AI ของอีกทีม
 *
 * เป็น API จริงที่เขาประกาศไว้ ไม่ใช่การอ่านหน้าเว็บแบบ `search.js` จึงพังยากกว่ามาก
 */

const GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 10_000;

/** รหัสสภาพอากาศมาตรฐาน WMO → คำไทย (เอาเท่าที่เจอในไทยจริง ๆ) */
const SKY = {
  0: "ท้องฟ้าโปร่ง", 1: "มีเมฆบางส่วน", 2: "มีเมฆเป็นส่วนมาก", 3: "เมฆมาก",
  45: "หมอก", 48: "หมอกน้ำค้างแข็ง",
  51: "ฝนละอองเบา", 53: "ฝนละออง", 55: "ฝนละอองหนัก",
  61: "ฝนเล็กน้อย", 63: "ฝนปานกลาง", 65: "ฝนหนัก",
  80: "ฝนซู่เล็กน้อย", 81: "ฝนซู่ปานกลาง", 82: "ฝนซู่หนัก",
  95: "พายุฝนฟ้าคะนอง", 96: "พายุฝนฟ้าคะนองมีลูกเห็บ", 99: "พายุฝนฟ้าคะนองมีลูกเห็บหนัก",
};

const get = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return res.json();
};

/**
 * หาอากาศปัจจุบัน + พยากรณ์สองวันของสถานที่หนึ่ง
 *
 * @param {string} place ชื่อสถานที่ภาษาไทย เช่น "เชียงใหม่"
 * @returns {Promise<object|null>} หาไม่เจอ/ล่ม → null (ให้ผู้เรียกไปหาทางอื่นต่อ)
 */
export async function lookupWeather(place) {
  const name = String(place ?? "").trim().slice(0, 80);
  if (!name) return null;

  try {
    const geo = await get(
      `${GEOCODE}?name=${encodeURIComponent(name)}&count=5&language=th&format=json`,
    );
    /* บังคับเฉพาะในไทย — ชื่อจังหวัดไทยหลายชื่อไปตรงกับเมืองในประเทศอื่น
       ถ้าไม่กรอง จะได้อากาศของอีกซีกโลกมาโดยที่ผู้ใช้ไม่รู้ตัวเลย */
    const hit = (geo.results ?? []).find((r) => r.country_code === "TH");
    if (!hit) return null;

    const w = await get(
      `${FORECAST}?latitude=${hit.latitude}&longitude=${hit.longitude}` +
        `&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max` +
        `&forecast_days=2&timezone=Asia%2FBangkok`,
    );
    const now = w.current;
    if (!now) return null;

    return {
      place: hit.name,
      /* จังหวัดกำกับ เพราะชื่ออำเภอกับชื่อจังหวัดซ้ำกันได้ ("เมือง" มีทุกจังหวัด) */
      area: hit.admin1 ?? null,
      at: now.time,
      tempC: now.temperature_2m,
      humidity: now.relative_humidity_2m,
      rainMm: now.precipitation,
      windKmh: now.wind_speed_10m,
      sky: SKY[now.weather_code] ?? null,
      today: {
        min: w.daily?.temperature_2m_min?.[0],
        max: w.daily?.temperature_2m_max?.[0],
        rain: w.daily?.precipitation_sum?.[0],
        rainChance: w.daily?.precipitation_probability_max?.[0],
      },
      tomorrow: {
        min: w.daily?.temperature_2m_min?.[1],
        max: w.daily?.temperature_2m_max?.[1],
        rain: w.daily?.precipitation_sum?.[1],
        rainChance: w.daily?.precipitation_probability_max?.[1],
      },
    };
  } catch {
    return null;
  }
}
