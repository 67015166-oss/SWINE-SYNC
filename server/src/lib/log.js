import pino from "pino";

/* JSON ล้วน ไม่ใช้ pino-pretty เพราะ image ลง dependency แบบ --omit=dev
   อยากอ่านสวย ๆ ตอน dev ให้ต่อท่อเอง:  docker compose logs -f api | npx pino-pretty */
export const log = pino({ level: process.env.LOG_LEVEL || "info" });
