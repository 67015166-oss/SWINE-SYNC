/**
 * Mock data: รายการแจ้งเตือนทั้งเครือ — ใช้ในหน้า /dashboard/alerts
 *
 * ต่อยอดจาก data/mock/barnsByFarm.js ไม่ได้แก้โครงเดิมของไฟล์ใด
 * (environment.js มีชุดแจ้งเตือนของฟาร์มตัวอย่างอยู่แล้ว — คนละชุดกัน อย่าสลับ)
 *
 * กติกาสำคัญ: **จำนวนแจ้งเตือนของแต่ละโรงเรือนต้องเท่ากับ barn.alerts เป๊ะ**
 * และผลรวมทั้งหมดจึงเท่ากับ summarizeFarms().alerts (12 รายการ) เสมอ
 * สาเหตุของแต่ละรายการมาจากค่าที่วัดได้จริงของโรงเรือนนั้น ไม่ได้สุ่มข้อความ
 *
 * เมื่อต่อ API จริง: แทนที่ allAlerts() ด้วยข้อมูลจริง แล้วคืนรูปแบบเดิม
 */
import { farms } from "./farms.js";
import { getFarmBarns } from "./barnsByFarm.js";

/** ประเภทของปัญหา — ใช้ทั้งตัวกรองและสรุปแยกประเภท */
export const ALERT_CATEGORIES = [
  { id: "temp", label: "อุณหภูมิ", icon: "thermometer" },
  { id: "humidity", label: "ความชื้น", icon: "drop" },
  { id: "nh3", label: "แอมโมเนีย", icon: "cloud" },
  { id: "feed", label: "อาหาร", icon: "feed" },
  { id: "water", label: "น้ำ", icon: "drop" },
  { id: "pig", label: "สุขภาพสุกร", icon: "pig" },
  { id: "sensor", label: "เซนเซอร์", icon: "wifi" },
];

/** ระดับความรุนแรง เรียงจากหนักไปเบา — tone ใช้กับ StatusBadge ได้ตรง ๆ */
export const ALERT_LEVELS = [
  { id: "critical", label: "วิกฤต" },
  { id: "serious", label: "ต้องจัดการ" },
  { id: "warning", label: "เฝ้าระวัง" },
];

const categoryOf = (id) => ALERT_CATEGORIES.find((c) => c.id === id);

/** เกณฑ์มาตรฐานของระบบ — หน้าเพจส่งของผู้ใช้เข้ามาแทนได้จากหน้าตั้งค่า */
export const DEFAULT_LIMITS = { tempMin: 22, tempMax: 28, humidityMax: 75, nh3Limit: 15 };

/**
 * สร้าง "สาเหตุที่เป็นไปได้" ของโรงเรือนหนึ่ง เรียงจากหนักไปเบา
 * ทุกข้อคำนวณจากค่าที่วัดได้จริงของโรงเรือนนั้น (เกณฑ์เดียวกับ getBarnInsights)
 *
 * @param {object} [limits] เกณฑ์ที่ใช้ตัดสิน — ปรับได้ในหน้าตั้งค่า ข้อความในแจ้งเตือน
 *                          จะอ้างเกณฑ์ชุดเดียวกับที่ผู้ใช้ตั้งไว้เสมอ ไม่ใช่เลขตายตัว
 */
function causesOf(barn, limits = DEFAULT_LIMITS) {
  const list = [];

  if (barn.status === "offline") {
    list.push({
      category: "sensor",
      level: "serious",
      title: "เซนเซอร์และกล้องไม่ส่งข้อมูล",
      detail: "ตรวจไฟและสัญญาณเครือข่ายที่ตู้ควบคุมท้ายโรงเรือน",
    });
    return list;
  }

  const over = barn.tempC - limits.tempMax;
  if (over > 0) {
    list.push({
      category: "temp",
      level: over > 2 ? "critical" : "warning",
      title: `อุณหภูมิสูงกว่าเกณฑ์ ${over.toFixed(1)} °C`,
      detail: `วัดได้ ${barn.tempC} °C (เกณฑ์ ${limits.tempMin}–${limits.tempMax} °C) — เพิ่มรอบพัดลมหรือเปิดสเปรย์น้ำ`,
    });
  }
  if (barn.humidity > limits.humidityMax) {
    list.push({
      category: "humidity",
      level: barn.humidity > 85 ? "serious" : "warning",
      title: `ความชื้นสูง ${barn.humidity}%`,
      detail: "ระบายอากาศเพิ่มและตรวจจุดน้ำรั่วที่รางน้ำ เสี่ยงโรคทางเดินหายใจ",
    });
  }
  if (barn.nh3 > limits.nh3Limit) {
    list.push({
      category: "nh3",
      level: barn.nh3 > 20 ? "critical" : "serious",
      title: `แอมโมเนีย ${barn.nh3} ppm สูงเกินเกณฑ์`,
      detail: "เร่งระบายอากาศและตักมูลออกจากร่อง ค่าระดับนี้ทำให้สุกรกินอาหารลดลง",
    });
  }
  if (barn.today.sick > 0) {
    list.push({
      category: "pig",
      level: barn.today.sick > 2 ? "serious" : "warning",
      title: `พบสุกรท่าทางผิดปกติ ${barn.today.sick} ตัว`,
      detail: "AI เห็นการนอนซึมและกินน้อยผิดปกติ แนะนำให้แยกออกมาสังเกตอาการ",
    });
  }
  if (barn.today.missing > 0) {
    list.push({
      category: "pig",
      level: "serious",
      title: `AI นับได้น้อยกว่าที่ควรมี ${barn.today.missing} ตัว`,
      detail: "ตรวจมุมอับกล้องและคอกที่ซ้อนกัน ถ้านับซ้ำแล้วยังขาดให้บันทึกเป็นสูญหาย",
    });
  }
  if (barn.feedPct < 80) {
    list.push({
      category: "feed",
      level: barn.feedPct < 70 ? "serious" : "warning",
      title: `อาหารในไซโลเหลือ ${barn.feedPct}%`,
      detail: "สั่งเติมอาหารภายใน 2 วัน เพื่อไม่ให้กระทบรอบให้อาหารช่วงเช้า",
    });
  }
  if (barn.waterPct < 80) {
    list.push({
      category: "water",
      level: barn.waterPct < 70 ? "serious" : "warning",
      title: `น้ำในถังเหลือ ${barn.waterPct}%`,
      detail: "ตรวจปั๊มและวาล์วจ่ายน้ำ แล้วเติมให้เต็มก่อนรอบให้อาหารถัดไป",
    });
  }

  if (list.length === 0) {
    list.push({
      category: "sensor",
      level: "warning",
      title: "ค่าเซนเซอร์แกว่งผิดปกติ",
      detail: "ค่าที่อ่านได้กระโดดผิดจังหวะ ควรตรวจสอบหัววัดในโรงเรือน",
    });
  }

  const order = { critical: 0, serious: 1, warning: 2 };
  return list.sort((a, b) => order[a.level] - order[b.level]);
}

/**
 * คำแนะนำที่จะโผล่ตอนกดการแจ้งเตือนข้อนั้น — เรียงตามลำดับที่ควรลงมือจริง
 * ข้อแรกคือสิ่งที่ทำได้ทันที ข้อท้ายคือ "ถ้ายังไม่ดีขึ้นให้ทำอะไรต่อ"
 *
 * อยู่ที่นี่ไม่ใช่ในหน้าเพจ เพราะความรู้ว่า "ปัญหาแบบนี้ต้องแก้ยังไง" เป็นของข้อมูล
 * ไม่ใช่ของหน้าจอ — หน้าอื่นที่แสดงการแจ้งเตือนชุดเดียวกันจะได้เรียกใช้ได้ทันที
 * ไม่ต้องเขียนคำแนะนำซ้ำคนละสำนวน
 *
 * ระดับความรุนแรงเปลี่ยนคำแนะนำด้วย ไม่ใช่แค่เปลี่ยนสีป้าย — "วิกฤต" ต้องบอกให้ทำเดี๋ยวนี้
 *
 * @param {object} alert หนึ่งรายการจาก allAlerts()
 * @returns {string[]}
 */
export function adviceFor(alert) {
  const urgent = alert.level === "critical";

  switch (alert.category) {
    case "temp":
      return [
        urgent
          ? "เร่งพัดลมให้สุดเดี๋ยวนี้ แล้วเปิดสเปรย์น้ำต่อทันที — ระดับวิกฤตรอรอบถัดไปไม่ได้"
          : "เร่งรอบพัดลมก่อน แล้วค่อยเปิดสเปรย์น้ำถ้ายังไม่ลง",
        "งดย้ายสุกรและเลื่อนมื้อหนักออกจากช่วงแดดจัด",
        "ถ้า 30 นาทีแล้วยังไม่ลง ให้ไล่ดูว่าพัดลมตัวไหนไม่หมุนหรือกระแสผิดปกติ",
      ];
    case "humidity":
      return [
        "เพิ่มการระบายอากาศก่อน — อย่าเพิ่งเปิดสเปรย์น้ำซ้ำ จะยิ่งชื้น",
        "ตรวจน้ำรั่วที่รางน้ำและหัวนิปเปิล ซึ่งเป็นต้นเหตุที่เจอบ่อยที่สุด",
        "เฝ้าดูอาการไอและการหายใจถี่ ชื้นสูงต่อเนื่องเสี่ยงโรคทางเดินหายใจ",
      ];
    case "nh3":
      return [
        urgent
          ? "เปิดระบายอากาศเต็มที่ทันที และให้คนที่เข้าไปในโรงเรือนใส่หน้ากากป้องกัน"
          : "เร่งระบายอากาศ แล้วตักมูลออกจากร่องให้เร็วกว่ารอบปกติ",
        "ตรวจว่าร่องระบายตันหรือน้ำขังหรือไม่ — เป็นต้นเหตุที่ทำให้ค่าค้างสูง",
        "ค่าระดับนี้ทำให้สุกรกินอาหารลดลง ให้ดูยอดการกินของวันนี้ประกอบด้วย",
      ];
    case "pig":
      return [
        "แยกตัวที่ผิดปกติออกมาคอกพยาบาล แล้วดูว่ายังกินน้ำเองไหม",
        "วัดอุณหภูมิตัวสัตว์ — เกิน 40 °C ให้แจ้งสัตวแพทย์ในรอบเดียวกัน",
        'บันทึกไว้ในหน้าโรงเรือน หัวข้อ "บันทึกข้อมูลผู้ใช้งาน" เพื่อให้ยอดวันนี้ตรงกับของจริง',
      ];
    case "feed":
      return [
        "สั่งเติมอาหารก่อนถึงรอบเช้าถัดไป",
        "ตรวจรางอาหารอุดตันและหัวนิปเปิลน้ำ — กินน้อยเพราะน้ำไม่ไหลเจอบ่อยพอ ๆ กับอาหารหมด",
        "ถ้าอาหารเต็มแต่ยังกินน้อย ให้ดูอุณหภูมิกับอาการป่วยควบคู่ไปด้วย",
      ];
    case "water":
      return [
        "เติมน้ำให้เต็มก่อนรอบให้อาหารถัดไป",
        "ตรวจปั๊มและวาล์วจ่ายน้ำว่ายังทำงานครบทุกตัว",
        "น้ำขาดกระทบการกินอาหารภายในวันเดียว ให้ดูยอดการกินของวันนี้ด้วย",
      ];
    case "sensor":
    default:
      return [
        "ตรวจไฟและสายสัญญาณที่ตู้ควบคุมท้ายโรงเรือนก่อน",
        "ดูว่าอุปกรณ์ต้นทางยังส่งค่าอยู่ไหม (Node-RED ต้องเปิดอยู่ — ดู docs/RUNBOOK.md ข้อ 5.2)",
        "ระหว่างที่ยังไม่กลับมา ให้บันทึกค่าด้วยมือไปก่อน อย่าถือว่าไม่มีค่า = ทุกอย่างปกติ",
      ];
  }
}

/**
 * รายการแจ้งเตือนทั้งหมดของทุกฟาร์ม (ใหม่→เก่า)
 * จำนวนของแต่ละโรงเรือน = barn.alerts เป๊ะ
 */
export function allAlerts(limits = DEFAULT_LIMITS) {
  const list = [];

  farms.forEach((farm) => {
    const barns = getFarmBarns(farm.id) ?? [];

    barns.forEach((barn) => {
      if (!barn.alerts) return;
      const causes = causesOf(barn, limits);
      const base = new Date(barn.updatedAt).getTime();

      for (let i = 0; i < barn.alerts; i++) {
        const cause = causes[i % causes.length];
        list.push({
          id: `${barn.id}-A${i + 1}`,
          farmId: farm.id,
          farmName: farm.name,
          barnId: barn.id,
          barnName: barn.name,
          zone: barn.zone,
          ...cause,
          status: "open",
          /* เวลาไล่ถอยหลังทีละ 37 นาที — คงที่ทุกครั้งที่เปิดหน้า */
          time: new Date(base - i * 37 * 60000).toISOString(),
        });
      }
    });

    /**
     * ส่วนที่เหลือของฟาร์ม: ฟาร์มออฟไลน์จะถูกตัด barn.alerts เป็น 0 ทุกหลัง
     * (ดู barnsByFarm.js) แต่ farm.alerts ยังนับอยู่ — ยอดรวมของหน้านี้จึงต้องเก็บส่วนนี้ด้วย
     * ไม่งั้นตัวเลขจะไม่ตรงกับกระดิ่งบนแถบเมนูและกล่องสรุปในหน้าภาพรวม
     */
    const assigned = barns.reduce((sum, b) => sum + b.alerts, 0);
    const base = new Date(farm.updatedAt).getTime();
    for (let i = 0; i < farm.alerts - assigned; i++) {
      const barn = barns[i % barns.length];
      if (!barn) break;
      list.push({
        id: `${farm.id}-OFF${i + 1}`,
        farmId: farm.id,
        farmName: farm.name,
        barnId: barn.id,
        barnName: barn.name,
        zone: barn.zone,
        category: "sensor",
        level: "serious",
        title: "ไม่ได้รับข้อมูลจากเซนเซอร์",
        detail: "โรงเรือนนี้ขาดการเชื่อมต่อ ตรวจไฟและสัญญาณเครือข่ายที่ตู้ควบคุม",
        status: "open",
        time: new Date(base - i * 53 * 60000).toISOString(),
      });
    }
  });

  return list.sort((a, b) => new Date(b.time) - new Date(a.time));
}

/** สรุปจำนวนตามระดับ / ตามฟาร์ม / ตามประเภท — ใช้กับไทล์และกราฟ */
export function summarizeAlerts(list) {
  const byLevel = ALERT_LEVELS.map((l) => ({
    ...l,
    count: list.filter((a) => a.level === l.id).length,
  }));

  const byFarm = farms
    .map((f) => ({
      farmId: f.id,
      name: f.name,
      count: list.filter((a) => a.farmId === f.id).length,
    }))
    .sort((a, b) => b.count - a.count);

  const byCategory = ALERT_CATEGORIES.map((c) => ({
    ...c,
    count: list.filter((a) => a.category === c.id).length,
  }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    total: list.length,
    byLevel,
    byFarm,
    byCategory,
    barns: new Set(list.map((a) => a.barnId)).size,
    icon: (id) => categoryOf(id)?.icon ?? "bell",
  };
}


/* ============================================================
   ส่วนเสริมของหน้า "ศูนย์การแจ้งเตือน" — เรื่องที่จัดการไปแล้ว, แนวโน้มรายชั่วโมง,
   โรงเรือนที่ต้องติดตาม และคำแนะนำจาก AI
   ============================================================ */

/** ตัวสุ่มแบบคงที่ (mulberry32) — ค่าชุดเดิมทุกครั้งที่เปิดหน้า */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** เรื่องที่ "ดำเนินการแล้ว" ของวันนี้ — คู่กับปัญหาที่เพิ่งเกิดในโรงเรือนเดียวกัน */
const RESOLVED_CAUSES = [
  {
    category: "temp",
    title: "อุณหภูมิกลับสู่ปกติ",
    detail: "เพิ่มรอบพัดลมแล้วอุณหภูมิลดกลับเข้าช่วง 22–28 °C",
  },
  {
    category: "feed",
    title: "เติมอาหารในไซโลแล้ว",
    detail: "เติมอาหารครบตามรอบ ระดับกลับมาเต็มถัง",
  },
  {
    category: "water",
    title: "แก้ปัญหาแรงดันน้ำแล้ว",
    detail: "ล้างตะกอนที่วาล์วจ่ายน้ำ แรงดันกลับเป็นปกติ",
  },
  {
    category: "sensor",
    title: "พัดลมกลับมาทำงานปกติ",
    detail: "รีเซ็ตตู้ควบคุมแล้วพัดลมหมุนครบทุกตัว",
  },
];

/**
 * รายการที่จัดการเสร็จแล้ววันนี้ (สร้างแบบ deterministic)
 * เป็นข้อมูลตัวอย่างเพื่อให้เห็นคอลัมน์ "สถานะ" ทำงานจริง — ไม่นับรวมกับยอดที่ต้องดำเนินการ
 */
export function resolvedAlerts() {
  const list = [];

  farms.forEach((farm) => {
    const barns = getFarmBarns(farm.id) ?? [];
    if (barns.length === 0) return;
    const rand = seededRandom(farm.id.length * 977 + farm.pigs);
    const count = 1 + Math.floor(rand() * 2); // ฟาร์มละ 1–2 เรื่อง
    const base = new Date(farm.updatedAt).getTime();

    for (let i = 0; i < count; i++) {
      const barn = barns[Math.floor(rand() * barns.length)];
      const cause = RESOLVED_CAUSES[(barns.length + i) % RESOLVED_CAUSES.length];
      list.push({
        id: `${farm.id}-DONE${i + 1}`,
        farmId: farm.id,
        farmName: farm.name,
        barnId: barn.id,
        barnName: barn.name,
        zone: barn.zone,
        level: "good",
        status: "done",
        ...cause,
        time: new Date(base - (40 + i * 71) * 60000).toISOString(),
      });
    }
  });

  return list;
}

/** รายการทั้งหมดที่แสดงในหน้าศูนย์การแจ้งเตือน = ที่ต้องดำเนินการ + ที่จัดการแล้ว */
export function alertFeed(limits = DEFAULT_LIMITS) {
  return [...allAlerts(limits), ...resolvedAlerts()].sort(
    (a, b) => new Date(b.time) - new Date(a.time)
  );
}

/** จำนวนโรงเรือนที่ออฟไลน์ทั้งเครือ (ใช้กับไทล์ "อุปกรณ์ออฟไลน์") */
export function offlineBarnCount() {
  return farms.reduce(
    (sum, f) =>
      sum + (getFarmBarns(f.id) ?? []).filter((b) => b.status === "offline").length,
    0
  );
}

/**
 * แนวโน้มรายชั่วโมงย้อนหลัง 24 ชม. แยกตามระดับ
 * ยังไม่มี log ย้อนหลังจริงในระบบ จึงกระจายจากยอดของวันนี้ด้วยตัวสุ่มคงที่
 * (ผลรวมของทั้งกราฟ = จำนวนรายการที่มีอยู่จริง ไม่ได้ตั้งตัวเลขลอย ๆ)
 */
export function hourlyTrend(list) {
  const end = new Date(farms[0].updatedAt).getHours();
  const buckets = Array.from({ length: 24 }, (_, i) => ({
    hour: `${String((end - 23 + i + 48) % 24).padStart(2, "0")}:00`,
    critical: 0,
    serious: 0,
    done: 0,
  }));

  const rand = seededRandom(list.length * 7919 + 13);
  list.forEach((a) => {
    /* ช่วงบ่าย-ค่ำมีโอกาสเกิดมากกว่า (อากาศร้อนสะสม) — ถ่วงน้ำหนักด้วยรูปคลื่นของวัน */
    const bias = Math.floor(rand() * 24);
    const hour = Math.min(23, Math.max(0, Math.round(bias * 0.88 + 23 * 0.12)));
    const key = a.status === "done" ? "done" : a.level === "critical" ? "critical" : "serious";
    buckets[hour][key] += 1;
  });

  return buckets;
}

/** โรงเรือนที่ต้องติดตาม — เรียงตามจำนวนเรื่องที่ยังไม่ดำเนินการ */
export function watchBarns(list, limit = 4) {
  const map = new Map();
  list
    .filter((a) => a.status === "open")
    .forEach((a) => {
      const cur = map.get(a.barnId) ?? {
        barnId: a.barnId,
        barnName: a.barnName,
        farmId: a.farmId,
        farmName: a.farmName,
        count: 0,
        worst: a,
      };
      cur.count += 1;
      const order = { critical: 0, serious: 1, warning: 2 };
      if (order[a.level] < order[cur.worst.level]) cur.worst = a;
      map.set(a.barnId, cur);
    });

  const rank = { critical: 0, serious: 1, warning: 2 };
  return [...map.values()]
    .sort((a, b) => rank[a.worst.level] - rank[b.worst.level] || b.count - a.count)
    .slice(0, limit);
}

/** ระดับความเร่งด่วนของคำแนะนำ — ผูกกับระดับของเรื่องนั้นโดยตรง */
export const ADVICE_PRIORITY = {
  critical: { label: "เร่งด่วน", tone: "critical" },
  serious: { label: "สำคัญ", tone: "serious" },
  warning: { label: "แนะนำ", tone: "warning" },
};

/** คำแนะนำจาก AI — หยิบเรื่องที่หนักที่สุดมาสรุปเป็นสิ่งที่ต้องลงมือทำ */
export function aiAdvice(list, limit = 4) {
  const rank = { critical: 0, serious: 1, warning: 2 };
  return list
    .filter((a) => a.status === "open")
    .sort((a, b) => rank[a.level] - rank[b.level] || new Date(b.time) - new Date(a.time))
    .slice(0, limit);
}
