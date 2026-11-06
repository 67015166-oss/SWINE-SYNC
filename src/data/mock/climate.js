/**
 * Mock data: อุณหภูมิ / ความชื้น รายโรงเรือน — ใช้ในหน้า /dashboard/climate/:farmId/:barnId
 *
 * ต่อยอดจาก data/mock/barnsByFarm.js (ค่าปัจจุบันของโรงเรือน) ไม่ได้แก้โครงเดิมของไฟล์ใด
 * environment.js เป็นข้อมูลของฟาร์มตัวอย่างชุดเดิม — คนละชุดกัน อย่าสลับ
 *
 * ค่าย้อนหลัง 24 ชม. สร้างแบบ deterministic จากรหัสโรงเรือน จึงคงที่ทุกครั้งที่เปิดหน้า
 * และ "จุดสุดท้าย = ค่าปัจจุบันของโรงเรือนนั้นเป๊ะ" ตัวเลขบนหน้าจึงไม่ขัดกันเอง
 *
 * เมื่อต่อ API จริง: แทนที่ getClimateSeries() ด้วยข้อมูลเซนเซอร์จริง แล้วคืนรูปแบบเดิม
 */
import { getBarn } from "./barnsByFarm.js";

/** ช่วงที่เหมาะสมของสุกรโตเต็มวัย — ใช้ร่วมกันทั้งหน้า (แก้ที่นี่ที่เดียว) */
export const COMFORT = {
  tempC: { min: 22, max: 28, floor: 14, ceil: 38, unit: "°C" },
  humidity: { min: 60, max: 75, floor: 30, ceil: 100, unit: "%" },
};

/** ตัวสุ่มแบบคงที่ (mulberry32) — รหัสโรงเรือนเดียวกันได้ค่าชุดเดิมเสมอ */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (text) =>
  [...text].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 11);

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** รูปคลื่นของวัน: ร้อนสุดบ่าย 2 โมง เย็นสุดตี 2 (คืนค่า -1 ถึง 1) */
const dayShape = (hour) => Math.cos(((hour - 14) * Math.PI) / 12);

/** ความ "แดดแรง" ของชั่วโมงนั้น 0–1 — กลางคืนเป็น 0 ข้างนอกจึงเกือบเท่าข้างใน */
const dayHeat = (hour) => Math.max(0, dayShape(hour)) ** 1.2;

/** ส่วนต่างสูงสุดระหว่างข้างนอกกับข้างในตอนแดดจัด (ข้างนอกร้อนกว่าและแห้งกว่า) */
const OUT_GAP = { temp: 5.4, humidity: 9 };

/**
 * อุณหภูมิ/ความชื้นย้อนหลัง 24 ชม. (ราย 1 ชม.) ของโรงเรือนหนึ่ง
 * @returns {Array<{hour:string, tempC:number, humidity:number}>} เรียงเก่า→ใหม่
 */
export function getClimateSeries(farmId, barnId) {
  const barn = getBarn(farmId, barnId);
  if (!barn || barn.status === "offline") return [];

  const rand = seededRandom(hash(barnId));
  const endHour = new Date(barn.updatedAt).getHours();
  const tempAmp = 2.4 + rand() * 1.2;
  const humidityAmp = 6 + rand() * 4;

  return Array.from({ length: 24 }, (_, i) => {
    const hour = (endHour - 23 + i + 48) % 24;
    const last = i === 23;
    const wave = dayShape(hour) - dayShape(endHour);
    /* จุดสุดท้ายต้องเท่ากับค่าปัจจุบันเป๊ะ จึงไม่ใส่ค่าแกว่งในจุดนั้น */
    const noiseT = last ? 0 : (rand() - 0.5) * 0.7;
    const noiseH = last ? 0 : (rand() - 0.5) * 3;

    return {
      hour: `${String(hour).padStart(2, "0")}:00`,
      tempC: Number(clamp(barn.tempC + tempAmp * wave + noiseT, 14, 42).toFixed(1)),
      humidity: Math.round(clamp(barn.humidity - humidityAmp * wave + noiseH, 35, 98)),
    };
  });
}

/** ช่วงเวลาที่เลือกดูได้ในกราฟแนวโน้มของหน้ารายละเอียดโรงเรือน */
export const TREND_RANGES = [
  { hours: 12, label: "12 ชั่วโมงล่าสุด" },
  { hours: 24, label: "24 ชั่วโมงล่าสุด" },
  { hours: 48, label: "48 ชั่วโมงล่าสุด" },
];

const MAX_TREND_HOURS = 48;

/**
 * แนวโน้มสภาพแวดล้อมย้อนหลังของโรงเรือนหนึ่ง — 4 ค่าในชุดเดียวกัน
 * (อุณหภูมิ · ความชื้น · ความเร็วลม · แอมโมเนีย) ใช้ในการ์ด "แนวโน้มสภาพแวดล้อม"
 *
 * สร้าง 48 ชม. ครั้งเดียวแล้วตัดท้ายตามช่วงที่เลือก — สลับช่วง 12/24/48 ชม.
 * เส้นกราฟช่วงที่ทับกันจึงเป็นเส้นเดิมเป๊ะ ไม่กระโดดไปมา
 * จุดสุดท้าย = ค่าปัจจุบันของโรงเรือน เท่ากับตัวเลขบนการ์ดกล้องพอดี
 *
 * @returns {Array<{hour:string, tempC:number, humidity:number, wind:number, nh3:number}>}
 */
export function getBarnTrend(farmId, barnId, hours = 24) {
  const barn = getBarn(farmId, barnId);
  if (!barn || barn.status === "offline") return [];

  const rand = seededRandom(hash(barnId));
  const endHour = new Date(barn.updatedAt).getHours();
  const tempAmp = 2.4 + rand() * 1.2;
  const humidityAmp = 6 + rand() * 4;
  const windAmp = 0.3 + rand() * 0.4;
  const nh3Amp = 1.5 + rand() * 2.5;

  const full = Array.from({ length: MAX_TREND_HOURS }, (_, i) => {
    const hour = (endHour - (MAX_TREND_HOURS - 1) + i + 96) % 24;
    const last = i === MAX_TREND_HOURS - 1;
    const wave = dayShape(hour) - dayShape(endHour);
    /* จุดสุดท้ายไม่ใส่ค่าแกว่ง เพราะต้องเท่ากับค่าที่วัดได้ตอนนี้ */
    const noise = (scale) => (last ? 0 : (rand() - 0.5) * scale);

    const tempC = Number(clamp(barn.tempC + tempAmp * wave + noise(0.7), 14, 42).toFixed(1));
    const humidity = Math.round(clamp(barn.humidity - humidityAmp * wave + noise(3), 35, 98));

    return {
      hour: `${String(hour).padStart(2, "0")}:00`,
      tempC,
      humidity,
      wind: Number(clamp(barn.windSpeed + windAmp * wave + noise(0.3), 0, 5).toFixed(1)),
      nh3: Math.round(clamp(barn.nh3 - nh3Amp * wave + noise(2), 0, 40)),
      /* ค่าข้างนอกของชั่วโมงนั้น — กลางวันแดดจัดจะร้อนกว่าข้างในมาก กลางคืนเกือบเท่ากัน
         (ผูกกับค่าข้างในเสมอ เส้นข้างนอก/ข้างในจึงไม่มีทางสวนทางกันแบบผิดธรรมชาติ) */
      tempOut: Number(clamp(tempC + OUT_GAP.temp * dayHeat(hour), 14, 46).toFixed(1)),
      humidityOut: Math.round(clamp(humidity - OUT_GAP.humidity * dayHeat(hour), 25, 99)),
    };
  });

  /* t = ลำดับจุดในช่วงที่ตัดมา ใช้เป็นแกน X แทนชื่อชั่วโมง
     เพราะช่วง 48 ชม. มีชั่วโมงซ้ำกัน (11:00 สองครั้ง) ถ้าใช้ชื่อชั่วโมงเป็นแกน
     จุดที่ชื่อซ้ำกันจะไปทับกันจนกราฟหายไปครึ่งหนึ่ง */
  return full.slice(-hours).map((point, i) => ({ ...point, t: i }));
}

/**
 * แนวโน้มรายวันย้อนหลัง (7 หรือ 30 วัน) ของโรงเรือนหนึ่ง — ค่าเฉลี่ยของแต่ละวัน
 *
 * ใช้กับแท็บ "7 วัน / 30 วัน" ในกราฟของหน้าสภาพแวดล้อม · รูปผลลัพธ์เหมือน getBarnTrend()
 * ทุกฟิลด์ จึงวาดด้วยโค้ดกราฟชุดเดียวกันได้ ต่างแค่แกน X เป็นวันที่แทนชั่วโมง
 *
 * จุดสุดท้าย = "วันนี้" ซึ่งเท่ากับค่าเฉลี่ยรอบ ๆ ค่าปัจจุบันของโรงเรือน ตัวเลขจึงต่อกับกราฟ 24 ชม.
 * แนวโน้มค่อย ๆ ไต่ขึ้นเข้าหาปัจจุบัน (ช่วงนี้เข้าหน้าร้อน) ไม่ใช่สุ่มขึ้นลงไร้ทิศทาง
 *
 * @param {number} days 7 หรือ 30
 * @returns {Array<{t:number, hour:string, tempC:number, humidity:number, wind:number,
 *                  nh3:number, tempOut:number, humidityOut:number}>} เรียงเก่า→ใหม่
 */
export function getBarnDaily(farmId, barnId, days = 7) {
  const barn = getBarn(farmId, barnId);
  if (!barn || barn.status === "offline") return [];

  const rand = seededRandom(hash(`${barnId}-day${days}`));
  const end = new Date(barn.updatedAt);

  return Array.from({ length: days }, (_, i) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (days - 1 - i));
    /* ไล่จากเย็นกว่าปัจจุบันเมื่อหลายวันก่อน มาเท่าปัจจุบันในวันนี้ */
    const ramp = (i - (days - 1)) / days;
    const noise = (scale) => (i === days - 1 ? 0 : (rand() - 0.5) * scale);

    const tempC = Number(clamp(barn.tempC + ramp * 1.8 + noise(1.1), 14, 42).toFixed(1));
    const humidity = Math.round(clamp(barn.humidity - ramp * 4 + noise(4), 35, 98));

    return {
      t: i,
      hour: `${date.getDate()}/${date.getMonth() + 1}`,
      tempC,
      humidity,
      wind: Number(clamp(barn.windSpeed + noise(0.4), 0, 5).toFixed(1)),
      nh3: Math.round(clamp(barn.nh3 + ramp * 2 + noise(3), 0, 40)),
      /* ค่าเฉลี่ยทั้งวันของข้างนอก — ส่วนต่างเล็กกว่าตอนกลางวันเพราะเฉลี่ยรวมกลางคืนไปด้วย */
      tempOut: Number(clamp(tempC + OUT_GAP.temp * 0.45, 14, 46).toFixed(1)),
      humidityOut: Math.round(clamp(humidity - OUT_GAP.humidity * 0.45, 25, 99)),
    };
  });
}

/**
 * ค่าต่ำสุด/สูงสุด/เฉลี่ยของช่วงที่กำลังดู
 *
 * **ต้องคัดจุดที่ไม่มีค่าออกก่อนเสมอ** — ข้อมูลจริงจากหลังบ้านมีช่วงเวลาที่เซนเซอร์เงียบ
 * ซึ่งมาเป็น `null` และ JavaScript แปลง null เป็น 0 ไม่ใช่ข้ามให้:
 *   `Math.min(27.1, null, 26.8)` = **0** · ค่าเฉลี่ยของ [27.1, null, 26.8] = **18.0**
 * ➜ หน้าจอจะเขียนว่า "ต่ำสุด 0.0 °C" ทั้งที่ไม่เคยวัดได้ 0 องศาเลยสักครั้ง
 *
 * ค่าที่ไม่มีข้อมูลเลยคืน `null` ไม่ใช่ 0 — ฝั่งหน้าจอ format แล้วได้ขีดกลางเอง
 */
export function climateStats(series) {
  if (series.length === 0) return null;
  /* Number.isFinite คัดทั้ง null · undefined · NaN ในครั้งเดียว
     (typeof null === "object" จึงเช็ก `!= null` อย่างเดียวไม่พอถ้ามี NaN ปน) */
  const temps = series.map((p) => p.tempC).filter((n) => Number.isFinite(n));
  const humidities = series.map((p) => p.humidity).filter((n) => Number.isFinite(n));
  const avg = (list) => list.reduce((sum, n) => sum + n, 0) / list.length;
  const has = (list) => list.length > 0;

  return {
    tempMin: has(temps) ? Math.min(...temps) : null,
    tempMax: has(temps) ? Math.max(...temps) : null,
    tempAvg: has(temps) ? Number(avg(temps).toFixed(1)) : null,
    humidityMin: has(humidities) ? Math.min(...humidities) : null,
    humidityMax: has(humidities) ? Math.max(...humidities) : null,
    humidityAvg: has(humidities) ? Math.round(avg(humidities)) : null,
    /* จำนวนชั่วโมงที่หลุดช่วงเหมาะสม — ใช้บอกว่า "นอกเกณฑ์นานแค่ไหน"
       นับเฉพาะชั่วโมงที่วัดได้จริง ชั่วโมงที่เซนเซอร์เงียบไม่ใช่ "นอกเกณฑ์"
       (ของเดิม null < 22 เป็นจริง ชั่วโมงที่ไม่มีค่าจึงถูกนับเป็นหลุดเกณฑ์ทั้งหมด) */
    tempOutHours: temps.filter(
      (t) => t < COMFORT.tempC.min || t > COMFORT.tempC.max
    ).length,
    humidityOutHours: humidities.filter(
      (h) => h < COMFORT.humidity.min || h > COMFORT.humidity.max
    ).length,
  };
}

/**
 * สถานะของค่าหนึ่งเทียบช่วงเหมาะสม
 * @param {"tempC"|"humidity"} kind
 * @param {number|null} value
 * @param {object} [comfort] ช่วงที่ถือว่าเหมาะสม — ส่งของผู้ใช้เข้ามาได้จากหน้าตั้งค่า
 *                           (รูปแบบเดียวกับ COMFORT · ไม่ส่ง = ใช้ค่ามาตรฐานของระบบ)
 * @returns {{tone:string, label:string}} tone ใช้กับ StatusBadge
 */
export function readingStatus(kind, value, comfort = COMFORT) {
  if (value == null) return { tone: "offline", label: "ไม่มีสัญญาณ" };
  const range = comfort[kind] ?? COMFORT[kind];
  const over = value - range.max;
  const under = range.min - value;
  const span = kind === "tempC" ? 2 : 8; // เกินเท่านี้ถือว่าหลุดมาก

  if (over > span || under > span) {
    return { tone: "critical", label: over > 0 ? "สูงเกินมาก" : "ต่ำเกินมาก" };
  }
  if (over > 0 || under > 0) {
    return { tone: "warning", label: over > 0 ? "สูงกว่าเกณฑ์" : "ต่ำกว่าเกณฑ์" };
  }
  return { tone: "good", label: "อยู่ในเกณฑ์" };
}

/**
 * ดัชนีความร้อน-ความชื้น (THI) ของสุกร
 * สูตรมาตรฐาน: THI = 0.8T + (RH/100)(T − 14.4) + 46.4
 */
export const thiOf = (tempC, humidity) =>
  Number((0.8 * tempC + (humidity / 100) * (tempC - 14.4) + 46.4).toFixed(1));

/** ระดับความเครียดจากความร้อนตามค่า THI */
export function thiLevel(thi) {
  if (thi < 74) {
    return { tone: "good", label: "สบายตัว", text: "สุกรกินอาหารและโตได้ตามปกติ" };
  }
  if (thi < 79) {
    return {
      tone: "warning",
      label: "เริ่มเครียด",
      text: "เริ่มหอบและกินอาหารลดลงเล็กน้อย ควรเพิ่มการระบายอากาศ",
    };
  }
  if (thi < 84) {
    return {
      tone: "serious",
      label: "เครียดปานกลาง",
      text: "กินอาหารลดลงชัดเจน น้ำหนักขึ้นช้า ต้องลดความร้อนภายใน 1 วัน",
    };
  }
  return {
    tone: "critical",
    label: "เครียดรุนแรง",
    text: "เสี่ยงต่อการสูญเสีย ต้องเปิดระบบทำความเย็นและเพิ่มน้ำดื่มทันที",
  };
}

/**
 * คำแนะนำจากค่าที่วัดได้จริงของโรงเรือนนั้น (ไม่ได้สุ่ม)
 * แต่ละข้อบอก "เห็นอะไร → ควรทำอะไร" ให้คนหน้าฟาร์มลงมือได้ทันที
 */
export function climateAdvice(barn, stats, comfort = COMFORT) {
  if (!barn) return [];
  if (barn.status === "offline" || !stats) {
    return [
      {
        tone: "offline",
        title: "เซนเซอร์ไม่ส่งค่าอุณหภูมิและความชื้น",
        text: "ตรวจไฟและสัญญาณที่ตู้ควบคุมท้ายโรงเรือน ระหว่างนี้ให้วัดด้วยเทอร์โมมิเตอร์มือถือแทน",
      },
    ];
  }

  const list = [];
  const thi = thiOf(barn.tempC, barn.humidity);
  const level = thiLevel(thi);

  if (barn.tempC > comfort.tempC.max) {
    list.push({
      tone: barn.tempC > comfort.tempC.max + 2 ? "serious" : "warning",
      title: `อุณหภูมิสูงกว่าเกณฑ์ ${(barn.tempC - comfort.tempC.max).toFixed(1)} °C`,
      text: "เพิ่มรอบพัดลมและเปิดสเปรย์น้ำช่วงบ่าย เลี่ยงการย้ายสุกรในช่วงแดดจัด",
    });
  }
  if (barn.tempC < comfort.tempC.min) {
    list.push({
      tone: "warning",
      title: `อุณหภูมิต่ำกว่าเกณฑ์ ${(comfort.tempC.min - barn.tempC).toFixed(1)} °C`,
      text: "ลดรอบพัดลมและปิดม่านด้านลมเข้า ลูกสุกรเล็กควรเปิดไฟกกเพิ่ม",
    });
  }
  if (barn.humidity > comfort.humidity.max) {
    list.push({
      tone: "warning",
      title: `ความชื้นสูง ${barn.humidity}%`,
      text: "ระบายอากาศเพิ่มและตรวจจุดน้ำรั่วที่รางน้ำ ความชื้นสูงต่อเนื่องเสี่ยงโรคทางเดินหายใจ",
    });
  }
  if (barn.humidity < comfort.humidity.min) {
    list.push({
      tone: "warning",
      title: `ความชื้นต่ำ ${barn.humidity}%`,
      text: "อากาศแห้งทำให้ฝุ่นฟุ้งและระคายทางเดินหายใจ ลดรอบพัดลมหรือพ่นละอองน้ำเบา ๆ",
    });
  }
  if (stats.tempOutHours >= 6) {
    list.push({
      tone: "serious",
      title: `อุณหภูมิหลุดเกณฑ์ ${stats.tempOutHours} ชั่วโมงใน 24 ชม.`,
      text: "ไม่ใช่การแกว่งชั่วคราวแล้ว ให้ตรวจการทำงานของพัดลมและระบบทำความเย็นทั้งชุด",
    });
  }
  if (level.tone !== "good") {
    list.push({
      tone: level.tone,
      title: `ดัชนีความร้อน THI ${thi} — ${level.label}`,
      text: level.text,
    });
  }
  if (list.length === 0) {
    list.push({
      tone: "good",
      title: "อุณหภูมิและความชื้นอยู่ในเกณฑ์ทั้งวัน",
      text: "ไม่มีสิ่งที่ต้องแก้ไขตอนนี้ · รักษารอบพัดลมและการให้น้ำไว้แบบเดิม",
    });
  }
  return list;
}
