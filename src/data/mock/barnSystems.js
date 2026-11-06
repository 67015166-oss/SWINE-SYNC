/**
 * Mock data: ระบบภายในโรงเรือน — สถานีวัดภายนอก · พัดลม/ปั๊ม · ระบบไฟฟ้า · ผังเซนเซอร์
 * ใช้ที่หน้า "ระบบควบคุมสภาพแวดล้อม" (/dashboard/climate/:farmId/:barnId)
 *
 * ไฟล์นี้ "เพิ่มใหม่" ไม่ได้แก้โครงสร้างข้อมูลเดิม — ทุกค่าคำนวณต่อยอดจากค่าจริงของโรงเรือน
 * ใน barnsByFarm.js เสมอ (อุณหภูมิ ความชื้น ลม NH₃ จำนวนแจ้งเตือน) ตัวเลขจึงสอดคล้องกัน
 * ทั้งหน้า ไม่ใช่สุ่มลอย ๆ:
 *   - พัดลมทำงานกี่ตัว ขึ้นกับว่าอุณหภูมิห่างจากเพดานสบายแค่ไหน
 *   - กระแสรวม = ผลบวกของทุกวงจร · กำลังไฟ = V × A × PF ÷ 1000
 *   - ค่าเฉลี่ยของเซนเซอร์ทุกจุดในผัง = อุณหภูมิ/ความชื้นของโรงเรือนนั้นพอดี
 *
 * โรงเรือนที่ออฟไลน์คืน `online: false` และค่าเป็น null ทั้งหมด — หน้าเพจต้องเช็กก่อนใช้
 */
import { getBarn } from "./barnsByFarm.js";
import { farms } from "./farms.js";
import { COMFORT } from "./climate.js";

/** ตัวสุ่มแบบคงที่ (mulberry32) — โรงเรือนเดิมได้ค่าชุดเดิมเสมอ */
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

const round1 = (n) => Number(n.toFixed(1));
const round2 = (n) => Number(n.toFixed(2));

/** ชื่อและหน้าที่ของปั๊มแต่ละตัว — ลำดับนี้ตรงกับผังเซนเซอร์ (P1–P3) */
export const PUMP_ROLES = [
  { id: "P1", name: "PUMP 1", duty: "น้ำดื่ม" },
  { id: "P2", name: "PUMP 2", duty: "ระบายน้ำ" },
  { id: "P3", name: "PUMP 3", duty: "ม่านน้ำ" },
];

/** โซนของโรงเรือน เรียงจากหน้าไปท้าย — ใช้ทั้งผังและป้ายกำกับเซนเซอร์ */
export const ZONES = [
  { id: "A", label: "หน้า" },
  { id: "B", label: "กลางซ้าย" },
  { id: "C", label: "กลางขวา" },
  { id: "D", label: "ท้าย" },
];

export const FAN_COUNT = 5;

/** ค่าไฟต่อหน่วย (บาท/kWh) — ตัวเลขกลม ๆ สำหรับข้อมูลตัวอย่าง */
export const BAHT_PER_KWH = 4;

/** แรงดันไฟที่ถือว่าปกติ — ต่ำหรือสูงกว่านี้คือควรเรียกช่างมาดู */
export const VOLTAGE_OK = { min: 210, max: 235 };

/**
 * สถานีวัดภายนอกโรงเรือน — ใช้เทียบว่าข้างในเย็นกว่าข้างนอกแค่ไหน
 * อ้างจากค่าเฉลี่ยของฟาร์มแล้วบวกส่วนต่างกลางแจ้ง (แดดทำให้ข้างนอกร้อนกว่าเสมอในเวลากลางวัน)
 */
export function getOutdoor(farmId, barnId) {
  const farm = farms.find((f) => f.id === farmId);
  if (!farm) return null;
  const rand = seededRandom(hash(`${barnId}-out`));
  const tempC = round1(farm.tempC + 3.4 + rand() * 1.8);
  const humidity = Math.round(farm.humidity - 2 - rand() * 4);

  return {
    tempC,
    humidity,
    wind: round1(1.6 + rand() * 1.2),
    /* ดัชนี UV กลางแจ้ง 0–11+ · ยิ่งแดดแรงยิ่งร้อน จึงผูกกับอุณหภูมิภายนอก */
    uv: Math.max(0, Math.min(11, Math.round((tempC - 24) * 0.9 + rand() * 2))),
    /* ความกดอากาศระดับพื้นราบของไทยแกว่งแคบ ๆ รอบ 1010 hPa */
    pressure: Math.round(1008 + rand() * 6),
    /* ความสว่างกลางแจ้ง — ยิ่งแดดแรงยิ่งร้อน จึงผูกกับอุณหภูมิภายนอกเหมือน UV
       (ฟาร์มจริงอ่านค่านี้จากเสาอากาศ ส่วนที่นี่เป็นค่าตัวอย่างให้หน้าจอไม่โหว่) */
    light: Math.max(0, Math.round((tempC - 22) * 4200 + rand() * 6000)),
    /* ฝนสะสม 24 ชม. — ส่วนใหญ่ของปีไม่ตก จึงให้เป็นศูนย์บ่อยกว่ามีค่า */
    rainfall24h: rand() > 0.7 ? round1(rand() * 28) : 0,
    /* จุดน้ำค้าง — สูตร Magnus (ค่าจริง ไม่ได้สุ่ม): ต่ำกว่าอุณหภูมิเสมอ
       ยิ่งใกล้อุณหภูมิจริงยิ่งอบอ้าว เพราะเหงื่อระเหยไม่ออก */
    dewPoint: dewPointOf(tempC, humidity),
    /* สถานีข้างนอกส่งค่าถี่น้อยกว่าเซนเซอร์ในโรงเรือน */
    agoMinutes: 1 + Math.floor(rand() * 4),
  };
}

/**
 * จุดน้ำค้าง (°C) จากอุณหภูมิและความชื้นสัมพัทธ์ — สูตร Magnus-Tetens
 * เป็นค่าคำนวณจริง ไม่ใช่ค่าสุ่ม จึงสอดคล้องกับตัวเลขอื่นบนหน้าเสมอ
 */
export function dewPointOf(tempC, humidity) {
  if (tempC == null || humidity == null) return null;
  const a = 17.27;
  const b = 237.7;
  const alpha = (a * tempC) / (b + tempC) + Math.log(Math.max(1, humidity) / 100);
  return round1((b * alpha) / (a - alpha));
}

/**
 * พัดลมและปั๊มน้ำของโรงเรือน
 *
 * จำนวนพัดลมที่ควรเปิด = ยิ่งอุณหภูมิเกินเพดานสบาย (28 °C) มาก ยิ่งเปิดหลายตัว
 * ตัวที่ "warn" คือหมุนอยู่แต่กระแสสูงผิดปกติ — เจอเฉพาะโรงเรือนที่มีแจ้งเตือนค้างอยู่
 */
/**
 * ชุดอุปกรณ์ของโรงเรือนที่ "ไม่มีค่าให้อ่าน" — ใช้ทั้งกรณีเซนเซอร์ออฟไลน์
 * และกรณีโรงเรือนที่ผู้ใช้เพิ่งเพิ่มเอง (ยังไม่ได้ติดตั้งอุปกรณ์)
 *
 * ต้องคืนโครงที่ครบเสมอ ห้ามคืน null — หน้าที่ใช้ (ควบคุมอุปกรณ์ · ระบบไฟฟ้า · ผังเซนเซอร์)
 * destructure ฟิลด์ออกมาตรง ๆ พอได้ null เข้าไปจะจอขาวทั้งหน้า
 */
export const idleEquipment = () => ({
  online: false,
  auto: false,
  fans: Array.from({ length: FAN_COUNT }, (_, i) => ({
    id: `FAN ${i + 1}`,
    state: "offline",
    hz: null,
    amp: null,
  })),
  pumps: PUMP_ROLES.map((p) => ({ ...p, running: false, amp: null, watt: null })),
});

export function getEquipment(farmId, barnId) {
  const barn = getBarn(farmId, barnId);
  /* ไม่รู้จักโรงเรือนนี้ (โรงเรือนที่ผู้ใช้เพิ่มเอง) = ยังไม่มีอุปกรณ์ ไม่ใช่ "ไม่มีข้อมูลเลย" */
  if (!barn) return idleEquipment();
  if (barn.status === "offline") {
    return idleEquipment();
  }

  const rand = seededRandom(hash(`${barnId}-eq`));
  const overHeat = Math.max(0, barn.tempC - COMFORT.tempC.max);
  /* 28 °C ลงมาเปิด 3 ตัวพอ · เกินไป 2 °C ขึ้นไปเปิดครบทั้ง 5 */
  const running = Math.min(FAN_COUNT, 3 + Math.round(overHeat));
  /* พัดลมตัวที่กระแสสูงผิดปกติ — มีได้ตัวเดียวและเฉพาะโรงเรือนที่มีแจ้งเตือน */
  const warnIndex = barn.alerts > 0 ? FAN_COUNT - 1 : -1;

  const fans = Array.from({ length: FAN_COUNT }, (_, i) => {
    const on = i < running;
    if (!on) return { id: `FAN ${i + 1}`, state: "off", hz: 0, amp: 0 };
    const hz = 45 + Math.round(rand() * 3) * 5;
    const state = i === warnIndex ? "warn" : "on";
    /* กระแสแปรตามรอบพัดลม · ตัวที่เตือนกินไฟเกินพิกัดอยู่ราว 30% */
    const amp = round1((hz / 60) * 4.2 + rand() * 0.4 + (state === "warn" ? 1.3 : 0));
    return { id: `FAN ${i + 1}`, state, hz, amp };
  });

  const pumps = PUMP_ROLES.map((role, i) => {
    /* ปั๊มระบายน้ำเดินเป็นรอบ — ปกติหยุดอยู่ · ปั๊มน้ำดื่มกับม่านน้ำเดินตลอด */
    const running = i === 1 ? barn.humidity > 78 : true;
    const amp = running ? round1(1.6 + rand() * 1.2) : 0;
    return { ...role, running, amp, watt: Math.round(amp * 220) };
  });

  return { online: true, auto: true, fans, pumps };
}

/**
 * ระบบไฟฟ้าของโรงเรือน — คำนวณจากอุปกรณ์ที่กำลังเดินอยู่จริง
 * ส่งอุปกรณ์เข้ามาได้ (เช่นตอนผู้ใช้สั่งปิดพัดลมในหน้าจอ) ตัวเลขจะขยับตามทันที
 *
 * @param {object} equipment ผลของ getEquipment (หรือชุดที่ผู้ใช้แก้แล้ว)
 * @param {number} [bahtPerKwh] ค่าไฟต่อหน่วย — ปรับได้ในหน้าตั้งค่า
 */
export function getElectrical(farmId, barnId, equipment, bahtPerKwh = BAHT_PER_KWH) {
  const barn = getBarn(farmId, barnId);
  const eq = equipment ?? getEquipment(farmId, barnId);
  if (!barn || !eq) return null;
  if (!eq.online) return { online: false };

  const rand = seededRandom(hash(`${barnId}-el`));
  const voltage = 216 + Math.round(rand() * 8);
  const powerFactor = round2(0.88 + rand() * 0.07);
  const ampOf = (list) => round1(list.reduce((sum, d) => sum + (d.amp ?? 0), 0));

  /* วงจรย่อยตามตู้ควบคุม — พัดลมแยกสองวงจร ปั๊มแยกตัวใครตัวมัน แล้วมีวงจรไฟส่องสว่าง */
  const lighting = round1(0.8 + rand() * 0.4);
  const circuits = [
    { id: "FAN 1-2", label: "FAN 1-2", amp: ampOf(eq.fans.slice(0, 2)) },
    { id: "FAN 3-5", label: "FAN 3-5", amp: ampOf(eq.fans.slice(2)) },
    ...eq.pumps
      .filter((p) => p.running)
      .map((p) => ({ id: p.id, label: p.name, amp: p.amp })),
    { id: "LIGHT", label: "ไฟส่อง", amp: lighting },
  ];

  const totalCurrent = round1(circuits.reduce((sum, c) => sum + c.amp, 0));
  const activePower = round2((voltage * totalCurrent * powerFactor) / 1000);
  /* หน่วยวันนี้ประมาณจากกำลังไฟปัจจุบัน × ชั่วโมงที่ผ่านมาของวัน (อ่านจากเวลาอัปเดตล่าสุด) */
  const hoursToday = new Date(barn.updatedAt).getHours() + 1;
  const todayKwh = round1(activePower * hoursToday * 0.86);
  const monthKwh = Math.round(todayKwh * 24);

  return {
    online: true,
    voltage,
    totalCurrent,
    activePower,
    powerFactor,
    circuits,
    todayKwh,
    monthKwh,
    rate: bahtPerKwh,
    cost: Math.round(monthKwh * bahtPerKwh),
  };
}

/**
 * ผังเซนเซอร์ในโรงเรือน — จุดวัด 4 จุดเรียงจากหน้าไปท้าย (โซน A–D)
 *
 * ค่าของแต่ละจุดกระจายรอบค่ากลางของโรงเรือน แล้ว **บังคับให้ค่าเฉลี่ยเท่ากับค่าจริง**
 * ของโรงเรือนพอดี (ปรับส่วนต่างที่จุดสุดท้าย) ตัวเลขในผังจึงไม่ขัดกับเกจด้านบน
 * จุดท้ายโรงเรือนร้อนและอับกว่าเสมอ เพราะลมไหลจากหน้าไปท้าย
 */
export function getSensorMap(farmId, barnId) {
  const barn = getBarn(farmId, barnId);
  if (!barn) return null;
  if (barn.status === "offline") {
    return { online: false, nodes: ZONES.map((z) => ({ ...z, tempC: null, humidity: null })) };
  }

  const rand = seededRandom(hash(`${barnId}-map`));
  /* ไล่ระดับจากหน้า (เย็นสุด) ไปท้าย (ร้อนสุด) แล้วเติมความไม่สม่ำเสมอเล็กน้อย */
  const tempOffsets = ZONES.map((_, i) => (i - 1.5) * 0.35 + (rand() - 0.5) * 0.3);
  const humidOffsets = ZONES.map((_, i) => (i - 1.5) * 1.2 + (rand() - 0.5) * 1.4);

  const nodes = ZONES.map((zone, i) => ({
    ...zone,
    node: i + 1,
    tempC: round1(barn.tempC + tempOffsets[i]),
    humidity: Math.round(barn.humidity + humidOffsets[i]),
  }));

  /* ปรับจุดสุดท้ายให้ค่าเฉลี่ยของทุกจุดตรงกับค่าของโรงเรือนเป๊ะ */
  const last = nodes.length - 1;
  const tempSum = nodes.reduce((s, n) => s + n.tempC, 0);
  nodes[last].tempC = round1(nodes[last].tempC + (barn.tempC * nodes.length - tempSum));
  const humidSum = nodes.reduce((s, n) => s + n.humidity, 0);
  nodes[last].humidity = nodes[last].humidity + (barn.humidity * nodes.length - humidSum);

  /* NH₃ วัดจุดเดียวที่ท้ายโรงเรือน ซึ่งเป็นจุดที่ก๊าซสะสมมากที่สุด */
  return { online: true, nodes, nh3: barn.nh3, nh3Zone: ZONES[last].id };
}
