/**
 * แปลงข้อมูลจาก PlotNexus ให้เป็นรูป "ฟาร์ม/โรงเรือน" ที่หน้าจอทุกหน้าใช้อยู่แล้ว
 *
 * **PlotNexus ไม่รู้จักคำว่าฟาร์มหรือโรงเรือน** — มันรู้แค่ "ชุดข้อมูล · จุดติดตั้ง · ค่าที่วัด"
 * ไฟล์นี้จึงเป็นที่เดียวที่ผูกสองโลกเข้าหากัน แล้วส่งรูปเดิมออกไป
 * หน้าอื่นจึงไม่ต้องรู้เลยว่าข้อมูลเปลี่ยนแหล่งมาแล้ว
 *
 * ชื่อฟาร์ม พิกัด และชื่อโรงเรือนต้องประกาศไว้ตรงนี้ เพราะ API ไม่ได้บอกมา
 * (ค่าพิกัดยกมาจากฐานข้อมูลเดิมของหลังบ้าน จุดหมุดบนแผนที่จะได้อยู่ที่เดิม)
 */
import { barnHealthScore } from "../../data/mock/barnsByFarm.js";
import { BAHT_PER_KWH, dewPointOf } from "../../data/mock/barnSystems.js";
import { gasModuleSuspect } from "../sensorHealth.js";

/** ไม่มีค่าใหม่เกินเท่านี้ = ถือว่าเซนเซอร์เงียบ (เกณฑ์เดียวกับตอนใช้หลังบ้านเดิม) */
const STALE_MS = 15 * 60_000;

/**
 * ผังว่าชุดข้อมูลไหน = ฟาร์มอะไร และจุดติดตั้งไหน = โรงเรือน/นอกโรงเรือน
 *
 * เพิ่มฟาร์มใหม่ = เพิ่มอีกก้อนในนี้ที่เดียว ไม่ต้องแก้หน้าจอ
 */
export const FARM_MAP = {
  pig: {
    farm: {
      id: "F-KPP",
      name: "ฟาร์มกำแพงเพชร",
      province: "กำแพงเพชร",
      district: null,
      lat: 16.4828,
      lng: 99.5222,
      pigTypes: [],
    },
    /* จุดติดตั้งที่อยู่ "ในเล้า" — หนึ่งจุดคือหนึ่งโรงเรือน */
    barns: {
      barn_R: { code: "A1", name: "โรงเรือน A1", stage: null },
    },
    /* จุดติดตั้งที่อยู่ "นอกอาคาร" — ใช้เป็นค่าภายนอกของทุกโรงเรือนในฟาร์มนี้ */
    outdoor: "kamphaengphet_office",
  },
};

const round1 = (n) => (n == null ? null : Number(n.toFixed(1)));

/**
 * จัดค่าล่าสุดเป็น `{ จุดติดตั้ง: { ค่าที่วัด: {value, at, unit} } }`
 * @param {object} latest คำตอบจาก /api/latest
 */
function byLocation(latest) {
  const out = {};
  for (const item of latest?.["ค่า"] ?? []) {
    const loc = item["จุดติดตั้ง"];
    if (!loc) continue;
    (out[loc] ??= {})[item.id] = {
      value: item["ค่า"],
      unit: item["หน่วย"] || null,
      at: item["เวลา"] ?? null,
    };
  }
  return out;
}

/**
 * ค่าในถุง — **ค่าที่ติดธง `stuck` ถือว่าไม่รู้** (T1.315)
 *
 * เซนเซอร์ที่ส่งเลขเดิมซ้ำยังส่งข้อมูลอยู่ทุกนาที ค่าจึง "สด" ตามเวลา แต่ไม่ได้วัดอะไรเลย
 * ปล่อยผ่านเมื่อไรหน้าจอจะโชว์เลขนั้นเป็นค่าปัจจุบัน แล้วเอาไปเทียบเกณฑ์ขึ้นป้ายเขียวด้วย
 * — อาการเดียวกับก๊าซที่ส่ง 0 ตลอด ต่างกันแค่ค่านี้ดูสมเหตุสมผลจนจับไม่ได้ด้วยตา
 *
 * คัดทิ้งที่ปากทางที่เดียวแบบเดียวกับก๊าซ ทุกหน้าที่อ่าน `toBarn` จึงตรงกันหมด
 */
const val = (bag, id) => (bag?.[id]?.stuck ? null : bag?.[id]?.value ?? null);

/**
 * คีย์ของค่าที่ติดธงค้าง เพื่อให้หน้าจอบอกได้ว่า **ขีดกลางช่องนี้มาจากอะไร**
 *
 * ขีดกลางเฉย ๆ อ่านว่า "ไม่มีเซนเซอร์" ซึ่งคนละเรื่องกับ "มีแต่เชื่อค่าไม่ได้"
 * และสองอย่างนี้ต้องไปตามคนละคน — ติดตั้งเพิ่ม กับ ไปซ่อมของที่มีอยู่
 */
const stuckKeysOf = (...bags) =>
  bags.flatMap((bag) =>
    Object.values(bag ?? {})
      .filter((cell) => cell?.stuck && cell?.key)
      .map((cell) => cell.key),
  );

/** เวลาของค่าที่ใหม่ที่สุดในจุดนั้น */
function latestAt(bag) {
  const times = Object.values(bag ?? {}).map((r) => r?.at).filter(Boolean);
  return times.length ? times.sort().at(-1) : null;
}

/**
 * ค่าจากมิเตอร์ไฟ → รูปที่ ElectricalPanel รออยู่
 *
 * **กระแสสามตัวคือ "เฟส" ไม่ใช่ "วงจรย่อย" ห้ามเอามาบวกกัน** — เหตุผลเต็มอยู่ใน
 * LiveFarmsProvider เดิม (กระแสสามเฟสต่างเฟสกัน 120° บวกเลขตรง ๆ ไม่มีความหมาย)
 * ที่นี่จึงส่ง `circuitKind: "phase"` และไม่ส่ง "กระแสรวม" เหมือนกัน
 */
function toElectrical(bag) {
  const voltage = val(bag, "voltage_avg");
  const at = bag?.voltage_avg?.at ?? latestAt(bag);
  if (voltage == null || !at) return { online: false };
  if (Date.now() - new Date(at).getTime() > STALE_MS) return { online: false };

  const a = val(bag, "current_a");
  const b = val(bag, "current_b");
  const c = val(bag, "current_c");
  const phases = [a, b, c].filter((n) => n != null);
  const powerKw = val(bag, "power_kw");
  const kwhTotal = val(bag, "energy_kwh");

  /* บอกการ์ดว่าช่องไหนเป็นขีดกลางเพราะมิเตอร์ไม่ได้วัด ไม่ใช่เพราะระบบพัง */
  const missing = [];
  if (powerKw == null) missing.push("กำลังไฟ");
  if (kwhTotal == null) missing.push("หน่วยสะสม");

  return {
    online: true,
    missing,
    voltage: round1(voltage),
    circuitKind: "phase",
    totalCurrent: null,
    currentPerPhase: phases.length
      ? round1(phases.reduce((s, n) => s + n, 0) / phases.length)
      : null,
    circuits: [
      { id: "L1", label: "เฟส A", amp: a ?? 0 },
      { id: "L2", label: "เฟส B", amp: b ?? 0 },
      { id: "L3", label: "เฟส C", amp: c ?? 0 },
    ],
    /* **ชื่อฟิลด์ต้องเป็น `activePower` ไม่ใช่ `powerKw`** — การ์ดไฟฟ้าอ่านชื่อนี้
       (เผลอตั้งเป็น powerKw รอบแรก แล้วกำลังไฟขึ้นเป็นขีดกลางทั้งที่มิเตอร์ส่งค่ามาแล้ว) */
    activePower: powerKw,
    frequency: val(bag, "frequency"),
    kwhTotal,
    /* หน่วยที่ใช้ "วันนี้/เดือนนี้" ต้องเอาเลขสะสมมาลบกับเลขสะสมเมื่อวาน/ต้นเดือน
       ซึ่ง PlotNexus ไม่ได้เก็บให้ (มีแต่เลขสะสมล่าสุด) — ปล่อยเป็นขีดกลางตรงไปตรงมา
       ดีกว่าเดาค่าแล้วขึ้นตัวเลขค่าไฟที่ดูน่าเชื่อแต่ผิด */
    todayKwh: null,
    monthKwh: null,
    todayFrom: null,
    monthFrom: null,
    rate: BAHT_PER_KWH,
    cost: null,
    at,
  };
}

/**
 * สร้างโรงเรือนหนึ่งหลังจากค่าล่าสุดของจุดติดตั้งนั้น
 *
 * ★ **export เพราะ `serverFarms.js` ใช้ตัวเดียวกัน** (T1.303) — สองแหล่งข้อมูล
 *   (PlotNexus กับหลังบ้านของเราเอง) ต้องได้โรงเรือนหน้าตาเหมือนกันเป๊ะ
 *   ถ้าแยกกันเขียน วันหนึ่งกติกา "ค่าเก่าเกิน 15 นาทีถือว่าออฟไลน์" หรือการกรองก๊าซ
 *   จะเพี้ยนไปข้างเดียวโดยไม่มีใครรู้ · ฝั่งที่เรียกเป็นคนแปลงค่าให้เป็น "ถุง" ก่อน
 */
export function toBarn(farmId, locId, meta, inside, outsideBag) {
  const updatedAt = latestAt(inside);
  const stale = !updatedAt || Date.now() - new Date(updatedAt).getTime() > STALE_MS;

  /* ★ ค่านอกอาคารตัดสินความสดด้วย**เวลาของตัวเอง** ไม่ใช่ของเซนเซอร์ในเล้า (T1.304)
     เดิมบล็อก `outdoor` ไม่ได้ผ่านการตรวจนี้เลย — ค่าในเล้ากลายเป็นขีดกลางตามกติกา
     แต่ค่านอกอาคารยังขึ้นเลขเดิมอยู่ บรรทัดเดียวกันจึงเขียน "ใน — · นอก 29.7"
     ซึ่งอ่านแล้วเข้าใจว่า 29.7 คือค่าตอนนี้ ทั้งที่เก่าพอกัน (เห็นเองบนหน้าจอ 3 ต.ค. 2569)
     สองจุดนี้เป็นคนละเซนเซอร์และอาจหยุดส่งคนละเวลา จึงต้องวัดอายุแยกกัน */
  const outAt = latestAt(outsideBag);
  const outStale = !outAt || Date.now() - new Date(outAt).getTime() > STALE_MS;

  const tempC = stale ? null : round1(val(inside, "temperature"));
  const humidity = stale ? null : round1(val(inside, "humidity"));
  const status = stale || tempC == null ? "offline" : "good";

  /* ═══ ก๊าซ: ทิ้งค่าที่เซนเซอร์ "ส่งมาแต่ไม่ได้วัด" ตั้งแต่ตรงนี้ ═══
     ปล่อย 0 ที่เป็นไปไม่ได้ให้ไหลต่อไปเมื่อไร ทุกหน้าที่เอาไปเทียบเกณฑ์จะขึ้นเขียว
     "อยู่ในเกณฑ์" หมด (หน้าสภาพแวดล้อม · หน้าโรงเรือน · ตารางเทียบ · ผู้ช่วย AI)
     กรองที่ปากทางที่เดียวจึงจบทั้งแอป ไม่ต้องไปไล่กันทีละหน้า — กติกาอยู่ใน lib/sensorHealth.js
     (สะพานข้อมูลตัวเก่าก็กรองแบบนี้อยู่แล้ว ตอนย้ายมาใช้ PlotNexus การกรองนี้หายไป) */
  const rawGases = { nh3: round1(val(inside, "nh3")), co2: round1(val(inside, "co2")) };
  const gasSuspect = !stale && gasModuleSuspect(rawGases);

  const barn = {
    id: `${farmId}-${meta.code}`,
    name: meta.name,
    zone: meta.code.slice(0, 1),
    building: Number(meta.code.slice(1)) || 1,
    stage: meta.stage,
    pigs: null,
    status,
    /* นับทีหลังจากเกณฑ์ของผู้ใช้ (ดู countAlerts) — ตรงนี้ตั้งไว้ 0 ก่อน */
    alerts: 0,
    tempC,
    humidity,
    nh3: stale || gasSuspect ? null : rawGases.nh3,
    co2: stale || gasSuspect ? null : rawGases.co2,
    /* "เซนเซอร์ยังส่งค่าอยู่ แต่ค่าที่ส่งเชื่อไม่ได้" — คนละเรื่องกับ "ไม่มีเซนเซอร์" (H₂S)
       หน้าจอใช้ค่านี้เลือกว่าจะขึ้นป้าย "สงสัยเซนเซอร์" หรือ "ไม่มีสัญญาณ" */
    gasSuspect,
    /* ค่าที่เซนเซอร์ "ส่งมาแต่ไม่ได้วัด" — คีย์แบบ `"temp_c|out"` ให้หน้าจอแปลเป็นชื่อเอง
       ว่างเปล่าเมื่อข้อมูลมาจากแหล่งที่ไม่มีหลักฐานให้ตรวจ (เช่น PlotNexus) */
    stuckValues: stuckKeysOf(inside, outsideBag),
    feedPct: null,
    waterPct: null,
    devices: {
      fan: "offline",
      water: "offline",
      feed: "offline",
      camera: "offline",
      sensor: status === "offline" ? "offline" : "good",
    },
    /* PlotNexus เรียกลมในเล้าว่า `airflow` ส่วน `wind_speed` เป็นลมที่เสาอากาศข้างนอก */
    windSpeed: stale ? null : round1(val(inside, "airflow")),
    today: { expected: null, aiCount: null, missing: 0, sick: 0, dead: 0, countedAt: null },
    cameras: [],
    updatedAt,
    dataSource: "live",
    /* ใช้เป็นคีย์จับคู่แจ้งเตือน — ที่นี่ใช้รหัสจุดติดตั้งของ PlotNexus */
    apiId: locId,
    /* ค่านอกอาคารจากเสาอากาศ — เก็บเท่าที่เสาวัดได้จริง
       UV กับความกดอากาศไม่มีเซนเซอร์ จึงเป็น null แล้วหน้าจอขึ้นขีดกลาง
       (ดีกว่าเดาค่าให้ ซึ่งจะได้ตัวเลขที่ดูน่าเชื่อแต่ไม่ได้วัดจริง) */
    outdoor: {
      tempC: outStale ? null : round1(val(outsideBag, "temperature")),
      humidity: outStale ? null : round1(val(outsideBag, "humidity")),
      wind: outStale ? null : round1(val(outsideBag, "wind_speed")),
      windDirection: outStale ? null : val(outsideBag, "wind_direction"),
      rainfall: outStale ? null : val(outsideBag, "rainfall"),
      rainfall24h: outStale ? null : val(outsideBag, "rainfall_24h"),
      light: outStale ? null : val(outsideBag, "light"),
      uv: null,
      pressure: null,
      /* จุดน้ำค้างคำนวณจากอุณหภูมิกับความชื้นด้วยสูตร Magnus — **ไม่ใช่การเดา**
         เป็นค่าที่นิยามจากสองค่านั้นอยู่แล้ว จึงคิดเองได้โดยไม่ต้องมีเซนเซอร์แยก */
      dewPoint: (() => {
        if (outStale) return null;
        const t = val(outsideBag, "temperature");
        const h = val(outsideBag, "humidity");
        return t == null || h == null ? null : dewPointOf(t, h);
      })(),
      at: outAt,
    },
    /* ═══ ค่าล่าสุดที่เคยวัดได้ — ถือไว้เมื่อเซนเซอร์เงียบ ═══
       `tempC` ข้างบนยังเป็น null เมื่อค่าเก่าเกินเกณฑ์ตามเดิม ห้ามเอาค่าในนี้ไปใส่แทน
       มีอีก 33 ไฟล์ที่อ่าน `tempC` ไปเทียบเกณฑ์ ปล่อยค่าเก่าไหลไปตรงนั้น
       เซนเซอร์ที่ตายแล้วจะขึ้น "อยู่ในเกณฑ์" เขียวทั้งแถบ (เคยเจอจริง 3 ต.ค. 2569)
       บล็อกนี้แยกไว้ให้ **หน้าจอ** หยิบไปแสดงคู่กับเวลาที่วัด ไม่ใช่ให้ตรรกะใช้ */
    held: {
      tempC: round1(val(inside, "temperature")),
      humidity: round1(val(inside, "humidity")),
      windSpeed: round1(val(inside, "airflow")),
      nh3: gasModuleSuspect(rawGases) ? null : rawGases.nh3,
      co2: gasModuleSuspect(rawGases) ? null : rawGases.co2,
      at: updatedAt,
    },
    sensorCount: { reporting: Object.keys(inside).length },
    electrical: toElectrical(inside),
  };

  return { ...barn, health: barnHealthScore(barn) };
}

/**
 * นับแจ้งเตือนจาก "ค่าที่วัดได้" เทียบกับ "เกณฑ์ที่ผู้ใช้ตั้งไว้"
 *
 * **ต้องคิดที่นี่เอง** เพราะ PlotNexus เป็นแค่ที่เก็บค่า ไม่มีเครื่องคิดแจ้งเตือนให้
 * (ของเดิมหลังบ้านเป็นคนคิด — ดู server/src/alerts/engine.js)
 * ใช้เกณฑ์ชุดเดียวกับที่หน้าจออื่นใช้ ตัวเลขบนหน้าจอจึงไม่ขัดกันเอง
 *
 * @returns {Array} รายการแจ้งเตือนรูปเดียวกับที่หลังบ้านเคยส่งมา (ให้ toUiAlert แปลงต่อ)
 */
export function buildAlerts(farm, barn, limits) {
  const out = [];
  const add = (code, metric, value, threshold, level, category) =>
    out.push({
      id: `pnx-${barn.id}-${code}`,
      barn_id: barn.apiId,
      farm_name: farm.name,
      barn_name: barn.name,
      code,
      metric,
      level,
      category,
      status: "open",
      opened_at: barn.updatedAt,
      params: { metric, value, threshold },
    });

  if (barn.status === "offline") {
    add("sensor_offline", "sensor", null, null, "critical", "sensor");
    return out;
  }

  const { tempMin, tempMax, humidityMax, nh3Limit } = limits ?? {};
  if (barn.tempC != null && tempMax != null && barn.tempC > tempMax) {
    add("temp_c_high", "temp_c", barn.tempC, tempMax, "warning", "climate");
  }
  if (barn.tempC != null && tempMin != null && barn.tempC < tempMin) {
    add("temp_c_low", "temp_c", barn.tempC, tempMin, "warning", "climate");
  }
  if (barn.humidity != null && humidityMax != null && barn.humidity > humidityMax) {
    add("humidity_high", "humidity", barn.humidity, humidityMax, "warning", "climate");
  }
  if (barn.nh3 != null && nh3Limit != null && barn.nh3 > nh3Limit) {
    add("nh3_high", "nh3", barn.nh3, nh3Limit, "critical", "air");
  }
  return out;
}

/**
 * แปลงคำตอบของ /api/latest หนึ่งชุด → { farm, barns, alerts }
 * @param {string} source รหัสชุดข้อมูล เช่น "pig"
 * @param {object} latest คำตอบจาก /api/latest
 * @param {object} limits เกณฑ์ของผู้ใช้จากหน้าตั้งค่า
 */
export function toFarmBundle(source, latest, limits) {
  const map = FARM_MAP[source];
  if (!map) return null;

  const bags = byLocation(latest);
  const outsideBag = bags[map.outdoor] ?? {};

  const barns = Object.entries(map.barns)
    .map(([locId, meta]) => {
      const inside = bags[locId];
      /* จุดติดตั้งที่ยังไม่เคยส่งค่าเลย — ข้ามไป ดีกว่าโชว์โรงเรือนที่ว่างทั้งใบ */
      if (!inside) return null;
      return toBarn(map.farm.id, locId, meta, inside, outsideBag);
    })
    .filter(Boolean);

  const alerts = barns.flatMap((b) => buildAlerts(map.farm, b, limits));
  const countByBarn = new Map();
  for (const a of alerts) countByBarn.set(a.barn_id, (countByBarn.get(a.barn_id) ?? 0) + 1);
  for (const b of barns) b.alerts = countByBarn.get(b.apiId) ?? 0;

  const live = barns.filter((b) => b.status !== "offline");
  const avg = (pick) => {
    const nums = live.map(pick).filter((n) => n != null);
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  };

  const farm = {
    ...map.farm,
    status: live.length === 0 ? "offline" : "good",
    pigs: null,
    barnCount: barns.length,
    alerts: alerts.length,
    tempC: round1(avg((b) => b.tempC)),
    humidity: round1(avg((b) => b.humidity)),
    fcr: null,
    updatedAt: latest?.["อัปเดตล่าสุด"] ?? null,
    dataSource: "live",
    apiId: source,
  };

  return { farm, barns, alerts };
}
