/**
 * ใบรับเวร (T1.268) — กะถัดไปกด "รับเวรแล้ว" ในหน้ารายงานส่งเวร
 *
 * หนึ่งแถวต่อ (โรงเรือน, ช่วงกะ) — unique กันกดซ้ำหรือสองคนกดพร้อมกันแล้วได้สองใบ
 * ไม่มีคอลัมน์แก้ไข/ลบ เพราะเป็นหลักฐานว่ามีคนรับรู้งานค้างแล้ว (แบบเดียวกับที่ app_user ไม่มี DELETE)
 */
export const up = (pgm) => {
  pgm.sql(`
    create table shift_handover (
      id          uuid primary key default gen_random_uuid(),
      barn_id     uuid not null references barn(id),
      period_from timestamptz not null,
      period_to   timestamptz not null check (period_to > period_from),
      received_by uuid not null references app_user(id),
      received_at timestamptz not null default now(),
      note        text,
      unique (barn_id, period_from, period_to)
    );
  `);
};

export const down = (pgm) => {
  pgm.sql(`drop table if exists shift_handover;`);
};
