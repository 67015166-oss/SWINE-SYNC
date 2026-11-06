/**
 * สิทธิ์ 4 ระดับไล่ขั้น — T1.251 (แทนที่ admin/user + ช่องติ๊กควบคุมอุปกรณ์ของ T1.245)
 *
 * ผู้ใช้สั่ง (15 ก.ย. 2569): แบ่งให้ชัดว่าใคร "ดูได้อย่างเดียว" · ใคร "แก้ไขบางส่วน" · ใคร "ควบคุมอุปกรณ์ได้"
 * เลือกแบบไล่ขั้น — ขั้นสูงทำได้ทุกอย่างที่ขั้นต่ำทำได้
 *
 *   viewer    ผู้ชม            ดูได้ทุกหน้า แก้อะไรไม่ได้
 *   editor    ผู้บันทึก          + บันทึกในโรงเรือน · ปรับจำนวนสุกร · ภาพกล้อง · เกณฑ์และการแจ้งเตือน
 *   operator  ผู้ควบคุมอุปกรณ์  + สั่งพัดลม/ปั๊ม (PLC)
 *   admin     ผู้ดูแลระบบ       + ฟาร์ม/โรงเรือน · ค่าไฟ · ล้างข้อมูล · จัดการผู้ใช้
 *
 * **ย้ายบัญชีเดิมโดยไม่มีใครเสียสิทธิ์ที่ใช้อยู่**
 *   user ที่ถูกติ๊กคุมอุปกรณ์ → operator · user ธรรมดา → editor
 * แล้วลบคอลัมน์ can_control_equipment ทิ้ง (ระดับบอกแทนแล้ว เก็บไว้สองที่วันหนึ่งจะขัดกันเอง)
 *
 * ค่าตั้งต้นของคอลัมน์เป็น viewer (ต่ำสุด) — API บังคับให้เลือกระดับเองตอนสร้างบัญชีอยู่แล้ว
 * (ผู้ใช้สั่ง "แล้วแต่ว่าเป็นใคร") ค่าตั้งต้นนี้กันแค่กรณีมีคนเพิ่มแถวตรง ๆ ในฐานแล้วลืมใส่
 */
export const up = (pgm) => {
  pgm.sql(`
    alter table app_user drop constraint if exists app_user_role_check;
    update app_user
       set role = case when can_control_equipment then 'operator' else 'editor' end
     where role = 'user';
    alter table app_user
      alter column role set default 'viewer',
      add constraint app_user_role_check check (role in ('viewer', 'editor', 'operator', 'admin'));
    alter table app_user drop column if exists can_control_equipment;
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    alter table app_user add column if not exists can_control_equipment boolean not null default false;
    alter table app_user drop constraint if exists app_user_role_check;
    update app_user set can_control_equipment = true where role = 'operator';
    update app_user set role = 'user' where role in ('viewer', 'editor', 'operator');
    alter table app_user
      alter column role set default 'user',
      add constraint app_user_role_check check (role in ('admin', 'user'));
  `);
};
