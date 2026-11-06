/**
 * ตัวจำลองเซนเซอร์ — ป้อนค่าสมมติเข้าฐานเหมือนเซนเซอร์จริงส่งมา
 *
 * **มีไว้ทำไม**
 *   1. ตอนเซนเซอร์จริงเงียบ (เกิดจริงมาแล้ว 20 ชั่วโมงเมื่อ 27 ส.ค. 2569)
 *      ยังมีข้อมูลไหลให้ทดสอบกราฟ · เครื่องคิดแจ้งเตือน · ชั้นสรุปรายชั่วโมง/รายวัน
 *   2. ทดสอบทางเดินข้อมูลทั้งเส้นโดยไม่ต้องรอฮาร์ดแวร์
 *
 * **กติกาที่ห้ามละเมิด — เขียนลงฟาร์มของตัวเองเท่านั้น**
 * ห้ามเขียนทับโรงเรือนของฟาร์มจริงเด็ดขาด ไม่ว่าเซนเซอร์ตัวนั้นจะตายอยู่หรือไม่
 * เพราะจะกลายเป็นตัวเลขที่ดูน่าเชื่อแต่ไม่มีใครวัด — ปัญหาเดียวกับที่ไล่แก้มาทั้งโปรเจกต์
 * (ดู `gasesFor` ใน src/data/mock/airQuality.js และ T1.159)
 *
 * ฟาร์มของตัวจำลองตั้ง `data_source = 'demo'` หน้าจอจึงติดป้าย "ข้อมูลตัวอย่าง" ให้เอง
 *
 * เปิดใช้: `docker compose --profile sim up -d sim`
 * ปิด: `docker compose stop sim` (ข้อมูลที่เขียนไว้ยังอยู่ ลบด้วย SQL ท้ายไฟล์นี้)
 */
import { pool, query, withTransaction } from "../db/pool.js";
import { log } from "../lib/log.js";
import { runAlertPass } from "../alerts/engine.js";

const INTERVAL_MS = Number(process.env.SIM_INTERVAL_SEC || 30) * 1000;
const FARM_CODE = "F-SIM";

/** โรงเรือนจำลอง — คนละรหัสกับฟาร์มจริงเสมอ */
const BARNS = [
  { code: "S1", name: "โรงเรือนจำลอง 1", stage: "ขุน" },
  { code: "S2", name: "โรงเรือนจำลอง 2", stage: "อนุบาล" },
];

/** อุปกรณ์ต่อหนึ่งโรงเรือน — ครบทุกชนิดที่หน้าจอรู้จัก จะได้ทดสอบได้ทุกการ์ด */
const DEVICES = [
  { code: "SIM-IN-A", kind: "sensor", zone: "A", outdoor: false },
  { code: "SIM-IN-B", kind: "sensor", zone: "B", outdoor: false },
  { code: "SIM-OUT", kind: "sensor", zone: null, outdoor: true },
  { code: "SIM-METER", kind: "power_meter", zone: null, outdoor: false },
];

/* ค่ากลางของแต่ละ metric — แกว่งรอบค่านี้ตามเวลาของวัน ไม่ใช่สุ่มไร้ทิศทาง */
const BASE = {
  temp_c: 27.5,
  humidity: 72,
  wind_ms: 1.4,
  nh3: 9,
  co2: 900,
};

const round1 = (n) => Number(n.toFixed(1));

/** รูปคลื่นของวัน — เที่ยงร้อนสุด ตีสี่เย็นสุด (ค่าอยู่ระหว่าง -1 ถึง 1) */
const dayShape = (hour) => Math.sin(((hour - 9) / 24) * 2 * Math.PI);

/** สร้างฟาร์ม/โรงเรือน/อุปกรณ์ของตัวจำลองถ้ายังไม่มี — รันซ้ำได้ไม่เกิดของซ้ำ */
async function ensureWorld() {
  return withTransaction(async (c) => {
    const { rows: [company] } = await c.query(`select id from company order by created_at limit 1`);
    if (!company) throw new Error("ยังไม่มีบริษัทในฐาน — รัน seed ก่อน");

    const { rows: [farm] } = await c.query(
      `insert into farm (company_id, code, name, province, lat, lng, data_source)
       values ($1, $2, 'ฟาร์มจำลอง (ทดสอบระบบ)', 'นครปฐม', 13.8199, 100.0620, 'demo')
       on conflict (code) do update set data_source = 'demo'
       returning id`,
      [company.id, FARM_CODE],
    );

    const barnIds = [];
    for (const b of BARNS) {
      const { rows: [barn] } = await c.query(
        `insert into barn (farm_id, code, name, stage, data_source)
         values ($1, $2, $3, $4, 'demo')
         on conflict (farm_id, code) do update set name = excluded.name
         returning id`,
        [farm.id, b.code, b.name, b.stage],
      );
      const devices = [];
      for (const d of DEVICES) {
        const { rows: [dev] } = await c.query(
          `insert into device (barn_id, kind, code, zone, outdoor, duty)
           values ($1, $2, $3, $4, $5, 'ตัวจำลองเซนเซอร์')
           on conflict (barn_id, code) do update set zone = excluded.zone
           returning id`,
          [barn.id, d.kind, `${b.code}-${d.code}`, d.zone, d.outdoor],
        );
        devices.push({ ...d, id: dev.id });
      }
      barnIds.push({ id: barn.id, code: b.code, devices });
    }
    return barnIds;
  });
}

/** ค่าหนึ่งชุดของอุปกรณ์หนึ่งตัว ณ เวลาหนึ่ง */
function readingsFor(device, at, seed) {
  const wave = dayShape(at.getHours() + at.getMinutes() / 60);
  const jitter = (span) => (Math.random() - 0.5) * span;
  /* โรงเรือนคนละหลังต้องไม่เหมือนกันเป๊ะ — ไม่งั้นกราฟเทียบสองหลังจะทับกันสนิท */
  const bias = seed * 0.6;

  if (device.kind === "power_meter") return [];

  if (device.outdoor) {
    /* ข้างนอกแกว่งกว้างกว่าข้างในเสมอ กลางวันร้อนกว่า กลางคืนเย็นกว่า */
    return [
      { metric: "temp_c", value: round1(BASE.temp_c + wave * 5.5 + bias + jitter(0.6)) },
      { metric: "humidity", value: Math.round(BASE.humidity - wave * 14 + jitter(3)) },
    ];
  }

  const temp = round1(BASE.temp_c + wave * 2.2 + bias + jitter(0.4));
  return [
    { metric: "temp_c", value: temp },
    { metric: "humidity", value: Math.round(BASE.humidity - wave * 6 + jitter(2)) },
    { metric: "wind_ms", value: round1(Math.max(0, BASE.wind_ms + jitter(0.5))) },
    /* NH₃ กับ CO₂ วัดที่โซน B จุดเดียว เหมือนผังของฟาร์มจริง */
    ...(device.zone === "B"
      ? [
          { metric: "nh3", value: round1(Math.max(0.5, BASE.nh3 + wave * 2 + jitter(1.5))) },
          { metric: "co2", value: Math.round(BASE.co2 + wave * 180 + jitter(80)) },
        ]
      : []),
  ];
}

/** ค่ามิเตอร์ไฟหนึ่งชุด — สามเฟสไม่เท่ากันเป๊ะเหมือนของจริง */
function powerFor(at) {
  const wave = dayShape(at.getHours());
  const jitter = (span) => (Math.random() - 0.5) * span;
  const base = 5.6 + wave * 1.8;
  return {
    voltage: round1(228 + jitter(4)),
    current_a: round1(Math.max(0.2, base + jitter(0.5))),
    current_b: round1(Math.max(0.2, base - 0.2 + jitter(0.5))),
    current_c: round1(Math.max(0.2, base + 0.9 + jitter(0.5))),
    frequency: round1(50 + jitter(0.1)),
    power_kw: round1(Math.max(0.1, 3.4 + wave * 1.1 + jitter(0.2))),
  };
}

async function tick(world) {
  const at = new Date();
  const rows = [];
  const power = [];

  world.forEach((barn, i) => {
    for (const device of barn.devices) {
      if (device.kind === "power_meter") {
        power.push({ at, barn_id: barn.id, device_id: device.id, ...powerFor(at) });
        continue;
      }
      for (const r of readingsFor(device, at, i)) {
        rows.push([at, barn.id, device.id, r.metric, r.value]);
      }
    }
  });

  if (rows.length > 0) {
    const values = rows.map((_, n) => {
      const b = n * 5;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`;
    });
    await query(
      `insert into sensor_reading (at, barn_id, device_id, metric, value)
       values ${values.join(", ")} on conflict do nothing`,
      rows.flat(),
    );
  }

  for (const p of power) {
    await query(
      `insert into power_reading (at, barn_id, device_id, voltage, current_a, current_b, current_c, frequency, power_kw)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict do nothing`,
      [p.at, p.barn_id, p.device_id, p.voltage, p.current_a, p.current_b, p.current_c, p.frequency, p.power_kw],
    );
  }

  return { sensor: rows.length, power: power.length };
}

async function main() {
  const world = await ensureWorld();
  log.info({ ฟาร์ม: FARM_CODE, โรงเรือน: world.length, ทุกกี่วินาที: INTERVAL_MS / 1000 },
    "ตัวจำลองเซนเซอร์เริ่มทำงาน");

  const loop = async () => {
    try {
      const n = await tick(world);
      /* เรียกเครื่องคิดแจ้งเตือนด้วย เพื่อให้ทดสอบได้ทั้งเส้นเหมือนสะพานข้อมูลจริง */
      await runAlertPass();
      log.info({ เขียนเซนเซอร์: n.sensor, เขียนมิเตอร์: n.power }, "ตัวจำลองเขียนค่าแล้ว");
    } catch (err) {
      log.error({ err }, "ตัวจำลองเขียนค่าไม่สำเร็จ");
    }
  };

  await loop();
  setInterval(loop, INTERVAL_MS);
}

main().catch((err) => {
  log.error({ err }, "ตัวจำลองเริ่มไม่สำเร็จ");
  pool.end();
  process.exit(1);
});

/* ลบข้อมูลของตัวจำลองทิ้งทั้งหมด (รันด้วยมือเมื่อไม่ต้องการแล้ว):
     delete from sensor_reading where barn_id in
       (select b.id from barn b join farm f on f.id = b.farm_id where f.code = 'F-SIM');
     delete from power_reading  where barn_id in
       (select b.id from barn b join farm f on f.id = b.farm_id where f.code = 'F-SIM');
     delete from device where barn_id in
       (select b.id from barn b join farm f on f.id = b.farm_id where f.code = 'F-SIM');
     delete from barn where farm_id = (select id from farm where code = 'F-SIM');
     delete from farm where code = 'F-SIM';
*/
