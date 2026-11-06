/**
 * บันทึกของคนในโรงเรือน (T1.269) — ย้ายจาก localStorage ของเครื่องคนกรอกขึ้นฐานกลาง
 *
 * `barn_key` เป็นรหัสแบบที่หน้าเว็บใช้ ("F-KPP-A1") ไม่ใช่ uuid ของตาราง barn
 * เพราะหน้ารายละเอียดโรงเรือนเปิดได้ทั้งโรงเรือนจริงและโรงเรือนตัวอย่าง (ไม่มีแถวใน barn)
 * รายงานส่งเวรจับคู่กับโรงเรือนจริงด้วย farm.code || '-' || barn.code
 *
 * `at` เก็บเป็น timestamptz — หน้าเว็บส่ง/รับเป็นเวลาไทยไม่มีโซน หลังบ้านแปลงให้ทั้งสองทาง
 * ลบแบบซ่อน (deleted_at) — บันทึกหมูตาย/ให้ยาหายไปเงียบ ๆ ไม่ได้ ต้องรู้ว่าใครลบ
 * `client_id` = id เดิมในเครื่อง ("L-…") — กดย้ายขึ้นฐานซ้ำกี่ครั้งก็ไม่ได้แถวซ้ำ
 */
export const up = (pgm) => {
  pgm.sql(`
    create table barn_log (
      id          uuid primary key default gen_random_uuid(),
      barn_key    text not null,
      type        text not null
        check (type in ('dead', 'sick', 'missing', 'moveIn', 'moveOut', 'feed', 'medicine')),
      amount      real not null check (amount > 0),
      unit        text not null,
      note        text not null default '',
      by_name     text not null default '',
      at          timestamptz not null,
      client_id   text,
      created_by  uuid not null references app_user(id),
      created_at  timestamptz not null default now(),
      updated_by  uuid references app_user(id),
      updated_at  timestamptz,
      deleted_by  uuid references app_user(id),
      deleted_at  timestamptz,
      unique (barn_key, client_id)
    );
    create index on barn_log (barn_key, at desc) where deleted_at is null;
  `);
};

export const down = (pgm) => {
  pgm.sql(`drop table if exists barn_log;`);
};
