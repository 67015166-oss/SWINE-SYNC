/**
 * ถาม "ระบบวอยซ์ Farmy" ของทีมอื่นในโปรเจกต์ — **ผ่านหลังบ้านของเราเสมอ** (`/api/farmy/*`)
 *
 * เจ้าของระบบส่งโมดูลมาให้ฝัง (`voice-module/` · 16 ก.ย. 2569) ซึ่งเขียนไว้ให้ยิงตรง
 * จากเบราว์เซอร์ไปที่ `fern.plotnexuslab.com` แต่เราทำแบบนั้นไม่ได้ด้วยสองเหตุผล
 * (เขียนละเอียดไว้ที่ `server/src/modules/farmy/route.js`):
 *   1. ด่านหน้าของเขาไม่ยอมให้หัวข้อ `X-Admin-Token` ผ่าน preflight — เบราว์เซอร์บล็อกทิ้ง
 *   2. token ของเขาเป็นสิทธิ์ผู้ดูแลทั้งระบบ ห้ามเก็บใน localStorage ของหน้าเว็บ
 *
 * ที่นี่จึงเหลือแค่ "คุยกับหลังบ้านของเรา" — รูปแบบ `history` ยังเป็นของฝั่งเขา
 * (`role` เป็น `user` / `model` ไม่ใช่ `assistant` แบบ AI ตัวอื่น) เพื่อส่งต่อได้ตรง ๆ
 */
import { apiConfigured, apiUrl, authHeader } from "./client.js";

/** ระบบวอยซ์พร้อมใช้ไหม — ถามครั้งเดียวต่อการเปิดแอปหนึ่งครั้ง */
export async function farmyStatus() {
  if (!apiConfigured) return { ready: false };
  try {
    const res = await fetch(apiUrl("/farmy/status"), {
      headers: { Accept: "application/json", ...authHeader() },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ready: false };
    return await res.json();
  } catch {
    return { ready: false };
  }
}

/**
 * ถามหนึ่งคำถาม
 * @param {string} text
 * @param {Array<{role: "user"|"model", text: string}>} history ไม่กี่เทิร์นล่าสุดพอ
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>} คำตอบสั้น ๆ พร้อมอ่านออกเสียง
 */
export async function farmyAsk(text, history = [], signal) {
  const res = await fetch(apiUrl("/farmy/ask"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ text, history }),
    signal,
  });
  if (!res.ok) {
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    throw Object.assign(new Error(payload?.error?.message ?? `ระบบวอยซ์ตอบ ${res.status}`), {
      code: payload?.error?.code ?? "farmy_error",
    });
  }
  const data = await res.json();
  return String(data?.answer ?? "").trim();
}
