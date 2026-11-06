/**
 * ให้ชั้นสรุปรวมข้อมูลที่ยังไม่ถูกสรุปเข้าไปด้วย (real-time aggregation)
 *
 * ค่าตั้งต้นของ TimescaleDB รุ่นใหม่คือ materialized_only = true แปลว่า
 * กราฟจะเห็นเฉพาะช่วงที่ job สรุปไปแล้ว — ซึ่งตามหลัง end_offset อยู่ 1 ชั่วโมง
 * ผลคือ "24 ชั่วโมงล่าสุด" ไม่มีชั่วโมงล่าสุดจริง ๆ อยู่ในกราฟเลย
 * ซึ่งเป็นชั่วโมงที่คนดูหน้าจอสนใจที่สุด
 *
 * ปิดค่านี้แล้ว Timescale จะต่อข้อมูลดิบส่วนท้ายให้เอง หน้าเว็บจึงเห็นถึงนาทีล่าสุด
 * แลกกับ query ที่หนักขึ้นเล็กน้อยเฉพาะช่วงท้าย
 */
export const up = (pgm) => {
  pgm.sql(`
    alter materialized view sensor_hourly set (timescaledb.materialized_only = false);
    alter materialized view sensor_daily  set (timescaledb.materialized_only = false);
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    alter materialized view sensor_hourly set (timescaledb.materialized_only = true);
    alter materialized view sensor_daily  set (timescaledb.materialized_only = true);
  `);
};
