/**
 * บันทึกว่า "ใครทำอะไร" แล้วเอาไปแจ้งเตือนได้ (T1.359)
 *
 * ═══ ทำไมต้องมีตารางใหม่ ═══
 * ก่อนหน้านี้ระบบตอบได้แค่สามเรื่อง: ใครเข้าสู่ระบบ (`auth_event`)
 * ใครบันทึกงานในเล้า (`barn_log`) และใครสั่งอุปกรณ์ (`control_command`)
 * **การแก้เกณฑ์ ตั้งค่า เพิ่ม-ลบฟาร์ม/โรงเรือน/ผู้ใช้ ไม่ได้ถูกบันทึกไว้ที่ไหนเลย**
 * ของพวกนี้เปลี่ยนตัวเลขที่ทั้งทีมอ่าน แต่ย้อนไม่ได้ว่าใครเปลี่ยนและเปลี่ยนตอนไหน
 *
 * ═══ ★★ ทำไมรวมทุกชนิดไว้ตารางเดียว ไม่อ่านจากตารางเดิมทีละตัว ═══
 * ตัวแจ้งเตือนต้องตอบคำถามเดียวว่า "ตั้งแต่รอบที่แล้วมีอะไรเกิดขึ้นบ้าง"
 * ถ้าไปไล่อ่านสี่ตารางที่คนละโครงสร้าง ต้องเขียนตัวรวม-เรียง-กันส่งซ้ำสี่ชุด
 * และทุกครั้งที่เพิ่มชนิดใหม่ก็ต้องแก้ตัวแจ้งเตือนอีก
 * ตารางนี้จึงเป็น **บันทึกเพื่อการแจ้งเตือนและการย้อนดู** ไม่ใช่แหล่งข้อมูลหลัก
 * ของจริงยังอยู่ที่ตารางเดิมเหมือนเดิมทุกประการ
 *
 * ★ `summary` เก็บข้อความไทยที่อ่านรู้เรื่องตั้งแต่ตอนเขียน **ไม่ใช่ประกอบตอนอ่าน**
 *   เพราะชื่อฟาร์ม/ชื่อผู้ใช้เปลี่ยนหรือถูกลบได้ ถ้าประกอบตอนอ่านจะกลายเป็น
 *   "ลบฟาร์ม (ไม่พบ)" ทั้งที่ตอนเกิดเหตุมีชื่ออยู่ชัดเจน
 *
 * ★ `actor_id` เป็น `on delete set null` — ลบบัญชีแล้วบันทึกต้องไม่หายตาม
 *   `actor_name` จึงเก็บชื่อไว้ซ้ำโดยตั้งใจ ไม่ใช่ความซ้ำซ้อนที่พลาด
 */

export const disableTransaction = false;

export const up = (pgm) => {
  pgm.sql(`
    create table if not exists activity (
      id          bigserial primary key,
      at          timestamptz not null default now(),
      /* หมวดใหญ่ — ตรงกับรายการที่ผู้ใช้ติ๊กได้ในหน้าตั้งค่า */
      kind        text not null check (kind in ('settings','admin','barnlog','control')),
      /* การกระทำแบบละเอียด เช่น 'farm.create' 'comfort.update' */
      action      text not null,
      actor_id    uuid references app_user(id) on delete set null,
      actor_name  text not null default '',
      /* สิ่งที่ถูกกระทำ เช่นรหัสโรงเรือนหรือชื่อฟาร์ม — ว่างได้ถ้าไม่ผูกกับของชิ้นไหน */
      target      text not null default '',
      /* ข้อความไทยพร้อมอ่าน ประกอบตั้งแต่ตอนเขียน */
      summary     text not null,
      detail      jsonb not null default '{}'::jsonb
    );

    /* ตัวแจ้งเตือนถามว่า "ใหม่กว่า id ไหน" ทุกนาที — ดัชนีนี้คือเส้นทางหลัก */
    create index if not exists activity_at_idx on activity (at desc);
    create index if not exists activity_kind_at_idx on activity (kind, at desc);

    comment on table activity is
      'ใครทำอะไรในระบบ — สำหรับแจ้งเตือนและย้อนดู ไม่ใช่แหล่งข้อมูลหลัก (T1.359)';
    comment on column activity.summary is
      'ข้อความไทยที่ประกอบตั้งแต่ตอนเขียน — ชื่อฟาร์ม/ผู้ใช้เปลี่ยนทีหลังแล้วข้อความต้องไม่เพี้ยน';
  `);
};

export const down = (pgm) => {
  pgm.sql(`drop table if exists activity;`);
};
