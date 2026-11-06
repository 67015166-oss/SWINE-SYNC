/**
 * ข้อมูลของ "สรุปฟาร์มประจำวัน" ที่ส่งเข้า LINE (T1.275)
 *
 * สรุป **วันที่ผ่านมาเต็มวัน** ตามเวลาไทย ไม่ใช่ย้อนหลัง 24 ชม. เพราะคนอ่านตอนเช้า
 * เข้าใจว่า "เมื่อวาน" ไม่ใช่ "ตั้งแต่เช้าวานถึงเช้านี้"
 *
 * อ่านจากตารางดิบพร้อม join `device` เพื่อเอาเฉพาะเซนเซอร์ในเล้า — **ห้ามใช้ sensor_hourly**
 * (ปนค่าในเล้ากับนอกเล้า ดูเหตุผลใน modules/readings/route.js)
 */
import { query } from "../db/pool.js";
import { ageText, coverageOf, BUCKET_MIN } from "../reports/shiftCalc.js";
import { thaiDate } from "./flex.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** ต้นวันตามเวลาไทยของวันที่ที่ครอบเวลา `at` อยู่ (คืนค่าเป็น Date ในเวลา UTC จริง) */
export function bangkokStartOfDay(at) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(at);
  /* ไทยคือ UTC+7 ตลอดปี ไม่มีเวลาออมแสง จึงลบตรง ๆ ได้ */
  return new Date(`${parts}T00:00:00+07:00`);
}

/**
 * ประกอบข้อมูลสรุปของช่วงเวลาหนึ่ง
 * @param {Date} from ต้นช่วง
 * @param {Date} to ท้ายช่วง
 * @returns ข้อมูลสำหรับ dailyFlex()
 */
export async function buildSummary(from, to, now = new Date()) {
  const range = [from, to];

  const [{ rows: barns }, { rows: stats }, { rows: buckets }, { rows: alerts }, { rows: last }] = await Promise.all([
    query(`select b.id, b.name as barn_name, f.name as farm_name
             from barn b join farm f on f.id = b.farm_id
            where b.active order by f.name, b.name`),
    query(
      `select sr.barn_id, sr.metric, avg(sr.value) as avg, max(sr.value) as max, min(sr.value) as min
         from sensor_reading sr
         join device d on d.id = sr.device_id and not d.outdoor
        where sr.at >= $1 and sr.at < $2 and sr.metric in ('temp_c','humidity')
        group by 1, 2`,
      range,
    ),
    query(
      `select sr.barn_id, time_bucket('${BUCKET_MIN} minutes', sr.at) as t
         from sensor_reading sr
         join device d on d.id = sr.device_id and not d.outdoor
        where sr.at >= $1 and sr.at < $2 and sr.metric = 'temp_c'
        group by 1, 2`,
      range,
    ),
    query(
      `select barn_id, level, code from alert where status <> 'resolved'`,
    ),
    /* ★ ค่าล่าสุดที่เคยได้รับ **ไม่จำกัดช่วงเวลา** (T1.302)
       ตั้งใจไม่ใส่ `where at < $2` — คำถามคือ "ครั้งสุดท้ายที่ได้ยินจากเล้าคือเมื่อไร"
       ซึ่งเป็นคำถามของตอนนี้ ไม่ใช่ของเมื่อวาน ถ้าจำกัดช่วงจะได้คำตอบที่เก่าเท่าช่วงเสมอ
       และการ์ดจะบอกไม่ได้ว่าเงียบมากี่วันแล้ว */
    query(
      `select max(sr.at) as at
         from sensor_reading sr
         join device d on d.id = sr.device_id and not d.outdoor`,
    ),
  ]);

  const statOf = new Map();
  for (const s of stats) {
    if (!statOf.has(s.barn_id)) statOf.set(s.barn_id, {});
    statOf.get(s.barn_id)[s.metric] = s;
  }

  const bucketsOf = new Map();
  for (const b of buckets) {
    if (!bucketsOf.has(b.barn_id)) bucketsOf.set(b.barn_id, []);
    bucketsOf.get(b.barn_id).push(new Date(b.t).getTime());
  }

  const alertsOf = new Map();
  for (const a of alerts) {
    if (!alertsOf.has(a.barn_id)) alertsOf.set(a.barn_id, []);
    alertsOf.get(a.barn_id).push(a);
  }

  const rows = barns.map((b) => {
    const s = statOf.get(b.id) ?? {};
    const open = alertsOf.get(b.id) ?? [];
    const cover = coverageOf(bucketsOf.get(b.id) ?? [], from.getTime(), to.getTime());
    return {
      barnId: b.id,
      farmName: b.farm_name,
      barnName: b.barn_name,
      tempAvg: s.temp_c ? Number(s.temp_c.avg) : null,
      tempMax: s.temp_c ? Number(s.temp_c.max) : null,
      tempMin: s.temp_c ? Number(s.temp_c.min) : null,
      humidityAvg: s.humidity ? Number(s.humidity.avg) : null,
      coveragePct: cover.ratio * 100,
      openAlerts: open.length,
    };
  });

  /* เรียงให้โรงเรือนที่มีปัญหาขึ้นก่อน — การ์ดในไลน์แสดงได้ไม่กี่หลัง
     ถ้าเรียงตามชื่อ หลังที่มีเหตุอาจตกไปอยู่ในคำว่า "และอีก N หลัง" */
  rows.sort((a, b) => b.openAlerts - a.openAlerts || a.coveragePct - b.coveragePct);

  const sensorIssues = alerts.filter((a) => a.code === "sensor_silent" || a.code === "sensor_stuck").length;

  /* ★ ใบที่ "ตรวจซ้ำไม่ได้" ต้องไม่ถูกนับรวมกับใบที่เพิ่งตรวจมา (T1.306)
     เครื่องคิดแจ้งเตือนจงใจไม่เอาค่าค้างมาตัดสิน (ดู alerts/engine.js — เงียบอยู่ก็ข้ามการเทียบเกณฑ์)
     ผลคือใบที่เปิดไว้ก่อนเซนเซอร์เงียบจะ**ค้างเปิดตลอดกาล** ปิดเองไม่ได้เพราะไม่มีค่ามาพิสูจน์ว่าหายแล้ว
     ของจริง 3 ต.ค. 2569: ใบ `humidity_high` เปิดค้างมาตั้งแต่ 18 ก.ย. **15 วัน**
     แล้วการ์ดรายงานว่า "เหตุที่ยังไม่ปิด 2 รายการ" ซึ่งอ่านว่าตอนนี้เล้ายังชื้นเกิน — ทั้งที่เราไม่รู้
     โรงเรือนที่ไม่มีค่าเข้ามาเลยทั้งวัน = ใบของมันไม่ได้ถูกตรวจเลยทั้งวัน (ยกเว้นใบ "เซนเซอร์เงียบ" เอง
     ซึ่งเป็นเรื่องของการไม่มีค่า จึงยังจริงอยู่) */
  const silentBarns = new Set(
    rows.filter((r) => (bucketsOf.get(r.barnId) ?? []).length === 0).map((r) => r.barnId),
  );
  const unverifiedAlerts = alerts.filter(
    (a) => a.code !== "sensor_silent" && silentBarns.has(a.barn_id),
  ).length;

  /* ★ "ไม่มีข้อมูล" เฉย ๆ บอกไม่ได้ว่าเป็นวันแรกที่เงียบหรือเงียบมาสัปดาห์หนึ่งแล้ว (T1.302)
     คนอ่านสรุปตอนเช้าเห็นคำเดียวกันทุกวันจนชิน — ตัวเลขอายุคือสิ่งที่ทำให้รู้ว่าต้องลุก */
  const lastDataAt = last[0]?.at ? new Date(last[0].at) : null;
  const staleMin = lastDataAt ? (now.getTime() - lastDataAt.getTime()) / 60000 : null;

  return {
    from, to,
    lastDataAt,
    lastDataAgeText: staleMin == null ? null : ageText(staleMin),
    dateLabel: thaiDate(from),
    periodLabel: to.getTime() - from.getTime() <= DAY_MS + 1 ? "สรุปทั้งวัน" : "สรุปช่วง",
    barns: rows,
    totals: {
      barns: barns.length,
      barnsWithData: rows.filter((r) => r.tempAvg != null).length,
      openAlerts: alerts.length,
      criticalAlerts: alerts.filter((a) => a.level === "critical").length,
      sensorIssues,
      unverifiedAlerts,
    },
  };
}

/** สรุปของ "เมื่อวาน" ตามเวลาไทย */
export function yesterdayRange(now = new Date()) {
  const today = bangkokStartOfDay(now);
  return { from: new Date(today.getTime() - DAY_MS), to: today };
}
