/**
 * นโยบายข้อมูลรอบสอง — ขยายอายุค่าดิบ + บีบอัดมิเตอร์ไฟ
 *
 * วัดเมื่อ 12 ต.ค. 2569 บนกล่อง box-mew:
 *   sensor_reading  483,930 แถว (10 ก.ค. → 12 ต.ค.)  14 MB  บีบอัดแล้ว
 *   power_reading    96,985 แถว ( 8 ก.ค. → 12 ต.ค.)  18 MB  ยังไม่บีบ
 *   ดิสก์กล่อง 1.8T ใช้ไป 322G เหลือ 1.4T
 *
 * สองเรื่องที่แก้:
 *
 * 1) retention ของ `sensor_reading` เดิม 90 วัน — ก้อน 9–16 ก.ค. จะถูกลบ 14 ต.ค.
 *    ค่าดิบสามเดือนกินแค่ 14 MB บนดิสก์ที่เหลือ 1.4 TB การลบจึงไม่ได้ประหยัดอะไร
 *    แต่เสียข้อมูลถาวร เพราะ MQTT เป็น QoS 0 ดึงย้อนหลังไม่ได้ · ผู้ใช้เลือก 365 วัน
 *
 * 2) `power_reading` ไม่มีทั้งบีบอัดและ retention ตั้งแต่ migration แรก
 *    จึงใหญ่กว่า sensor_reading ทั้งที่แถวน้อยกว่าห้าเท่า — เปิดบีบอัดให้เท่ากัน
 *    **ไม่ใส่ retention ให้** เพราะ kwh_total เป็นค่าสะสม ลบต้นทางแล้วคิดค่าไฟย้อนหลังไม่ได้
 *
 * ต้องปิด transaction — DDL ของ Timescale บางตัวทำในบล็อก transaction ไม่ได้
 */
export const disableTransaction = true;

const COMPRESS_AFTER_DAYS = Number(process.env.COMPRESS_AFTER_DAYS || 7);
/* เดิม default 90 ใน 1756040100000_timeseries.js — ขึ้นเป็น 365 ที่นี่
   ของเก่าห้ามแก้ เพราะกล่องรันไปแล้ว แก้แล้วประวัติไม่ตรงกับที่เกิดขึ้นจริง */
const RAW_RETENTION_DAYS = Number(process.env.RAW_RETENTION_DAYS || 365);

export const up = (pgm) => {
  /* ---------- 1. ค่าดิบเซนเซอร์ — ขยายอายุ ---------- */
  pgm.sql(`select remove_retention_policy('sensor_reading', if_exists => true);`);
  pgm.sql(`select add_retention_policy('sensor_reading', interval '${RAW_RETENTION_DAYS} days');`);

  /* ---------- 2. มิเตอร์ไฟ — บีบอัดตามหลังเซนเซอร์ ----------
     segmentby ตาม primary key ที่ไม่ใช่เวลา เหมือน sensor_reading */
  pgm.sql(`
    alter table power_reading set (
      timescaledb.compress,
      timescaledb.compress_segmentby = 'barn_id, device_id'
    );
  `);
  pgm.sql(`select add_compression_policy('power_reading', interval '${COMPRESS_AFTER_DAYS} days', if_not_exists => true);`);
};

export const down = (pgm) => {
  pgm.sql(`select remove_compression_policy('power_reading', if_exists => true);`);
  pgm.sql(`alter table power_reading set (timescaledb.compress = false);`);
  pgm.sql(`select remove_retention_policy('sensor_reading', if_exists => true);`);
  pgm.sql(`select add_retention_policy('sensor_reading', interval '90 days');`);
};
