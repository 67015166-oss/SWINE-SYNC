/**
 * ฟาร์มจริงจาก **หลังบ้านของเราเอง** — ทางเลือกแทน PlotNexus (T1.303)
 *
 * ═══ ทำไมต้องมี ═══
 * กุญแจ PlotNexus ถูกถอนสิทธิ์ตั้งแต่ 11 ก.ย. 2569 (403 ทุกชุดข้อมูล) หน้าจอจึงไม่เห็นฟาร์มจริงเลย
 * **ทั้งที่ข้อมูลชุดเดียวกันอยู่ในฐานของเราเองครบ** — ท่อ MQTT → Node-RED → InfluxDB → Postgres
 * ของเราเดินมาตลอด เราไปผูกจอไว้กับท่อของคนอื่นที่เขาปิดไปแล้ว ทั้งที่ท่อของเรามีของ
 *
 * ไฟล์นี้จึงทำหน้าที่เดียวกับ `plotnexusFarms.js` แต่รับของจากหลังบ้านเรา
 *
 * ═══ สองอย่างที่ตั้งใจทำแบบนี้ ═══
 *
 * 1. **ใช้ `toBarn` ตัวเดียวกับ PlotNexus** ไม่เขียนใหม่ — ไฟล์นี้แค่แปลงคำตอบของ API
 *    ให้เป็น "ถุง" รูปเดียวกันก่อน (`{ ชื่อค่าที่วัด: {value, at} }`) กติกาที่ตัดสินว่า
 *    ออฟไลน์ไหม · ก๊าซเชื่อได้ไหม · คิดคะแนนสุขภาพยังไง จึงเหมือนกันทั้งสองแหล่งเสมอ
 *
 * 2. **รหัสฟาร์ม/โรงเรือนใช้ `code` ของฐาน ไม่ใช่ uuid** — ฐานเราใช้ `F-KPP` กับ `A1`
 *    ซึ่งตรงกับที่ PlotNexus เคยให้พอดี ไอดีที่หน้าจอเห็นจึงไม่เปลี่ยน
 *    **เลย์เอาต์กระดาน · บันทึกของผู้ใช้ · ค่าตั้งค่ารายโรงเรือน ที่ผูกกับไอดีเดิมจึงไม่หลุด**
 *    ส่วน uuid จริงเก็บไว้ที่ `apiId` เพราะเส้นทาง `/api/barns/:id/...` ต้องใช้ uuid
 *
 * ═══ ต่างจาก PlotNexus ตรงไหน ═══
 * - **ค่าไฟดีกว่า** — หลังบ้านเราคิด "ใช้ไปวันนี้/เดือนนี้" ให้ (ส่วนต่างของเลขสะสม)
 *   ซึ่ง PlotNexus ให้ไม่ได้ จึงเคยเป็นขีดกลางมาตลอด
 * - **ไม่มีฝน/แสง/ทิศลม** — ท่อของเราไม่เคยเก็บค่าพวกนี้ หน้าจอจะขึ้นขีดกลาง
 *   ตรงไปตรงมาดีกว่าเดาค่าให้
 */
import { buildAlerts, toBarn } from "./plotnexusFarms.js";
import { extrasOf, fieldMapFor } from "../metrics/registry.js";
import { stuckKeysFromEvidence } from "../sensorHealth.js";
import { ZONES } from "../../data/mock/barnSystems.js";

/**
 * ชื่อค่าที่วัดของฐานเรา → ชื่อที่ `toBarn` รออยู่
 *
 * ★ `wind_ms` ในเล้าคือ **ลมที่พัดในเล้า** จึงเป็น `airflow`
 *   ส่วนตัวเดียวกันที่เสาอากาศนอกอาคารคือ `wind_speed` — คนละความหมาย ห้ามใช้ชื่อเดียวกัน
 *   (กติกานี้มาจาก PlotNexus และหน้าจออ่านสองชื่อนี้คนละที่กัน)
 */
/* ★ สองตารางนี้**คำนวณจากทะเบียนชนิดค่า** ไม่ได้เขียนซ้ำอีกที่ (T1.346)
   เพิ่มชนิดค่าใหม่ให้แก้ที่ lib/metrics/registry.js ที่เดียว สองตารางนี้จะตามเอง
   มีเทสต์บังคับไว้ว่าผลที่ได้ต้องเท่ากับของเดิมเป๊ะ — การย้ายครั้งนี้จึงไม่เปลี่ยนพฤติกรรมใด ๆ */
const INSIDE_FIELD = fieldMapFor("in");
const OUTSIDE_FIELD = fieldMapFor("out");

/**
 * `{ metric: {value, at, devices} }` ของหลังบ้าน → "ถุง" ที่ `toBarn` รับ
 *
 * ค่าที่ไม่ได้อยู่ในตารางแปลงจะถูกข้ามเงียบ ๆ — ฐานเพิ่มค่าที่วัดใหม่ได้โดยหน้าจอไม่พัง
 * (ตรงข้ามกับการปล่อยผ่านทั้งหมด ซึ่งจะได้ชื่อค่าที่หน้าจอไม่รู้จักมาปนในถุง)
 */
export function bagOf(current, fieldMap, stuck = null, place = "in") {
  const bag = {};
  for (const [metric, cell] of Object.entries(current ?? {})) {
    const field = fieldMap[metric];
    if (!field || cell == null) continue;
    /* คีย์เดียวกับที่กราฟย้อนหลังใช้ เพื่อให้ไทล์กับกราฟบนหน้าเดียวกันตัดค่าเดียวกันทิ้ง */
    const key = `${metric}|${place}`;
    bag[field] = {
      value: cell.value ?? null,
      at: cell.at ?? null,
      unit: null,
      key,
      stuck: stuck?.has(key) === true,
    };
  }
  return bag;
}

/**
 * คำตอบของ `/api/barns/:id/power/latest` → รูปที่การ์ดไฟฟ้าอ่าน
 *
 * ★ **กระแสสามตัวคือ "เฟส" ไม่ใช่ "วงจรย่อย" ห้ามเอามาบวกกัน** — ต่างเฟสกัน 120°
 *   บวกเลขตรง ๆ ไม่มีความหมาย จึงส่ง `circuitKind: "phase"` กับค่าเฉลี่ย ไม่ใช่ผลรวม
 * ★ ชื่อฟิลด์ต้องเป็น `activePower` ไม่ใช่ `powerKw` — การ์ดไฟฟ้าอ่านชื่อนี้
 */
export function electricalOf(reading, { staleMs = 15 * 60_000, now = Date.now(), rate = null } = {}) {
  if (!reading?.at || reading.voltage == null) return { online: false };
  if (now - new Date(reading.at).getTime() > staleMs) return { online: false };

  const { a, b, c } = reading.currents ?? {};
  const phases = [a, b, c].filter((n) => n != null);

  /* บอกการ์ดว่าช่องไหนเป็นขีดกลางเพราะมิเตอร์ไม่ได้วัด ไม่ใช่เพราะระบบพัง */
  const missing = [];
  if (reading.powerKw == null) missing.push("กำลังไฟ");
  if (reading.kwhTotal == null) missing.push("หน่วยสะสม");

  return {
    online: true,
    missing,
    voltage: reading.voltage,
    circuitKind: "phase",
    totalCurrent: null,
    currentPerPhase: phases.length ? phases.reduce((s, n) => s + n, 0) / phases.length : null,
    circuits: [
      { id: "L1", label: "เฟส A", amp: a ?? 0 },
      { id: "L2", label: "เฟส B", amp: b ?? 0 },
      { id: "L3", label: "เฟส C", amp: c ?? 0 },
    ],
    activePower: reading.powerKw,
    frequency: reading.frequency,
    kwhTotal: reading.kwhTotal,
    /* ★ หลังบ้านเราคิดส่วนต่างให้แล้ว ต่างจาก PlotNexus ที่มีแต่เลขสะสม
       `todayFrom` คือเวลาที่เริ่มนับจริง — หน้าจอต้องบอก ไม่งั้นคนอ่านจะนึกว่า
       ฟาร์มใช้ไฟแค่นั้นทั้งวัน ทั้งที่เราเพิ่งเริ่มเก็บตอนสาย */
    todayKwh: reading.todayKwh ?? null,
    monthKwh: reading.monthKwh ?? null,
    todayFrom: reading.todayFrom ?? null,
    monthFrom: reading.monthFrom ?? null,
    rate,
    cost: rate != null && reading.todayKwh != null ? reading.todayKwh * rate : null,
    at: reading.at,
  };
}

const round1 = (n) => (n == null ? null : Number(n.toFixed(1)));

/**
 * ประกอบ `{ farm, barns, alerts }` จากคำตอบของหลังบ้าน
 *
 * @param {object} farmRow แถวจาก `GET /api/farms`
 * @param {Array} barnRows แถวจาก `GET /api/farms/:id/barns`
 * @param {object} limits เกณฑ์ของผู้ใช้ (ชุดเดียวกับที่ PlotNexus ใช้)
 * @param {{powerByBarn?: object, rate?: number}} [opt] ค่าไฟล่าสุดแยกตาม uuid ของโรงเรือน
 */
export function toFarmBundleFromApi(farmRow, barnRows, limits, opt = {}) {
  if (!farmRow?.code) return null;
  const farmId = farmRow.code;
  const { powerByBarn = {}, rate = null } = opt;

  const barns = (barnRows ?? []).map((row) => {
    /* ★ หลังบ้านส่ง "หลักฐาน" มา ไม่ใช่คำตัดสิน — ตัวตัดสินคือตัวเดียวกับที่กราฟใช้
       (เหตุผลเต็มอยู่ใน lib/sensorHealth.js หัวข้อ "ทำไมต้องแยกหลักฐานออกจากการตัดสิน") */
    const stuck = stuckKeysFromEvidence(row.stuck_evidence);
    const inside = bagOf(row.current, INSIDE_FIELD, stuck, "in");
    const outside = bagOf(row.outdoor, OUTSIDE_FIELD, stuck, "out");
    const meta = { code: row.code, name: row.name, stage: row.stage ?? null };
    const barn = toBarn(farmId, row.id, meta, inside, outside);

    const power = powerByBarn[row.id];
    return {
      ...barn,
      capacity: row.capacity ?? null,
      /* ค่าที่หลังบ้านส่งมาแต่ยังไม่มีในทะเบียน — เดิมถูกข้ามเงียบ ๆ ที่ `bagOf`
         เซนเซอร์ชนิดใหม่จึงไม่ขึ้นบนจอโดยไม่มีอะไรบอก (T1.346)
         ★ เก็บแยกไว้ ไม่ยัดเข้าถุงของ `toBarn` เพราะหน้าจอเดิมจะได้คีย์แปลกปลอมมาปน */
      extras: {
        inside: extrasOf(row.current, "in"),
        outdoor: extrasOf(row.outdoor, "out"),
      },
      /* ★ ป้าย "ข้อมูลจริง/ตัวอย่าง" ต้องมาจากฐาน ห้ามตรึงเป็น live
         ฐานมีคอลัมน์นี้อยู่แล้วและตั้งเป็น demo ได้ — ตรึงไว้เมื่อไร ฟาร์มทดสอบ
         ที่เพิ่มเข้าฐานจะถูกติดป้าย "ข้อมูลจริง" ทั้งที่ไม่ใช่ */
      dataSource: row.data_source ?? "live",
      electrical: power ? electricalOf(power, { rate }) : barn.electrical,
    };
  });

  /* ═══ แจ้งเตือน: ใช้ของหลังบ้านถ้ามี ไม่งั้นค่อยคิดเอง (T1.307) ═══
     ★ ใบที่หลังบ้านเปิดไว้ **ตรวจซ้ำไม่ได้** เมื่อโรงเรือนนั้นไม่มีค่าใหม่แล้ว
       เครื่องคิดแจ้งเตือนจงใจไม่เอาค่าค้างมาตัดสิน (alerts/engine.js) ใบเก่าจึงค้างเปิดตลอดกาล
       และปิดให้เองก็ไม่ถูก เพราะเท่ากับบอกว่า "ตอนนี้ปกติแล้ว" ซึ่งไม่มีใครรู้
       ติดธงไว้ให้หน้าจอบอกผู้ใช้ได้ว่าใบไหนคือสถานะตอนนี้ ใบไหนคือของที่ค้างมา
       **ยกเว้นใบเรื่องเซนเซอร์เงียบเอง** ซึ่งเป็นเรื่องของการไม่มีค่า จึงยังจริงอยู่ */
  const silent = new Set(barns.filter((b) => b.status === "offline").map((b) => b.apiId));
  const SILENCE_CODES = new Set(["sensor_silent", "sensor_offline"]);
  const alerts = opt.alerts
    ? opt.alerts
      .filter((a) => silent.has(a.barn_id) || barns.some((b) => b.apiId === a.barn_id))
      .map((a) => ({
        ...a,
        unverified: silent.has(a.barn_id) && !SILENCE_CODES.has(a.code),
      }))
    : barns.flatMap((b) => buildAlerts({ id: farmId, name: farmRow.name }, b, limits));
  const countByBarn = new Map();
  for (const a of alerts) countByBarn.set(a.barn_id, (countByBarn.get(a.barn_id) ?? 0) + 1);
  for (const b of barns) b.alerts = countByBarn.get(b.apiId) ?? 0;

  const live = barns.filter((b) => b.status !== "offline");
  const avg = (pick) => {
    const nums = live.map(pick).filter((n) => n != null);
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  };

  const farm = {
    id: farmId,
    name: farmRow.name,
    province: farmRow.province ?? null,
    district: null,
    lat: farmRow.lat ?? null,
    lng: farmRow.lng ?? null,
    pigTypes: [],
    status: live.length === 0 ? "offline" : "good",
    pigs: null,
    barnCount: barns.length,
    alerts: alerts.length,
    tempC: round1(avg((b) => b.tempC)),
    humidity: round1(avg((b) => b.humidity)),
    fcr: null,
    updatedAt: farmRow.last_reading_at ?? null,
    dataSource: farmRow.data_source ?? "live",
    /* uuid จริงของฟาร์ม — เส้นทาง `/api/farms/:id/barns` ต้องใช้ตัวนี้ ไม่ใช่ `code` */
    apiId: farmRow.id,
  };

  return { farm, barns, alerts };
}

/* ชื่อโซนถือที่เดียวกับผังของข้อมูลตัวอย่าง (`ZONES`) — ฐานเก็บแค่รหัสโซน "A"/"B"/"C"
   ถ้าคัดลอกชื่อมาไว้ที่นี่ด้วย วันหนึ่งผังสองฝั่งจะเรียกโซนเดียวกันคนละชื่อ */
const ZONE_LABEL = Object.fromEntries(ZONES.map((z) => [z.id, z.label]));

/** ค่าหนึ่งช่องจากถุง `readings` ของหลังบ้าน — ไม่มีก็ null ไม่ใช่ 0 */
const cellOf = (readings, metric) => {
  const cell = readings?.[metric];
  if (cell == null || cell.value == null) return { value: null, at: null };
  return { value: Number(cell.value), at: cell.at ?? null };
};

/**
 * `GET /api/barns/:id/sensor-map` → รูปที่การ์ดผังเซนเซอร์อ่าน (T1.336)
 *
 * ═══ ปัญหาที่แก้ ═══
 * หน้าจอส่งคำตอบดิบของหลังบ้านเข้าการ์ดตรง ๆ ทั้งที่การ์ดรอรูปของ `getSensorMap()`
 * (`{online, nodes:[{id,label,tempC,humidity}]}`) คนละรูปกันทุกช่อง ผลคือฟาร์มจริง
 * เห็นผังที่ขึ้น "ทุกจุดวัดไม่ส่งค่า" และหัวโซนว่างเปล่า **ทั้งที่กล่องมีค่ารายจุดอยู่**
 *
 * ═══ สองอย่างที่ต้องไม่กลืนหาย ═══
 * 1. **เงียบทีละจุด ไม่ใช่เงียบทั้งผัง** — ของจริงที่กำแพงเพชรคือ SENSOR-B ส่งค่าอยู่
 *    ส่วน SENSOR-A/C เงียบ ถ้าตัดสินด้วยธงเดียวทั้งการ์ด จุดที่ยังส่งค่าจะถูกลบทิ้งไปด้วย
 *    (หรือแย่กว่า: จุดที่เงียบถูกวาดเหมือนมีค่า) จึงติดธง `silent` ไว้รายจุด
 * 2. **จุดนอกอาคารแยกออกจากผังในเล้า** — เอามาปนคือบอกว่าในเล้ามีจุดวัดมากกว่าที่มีจริง
 *    และค่าของมันคืออากาศข้างนอก ไม่ใช่ของโซนไหนในเล้า
 *
 * โซนที่ฐานมีแต่ผังไม่รู้จัก (เช่นวันหนึ่งมีโซน E) ใช้รหัสโซนเป็นป้ายไปก่อน
 * ดีกว่าโยนทิ้งเงียบ ๆ แล้วผังขาดจุดไปหนึ่งจุดโดยไม่มีใครรู้
 */
export function sensorMapOf(res) {
  const rows = res?.nodes;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const toNode = (row, i) => {
    const temp = cellOf(row.readings, "temp_c");
    const humid = cellOf(row.readings, "humidity");
    const wind = cellOf(row.readings, "wind_ms");
    const nh3 = cellOf(row.readings, "nh3");
    const zone = row.zone ?? null;
    return {
      id: zone ?? row.code ?? `#${i + 1}`,
      /* นอกอาคารไม่มีโซน — ใช้คำว่า "นอกอาคาร" เป็นป้าย ไม่ใช่ปล่อยว่าง */
      label: row.outdoor
        ? "นอกอาคาร"
        : (zone && ZONE_LABEL[zone]) || zone || row.code || "ไม่ระบุตำแหน่ง",
      code: row.code ?? null,
      tempC: temp.value,
      humidity: humid.value,
      wind: wind.value,
      nh3: nh3.value,
      at: temp.at ?? humid.at ?? wind.at ?? nh3.at,
      /* จุดนี้ไม่มีค่าอะไรเลย = เงียบ (ไม่ใช่ "วัดได้ศูนย์") */
      silent: temp.value == null && humid.value == null && wind.value == null,
    };
  };

  const inside = rows.filter((r) => !r.outdoor).map(toNode);
  const outside = rows.filter((r) => r.outdoor).map(toNode);

  /* NH₃ วัดจุดเดียว — หยิบจุดที่มีค่ามาบอกว่าวัดที่โซนไหน (กำแพงเพชรยังไม่มีเลย) */
  const gas = inside.find((n) => n.nh3 != null) ?? null;

  return {
    from: "box",
    /* ผัง "ส่งค่าอยู่" เมื่อมีอย่างน้อยหนึ่งจุดที่ยังมีค่า */
    online: inside.some((n) => !n.silent),
    nodes: inside,
    outdoor: outside.length ? outside : null,
    nh3: gas?.nh3 ?? null,
    nh3Zone: gas?.id ?? null,
  };
}
