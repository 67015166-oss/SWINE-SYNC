/**
 * สิทธิ์ควบคุมอุปกรณ์ (PLC) รายคน — T1.245
 *
 * ผู้ใช้สั่ง (14 ก.ย. 2569): ผู้ดูแลระบบติ๊กให้ "ผู้ใช้งาน" ทีละคนได้ว่าใครสั่งเปิด/ปิด
 * พัดลม-ปั๊มได้บ้าง โดยไม่ต้องยกคนนั้นเป็นผู้ดูแลระบบ (ซึ่งจะได้แก้เกณฑ์/จัดการผู้ใช้ไปด้วย)
 *
 * **ผู้ดูแลระบบคุมได้เสมอ ไม่ว่าคอลัมน์นี้เป็นอะไร** — ตัดสินในโค้ด (lib/auth.js)
 * ไม่ได้ตั้งเป็น true ให้แอดมินในฐาน เพราะถ้าลดสิทธิ์แอดมินเป็นผู้ใช้งานทีหลัง
 * คนนั้นจะพกสิทธิ์คุมอุปกรณ์ติดไปด้วยโดยไม่มีใครตั้งใจให้
 *
 * ค่าตั้งต้น false — ผู้ใช้งานเดิมทุกคนยังคุมไม่ได้เหมือนก่อน migration
 */
export const up = (pgm) => {
  pgm.sql(`
    alter table app_user
      add column if not exists can_control_equipment boolean not null default false;
  `);
};

export const down = (pgm) => {
  pgm.sql(`alter table app_user drop column if exists can_control_equipment;`);
};
