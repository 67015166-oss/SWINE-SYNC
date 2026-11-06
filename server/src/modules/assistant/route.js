/**
 * สะพานต่อไปยัง "AI ของฟาร์ม" ที่ทีมอื่นในโปรเจกต์นี้ทำไว้ (ota.plotnexuslab.com)
 *
 * ═══ ทำไมต้องผ่านหลังบ้าน ไม่ยิงตรงจากหน้าเว็บ ═══
 * เพราะต้องใช้ **กุญแจ API** และกุญแจนั้นเปิดสิทธิ์คุยกับ AI ของทั้งฟาร์มได้
 * อะไรก็ตามที่อยู่ในโค้ดหน้าเว็บ ผู้ใช้เปิดดูได้หมดจาก DevTools แค่คลิกเดียว
 * ใครก็ตามที่เคยเปิดแดชบอร์ดนี้จะก๊อปกุญแจไปใช้เองได้ตลอดไป
 * ➜ กุญแจจึงอยู่แค่ใน `.env` ของเซิร์ฟเวอร์ **ห้ามย้ายไปฝั่งหน้าเว็บเด็ดขาด**
 *   (คนที่ให้ API มาก็เขียนกำกับไว้แบบเดียวกัน: "ต้องอยู่ใน backend หลังตรวจ session แล้วเท่านั้น")
 *
 * ═══ รูปแบบคำตอบของ AI ตัวนี้: NDJSON (JSON บรรทัดละก้อน) ═══
 * `content-type: application/x-ndjson` เสมอ แต่ข้างในมีสองแบบ:
 *
 *   แบบตอบทันที (ถามค่าเซนเซอร์ตรง ๆ เช่น "วันนี้ฝนตกไหม") — บรรทัดเดียวจบ ~0.5 วิ
 *     {"message":{"role":"assistant","content":"…"},"done":true,"direct":"today_rain"}
 *
 *   แบบให้โมเดลคิด (คำถามที่ต้องสรุป/วิเคราะห์) — หลายสิบบรรทัด ใช้เวลา 20–90 วินาที
 *     {"route":{"model":"qwen3.8:27b","reason":"…"}}      ← เลือกโมเดลแล้ว
 *     {"waiting":6,"queue":0}                              ← ยังไม่เริ่มพิมพ์ รออยู่กี่วิ
 *     {"message":{"content":"","thinking":"The"},"done":false}   ← ความคิดภายใน
 *     {"message":{"content":"สรุป"},"done":false}                ← คำตอบจริงทีละคำ
 *     {"message":{"content":""},"done":true,"done_reason":"stop","answer_id":"…"}
 *
 * ➜ **ต้องส่งต่อแบบไหลทีละบรรทัด ห้ามรอให้จบแล้วค่อยส่ง**
 *   ถ้ารอจนจบ ผู้ใช้จะเห็นห้องแชทนิ่งค้าง 90 วินาทีโดยไม่รู้ว่าพังหรือยัง แล้วก็กดซ้ำ
 *   ที่นี่จึงทำหน้าที่แค่ "ท่อ" — อ่านมาได้เท่าไรก็ปล่อยออกไปเท่านั้น ไม่สะสมไว้ในหน่วยความจำ
 *
 * ═══ ⚠️ เรื่องที่ยังค้างอยู่: ผู้ใช้ ═══
 * AI ฝั่งโน้นรู้จักผู้ใช้จากหัวข้อ `X-CPF-User-ID` และรับเฉพาะ **ชื่อที่ลงทะเบียนไว้กับเขาแล้ว**
 * เท่านั้น (ลองส่ง "admin" ของแดชบอร์ดเราไป → ตอบ 401 unauthorized)
 * ตอนนี้จึงยังต้องแปลงชื่อผู้ใช้ของเราเป็นชื่อฝั่งเขาผ่าน `CPF_AI_USER_MAP` ใน .env
 * และที่สำคัญกว่านั้น: **หลังบ้านเรายังไม่มีระบบยืนยันตัวตน** ชื่อผู้ใช้ที่ส่งมาจึงยัง
 * "เชื่อไม่ได้จริง" — พอทำ /auth เสร็จ (docs/BACKEND.md ข้อ 4) ต้องเปลี่ยนมาอ่านจาก session
 * แทนที่จะอ่านจาก body ตามที่ทำเครื่องหมาย TODO ไว้ข้างล่าง
 */
import { Router } from "express";
import { webSearch } from "./search.js";
import { lookupWeather } from "./weather.js";
import { query } from "../../db/pool.js";
import { requireAuth } from "../../lib/auth.js";

export const assistantRouter = Router();

const UPSTREAM = process.env.CPF_AI_URL || "https://ota.plotnexuslab.com/ai/api";
const API_KEY = process.env.CPF_AI_API_KEY || "";
/** ชื่อผู้ใช้ฝั่ง AI ที่ใช้เมื่อยังไม่ได้ผูกรายคน */
const FALLBACK_USER = process.env.CPF_AI_USER_ID || "";
/** ระดับความลึกของคำตอบที่กุญแจนี้ขอได้ (whoami บอก max_level มาให้) */
const LEVEL = Number(process.env.CPF_AI_LEVEL || 1);

/** แปลงชื่อผู้ใช้ของแดชบอร์ด → ชื่อที่ลงทะเบียนไว้ฝั่ง AI  เช่น {"admin":"test1"} */
function userMap() {
  try {
    return JSON.parse(process.env.CPF_AI_USER_MAP || "{}");
  } catch {
    return {};
  }
}

/* ═══ เรื่องเวลา: นับ "เงียบไปนานแค่ไหน" ไม่ใช่ "ทั้งหมดใช้เวลาเท่าไร" ═══
   ตอนแรกตั้งเพดานรวมไว้ 3 นาที แล้วเจอของจริง: พอมีคนใช้พร้อมกันจนเข้าคิว
   คำถามเดียวใช้เวลาเกิน 3 นาทีได้สบาย ๆ คำตอบที่กำลังจะมาถึงเลยโดนตัดทิ้งเปล่า ๆ
   แต่ระหว่างนั้นฝั่ง AI ส่ง {"waiting":N} มาทุก ~6 วินาทีตลอด
   ➜ "เงียบไป 1 นาทีเต็ม" คือสัญญาณว่าตายจริง ส่วน "ช้า" ไม่ใช่ปัญหาที่ต้องตัด
   เพดานรวมยังมีอยู่แต่ตั้งไว้หลวม ๆ กันกรณีสตรีมไม่ยอมจบเอาไว้เฉย ๆ */
const IDLE_TIMEOUT_MS = 60_000;
const HARD_LIMIT_MS = 600_000;
/* เก็บบทสนทนาย้อนหลังกี่ข้อความ — ยาวไปคือช้าลงและเปลืองโควตาโดยไม่ช่วยอะไร */
const MAX_HISTORY = 10;

/* ═══ ทำไมไม่มีที่ตั้งให้ "ตอบสั้น" ตรงนี้ — ลองแล้วสองวิธี ไม่ได้ผลทั้งคู่ ═══
   คำตอบของ AI ตัวนี้ยาวมากโดยค่าตั้งต้น ถามว่ามีโรคอะไรควรระวังก็ได้มาเป็นรายการยาว
   พร้อมคำอธิบายรายข้อ ทั้งที่ถามแค่ว่ามีอะไรบ้าง — พยายามสั่งให้สั้นจากฝั่งเราแล้ว:

   1. ส่งเป็นข้อความ `role: "system"` นำหน้า → **มันไม่สนใจเลย**
      วัดแล้วคำตอบยาวขึ้นด้วยซ้ำ (917 → 1240 ตัวอักษร)
   2. ต่อท้ายคำถามว่า "(ตอบสั้น กระชับ ไม่เกิน 5 บรรทัด)" → **คุณภาพพัง**
      โมเดลสับสนจนพิมพ์แก้ตัวเองออกมากลางคำตอบ ("ขออภัย — สุนัข...ไม่ใช่ ขอใหม่")
      มีตัวอักษรจีนหลุดปนมา ส่วนความยาวแทบไม่ลด (564 → 560 ตัวอักษร)
   3. `options.num_predict` (จำกัดจำนวนคำ) — ไม่ใช้ เพราะตัดกลางประโยค
      ได้คำตอบสั้นจริงแต่ค้างครึ่งทาง ซึ่งแย่กว่ายาวไป

   ➜ **ความยาวคุมได้จากฝั่งเจ้าของ AI เท่านั้น** (system prompt ของเขา)
     ฝั่งเราแก้ที่หน้าจอแทน: พับคำตอบยาวไว้แล้วให้กด "อ่านคำตอบเต็ม"
     (`as-clamp` ใน `Assistant.jsx`) ข้อความยังอยู่ครบ ไม่ตัดทิ้ง

   ถ้าจะลองใหม่ ให้วัดความยาวเทียบก่อน-หลังจริง ๆ อย่าเชื่อว่าใส่คำสั่งแล้วจะได้ผล
*/

/**
 * ชื่อผู้ใช้จะถูกยัดลงใน HTTP header — ถ้ามีตัวขึ้นบรรทัดใหม่ปนไป
 * คนส่งจะแทรก header ปลอมเพิ่มเองได้ (header injection) จึงเหลือไว้เฉพาะตัวอักษรที่ปลอดภัย
 */
const safeId = (v) => String(v ?? "").replace(/[^A-Za-z0-9._@-]/g, "").slice(0, 64);

const notReady = (res) =>
  res.status(503).json({
    error: {
      code: "ai_not_configured",
      message: "ยังไม่ได้ตั้งกุญแจ AI ที่หลังบ้าน (CPF_AI_API_KEY ใน .env)",
    },
  });

/**
 * GET /api/assistant/status — หน้าเว็บถามก่อนว่า "ต่อ AI จริงได้ไหม"
 *
 * มีไว้เพื่อให้ห้องแชทบอกความจริงได้ตั้งแต่ยังไม่ทันถาม — ต่อไม่ได้ก็ขึ้นว่า
 * ตอบจากข้อมูลตัวอย่าง ไม่ใช่ปล่อยให้ผู้ใช้พิมพ์คำถามไปแล้วค่อยเจอ error
 * **ไม่ส่งกุญแจกลับไปแม้แต่บางส่วน** — ส่งแค่ว่าใช้ได้ไหมกับมีเซนเซอร์อะไรให้ถามบ้าง
 */
/* ต้องล็อกอิน (T1.242) — ไม่งั้นใครก็ยิงให้เราไปเรียก /whoami ของทีม AI ด้วยกุญแจเราได้
   และได้ชื่อบัญชี AI กับรายชื่อจุดวัดกลับไปด้วย · หน้าเว็บถามใหม่เองเมื่อมีคนเข้าระบบ */
assistantRouter.get("/status", requireAuth, async (req, res) => {
  if (!API_KEY || !FALLBACK_USER) return res.json({ ready: false, reason: "no_key" });

  try {
    const upstream = await fetch(`${UPSTREAM}/whoami`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
        "X-CPF-User-ID": FALLBACK_USER,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) return res.json({ ready: false, reason: `http_${upstream.status}` });

    const who = await upstream.json();
    res.json({
      ready: true,
      name: who.name ?? null,
      maxLevel: who.max_level ?? LEVEL,
      /* รายชื่อจุดวัดที่ AI ตัวนี้เห็น — เอาไปขึ้นในห้องแชทให้ผู้ใช้รู้ว่าถามเรื่องอะไรได้ */
      sources: Array.isArray(who.sources) ? who.sources : [],
    });
  } catch {
    res.json({ ready: false, reason: "unreachable" });
  }
});

/**
 * POST /api/assistant/chat — ส่งคำถามต่อไปให้ AI แล้วปล่อยคำตอบไหลกลับ
 *
 * รับ: { messages: [{role, content}], session?: string, user?: string }
 * ตอบ: NDJSON บรรทัดต่อบรรทัดตามที่ AI ส่งมา (รูปแบบเดิมไม่แปลง)
 *      ยกเว้นตอนพัง จะได้บรรทัดเดียว {"error":{code,message}}
 */
assistantRouter.post("/chat", requireAuth, async (req, res, next) => {
  try {
    if (!API_KEY || !FALLBACK_USER) return notReady(res);

    const body = req.body ?? {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const clean = messages
      .filter((m) => m && typeof m.content === "string" && m.content.trim())
      .slice(-MAX_HISTORY)
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content).slice(0, 4000),
      }));

    if (clean.length === 0) {
      return res.status(400).json({
        error: { code: "empty_messages", message: "ไม่มีข้อความให้ถาม" },
      });
    }

    /* TODO(auth): พอทำ /auth เสร็จ ให้เปลี่ยนมาอ่านจาก session ที่ตรวจแล้ว
       ไม่ใช่จาก body ที่ผู้เรียกกรอกมาเอง (docs/BACKEND.md ข้อ 4) */
    const asked = safeId(body.user);
    const externalUser = userMap()[asked] || FALLBACK_USER;

    /* ผู้ใช้ปิดแท็บ/กดยกเลิกกลางคัน = หยุดกวน AI ต่อ ไม่ต้องปล่อยให้คิดจนจบ
       (โมเดลตัวนี้คิดทีละนาที ถ้าไม่ตัดจะค้างคิวไว้เปล่า ๆ)

       **ต้องดัก `res` ไม่ใช่ `req`** — `express.json()` อ่าน body จนหมดตั้งแต่ก่อนเข้ามาถึงตรงนี้
       สายของ `req` จึงจบไปแล้วและยิง "close" ทันที ผลคือยกเลิกคำขอของตัวเองทุกครั้ง
       ได้ ai_unreachable ตลอดโดยที่ฝั่ง AI ยังไม่ทันได้ยินอะไรเลย
       ส่วน "close" ของ `res` แปลว่าผู้ใช้ตัดสายไปจริง ๆ ซึ่งคือสิ่งที่ตั้งใจจะดัก */
    const abort = new AbortController();
    let idleTimer = setTimeout(() => abort.abort(), IDLE_TIMEOUT_MS);
    const hardTimer = setTimeout(() => abort.abort(), HARD_LIMIT_MS);
    /* มีอะไรส่งมา = ยังไม่ตาย ตั้งนาฬิกาใหม่ */
    const keepAlive = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => abort.abort(), IDLE_TIMEOUT_MS);
    };
    const stopTimers = () => {
      clearTimeout(idleTimer);
      clearTimeout(hardTimer);
    };
    res.on("close", () => abort.abort());

    const call = () =>
      fetch(`${UPSTREAM}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
          "X-CPF-User-ID": externalUser,
        },
        body: JSON.stringify({
          model: "auto",
          level: LEVEL,
          session: safeId(body.session) || "swine-dashboard",
          messages: clean,
        }),
        signal: abort.signal,
      });

    /* ลองใหม่ได้ครั้งเดียว และเฉพาะตอน "ต่อไม่ติด/ฝั่งเขาล้ม" เท่านั้น
       ปลอดภัยที่จะลองซ้ำเพราะยังไม่มีอะไรถูกส่งออกไปหาผู้ใช้เลย และคำขอนี้ไม่ได้เขียนอะไร
       **ไม่ลองใหม่กับ 4xx** — กุญแจผิดหรือผู้ใช้ไม่ได้ลงทะเบียน ลองกี่ครั้งก็ผิดเหมือนเดิม
       ได้แค่ถ่วงเวลาให้ผู้ใช้รอเปล่า ๆ
       **ไม่ลองใหม่หลังเริ่มสตรีมแล้ว** — จะได้คำตอบซ้อนกันสองชุดในฟองเดียว */
    const RETRY_ON = new Set([502, 503, 504]);
    let upstream = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        upstream = await call();
        if (upstream.ok || !RETRY_ON.has(upstream.status)) break;
      } catch {
        upstream = null;
      }
      if (abort.signal.aborted) break;
    }

    if (!upstream) {
      stopTimers();
      return res.status(502).json({
        error: { code: "ai_unreachable", message: "ต่อ AI ไม่ได้ ลองใหม่อีกครั้ง" },
      });
    }

    if (!upstream.ok || !upstream.body) {
      stopTimers();
      /* 401 = กุญแจผิด หรือชื่อผู้ใช้ยังไม่ได้ลงทะเบียนฝั่งเขา — แยกข้อความให้ชัด
         ไม่งั้นจะไล่หาสาเหตุไม่เจอ เพราะสองเรื่องนี้ตอบรหัสเดียวกันมา */
      const message =
        upstream.status === 401
          ? `AI ไม่รับคำขอ — กุญแจผิด หรือยังไม่ได้ลงทะเบียนผู้ใช้ "${externalUser}" ฝั่งนั้น`
          : `AI ตอบ ${upstream.status}`;
      return res.status(502).json({ error: { code: "ai_rejected", message } });
    }

    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    /* กัน nginx ตอนขึ้นจริงอมข้อมูลไว้ก่อนแล้วค่อยปล่อยทีเดียว — คำตอบจะไม่ไหลทีละคำ */
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    try {
      for await (const chunk of upstream.body) {
        keepAlive();
        if (res.writableEnded) break;
        res.write(chunk);
      }
    } catch {
      /* สายขาดกลางคัน — เขียนบรรทัดสุดท้ายบอกไว้ ถ้ายังเขียนได้
         (ตอบ 200 ไปแล้วจึงเปลี่ยนรหัสสถานะไม่ได้ ต้องบอกในเนื้อคำตอบแทน) */
      if (!res.writableEnded) {
        res.write(
          `${JSON.stringify({ error: { code: "ai_stream_broken", message: "คำตอบขาดกลางคัน" } })}\n`,
        );
      }
    } finally {
      stopTimers();
      res.end();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/assistant/search — ค้นเว็บ ใช้ตอน AI ตอบไม่ได้
 *
 * แยกเป็นคนละเส้นทางกับ `/chat` ตั้งใจ เพราะคนที่รู้ว่า "AI ตอบไม่ได้" คือหน้าเว็บ
 * — มันต้องอ่านคำตอบจนจบก่อนถึงจะรู้ว่า AI บอกว่าไม่รู้ ตัดสินที่นี่ไม่ได้
 *
 * ค้นไม่เจอ = `results: []` ไม่ใช่ error (ไม่เจอก็คือคำตอบอย่างหนึ่ง)
 */
assistantRouter.post("/search", requireAuth, async (req, res, next) => {
  try {
    const results = await webSearch(req.body?.q);
    res.json({ results });
  } catch (err) { next(err); }
});

/**
 * POST /api/assistant/weather — อากาศของที่อื่นที่ไม่ใช่ฟาร์มเรา
 *
 * มีไว้เพราะ AI ตอบเรื่องนี้ไม่ได้ (ดูเหตุผลเต็มที่หัวไฟล์ `weather.js`)
 * หาไม่เจอ = `weather: null` ไม่ใช่ error — ผู้เรียกจะได้ไปถาม AI ต่อตามปกติ
 */
assistantRouter.post("/weather", requireAuth, async (req, res, next) => {
  try {
    const weather = await lookupWeather(req.body?.place);
    res.json({ weather });
  } catch (err) { next(err); }
});

/**
 * GET /api/assistant/now — ค่าเซนเซอร์ปัจจุบันของทุกโรงเรือนที่ส่งข้อมูลจริง
 *
 * ═══ ทำไมต้องมี ทั้งที่ AI ก็อ่านเซนเซอร์ตัวเดียวกันได้ ═══
 * เพราะมันช้ามาก **วัดแล้ว 28–150 วินาที** สำหรับคำถามที่แค่ "ตอนนี้กี่องศา"
 * ทุกคำถามเรื่องค่าเซนเซอร์ถูกส่งเข้าโมเดลหมด ไม่มีทางลัด และเข้าคิวรวมกับคนอื่นด้วย
 * (ลองระบุชื่อจุดไปตั้งแต่แรกเพื่อเลี่ยงการย้อนถามแล้ว ก็ยังช้าเท่าเดิม)
 *
 * แต่ **ค่าชุดเดียวกันนี้อยู่ในฐานข้อมูลเราเองอยู่แล้ว** — สะพานดึงจาก InfluxDB
 * ที่ Node-RED เขียนไว้ เข้ามาทุก 30 วินาที ค่าล่าสุดจึงเก่าไม่กี่วินาที
 * อ่านจากตรงนี้ใช้เวลาระดับมิลลิวินาที เร็วกว่าเป็นพันเท่าและได้เลขชุดเดียวกัน
 *
 * ➜ "ตอนนี้กี่องศา" ตอบเองทันที · ส่วน "ควรทำยังไงต่อ" ค่อยส่งให้ AI คิด
 *   ใช้แต่ละอย่างให้ตรงกับที่มันเก่ง
 */
/* ค่าเซนเซอร์สดของฟาร์มจริง — ต้องล็อกอิน (T1.242) */
assistantRouter.get("/now", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `select b.id as barn_id, b.name as barn, f.name as farm, f.province,
              v.metric, v.value, v.outdoor, v.at
       from v_barn_current v
       join barn b on b.id = v.barn_id
       join farm f on f.id = b.farm_id
       where f.active and f.data_source = 'live'
       order by f.name, b.name`,
    );

    /* รวมเป็นก้อนละโรงเรือน — หน้าเว็บจะได้ไม่ต้องมาไล่จับคู่เอง */
    const byBarn = new Map();
    for (const r of rows) {
      if (!byBarn.has(r.barn_id)) {
        byBarn.set(r.barn_id, {
          barnId: r.barn_id, barn: r.barn, farm: r.farm, province: r.province,
          at: r.at, indoor: {}, outdoor: {},
        });
      }
      const entry = byBarn.get(r.barn_id);
      entry[r.outdoor ? "outdoor" : "indoor"][r.metric] = Number(r.value);
      /* เวลาที่ใหม่ที่สุดในโรงเรือนนั้น — บอกผู้ใช้ว่าค่านี้สดแค่ไหน */
      if (r.at > entry.at) entry.at = r.at;
    }

    res.json({ barns: [...byBarn.values()] });
  } catch (err) { next(err); }
});
