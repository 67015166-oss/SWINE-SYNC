/**
 * คิวคำสั่งไปตู้ควบคุมโรงเรือน + ทะเบียนอุปกรณ์ที่สั่งได้ (T1.284)
 *
 * ทำไมต้องเป็นตาราง ไม่ใช่ยิงตรง: การสั่งอุปกรณ์ในโรงเรือนที่มีสัตว์อยู่ต้องตอบได้ว่า
 * **ใครสั่ง · เมื่อไร · ค่าอะไร · ผลเป็นอย่างไร · ใครยืนยันคำสั่งที่กติกาเตือน**
 * ยิงตรงแล้วไม่บันทึก ถ้าวันหนึ่งพัดลมหยุดผิดเวลา จะไม่มีใครรู้ว่าเกิดจากคนกดหรือตู้เสีย
 * และเจ้าของระบบจะไม่ให้สิทธิ์เขียนกับระบบที่ตามรอยไม่ได้
 *
 * `rejected` ก็เก็บ — คำสั่งที่ด่านความปลอดภัยปฏิเสธมีค่ามากกว่าคำสั่งที่ผ่าน
 * เพราะมันบอกว่าเคยมีคนพยายามปิดพัดลมตอน 34 °C
 *
 * `held` = ผ่านด่านครบแล้วแต่ยังไม่มีสิทธิ์ส่งออก (ดู control/transport.js)
 * วันที่ได้สิทธิ์ ตัวส่งจะมาไล่แถว held ที่ยังไม่เกินอายุ — **ไม่ใช่ไล่ทั้งหมด**
 * คำสั่งเมื่อวานไม่ควรมีผลกับอากาศวันนี้
 */
export const up = (pgm) => {
  pgm.sql(`
    create table control_device (
      barn_key    text not null,
      kind        text not null check (kind in ('fan', 'pump')),
      device_id   text not null,
      duty        text not null default '',
      -- อุปกรณ์ที่หยุดแล้วกระทบชีวิตสัตว์ (น้ำดื่ม) — ปิดได้แต่ต้องยืนยัน
      critical    boolean not null default false,
      -- เป็นอุปกรณ์ทำความเย็น (พัดลม · ม่านน้ำ) — ปิดหรือหรี่ต้องผ่านด่านอุณหภูมิ
      cooling     boolean not null default false,
      -- สั่งงานอุปกรณ์ตัวนี้ได้ไหม — ปิดตัวเดียวได้โดยไม่ต้องปิดทั้งระบบ
      enabled     boolean not null default true,
      -- ที่อยู่ปลายทางในระบบของเจ้าของ (topic หรือ path) — ว่างจนกว่าเขาจะให้สเปก
      remote_addr text,
      created_at  timestamptz not null default now(),
      primary key (barn_key, device_id)
    );

    create table control_command (
      id           uuid primary key default gen_random_uuid(),
      barn_key     text not null,
      device_kind  text not null check (device_kind in ('fan', 'pump')),
      device_id    text not null,
      action       text not null check (action in ('on', 'off', 'speed', 'auto')),
      hz           smallint,
      -- เหตุผลที่คนกดพิมพ์กำกับไว้ (ไม่บังคับ)
      reason       text not null default '',
      status       text not null
        check (status in ('rejected', 'held', 'sent', 'confirmed', 'failed')),
      -- รหัสกติกาที่ปฏิเสธ หรือกติกาที่คนกดยืนยันข้ามมา
      gate_code    text,
      gate_message text,
      confirmed    boolean not null default false,
      transport    text,
      detail       text,
      -- ค่าที่ใช้ตัดสินตอนนั้น เก็บไว้เพื่อย้อนดูว่าตัดสินบนอะไร
      temp_c       real,
      temp_max     real,
      client_id    text,
      requested_by uuid not null references app_user(id),
      requested_at timestamptz not null default now(),
      settled_at   timestamptz,
      unique (barn_key, client_id)
    );

    create index on control_command (barn_key, requested_at desc);
    create index on control_command (status) where status = 'held';
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    drop table if exists control_command;
    drop table if exists control_device;
  `);
};
