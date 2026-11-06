/**
 * อนุญาตให้ `line_notice.kind` เป็น 'activity' ได้ (T1.365)
 *
 * ═══ ★★ บั๊กที่ทำให้เสียโควตาไป ~177 ข้อความ ═══
 * ตอนเพิ่มการแจ้งเตือนกิจกรรม (T1.359) ใส่ค่าใหม่ `'activity'` ลงคอลัมน์นี้
 * โดย**ไม่ได้ดูว่าคอลัมน์มี CHECK constraint จำกัดค่าไว้อยู่**
 *   CHECK (kind = ANY (ARRAY['daily','alert','test','error']))
 *
 * ผลคือทุกครั้งที่มีกิจกรรมรอส่ง ตัวส่งจะ **ส่งข้อความออกไปสำเร็จ**
 * แล้วค่อยพังตอนบันทึกผลลง `line_notice` → ตัวชี้ไม่ขยับ → **รอบหน้าส่งซ้ำอีก**
 * วนแบบนี้ทุก 30 วินาที จนโควตาเดือนนั้นหายไป 177 จาก 300
 *
 * ★ ของที่แก้ที่นี่คือ "ค่าที่ยอมรับได้" ส่วนการเรียงลำดับส่ง-บันทึกที่ทำให้
 *   ความผิดพลาดกลายเป็นการส่งซ้ำไม่รู้จบ แก้ที่ `line/notifier.js` (จองที่ก่อนส่ง)
 *   **สองอย่างนี้ต้องแก้คู่กัน** แก้อย่างเดียวยังเหลือทางพังอยู่
 */

export const disableTransaction = false;

export const up = (pgm) => {
  pgm.sql(`
    alter table line_notice drop constraint if exists line_notice_kind_check;
    alter table line_notice add constraint line_notice_kind_check
      check (kind in ('daily', 'alert', 'test', 'error', 'activity'));

    comment on column line_notice.kind is
      'ชนิดข้อความที่ส่ง — เพิ่มค่าใหม่ต้องแก้ constraint นี้ด้วยเสมอ (T1.365)';
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    delete from line_notice where kind = 'activity';
    alter table line_notice drop constraint if exists line_notice_kind_check;
    alter table line_notice add constraint line_notice_kind_check
      check (kind in ('daily', 'alert', 'test', 'error'));
  `);
};
