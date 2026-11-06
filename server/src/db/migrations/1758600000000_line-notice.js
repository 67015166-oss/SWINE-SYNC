/**
 * บันทึกทุกครั้งที่ส่ง (หรือคิดจะส่ง) ข้อความเข้า LINE — T1.275
 *
 * ตารางนี้ทำสามหน้าที่ และห้ามตัดทิ้งข้อใดข้อหนึ่ง:
 *   1. **กันส่งซ้ำ** เหตุหนึ่งใบส่งได้ครั้งเดียว · สรุปประจำวันส่งได้วันละครั้ง
 *      (ตัวส่งเดินทุก 30 วินาทีพร้อมรอบซิงก์ ถ้าไม่มีที่จำ จะยิงซ้ำทุกรอบจนโควตาหมดใน 10 นาที)
 *   2. **นับจำนวนครั้งที่ส่งไปแล้ววันนี้** ใช้เป็นเพดานกันบัคยิงรัว
 *   3. **เก็บของที่ส่งไม่สำเร็จไว้ด้วย** (ok = false) เพื่อไล่หาสาเหตุย้อนหลังได้
 *
 * ยังต้องบันทึกแม้อยู่ในโหมดซ้อม — โหมดซ้อมต้องเดินเหมือนของจริงทุกขั้น
 * ไม่งั้นวันที่เปิดใช้จริงจะเจอพฤติกรรมที่ไม่เคยทดสอบ
 *
 * `ref` คือกุญแจกันซ้ำ: เหตุ = id ของแถวใน alert · สรุปประจำวัน = วันที่ YYYY-MM-DD ตามเวลาไทย
 * ส่วนข้อความทดสอบกับรายการที่ส่งพลาดไม่มีกุญแจ (null) จึงส่งซ้ำได้
 */
export const up = (pgm) => {
  pgm.sql(`
    create table line_notice (
      id       bigserial primary key,
      kind     text not null check (kind in ('daily', 'alert', 'test', 'error')),
      ref      text,
      sent_at  timestamptz not null default now(),
      dry      boolean not null default false,
      ok       boolean not null default true,
      error    text
    );

    -- กันซ้ำที่ฐาน ไม่ใช่กันที่โค้ด เพราะ api กับ bridge เป็นคนละโปรเซสและเดินพร้อมกันได้
    create unique index line_notice_kind_ref_idx on line_notice (kind, ref) where ref is not null;
    create index line_notice_sent_at_idx on line_notice (sent_at desc);
  `);
};

export const down = (pgm) => {
  pgm.sql(`drop table line_notice;`);
};
