/**
 * โครงตารางแกน — ข้อมูลหลัก + ผู้ใช้/สิทธิ์ + เหตุการณ์แจ้งเตือน
 * อ้างอิง docs/DATABASE.md ข้อ 2, 5, 6
 *
 * ยังไม่สร้างในรอบนี้ (ค่อยเพิ่มเป็น migration ใหม่ตอนทำหน้านั้น ๆ):
 *   pig_movement · pig_count_adjust · pig_count_daily · barn_log · camera_snapshot
 *   device_command · feed_* · weighing · sale · cost · market_price · pig_type
 */

export const up = (pgm) => {
  /* ---------- 1. ข้อมูลหลัก ---------- */

  pgm.sql(`
    create table company (
      id         uuid primary key default gen_random_uuid(),
      name       text not null,
      created_at timestamptz not null default now()
    );

    create table farm (
      id         uuid primary key default gen_random_uuid(),
      company_id uuid not null references company(id),
      code       text not null unique,          -- "F-KPP" รหัสที่คนใช้เรียก แยกจาก id
      name       text not null,
      province   text,
      district   text,
      lat        numeric(9,6),                  -- WGS84 องศาทศนิยม
      lng        numeric(9,6),
      -- แยก "ฟาร์มที่มีเซนเซอร์จริง" ออกจาก "ฟาร์มตัวอย่าง" ให้ชัดตั้งแต่ในฐาน
      -- หน้าเว็บเอาไปติดป้ายให้คนดูรู้ว่าเลขไหนเชื่อได้ (ตกลงกับผู้ใช้ 24 ส.ค. 2026)
      data_source text not null default 'demo'
        check (data_source in ('live', 'demo')),
      active     boolean not null default true,
      created_at timestamptz not null default now()
    );

    create table barn (
      id       uuid primary key default gen_random_uuid(),
      farm_id  uuid not null references farm(id),
      code     text not null,                   -- "A1"
      name     text not null,
      zone     text,
      building int,
      stage    text check (stage in ('แม่พันธุ์', 'ลูกสุกร', 'อนุบาล', 'ขุน')),
      capacity int,
      data_source text not null default 'demo'
        check (data_source in ('live', 'demo')),
      active   boolean not null default true,
      unique (farm_id, code)
    );

    create table device (
      id           uuid primary key default gen_random_uuid(),
      barn_id      uuid not null references barn(id),
      kind         text not null
        check (kind in ('sensor', 'fan', 'pump', 'camera', 'power_meter')),
      code         text not null,               -- "SENSOR-A" · "FAN 1"
      zone         text,                        -- A/B/C/D — เซนเซอร์ต้องรู้ว่าอยู่จุดไหน
      duty         text,
      stream_url   text,
      -- true = อยู่นอกโรงเรือน ใช้เทียบใน/นอก (การ์ด EnvCompare)
      outdoor      boolean not null default false,
      installed_at date,
      active       boolean not null default true,
      unique (barn_id, code)
    );
  `);

  /* ---------- 2. ผู้ใช้ สิทธิ์ ค่าตั้ง (docs/DATABASE.md ข้อ 6) ---------- */

  pgm.sql(`
    create table app_user (
      id         uuid primary key default gen_random_uuid(),
      company_id uuid not null references company(id),
      username   text not null unique,
      email      text unique,
      display_name text not null,
      password_hash text not null,              -- argon2id — ห้ามเก็บรหัสผ่านดิบ
      -- "สิทธิ์" เท่านั้น ไม่ใช่ "ธีมบทบาท" (roleTheme อยู่ใน user_pref.prefs)
      role       text not null default 'user' check (role in ('admin', 'user')),
      must_change_password boolean not null default false,
      active     boolean not null default true, -- ไม่มี DELETE เพราะประวัติต้องชี้ถึงคนได้เสมอ
      created_at timestamptz not null default now()
    );

    create table user_farm (
      user_id uuid not null references app_user(id),
      farm_id uuid not null references farm(id),
      primary key (user_id, farm_id)
    );

    create table session (
      id           uuid primary key default gen_random_uuid(),
      user_id      uuid not null references app_user(id),
      token_hash   text not null unique,        -- เก็บ hash ไม่ใช่ตัว token
      user_agent   text,
      ip           inet,
      created_at   timestamptz not null default now(),
      last_used_at timestamptz,
      expires_at   timestamptz not null,
      revoked_at   timestamptz
    );

    create table auth_event (
      id            bigserial primary key,
      at            timestamptz not null default now(),
      user_id       uuid references app_user(id),   -- null ได้ ถ้ารหัสผู้ใช้ไม่มีในระบบ
      username_tried text,
      event         text not null check (event in ('signin', 'failed', 'signout')),
      ip            inet,
      user_agent    text
    );
    create index on auth_event (at desc);

    create table user_pref (
      user_id    uuid primary key references app_user(id),
      prefs      jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    );

    create table layout_preset (
      id        uuid primary key default gen_random_uuid(),
      user_id   uuid not null references app_user(id),
      board_id  text not null,
      name      text not null,
      layout    jsonb not null,
      is_active boolean not null default false
    );
    create index on layout_preset (user_id, board_id);

    create table system_setting (
      company_id uuid primary key references company(id),
      settings   jsonb not null default '{}'::jsonb,
      updated_by uuid references app_user(id),
      updated_at timestamptz not null default now()
    );
  `);

  /* ---------- 3. เกณฑ์ + แจ้งเตือน (docs/DATABASE.md ข้อ 5) ---------- */

  pgm.sql(`
    create table alert_rule (
      id            uuid primary key default gen_random_uuid(),
      scope         text not null check (scope in ('global', 'farm', 'barn')),
      farm_id       uuid references farm(id),
      barn_id       uuid references barn(id),
      metric        text not null,
      comparator    text not null check (comparator in ('>', '<', 'outside')),
      threshold_min real,
      threshold_max real,
      level         text not null check (level in ('critical', 'serious', 'warning')),
      hold_minutes  int not null default 10,    -- ผิดเกณฑ์ต่อเนื่องกี่นาทีถึงนับ (กันเตือนรัว)
      enabled       boolean not null default true,
      updated_by    uuid references app_user(id),
      updated_at    timestamptz not null default now()
    );

    create table alert (
      id             uuid primary key default gen_random_uuid(),
      barn_id        uuid not null references barn(id),
      rule_id        uuid references alert_rule(id),
      category       text not null,
      level          text not null check (level in ('critical', 'serious', 'warning')),
      code           text not null,
      -- ห้ามมีคอลัมน์ข้อความไทยสำเร็จรูป — หน้าจอประกอบเองผ่าน t() ไม่งั้นแปล en/zh ไม่ได้
      params         jsonb not null default '{}'::jsonb,
      metric         text,
      value          real,
      threshold_used real,                      -- เกณฑ์ ณ ตอนนั้น ประวัติเก่าจึงยังอ่านรู้เรื่อง
      opened_at      timestamptz not null default now(),
      status         text not null default 'open'
        check (status in ('open', 'acknowledged', 'resolved')),
      acked_by       uuid references app_user(id),
      acked_at       timestamptz,
      resolved_at    timestamptz,
      resolved_by    uuid references app_user(id),
      auto_resolved  boolean not null default false,
      resolution_note text
    );
    create index on alert (status, opened_at desc);
    -- กันโรงเรือนเดียวกันมีแจ้งเตือนเรื่องเดียวกันเปิดค้างซ้อนหลายใบ
    create unique index on alert (barn_id, metric) where status <> 'resolved';
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    drop table if exists alert, alert_rule,
      system_setting, layout_preset, user_pref, auth_event, session, user_farm, app_user,
      device, barn, farm, company cascade;
  `);
};
