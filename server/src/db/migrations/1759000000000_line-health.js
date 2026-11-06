/**
 * ประวัติการตรวจว่า "ไลน์ยิงเข้ามาหาเราได้ไหม" (T1.278)
 *
 * ทำไมต้องมี: 23 ก.ย. 2569 ช่องทางจากอินเทอร์เน็ต (Tailscale Funnel) ตายไปเงียบ ๆ
 * ระบบหลังบ้านยังทำงานปกติทุกอย่าง บอทก็ยังตอบได้ถ้าเรียกในเครื่อง แต่ข้อความจากไลน์
 * ไม่มาถึงเลย และ **ไม่มีใครรู้จนกว่าจะมีคนลองกด** — บอทที่เงียบโดยไม่มีใครรู้
 * อันตรายกว่าไม่มีบอท เพราะคนจะคิดว่า "ไม่มีแจ้งเตือน = ทุกอย่างปกติ"
 *
 * เก็บผลทุกครั้งที่ตรวจ ไม่เก็บเฉพาะตอนพัง — จะได้ตอบได้ว่าพังตั้งแต่เมื่อไรและหายไปกี่ชั่วโมง
 */
export const up = (pgm) => {
  pgm.sql(`
    create table line_health (
      id     bigserial primary key,
      at     timestamptz not null default now(),
      ok     boolean not null,
      reason text,
      detail text
    );

    create index line_health_at_idx on line_health (at desc);
  `);
};

export const down = (pgm) => {
  pgm.sql(`drop table line_health;`);
};
