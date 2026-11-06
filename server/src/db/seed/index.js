/**
 * ยัดข้อมูลตั้งต้น — ฟาร์มกำแพงเพชร (ฟาร์มเดียวที่มีเซนเซอร์จริง) + ตารางแปลงชื่อ field
 *
 * รันซ้ำได้ไม่พัง (upsert ทั้งหมด) — `docker compose exec api npm run seed`
 *
 * ฟาร์มตัวอย่างอีก 5 ฟาร์มยัง **ไม่ได้** ยัดลงฐาน — หน้าเว็บใช้ mock เดิมไปก่อน
 * แล้วติดป้าย "ข้อมูลตัวอย่าง" ให้ชัด (ตกลงกับผู้ใช้ 24 ส.ค. 2026)
 */
import { pool, withTransaction } from "../pool.js";
import { log } from "../../lib/log.js";

/* ---------- อุปกรณ์ในโรงเรือนจริง ----------
 * sensor01/02/03 = 3 โซนในโรงเรือนเดียวกัน (ผู้ใช้ยืนยัน แต่มาร์กไว้ว่ายังไม่ 100%)
 * ลมไหลจากหน้าโรงเรือน (โซน A) ไปออกท้าย (โซน D) ตามที่ SensorMap อธิบายไว้
 */
const DEVICES = [
  { code: "SENSOR-A", kind: "sensor", zone: "A", outdoor: false, note: "MQTT sensor01/farm/swine/cpf" },
  { code: "SENSOR-B", kind: "sensor", zone: "B", outdoor: false, note: "MQTT sensor02/farm/swine/cpf" },
  { code: "SENSOR-C", kind: "sensor", zone: "C", outdoor: false, note: "MQTT sensor03/farm/swine/cpf" },
  { code: "SENSOR-OUT", kind: "sensor", zone: null, outdoor: true, note: "MQTT sensor/outside01/farm/swine/cpf" },
  { code: "METER-1", kind: "power_meter", zone: null, outdoor: false, note: "MQTT sensor/power1/farm/swine/cpf" },
];

/* ---------- ตารางแปลง: ชื่อ field ใน InfluxDB → อุปกรณ์ + metric ----------
 *
 * ช่วง plausible คือ "ค่าที่เป็นไปได้จริงในโรงเรือนหมูที่ประเทศไทย"
 * หลุดช่วงนี้ = ถือว่าไม่มีค่า ไม่ใช่เขียน 0 ลงไป
 *
 * ทำไมอุณหภูมิเริ่มที่ 5 °C ไม่ใช่ 0 — อุปกรณ์ที่อ่าน RS485 ไม่ได้จะคืน 0 มา
 * ซึ่งแยกจาก "หนาว 0 องศา" ไม่ออก แต่โรงเรือนหมูในไทยไม่มีทางถึง 5 °C อยู่แล้ว
 * ส่วนลม 0 ม./วิ. เป็นค่าที่เกิดจริงได้ (ลมนิ่ง) จึงยอมรับ 0
 */
const FIELD_MAP = [
  // เซนเซอร์ในโรงเรือน
  { field: "temperature_1", device: "SENSOR-A", target: "sensor", metric: "temp_c", min: 5, max: 55 },
  { field: "humidity_1", device: "SENSOR-A", target: "sensor", metric: "humidity", min: 5, max: 100 },

  { field: "temperature_2", device: "SENSOR-B", target: "sensor", metric: "temp_c", min: 5, max: 55 },
  { field: "humidity_2", device: "SENSOR-B", target: "sensor", metric: "humidity", min: 5, max: 100 },
  { field: "wind_speed_2", device: "SENSOR-B", target: "sensor", metric: "wind_ms", min: 0, max: 40 },

  { field: "temperature_3", device: "SENSOR-C", target: "sensor", metric: "temp_c", min: 5, max: 55 },
  { field: "humidity_3", device: "SENSOR-C", target: "sensor", metric: "humidity", min: 5, max: 100 },
  // NH₃/CO₂ ตัวนี้ไม่เคยส่งค่าจริงมาสักครั้ง มีแต่ 0 ที่เกิดจาก `?? 0` ของ Node-RED
  // CO₂ ในอากาศกลางแจ้งยัง ~420 ppm อยู่แล้ว ค่า 0 จึงเป็นไปไม่ได้ทางกายภาพ
  { field: "nh3_3", device: "SENSOR-C", target: "sensor", metric: "nh3", min: 0.1, max: 200 },
  { field: "co2_3", device: "SENSOR-C", target: "sensor", metric: "co2", min: 300, max: 10000 },

  // นอกโรงเรือน — การ์ด EnvCompare เทียบใน/นอก
  { field: "outdoor_temperature", device: "SENSOR-OUT", target: "sensor", metric: "temp_c", min: 5, max: 55 },
  { field: "outdoor_humidity", device: "SENSOR-OUT", target: "sensor", metric: "humidity", min: 5, max: 100 },

  // มิเตอร์ไฟ — ลงตาราง power_reading คนละตารางกับ sensor_reading
  { field: "voltage", device: "METER-1", target: "power", metric: "voltage", min: 50, max: 500 },
  { field: "current_a", device: "METER-1", target: "power", metric: "current_a", min: 0, max: 1000 },
  { field: "current_b", device: "METER-1", target: "power", metric: "current_b", min: 0, max: 1000 },
  { field: "current_c", device: "METER-1", target: "power", metric: "current_c", min: 0, max: 1000 },
  { field: "frequency", device: "METER-1", target: "power", metric: "frequency", min: 40, max: 70 },
  // มิเตอร์ยังไม่เคยส่ง power/kWh จริง — ตั้งขั้นต่ำให้พ้น 0 ไว้ก่อน
  // ถ้าวันหนึ่งมิเตอร์ส่งค่าจริงแล้วดับจริง ๆ ค่อยลด min ลงมาเป็น 0
  { field: "power", device: "METER-1", target: "power", metric: "power_kw", min: 0.01, max: 10000 },
  { field: "kilowatt_hour", device: "METER-1", target: "power", metric: "kwh_total", min: 0.01, max: 100000000 },
];

async function seed() {
  await withTransaction(async (c) => {
    /* company ไม่มี unique บนชื่อ จึงใช้ on conflict ไม่ได้ — เช็กก่อนแล้วค่อยสร้าง
       ไม่งั้นรัน seed ซ้ำจะได้บริษัทใหม่ทุกรอบ */
    const existing = await c.query(`select id from company order by created_at limit 1`);
    const companyId =
      existing.rows[0]?.id ??
      (await c.query(`insert into company (name) values ($1) returning id`, ["ซีพีเอฟ (ตัวอย่างระบบ)"]))
        .rows[0].id;

    /* ฟาร์มจริง — พิกัดเป็นจุดกลางจังหวัดกำแพงเพชร ยังไม่ใช่พิกัดฟาร์มจริง
       ต้องขอพิกัดที่ถูกต้องมาแก้ทีหลัง (แผนที่จะปักหมุดผิดที่ไปก่อน) */
    const { rows: [farm] } = await c.query(
      `insert into farm (company_id, code, name, province, lat, lng, data_source)
       values ($1, 'F-KPP', 'ฟาร์มกำแพงเพชร', 'กำแพงเพชร', 16.482800, 99.522200, 'live')
       on conflict (code) do update set name = excluded.name, data_source = 'live'
       returning id`,
      [companyId],
    );

    /* โรงเรือนหลังเดียว — ยังไม่รู้ stage/capacity จริง ปล่อยว่างไว้ดีกว่าเดาแล้วผิด */
    const { rows: [barn] } = await c.query(
      `insert into barn (farm_id, code, name, data_source)
       values ($1, 'A1', 'โรงเรือน A1', 'live')
       on conflict (farm_id, code) do update set name = excluded.name, data_source = 'live'
       returning id`,
      [farm.id],
    );

    const deviceIds = {};
    for (const d of DEVICES) {
      const { rows: [row] } = await c.query(
        `insert into device (barn_id, kind, code, zone, outdoor, duty)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (barn_id, code) do update set zone = excluded.zone, duty = excluded.duty
         returning id`,
        [barn.id, d.kind, d.code, d.zone, d.outdoor, d.note],
      );
      deviceIds[d.code] = row.id;
    }

    for (const m of FIELD_MAP) {
      await c.query(
        `insert into sensor_source_map
           (influx_field, device_id, barn_id, target, metric, plausible_min, plausible_max)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (influx_field) do update set
           device_id = excluded.device_id, barn_id = excluded.barn_id,
           target = excluded.target, metric = excluded.metric,
           plausible_min = excluded.plausible_min, plausible_max = excluded.plausible_max`,
        [m.field, deviceIds[m.device], barn.id, m.target, m.metric, m.min, m.max],
      );
    }

    log.info(
      { farm: "F-KPP", barn: "A1", devices: DEVICES.length, mappings: FIELD_MAP.length },
      "ยัดข้อมูลตั้งต้นเรียบร้อย",
    );
  });
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    log.error({ err }, "ยัดข้อมูลตั้งต้นไม่สำเร็จ");
    process.exit(1);
  });
