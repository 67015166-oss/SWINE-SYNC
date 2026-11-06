/** connection pool ตัวเดียวทั้งแอป — ทุกโมดูล import จากที่นี่ */
import pg from "pg";

/* Postgres ส่ง numeric/int8 กลับมาเป็น string เพื่อกันค่าเกิน float
   ตัวเลขในระบบนี้ไม่มีตัวไหนใหญ่ขนาดนั้น อ่านเป็น number ไปเลยจะได้ไม่ต้องแปลงทุกที่ */
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export const query = (text, params) => pool.query(text, params);

/** รันหลายคำสั่งใน transaction เดียว — คืน client ให้ pool เสมอแม้ error */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
