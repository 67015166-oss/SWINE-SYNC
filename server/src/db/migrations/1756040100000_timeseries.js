/**
 * ข้อมูลตามเวลา + ชั้นสรุป + ตารางแปลงชื่อ field ของ InfluxDB
 * อ้างอิง docs/DATABASE.md ข้อ 3, 4, 8
 *
 * ต้องปิด transaction เพราะ continuous aggregate ของ TimescaleDB
 * สร้างในบล็อก transaction ไม่ได้
 */
export const disableTransaction = true;

const COMPRESS_AFTER_DAYS = Number(process.env.COMPRESS_AFTER_DAYS || 7);
const RAW_RETENTION_DAYS = Number(process.env.RAW_RETENTION_DAYS || 90);

export const up = (pgm) => {
  pgm.sql(`create extension if not exists timescaledb;`);

  /* ---------- 1. ค่าที่วัดได้ — รูปแบบ "ยาว" แถวละหนึ่งค่า ---------- */

  pgm.sql(`
    create table sensor_reading (
      at        timestamptz not null,
      barn_id   uuid not null references barn(id),
      -- ต่างจาก docs/DATABASE.md ที่ให้ null ได้ — ตรงนี้บังคับว่าต้องมี
      -- เพราะค่าดิบทุกค่ามาจากอุปกรณ์จริงเสมอ ส่วนค่ารวมระดับโรงเรือนเป็นงานของชั้นสรุป
      -- (และคอลัมน์ที่ null ได้จะอยู่ใน primary key ไม่ได้)
      device_id uuid not null references device(id),
      metric    text not null
        check (metric in ('temp_c', 'humidity', 'nh3', 'co2', 'h2s', 'wind_ms', 'light_lux')),
      value     real not null,
      -- ส่งซ้ำไม่เกิดแถวซ้ำ — อุปกรณ์ที่เน็ตหลุดจะส่งย้อนหลังซ้ำเสมอ
      primary key (barn_id, metric, device_id, at)
    );

    create table power_reading (
      at         timestamptz not null,
      barn_id    uuid not null references barn(id),
      device_id  uuid not null references device(id),
      voltage    real,
      current_a  real,
      current_b  real,
      current_c  real,
      frequency  real,
      power_kw   real,
      kwh_total  real,
      primary key (barn_id, device_id, at)
    );
  `);

  pgm.sql(`select create_hypertable('sensor_reading', 'at', if_not_exists => true);`);
  pgm.sql(`select create_hypertable('power_reading', 'at', if_not_exists => true);`);
  pgm.sql(`create index on sensor_reading (barn_id, metric, at desc);`);

  /* ---------- 2. ชั้นสรุป — จุดที่ทำให้หน้าเว็บเร็ว ---------- */

  pgm.sql(`
    create materialized view sensor_hourly
    with (timescaledb.continuous) as
    select time_bucket('1 hour', at) as bucket,
           barn_id, metric,
           avg(value) as avg_v, min(value) as min_v, max(value) as max_v, count(*) as n
    from sensor_reading
    group by 1, 2, 3
    with no data;
  `);

  pgm.sql(`
    -- ต้องระบุ 'Asia/Bangkok' ไม่งั้น "ค่าเฉลี่ยรายวัน" จะตัดวันตอน 7 โมงเช้า
    create materialized view sensor_daily
    with (timescaledb.continuous) as
    select time_bucket('1 day', at, 'Asia/Bangkok') as bucket,
           barn_id, metric,
           avg(value) as avg_v, min(value) as min_v, max(value) as max_v, count(*) as n
    from sensor_reading
    group by 1, 2, 3
    with no data;
  `);

  pgm.sql(`
    select add_continuous_aggregate_policy('sensor_hourly',
      start_offset => interval '3 days', end_offset => interval '1 hour',
      schedule_interval => interval '30 minutes');
    select add_continuous_aggregate_policy('sensor_daily',
      start_offset => interval '30 days', end_offset => interval '1 hour',
      schedule_interval => interval '1 hour');
  `);

  /* ---------- 3. นโยบายข้อมูล — ค่ามาจาก .env ไม่ฝังในโค้ด ---------- */

  pgm.sql(`
    alter table sensor_reading set (
      timescaledb.compress,
      timescaledb.compress_segmentby = 'barn_id, metric, device_id'
    );
    select add_compression_policy('sensor_reading', interval '${COMPRESS_AFTER_DAYS} days');
    select add_retention_policy('sensor_reading', interval '${RAW_RETENTION_DAYS} days');
  `);

  /* ---------- 4. ตารางแปลงชื่อ field ของ InfluxDB → โรงเรือน/อุปกรณ์/metric ----------
   *
   * ตารางนี้ **ไม่มีใน docs/DATABASE.md** เพิ่มเข้ามาเพราะข้อมูลที่ Node-RED เขียนลง
   * InfluxDB ไม่มี tag บอกโรงเรือนเลย มีแค่ชื่อ field อย่าง "temperature_2"
   * ถ้าไม่มีตารางนี้ ความรู้ว่า "_2 คือโซน B" จะไปฝังอยู่ในโค้ด bridge
   * ซึ่งแก้ทีต้อง deploy ใหม่ทุกครั้งที่ย้ายเซนเซอร์
   */
  pgm.sql(`
    create table sensor_source_map (
      influx_field text primary key,            -- "temperature_2"
      device_id    uuid not null references device(id),
      barn_id      uuid not null references barn(id),
      -- metric ของ sensor_reading · หรือคอลัมน์ของ power_reading ถ้า target = 'power'
      target       text not null default 'sensor' check (target in ('sensor', 'power')),
      metric       text not null,
      -- ช่วงค่าที่เป็นไปได้จริง — อุปกรณ์บางตัวอ่าน RS485 ไม่ได้แล้วคืน 0 มา
      -- ค่าที่หลุดช่วงนี้ถือว่า "ไม่มีค่า" ไม่ใช่ 0 องศา (ดู bridge/index.js)
      plausible_min real,
      plausible_max real,
      note         text
    );
  `);

  /* ---------- 5. View ที่ทุกหน้าเรียกร่วมกัน (docs/DATABASE.md ข้อ 8) ---------- */

  pgm.sql(`
    -- ค่าล่าสุดของทุก metric ต่อโรงเรือน — หน้าไหนอยากได้ตัวเลขนี้ต้องมาจากที่นี่ที่เดียว
    create view v_barn_current as
    select distinct on (r.barn_id, r.metric)
           r.barn_id, r.metric, r.value, r.at, r.device_id, d.zone, d.outdoor
    from sensor_reading r
    join device d on d.id = r.device_id
    order by r.barn_id, r.metric, r.at desc;

    create view v_farm_summary as
    select f.id as farm_id, f.code, f.name, f.province, f.data_source,
           count(distinct b.id) filter (where b.active) as barn_count,
           count(distinct a.id) filter (where a.status <> 'resolved') as open_alerts,
           max(c.at) as last_reading_at
    from farm f
    left join barn b on b.farm_id = f.id
    left join alert a on a.barn_id = b.id
    left join v_barn_current c on c.barn_id = b.id
    group by f.id;
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    drop view if exists v_farm_summary, v_barn_current;
    drop table if exists sensor_source_map;
    drop materialized view if exists sensor_daily, sensor_hourly;
    drop table if exists power_reading, sensor_reading;
  `);
};
