/**
 * Mock data: โรงเรือนรายฟาร์ม — ใช้ในหน้า /dashboard/farms/:farmId
 *
 * ไฟล์นี้ "ต่อยอด" จาก data/mock/farms.js ไม่ได้แก้โครงเดิมของไฟล์ใด
 * (herd.js ยังเป็นโรงเรือนของฟาร์มตัวอย่างฟาร์มเดียวเหมือนเดิม — คนละชุดกัน อย่าสลับ)
 *
 * ค่าทุกตัวสร้างแบบ deterministic จากรหัสฟาร์ม จึงคงที่ทุกครั้งที่เปิดหน้า
 * และผูกกับข้อมูลระดับฟาร์มจริง:
 *   - จำนวนโรงเรือน = farm.barnCount · ผลรวมสุกรทุกโรงเรือน = farm.pigs
 *   - อุณหภูมิ/ความชื้นแกว่งรอบค่าเฉลี่ยของฟาร์มนั้น
 *   - จำนวนแจ้งเตือนรวมของทุกโรงเรือน = farm.alerts
 *   - ฟาร์มออฟไลน์ → ทุกโรงเรือนออฟไลน์ (ไม่มีค่าเซนเซอร์)
 *
 * เมื่อต่อ API จริง: แทนที่ getFarmBarns() ด้วยการเรียกข้อมูลจริง แล้วคืนรูปแบบเดิม
 */
import { farms } from "./farms.js";

/** ตัวสุ่มแบบคงที่ (mulberry32) — รหัสฟาร์มเดียวกันได้ค่าชุดเดิมเสมอ */
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
  [...text].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** ช่วงวัยของสุกรในโรงเรือน — วนตามลำดับให้ครบวงจรการเลี้ยง */
const STAGES = ["แม่พันธุ์", "ลูกสุกร", "อนุบาล", "ขุน"];

/** อุปกรณ์ในโรงเรือนที่มีสถานะรายชิ้น */
export const DEVICE_LABEL = {
  fan: "พัดลม",
  water: "น้ำ",
  feed: "อาหาร",
  camera: "กล้อง",
  sensor: "เซนเซอร์",
};

export const DEVICE_ICON = {
  fan: "wind",
  water: "drop",
  feed: "feed",
  camera: "camera",
  sensor: "wifi",
};

export const BARN_STATUS_LABEL = {
  good: "ปกติ",
  warning: "เฝ้าระวัง",
  offline: "ออฟไลน์",
};

/**
 * คะแนนสุขภาพโรงเรือน 0–100 (ค่าคำนวณ ไม่ใช่ค่าจากเซนเซอร์)
 * หักคะแนนจาก: อุณหภูมินอกช่วง 22–28 °C · ความชื้นเกิน 75% · แอมโมเนียเกิน 15 ppm
 * · อาหาร/น้ำเหลือน้อยกว่า 85% · แจ้งเตือนที่ยังค้าง
 */
export function barnHealthScore(barn) {
  if (barn.status === "offline") return null;
  /* ค่าที่ยังไม่มีข้อมูล (null) ต้อง "ไม่หักคะแนน" ไม่ใช่หักเต็ม —
     โรงเรือนจริงที่ยังไม่มีเซนเซอร์อาหาร/น้ำ จะได้ไม่ถูกตัดคะแนนทั้งที่ไม่มีอะไรผิด
     (โรงเรือนตัวอย่างมีค่าครบทุกตัวอยู่แล้ว คะแนนจึงเท่าเดิมเป๊ะ) */
  const penalty = (value, fn) => (value == null ? 0 : fn(value));
  const temp = penalty(barn.tempC, (v) => Math.max(0, v - 28, 22 - v) * 5);
  const humidity = penalty(barn.humidity, (v) => Math.max(0, v - 75) * 1.5);
  const nh3 = penalty(barn.nh3, (v) => Math.max(0, v - 15) * 2);
  const supplyKnown = [barn.feedPct, barn.waterPct].filter((v) => v != null);
  const supply = supplyKnown.length
    ? Math.max(0, 85 - Math.min(...supplyKnown)) * 0.8
    : 0;
  const alerts = (barn.alerts ?? 0) * 3;
  return Math.max(
    0,
    Math.min(100, Math.round(100 - temp - humidity - nh3 - supply - alerts))
  );
}

/**
 * โรงเรือนทั้งหมดของฟาร์มหนึ่ง
 * @param {string} farmId รหัสฟาร์มใน farms.js เช่น "F-CNX"
 * @returns {Array|null} รายการโรงเรือน หรือ null ถ้าไม่พบฟาร์ม
 */
export function getFarmBarns(farmId) {
  const farm = farms.find((f) => f.id === farmId);
  if (!farm) return null;

  const rand = seededRandom(hash(farmId));
  const count = farm.barnCount;
  const offlineFarm = farm.status === "offline";

  /* กระจายจำนวนสุกรให้ครบเท่ากับ farm.pigs พอดี (เศษไปอยู่โรงเรือนสุดท้าย) */
  const weights = Array.from({ length: count }, () => 0.8 + rand() * 0.4);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const pigsPerBarn = weights.map((w) =>
    Math.round((farm.pigs * w) / weightSum / 10) * 10
  );
  pigsPerBarn[count - 1] += farm.pigs - pigsPerBarn.reduce((a, b) => a + b, 0);

  /* กระจายแจ้งเตือนของฟาร์มลงโรงเรือน — โรงเรือนแรก ๆ ได้ก่อน */
  const alertsPerBarn = Array.from({ length: count }, () => 0);
  for (let i = 0; i < farm.alerts; i++) {
    alertsPerBarn[Math.floor(rand() * count)] += 1;
  }

  return Array.from({ length: count }, (_, i) => {
    const zone = String.fromCharCode(65 + Math.floor(i / 3)); // A, B, C…
    const building = (i % 3) + 1;
    const alerts = alertsPerBarn[i];
    const offline = offlineFarm || (!offlineFarm && i === count - 1 && rand() < 0.35);

    const tempC = Number((farm.tempC + (rand() - 0.5) * 3.4).toFixed(1));
    const humidity = Math.round(farm.humidity + (rand() - 0.5) * 8);
    const nh3 = Math.round(6 + rand() * 12 + alerts * 1.5);
    const feedPct = Math.round(72 + rand() * 26 - alerts * 3);
    const waterPct = Math.round(74 + rand() * 24 - alerts * 2);

    const status = offline ? "offline" : alerts > 0 ? "warning" : "good";

    /* อุปกรณ์: ออฟไลน์ = ตัดการเชื่อมต่อทั้งหมด · มีแจ้งเตือน = อุปกรณ์บางตัวเตือน */
    const devices = offline
      ? { fan: "offline", water: "offline", feed: "offline", camera: "offline", sensor: "offline" }
      : {
          fan: "good",
          water: waterPct < 80 ? "warning" : "good",
          feed: feedPct < 80 ? "warning" : "good",
          camera: "good",
          sensor: "good",
        };

    /* ---- ข้อมูลสำหรับหน้ารายละเอียดโรงเรือน (กล้อง AI / การนับสุกร / คำแนะนำ) ---- */
    const missing = offline ? 0 : Math.round(rand() * 3);
    const sick = offline ? 0 : Math.round(rand() * 4);
    const dead = offline ? 0 : Math.round(rand() * 2);
    const windSpeed = offline ? null : Number((0.4 + rand() * 2.2).toFixed(1));

    const barn = {
      id: `${farmId}-${zone}${building}`,
      name: `โรงเรือน ${zone}${building}`,
      zone,
      building,
      stage: STAGES[i % STAGES.length],
      pigs: pigsPerBarn[i],
      status,
      alerts: offline ? 0 : alerts,
      tempC: offline ? null : tempC,
      humidity: offline ? null : humidity,
      nh3: offline ? null : nh3,
      feedPct: offline ? null : feedPct,
      waterPct: offline ? null : waterPct,
      devices,
      windSpeed,
      /* จำนวนสุกร "วันนี้" — AI นับได้เท่าไร เทียบกับที่ควรมี */
      today: {
        expected: pigsPerBarn[i],
        aiCount: offline ? null : pigsPerBarn[i] - missing - dead,
        missing,
        sick,
        dead,
        countedAt: farm.updatedAt,
      },
      cameras: offline
        ? []
        : [
            /* stream = URL สตรีม MJPEG ของกล้องจริง — ยังไม่มีกล้องจึงเป็น null ทุกตัว
               ใส่ค่าเมื่อไหร่ CameraView จะเปลี่ยนไปใช้สตรีมสดทันที (ดู components/ui/CameraView.jsx)
               เพิ่มช่องนี้เข้ามาใหม่ ไม่ได้แก้ช่องเดิม หน้าที่อ่าน cameras อยู่แล้วจึงไม่กระทบ */
            { id: "CAM-1", name: "กล้องหัวโรงเรือน", detected: Math.round(pigsPerBarn[i] * 0.42), stream: null },
            { id: "CAM-2", name: "กล้องกลางโรงเรือน", detected: Math.round(pigsPerBarn[i] * 0.36), stream: null },
            { id: "CAM-3", name: "กล้องท้ายโรงเรือน", detected: Math.round(pigsPerBarn[i] * 0.22), stream: null },
          ],
      updatedAt: farm.updatedAt,
    };
    return { ...barn, health: barnHealthScore(barn) };
  });
}

/** สรุปสถานะโรงเรือนของฟาร์มหนึ่ง (ใช้กับแถบสรุปหัวหน้า) */
export function summarizeBarns(list) {
  return {
    total: list.length,
    /* นับเฉพาะที่ปกติ เพื่อให้ ออนไลน์ + เฝ้าระวัง + ออฟไลน์ = ทั้งหมด */
    online: list.filter((b) => b.status === "good").length,
    warning: list.filter((b) => b.status === "warning").length,
    offline: list.filter((b) => b.status === "offline").length,
    alerts: list.reduce((sum, b) => sum + b.alerts, 0),
    pigs: list.reduce((sum, b) => sum + b.pigs, 0),
  };
}

/** โรงเรือนหลังเดียว — ใช้ในหน้า /dashboard/farms/:farmId/barns/:barnId */
export function getBarn(farmId, barnId) {
  return getFarmBarns(farmId)?.find((b) => b.id === barnId) ?? null;
}

/**
 * คำแนะนำจาก AI — สรุปจากค่าที่วัดได้จริงของโรงเรือนนั้น (ไม่ได้สุ่ม)
 * แต่ละข้อบอก "เห็นอะไร → ควรทำอะไร" เพื่อให้คนหน้าฟาร์มลงมือได้ทันที
 */
export function getBarnInsights(barn) {
  if (!barn) return [];
  if (barn.status === "offline") {
    return [
      {
        tone: "offline",
        title: "เซนเซอร์และกล้องไม่ส่งข้อมูล",
        text: "ตรวจไฟและสัญญาณเครือข่ายที่ตู้ควบคุมท้ายโรงเรือน ระหว่างนี้ให้บันทึกจำนวนสุกรด้วยมือไปก่อน",
      },
    ];
  }

  const list = [];
  if (barn.tempC > 28) {
    list.push({
      tone: "warning",
      title: `อุณหภูมิสูงกว่าเกณฑ์ ${(barn.tempC - 28).toFixed(1)} °C`,
      text: "เพิ่มรอบพัดลมหรือเปิดสเปรย์น้ำช่วงบ่าย และเลี่ยงการย้ายสุกรในช่วงแดดจัด",
    });
  }
  if (barn.humidity > 75) {
    list.push({
      tone: "warning",
      title: `ความชื้นสูง ${barn.humidity}%`,
      text: "ระบายอากาศเพิ่มและตรวจจุดน้ำรั่วที่รางน้ำ ความชื้นสูงต่อเนื่องเสี่ยงโรคทางเดินหายใจ",
    });
  }
  if (barn.nh3 > 15) {
    list.push({
      tone: "serious",
      title: `แอมโมเนีย ${barn.nh3} ppm สูงเกิน 15 ppm`,
      text: "เร่งระบายอากาศและตักมูลออกจากร่อง ค่าระดับนี้ทำให้สุกรกินอาหารลดลง",
    });
  }
  if (barn.today.missing > 0) {
    list.push({
      tone: "serious",
      title: `AI นับได้น้อยกว่าที่ควรมี ${barn.today.missing} ตัว`,
      text: "ตรวจมุมอับกล้องและคอกที่ซ้อนกัน ถ้านับซ้ำแล้วยังขาด ให้บันทึกเป็นสูญหายในตารางด้านล่าง",
    });
  }
  if (barn.today.sick > 0) {
    list.push({
      tone: "warning",
      title: `พบสุกรท่าทางผิดปกติ ${barn.today.sick} ตัว`,
      text: "AI เห็นการนอนซึมและกินน้อยผิดปกติ แนะนำให้แยกออกมาสังเกตอาการและบันทึกไว้",
    });
  }
  /* `null < 80` เป็นจริงใน JS — โรงเรือนที่ยังไม่มีเซนเซอร์อาหารจะถูกเตือนทั้งที่ไม่มีข้อมูล */
  if (barn.feedPct != null && barn.feedPct < 80) {
    list.push({
      tone: "warning",
      title: `อาหารในไซโลเหลือ ${barn.feedPct}%`,
      text: "สั่งเติมอาหารภายใน 2 วัน เพื่อไม่ให้กระทบรอบให้อาหารช่วงเช้า",
    });
  }
  if (list.length === 0) {
    list.push({
      tone: "good",
      title: "ทุกค่าอยู่ในเกณฑ์ปกติ",
      text: "อุณหภูมิ ความชื้น และการนับสุกรตรงกับที่ควรเป็น ไม่มีสิ่งที่ต้องแก้ไขในตอนนี้",
    });
  }
  return list;
}
