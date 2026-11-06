/**
 * แยก view "ค่าล่าสุด" ออกเป็นสองชั้น
 *
 * ของเดิมใช้ `distinct on (barn_id, metric)` ซึ่งใช้ได้เฉพาะตอนที่โรงเรือนหนึ่ง
 * มีเซนเซอร์ตัวเดียว พอโรงเรือนจริงมี 3 โซน + ตัวนอกโรงเรือน มันเหลือค่าเดียวต่อ metric
 * แล้วเลือกมาจากอุปกรณ์ไหนก็ได้ที่บังเอิญใหม่กว่า — ผลคือ "อุณหภูมิในโรงเรือน"
 * กลายเป็นค่าจากเซนเซอร์นอกโรงเรือน ซึ่งผิดแบบที่หน้าจอมองไม่ออกด้วย
 *
 *   v_device_current — ค่าล่าสุดต่ออุปกรณ์ต่อ metric (ความจริงดิบ ใช้ทำผังเซนเซอร์)
 *   v_barn_current   — สรุประดับโรงเรือน แยกในโรงเรือน/นอกโรงเรือน (การ์ด EnvCompare)
 */

export const up = (pgm) => {
  pgm.sql(`drop view if exists v_farm_summary; drop view if exists v_barn_current;`);

  pgm.sql(`
    create view v_device_current as
    select distinct on (r.device_id, r.metric)
           r.device_id, r.barn_id, r.metric, r.value, r.at, d.zone, d.outdoor, d.code as device_code
    from sensor_reading r
    join device d on d.id = r.device_id
    where d.active
    order by r.device_id, r.metric, r.at desc;

    -- เฉลี่ยข้ามโซนเมื่อโรงเรือนมีหลายจุดวัด — ไม่ใช่หยิบโซนใดโซนหนึ่งมาเป็นตัวแทน
    -- device_count บอกว่าเฉลี่ยมาจากกี่จุด หน้าจอจะได้รู้ว่ามีจุดที่เงียบอยู่หรือเปล่า
    create view v_barn_current as
    select barn_id, metric, outdoor,
           avg(value)::real as value,
           max(at) as at,
           count(*)::int as device_count
    from v_device_current
    group by barn_id, metric, outdoor;

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
  pgm.sql(`drop view if exists v_farm_summary, v_barn_current, v_device_current;`);
};
