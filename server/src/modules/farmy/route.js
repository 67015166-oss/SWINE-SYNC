/**
 * สะพานต่อไปยัง "ระบบวอยซ์ Farmy" ของทีมอื่นในโปรเจกต์นี้ (voice-ai-q94g.onrender.com)
 *
 * ★ ที่อยู่จริงเปลี่ยนแล้ว (29 ก.ย. 2569): โฮสต์เดิม fern.plotnexuslab.com **ดับ** (ตอบ 503)
 *   ของจริงที่รันอยู่คือ `https://voice-ai-q94g.onrender.com` — หาเจอจาก bundle ของหน้าเว็บ
 *   farmy-web.onrender.com (SPA เรียก API ตัวนี้) ตั้งทับได้ที่ตัวแปร `FARMY_URL` ใน .env
 *   ทีมวอยซ์อาจย้ายโฮสต์อีก ถ้าวันหนึ่ง /health ตอบ 404/503 ให้เปิด bundle ของหน้าเว็บเขา
 *   แล้ว grep หา onrender เพื่อดู base ใหม่ (ดู docs/RUNBOOK.md)
 *
 * เจ้าของระบบส่งชุดโมดูลมาให้ฝัง (`voice-module/` ใน farmy-voice-full.zip · 16 ก.ย. 2569)
 * เขามีให้ใช้แค่สองเส้นทาง: `POST /admin/login` → token · `POST /ask` → คำตอบสั้น ๆ
 *
 * ═══ ทำไมต้องผ่านหลังบ้าน ทั้งที่โมดูลของเขาเขียนไว้ให้ยิงตรงจากหน้าเว็บ ═══
 *
 * 1. **ยิงตรงจากเบราว์เซอร์ไม่ผ่าน CORS** — ทดสอบแล้ว (17 ก.ย. 2569) ด่านหน้าของเขา
 *    ตอบ preflight ว่า `access-control-allow-headers: Authorization, Content-Type, Accept`
 *    ซึ่ง **ไม่มี `X-Admin-Token`** ที่ `/ask` บังคับ เบราว์เซอร์จึงบล็อกทิ้งก่อนส่งด้วยซ้ำ
 *    (ตัว FastAPI ของเขาตั้ง `allow_headers=["*"]` ไว้ แต่มีตัวอื่นตอบ preflight แทน)
 *    เรียกจากเซิร์ฟเวอร์ถึงเซิร์ฟเวอร์ไม่มีเรื่อง CORS เลย
 *
 * 2. **token ของเขาคือสิทธิ์ผู้ดูแลทั้งระบบ** (`/ask` อยู่นอก allowlist ของเขา)
 *    เก็บไว้ใน localStorage ของเบราว์เซอร์แบบที่โมดูลเขาทำ = ใครเปิด DevTools ก็ก๊อปไปใช้ได้
 *    กติกาเดียวกับกุญแจ AI ของ CPF: **ของแบบนี้อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * ═══ 29 ก.ย. 2569: เอกสารชุดใหม่บอกว่า `/ask` เป็นเส้นทาง "เปิด" แล้ว (T1.288) ═══
 * (`ฟาร์มมี่-ส่งทีมแดชบอร์ด-2026-09-29.zip` → รายการ-API-ทั้งหมด.csv และเอกสารระบบ ข้อ 5)
 * ของเดิมที่นี่ **บังคับล็อกอินก่อนถามทุกครั้ง** ซึ่งตอนนี้ไม่จำเป็นแล้ว และมีผลเสียจริง:
 *   · ไม่มีบัญชีใน `.env` = เราบอกว่า "ยังไม่พร้อม" แล้วไม่ถามเลย ทั้งที่ถามได้
 *   · ยิง `/admin/login` ทุกครั้งที่ token หาย = เสี่ยงให้เขาล็อกบัญชีเรา
 * ➜ ตอนนี้ **ถามโดยไม่ต้องมี token** และแนบ token ให้ก็ต่อเมื่อบังเอิญมีอยู่แล้ว
 *   ถ้าเซิร์ฟเวอร์ตัวที่รันจริงยังบังคับ auth อยู่ (ตอบ 401) ค่อยล็อกอินแล้วลองใหม่ครั้งเดียว
 *   — เดินได้ทั้งสองแบบโดยไม่ต้องเดาว่าเขาอัปเดตเวอร์ชันไหนไปแล้ว
 *
 * ═══ ⚠️ ข้อจำกัดที่ยังอยู่: บัญชีเดียวใช้ร่วมกันทุกคน ═══
 * เส้นทางที่ **เขียนข้อมูล** ยังต้องล็อกอิน และเราใช้บัญชีเดียวจาก `.env`
 * **ฝั่ง Farmy จึงแยกไม่ออกว่าใครทำ** — ถ้าจะใช้จริงต้องรอ SSO (T1.244)
 * หรือให้เขาออก token รายคนให้ (การ "ถาม" อย่างเดียวไม่ติดข้อนี้แล้ว)
 * ด่านของเราเองยังอยู่ครบ: ต้องล็อกอินแดชบอร์ดก่อนถึงจะเรียกได้ (requireAuth)
 */
import { Router } from "express";
import { requireAuth } from "../../lib/auth.js";
import { notFound } from "../../lib/error.js";

export const farmyRouter = Router();

const BASE = (process.env.FARMY_URL || "https://voice-ai-q94g.onrender.com").replace(/\/$/, "");
const USERNAME = process.env.FARMY_USERNAME || "";
const PASSWORD = process.env.FARMY_PASSWORD || "";

export const farmyConfigured = Boolean(USERNAME && PASSWORD);

/** คำถามหนึ่งข้อไม่ควรใช้เกินนี้ — ของเขาตอบสั้น ๆ ไม่ได้สตรีม */
const TIMEOUT_MS = 30_000;

/* token ที่ล็อกอินไว้ — ของเขามีอายุ 7 วัน เก็บในหน่วยความจำพอ
   รีสตาร์ทแล้วล็อกอินใหม่เองอัตโนมัติ ไม่ต้องเก็บลงฐานข้อมูลให้เป็นภาระอีกที่ */
let token = "";
let loginPromise = null;
/* ล็อกอินไม่ผ่านครั้งล่าสุดเมื่อไหร่ และเพราะอะไร
   **ห้ามลองใหม่ทุกคำถาม** — รหัสผิดแล้วยิง /admin/login รัว ๆ ใส่เซิร์ฟเวอร์ของทีมอื่น
   ดูเหมือนคนพยายามเดารหัส (และเขาอาจแบนไอพีเรา) รอให้ครบเวลาก่อนค่อยลองใหม่ */
let lastFail = { at: 0, bad: false };
/** รหัสผิด — รอนานก่อนลองใหม่ ยิงซ้ำ ๆ คือเสี่ยงให้เขาล็อกบัญชีเรา (เขาเตือนตั้งแต่ครั้งที่สอง) */
const RETRY_MS = 60_000;
/** ต่อไม่ได้/เขาหลับอยู่ — ไม่ใช่เรื่องบัญชี ไม่ต้องรอนาน แค่กันยิงรัวในวินาทีเดียวกัน */
const SOFT_RETRY_MS = 5_000;

/**
 * เซิร์ฟเวอร์ของเขาหลับเมื่อไม่มีคนใช้ (Render) ตื่นมาตอบ 5xx ครั้งแรกได้
 * README ของโมดูลบอกไว้ตรง ๆ ว่า "5xx/ต่อไม่ได้ = ลองซ้ำ 1 ครั้งหลัง 3 วิ"
 * **ลองซ้ำเฉพาะ 5xx** — 401 คือบัญชีผิด ยิงซ้ำไม่ได้ช่วยอะไรนอกจากพาไปโดนล็อก
 */
const WAKE_MS = 3_000;
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

const loginOnce = () =>
  fetch(`${BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

async function login() {
  let res = await loginOnce();
  if (res.status >= 500) {
    await wait(WAKE_MS);
    res = await loginOnce();
  }
  if (!res.ok) {
    /* 401 = บัญชีผิด (ไม่ใช่เน็ตมีปัญหา) — แยกไว้เพื่อบอกสาเหตุให้ตรงและกันยิงซ้ำ */
    lastFail = { at: Date.now(), bad: res.status === 401 };
    throw Object.assign(new Error(`farmy login ${res.status}`), { status: res.status });
  }
  const data = await res.json();
  token = data?.token || "";
  if (!token) throw new Error("farmy login ไม่ได้ token กลับมา");
  return token;
}

/** ล็อกอินครั้งเดียวต่อหนึ่งช่วงเวลา — คำถามที่มาพร้อมกันต้องไม่ยิง login พร้อมกันหลายรอบ */
function ensureToken() {
  if (token) return Promise.resolve(token);
  if (lastFail.at && Date.now() - lastFail.at < (lastFail.bad ? RETRY_MS : SOFT_RETRY_MS)) {
    return Promise.reject(
      Object.assign(new Error("farmy login ล้มเหลวเมื่อสักครู่"), { status: lastFail.bad ? 401 : 502 }),
    );
  }
  loginPromise ??= login()
    .then((t) => {
      lastFail = { at: 0, bad: false };
      return t;
    })
    .catch((err) => {
      if (!lastFail.at) lastFail = { at: Date.now(), bad: false };
      throw err;
    })
    .finally(() => {
      loginPromise = null;
    });
  return loginPromise;
}

/**
 * ยิง `/ask` หนึ่งครั้ง
 *
 * **ไม่เรียก `ensureToken()`** — `/ask` เป็นเส้นทางเปิด การบังคับล็อกอินก่อนถาม
 * ทำให้ระบบใช้ไม่ได้เมื่อไม่มีบัญชี และยิง `/admin/login` บ่อยกว่าที่จำเป็น
 * แนบ token ให้ก็ต่อเมื่อ **บังเอิญมีอยู่แล้ว** จากงานอื่น (เขาเพิกเฉย header นี้ถ้าไม่ต้องใช้)
 */
async function askOnce(text, history) {
  const res = await fetch(`${BASE}/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Admin-Token": token } : {}),
    },
    body: JSON.stringify({ text, history }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res;
}

/**
 * ระบบวอยซ์พร้อมใช้ไหม — หน้าจอถามก่อนเพื่อจะได้บอกผู้ใช้ตั้งแต่ก่อนพูด
 *
 * ถาม `GET /health` ซึ่งเป็นเส้นทางเปิด **ไม่ใช่ลองล็อกอิน** (T1.288)
 * เพราะสิ่งที่หน้าจอต้องรู้คือ "ถามได้ไหม" ไม่ใช่ "บัญชีเราใช้ได้ไหม" — และการถาม
 * ไม่ต้องใช้บัญชีแล้ว ถ้าผูกสองอย่างนี้ไว้ด้วยกัน ระบบจะบอกว่าไม่พร้อมทั้งที่ใช้ได้
 *
 * `canWrite` บอกแยกไว้ต่างหาก สำหรับเส้นทางที่ต้องล็อกอินจริง ๆ (บันทึกวัคซีน · งานฟาร์ม)
 */
farmyRouter.get("/status", requireAuth, async (_req, res) => {
  try {
    const up = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (up.ok) return res.json({ ready: true, base: BASE, canWrite: farmyConfigured });
    /* ตอบมาแต่ไม่ใช่ 200 — เช่น 503 พร้อมข้อความว่ากล่องของเขายังไม่ได้เปิดแอป
       ส่งเหตุผลของเขาต่อไปให้หน้าจอตรง ๆ ดีกว่าเขียนเอาเองว่า "ต่อไม่ได้" */
    const why = await up.json().catch(() => null);
    return res.json({
      ready: false,
      reason: why?.error ? `ระบบวอยซ์: ${why.error}` : `ระบบวอยซ์ตอบ ${up.status}`,
    });
  } catch (err) {
    /* ★ "หมดเวลา" ไม่ใช่ "ต่อไม่ได้" — แยกให้ออก ไม่งั้นเราโกหกผู้ใช้
       โฮสต์ฟรีของเขา (Render) หลับเมื่อไม่มีคนใช้ แล้วตื่นช้ากว่าเวลาที่เรารอ
       วัดเมื่อ 12 ต.ค. 2569: ครั้งแรกหมดเวลาที่ 25 วิ · ครั้งถัดไปตอบใน 0.28 วิ
       บอกว่า "ต่อเซิร์ฟเวอร์ไม่ได้" ทั้งที่เขาแค่หลับ = คนเลิกใช้ทั้งที่รออีกนิดก็ได้
       และการถามครั้งนี้เองคือตัวปลุกเขา ถามซ้ำอีกครั้งจึงมักได้เลย
       (กติกาเดียวกับ "ไม่ตอบ ≠ ดับ" ของกล่อง — เขียนตามอาการ ห้ามเดาสาเหตุ) */
    const sleeping = err?.name === "TimeoutError" || err?.name === "AbortError";
    res.json({
      ready: false,
      reason: sleeping
        ? "ระบบวอยซ์กำลังตื่นจากหลับ ลองอีกครั้งในอีกสักครู่"
        : "ต่อเซิร์ฟเวอร์ Farmy ไม่ได้",
    });
  }
});

/**
 * ═══ ดึงข้อมูลอ่านอย่างเดียวจากฝั่ง Farmy (T1.290) ═══
 *
 * เอกสารชุด 29 ก.ย. 2569 บอกว่ามี **47 เส้นทางที่เปิดอ่านได้โดยไม่ต้องล็อกอิน**
 * เราหยิบมาเฉพาะที่แดชบอร์ดเราไม่มีข้อมูลเองเลย: วัคซีนใกล้ครบกำหนด · งานฟาร์มวันนี้ ·
 * เคสที่ปรึกษาสัตวแพทย์
 *
 * ★ **เป็น allowlist ไม่ใช่พร็อกซีเปิด** — ห้ามให้หน้าเว็บเลือกปลายทางเองเด็ดขาด
 *   ถ้าเปิดให้ส่ง path มาได้ ใครก็ยิงเข้าเครือข่ายภายในผ่านเซิร์ฟเวอร์เราได้ทันที
 *   เพิ่มเส้นทางใหม่ = เพิ่มบรรทัดใน READS ที่นี่ที่เดียว
 *
 * ★ **อ่านอย่างเดียว** เส้นทางที่เขียนข้อมูล (รับงาน · บันทึกผล · ตอบเคส) ยังไม่เปิด
 *   เพราะเราใช้บัญชีเดียวร่วมกันทุกคน ฝั่งเขาจะแยกไม่ออกว่าใครทำ (ดูหัวไฟล์)
 *   จะเปิดได้ต้องรอ SSO (T1.244) — จนกว่าจะถึงตอนนั้น ให้ไปกดในเว็บของเขาเอง
 */
const READS = {
  "vaccine-due": { path: "/vaccine-due?days=7", label: "วัคซีนใกล้ครบกำหนด" },
  "farm-tasks": { path: "/farm-tasks", label: "งานฟาร์มวันนี้" },
  "vet-posts": { path: "/vet-posts", label: "เคสที่ปรึกษาสัตวแพทย์" },
};

/* เซิร์ฟเวอร์ของเขาเป็นโฮสต์ฟรีที่หลับเมื่อไม่มีคนใช้ และตื่นช้า
   เก็บคำตอบไว้สั้น ๆ กันหน้าเว็บที่รีเฟรชบ่อยยิงซ้ำใส่เขาโดยเปล่าประโยชน์
   สั้นแค่นี้เพราะข้อมูลพวกนี้เปลี่ยนระหว่างวัน คนต้องเห็นของใหม่ ไม่ใช่ของเมื่อชั่วโมงก่อน */
const CACHE_MS = 30_000;
const cache = new Map();

farmyRouter.get("/data/:key", requireAuth, async (req, res, next) => {
  try {
    const item = READS[req.params.key];
    if (!item) throw notFound(`ชุดข้อมูล "${req.params.key}"`);

    const hit = cache.get(req.params.key);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      return res.json({ ...hit.body, cached: true });
    }

    /* ★ เส้นอ่านพวกนี้ **ต้องล็อกอินฝั่ง Farmy** บนเซิร์ฟเวอร์ตัวที่รันจริง (ตอบ 401 ถ้าไม่มี token)
       เอกสารชุดเก่าเขียนว่า "เปิดอ่านได้" แต่ของจริงไม่ใช่แล้ว — พิสูจน์ 29 ก.ย.: แนบ token แล้ว
       /vaccine-due คืนข้อมูลจริง ไม่แนบแล้วได้ 401 ทุกครั้ง
       จึงแนบ token ไปตั้งแต่ครั้งแรก (เหมือน api.js ของเขาที่แนบ X-Admin-Token ให้เสมอ)
       แล้วถ้ายัง 401 (token หมดอายุ 7 วัน) ขอใหม่แล้วลองอีกครั้งเดียว เหมือนที่ /ask ทำ */
    const fetchRead = (tok) =>
      fetch(`${BASE}${item.path}`, {
        headers: { Accept: "application/json", ...(tok ? { "X-Admin-Token": tok } : {}) },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

    let tok = token;
    if (!tok && farmyConfigured) {
      try {
        tok = await ensureToken();
      } catch {
        /* ล็อกอินไม่ผ่าน/ถูกหน่วงอยู่ — ยิงแบบไม่มี token ไปก่อน แล้วให้ 401 ข้างล่างจัดการ */
      }
    }
    let up = await fetchRead(tok);
    if (up.status === 401 && farmyConfigured) {
      token = "";
      try {
        up = await fetchRead(await ensureToken());
      } catch {
        /* ยังล็อกอินไม่ได้ — ปล่อย 401 เดิมไปให้ข้างล่างตอบ 502 */
      }
    }
    /* โฮสต์ฟรีเพิ่งตื่นจากหลับ ตอบ 5xx ครั้งแรกได้ — ลองซ้ำครั้งเดียวเหมือน /ask */
    if (up.status >= 500) {
      await wait(WAKE_MS);
      up = await fetchRead(token || tok);
    }
    if (!up.ok) {
      /* ส่งเหตุผลของเขาต่อไปตรง ๆ — ข้อความของเขาบอกวิธีแก้ในตัว เช่นบอกว่ากล่องยังไม่ได้เปิดแอป */
      const why = await up.json().catch(() => null);
      return res.status(502).json({
        error: {
          code: "farmy_error",
          message: why?.error ? `${item.label}: ${why.error}` : `${item.label} — ระบบวอยซ์ตอบ ${up.status}`,
        },
      });
    }

    const body = { key: req.params.key, label: item.label, data: await up.json() };
    cache.set(req.params.key, { at: Date.now(), body });
    res.json(body);
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return res.status(504).json({ error: { code: "farmy_timeout", message: "ระบบวอยซ์ตอบช้าเกินไป" } });
    }
    next(err);
  }
});

/**
 * ถามระบบวอยซ์ — `{ text, history?: [{role:'user'|'model', text}] }`
 *
 * `history` ส่งแค่ไม่กี่เทิร์นล่าสุดตามที่โมดูลของเขาแนะนำ (ฝั่งเขาตัดซ้ำอีกชั้น)
 * ตัดให้ที่นี่ด้วย เพราะหน้าเว็บส่งอะไรมาก็ได้ และของยาวเกินไปเปลืองโควตาเขาเปล่า ๆ
 */
farmyRouter.post("/ask", requireAuth, async (req, res, next) => {
  try {
    const text = String(req.body?.text ?? "").trim();
    if (!text) return res.status(400).json({ error: { code: "empty", message: "ไม่มีคำถาม" } });
    const history = Array.isArray(req.body?.history)
      ? req.body.history
          .slice(-6)
          .filter((m) => m && typeof m.text === "string")
          .map((m) => ({ role: m.role === "model" ? "model" : "user", text: m.text.slice(0, 2000) }))
      : [];

    let upstream = await askOnce(text.slice(0, 2000), history);

    /* 401 มีได้สองเหตุ และแก้ทางเดียวกัน: ขอ token ใหม่แล้วลองอีกครั้งเดียว
         · token เดิมหมดอายุ (ของเขาอยู่ 7 วัน)
         · เซิร์ฟเวอร์ตัวที่รันจริงยังเป็นเวอร์ชันที่บังคับ auth กับ `/ask` อยู่
       ไม่มีบัญชีใน `.env` ก็ไม่ต้องดิ้น — ปล่อย 401 ไปให้หน้าเว็บถอยไปใช้ AI ของ CPF */
    if (upstream.status === 401 && farmyConfigured) {
      token = "";
      try {
        await ensureToken();
        upstream = await askOnce(text.slice(0, 2000), history);
      } catch {
        /* ล็อกอินไม่ผ่านด้วย — ปล่อย 401 เดิมไป ข้างล่างจะตอบ 502 ให้หน้าเว็บถอย */
      }
    }

    /* เขาเพิ่งตื่นจากหลับ — ลองซ้ำครั้งเดียวตามที่ README ของโมดูลบอก
       ไม่ลองซ้ำกับ timeout เพราะรอไปแล้ว 30 วินาที คนที่ถามด้วยเสียงรอต่ออีกไม่ไหว
       (ตกไปใช้ AI ของ CPF เร็ว ๆ ดีกว่าให้จอค้างอยู่นาทีหนึ่งแล้วค่อยบอกว่าไม่ได้) */
    if (upstream.status >= 500) {
      await wait(WAKE_MS);
      upstream = await askOnce(text.slice(0, 2000), history);
    }

    if (!upstream.ok) {
      return res.status(502).json({
        error: { code: "farmy_error", message: `ระบบวอยซ์ตอบ ${upstream.status}` },
      });
    }

    const data = await upstream.json();
    const answer = String(data?.answer ?? "").trim();
    if (!answer) {
      return res
        .status(502)
        .json({ error: { code: "empty_answer", message: "ระบบวอยซ์ไม่ได้ตอบอะไรกลับมา" } });
    }
    res.json({ answer });
  } catch (err) {
    /* ต่อไม่ได้/หมดเวลา — ไม่ใช่ความผิดของผู้ใช้ ตอบให้ชัดแล้วให้หน้าเว็บถอยไปใช้ทางอื่น */
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return res
        .status(504)
        .json({ error: { code: "farmy_timeout", message: "ระบบวอยซ์ตอบช้าเกินไป" } });
    }
    if (err?.status) {
      return res
        .status(502)
        .json({ error: { code: "farmy_login", message: "เข้าระบบวอยซ์ไม่สำเร็จ ตรวจบัญชีใน .env" } });
    }
    next(err);
  }
});
