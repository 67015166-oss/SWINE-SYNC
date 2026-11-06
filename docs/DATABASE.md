# ดาต้าเบสของ SWINE SYNC — โครงตาราง

ร่างจากข้อมูลที่หน้าจอ **ใช้อยู่จริง** ใน `src/data/mock/` และ `src/lib/`
ทุกตารางในนี้มีหน้าที่รองรับหน้าใดหน้าหนึ่งที่มีอยู่แล้ว ไม่ได้ออกแบบลอย ๆ

> **สถานะ: เอกสารออกแบบ ยังไม่ได้ลงมือ** · คู่กับ `BACKEND.md` (ระบบหลังบ้าน)
> ถ้าจะทำจริงให้เปิดงานใหม่ใน `TASKS.md`

---

## 1. ข้อมูลแบ่งเป็น 3 ชนิด ที่ต้องออกแบบคนละแบบ

| ชนิด | ตัวอย่าง | ปริมาณ | ลักษณะการเขียน |
|---|---|---|---|
| **ข้อมูลหลัก** | ฟาร์ม · โรงเรือน · อุปกรณ์ · ผู้ใช้ | หลักร้อยแถว | นาน ๆ แก้ที |
| **ข้อมูลตามเวลา** | ค่าเซนเซอร์ · กระแสไฟพัดลม · มิเตอร์ | **ล้านแถวต่อเดือน** | เขียนอย่างเดียว ไม่แก้ย้อนหลัง |
| **ข้อมูลเหตุการณ์** | แจ้งเตือน · บันทึกหมูตาย/ป่วย · การสั่งอุปกรณ์ · การขาย | หลักหมื่นต่อปี | เขียนแล้วมีสถานะเปลี่ยนได้ |

**ประมาณการปริมาณจริงของระบบนี้**
38 โรงเรือน × ~10 ค่าที่วัด (อุณหภูมิ ความชื้น NH₃ CO₂ H₂S ลม แสง + 4 โซนในผังเซนเซอร์)
× อ่านทุก 1 นาที = **~550,000 แถว/วัน ≈ 200 ล้านแถว/ปี**

ตัวเลขนี้คือตัวตัดสินการออกแบบทั้งหมด — ตารางเดียวเก็บดิบ ๆ แล้วให้หน้าเว็บ
`SELECT` ย้อนหลัง 30 วันตรง ๆ จะช้าจนใช้ไม่ได้ ต้องมีชั้นสรุป (ดูข้อ 4)

**ที่แนะนำ:** PostgreSQL + TimescaleDB — ฐานเดียวพอ ไม่ต้องแยกดาต้าเบส
เพราะทุกอย่างอ้างถึงโรงเรือนเดียวกันหมด (เหตุผลเต็มอยู่ในข้อ 2 ของ `BACKEND.md`)

---

## 2. ข้อมูลหลัก

```sql
-- บริษัท/เครือ (เผื่ออนาคตมีหลายเครือในระบบเดียว)
company(id, name, created_at)

-- ฟาร์ม  ← src/data/mock/farms.js
farm(
  id          uuid pk,
  company_id  fk company,
  code        text unique,       -- "F-CNX" (รหัสที่คนใช้เรียก เก็บแยกจาก id)
  name        text,              -- "ฟาร์มเชียงใหม่"
  province    text,
  district    text,
  lat         numeric(9,6),      -- WGS84 องศาทศนิยม (แผนที่ฉาย Web Mercator)
  lng         numeric(9,6),
  active      boolean default true,
  created_at  timestamptz
)

-- โรงเรือน  ← src/data/mock/barnsByFarm.js
barn(
  id         uuid pk,
  farm_id    fk farm,
  code       text,               -- "A1"
  name       text,               -- "โรงเรือน A1"
  zone       text,               -- A/B/C/D
  building   int,
  stage      text,               -- แม่พันธุ์ | ลูกสุกร | อนุบาล | ขุน
  capacity   int,
  active     boolean default true,
  unique(farm_id, code)
)

-- ประเภทสุกร  ← src/data/mock/pigTypes.js
pig_type(id, code, name, short_name, description, avg_weight_kg, photo_url)

-- อุปกรณ์ทุกชิ้นในโรงเรือน  ← barnSystems.js (พัดลม/ปั๊ม/กล้อง/เซนเซอร์/มิเตอร์)
device(
  id           uuid pk,
  barn_id      fk barn,
  kind         text,   -- sensor | fan | pump | camera | power_meter
  code         text,   -- "FAN 1" · "P1" · "CAM-1"
  zone         text,   -- A/B/C/D (เซนเซอร์และกล้องต้องรู้ว่าอยู่จุดไหน)
  duty         text,   -- "น้ำดื่ม" · "ระบายน้ำ" · "ม่านน้ำ"
  stream_url   text,   -- กล้อง: URL สตรีม (ตรงกับฟิลด์ stream ที่หน้าจอรออยู่แล้ว)
  installed_at date,
  active       boolean default true,
  unique(barn_id, code)
)

-- สูตรอาหาร  ← src/data/mock/feed.js (feedStock)
feed_formula(id, name, stage, note)
```

### กติกาเรื่องเวลา — ทุกคอลัมน์เป็น `timestamptz`

mock เก็บเวลาแบบไม่มีโซน (`"2026-08-03T10:18:00"`) ซึ่งใช้ได้ตอนเป็นค่าคงที่ในไฟล์
แต่พอมีเซิร์ฟเวอร์จะกลายเป็นบั๊กเลื่อน **7 ชั่วโมง** ที่ไม่มี error ให้เห็น
**ห้ามใช้ `timestamp` (ไม่มีโซน) ในตารางไหนเลย** · `time_bucket` ต้องระบุ `'Asia/Bangkok'`
เสมอ ไม่งั้น "ค่าเฉลี่ยรายวัน" จะตัดวันตอน 7 โมงเช้า (รายละเอียดในข้อ 7.1 ของ `BACKEND.md`)

### กติกาข้อเดียวที่ห้ามพลาด

**ห้ามเก็บค่าที่คำนวณได้เป็นคอลัมน์** — `farm.pigs` · `farm.barnCount` · `farm.alerts`
· `farm.tempC` · `farm.fcr` ที่อยู่ใน mock ตอนนี้ **ต้องไม่มีในตาราง** ให้เป็น view แทน (ข้อ 8)

เพราะถ้าเก็บไว้ มันจะค้างคนละค่ากับตารางจริงทันทีที่มีคนลืมอัปเดต —
โปรเจกต์นี้เจอบั๊กแบบนี้มาแล้วตอน T1.65 (หน้าภาพรวมบอก "หลุดเกณฑ์ 17 หลัง"
แต่หน้าอุณหภูมิบอก 30 เพราะคำนวณคนละที่ด้วยเกณฑ์คนละชุด)

### ⚠️ แล้ว "จำนวนสุกร" มาจากไหน — จุดที่ร่างแรกข้ามไป

`farm.pigs` กับ `barn.pigs` ใน mock เป็น**ค่าตั้งต้นที่พิมพ์ไว้เฉย ๆ**
(`barnsByFarm.js` เอา `farm.pigs` มาหารใส่โรงเรือนตามน้ำหนัก) พอห้ามเก็บค่าที่คำนวณได้แล้ว
**ต้องบอกให้ได้ว่าจำนวนจริงมาจากไหน** ไม่งั้นไม่มีตัวเลขให้แสดงเลย

```
จำนวนสุกรในโรงเรือน ณ เวลาหนึ่ง
  = ผลรวม pig_movement (เข้า − ออก − ตาย)
  + ผลรวม pig_count_adjust (ที่คนหน้างานปรับเอง)
```

**ทำไมต้องเป็นผลรวมของเหตุการณ์ ไม่ใช่คอลัมน์ `current_count`**
เพราะทุกครั้งที่มีคนบันทึกหมูตายแล้วลืมไปลดตัวเลขในอีกที่ ระบบจะขัดกันเองทันที
และแบบนี้ตอบคำถาม "เมื่อวันที่ 1 ส.ค. มีกี่ตัว" ได้ด้วย ซึ่งคอลัมน์เดียวตอบไม่ได้

**ตอน seed จาก mock**: แปลง `barn.pigs` เป็น `pig_movement` หนึ่งแถว
(`kind: 'in'`, `at:` วันเริ่มระบบ) — ได้ยอดตั้งต้นตรงกับที่หน้าจอเคยแสดงเป๊ะ
โดยไม่ต้องมีคอลัมน์ที่ค้างคนละค่ากับความจริง

**ถ้ายอดสะสมช้าเมื่อข้อมูลเยอะ** ค่อยเพิ่ม materialized view รายวันทีหลัง
(`pig_count_daily` ที่มีอยู่แล้วใช้เป็นจุดตั้งต้นได้) — แต่ต้นทางต้องเป็นเหตุการณ์เสมอ

---

## 3. ข้อมูลตามเวลา

```sql
-- ค่าที่วัดได้ทุกตัว อยู่ตารางเดียว รูปแบบ "ยาว" (แถวละหนึ่งค่า)
sensor_reading(
  at        timestamptz not null,
  barn_id   fk barn     not null,
  device_id fk device,              -- null ได้ ถ้าเป็นค่ารวมของโรงเรือน
  metric    text not null,          -- temp_c | humidity | nh3 | co2 | h2s
                                    -- | wind_ms | light_lux
  value     real not null,
  primary key (barn_id, metric, at, device_id)   -- ส่งซ้ำไม่เกิดแถวซ้ำ
);
select create_hypertable('sensor_reading', 'at');
create index on sensor_reading (barn_id, metric, at desc);
```

**ทำไม "ยาว" ไม่ใช่คอลัมน์ละค่า** — เพิ่มค่าที่วัดใหม่ (เช่นค่าฝุ่น PM) แล้วไม่ต้อง
migrate ตารางล้านแถว แค่เพิ่มค่าใน `metric` และตัวเลือกในหน้าจอ
ข้อแลกคือ query ต้อง pivot ตอนอ่าน ซึ่งชั้นสรุปในข้อ 4 จัดการให้แล้ว

**ทำไม primary key รวม `at`** — อุปกรณ์ที่เน็ตหลุดจะส่งข้อมูลย้อนหลังซ้ำเสมอ
มี key นี้แล้ว `ON CONFLICT DO NOTHING` จบเรื่อง ไม่ต้องไล่เช็กเองในโค้ด

```sql
-- สถานะอุปกรณ์ตามเวลา  ← getEquipment()
equipment_state(at, device_id, state, hz real, amp real, watt real)
--   state: on | off | warn | offline

-- มิเตอร์ไฟ  ← getElectrical()
power_reading(at, barn_id, voltage real, current_a real, power_kw real, kwh_total real)
```

---

## 4. ชั้นสรุป — จุดที่ทำให้หน้าเว็บเร็ว

หน้าจอไม่เคยขอข้อมูลรายนาทีย้อนหลัง 30 วัน มันขอ "ค่าเฉลี่ยรายชั่วโมง 12/24/48 ชม."
กับ "ค่าเฉลี่ยรายวัน 7/30 วัน" เท่านั้น (ดู `getBarnTrend()` / `getBarnDaily()` และ `TREND_RANGES`)

```sql
create materialized view sensor_hourly
with (timescaledb.continuous) as
select time_bucket('1 hour', at) as bucket, barn_id, metric,
       avg(value) avg_v, min(value) min_v, max(value) max_v, count(*) n
from sensor_reading group by 1,2,3;

create materialized view sensor_daily … -- เหมือนกันแต่ '1 day'
```

API เลือกชั้นให้เองตามช่วงที่ขอ — `≤48h` ใช้ `sensor_hourly` · ยาวกว่านั้นใช้ `sensor_daily`
หน้าเว็บขอเป็นช่วงเวลาอย่างเดียว ไม่ต้องรู้ว่าข้างล่างมีกี่ชั้น

**นโยบายข้อมูล — เป็นค่าตั้ง ไม่ใช่ตัวเลขฝังในโค้ด**

ยังไม่มีข้อกำหนดว่าต้องเก็บกี่ปี จึงต้องแก้ได้ทีหลังโดยไม่ต้องแก้โปรแกรม
(`COMPRESS_AFTER_DAYS` / `RAW_RETENTION_DAYS` — รายละเอียดและประมาณการพื้นที่อยู่ในข้อ 14 ของ `BACKEND.md`)

- บีบอัดข้อมูลดิบที่เก่ากว่า **7 วัน** (`compression` ของ Timescale ลดได้ ~10 เท่า)
- ลบข้อมูลดิบที่เก่ากว่า **90 วัน**
- `sensor_hourly` เก็บ 2 ปี
- **`sensor_daily` เก็บตลอดไป** — เล็กมาก (< 50 MB/ปี) และใช้เทียบปีต่อปี อันนี้ห้ามลบ

---

## 5. ข้อมูลเหตุการณ์

```sql
-- เกณฑ์ตัดสิน — ต้องอยู่ในดาต้าเบส ไม่ใช่ localStorage
alert_rule(
  id, scope,           -- global | farm | barn  (เจาะจงกว่าชนะ)
  farm_id, barn_id,    -- ตาม scope
  metric, comparator,  -- '>' '<' 'outside'
  threshold_min real, threshold_max real,
  level text,          -- critical | serious | warning
  hold_minutes int default 10,   -- ต้องผิดเกณฑ์ต่อเนื่องกี่นาทีถึงนับ (กันเตือนรัว)
  enabled boolean, updated_by fk app_user, updated_at
)

-- แจ้งเตือน  ← src/data/mock/alerts.js
alert(
  id, barn_id, rule_id,
  category text,      -- temp | humidity | nh3 | feed | water | pig | sensor
  level    text,      -- critical | serious | warning
  code     text,      -- temp_over | humidity_high | nh3_high | pig_sick | pig_missing
                      -- | feed_low | water_low | sensor_offline
  params   jsonb,     -- { over: 3.2, value: 31.2, min: 22, max: 28 }
  --   **ห้ามมีคอลัมน์ title/detail ที่เก็บข้อความไทยสำเร็จรูป** — จะแปลเป็น en/zh ไม่ได้อีกเลย
  --   หน้าจอประกอบข้อความเองผ่าน t() (เหตุผลเต็มอยู่ในข้อ 7 ของ BACKEND.md)
  metric text,
  value real,             -- ค่าที่ทำให้เกิดแจ้งเตือน
  threshold_used real,    -- เกณฑ์ ณ ตอนนั้น — แอดมินขยับเกณฑ์แล้วประวัติเก่ายังอ่านรู้เรื่อง
  opened_at timestamptz,
  status text,            -- open | acknowledged | resolved
  acked_by fk app_user, acked_at,
  resolved_at timestamptz, resolved_by fk app_user,
  auto_resolved boolean,  -- ปิดเองเพราะค่ากลับเข้าเกณฑ์ ไม่ใช่คนกดปิด
  resolution_note text
)
create index on alert (status, opened_at desc);
create unique index on alert (barn_id, metric) where status <> 'resolved';
--   ↑ กันไม่ให้โรงเรือนเดียวกันมีแจ้งเตือนเรื่องเดียวกันเปิดค้างซ้อนกันหลายใบ
```

**เรื่องสำคัญที่สุดของส่วนนี้** — ตอนนี้แจ้งเตือนถูก *คำนวณใหม่ทุกครั้งที่ render*
จากเกณฑ์ที่เก็บใน localStorage ของแต่ละเครื่อง แปลว่า **สองคนเปิดหน้าเดียวกันเห็นคนละจำนวน**
และไม่มีประวัติว่าใครกดรับเรื่องไปแล้ว

พอมีดาต้าเบส ต้องเปลี่ยนเป็น: **งานเบื้องหลังอ่านค่าใหม่ → เทียบ `alert_rule` → เขียนแถวลง `alert`**
หน้าเว็บแค่ `SELECT` อย่างเดียว ทุกคนจึงเห็นตรงกัน (รายละเอียดในข้อ 7 ของ `BACKEND.md`)

```sql
-- บันทึกของคนหน้าฟาร์ม  ← หน้า BarnDetail
barn_log(
  id, barn_id, at,
  type text,   -- dead | sick | missing | move_in | move_out | feed | medicine
  amount numeric, unit text, note text,
  created_by fk app_user, created_at, updated_at, deleted_at
)

-- ปรับจำนวนสุกรด้วยมือ  ← swine-sync:adjust (useAdjust)
pig_count_adjust(
  id, barn_id, at,
  delta int,          -- +/- จากค่าที่ระบบมี (เก็บส่วนต่าง ไม่ใช่ค่าใหม่ — ย้อนทีละครั้งได้)
  reason text, note text,
  created_by fk app_user
)

-- การนับสุกรด้วย AI รายวัน  ← barn.today
pig_count_daily(date, barn_id, expected int, ai_count int,
                missing int, sick int, dead int, counted_at)

-- สุกรเข้า-ออกโรงเรือน  ← **ไม่มีใน mock แต่จำเป็น** (ดูกล่องข้างล่าง)
pig_movement(
  id, barn_id, at,
  kind text,      -- in | out | dead | transfer_in | transfer_out
  count int,
  ref_barn_id fk barn,   -- ย้ายมาจาก/ไปโรงเรือนไหน (เฉพาะ transfer)
  note text, created_by fk app_user
)

-- ภาพจากกล้องที่คนกดบันทึกไว้  ← swine-sync:snapshots
camera_snapshot(
  id, barn_id, device_id, at,
  detected int,       -- จำนวนที่ AI นับได้ตอนนั้น
  image_url text,     -- ไฟล์อยู่ MinIO (พูดภาษา S3) ไม่ใช่ในดาต้าเบส — ดูข้อ 12 ของ BACKEND.md
  note text, created_by fk app_user
)

-- คำสั่งเปิด/ปิดอุปกรณ์  ← lib/equipment.js (setFan/setPump)
device_command(
  id, barn_id, device_id,
  action text,        -- on | off | auto | set_hz
  params jsonb,
  requested_by fk app_user, requested_at,
  status text,        -- pending | sent | confirmed | failed | timeout
  confirmed_at, error text
)

-- ล็อตเลี้ยง + ผลผลิต  ← feed.js (batches)
feed_batch(id, barn_id, code, formula_id, start_date, end_date, pig_count)
weighing(id, batch_id, at, avg_weight_kg, sample_size)   -- FCR/ADG คำนวณจากตารางนี้

-- สต็อกอาหาร (เข้า-ออก แล้วยอดคงเหลือคำนวณเอา)
feed_movement(id, farm_id, formula_id, at, kg_delta, kind, ref_no)

-- การเงิน  ← finance.js
sale(id, farm_id, at, pigs_sold int, total_weight_kg, price_per_kg, amount)
cost(id, farm_id, month date, category text, amount)  -- feed|medicine|labor|utility|other
market_price(date, price_per_kg, source)
```

---

## 6. ผู้ใช้ สิทธิ์ และค่าที่ตั้งไว้

```sql
app_user(
  id, company_id,
  username text unique,       -- "admin" · "somchai"
  email text unique,
  display_name text,          -- ชื่อผู้บันทึก ที่ติดไปกับ barn_log
  password_hash text,         -- argon2id — **ห้ามเก็บรหัสผ่านดิบเด็ดขาด**
  role text,                  -- viewer | editor | operator | admin (ไล่ขั้น · T1.251)  ← ดูกล่องเตือนข้างล่าง
                              --   ค่าตั้งต้น viewer · API บังคับให้เลือกเองตอนสร้างบัญชี
                              --   (can_control_equipment ของ T1.245 ถูกยุบเข้าระดับ operator แล้วลบคอลัมน์)
  must_change_password boolean default false,   -- แอดมินคนแรกจาก seed ต้องเปลี่ยนก่อนใช้งาน
  active boolean, created_at
)
--   **ไม่มี DELETE** — ปิดด้วย active=false เพราะ barn_log.created_by กับ alert.acked_by
--   ต้องยังชี้ไปหาคนที่ทำได้เสมอ ลบทิ้งแล้วประวัติจะอ่านไม่รู้เรื่อง

-- ใครเห็นฟาร์มไหนได้บ้าง (ว่างไว้ = เห็นทุกฟาร์มในบริษัท)
user_farm(user_id, farm_id, primary key(user_id, farm_id))

-- session สำหรับ refresh token  ← BACKEND.md ข้อ 4
session(
  id, user_id,
  token_hash text,            -- เก็บ hash ไม่ใช่ตัว token
  user_agent text, ip inet,
  created_at, last_used_at, expires_at, revoked_at
)

-- บันทึกการเข้าใช้งาน  ← swine-sync:auth-log (ตอนนี้อยู่ในเครื่องใครเครื่องมัน)
auth_event(
  id, at, user_id,            -- null ได้ ถ้าล็อกอินด้วยรหัสที่ไม่มีในระบบ
  username_tried text,        -- เก็บสิ่งที่กรอกไว้ด้วย — ไล่ดูคนพยายามเดารหัสได้
  event text,                 -- signin | failed | signout
  ip inet, user_agent text
)

-- ค่าตั้งของแต่ละคน  ← swine-sync:settings (ส่วนที่เป็นของตัวเอง) + :theme + :lang
user_pref(user_id pk, prefs jsonb, updated_at)
--   { homePage, roleTheme, colorMode, lang, textScalePct, photoStrengthPct,
--     density, reduceMotion, showAssistant, userName }

-- เลย์เอาต์กระดาน  ← swine-sync:layouts
layout_preset(id, user_id, board_id, name, layout jsonb, is_active)

-- ค่าตั้งระดับระบบ  ← swine-sync:settings (ส่วนที่กระทบทุกคน)
system_setting(company_id pk, settings jsonb, updated_by, updated_at)
--   { comfort:{tempMin,tempMax,humidityMin,humidityMax},
--     alertMinLevel, mutedCategories, showBellCount, bahtPerKwh }
```

### ⚠️ `app_user.role` คือ "สิทธิ์" ไม่ใช่ "ธีมบทบาท"

โปรเจกต์นี้มีสองคำที่ชื่อคล้ายกันมากและ **ห้ามสลับ**:

| | เก็บที่ไหน | ค่าที่เป็นไปได้ | ตัดสินอะไร |
|---|---|---|---|
| **สิทธิ์การใช้งาน** | `app_user.role` | `viewer` · `editor` · `operator` · `admin` | ทำอะไรได้ — เรื่องความปลอดภัย |
| **ธีมบทบาท** | `user_pref.prefs.roleTheme` | สัตวบาล · สัตวแพทย์ · ผู้จัดการ · เจ้าของ · โภชนาการ · ช่างเทคนิค · … | เห็นอะไรก่อน — ความชอบส่วนตัว สลับเองได้ตลอด |

เอกสารฉบับก่อนเขียน `app_user.role` เป็น `owner|manager|vet|technician|staff` ซึ่ง**ผิด** —
นั่นคือรายการธีมบทบาท ถ้าทำตามนั้นจะกลายเป็น "สลับธีมแล้วได้สิทธิ์เพิ่ม" ซึ่งไม่ควรเป็นไปได้เลย
ค่าที่ถูกคือ `admin` / `user` ให้ตรงกับ `src/lib/auth/roles.js` เป๊ะ

### สิทธิ์ที่บังคับจริงมี 5 คีย์ (ตรงกับหน้าบ้าน)

| คีย์ | admin | user |
|---|---|---|
| `farm.manage` — เพิ่ม/แก้/ลบ ฟาร์มและโรงเรือน | ✓ | — |
| `equipment.control` — สั่งพัดลม/ปั๊ม | ✓ | — |
| `system.settings` — เกณฑ์ · แจ้งเตือน · ค่าไฟ | ✓ | — |
| `record.write` — บันทึกประจำวัน · ปรับจำนวน · ภาพกล้อง | ✓ | ✓ |
| `prefs.write` — ค่าตั้งของตัวเอง | ✓ | ✓ |

**การมองเห็นไม่ถูกจำกัดเลย** — ทั้งสองสิทธิ์อ่านได้ทุกฟาร์มที่ตัวเองมีใน `user_farm`
สิ่งที่แบ่งคือการกระทำที่ส่งผลถึงคนอื่นเท่านั้น

---

## 7. สิ่งที่ **ไม่** ควรขึ้นดาต้าเบส

| อยู่ในเครื่องต่อไป | เพราะ |
|---|---|
| `swine-sync:lang` | หน้าล็อกอินยังไม่รู้ว่าใครเปิดอยู่ — ต้องเลือกภาษาได้ก่อนล็อกอิน |
| `swine-sync:remembered` (เหลือแค่รหัสผู้ใช้) | เป็นของ "เครื่องนี้" ไม่ใช่ของบัญชี · **เลิกเก็บรหัสผ่านทันทีที่มี refresh token** |

---

## 8. View ที่หน้าเว็บควรเรียก (ไม่ให้แต่ละหน้าคำนวณเอง)

```sql
v_barn_current   -- ค่าล่าสุดของทุก metric ต่อโรงเรือน + สถานะ (เทียบ alert_rule แล้ว)
                 --   + จำนวนสุกร = ค่าตั้งต้น + ผลรวม pig_count_adjust
v_farm_summary   -- จำนวนสุกร · จำนวนโรงเรือน · แจ้งเตือนค้าง · อุณหภูมิเฉลี่ย · FCR
v_alert_open     -- แจ้งเตือนที่ยังไม่ปิด พร้อมชื่อฟาร์ม/โรงเรือน
v_batch_kpi      -- FCR · ADG · น้ำหนักเฉลี่ย ต่อล็อต (คำนวณจาก weighing + feed_movement)
```

หน้าไหนอยากได้ตัวเลขไหน ต้องมาจาก view เดียวกันเสมอ — นี่คือวิธีกันไม่ให้
"หน้าภาพรวมบอกเลขหนึ่ง หน้าอื่นบอกอีกเลข" กลับมาอีก

---

## 9. ต่อเข้าโค้ดเดิมยังไง

ตารางแปลงฟังก์ชันเดิม → API อยู่ในข้อ 10 ของ `BACKEND.md`
ลำดับลงมืออยู่ในข้อ 11 ของไฟล์เดียวกัน
