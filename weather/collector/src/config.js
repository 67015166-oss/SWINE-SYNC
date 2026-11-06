/**
 * ค่าตั้งทั้งหมดของตัวเก็บข้อมูล — อ่านจาก environment ที่เดียว
 *
 * ทุกตัวมีค่าตั้งต้นที่ใช้งานได้จริง ยกเว้นที่อยู่ฐานของแดชบอร์ดที่ต้องใส่เอง
 * (ไม่มี = เก็บได้แต่ Open-Meteo ซึ่งก็ยังมีประโยชน์ จึงไม่ทำให้ทั้งตัวล้ม)
 */

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  databaseUrl: process.env.DATABASE_URL,

  /* ── ค่าเซนเซอร์จากฐานของแดชบอร์ด (กล่อง box-mew) — **แหล่งหลักตอนนี้** ──
     ย้ายมาจาก PlotNexus เมื่อ 19 ต.ค. 2569 เหตุผลเต็มอยู่หัวไฟล์ `sources/swine.js` */
  swine: {
    url: process.env.SWINE_DB_URL || "",
    /* สะพานข้อมูลเขียนลงฐานนั้นทุก 30 วินาที (BRIDGE_INTERVAL_SEC) ถามถี่กว่านั้น
       ไม่ได้ค่าเพิ่ม และการถามช้ากว่าก็ไม่เสียอะไรเพราะดึงตามช่วงเวลา ไม่ใช่ค่าล่าสุด */
    everySec: num(process.env.SWINE_EVERY_SEC, 60),
  },

  /* ── PlotNexus (ข้อมูลจากพี่เลี้ยง) — ★ ปิดไว้ตั้งแต่ 19 ต.ค. 2569 ────
     กุญแจถูกถอนสิทธิ์ 11 ก.ย. 2569 ตัวเก็บจึงได้ 403 ทุกนาทีติดกันหกสัปดาห์
     ไม่ลบโค้ดทิ้ง เพราะถ้าพี่เลี้ยงเปิดสิทธิ์คืน แค่ตั้ง PLOTNEXUS_ENABLED=1 ก็กลับมาใช้ได้
     (ตอนเปิดคืนจะเก็บคู่ขนานกับฐานแดชบอร์ด ซึ่งไม่ชนกันเพราะคนละ `source`) */
  plotnexus: {
    enabled: process.env.PLOTNEXUS_ENABLED === "1",
    base: process.env.PLOTNEXUS_BASE || "https://lab.plotnexuslab.com/api",
    key: process.env.PLOTNEXUS_KEY || "",
    source: process.env.PLOTNEXUS_SOURCE || "pig",
    /* เซนเซอร์ส่งทุก ~5 วินาที แต่ /latest คืนค่าล่าสุดพร้อมเวลาที่วัดจริง
       ถามถี่กว่าที่เซนเซอร์ส่งไม่ได้ทำให้ได้แถวซ้ำ เพราะ primary key กันไว้แล้ว
       60 วินาทีจึงเป็นจุดที่ไม่พลาดค่าและไม่รบกวนบริการของเขาเกินจำเป็น */
    everySec: num(process.env.PLOTNEXUS_EVERY_SEC, 60),
  },

  /* ── Open-Meteo (ข้อมูลอากาศภายนอก ฟรี ไม่ต้องมีกุญแจ) ──────────── */
  openMeteo: {
    forecastUrl: process.env.OPEN_METEO_FORECAST || "https://api.open-meteo.com/v1/forecast",
    archiveUrl: process.env.OPEN_METEO_ARCHIVE || "https://archive-api.open-meteo.com/v1/archive",
    lat: num(process.env.FARM_LAT, 16.4828),
    lon: num(process.env.FARM_LON, 99.5222),
    /* ค่าเป็นรายชั่วโมง ถามถี่กว่านี้ก็ได้ค่าเดิม — 15 นาทีพอให้ค่าใหม่เข้าไว
       และเก็บคำพยากรณ์รอบใหม่ได้บ่อยพอจะเห็นว่าพยากรณ์เปลี่ยนไปยังไง */
    everySec: num(process.env.OPEN_METEO_EVERY_SEC, 900),
  },

  /* ชื่อเดิมของ `swine.url` — `backfill.js` ยังเรียกชื่อนี้อยู่ ให้ชี้ไปที่เดียวกัน
     จะได้ไม่มีวันตั้งคนละที่แล้วเก็บสดกับ backfill อ่านคนละฐาน */
  get swineDbUrl() {
    return this.swine.url;
  },

  /* ── โซนเวลา ────────────────────────────────────────────────────
     **เก็บลงฐานเป็น UTC เสมอ** แล้วค่อยแปลงเป็นเวลาไทยตอนอ่าน
     เก็บเป็นเวลาไทยตั้งแต่แรกคือกับดัก: พอเอาไป join กับข้อมูลจากแหล่งอื่น
     ที่เป็น UTC จะเหลื่อมกัน 7 ชั่วโมงโดยไม่มีอะไรฟ้อง กราฟยังดูสวยเหมือนเดิม */
  tz: "Asia/Bangkok",
};

export const plotnexusReady = config.plotnexus.enabled && Boolean(config.plotnexus.key);
export const swineReady = Boolean(config.swine.url);
