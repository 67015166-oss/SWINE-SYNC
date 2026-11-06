/**
 * รายงานส่งเวรของโรงเรือนหนึ่งในช่วงเวลาหนึ่ง (T1.268) — ส่วนดึงข้อมูล
 *
 * v1 (18 ก.ย. 2569) ข้อมูลเครื่อง: สภาพแวดล้อม · เหตุ · งานค้าง · ไฟ · การรับเวร
 * v2 (T1.269) + บันทึกของคน (ให้ยา · ตาย · ย้าย) จากตาราง barn_log
 * — บันทึกที่ยังค้างในเครื่องของใครสักคน (ยังไม่กดย้ายขึ้นฐาน) จะไม่อยู่ในรายงาน หน้าจอต้องบอกข้อนี้
 *
 * อ่านจากตารางดิบพร้อม join `device` เพื่อแยกในเล้า/นอกเล้า — **ห้ามใช้ sensor_hourly**
 * (ปนสองฝั่งกัน ดูคอมเมนต์ใน modules/readings/route.js)
 */
import { query } from "../db/pool.js";
import { BUCKET_MIN, coverageOf, kwhUsed, minutesOutside, splitAlerts } from "./shiftCalc.js";

/** ค่าในเล้าที่ใส่ในรายงาน — ตัวที่ไม่มีข้อมูลในกะนั้นจะไม่ขึ้นเอง */
const METRICS = ["temp_c", "humidity", "nh3", "wind_ms"];

const DAY_MS = 24 * 60 * 60 * 1000;

/** เกณฑ์ระดับระบบที่เครื่องคิดแจ้งเตือนใช้จริง — ตัวเดียวกับ GET /api/alerts/rules */
async function globalLimits() {
  const { rows } = await query(
    `select metric, threshold_min, threshold_max from alert_rule
      where scope = 'global' and enabled`,
  );
  const limits = {};
  for (const r of rows) limits[r.metric] = { min: r.threshold_min, max: r.threshold_max };
  return limits;
}

async function climate(barnId, from, to) {
  const range = [barnId, new Date(from), new Date(to), METRICS];

  /* สูงสุด/ต่ำสุด **พร้อมเวลาที่เกิด** จากค่าดิบ — ค่าเฉลี่ยรายช่องจะกดยอดจริงลง */
  const { rows: stats } = await query(
    `select sr.metric,
            min(sr.value) as min, max(sr.value) as max, avg(sr.value) as avg, count(*)::int as n,
            (array_agg(sr.at order by sr.value asc,  sr.at))[1] as min_at,
            (array_agg(sr.at order by sr.value desc, sr.at))[1] as max_at
       from sensor_reading sr
       join device d on d.id = sr.device_id and not d.outdoor
      where sr.barn_id = $1 and sr.at >= $2 and sr.at < $3 and sr.metric = any($4::text[])
      group by sr.metric`,
    range,
  );

  const { rows: buckets } = await query(
    `select time_bucket('${BUCKET_MIN} minutes', sr.at) as t, sr.metric, avg(sr.value) as avg
       from sensor_reading sr
       join device d on d.id = sr.device_id and not d.outdoor
      where sr.barn_id = $1 and sr.at >= $2 and sr.at < $3 and sr.metric = any($4::text[])
      group by 1, 2
      order by 1`,
    range,
  );

  return { stats, buckets };
}

async function alertsTouching(barnId, from, to) {
  /* ทุกใบที่ "มีชีวิต" อยู่ช่วงใดช่วงหนึ่งของกะ — เปิดก่อนจบกะ และยังไม่ปิดก่อนต้นกะ */
  const { rows } = await query(
    `select a.id, a.category, a.level, a.code, a.params, a.metric, a.value, a.threshold_used,
            a.opened_at, a.status, a.acked_at, a.resolved_at, a.auto_resolved,
            ua.display_name as acked_by_name, ur.display_name as resolved_by_name
       from alert a
       left join app_user ua on ua.id = a.acked_by
       left join app_user ur on ur.id = a.resolved_by
      where a.barn_id = $1 and a.opened_at < $3
        and (a.resolved_at is null or a.resolved_at >= $2)
      order by a.opened_at`,
    [barnId, new Date(from), new Date(to)],
  );
  return rows;
}

async function energy(barnId, from, to) {
  const window = async (a, b) => {
    const { rows: [r] } = await query(
      `select min(kwh_total) as first, max(kwh_total) as last, min(at) as from_at, max(at) as to_at
         from power_reading
        where barn_id = $1 and at >= $2 and at < $3 and kwh_total is not null`,
      [barnId, new Date(a), new Date(b)],
    );
    return {
      kwh: kwhUsed(r?.first, r?.last),
      /* ช่วงที่มิเตอร์มีค่าจริง — ถ้าสั้นกว่ากะ ตัวเลขไฟจะต่ำกว่าที่ใช้จริง หน้าจอต้องบอก */
      fromAt: r?.from_at ?? null,
      toAt: r?.to_at ?? null,
    };
  };
  const [now, yesterday] = await Promise.all([
    window(from, to),
    window(from - DAY_MS, to - DAY_MS),
  ]);
  return { ...now, yesterday };
}

/**
 * บันทึกของคนในกะ (T1.269) — ตาราง barn_log ใช้รหัสแบบหน้าเว็บ ("F-KPP-A1")
 * รหัสนั้นประกอบจาก farm.code + barn.code (ดู plotnexusFarms.js) จึงจับคู่ได้ตรงตัว
 * ไม่มีรหัสฟาร์ม = จับคู่ไม่ได้ คืน null (หน้าจอบอกว่า "ไม่รู้" ไม่ใช่ "ไม่มีใครบันทึก")
 */
async function recordsOf(barn, from, to) {
  if (!barn.farm_code || !barn.code) return null;
  const { rows } = await query(
    `select id, type, amount, unit, note, by_name as "by", at
       from barn_log
      where barn_key = $1 and deleted_at is null and at >= $2 and at < $3
      order by at`,
    [`${barn.farm_code}-${barn.code}`, new Date(from), new Date(to)],
  );
  return rows;
}

async function handoverOf(barnId, from, to) {
  const { rows } = await query(
    `select h.received_at, h.note, u.display_name as received_by_name
       from shift_handover h
       join app_user u on u.id = h.received_by
      where h.barn_id = $1 and h.period_from = $2 and h.period_to = $3`,
    [barnId, new Date(from), new Date(to)],
  );
  return rows[0] ?? null;
}

/**
 * @param {{id: string, code: string, name: string, farm_name: string}} barn
 * @param {number} from ต้นกะ (ms)
 * @param {number} to   ท้ายกะ (ms)
 * @param {number} now  เวลาปัจจุบัน (ms) — กะที่ยังไม่จบนับความครบถึงตอนนี้ ไม่ใช่ถึงท้ายกะ
 */
export async function buildShiftReport(barn, from, to, now = Date.now()) {
  const ended = to <= now;
  const until = Math.min(to, now);

  const [limits, clim, alerts, power, handover, records] = await Promise.all([
    globalLimits(),
    climate(barn.id, from, to),
    alertsTouching(barn.id, from, to),
    energy(barn.id, from, until),
    handoverOf(barn.id, from, to),
    recordsOf(barn, from, to),
  ]);

  const byMetric = new Map();
  for (const b of clim.buckets) {
    if (!byMetric.has(b.metric)) byMetric.set(b.metric, []);
    byMetric.get(b.metric).push({ t: new Date(b.t).getTime(), avg: b.avg });
  }

  const metrics = clim.stats
    .sort((a, b) => METRICS.indexOf(a.metric) - METRICS.indexOf(b.metric))
    .map((s) => {
      const series = byMetric.get(s.metric) ?? [];
      const lim = limits[s.metric] ?? null;
      return {
        metric: s.metric,
        min: s.min,
        minAt: s.min_at,
        max: s.max,
        maxAt: s.max_at,
        avg: s.avg,
        n: s.n,
        limits: lim,
        outside: lim ? minutesOutside(series, lim) : null,
        series: series.map((p) => ({ t: p.t, v: p.avg })),
      };
    });

  /* ความครบนับจากช่องที่มีค่าในเล้า**ตัวใดก็ได้** — เซนเซอร์ตัวเดียวกันส่งทุกค่าพร้อมกันอยู่แล้ว */
  const coverage = coverageOf(
    [...new Set(clim.buckets.map((b) => new Date(b.t).getTime()))],
    from,
    until,
  );

  const { during, pending } = splitAlerts(alerts, from, until);

  return {
    barn: { id: barn.id, code: barn.code, name: barn.name, farmName: barn.farm_name, farmCode: barn.farm_code ?? null },
    period: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), ended },
    generatedAt: new Date(now).toISOString(),
    bucketMin: BUCKET_MIN,
    coverage: {
      ...coverage,
      gaps: coverage.gaps.map((g) => ({
        from: new Date(g.from).toISOString(),
        to: new Date(g.to).toISOString(),
        minutes: g.minutes,
      })),
    },
    metrics,
    alerts: { during, pending },
    energy: power,
    records,
    handover,
  };
}
