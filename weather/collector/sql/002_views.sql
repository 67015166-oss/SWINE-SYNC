-- ═══════════════════════════════════════════════════════════════════════
--  ชั้นจัดรูปข้อมูล — เปลี่ยนของดิบรูปยาวใน `obs` ให้เป็นตารางกว้างที่ pandas
--  อ่านแล้วเทรนได้ทันที โดย **ไม่แตะข้อมูลดิบเลยแม้แต่แถวเดียว**
--
--  ทำไมเป็น view ไม่ใช่ตาราง: กติกาการจัดรูปยังต้องแก้อีกหลายรอบแน่ ๆ
--  ถ้าเป็นตารางต้องคอยล้างแล้วสร้างใหม่ทุกครั้ง และมีวันที่ลืมจนข้อมูลเก่าค้าง
--  view คำนวณสดทุกครั้งที่เรียก จึงไม่มีวันไม่ตรงกับของดิบ
--  (ข้อมูลระดับแสนแถวแบบนี้ Timescale ตอบในเสี้ยววินาที ยังไม่ต้องทำ
--   continuous aggregate ให้ซับซ้อน — ค่อยทำตอนข้อมูลถึงหลักสิบล้านแถว)
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
--  ลบ view เก่าทิ้งก่อนสร้างใหม่ทุกครั้ง
--
--  **จำเป็น ไม่ใช่ความเรียบร้อยเฉย ๆ** — `create or replace view` ของ Postgres
--  เปลี่ยน "ชื่อคอลัมน์" ไม่ได้ ขึ้น error 42P16 แล้วตัวเก็บข้อมูลบูตไม่ขึ้นทั้งตัว
--  (เจอจริงตอนแก้ v_coverage ให้แยกนับตามโมเดล) ลบก่อนแล้วสร้างใหม่จึงแก้ชื่อได้อิสระ
--
--  ลบจากปลายทางย้อนไปต้นทาง เพราะ view ปลายทางอ้าง view ต้นทางอยู่
-- ─────────────────────────────────────────────────────────────────────────
drop view if exists v_coverage;
drop view if exists v_feature_10m;
drop view if exists v_feature_1h;
drop view if exists v_obs_10m;
drop view if exists v_obs_1h;
drop view if exists v_obs_clean;

-- ─────────────────────────────────────────────────────────────────────────
--  ค่าที่เชื่อไม่ได้ — กรองที่ชั้นนี้ที่เดียว ไม่ใช่ตอนเขียนลงฐาน
--
--  **ห้ามกรองตั้งแต่ตอนเก็บ** เพราะ "เซนเซอร์ส่ง 0 มาตลอด" เป็นข้อเท็จจริง
--  ที่มีค่าในตัวมันเอง — ใช้บอกได้ว่าอุปกรณ์เสียตั้งแต่เมื่อไรถึงเมื่อไร
--  ถ้าทิ้งตั้งแต่ปากทางก็ไม่เหลืออะไรให้สืบ
--
--  CO₂ ต่ำกว่า 250 ppm เป็นไปไม่ได้ทางกายภาพ — อากาศกลางแจ้งทั้งโลกอยู่ราว 420 ppm
--  ในเล้าปิดที่มีสุกรหายใจยิ่งสูงกว่านั้น (กติกาเดียวกับ src/lib/sensorHealth.js
--  ของแดชบอร์ด — ถ้าจะแก้ ต้องแก้ให้ตรงกันทั้งสองที่)
--
--  **ห้ามใส่พื้นล่างให้ NH₃** — 0 ppm ในเล้าที่ระบายอากาศดีเป็นค่าที่เป็นไปได้จริง
--  แต่ในทางปฏิบัติ NH₃ มาจากโมดูลเดียวกับ CO₂ ถ้า CO₂ พัง NH₃ ก็เชื่อไม่ได้ด้วย
--  จึงตัดทิ้งพร้อมกันใน v_obs_clean ข้างล่าง โดยดูจากสภาพของ CO₂ เป็นตัวตัดสิน
-- ─────────────────────────────────────────────────────────────────────────
create or replace view v_obs_clean as
with stuck as (
  /* ═══ เซนเซอร์ค้างค่า — จับแบบทั่วไป ไม่ต้องไล่ระบุทีละตัว ═══
     ค่าที่วัดจากธรรมชาติไม่มีทางเท่ากันเป๊ะทั้งวัน ถ้าทั้งวันมีค่าที่ต่างกันแค่ค่าเดียว
     จากตัวอย่างเป็นร้อย ๆ แปลว่าอุปกรณ์ตายแล้วค้างค่าสุดท้ายไว้ ไม่ใช่อากาศนิ่ง
     เจอจริงตอนตั้งระบบ: feed นอกอาคารเก่าค้างที่ 26.10 °C ติดกันอย่างน้อย 10 วัน
     ซึ่งอันตรายกว่าไม่มีค่า เพราะหน้าตาเหมือนข้อมูลปกติทุกประการ

     **ยกเว้นค่าที่นิ่งได้จริง** — ฝนเป็น 0 ทั้งวันคือเรื่องปกติมากในหน้าแล้ง
     เช่นเดียวกับความสว่างตอนกลางคืนและพลังงานสะสมที่ไม่เพิ่มตอนไม่ใช้ไฟ */
  select time_bucket('1 day', at) as day, station, measure
  from obs
  where measure not in ('rain_mm', 'rain24_mm', 'light_lux', 'energy_kwh', 'wind_dir_deg')
  group by 1, 2, 3
  having count(*) >= 50 and count(distinct value) = 1
),
gas_ok as (
  -- โมดูลก๊าซของแต่ละวันใช้ได้ไหม — ดูว่าวันนั้น CO₂ เคยขึ้นเหนือพื้นล่างบ้างหรือเปล่า
  select time_bucket('1 day', at) as day, station,
         bool_or(value >= 250) as usable
  from obs where measure = 'co2_ppm'
  group by 1, 2
)
select o.at, o.station, o.measure, o.value, o.source
from obs o
left join gas_ok g
  on g.station = o.station and g.day = time_bucket('1 day', o.at)
where not exists (
  select 1 from stuck k
   where k.station = o.station and k.measure = o.measure
     and k.day = time_bucket('1 day', o.at)
) and case
  when o.measure in ('co2_ppm', 'nh3_ppm') then coalesce(g.usable, false)
  /* ตัวประกอบกำลังเป็น 0 ขณะที่มีกำลังไฟไหลอยู่ = มิเตอร์ไม่ได้วัด ไม่ใช่ค่าจริง */
  when o.measure = 'pf' then o.value > 0
  else true
end;

-- ─────────────────────────────────────────────────────────────────────────
--  จับเวลาให้ตรงกัน — หัวใจของงานนี้ทั้งงาน
--
--  เซนเซอร์ในเล้าส่งทุก ~2 นาทีแบบไม่ตรงนาที ส่วน Open-Meteo เป็นรายชั่วโมงตรง
--  เอามา join ตรง ๆ จะไม่มีแถวไหนตรงกันเลยสักแถว
--  วิธีที่ถูกคือยุบทุกแหล่งลงบน "ตะแกรงเวลา" อันเดียวกันก่อน แล้วค่อยต่อกัน
-- ─────────────────────────────────────────────────────────────────────────
create or replace view v_obs_1h as
select time_bucket('1 hour', at) as at, station, measure,
       avg(value)   as avg_value,
       min(value)   as min_value,
       max(value)   as max_value,
       count(*)::int as n
from v_obs_clean
group by 1, 2, 3;

create or replace view v_obs_10m as
select time_bucket('10 minutes', at) as at, station, measure,
       avg(value)   as avg_value,
       count(*)::int as n
from v_obs_clean
group by 1, 2, 3;

-- ─────────────────────────────────────────────────────────────────────────
--  ตารางฟีเจอร์รายชั่วโมง — ตัวหลักที่เอาไปเทรน
--
--  หนึ่งแถว = หนึ่งชั่วโมง มีทั้งในเล้า · เสาของฟาร์ม · และแบบจำลองโลก อยู่ในแถวเดียวกัน
--  ชื่อคอลัมน์ตั้งด้วยคำนำหน้าให้รู้ทันทีว่ามาจากไหน:
--    barn_ = ในเล้า   ·   mast_ = เสาของฟาร์ม   ·   wx_ = Open-Meteo
-- ─────────────────────────────────────────────────────────────────────────
create or replace view v_feature_1h as
with w as (select * from v_obs_1h),
p as (
  select at,
    -- ── ในเล้า ────────────────────────────────────────────────────────
    max(avg_value) filter (where station = 'barn_R' and measure = 'temp_c')       as barn_temp_c,
    max(min_value) filter (where station = 'barn_R' and measure = 'temp_c')       as barn_temp_min,
    max(max_value) filter (where station = 'barn_R' and measure = 'temp_c')       as barn_temp_max,
    max(avg_value) filter (where station = 'barn_R' and measure = 'rh')           as barn_rh,
    max(avg_value) filter (where station = 'barn_R' and measure = 'airflow_ms')   as barn_airflow_ms,
    max(avg_value) filter (where station = 'barn_R' and measure = 'co2_ppm')      as barn_co2_ppm,
    max(avg_value) filter (where station = 'barn_R' and measure = 'nh3_ppm')      as barn_nh3_ppm,
    max(avg_value) filter (where station = 'barn_R' and measure = 'power_kw')     as barn_power_kw,
    max(avg_value) filter (where station = 'barn_R' and measure = 'volt_v')       as barn_volt_v,
    max(avg_value) filter (where station = 'barn_R' and measure = 'amp_a')        as barn_amp_a,
    max(max_value) filter (where station = 'barn_R' and measure = 'energy_kwh')   as barn_energy_kwh,
    -- ── เสาอากาศของฟาร์ม ─────────────────────────────────────────────
    max(avg_value) filter (where station = 'kpp_mast' and measure = 'temp_c')      as mast_temp_c,
    max(avg_value) filter (where station = 'kpp_mast' and measure = 'rh')          as mast_rh,
    max(avg_value) filter (where station = 'kpp_mast' and measure = 'wind_ms')     as mast_wind_ms,
    max(avg_value) filter (where station = 'kpp_mast' and measure = 'wind_dir_deg') as mast_wind_dir_deg,
    max(avg_value) filter (where station = 'kpp_mast' and measure = 'rain_mm')     as mast_rain_mm,
    max(avg_value) filter (where station = 'kpp_mast' and measure = 'light_lux')   as mast_light_lux,
    -- ── Open-Meteo (แบบจำลองอากาศโลก) ────────────────────────────────
    max(avg_value) filter (where station = 'openmeteo_kpp' and measure = 'temp_c')       as wx_temp_c,
    max(avg_value) filter (where station = 'openmeteo_kpp' and measure = 'rh')           as wx_rh,
    max(avg_value) filter (where station = 'openmeteo_kpp' and measure = 'dew_c')        as wx_dew_c,
    max(avg_value) filter (where station = 'openmeteo_kpp' and measure = 'app_temp_c')   as wx_app_temp_c,
    max(avg_value) filter (where station = 'openmeteo_kpp' and measure = 'rain_mm')      as wx_rain_mm,
    max(avg_value) filter (where station = 'openmeteo_kpp' and measure = 'pres_msl_hpa') as wx_pres_msl_hpa,
    max(avg_value) filter (where station = 'openmeteo_kpp' and measure = 'pres_sfc_hpa') as wx_pres_sfc_hpa,
    max(avg_value) filter (where station = 'openmeteo_kpp' and measure = 'cloud_pct')    as wx_cloud_pct,
    max(avg_value) filter (where station = 'openmeteo_kpp' and measure = 'wind_ms')      as wx_wind_ms,
    max(avg_value) filter (where station = 'openmeteo_kpp' and measure = 'wind_dir_deg') as wx_wind_dir_deg,
    max(avg_value) filter (where station = 'openmeteo_kpp' and measure = 'gust_ms')      as wx_gust_ms,
    max(avg_value) filter (where station = 'openmeteo_kpp' and measure = 'rad_wm2')      as wx_rad_wm2,
    -- ── นับจำนวนค่าดิบที่ยุบมา ใช้บอกว่าชั่วโมงนี้ข้อมูลบางหรือแน่น ─────
    coalesce(sum(n) filter (where station = 'barn_R'), 0)::int   as barn_n,
    coalesce(sum(n) filter (where station = 'kpp_mast'), 0)::int as mast_n
  from w group by at
)
select
  p.*,
  -- ── ค่าที่คำนวณต่อได้เลย ไม่ต้องรอ pandas ──────────────────────────
  --    THI = ดัชนีความเครียดจากความร้อนของสุกร (สูตรเดียวกับแดชบอร์ด)
  case when barn_temp_c is not null and barn_rh is not null
    then round((0.8 * barn_temp_c + (barn_rh / 100.0) * (barn_temp_c - 14.4) + 46.4)::numeric, 2)
  end as barn_thi,
  case when mast_temp_c is not null and mast_rh is not null
    then round((0.8 * mast_temp_c + (mast_rh / 100.0) * (mast_temp_c - 14.4) + 46.4)::numeric, 2)
  end as mast_thi,
  -- ในเล้าร้อนกว่าข้างนอกกี่องศา — ตัวแปรที่บอกประสิทธิภาพการระบายอากาศตรง ๆ
  case when barn_temp_c is not null and mast_temp_c is not null
    then round((barn_temp_c - mast_temp_c)::numeric, 2)
  end as barn_minus_mast_c,
  -- เสาของฟาร์มต่างจากแบบจำลองโลกกี่องศา — คือ "สิ่งที่โมเดลตัวที่สองต้องเรียนรู้"
  case when mast_temp_c is not null and wx_temp_c is not null
    then round((mast_temp_c - wx_temp_c)::numeric, 2)
  end as mast_minus_wx_c,
  -- ── เวลาแบบวงกลม ─────────────────────────────────────────────────
  --    23:00 กับ 00:00 ห่างกันหนึ่งชั่วโมง ไม่ใช่ยี่สิบสาม ถ้าใส่เลขชั่วโมงดิบ
  --    ลงโมเดล มันจะเข้าใจผิดแบบนั้น จึงต้องแปลงเป็น sin/cos ก่อนเสมอ
  extract(hour from p.at at time zone 'Asia/Bangkok')::int as hour_th,
  extract(doy  from p.at at time zone 'Asia/Bangkok')::int as doy,
  round(sin(2 * pi() * extract(hour from p.at at time zone 'Asia/Bangkok') / 24)::numeric, 6) as hour_sin,
  round(cos(2 * pi() * extract(hour from p.at at time zone 'Asia/Bangkok') / 24)::numeric, 6) as hour_cos,
  round(sin(2 * pi() * extract(doy  from p.at at time zone 'Asia/Bangkok') / 365)::numeric, 6) as doy_sin,
  round(cos(2 * pi() * extract(doy  from p.at at time zone 'Asia/Bangkok') / 365)::numeric, 6) as doy_cos
from p
order by p.at;

-- ─────────────────────────────────────────────────────────────────────────
--  ตารางฟีเจอร์ราย 10 นาที — สำหรับโมเดลที่ทำนายระยะสั้น (1–3 ชม.)
--
--  ค่าจาก Open-Meteo เป็นรายชั่วโมง จึงถูก "แผ่" ให้ทุก 10 นาทีในชั่วโมงเดียวกัน
--  ใช้ค่าเดียวกันหมด **ไม่ได้ประมาณค่าในช่วง (interpolate) ให้** เพราะการประมาณ
--  ทำให้ดูเหมือนมีข้อมูลละเอียดกว่าความจริง ซึ่งหลอกทั้งคนอ่านและตัวโมเดลเอง
--  ถ้าต้องการ interpolate ให้ทำใน pandas ตอนเทรน แล้วจะเห็นชัดว่าทำอะไรลงไป
-- ─────────────────────────────────────────────────────────────────────────
create or replace view v_feature_10m as
with p as (
  select at,
    max(avg_value) filter (where station = 'barn_R' and measure = 'temp_c')      as barn_temp_c,
    max(avg_value) filter (where station = 'barn_R' and measure = 'rh')          as barn_rh,
    max(avg_value) filter (where station = 'barn_R' and measure = 'airflow_ms')  as barn_airflow_ms,
    max(avg_value) filter (where station = 'barn_R' and measure = 'power_kw')    as barn_power_kw,
    max(avg_value) filter (where station = 'kpp_mast' and measure = 'temp_c')    as mast_temp_c,
    max(avg_value) filter (where station = 'kpp_mast' and measure = 'rh')        as mast_rh,
    max(avg_value) filter (where station = 'kpp_mast' and measure = 'wind_ms')   as mast_wind_ms,
    max(avg_value) filter (where station = 'kpp_mast' and measure = 'light_lux') as mast_light_lux
  from v_obs_10m group by at
)
select p.*,
  h.wx_temp_c, h.wx_rh, h.wx_pres_msl_hpa, h.wx_cloud_pct, h.wx_wind_ms, h.wx_rad_wm2,
  case when p.barn_temp_c is not null and p.barn_rh is not null
    then round((0.8 * p.barn_temp_c + (p.barn_rh / 100.0) * (p.barn_temp_c - 14.4) + 46.4)::numeric, 2)
  end as barn_thi
from p
left join v_feature_1h h on h.at = time_bucket('1 hour', p.at)
order by p.at;

-- ─────────────────────────────────────────────────────────────────────────
--  ตรวจสุขภาพของชุดข้อมูล — เปิดดูก่อนเทรนทุกครั้ง
--
--  ข้อมูลที่ขาดหายเป็นสาเหตุอันดับหนึ่งที่ทำให้โมเดลออกมาแปลก ๆ โดยไม่รู้ตัว
--  และมองไม่เห็นถ้าไม่ตั้งใจไปดู เพราะ pandas เติม NaN ให้เงียบ ๆ
-- ─────────────────────────────────────────────────────────────────────────
create or replace view v_coverage as
select
  (at at time zone 'Asia/Bangkok')::date as วันที่,
  count(*) filter (where barn_temp_c is not null) as ชม_ในเล้า,
  count(*) filter (where mast_temp_c is not null) as ชม_เสาฟาร์ม,
  count(*) filter (where wx_temp_c   is not null) as ชม_openmeteo,
  /* ═══ สองคอลัมน์นี้คือตัวเลขที่ต้องดู ไม่ใช่สามคอลัมน์ข้างบน ═══
     แต่ละโมเดลต้องการข้อมูลคนละชุด นับรวมกันแล้วจะเข้าใจผิดว่าเทรนไม่ได้
     ทั้งที่โมเดลตัวที่หนึ่งมีข้อมูลพอแล้ว */
  count(*) filter (where barn_temp_c is not null
                     and wx_temp_c   is not null) as เทรนโมเดลในเล้าได้,
  count(*) filter (where mast_temp_c is not null
                     and wx_temp_c   is not null) as เทรนโมเดลนอกเล้าได้,
  round(avg(barn_temp_c)::numeric, 1) as อุณหภูมิเฉลี่ยในเล้า,
  round(avg(wx_temp_c)::numeric, 1)   as อุณหภูมิเฉลี่ยข้างนอก
from v_feature_1h
group by 1
order by 1 desc;
