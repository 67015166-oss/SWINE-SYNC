/**
 * เก็บกุญแจกล่องไว้ให้อ่านย้อนหลังได้ (T1.347 · ผู้ใช้เลือกเอง 27 ต.ค. 2569)
 *
 * ═══ เดิมเป็นยังไง ═══
 * `source_box.key_hash` เก็บแต่แฮช — ปลอดภัยที่สุด แต่เจ้าของตู้เองก็อ่านย้อนไม่ได้
 * ลืมว่าส่งใบไหนให้ใครแล้วจบ ต้องออกใบใหม่แล้วไล่แจ้งทีมนั้นให้เปลี่ยนตาม
 *
 * ═══ ★ ที่เพิ่มคืออะไร ═══
 * `key_cipher` เก็บกุญแจตัวจริงที่ **เข้ารหัสแล้ว** ด้วยความลับใน `.env` (`HUB_KEY_SECRET`)
 * ไม่ได้เก็บดิบ ๆ เพราะไฟล์สำรองฐานข้อมูลถูกคัดลอกไปมาง่าย และโปรเจกต์นี้เคยมีกุญแจ
 * หลุดไปอยู่ในประวัติ git มาแล้ว — เข้ารหัสไว้แล้วต้องได้ `.env` ไปด้วยถึงจะใช้ได้
 *
 * `key_issued_at` บอกว่าใบที่ถืออยู่ออกเมื่อไร ใช้ตอบว่า "ที่ส่งให้เขาคือใบนี้หรือใบก่อน"
 *
 * ⚠ แฮชยังอยู่เหมือนเดิมและยังเป็นตัวตรวจตอนรับข้อมูล — เร็วกว่าและเทียบแบบเวลาคงที่
 *   การถอดรหัสใช้เฉพาะตอนเจ้าของตู้กดดูเท่านั้น
 *
 * ★ กล่องที่ออกกุญแจไว้ก่อน migration นี้จะไม่มี `key_cipher` (เป็น null)
 *   หน้าจอต้องบอกว่า "ใบนี้ออกก่อนเปิดระบบดูย้อนหลัง ต้องออกใหม่ถึงจะดูได้"
 *   ห้ามขึ้นว่า "ไม่มีกุญแจ" เพราะกุญแจยังใช้ได้อยู่ แค่อ่านย้อนไม่ได้
 */

export const disableTransaction = false;

export const up = (pgm) => {
  pgm.sql(`
    alter table source_box
      add column if not exists key_cipher text,
      add column if not exists key_issued_at timestamptz;

    comment on column source_box.key_cipher is
      'กุญแจตัวจริงที่เข้ารหัสแล้ว (aes-256-gcm) — ถอดได้ต่อเมื่อมี HUB_KEY_SECRET ใน .env';
    comment on column source_box.key_issued_at is
      'ใบที่ถืออยู่ออกเมื่อไร — ว่าง = ออกก่อนเปิดระบบดูย้อนหลัง';

    /* กล่องที่มีอยู่แล้วถือว่าออกกุญแจตอนสร้าง จะได้ไม่ขึ้นว่างเปล่าบนหน้าจอ */
    update source_box set key_issued_at = created_at where key_issued_at is null;
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    alter table source_box
      drop column if exists key_cipher,
      drop column if exists key_issued_at;
  `);
};
