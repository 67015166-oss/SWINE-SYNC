/**
 * ตัวคุยกับ AI ของฟาร์ม — ผ่านหลังบ้านของเราเสมอ (`/api/assistant/*`)
 *
 * **ไม่ยิงตรงไป ota.plotnexuslab.com** เพราะต้องใช้กุญแจ API ซึ่งอะไรก็ตามที่อยู่ในโค้ด
 * หน้าเว็บ ผู้ใช้เปิดดูได้หมด กุญแจจึงอยู่ที่เซิร์ฟเวอร์ฝั่งเดียว
 * (เหตุผลเต็ม ๆ อยู่หัวไฟล์ `server/src/modules/assistant/route.js`)
 *
 * **ทำไมไม่ใช้ `apiGet`/`apiPut` ใน client.js**
 * สองตัวนั้นรอคำตอบให้ครบก่อนแล้วค่อย `res.json()` และตัดที่ 8 วินาที
 * แต่ AI ตัวนี้ตอบเป็นสายทีละคำ และคำถามที่ต้องให้โมเดลคิดใช้เวลา 20–90 วินาที
 * ถ้าใช้ตัวเดิมจะได้ผลสองอย่างพร้อมกัน: ตัดทิ้งก่อนทุกครั้ง และต่อให้ไม่ตัด
 * ผู้ใช้ก็ต้องนั่งมองจอนิ่ง ๆ จนจบ ไม่เห็นว่ากำลังทำงานอยู่
 * ➜ ตัวนี้จึงอ่านทีละก้อนแล้วส่งออกไปให้ห้องแชทวาดทันที
 */

import { apiConfigured, apiUrl, authHeader } from "./client.js";

/** รูปแบบที่ AI ส่งมาคือ NDJSON — JSON หนึ่งก้อนต่อหนึ่งบรรทัด */
async function* ndjson(body) {
  const reader = body.getReader();
  /* `stream: true` จำเป็น — ตัวอักษรไทยหนึ่งตัวกินหลายไบต์ และก้อนข้อมูลที่ได้มา
     ตัดกลางตัวอักษรได้ตลอด ถ้าถอดรหัสทีละก้อนแบบไม่ต่อกันจะได้ "อ�" โผล่กลางคำ */
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    /* บรรทัดสุดท้ายอาจยังมาไม่ครบ — เก็บค้างไว้รอก้อนถัดไป */
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const text = line.trim();
      if (!text) continue;
      try {
        yield JSON.parse(text);
      } catch {
        /* บรรทัดที่อ่านไม่ออก — ข้ามไป ดีกว่าทิ้งคำตอบทั้งก้อน */
      }
    }
  }

  const last = buffer.trim();
  if (last) {
    try {
      yield JSON.parse(last);
    } catch {
      /* ไม่เป็นไร */
    }
  }
}

export class AiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * ถาม "ต่อ AI จริงได้ไหม" ก่อนผู้ใช้พิมพ์
 * ต่อไม่ได้ = ห้องแชทต้องบอกตั้งแต่แรกว่าตอบจากข้อมูลตัวอย่าง ไม่ใช่ปล่อยให้เพิ่งมารู้ตอนถามไปแล้ว
 * @returns {Promise<{ready: boolean, name?: string, sources?: Array, reason?: string}>}
 */
export async function aiStatus() {
  /* ไม่มีหลังบ้าน = ไม่มี AI จริง ตอบตั้งแต่ตรงนี้โดยไม่ยิงคำขอออกไปไหนเลย
     (สำคัญกว่าแค่ประหยัดคำขอ — สำเนาที่วางบนโฮสต์ของคนอื่นจะได้ไม่ส่งบทสนทนา
      ไปที่ `/api` ของโดเมนนั้น ซึ่งเป็นเซิร์ฟเวอร์ของคนอื่น ดู client.js) */
  if (!apiConfigured) return { ready: false, reason: "no_backend" };
  try {
    const res = await fetch(apiUrl("/assistant/status"), {
      headers: { Accept: "application/json", ...authHeader() },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { ready: false, reason: `http_${res.status}` };
    return await res.json();
  } catch {
    return { ready: false, reason: "unreachable" };
  }
}

/**
 * ส่งคำถามให้ AI แล้วเรียก `onEvent` ทุกครั้งที่มีอะไรคืบหน้า
 *
 * เหตุการณ์ที่ส่งออกไป (แปลงเป็นรูปเดียวแล้ว — ห้องแชทไม่ต้องรู้รูปแบบดิบของ AI):
 *   { type: "waiting", seconds, queue }  ยังไม่เริ่มพิมพ์ — `seconds` คือ "รอมาแล้วกี่วินาที"
 *                                 (ไม่ใช่คำทำนายว่าอีกกี่วินาทีจะเสร็จ) `queue` คือคิวข้างหน้า
 *   { type: "thinking" }          โมเดลกำลังคิดอยู่ (ยังไม่มีคำตอบออกมา)
 *   { type: "delta", text }       คำตอบเพิ่มมาอีกชิ้น — ต่อท้ายของเดิม
 *
 * @returns {Promise<{text: string, answerId?: string, direct?: string}>} คำตอบเต็มเมื่อจบ
 */
export async function askAi({ messages, session, user, onEvent, signal }) {
  /* กันชั้นสุดท้าย — ห้ามส่งบทสนทนาออกไปเมื่อไม่รู้ว่าปลายทางเป็นเซิร์ฟเวอร์ของใคร */
  if (!apiConfigured) throw new Error("ยังไม่ได้ต่อกับเซิร์ฟเวอร์ของ SWINE SYNC");
  const res = await fetch(apiUrl("/assistant/chat"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
      ...authHeader(),
    },
    body: JSON.stringify({ messages, session, user }),
    signal,
  });

  if (!res.ok || !res.body) {
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    throw new AiError(
      payload?.error?.code ?? "http_error",
      payload?.error?.message ?? `AI ตอบ ${res.status}`,
    );
  }

  let text = "";
  let answerId;
  let direct;

  for await (const line of ndjson(res.body)) {
    /* หลังบ้านเขียนบรรทัด error ต่อท้ายได้ ถ้าสายขาดหลังส่งหัวไปแล้ว */
    if (line.error) {
      throw new AiError(line.error.code ?? "ai_error", line.error.message ?? "AI ขัดข้อง");
    }

    if (typeof line.waiting === "number") {
      /* `waiting` นับขึ้นเรื่อย ๆ ว่ารอมาแล้วกี่วินาที — **ไม่ใช่เวลาที่เหลือ**
         เอาไปเขียนว่า "อีก ~54 วิ" ไม่ได้ ผู้ใช้จะรอแล้วรู้สึกว่าโดนหลอก */
      onEvent?.({ type: "waiting", seconds: line.waiting, queue: line.queue ?? 0 });
      continue;
    }

    const msg = line.message;
    if (msg) {
      /* `thinking` คือความคิดภายในของโมเดล **ห้ามเอาไปแสดงเป็นคำตอบ** —
         มันเป็นภาษาอังกฤษดิบ ๆ ยาวกว่าคำตอบจริงหลายเท่า และมักมีการเดาผิดระหว่างทาง
         ใช้ได้แค่เป็นสัญญาณว่า "ยังทำงานอยู่" เพื่อไม่ให้ห้องแชทดูค้าง */
      if (msg.thinking && !msg.content) onEvent?.({ type: "thinking" });
      if (msg.content) {
        text += msg.content;
        onEvent?.({ type: "delta", text: msg.content });
      }
    }

    if (line.answer_id) answerId = line.answer_id;
    if (line.direct) direct = line.direct;
  }

  if (!text.trim()) throw new AiError("empty_answer", "AI ไม่ได้ตอบอะไรกลับมา");
  return { text, answerId, direct };
}

/**
 * ค้นเว็บ — ทางถอยตอน AI ตอบไม่ได้
 *
 * ⚠️ **ผลที่ได้เป็นข้อความจากเว็บของคนอื่น ไม่ใช่คำตอบที่ตรวจสอบแล้ว**
 * เอาไปแสดงเป็นข้อความล้วนพร้อมลิงก์เท่านั้น ห้ามเอาไปทำอย่างอื่นต่อ
 * และห้ามทำให้หน้าตาเหมือนคำตอบของผู้ช่วย — ผู้ใช้ต้องแยกออกว่านี่คือ
 * "ผลค้นที่ยังไม่มีใครกลั่นกรอง" ไม่ใช่ "คำตอบ"
 *
 * @returns {Promise<Array<{title, url, snippet, site}>>} ค้นไม่ได้ = อาร์เรย์ว่าง ไม่โยน error
 */
export async function searchWeb(query) {
  if (!apiConfigured) return [];
  try {
    const res = await fetch(apiUrl("/assistant/search"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...authHeader(),
      },
      body: JSON.stringify({ q: query }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    const { results } = await res.json();
    return Array.isArray(results) ? results : [];
  } catch {
    return [];
  }
}

/**
 * AI ตอบมาแล้ว แต่เนื้อความแปลว่า "ไม่รู้" หรือเปล่า
 *
 * **ตั้งใจให้จับแคบ** จับกว้างเกินแล้วเจอผลข้างเคียงที่แย่กว่าปัญหาเดิม:
 * คำตอบดี ๆ ที่มีคำว่า "ไม่พบฝนล่าสุด" อยู่ในนั้นจะถูกตัดสินว่าเป็นคำตอบเสีย
 * แล้วเอาผลค้นเว็บไปแปะต่อท้ายทั้งที่ไม่ต้องการ
 * ➜ ใช้เฉพาะวลีที่แปลว่าไม่รู้จริง ๆ เท่านั้น จับพลาดบ้างยังดีกว่ารบกวนคำตอบที่ถูกอยู่แล้ว
 */
export function soundsUnanswered(text) {
  const t = String(text ?? "");
  return [
    "ไม่มีข้อมูล",
    "ไม่พบข้อมูล",
    "ไม่สามารถตอบ",
    "ไม่สามารถให้ข้อมูล",
    "ตอบไม่ได้",
    "อยู่นอกขอบเขต",
    "ไม่อยู่ในขอบเขต",
    "ไม่รองรับคำถาม",
  ].some((phrase) => t.includes(phrase));
}

/**
 * ดึงอากาศของสถานที่หนึ่ง (ที่ไม่ใช่ฟาร์มเรา)
 * @returns {Promise<object|null>} หาไม่เจอ/ล่ม → null
 */
export async function fetchWeather(place) {
  if (!apiConfigured) return null;
  try {
    const res = await fetch(apiUrl("/assistant/weather"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...authHeader(),
      },
      body: JSON.stringify({ place }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const { weather } = await res.json();
    return weather ?? null;
  } catch {
    return null;
  }
}

/**
 * ค่าเซนเซอร์ปัจจุบันของโรงเรือนที่ส่งข้อมูลจริง — อ่านจากฐานข้อมูลเรา ไม่ผ่าน AI
 * ใช้เวลาระดับ 0.1 วินาที เทียบกับ 28–150 วินาทีถ้าถาม AI (วัดแล้ว)
 * @returns {Promise<Array>} ล่ม/ไม่มีข้อมูล → อาร์เรย์ว่าง
 */
export async function fetchNow() {
  if (!apiConfigured) return [];
  try {
    const res = await fetch(apiUrl("/assistant/now"), {
      headers: { Accept: "application/json", ...authHeader() },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const { barns } = await res.json();
    return Array.isArray(barns) ? barns : [];
  } catch {
    return [];
  }
}
