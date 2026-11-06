/**
 * ส่งข้อความเข้า LINE Official Account ผ่าน Messaging API (T1.275)
 *
 * **สิ่งที่ LINE ทำไม่ได้ และห้ามพยายาม**
 *   · ส่งไฟล์ PDF/Excel ไม่ได้ — ชนิดข้อความมีแค่ text · image · video · audio · sticker ·
 *     location · template · flex  (ถ้าอยากให้คนได้ไฟล์ ต้องวางไฟล์บนเว็บ https แล้วส่งลิงก์)
 *   · รูปต้องเป็น URL https สาธารณะ — เครื่องนี้เปิดแค่ 127.0.0.1 จึงส่งรูปของตัวเองไม่ได้
 *     จนกว่าจะมีที่วางไฟล์ (ดู docs/RUNBOOK.md หัวข้อ LINE)
 *
 * **โควตา** แพ็กเกจฟรีจำกัดจำนวนข้อความต่อเดือน และนับ "ต่อผู้รับหนึ่งคน"
 * broadcast หาเพื่อน 50 คน = 50 ข้อความ ไม่ใช่ 1 — ตัวกันจำนวนอยู่ที่ notifier.js
 *
 * **กุญแจ** ใช้ `LINE_CHANNEL_ACCESS_TOKEN` (ออกจาก LINE Developers Console แท็บ Messaging API)
 * ไม่ใช่ channel secret ที่เห็นใน LINE Official Account Manager
 * ห้ามตั้งชื่อตัวแปรขึ้นต้น `VITE_` เด็ดขาด — vite จะฝังลงไฟล์ที่เบราว์เซอร์โหลดได้
 */
import { log } from "../lib/log.js";

const API = "https://api.line.me/v2/bot";
const TIMEOUT_MS = 10_000;

const token = () => (process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim();

/**
 * ส่งหาใคร — `broadcast` (ทุกคนที่เป็นเพื่อนกับ OA) หรือ `push:<userId|groupId>`
 * broadcast ไม่ต้องมี webhook และไม่ต้องรู้ userId จึงเป็นค่าตั้งต้น
 */
export function lineTarget() {
  const raw = (process.env.LINE_TARGET || "broadcast").trim();
  if (raw === "broadcast") return { mode: "broadcast" };
  const to = raw.startsWith("push:") ? raw.slice(5).trim() : "";
  return to ? { mode: "push", to } : { mode: "broadcast" };
}

/**
 * โหมดซ้อม — ประกอบข้อความและบันทึกทุกอย่างเหมือนจริง แต่ไม่ยิงออกไปที่ LINE
 * **ค่าตั้งต้นคือเปิดโหมดซ้อม** ต้องตั้ง `LINE_DRY_RUN=0` เองถึงจะส่งจริง
 * (ส่งออกไปแล้วเรียกคืนไม่ได้ และกินโควตาของบัญชีจริง)
 */
export const lineDryRun = () => (process.env.LINE_DRY_RUN ?? "1") !== "0";

export const lineConfigured = () => token().length > 0;

async function callLine(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  /* LINE ตอบ 200 ตัวเปล่าเมื่อสำเร็จ · ตอบ JSON ที่มี message เมื่อพลาด */
  const text = await res.text();
  if (!res.ok) {
    const detail = text.slice(0, 300);
    throw new Error(`LINE ตอบ ${res.status}: ${detail}`);
  }
  return text ? JSON.parse(text) : {};
}

/**
 * ส่งข้อความหนึ่งชุด (สูงสุด 5 ข้อความต่อครั้งตามที่ LINE กำหนด)
 * @returns {{sent: boolean, dry: boolean, error: string|null}}
 */
export async function sendLine(messages) {
  const list = Array.isArray(messages) ? messages : [messages];
  if (list.length === 0) return { sent: false, dry: false, error: "ไม่มีข้อความให้ส่ง" };
  if (list.length > 5) return { sent: false, dry: false, error: "ส่งได้ครั้งละไม่เกิน 5 ข้อความ" };

  const target = lineTarget();

  /* เช็กโหมดซ้อมก่อนเช็กกุญแจ — ตอนยังไม่มีกุญแจก็ต้องลองประกอบข้อความดูหน้าตาได้ */
  if (lineDryRun()) {
    /* พิมพ์ข้อความที่จะส่งลง log ให้ตรวจได้ว่าหน้าตาถูกไหมก่อนเปิดใช้จริง */
    log.info({ target, ข้อความ: list }, "LINE โหมดซ้อม — ไม่ได้ส่งออกจริง");
    return { sent: false, dry: true, error: null };
  }
  if (!lineConfigured()) {
    return { sent: false, dry: false, error: "ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN" };
  }

  try {
    if (target.mode === "push") await callLine("/message/push", { to: target.to, messages: list });
    else await callLine("/message/broadcast", { messages: list });
    log.info({ target, จำนวน: list.length }, "ส่งเข้า LINE แล้ว");
    return { sent: true, dry: false, error: null };
  } catch (err) {
    /* เครือข่ายของ CPF ดักใบรับรอง TLS — ถ้าเจอ self-signed ให้ตั้ง NODE_EXTRA_CA_CERTS
       (เหตุผลเต็มใน docs/RUNBOOK.md) จึงต้องปล่อยข้อความจริงออกมาให้เห็น ไม่กลบเป็น "ส่งไม่สำเร็จ" */
    log.error({ err: err.message, target }, "ส่งเข้า LINE ไม่สำเร็จ");
    return { sent: false, dry: false, error: err.message };
  }
}

/** โควตาที่ใช้ไปเดือนนี้ — ถามจาก LINE ตรง ๆ ไม่ได้เดาเอง (ใช้ในหน้าสถานะ) */
export async function lineQuota() {
  if (!lineConfigured()) return null;
  try {
    const headers = { Authorization: `Bearer ${token()}` };
    const opts = { headers, signal: AbortSignal.timeout(TIMEOUT_MS) };
    const [limitRes, usedRes] = await Promise.all([
      fetch(`${API}/message/quota`, opts),
      fetch(`${API}/message/quota/consumption`, opts),
    ]);
    if (!limitRes.ok || !usedRes.ok) return null;
    const limit = await limitRes.json();
    const used = await usedRes.json();
    return { type: limit.type, limit: limit.value ?? null, used: used.totalUsage ?? null };
  } catch {
    return null;
  }
}
