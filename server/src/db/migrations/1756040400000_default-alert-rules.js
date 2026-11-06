/**
 * เกณฑ์แจ้งเตือนตั้งต้น — ตารางมีอยู่แล้วตั้งแต่ core-schema แต่ไม่เคยมีแถวข้างใน
 * ผลคือเครื่องคิดแจ้งเตือนไม่มีอะไรให้เทียบ ฟาร์มที่ต่อเซนเซอร์จริงจึงไม่เคยเตือนสักครั้ง
 * ทั้งที่ความชื้นเกินเพดานอยู่ (ดู docs/TASKS.md T1.143)
 *
 * **ตัวเลขต้องตรงกับค่าตั้งต้นฝั่งหน้าเว็บ** (`src/data/mock/climate.js` → COMFORT
 * และ `src/lib/settings/defaults.js`) ไม่งั้นฟาร์มตัวอย่างกับฟาร์มจริงจะใช้คนละเกณฑ์
 * แล้วคนดูจะสรุปไม่ได้ว่าตกลงเกินหรือไม่เกิน
 *
 *   อุณหภูมิ  22–28 °C   นอกช่วงนี้ = เตือน
 *   ความชื้น  60–75 %    นอกช่วงนี้ = เตือน
 *   NH₃       ไม่เกิน 15 ppm
 *
 * `hold_minutes` = ต้องผิดเกณฑ์ต่อเนื่องกี่นาทีถึงจะนับเป็นแจ้งเตือนจริง
 * เซนเซอร์ส่งทุก ~5 วินาที ค่าจึงแกว่งข้ามเส้นไปมาได้ตลอด ถ้าเตือนทันทีที่เห็นค่าเกิน
 * จะได้แจ้งเตือนกระพริบเข้า-ออกทั้งวันจนไม่มีใครอ่าน — 10 นาทีคือ "เกินจริง ไม่ใช่ค่าแกว่ง"
 * ส่วนแอมโมเนียตั้งสั้นกว่า (5 นาที) เพราะเป็นเรื่องสุขภาพที่รอนานไม่ได้
 *
 * `on conflict do nothing` ไม่ได้ (ไม่มี unique key) จึงเช็กด้วย `where not exists` แทน
 * รันซ้ำกี่ครั้งก็ไม่เกิดแถวซ้ำ
 */
export const up = (pgm) => {
  pgm.sql(`
    insert into alert_rule (scope, metric, comparator, threshold_min, threshold_max, level, hold_minutes)
    select v.scope, v.metric, v.comparator, v.tmin, v.tmax, v.level, v.hold
    from (values
      ('global', 'temp_c',   'outside', 22::real, 28::real,   'warning',  10),
      ('global', 'humidity', 'outside', 60::real, 75::real,   'warning',  10),
      ('global', 'nh3',      '>',       null::real, 15::real, 'serious',   5)
    ) as v(scope, metric, comparator, tmin, tmax, level, hold)
    where not exists (
      select 1 from alert_rule r
      where r.scope = 'global' and r.metric = v.metric and r.farm_id is null and r.barn_id is null
    );
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    delete from alert_rule
    where scope = 'global'
      and farm_id is null and barn_id is null
      and metric in ('temp_c', 'humidity', 'nh3');
  `);
};
