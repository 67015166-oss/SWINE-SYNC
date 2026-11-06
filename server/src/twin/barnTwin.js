/**
 * แบบจำลองของโรงเรือนหนึ่งหลัง — ต่อคณิตใน thermalModel.js เข้ากับข้อมูลจริง (T1.261)
 *
 * **ตัวขับ: แดดและอากาศนอกจาก Open-Meteo** (ผู้ใช้เลือก 17 ก.ย. 2569) เพราะเซนเซอร์นอกเล้า
 * ส่งค่าเดิมซ้ำ 98% ของข้อมูลทั้งหมด — ดู openMeteo.js และ maskStuck()
 *
 * **แบบจำลอง: กล่องเทาที่บังคับฟิสิกส์** (fitGreyBox) คาบ 15 นาที
 * ทางที่ลองแล้วไม่ใช้ (ข้อมูลจริง 17 ก.ย. 2569 · สอบกับช่วงที่แบบจำลองไม่เคยเห็น):
 *   ARX ไม่บังคับ คาบ 5 นาที      อัตราขยายจากอากาศนอกติดลบ · ทาย 3 ชม. ดีกว่าเดาคงที่แค่ 5–8%
 *   ARX ไม่บังคับ คาบ 15–60 นาที   ยังติดลบทุกแบบ จุดสมดุล 40–70°C ซึ่งเป็นไปไม่ได้
 *   ใส่ค่าไฟเป็นตัวแปร             +7°C/kW (เปิดพัดลมแล้วร้อนขึ้น) — เหตุกับผลสลับกัน
 *   กล่องเทา + แดด คาบ 15 นาที     ← ใช้ตัวนี้ ทาย 3 ชม. ±0.96°C ดีกว่าเดาคงที่ 50% ค่าทุกตัวอธิบายได้
 *
 * ผลที่ได้บอกบุคลิกของเล้าว่า: ดึงตัวเองกลับหาอุณหภูมิประจำ (~26.6°C) ภายในราวชั่วโมงครึ่ง
 * แดดเต็มที่ทำให้ร้อนขึ้นราว 3°C และ **ตรวจไม่พบผลเพิ่มจากอุณหภูมิอากาศเมื่อคิดผลของแดดแล้ว**
 * (อัตราขยายชนขอบล่าง 0) — สอดคล้องกับเล้าที่มีระบบทำความเย็นซึ่งร้อนขึ้นผ่านหลังคาเป็นหลัก
 *
 * ขั้นตอน:
 *   1. เฉลี่ยอุณหภูมิในเล้าเป็นช่อง 15 นาที (ช่องต้องมีค่าอย่างน้อยครึ่งหนึ่งของที่ควรมี)
 *   2. แบ่งตามเวลา: ช่วงเก่า 70% ของชั่วโมงไว้สอน · 30% ใหม่สุดไว้สอบ
 *      → **ความแม่นที่โชว์บนจอวัดจากช่วงที่ไม่เคยเห็น**
 *   3. สอนใหม่ด้วยข้อมูลทั้งหมดแล้วใช้งานตัวนั้น
 */
import { query } from "../db/pool.js";
import { segmentsOf, fitGreyBox, evaluate, simulate } from "./thermalModel.js";
import { hourlyWeather, weatherAt } from "./openMeteo.js";
import { residualTone } from "./decide.js";

export { residualTone };

const STEP_SEC = 15 * 60;
/** ทำนายล่วงหน้า 3 ชม. — ขอบเขตเดียวกับที่วัดความแม่น */
export const HORIZON_STEPS = (3 * 3600) / STEP_SEC;
/** ช่วงต่อเนื่องสั้นกว่า 3 ชม. ไม่เอามาสอน — สั้นกว่านี้ไม่เห็นการตอบสนองของเล้า */
const MIN_SEGMENT_STEPS = HORIZON_STEPS;
/** เซนเซอร์ในเล้าส่งทุก ~10 วินาที — ช่อง 15 นาทีต้องมีอย่างน้อยครึ่งหนึ่งถึงนับว่ามีข้อมูล */
const MIN_READINGS_PER_STEP = STEP_SEC / 10 / 2;
const MIN_TRAIN_HOURS = 24;
const MIN_TEST_HOURS = 6;
/** สอนใหม่ทุกชั่วโมง */
const MODEL_TTL_MS = 60 * 60 * 1000;
/** ค่าล่าสุดเก่ากว่านี้ถือว่าไม่สด */
const STALE_MIN = 20;
/** ค่าเดิมเป๊ะติดกัน 3 ชม. = เซนเซอร์ค้าง (ใช้ตรวจเซนเซอร์นอกเล้าเพื่อติดป้ายบนจอ) */
const STUCK_HOURS = 3;

/** ตัวแปรเสริมของแบบจำลอง: รังสีแดด kW/m² */
const sun = (row) => row.rad;

async function farmOf(barnId) {
  const { rows } = await query(
    `select f.lat, f.lng from barn b join farm f on f.id = b.farm_id where b.id = $1`,
    [barnId],
  );
  return rows[0] ?? null;
}

/** อุณหภูมิในเล้าช่อง 15 นาที + อากาศจาก Open-Meteo ตรงกลางช่อง */
async function loadRows(barnId, weather, since) {
  const { rows } = await query(
    `select extract(epoch from time_bucket('15 minutes', r.at))::bigint as t,
            avg(r.value) as tin, count(*) as n
       from sensor_reading r
       join device d on d.id = r.device_id
      where r.barn_id = $1 and r.metric = 'temp_c' and not d.outdoor
        and r.at > now() - $2::interval
      group by 1
      order by 1`,
    [barnId, since],
  );
  return rows.map((r) => {
    const t = Number(r.t);
    const w = weatherAt(weather, t + STEP_SEC / 2);
    return {
      t,
      tin: Number(r.n) >= MIN_READINGS_PER_STEP ? Number(r.tin) : null,
      tout: w.temp,
      rad: w.radiation,
    };
  });
}

const hoursOf = (segs) => (segs.reduce((n, s) => n + s.length, 0) * STEP_SEC) / 3600;

function splitByTime(segments) {
  const total = segments.reduce((n, s) => n + s.length, 0);
  let acc = 0;
  for (let i = 0; i < segments.length; i++) {
    acc += segments[i].length;
    if (acc >= total * 0.7) return [segments.slice(0, i + 1), segments.slice(i + 1)];
  }
  return [segments, []];
}

const pickScore = (e) => ({
  rmse: e.freeRunRmse,
  persistence: e.persistenceRmse,
  skill: e.skill,
  points: e.points,
});

const cache = new Map();
/** งานคำนวณที่กำลังวิ่งอยู่ — คำขอพร้อมกันหลายตัวรอผลเดียวกัน ไม่ต่างคนต่างคำนวณ (ใช้ CPU ~1 วินาที) */
const inflight = new Map();
/** ต่อ Open-Meteo ไม่ได้ → จำไว้ 5 นาที ไม่งั้นทุกคำขอต้องรอหมดเวลา 15 วินาทีซ้ำ ๆ */
const WEATHER_RETRY_MS = 5 * 60 * 1000;

/**
 * แบบจำลองของโรงเรือน (แคชชั่วโมงละครั้ง)
 * `reason` เป็นรหัส + ตัวเลข ให้หน้าเว็บประกอบประโยคเองผ่าน t()
 * @param {{now?:number, force?:boolean}} [opts] force = สอนใหม่แม้แคชยังไม่หมดอายุ (ตัวอุ่นเครื่องใช้)
 */
export async function barnModel(barnId, { now = Date.now(), force = false } = {}) {
  const hit = cache.get(barnId);
  if (!force && hit && now - hit.builtAt < (hit.ttl ?? MODEL_TTL_MS)) return hit.value;
  if (inflight.has(barnId)) return inflight.get(barnId);
  const job = buildModel(barnId, now).finally(() => inflight.delete(barnId));
  inflight.set(barnId, job);
  return job;
}

async function buildModel(barnId, now) {
  const farm = await farmOf(barnId);
  let value;
  if (!farm?.lat || !farm?.lng) {
    value = { model: null, accuracy: null, weather: null, reason: { code: "no_location" } };
  } else {
    let weather = null;
    try {
      weather = await hourlyWeather(farm.lat, farm.lng, { now });
    } catch {
      /* ต่ออินเทอร์เน็ตไม่ได้ ≠ แบบจำลองพัง — บอกสาเหตุจริง แล้วลองใหม่ในอีก 5 นาที
         ถ้ายังมีแบบจำลองเก่าที่เคยสอนได้ ใช้ตัวเก่าไปก่อน ดีกว่าหน้าจอว่างเพราะเน็ตสะดุด */
      const stale = cache.get(barnId);
      if (stale?.value?.model) {
        cache.set(barnId, { ...stale, builtAt: now, ttl: WEATHER_RETRY_MS });
        return stale.value;
      }
      const failed = { model: null, accuracy: null, weather: null, reason: { code: "weather_unavailable" } };
      cache.set(barnId, { builtAt: now, ttl: WEATHER_RETRY_MS, value: failed });
      return failed;
    }
    const rows = await loadRows(barnId, weather, "120 days");
    const segments = segmentsOf(rows, STEP_SEC).filter((s) => s.length >= MIN_SEGMENT_STEPS);
    const [train, test] = splitByTime(segments);

    if (hoursOf(train) < MIN_TRAIN_HOURS || hoursOf(test) < MIN_TEST_HOURS) {
      value = {
        model: null,
        accuracy: null,
        weather,
        reason: {
          code: "not_enough_data",
          have: Math.round(hoursOf(segments)),
          need: MIN_TRAIN_HOURS + MIN_TEST_HOURS,
        },
      };
    } else {
      const opts = { stepSec: STEP_SEC, extra: sun, maxLag: 4 };
      const holdout = fitGreyBox(train, opts);
      const live = fitGreyBox(segments, opts);
      if (!holdout || !live) {
        value = { model: null, accuracy: null, weather, reason: { code: "unstable" } };
      } else {
        value = {
          reason: null,
          weather,
          segments,
          model: {
            ...live,
            hoursUsed: hoursOf(segments),
            segmentsUsed: segments.length,
            dataFrom: segments[0][0].t,
            dataTo: segments.at(-1).at(-1).t,
            trainedAt: Math.floor(now / 1000),
          },
          accuracy: {
            trainHours: hoursOf(train),
            testHours: hoursOf(test),
            testFrom: test[0][0].t,
            h3: pickScore(evaluate(holdout, test, HORIZON_STEPS)),
            all: pickScore(evaluate(holdout, test)),
          },
        };
      }
    }
  }

  cache.set(barnId, { builtAt: now, value });
  return value;
}

/**
 * ทำนายล่วงหน้า 3 ชม. แบบเลื่อนหน้าต่าง — จุด i = แบบจำลองเริ่มจากค่าจริงเมื่อ 3 ชม. ก่อน
 * แล้ววิ่งเองมาถึง i โดยดูแค่อากาศ ตรงกับวิธีวัดความแม่น h3 ทุกประการ
 */
export function rollingForecast(model, segment, horizon = HORIZON_STEPS) {
  const out = [];
  for (let i = 0; i < segment.length; i++) {
    let twin = null;
    if (i >= horizon) {
      twin = simulate(model, segment.slice(i - horizon, i + 1)).at(-1).predicted;
    }
    out.push({ t: segment[i].t, actual: segment[i].tin, twin });
  }
  return out;
}

/** เซนเซอร์นอกเล้า "ค้าง" อยู่ไหม และค้างมานานแค่ไหน (ใช้ติดป้ายบนจอ) */
async function outdoorHealth(barnId, metric) {
  const { rows: last } = await query(
    `select r.value from sensor_reading r join device d on d.id = r.device_id
      where r.barn_id = $1 and d.outdoor and r.metric = $2
      order by r.at desc limit 1`,
    [barnId, metric],
  );
  if (!last[0]) return { metric, status: "nodata" };
  const { rows } = await query(
    `select max(r.at) filter (where r.value <> $3) as changed, min(r.at) as first
       from sensor_reading r join device d on d.id = r.device_id
      where r.barn_id = $1 and d.outdoor and r.metric = $2`,
    [barnId, metric, last[0].value],
  );
  const since = rows[0].changed ?? rows[0].first;
  const hours = (Date.now() - new Date(since).getTime()) / 3600000;
  return { metric, value: last[0].value, unchangedSince: since, unchangedHours: hours, stuck: hours >= STUCK_HOURS };
}

/**
 * เทียบของจริงตอนนี้กับที่แบบจำลองคาด — ใช้ทั้งหน้าเว็บและเครื่องคิดแจ้งเตือน (twinAlerts.js)
 * @returns {Promise<{model, accuracy, weather, reason, live}>}
 */
export async function twinLive(barnId) {
  const { model, accuracy, weather, reason } = await barnModel(barnId);
  if (!model) return { model, accuracy, weather, reason, live: { status: "nomodel" } };

  const recent = await loadRows(barnId, weather, "12 hours");
  const current = segmentsOf(recent, STEP_SEC).at(-1) ?? [];
  const last = current.at(-1);
  const ageMin = last ? (Date.now() / 1000 - (last.t + STEP_SEC)) / 60 : Infinity;
  const rmse3h = accuracy.h3.rmse;
  /* อากาศตอนนี้จาก Open-Meteo — บอกคู่กับแบบจำลองเพื่อให้เห็นว่าตัวขับเป็นเท่าไหร่ */
  const nowWeather = weatherAt(weather, Date.now() / 1000);

  let live;
  if (!last) {
    live = { status: "nodata" };
  } else if (ageMin > STALE_MIN) {
    live = { status: "stale", ageMin: Math.round(ageMin), at: last.t };
  } else if (current.length <= HORIZON_STEPS) {
    live = {
      status: "warming",
      at: last.t,
      readyInMin: Math.ceil(((HORIZON_STEPS + 1 - current.length) * STEP_SEC) / 60),
    };
  } else {
    const series = rollingForecast(model, current);
    const point = series.at(-1);
    const residual = point.actual - point.twin;
    live = {
      status: "ok",
      at: point.t,
      actual: point.actual,
      expected: point.twin,
      residual,
      tone: residualTone(residual, rmse3h),
      thresholds: { warn: 2 * rmse3h, serious: 3 * rmse3h },
      series,
    };
  }
  return { model, accuracy, weather, reason, live, weatherNow: nowWeather };
}

/** ภาพรวมที่หน้าเว็บต้องใช้ — แบบจำลอง + ความแม่น + เทียบของจริงตอนนี้ + สุขภาพเซนเซอร์นอกเล้า */
export async function barnTwin(barnId) {
  const { model, accuracy, reason, live, weatherNow } = await twinLive(barnId);
  const sensors = {
    outdoorTemp: await outdoorHealth(barnId, "temp_c"),
    outdoorHumidity: await outdoorHealth(barnId, "humidity"),
  };
  const base = {
    barnId,
    horizonMin: (HORIZON_STEPS * STEP_SEC) / 60,
    stepMin: STEP_SEC / 60,
    driver: "open-meteo",
    reason,
    sensors,
  };
  if (!model) return { ...base, model: null, accuracy: null, live };

  return {
    ...base,
    weatherNow,
    model: {
      tauMin: model.tauMin,
      lagMin: model.lagMin,
      gainOut: model.gainOut,
      sunEffect: model.sunEffect,
      setpoint: model.offset,
      atBound: model.atBound,
      hoursUsed: model.hoursUsed,
      segmentsUsed: model.segmentsUsed,
      dataFrom: model.dataFrom,
      dataTo: model.dataTo,
      trainedAt: model.trainedAt,
    },
    accuracy,
    live,
  };
}

/* ======================================================================
 * ชั้นที่ 3 — แบบจำลองที่ทดลองได้ (T1.262)
 *
 * หลังบ้านส่งแค่ "วัตถุดิบ" แล้วให้หน้าเว็บจำลองเอง ตัวเลื่อนจะได้ตอบทันทีโดยไม่ต้องยิงคำขอทุกครั้งที่ลาก
 *   · ค่าพารามิเตอร์ของแบบจำลองแบบดิบ (a, K, S, c) — ให้หน้าเว็บคำนวณได้ตรงกับหลังบ้านเป๊ะ
 *   · จุดเริ่ม = ค่าในเล้าล่าสุดที่วัดได้จริง
 *   · แดด/อากาศจาก Open-Meteo 24 ชม. ข้างหน้า ช่อง 15 นาที
 *   · วันที่ร้อนที่สุดในข้อมูลที่ใช้สอน (ค่าจริง + แดดของวันนั้น) ไว้เล่นซ้ำ
 * ==================================================================== */

/** ขอบฟ้าของการพยากรณ์ — ยาวกว่านี้ Open-Meteo เองก็เริ่มไม่แม่น และแบบจำลองไม่เคยถูกวัดผลไกลขนาดนั้น */
const SCENARIO_HOURS = 24;

/** @returns {Promise<object>} วัตถุดิบสำหรับจำลองสถานการณ์ หรือ { model: null, reason } */
export async function barnScenario(barnId, { now = Date.now() } = {}) {
  const { model, accuracy, weather, segments, reason } = await barnModel(barnId, { now });
  if (!model) return { barnId, model: null, reason };

  /* จุดเริ่ม: ค่าในเล้าล่าสุด (ถ้าเก่าเกินก็ยังใช้ได้ แต่บอกอายุให้หน้าเว็บเตือน) */
  const recent = await loadRows(barnId, weather, "12 hours");
  const lastReal = [...recent].reverse().find((r) => Number.isFinite(r.tin)) ?? null;

  const startT = Math.floor(now / 1000 / STEP_SEC) * STEP_SEC;
  const forecast = [];
  for (let k = 0; k <= (SCENARIO_HOURS * 3600) / STEP_SEC; k++) {
    const t = startT + k * STEP_SEC;
    const w = weatherAt(weather, t + STEP_SEC / 2);
    if (w.temp == null || w.radiation == null) break;
    forecast.push({ t, tout: w.temp, rad: w.radiation });
  }

  /* วันที่ร้อนที่สุด = ช่วงต่อเนื่องที่มีค่าในเล้าสูงสุด */
  let hottest = null;
  for (const seg of segments ?? []) {
    const peak = Math.max(...seg.map((r) => r.tin));
    if (!hottest || peak > hottest.peak) hottest = { peak, seg };
  }

  return {
    barnId,
    reason: null,
    stepMin: STEP_SEC / 60,
    horizonHours: SCENARIO_HOURS,
    model: {
      a: model.a,
      gainOut: model.gainOut,
      sunEffect: model.sunEffect,
      setpoint: model.offset,
      lag: model.lag,
      tauMin: model.tauMin,
      atBound: model.atBound,
    },
    accuracy: { h3: accuracy.h3.rmse, all: accuracy.all.rmse, testHours: accuracy.testHours },
    start: lastReal
      ? { t: lastReal.t, actual: lastReal.tin, ageMin: Math.max(0, Math.round((now / 1000 - (lastReal.t + STEP_SEC)) / 60)) }
      : null,
    forecast,
    hottest: hottest
      ? {
        peak: hottest.peak,
        series: hottest.seg.map((r) => ({ t: r.t, actual: r.tin, tout: r.tout, rad: r.rad })),
      }
      : null,
  };
}

/* ======================================================================
 * อุ่นเครื่อง (T1.264) — สอนแบบจำลองไว้ล่วงหน้าตอนบูตและทุก 50 นาที
 * ไม่งั้นคนแรกของแต่ละชั่วโมงต้องรอ ~3.5 วินาที (ดึง Open-Meteo + ค้นหาค่า)
 * ==================================================================== */
const WARM_EVERY_MS = 50 * 60 * 1000;

/** โรงเรือนที่มีเซนเซอร์ในเล้าส่งค่าอยู่ — ไม่มีเซนเซอร์ก็ไม่มีอะไรให้สอน */
export async function twinBarnIds() {
  const { rows } = await query(
    `select distinct d.barn_id as id
       from device d join barn b on b.id = d.barn_id
      where d.kind = 'sensor' and d.active and b.active and not d.outdoor`,
  );
  return rows.map((r) => r.id);
}

/** @param {{info:Function, warn:Function}} log */
export function startTwinWarmer(log) {
  const warm = async () => {
    try {
      for (const id of await twinBarnIds()) await barnModel(id, { force: true });
    } catch (err) {
      log.warn({ err: err.message }, "อุ่นแบบจำลองโรงเรือนไม่สำเร็จ — คำขอถัดไปจะสอนเอง");
    }
  };
  /* เลื่อนไป 5 วินาทีหลังบูต ให้ migration กับการต่อฐานเสร็จก่อน */
  setTimeout(warm, 5_000).unref();
  setInterval(warm, WARM_EVERY_MS).unref();
}

