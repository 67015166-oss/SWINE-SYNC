/**
 * รับข้อความที่คนพิมพ์เข้ามาในไลน์แล้วตอบกลับ (T1.276)
 *
 * ═══ ด่านแรกคือลายเซ็น ไม่ใช่ความลับของที่อยู่ ═══
 * เส้นทางนี้ต้องเปิดออกอินเทอร์เน็ตให้ LINE ยิงเข้ามาได้ ใครเดาที่อยู่เจอก็ยิงได้เหมือนกัน
 * ตัวที่กันคือ **ลายเซ็น `x-line-signature`** = HMAC-SHA256 ของเนื้อคำขอดิบด้วย Channel secret
 * ไม่ผ่าน = ตอบ 401 แล้วจบ ไม่แตะฐานข้อมูล ไม่ตอบกลับไลน์
 *
 * เทียบด้วย `timingSafeEqual` ไม่ใช่ `===` — การเทียบสตริงธรรมดาจะหยุดทันทีที่เจอตัวต่างกัน
 * เวลาที่ใช้จึงบอกใบ้ว่าเดาถูกไปกี่ตัว (timing attack)
 *
 * ═══ ตอบด้วย replyToken เท่านั้น ห้ามใช้ push ═══
 * ข้อความตอบกลับผ่าน reply API **ไม่กินโควตารายเดือน** ส่วน push กิน
 * (โควตาของบัญชีนี้คือ 300 ข้อความ/เดือน ใช้ push ตอบแชทหมดไม่กี่วัน)
 * replyToken ใช้ได้ครั้งเดียวและมีอายุสั้น ต้องตอบให้ไวที่สุด — จึงตอบจากฐานข้อมูลของเราเอง
 *
 * ═══ ต้องตอบ 200 เสมอ แม้ข้างในจะพัง ═══
 * LINE ถือว่า non-2xx คือ webhook เสีย และจะลองซ้ำ/ขึ้นเตือนในคอนโซล
 * ความผิดพลาดของเราต้องไม่ทำให้ LINE คิดว่าที่อยู่นี้ใช้ไม่ได้ (ยกเว้นลายเซ็นไม่ผ่าน ซึ่งต้องปฏิเสธ)
 */
import { Router } from "express";
import { log } from "../lib/log.js";
import { chooseBarn, chooseFarm, farmPicker, greeting, replyFor } from "./reply.js";
import { parsePostback } from "./intent.js";
import { verifySignature } from "./signature.js";

export const webhookRouter = Router();

const secret = () => (process.env.LINE_CHANNEL_SECRET || "").trim();
const token = () => (process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim();

async function replyToLine(replyToken, messages) {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    body: JSON.stringify({ replyToken, messages: Array.isArray(messages) ? messages : [messages] }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    throw new Error(`reply ตอบ ${res.status}: ${detail}`);
  }
}

/** จัดการทีละเหตุการณ์ — ทำหลัง ๆ ตอบ 200 ไปแล้ว จึงต้องจับ error เองทั้งหมด */
async function handleEvent(event) {
  /* userId บอกว่า "ใครถาม" — ใช้จำฟาร์มที่คนนั้นเลือกไว้ (T1.277)
     ไม่มี userId (เช่นข้อความจากกลุ่มที่ปิดสิทธิ์) ก็ยังตอบได้ แค่ใช้ค่าตั้งต้น */
  const userId = event.source?.userId ?? null;

  try {
    if (event.type === "follow") {
      await replyToLine(event.replyToken, await greeting(userId));
      return;
    }

    /* ปุ่มในการ์ด (เลือกฟาร์ม/โรงเรือน) ส่งกลับมาเป็น postback ไม่ใช่ข้อความ */
    if (event.type === "postback") {
      const action = parsePostback(event.postback?.data);
      if (!action) return;
      const answer =
        action.action === "farm" ? await chooseFarm(userId, action.code)
        : action.action === "barn" ? await chooseBarn(userId, action.code)
        : await farmPicker(userId);
      await replyToLine(event.replyToken, answer);
      log.info({ กด: action.action, รหัส: action.code }, "รับปุ่มจากการ์ดในไลน์แล้ว");
      return;
    }

    if (event.type === "message" && event.message?.type === "text") {
      const text = event.message.text ?? "";
      const answer = await replyFor(text, userId);
      await replyToLine(event.replyToken, answer);
      log.info({ ถาม: text.slice(0, 80) }, "ตอบข้อความในไลน์แล้ว");
      return;
    }
    /* รูป เสียง สติกเกอร์ ฯลฯ — บอกให้ชัดว่าอ่านไม่ได้ ดีกว่าเงียบให้คนเดาว่าบอทตายหรือยัง */
    if (event.type === "message" && event.replyToken) {
      await replyToLine(event.replyToken, {
        type: "text",
        text: "ตอนนี้อ่านได้เฉพาะข้อความตัวอักษรครับ ลองพิมพ์ว่า ช่วย เพื่อดูว่าถามอะไรได้บ้าง",
      });
    }
  } catch (err) {
    log.error({ err: err.message, ชนิดเหตุการณ์: event.type }, "ตอบข้อความในไลน์ไม่สำเร็จ");
  }
}

webhookRouter.post("/webhook", async (req, res) => {
  /* `rawBody` มาจาก express.json({ verify }) ใน app.js — ถ้าหายไปแปลว่ามีคนรื้อตรงนั้น */
  if (!verifySignature(req.rawBody, req.get("x-line-signature"), secret())) {
    log.warn({ ip: req.ip }, "ปฏิเสธคำขอที่ลายเซ็นไม่ผ่านที่ /api/line/webhook");
    return res.status(401).json({ error: { code: "bad_signature", message: "ลายเซ็นไม่ถูกต้อง" } });
  }

  /* ตอบ 200 ก่อน แล้วค่อยทำงาน — LINE รอไม่นาน และการตอบกลับใช้ replyToken ไม่ได้ใช้คำตอบนี้
     (คำขอ "Verify" จากคอนโซลจะส่ง events ว่างมา ต้องได้ 200 เหมือนกัน) */
  res.status(200).json({ ok: true });

  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  for (const event of events) await handleEvent(event);
});
