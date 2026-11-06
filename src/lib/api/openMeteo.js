/**
 * พยากรณ์อากาศจาก Open-Meteo — **คนละเรื่องกับค่าที่เสาอากาศวัด**
 *
 * ═══ ทำไมต้องมีแหล่งที่สอง ═══
 * เสาอากาศบอกได้แค่ "ตอนนี้เป็นยังไง" มันไม่รู้อนาคต การวางแผนงานฟาร์ม
 * (จะย้ายสุกรวันไหน · จะเปิดม่านน้ำล่วงหน้าไหม · ฝนจะเข้าเมื่อไร) ต้องใช้พยากรณ์
 * ซึ่งไม่มีเซนเซอร์ตัวไหนในโลกให้ได้ — ต้องมาจากแบบจำลองอากาศเท่านั้น
 *
 * ═══ ห้ามเอาตัวเลขสองแหล่งมาปนกันเด็ดขาด ═══
 * ค่าจากที่นี่เป็นของ **จุดกริดของแบบจำลอง** ไม่ใช่ของเสาที่ตั้งอยู่กลางแดดในฟาร์ม
 * วัดจริงตอนเขียนไฟล์นี้: เสาอ่านได้ 35.0 °C ขณะที่แบบจำลองบอก 27.6 °C —
 * ต่างกัน 7 องศาโดยที่ทั้งคู่ไม่ได้พัง (เสาโดนแดดตรง ๆ · แบบจำลองเฉลี่ยทั้งพื้นที่)
 * หน้าจอจึงต้องแยกให้ชัดว่าอันไหนคือ "วัดได้" อันไหนคือ "ทำนาย"
 *
 * เลือก Open-Meteo เพราะโปรเจกต์นี้ใช้อยู่แล้วสองที่ (`weather/collector` กับผู้ช่วย AI)
 * ฟรี ไม่ต้องมีกุญแจ จึงเรียกจากเบราว์เซอร์ตรง ๆ ได้โดยไม่มีความลับรั่ว
 * (ต่างจากกุญแจ AI ที่ต้องอยู่หลังบ้านเท่านั้น)
 */
const BASE = "https://api.open-meteo.com/v1/forecast";

/**
 * รหัสสภาพอากาศ WMO → คำไทย + ไอคอน
 *
 * รหัสหิมะ (71–77 · 85–86) แปลไว้ด้วยทั้งที่เมืองไทยไม่เจอ — ถูกกว่าการปล่อยให้
 * หลุดไปเป็น "ไม่ทราบ" ถ้าวันหนึ่งมีคนเอาแดชบอร์ดไปใช้ที่อื่น
 */
const WMO = {
  0: ["ท้องฟ้าแจ่มใส", "sun"],
  1: ["แดดจัดเป็นส่วนใหญ่", "cloud-sun"],
  2: ["มีเมฆบางส่วน", "cloud-sun"],
  3: ["เมฆมาก", "cloud"],
  45: ["หมอกลง", "fog"],
  48: ["หมอกน้ำแข็ง", "fog"],
  51: ["ฝนละอองเบา", "cloud-rain"],
  53: ["ฝนละออง", "cloud-rain"],
  55: ["ฝนละอองหนา", "cloud-rain"],
  56: ["ฝนละอองเยือกแข็ง", "cloud-rain"],
  57: ["ฝนละอองเยือกแข็งหนา", "cloud-rain"],
  61: ["ฝนเล็กน้อย", "cloud-rain"],
  63: ["ฝนปานกลาง", "cloud-rain"],
  65: ["ฝนหนัก", "cloud-rain"],
  66: ["ฝนเยือกแข็ง", "cloud-rain"],
  67: ["ฝนเยือกแข็งหนัก", "cloud-rain"],
  71: ["หิมะเล็กน้อย", "cloud"],
  73: ["หิมะปานกลาง", "cloud"],
  75: ["หิมะหนัก", "cloud"],
  77: ["เม็ดหิมะ", "cloud"],
  80: ["ฝนซู่", "cloud-rain"],
  81: ["ฝนซู่ปานกลาง", "cloud-rain"],
  82: ["ฝนซู่หนัก", "cloud-rain"],
  85: ["หิมะซู่", "cloud"],
  86: ["หิมะซู่หนัก", "cloud"],
  95: ["ฝนฟ้าคะนอง", "cloud-storm"],
  96: ["ฝนฟ้าคะนองมีลูกเห็บ", "cloud-storm"],
  99: ["ฝนฟ้าคะนองมีลูกเห็บหนัก", "cloud-storm"],
};

/** @returns {{label: string, icon: string}} รหัสที่ไม่รู้จักก็ยังได้ไอคอนกลาง ๆ ไม่ใช่ช่องว่าง */
export const skyOf = (code) => {
  const hit = WMO[code];
  return { label: hit?.[0] ?? "ไม่ทราบสภาพอากาศ", icon: hit?.[1] ?? "cloud" };
};

/** ชื่อวันแบบสั้นภาษาไทย — แถบพยากรณ์รายวันมีที่แค่สองตัวอักษร */
const DAY_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

/**
 * ขอพยากรณ์ของพิกัดหนึ่ง
 *
 * @param {{lat: number, lng: number}} at พิกัดฟาร์ม
 * @param {AbortSignal} [signal]
 * @returns {Promise<{hours: Array, days: Array, updatedAt: string}>}
 */
export async function fetchForecast(at, signal) {
  const url = new URL(BASE);
  url.searchParams.set("latitude", String(at.lat));
  url.searchParams.set("longitude", String(at.lng));
  url.searchParams.set(
    "hourly",
    "temperature_2m,precipitation_probability,weather_code,wind_speed_10m",
  );
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,"
      + "wind_speed_10m_max",
  );
  /* ═══ สองบรรทัดนี้ห้ามลบ (บทเรียนจาก weather/collector) ═══
     wind_speed_unit: ค่าตั้งต้นของบริการนี้เป็น กม./ชม. ส่วนทั้งแอปใช้ m/s
       ไม่ตั้งแล้วจะได้ตัวเลขใหญ่กว่าจริง 3.6 เท่าโดยไม่มีอะไรฟ้อง
     timezone: ขอเป็นเวลาไทยตรง ๆ เพราะหน้าจอนี้แสดงเวลาไทยล้วน
       (คลังข้อมูลฝั่ง weather/ ขอเป็น UTC เพราะต้องเอาไป join กับแหล่งอื่น — คนละงานกัน) */
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("timezone", "Asia/Bangkok");
  url.searchParams.set("forecast_days", "8");

  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.reason) {
    throw new Error(data?.reason || `เรียกพยากรณ์อากาศไม่สำเร็จ (HTTP ${res.status})`);
  }

  const h = data.hourly ?? {};
  const now = Date.now();

  /* ═══ เก็บทุกชั่วโมงข้างหน้าไว้ทั้งแปดวัน ไม่ตัดเหลือ 24 ตั้งแต่ตรงนี้ ═══
     ผู้ใช้สั่งให้กดใบวันแล้วกราฟเปลี่ยนตามวันนั้นได้ (9 ก.ย. 2569)
     ถ้าตัดเหลือ 24 ชั่วโมงที่นี่ กดวันอื่นแล้วจะไม่มีข้อมูลให้วาด
     **ยังตัดอดีตทิ้งเหมือนเดิม** — คำตอบเริ่มที่เที่ยงคืนของวันนี้เสมอ ถ้าไม่ตัด
     กราฟของวันนี้จะมีอดีตปนอยู่ครึ่งหนึ่ง ซึ่งซ้ำกับกราฟย้อนหลังที่อยู่คนละการ์ด
     ส่วนการเลือกว่าจะวาดช่วงไหน เป็นงานของหน้าจอ ไม่ใช่ของตัวดึงข้อมูล */
  const hours = (h.time ?? [])
    .map((iso, i) => ({
      at: iso,
      tempC: h.temperature_2m?.[i] ?? null,
      rainChance: h.precipitation_probability?.[i] ?? null,
      wind: h.wind_speed_10m?.[i] ?? null,
      code: h.weather_code?.[i] ?? null,
      /* วันของชั่วโมงนี้ในรูป YYYY-MM-DD — ตรงกับ `date` ของแถบรายวันพอดี
         ตัดจากข้อความตรง ๆ ไม่ผ่าน Date เพื่อไม่ให้เขตเวลาของเบราว์เซอร์มาเลื่อนวัน */
      date: iso.slice(0, 10),
      /* ป้ายแกน X — "13:00" เวลาไทย (API ส่งเป็นเวลาไทยมาแล้ว จึงอ่านตรง ๆ ได้) */
      hour: `${iso.slice(11, 13)}:00`,
    }))
    .filter((row) => new Date(row.at).getTime() >= now - 3600_000);

  const d = data.daily ?? {};
  const days = (d.time ?? []).map((iso, i) => {
    const date = new Date(`${iso}T00:00:00`);
    return {
      date: iso,
      dayName: DAY_SHORT[date.getDay()],
      isToday: i === 0,
      code: d.weather_code?.[i] ?? null,
      max: d.temperature_2m_max?.[i] ?? null,
      min: d.temperature_2m_min?.[i] ?? null,
      rainChance: d.precipitation_probability_max?.[i] ?? null,
      /* ลมแรงสุดของวัน ไม่ใช่ค่าเฉลี่ย — คนถามเรื่องลมเพราะอยากรู้ว่าจะแรงพอ
         พัดม่านหรือหลังคาไหม ค่าเฉลี่ยทั้งวันกลบช่วงที่แรงจริงทิ้ง
         (หน่วยเป็น m/s เพราะตั้ง wind_speed_unit=ms ไว้แล้วข้างบน) */
      windMax: d.wind_speed_10m_max?.[i] ?? null,
    };
  });

  return { hours, days, updatedAt: new Date().toISOString() };
}
