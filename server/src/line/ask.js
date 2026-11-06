/**
 * ส่งคำถามที่พิมพ์ในไลน์ไปถาม AI ของฟาร์ม แล้วตอบกลับในไลน์ (T1.323)
 *
 * ═══ ★★ ข้อจำกัดที่กำหนดรูปร่างของไฟล์นี้ทั้งไฟล์ ═══
 * AI ตัวนี้ตอบสองจังหวะ (ดู server/src/modules/assistant/route.js)
 *   · **ตอบทันที** — คำถามค่าเซนเซอร์ตรง ๆ ใช้เวลา ~0.5 วินาที ส่งมาบรรทัดเดียวจบ
 *   · **ให้โมเดลคิด** — คำถามที่ต้องวิเคราะห์ ใช้ **20–90 วินาที** ส่งมาหลายสิบบรรทัด
 *
 * ไลน์ให้ตอบกลับได้ด้วย reply token ที่ใช้ได้ครั้งเดียวและมีอายุสั้น
 * ถ้ารอโมเดลคิด 90 วินาที token จะหมดอายุก่อน แล้วคำตอบจะไปไม่ถึงใครเลย
 *
 * ★ ทางที่ **ไม่** เลือก: ตอบ "กำลังคิด…" ก่อนแล้วส่งคำตอบจริงทีหลังด้วย `push`
 *   เพราะ `push` **กินโควตา 300 ข้อความ/เดือน** ถ้าถามวันละสิบคำถามก็หมดโควตาในเดือนเดียว
 *   แล้วเดือนนั้นจะส่งแจ้งเตือนเรื่องหมูตายไม่ได้ ซึ่งสำคัญกว่าการตอบคำถามมาก
 *
 * ★ ทางที่เลือก: **รับแค่คำตอบที่มาทันเวลา** ถ้าจะช้าก็บอกตรง ๆ แล้วส่งลิงก์ไปคุยต่อในเว็บ
 *   ซึ่งไม่มีข้อจำกัดเรื่องเวลา · ผลคือการถามในไลน์ **ไม่กินโควตาเลยแม้แต่ข้อความเดียว**
 */
import { BUDGET_MS, MAX_REPLY, readFast } from "./askStream.js";

const UPSTREAM = process.env.CPF_AI_URL || "https://ota.plotnexuslab.com/ai/api";
const API_KEY = process.env.CPF_AI_API_KEY || "";
const AI_USER = process.env.CPF_AI_USER_ID || "";
const LEVEL = Number(process.env.CPF_AI_LEVEL || 1);

/**
 * ตั้งกุญแจครบหรือยัง — ต้องอยู่ไฟล์เดียวกับตัวแปรที่มันอ่าน
 *
 * ★ รอบแรกแยกไฟล์แล้วเผลอย้ายฟังก์ชันนี้ไปไว้กับตัวอ่านสตรีม ซึ่งไม่มีตัวแปรพวกนี้
 *   ผลคือจะพัง ReferenceError ทันทีที่มีคนถามคำถามแรก — เทสต์จับไม่ได้เพราะ
 *   เทสต์เรียกเฉพาะตัวอ่านสตรีม จับได้ตอนลองโหลดโมดูลจริงในคอนเทนเนอร์
 */
export const aiReady = () => Boolean(API_KEY && AI_USER);

/**
 * ถามแล้วรอเท่าที่ไลน์รอได้
 * @returns {{ok: true, text: string} | {ok: false, why: "notready"|"slow"|"unavailable"|"empty"}}
 */
export async function askFast(question) {
  if (!aiReady()) return { ok: false, why: "notready" };

  /* ═══ ★★ ไม่แนบค่าเซนเซอร์ไปกับคำถาม (ทดลองแล้ว 8 ต.ค. 2569) ═══
     รอบแรกแนบ "ค่าล่าสุดของโรงเรือน: อุณหภูมิ 28.1 · ความชื้น 80" ไปข้างหน้าคำถาม
     ผลคือ **คำตอบผิดเรื่อง** — ถาม "ทำไมหมูกินอาหารน้อยลง" แล้วได้คำตอบย้อนถาม
     ว่า "ต้องการดูอุณหภูมิที่จุดใด" เพราะคำว่าอุณหภูมิในบริบทไปกระตุ้น
     ทางตอบเร็วของ AI ให้คิดว่ากำลังถามค่าเซนเซอร์

     ★ และไม่จำเป็นด้วย — AI ตัวนี้**อ่านเซนเซอร์ของฟาร์มได้เองอยู่แล้ว**
       (ทดลอง: ถาม "วันนี้ฝนตกไหม" ได้คำตอบใน 466 มิลลิวินาที พร้อมค่าจริง
        และเวลาที่วัด โดยเราไม่ได้ส่งค่าอะไรไปเลย)

     ผลพลอยได้: ไฟล์นี้เลิกแตะฐานข้อมูล จึงไม่มีทางทำให้การถามในไลน์
     ช้าหรือพังเพราะฐานข้อมูล */
  const prompt = `${question}\n\nตอบสั้น ๆ ไม่เกิน 3 ประโยค เป็นภาษาไทย`;

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), BUDGET_MS);
  try {
    const upstream = await fetch(`${UPSTREAM}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
        "X-CPF-User-ID": AI_USER,
      },
      body: JSON.stringify({
        model: "auto",
        level: LEVEL,
        session: "swine-line",
        messages: [{ role: "user", content: prompt.slice(0, 4000) }],
      }),
      signal: abort.signal,
    });
    /* 4xx = กุญแจผิดหรือผู้ใช้ยังไม่ได้ลงทะเบียนฝั่งเขา ลองซ้ำก็ผิดเหมือนเดิม */
    if (!upstream.ok) return { ok: false, why: "unavailable" };
    const r = await readFast(upstream, abort);
    if (r.ok && r.text.length > MAX_REPLY) {
      return { ok: true, text: `${r.text.slice(0, MAX_REPLY).trimEnd()}…` };
    }
    return r;
  } catch {
    return { ok: false, why: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

/* ส่งต่อให้ผู้เรียกเดิมไม่ต้องรู้ว่าแยกไฟล์ */
export { BUDGET_MS, MAX_REPLY, readFast };
