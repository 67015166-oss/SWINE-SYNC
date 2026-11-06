/**
 * บันทึกงานในเล้าได้มากกว่า "จำนวนหมู" (T1.366)
 *
 * ═══ เดิมบันทึกได้ 7 อย่าง และเกือบทั้งหมดเป็นการนับตัว ═══
 * ตาย · ป่วย · ขาดหาย · ย้ายเข้า · ย้ายออก · ให้อาหาร · ให้ยา
 * งานจริงในเล้ามีมากกว่านั้นมาก และของที่จดไม่ได้ก็หายไปกับตัวคนที่รู้
 *
 * ★★ **ต้องแก้ CHECK constraint ด้วย ไม่ใช่แค่เพิ่มค่าในโค้ด**
 *   เพิ่งโดนมาเมื่อวาน (T1.365): ใส่ค่าใหม่ลง `line_notice.kind` โดยไม่ดู constraint
 *   ผลคือเขียนไม่ลงทุกครั้ง แล้วตัวส่งไลน์วนส่งซ้ำจนโควตาหายไป 177 ข้อความ
 *   — บทเรียนเดียวกัน คนละตาราง
 *
 * ★ `amount` เป็น NOT NULL และมี CHECK `amount > 0` อยู่เดิม
 *   งานที่ไม่มีจำนวน (ทำความสะอาด · ซ่อม · จดบันทึก) จึงเก็บเป็น **1 ครั้ง**
 *   ไม่ได้ไปแก้ให้คอลัมน์เป็น null ได้ เพราะของเดิมทุกแถวพึ่งกติกานี้อยู่
 *   และ "ทำความสะอาด 1 ครั้ง" ก็อ่านรู้เรื่องอยู่แล้ว
 */

export const disableTransaction = false;

/* ★ เขียนรายชื่อเป็นตัวหนังสือตรง ๆ ไม่ประกอบด้วย .map()
   เพราะชุดทดสอบอ่าน **ตัวไฟล์** เพื่อเทียบว่าชนิดในโค้ดกับใน constraint ตรงกันไหม
   ประกอบตอนรันแล้วคำว่า 'birth' จะไม่ปรากฏในไฟล์ เทสต์จึงจับไม่ได้ว่าตกหล่น */
export const up = (pgm) => {
  pgm.sql(`
    alter table barn_log drop constraint if exists barn_log_type_check;
    alter table barn_log add constraint barn_log_type_check
      check (type in (
        'dead', 'sick', 'missing', 'moveIn', 'moveOut', 'feed', 'medicine',
        'birth', 'wean', 'mate', 'weigh',
        'water', 'feedStock', 'vaccine',
        'clean', 'repair', 'check', 'visitor', 'note'
      ));

    comment on column barn_log.type is
      'ชนิดบันทึก — เพิ่มชนิดใหม่ต้องแก้ constraint นี้ · validate.js · barnLogTypes.js · intent.js พร้อมกัน (T1.366)';
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    delete from barn_log
     where type not in ('dead', 'sick', 'missing', 'moveIn', 'moveOut', 'feed', 'medicine');
    alter table barn_log drop constraint if exists barn_log_type_check;
    alter table barn_log add constraint barn_log_type_check
      check (type in ('dead', 'sick', 'missing', 'moveIn', 'moveOut', 'feed', 'medicine'));
  `);
};
