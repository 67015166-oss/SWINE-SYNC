-- ────────────────────────────────────────────────────────────────────────────
--  ล้าง "ศูนย์ปลอม" ที่ backfill พามาจากข้อมูล InfluxDB ช่วงก่อน 24 ส.ค. 2026
--
--  ที่มา: ฟังก์ชันใน Node-RED เดิมใช้ `?? 0` เติมค่าให้เซนเซอร์ที่ไม่ได้ส่งอะไรมา
--  ค่าพวกนั้นไม่ใช่ผลการวัด แต่หน้าเว็บแยกไม่ออก แก้ที่ต้นทางไปแล้ว
--  เหลือแต่ของเก่าที่ backfill ดึงเข้ามา ต้องล้างครั้งเดียวจบ
--
--  รันด้วย:
--    docker compose exec -T db psql -U swine -d swinesync -f - < server/src/db/cleanup-legacy-zeros.sql
--  รันซ้ำได้ ไม่มีผลข้างเคียง
-- ────────────────────────────────────────────────────────────────────────────

begin;

-- 1) ค่าที่หลุดช่วง plausible ของตารางแปลง (หลังแก้ขั้นต่ำของ NH₃/CO₂ แล้ว)
--    เขียนเป็นกฎทั่วไป ไม่ hardcode metric — ปรับ sensor_source_map แล้วรันซ้ำได้เลย
delete from sensor_reading r
using sensor_source_map m
where m.target = 'sensor'
  and m.device_id = r.device_id
  and m.metric = r.metric
  and (r.value < m.plausible_min or r.value > m.plausible_max);

-- 2) ความเร็วลมที่ไม่มีอุณหภูมิคู่กัน
--    sensor02 ส่ง wind/temp2/hum2 มาด้วยกันเสมอในข้อความเดียว
--    ถ้ามีแต่ลมแปลว่านั่นคือแถว "ศูนย์ล้วน" เดิมที่อุณหภูมิถูกคัดออกไปแล้ว
--    (ลม 0 ที่มาพร้อมอุณหภูมิจริง = ลมนิ่งจริง เก็บไว้)
delete from sensor_reading w
where w.metric = 'wind_ms'
  and not exists (
    select 1 from sensor_reading t
    where t.device_id = w.device_id and t.at = w.at and t.metric = 'temp_c'
  );

-- 3) มิเตอร์ไฟ: ค่าที่หลุดช่วง plausible ของแต่ละคอลัมน์
--    ต้องวนเป็น dynamic SQL เพราะ target='power' เก็บ "ชื่อคอลัมน์" ไว้ใน metric
--    (คนละแบบกับ sensor_reading ที่ metric เป็นค่าในคอลัมน์เดียว)
do $$
declare m record;
begin
  for m in
    select metric, plausible_min, plausible_max
    from sensor_source_map
    where target = 'power'
  loop
    execute format(
      'update power_reading set %I = null where %I is not null and (%I < $1 or %I > $2)',
      m.metric, m.metric, m.metric, m.metric
    ) using m.plausible_min, m.plausible_max;
  end loop;
end $$;

-- แถวที่ไม่มีแรงดันไม่ใช่ "ค่าที่มิเตอร์วัดได้" — มิเตอร์ตัวนี้ส่งทุก field มาพร้อมกันเสมอ
-- ตรวจแล้วทุกแถวที่ไม่มีแรงดันมีกระแส = 0 พอดี คือแถวที่ join ยิงตอนข้อมูลมาไม่ครบ
-- (แถวที่มีกระแสจริงมีแรงดันครบทุกแถว จึงไม่มีของจริงหายไปกับการลบนี้)
delete from power_reading where voltage is null;

commit;
