/**
 * สะพานไปหากล้อง AI ของทีม VISION SWINE (T1.355) — /api/vision
 *
 *   GET /health            ต่อถึงไหม · AI ยังประมวลผลอยู่ไหม · คลังข้อมูลตอบไหม
 *   GET /realtime          จำนวนสุกรที่เห็นตอนนี้ · เข้า/ออก/สุทธิ · น้ำหนักรายตัว · fps
 *   GET /stream            ภาพสด MJPEG
 *   GET /sessions          รอบการทำงาน          ┐
 *   GET /weights           ประวัติน้ำหนัก        │ จากคลังข้อมูล (NAS)
 *   GET /counting-events   ประวัติการนับเข้า-ออก │
 *   GET /videos            รายการวิดีโอ          │
 *   GET /videos/:id/file   ไฟล์วิดีโอ            ┘
 *   GET /storage           ที่ว่างของคลังข้อมูล
 *
 * ═══ ทำไมต้องผ่านหลังบ้าน ไม่ให้หน้าเว็บยิงตรง ═══
 *
 * 1. **หน้าเว็บเป็น https ภาพกับ API ของเขาเป็น http** เบราว์เซอร์บล็อกทิ้งทันที
 *    ขึ้นกล้องดำโดยไม่มีข้อความบอกว่าทำไม — ข้อนี้อย่างเดียวก็ปิดทางยิงตรงแล้ว
 *
 * 2. **ที่อยู่ของเขาเป็นที่อยู่ในเครือข่ายส่วนตัว** คนที่เปิดแดชบอร์ดจากข้างนอก
 *    ไม่ได้อยู่ในเครือข่ายนั้น จึงเรียกไม่ได้ (ทีมกล้องเสนอข้อนี้มาเองด้วย)
 *
 * 3. **ของเขาไม่มีด่านอะไรเลย** เปิดทะลุออกไปคือใครก็อ่านได้ ที่นี่จึงบังคับล็อกอินก่อน
 *
 * ═══ ★★ เปิดเฉพาะขาอ่าน และเปิดเป็นรายเส้นทาง ═══
 * คลังข้อมูลของเขามี `POST /sessions` `POST /weights` `POST /counting-events`
 * `POST /videos` และ `PATCH /sessions/{id}/end` ซึ่ง**เขียนข้อมูลได้**
 * ส่วนกล่องกล้องมีเส้นตั้งค่าเส้นนับของมันเอง
 *
 * ที่นี่จึง **ไม่ส่งต่อเส้นทางตามที่ผู้เรียกขอมา** แต่มีตารางเส้นทางที่อนุญาตไว้ตายตัว
 * ถ้าทำเป็น `/api/vision/*` แล้วส่งต่อทั้งดุ้น มันจะกลายเป็นประตูให้คนนอกเขียนข้อมูล
 * ลงคลังของทีมเขาผ่านบัญชีผู้ชมของเรา — ซึ่งแย่กว่าการไม่มีหน้ากล้องเสียอีก
 *
 * ═══ ที่อยู่ปลายทาง ═══
 * ค่าตั้งต้นชี้ไปที่ **สะพาน `tailscale nc` บนกล่อง** (ดู `ops/tailnet-relay.js`)
 * เพราะกล่องรัน tailscaled โหมด userspace จึงยิงหาเครื่องในเครือข่ายตรง ๆ ไม่ได้
 * ตอนพัฒนาบนเครื่องผู้พัฒนาที่อยู่ในเครือข่ายอยู่แล้ว ตั้งทับด้วย `VISION_JETSON_URL`
 * และ `VISION_NAS_URL` ใน `.env` ให้ชี้ไปที่เครื่องเขาตรง ๆ ได้
 */
import { Readable } from "node:stream";
import { Router } from "express";
import { requireAuth } from "../../lib/auth.js";
import { AppError, notFound } from "../../lib/error.js";
import { log } from "../../lib/log.js";
import { aiVerdict, lastEstimateAgeSec, pigCounts } from "../../vision/health.js";
import { checkTicket, issueTicket } from "../../vision/ticket.js";

export const visionRouter = Router();

const JETSON = (process.env.VISION_JETSON_URL || "http://127.0.0.1:18080").replace(/\/$/, "");
const NAS = (process.env.VISION_NAS_URL || "http://127.0.0.1:18002").replace(/\/$/, "");

/** ของเขาตอบเร็วมาก (ไม่ถึงวินาที) เกินนี้ถือว่าไม่ไหวแล้ว ดีกว่าค้างหน้าจอคนดู */
const TIMEOUT_MS = 8_000;

/** ภาพสดพร้อมกันได้กี่คน — หนึ่งคนหนึ่งการเชื่อมต่อค้างยาว กินทั้งสะพานและกล่องกล้อง */
const MAX_STREAMS = 4;
let streams = 0;

/** เส้นทางที่อนุญาต — เขียนตายตัว ไม่รับเส้นทางจากผู้เรียก */
const READ_ROUTES = {
  realtime: `${JETSON}/api/system/realtime`,
  sessions: `${NAS}/sessions`,
  weights: `${NAS}/weights`,
  "counting-events": `${NAS}/counting-events`,
  videos: `${NAS}/videos`,
  storage: `${NAS}/system/storage`,
};

/**
 * ดึง JSON จากปลายทาง — ★ ล้มแล้วต้อง **บอกว่าล้ม** ห้ามคืนค่าเก่าหรือค่าปลอม
 * @returns {Promise<{ok: true, data: any} | {ok: false, why: string}>}
 */
async function getJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { ok: false, why: `ปลายทางตอบ ${res.status}` };
    return { ok: true, data: await res.json() };
  } catch (e) {
    return { ok: false, why: e?.name === "TimeoutError" ? "ปลายทางไม่ตอบในเวลาที่กำหนด" : "ต่อปลายทางไม่ได้" };
  }
}

/**
 * ★★ ภาพสดกับไฟล์วิดีโอต้องมาก่อน `use(requireAuth)` ข้างล่าง
 *
 * สองเส้นนี้ถูกเปิดด้วย `<img src>` และ `<video src>` ซึ่ง**เบราว์เซอร์ไปดึงเอง**
 * เราใส่หัว `Authorization` ให้มันไม่ได้ จึงต้องรับตั๋วชั่วคราวทางพารามิเตอร์ได้อีกทาง
 * (ดูเหตุผลเต็มใน `vision/ticket.js` — ย่อ: ห้ามเอา token ของ session ใส่ใน URL)
 *
 * ลำดับสำคัญ: `use()` มีผลเฉพาะกับเส้นทางที่ประกาศ**หลัง**มัน ถ้าย้ายสองเส้นนี้ลงไป
 * ข้างล่างเมื่อไหร่ ภาพสดจะกลายเป็น 401 ทันทีโดยที่ไม่มีอะไรฟ้อง
 */
function requireAuthOrTicket(req, res, next) {
  if (req.headers.authorization) return requireAuth(req, res, next);
  const t = checkTicket(typeof req.query.ticket === "string" ? req.query.ticket : null);
  if (!t.ok) return next(new AppError(401, "unauthorized", "ต้องเข้าสู่ระบบก่อน"));
  req.user = { id: t.userId };
  return next();
}

visionRouter.get("/stream", requireAuthOrTicket, async (req, res) => {
  if (streams >= MAX_STREAMS) throw new AppError(503, "too_many_streams", `ดูภาพสดพร้อมกันได้สูงสุด ${MAX_STREAMS} คน`);
  streams += 1;
  res.on("close", () => { streams -= 1; });
  await pipeThrough(`${JETSON}/stream`, req, res, "stream");
});

visionRouter.get("/videos/:id/file", requireAuthOrTicket, async (req, res) => {
  /* ★ รับเฉพาะตัวเลข — กันเส้นทางแปลกปลอมถูกต่อท้ายที่อยู่ของเขา */
  if (!/^\d{1,12}$/.test(req.params.id)) throw notFound("วิดีโอ");
  await pipeThrough(`${NAS}/videos/${req.params.id}/file`, req, res, "video");
});

visionRouter.use(requireAuth);

/** ขอตั๋วเปิดภาพสด — ต้องล็อกอินก่อนเสมอ ตั๋วที่ได้ใช้ได้แค่ภาพกับวิดีโอ */
visionRouter.post("/ticket", (req, res) => res.json(issueTicket(req.user.id)));

/**
 * ★ อายุผลประมวลผลล่าสุด เก็บไว้ใช้ซ้ำสั้น ๆ
 *
 * `/weights` ของคลังข้อมูล **ไม่รับ `?limit=` และคืน 100 แถวล่าสุดตายตัว**
 * (ตรวจแล้ว 30 ต.ค. 2569 — ส่ง limit ไปได้ขนาดตอบเท่าเดิมเป๊ะ และนับได้ 100 พอดีทุกครั้ง)
 * ขนาดจึงคงที่ แต่ขอช่วงเวลาที่ต้องการไม่ได้ และถามถี่ ๆ ก็ยังเป็นการลากก้อนเดิมข้ามเครือข่ายซ้ำ
 *
 * ★ เคยเห็นของจริงแล้วว่าช้าจนหมดเวลา (ปกติ 0.8 วิ แต่บางจังหวะเกิน 8 วิ)
 *   ตอนนั้นสถานะตอบว่า "ไม่ทราบ" ซึ่งถูกแล้ว — แต่ไม่ควรไปถามถี่ขนาดนั้นตั้งแต่แรก
 *
 * ถ้าวันหนึ่งทีมกล้องใส่ `?limit=` ให้ ให้เปลี่ยนมาใช้แทนการเก็บไว้ใช้ซ้ำ
 */
const AGE_CACHE_MS = 30_000;
let ageCache = { at: 0, value: null, ok: false, why: "" };

async function estimateAge() {
  if (Date.now() - ageCache.at < AGE_CACHE_MS) return ageCache;
  const r = await getJson(`${NAS}/weights`);
  ageCache = {
    at: Date.now(),
    value: r.ok ? lastEstimateAgeSec(r.data) : null,
    ok: r.ok,
    why: r.ok ? "" : r.why,
  };
  return ageCache;
}

/**
 * สถานะรวม — ตอบ 200 เสมอแม้ปลายทางล่ม เพราะ "ล่ม" คือคำตอบที่หน้าจอต้องใช้
 *
 * ★ ตรวจสองชั้นตามที่ทีมกล้องบอกเอง: `/api/health` ของเขาบอกแค่ว่าเซิร์ฟเวอร์ตอบ
 *   เครื่องที่ค้างกลางทางก็ยังตอบ 200 เหมือนเดิม จึงต้องดูผลประมวลผลจริงด้วย
 */
visionRouter.get("/health", async (_req, res) => {
  const [live, hist] = await Promise.all([getJson(READ_ROUTES.realtime), estimateAge()]);
  const data = live.ok ? live.data?.data : null;
  const fps = Number.isFinite(Number(data?.fps)) ? Number(data.fps) : null;
  const ai = aiVerdict({ reachable: live.ok, fps, lastEstimateAgeSec: hist.value });

  res.json({
    camera: { ok: live.ok, why: live.ok ? null : live.why, fps },
    store: { ok: hist.ok, why: hist.ok ? null : hist.why, lastEstimateAgeSec: hist.value },
    ai,
    counts: live.ok ? pigCounts(data) : null,
    at: new Date().toISOString(),
  });
});

/**
 * ค่าสด — ★ แยก "เห็นในภาพตอนนี้" ออกจาก "สุทธิจากการเดินผ่านเส้นนับ" ให้ชัดตั้งแต่ตรงนี้
 *   สองเลขนี้ตอบคนละคำถาม เอาไปปนกันแล้วตัวเลขฝูงสุกรบนหน้าจอจะผิดโดยไม่มีใครรู้
 */
visionRouter.get("/realtime", async (_req, res) => {
  const r = await getJson(READ_ROUTES.realtime);
  /* ★ ต่อไม่ได้ต้องตอบ 503 ไม่ใช่ตอบเลขเก่าหรือเลขจำลอง หน้าจอจะได้ขึ้น "ไม่มีสัญญาณ" */
  if (!r.ok) throw new AppError(503, "vision_unreachable", r.why);
  const data = r.data?.data ?? {};
  res.json({
    counts: pigCounts(data),
    pigs: Array.isArray(data.pigs) ? data.pigs : [],
    fps: Number.isFinite(Number(data.fps)) ? Number(data.fps) : null,
    hardware: data.hardware ?? null,
    at: new Date().toISOString(),
  });
});

/** ประวัติจากคลังข้อมูล — ส่งต่อตามที่ได้มา ไม่ดัดแปลง */
for (const name of ["sessions", "weights", "counting-events", "videos", "storage"]) {
  visionRouter.get(`/${name}`, async (_req, res) => {
    const r = await getJson(READ_ROUTES[name]);
    if (!r.ok) throw new AppError(503, "vision_unreachable", r.why);
    res.json(r.data);
  });
}

/**
 * ส่งต่อข้อมูลที่ไหลยาว (ภาพสด / ไฟล์วิดีโอ)
 *
 * ★ **ห้ามใส่ timeout กับขาที่ไหลยาว** ภาพสดไม่มีวันจบโดยตัวมันเอง
 *   ใส่แล้วภาพจะดับเองทุก ๆ กี่วินาทีโดยไม่มีใครรู้ว่าทำไม
 * ★ คนดูปิดหน้าต่าง → ต้องตัดขาที่ไปหาเขาด้วย ไม่งั้นกล่องกล้องส่งภาพให้คนที่ไม่อยู่แล้ว
 */
async function pipeThrough(url, req, res, label) {
  const ctrl = new AbortController();
  req.on("close", () => ctrl.abort());
  let upstream;
  try {
    upstream = await fetch(url, { signal: ctrl.signal });
  } catch {
    if (!res.headersSent) throw new AppError(503, "vision_unreachable", "ต่อปลายทางไม่ได้");
    return;
  }
  if (!upstream.ok || !upstream.body) throw new AppError(503, "vision_unreachable", `ปลายทางตอบ ${upstream.status}`);

  res.setHeader("content-type", upstream.headers.get("content-type") || "application/octet-stream");
  const len = upstream.headers.get("content-length");
  if (len) res.setHeader("content-length", len);
  /* ภาพสดห้ามให้ตัวกลางใด ๆ เก็บแคช ไม่งั้นคนดูจะเห็นเฟรมเดิมค้าง */
  res.setHeader("cache-control", "no-store");

  Readable.fromWeb(upstream.body)
    .on("error", () => res.destroy())
    .pipe(res)
    .on("error", (e) => log.warn({ err: e?.message, label }, "ส่งต่อภาพไม่สำเร็จ"));
}
