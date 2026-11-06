/**
 * ถาม AI ของฟาร์มผ่านไลน์ (T1.323)
 *
 * ★★ หัวใจของงานนี้คือ **เลิกรอให้ทันเวลา** ไม่ใช่ความแม่นของคำตอบ
 * ไลน์ให้ตอบกลับด้วย token ที่อายุสั้น ถ้ารอโมเดลคิด 90 วินาที
 * คำตอบจะไปไม่ถึงใครเลย และถ้าแก้ด้วยการ push ตามหลังก็จะกินโควตา
 * 300 ข้อความ/เดือน จนเดือนนั้นส่งแจ้งเตือนเรื่องหมูตายไม่ได้
 */
import test from "node:test";
import assert from "node:assert/strict";

import { BUDGET_MS, MAX_REPLY, readFast } from "../server/src/line/askStream.js";
import { AI_DOWN, AI_OFF, AI_SLOW } from "../server/src/line/recordText.js";

/** จำลองสตรีม NDJSON ของ AI ตัวจริง */
const streamOf = (lines) => {
  const enc = new TextEncoder();
  let i = 0;
  return {
    body: {
      getReader: () => ({
        read: async () =>
          i < lines.length ? { done: false, value: enc.encode(lines[i++] + "\n") } : { done: true },
      }),
    },
  };
};
const fakeAbort = () => { let aborted = false; return { abort: () => { aborted = true; }, get aborted() { return aborted; } }; };

test("คำตอบทันทีบรรทัดเดียว ต้องอ่านออก", () => {
  /* รูปจริงของ "แบบตอบทันที" — ถามค่าเซนเซอร์ตรง ๆ ใช้เวลา ~0.5 วินาที */
  const up = streamOf(['{"message":{"role":"assistant","content":"วันนี้ไม่มีฝนครับ"},"done":true,"direct":"today_rain"}']);
  return readFast(up, fakeAbort()).then((r) => {
    assert.equal(r.ok, true);
    assert.equal(r.text, "วันนี้ไม่มีฝนครับ");
  });
});

test("คำตอบที่ส่งมาทีละคำ ต้องต่อกันให้ครบ", async () => {
  const up = streamOf([
    '{"message":{"content":"ร้อน"},"done":false}',
    '{"message":{"content":"กว่าเกณฑ์"},"done":false}',
    '{"message":{"content":"ครับ"},"done":true,"done_reason":"stop"}',
  ]);
  const r = await readFast(up, fakeAbort());
  assert.equal(r.text, "ร้อนกว่าเกณฑ์ครับ");
});

test("★★ เห็นสัญญาณว่าจะช้า ต้องเลิกรอทันที ไม่ใช่รอจนหมดงบ", async () => {
  /* ฝั่ง AI ส่ง route/waiting มาก่อนเริ่มคิด เป็นสัญญาณชัดว่าเข้าทางโมเดล (20–90 วินาที)
     เลิกตอนนั้นทำให้ผู้ใช้ได้คำตอบใน 1–2 วินาที แทนที่จะนิ่งรอ 9 วินาทีก่อนได้คำตอบเดียวกัน
     และไม่ปล่อยให้ฝั่ง AI คิดค้างคิวไว้เปล่า ๆ */
  for (const signal of ['{"route":{"model":"qwen3.8:27b","reason":"วิเคราะห์"}}', '{"waiting":6,"queue":0}']) {
    const abort = fakeAbort();
    const r = await readFast(streamOf([signal, '{"message":{"content":"ไม่ควรมาถึง"},"done":true}']), abort);
    assert.equal(r.ok, false);
    assert.equal(r.why, "slow");
    assert.equal(abort.aborted, true, "ต้องสั่งหยุดฝั่ง AI ด้วย ไม่ใช่แค่เลิกอ่าน");
  }
});

test("★ ความคิดภายในของโมเดลต้องไม่หลุดไปเป็นคำตอบ", async () => {
  /* ฟิลด์ `thinking` คือความคิดภายใน ไม่ใช่คำตอบ — ถ้าหลุดออกไป
     ผู้ใช้จะเห็นข้อความภาษาอังกฤษสับสนแทนคำตอบ */
  const up = streamOf([
    '{"message":{"content":"","thinking":"The user asks about"},"done":false}',
    '{"message":{"content":"อุณหภูมิปกติครับ"},"done":true}',
  ]);
  const r = await readFast(up, fakeAbort());
  assert.equal(r.text, "อุณหภูมิปกติครับ");
  assert.ok(!r.text.includes("The user"));
});

test("สตรีมจบแต่ไม่มีคำตอบ ต้องไม่ตอบข้อความว่าง", async () => {
  const r = await readFast(streamOf(['{"message":{"content":"   "},"done":true}']), fakeAbort());
  assert.equal(r.ok, false);
  assert.equal(r.why, "empty");
});

test("บรรทัดที่อ่านไม่ออกต้องข้ามไป ไม่ทำให้ทั้งคำตอบพัง", async () => {
  const up = streamOf(['ไม่ใช่ json', '{"message":{"content":"ปกติครับ"},"done":true}']);
  const r = await readFast(up, fakeAbort());
  assert.equal(r.text, "ปกติครับ");
});

test("สตรีมจบกลางทางโดยไม่มี done ต้องไม่เอาคำตอบครึ่ง ๆ ไปใช้", async () => {
  /* ★ คำตอบที่ตัดครึ่งอ่านแล้วเข้าใจผิดง่ายกว่าไม่ตอบเลย */
  const r = await readFast(streamOf(['{"message":{"content":"ควรเปิดพัดลมเพราะ"},"done":false}']), fakeAbort());
  assert.equal(r.ok, false);
  assert.equal(r.why, "slow");
});

test("ไม่มีสตรีมมาเลย ต้องบอกว่าต่อไม่ได้", async () => {
  const r = await readFast({}, fakeAbort());
  assert.equal(r.why, "unavailable");
});

/* ---------- งบเวลาและความยาว ---------- */

test("งบเวลาต้องสั้นกว่าที่ไลน์รอได้", () => {
  /* ตั้งจากข้อจำกัดของไลน์ ไม่ใช่จากความเร็วของ AI · เผื่อเวลาเขียนคำตอบกลับด้วย */
  assert.ok(BUDGET_MS <= 10000, "เกิน 10 วินาที token ของไลน์เสี่ยงหมดอายุ");
  assert.ok(BUDGET_MS >= 3000, "สั้นเกินไปจะตัดคำตอบที่ทันอยู่แล้วทิ้ง");
});

test("ความยาวคำตอบต้องพออ่านในแชท", () => {
  assert.ok(MAX_REPLY <= 1000 && MAX_REPLY >= 300);
});

/* ---------- ★ ข้อความแต่ละกรณีต้องสื่อคนละอย่าง ---------- */

test("★ สามกรณีที่ล้มเหลวต้องพูดไม่เหมือนกัน", () => {
  /* ช้า = ตอบได้แต่ไม่ทันในแชท · ต่อไม่ได้ = ระบบนั้นล่ม · ไม่ได้เปิด = ยังไม่ตั้งค่า
     ถ้าใช้ข้อความเดียวกันหมด ผู้ใช้จะไม่รู้ว่าควรรอ ควรแจ้งใคร หรือไปทำอะไรต่อ */
  assert.notEqual(AI_SLOW, AI_DOWN);
  assert.notEqual(AI_DOWN, AI_OFF);
  /* ★ ห้ามบอกว่า "ตอบไม่ได้" ตอนที่จริง ๆ ตอบได้ แค่ช้า — คนจะเลิกถามไปเลย */
  assert.ok(!AI_SLOW.includes("ตอบไม่ได้"));
  assert.match(AI_SLOW, /เว็บ/);
  /* อีกสองกรณีต้องเสนอทางที่ยังใช้ได้ ไม่ใช่ปล่อยให้คิดว่าทั้งระบบล่ม */
  assert.match(AI_DOWN, /อุณหภูมิ/);
  assert.match(AI_OFF, /อุณหภูมิ/);
});
