/**
 * ตัวรับข้อความจากไลน์ (T1.276) — เทสต์ด่านลายเซ็นกับการจับคำ
 *
 * ด่านลายเซ็นคือสิ่งเดียวที่กันคนอื่นออกจากเส้นทางที่เปิดสู่อินเทอร์เน็ต
 * ถ้ามันหลวม ใครก็ยิงคำสั่งเข้ามาแทนไลน์ได้ จึงต้องมีเทสต์คุมทุกทางที่เคยพลาดกันมา
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

import { verifySignature } from "../server/src/line/signature.js";
import { detectIntent } from "../server/src/line/intent.js";

const SECRET = "ความลับของช่องทดสอบ";
const sign = (body, secret = SECRET) => createHmac("sha256", secret).update(body).digest("base64");

/* ---------- ลายเซ็น ---------- */

test("ลายเซ็นที่ถูกต้องต้องผ่าน", () => {
  const body = Buffer.from(JSON.stringify({ events: [] }));
  assert.equal(verifySignature(body, sign(body), SECRET), true);
});

test("ลายเซ็นที่คิดจากความลับคนละตัวต้องไม่ผ่าน", () => {
  const body = Buffer.from(JSON.stringify({ events: [] }));
  assert.equal(verifySignature(body, sign(body, "ความลับอื่น"), SECRET), false);
});

test("เนื้อคำขอถูกแก้แม้ตัวเดียวก็ต้องไม่ผ่าน", () => {
  const body = Buffer.from(JSON.stringify({ events: [{ type: "message" }] }));
  const sig = sign(body);
  const tampered = Buffer.from(JSON.stringify({ events: [{ type: "follow" }] }));
  assert.equal(verifySignature(tampered, sig, SECRET), false);
});

test("ไม่มีลายเซ็น ไม่มีความลับ หรือลายเซ็นมั่ว ต้องไม่ผ่านทุกกรณี", () => {
  const body = Buffer.from("{}");
  assert.equal(verifySignature(body, undefined, SECRET), false);
  assert.equal(verifySignature(body, sign(body), ""), false);
  assert.equal(verifySignature(body, "ไม่ใช่ base64 ด้วยซ้ำ", SECRET), false);
  /* ความยาวไม่เท่ากันต้องคืน false ไม่ใช่โยน error ให้ทั้งเส้นทางพัง */
  assert.equal(verifySignature(body, Buffer.from("สั้นไป").toString("base64"), SECRET), false);
});

/* ---------- จับคำ ---------- */

test("คำถามเรื่องค่าเซนเซอร์ต้องเข้าหมวดที่ตอบได้เอง", () => {
  assert.equal(detectIntent("ตอนนี้กี่องศา"), "temp");
  assert.equal(detectIntent("อุณหภูมิโรงเรือน A1"), "temp");
  assert.equal(detectIntent("temp?"), "temp");
  assert.equal(detectIntent("ความชื้นเท่าไหร่"), "humidity");
});

test("ถามเรื่องเหตุกับสรุปต้องแยกออกจากกัน", () => {
  assert.equal(detectIntent("มีแจ้งเตือนอะไรไหม"), "alerts");
  /* T1.277 เปลี่ยนชื่อหมวดสรุปเป็น "daily" ให้ตรงกับปุ่ม "รายงานประจำวัน" บนเมนู */
  assert.equal(detectIntent("ขอสรุปหน่อย"), "daily");
  assert.equal(detectIntent("รายงานเมื่อวาน"), "daily");
});

test("ทักทายหรือไม่พิมพ์อะไรเลย ต้องได้เมนูช่วยเหลือ", () => {
  assert.equal(detectIntent("สวัสดี"), "help");
  assert.equal(detectIntent(""), "help");
  assert.equal(detectIntent(undefined), "help");
});

test("คำถามนอกเรื่องต้องเป็น unknown — ห้ามเดาไปตอบมั่ว", () => {
  assert.equal(detectIntent("พรุ่งนี้หวยออกอะไร"), "unknown");
  assert.equal(detectIntent("ราคาหมูวันนี้"), "unknown");
});

/* ---------- กติกาที่ห้ามรื้อ ---------- */

test("ต้องเก็บเนื้อคำขอดิบไว้ ไม่งั้นลายเซ็นจะไม่มีวันตรง", () => {
  const app = readFileSync(new URL("../server/src/app.js", import.meta.url), "utf8");
  assert.match(app, /verify: \(req, _res, buf\) => \{ req\.rawBody = buf; \}/);
  /* เส้นทาง webhook ต้องมาก่อน lineRouter ที่บังคับล็อกอิน ไม่งั้น LINE จะโดนเด้ง 401 */
  assert.ok(app.indexOf("webhookRouter)") < app.indexOf("lineRouter)"));
});

test("ตอบแชทต้องใช้ reply ไม่ใช่ push — push กินโควตารายเดือน", () => {
  const hook = readFileSync(new URL("../server/src/line/webhook.js", import.meta.url), "utf8");
  assert.match(hook, /message\/reply/);
  assert.doesNotMatch(hook, /message\/push/);
  /* ลายเซ็นไม่ผ่านต้องตอบ 401 และต้องไม่เผลอตอบ 200 ให้ทุกกรณี */
  assert.match(hook, /res\.status\(401\)/);
});
