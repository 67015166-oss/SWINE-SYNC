/** เปิดพอร์ต + ปิดให้เรียบร้อยตอนโดน SIGTERM (docker stop ส่งสัญญาณนี้) */
import { createApp } from "./app.js";
import { pool } from "./db/pool.js";
import { log } from "./lib/log.js";
import { startTwinWarmer } from "./twin/barnTwin.js";

const port = Number(process.env.API_PORT || 3000);
const server = createApp().listen(port, () => {
  log.info({ port }, "API พร้อมใช้งาน");
  /* แบบจำลองโรงเรือน: สอนแบบจำลองไว้ล่วงหน้า คนเปิดหน้าจะได้ไม่ต้องรอ (T1.264) */
  startTwinWarmer(log);
});

const shutdown = () => {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
