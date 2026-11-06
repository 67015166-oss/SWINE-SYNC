/**
 * สร้าง Express app — แยกจากการ listen เพื่อให้เทสต์เรียกใช้ได้โดยไม่ต้องเปิดพอร์ต
 *
 * **ระบบยืนยันตัวตน** — เส้นทางที่ "เขียนข้อมูล" ทุกเส้นต้องผ่าน `requireAuth`
 * ส่วนเส้นทางอ่านยังเปิดไว้ เพราะหน้าเว็บต้องโหลดข้อมูลได้ตั้งแต่ก่อนล็อกอิน
 * (ดูเหตุผลเต็มใน server/src/lib/auth.js)
 */
import express from "express";
import { log } from "./lib/log.js";
import { errorHandler } from "./lib/error.js";
import { query } from "./db/pool.js";
import { methodOverride } from "./lib/methodOverride.js";
import { farmsRouter } from "./modules/farms/route.js";
import { readingsRouter } from "./modules/readings/route.js";
import { alertsRouter } from "./modules/alerts/route.js";
import { assistantRouter } from "./modules/assistant/route.js";
import { farmyRouter } from "./modules/farmy/route.js";
import { forecastRouter } from "./modules/forecast/route.js";
import { authRouter } from "./modules/auth/route.js";
import { usersRouter } from "./modules/users/route.js";
import { reportsRouter } from "./modules/reports/route.js";
import { barnLogRouter } from "./modules/barnlog/route.js";
import { ingestRouter } from "./modules/ingest/route.js";
import { hubRouter } from "./modules/hub/route.js";
import { streamsRouter } from "./modules/ingest/readRoute.js";
import { controlRouter } from "./modules/control/route.js";
import { outboxRouter } from "./modules/control/outboxRoute.js";
import { lineRouter } from "./modules/line/route.js";
import { webhookRouter } from "./line/webhook.js";
import { visionRouter } from "./modules/vision/route.js";
import { activityRouter } from "./modules/activity/route.js";

/**
 * โดเมนของหน้าเว็บที่ยอมให้เรียก API ข้ามโดเมนได้ — คั่นด้วยจุลภาคใน `CORS_ORIGINS`
 *
 * **ค่าตั้งต้นคือว่าง = ไม่เปิดให้ใครเลย** ซึ่งถูกสำหรับการติดตั้งปกติ เพราะหน้าเว็บกับ API
 * อยู่โดเมนเดียวกัน (nginx ของเราเสิร์ฟหน้าเว็บแล้วส่งต่อ /api ไปที่ api:3000)
 * เบราว์เซอร์จึงไม่ถือว่าเป็นคำขอข้ามโดเมน ไม่ต้องใช้ CORS เลยสักนิด
 *
 * ต้องเปิดเมื่อ **แยกหน้าเว็บไปวางคนละโดเมนกับ API** เท่านั้น เช่นสำเนาที่วางบนโฮสต์ไฟล์นิ่ง
 * แล้วให้ชี้กลับมาที่ API ตัวนี้ (คู่กับ `VITE_API_BASE` ฝั่งหน้าเว็บ)
 *
 * **ห้ามใส่ `*`** — โค้ดนี้จะไม่รับ เพราะ API ตัวนี้รับ `Authorization` เป็นกุญแจของ session
 * การเปิดให้ทุกโดเมนเท่ากับให้เว็บไหนก็ได้ยิงคำขอแทนผู้ใช้ที่ล็อกอินอยู่
 */
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter((s) => s && s !== "*"),
);

/** ใส่ส่วนหัว CORS ให้เฉพาะโดเมนในรายชื่อ — โดเมนอื่นเงียบ (เบราว์เซอร์จะบล็อกเอง) */
function cors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin.replace(/\/$/, ""))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    /* บอกแคชกลางทางว่าคำตอบขึ้นกับ Origin ไม่งั้นคำตอบของโดเมนหนึ่งจะถูกจ่ายให้อีกโดเมน */
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Accept, X-HTTP-Method-Override",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  /* คำขอสำรวจ (preflight) ตอบจบตรงนี้ ไม่ต้องวิ่งเข้าไปถึงเส้นทางจริง */
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors);
  /* เก็บเนื้อคำขอดิบไว้ด้วย — webhook ของ LINE ต้องเอาไปคิดลายเซ็น
     ถ้าใช้ JSON ที่ parse แล้วแปลงกลับเป็นสตริง ลายเซ็นจะไม่ตรง (ลำดับคีย์/ช่องว่างเปลี่ยน) */
  app.use(express.json({
    limit: "1mb",
    verify: (req, _res, buf) => { req.rawBody = buf; },
  }));

  /* ★★ ตัวส่งต่อโดเมนของผู้ให้บริการรู้จักแค่ GET กับ POST — วิธีอื่นตอบ 501 ก่อนถึงกล่อง
     หน้าเว็บจึงห่อ PUT/PATCH/DELETE มาเป็น POST แล้วบอกวิธีจริงในหัวคำขอ
     เหตุผลเต็มและผลวัดจริงอยู่ใน lib/methodOverride.js — อ่านก่อนคิดจะเอาออก

     วางหลัง express.json() ได้ เพราะตัว parse ดูจาก Content-Type ไม่ได้ดูวิธี
     และ webhook ของไลน์ไม่ได้ส่งหัวนี้มา rawBody กับลายเซ็นจึงไม่เปลี่ยน */
  app.use(methodOverride);

  app.get("/api/health", async (req, res) => {
    try {
      const { rows } = await query(`
        select (select count(*) from farm) as farms,
               (select count(*) from app_user where active) as users,
               (select count(*) from sensor_reading) as readings,
               (select max(at) from sensor_reading) as last_reading_at
      `);
      res.json({ status: "ok", auth: "เปิดใช้งานแล้ว", ...rows[0] });
    } catch (err) {
      res.status(503).json({ status: "db_unavailable", message: err.message });
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/farms", farmsRouter);
  app.use("/api/barns", readingsRouter);
  /* รายงานส่งเวร (T1.268) — เส้นทางใต้ /api/barns/:id เหมือนกัน แยกไฟล์ไว้ไม่ให้ readings บวม */
  app.use("/api/barns", reportsRouter);
  /* บันทึกของคนในโรงเรือน (T1.269) — ใช้รหัสแบบหน้าเว็บ ("F-KPP-A1") จึงแยกจาก /api/barns ที่ใช้ uuid */
  app.use("/api/barn-logs", barnLogRouter);
  /* ตู้กลางรับข้อมูลจากกล่องของทีมอื่น (T1.347) — ใช้กุญแจประจำกล่อง ไม่ใช่เซสชันของคน
     จึงไม่ได้อยู่หลัง requireAuth เหมือนเส้นทางอื่น ตัวตรวจอยู่ใน requireBox ของตัวมันเอง */
  app.use("/api/ingest", ingestRouter);
  /* จัดการตู้กลาง — ผู้ดูแลระบบเท่านั้น (ด่านอยู่ในตัว router) */
  app.use("/api/hub", hubRouter);
  /* ทีมอื่นดึงข้อมูลจากตู้กลาง — ใช้กุญแจประจำกล่องเหมือนตอนส่งเข้า */
  app.use("/api/streams", streamsRouter);
  /* ★ กล่องขาออกต้องมาก่อน controlRouter (T1.310)
     controlRouter มี `use(requireAuth)` ครอบทั้งตัว และเส้นทางของมันเป็น `/:barnKey/...`
     ซึ่งจะกิน `/outbox` ไปเป็นชื่อโรงเรือน แล้วตอบ 401 ก่อนที่กุญแจของ Node-RED จะได้ตรวจ */
  app.use("/api/control/outbox", outboxRouter);
  app.use("/api/control", controlRouter);
  app.use("/api/alerts", alertsRouter);
  /* ใครทำอะไรในระบบ (T1.359) — อ่านได้ทุกระดับ ตั้งค่าได้ตั้งแต่ผู้บันทึกขึ้นไป */
  app.use("/api/activity", activityRouter);
  app.use("/api/assistant", assistantRouter);
  /* ระบบวอยซ์ของอีกทีม — ผ่านหลังบ้านเพราะยิงตรงจากเบราว์เซอร์ติด CORS (ดูหัวไฟล์) */
  app.use("/api/farmy", farmyRouter);
  app.use("/api/forecast", forecastRouter);
  /* กล้อง AI ของทีม VISION SWINE — ผ่านหลังบ้านเพราะหน้าเว็บเป็น https ส่วนของเขาเป็น http
     และที่อยู่ของเขาอยู่ในเครือข่ายส่วนตัว คนนอกเรียกตรงไม่ได้ (ดูหัวไฟล์ของ route) */
  app.use("/api/vision", visionRouter);
  /* ส่งสรุปและแจ้งเตือนเข้า LINE OA (T1.275) — ตัวส่งอัตโนมัติอยู่ที่สะพานข้อมูล
     เส้นทางนี้ไว้ดูสถานะและสั่งส่งเองเท่านั้น */
  /* เส้นทางรับข้อความจากไลน์ (T1.276) — **ไม่มี requireAuth** เพราะ LINE เป็นคนยิงเข้ามา
     ด่านของเส้นนี้คือลายเซ็น ต้องประกาศ**ก่อน** lineRouter ที่บังคับล็อกอินทั้งชุด */
  app.use("/api/line", webhookRouter);
  app.use("/api/line", lineRouter);

  app.use("/api", (req, res) => {
    res.status(404).json({ error: { code: "not_found", message: "ไม่มีเส้นทางนี้" } });
  });

  app.use(errorHandler(log));
  return app;
}
