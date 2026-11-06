/**
 * ข้อมูลไม่สดต้องไม่ถูกแสดงเป็นสถานะปัจจุบัน (T1.301)
 *
 * เจอจริง 30 ก.ย. 2569: ข้อมูลเซนเซอร์หยุดไหล 35 ชั่วโมง แต่การ์ดชื่อ "ค่าที่วัดได้ตอนนี้"
 * ยังโชว์ตัวเลขเก่าพร้อมป้าย "ปกติ" — คนอ่านจึงเชื่อว่าเล้าเรียบร้อยดี
 * ทั้งที่ระบบไม่รู้อะไรเลยมาตั้งแต่เมื่อวาน · นี่คือ "โกหกแบบดูน่าเชื่อ" แบบเดียวกับที่กันไว้ในตัวเฝ้า
 */
import test from "node:test";
import { formatWhen } from "../src/lib/format.js";
import { updatedText } from "../src/lib/duration.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { durationText } from "../src/lib/duration.js";

const page = readFileSync(new URL("../src/pages/Twin.jsx", import.meta.url), "utf8");
/** t ปลอมแบบง่าย — แทนค่า {var} ตรง ๆ (พอสำหรับตรวจรูปประโยค) */
const t = (s, vars = {}) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);

test("durationText: อ่านแล้วรู้ทันทีว่านานแค่ไหน ไม่ต้องหารในใจ", () => {
  assert.equal(durationText(t, 45), "45 นาที");
  assert.equal(durationText(t, 60), "1 ชม.");
  assert.equal(durationText(t, 200), "3 ชม. 20 นาที");
  /* ของจริงวันที่เจอ: 2,105 นาที — เกิน 10 ชม. แล้วนาทีไม่ช่วยอะไร */
  assert.equal(durationText(t, 2105), "35 ชม.");
  assert.equal(durationText(t, 599), "9 ชม. 59 นาที");
  assert.equal(durationText(t, 600), "10 ชม.");
  /* เกินสองวันบอกเป็นวัน */
  assert.equal(durationText(t, 2880), "2 วัน");
  assert.equal(durationText(t, 2880 + 180), "2 วัน 3 ชม.");
});

test("durationText: ค่าพังต้องไม่ทำให้ข้อความพัง", () => {
  for (const bad of [null, undefined, NaN, -30, "x"]) {
    assert.equal(durationText(t, bad), "0 นาที");
  }
});

test("หน้าแบบจำลอง: ข้อมูลไม่สดต้องบอกก่อนเห็นตัวเลข", () => {
  assert.match(page, /stale \? t\("ค่าที่วัดได้ล่าสุด"\) : t\("ค่าที่วัดได้ตอนนี้"\)/);
  assert.match(page, /ข้อมูลไม่สด/);
  assert.match(page, /ไม่ใช่สถานะตอนนี้/);
});

test("★ ค่าเก่าห้ามติดป้ายสถานะปัจจุบัน (ปกติ / เฝ้าระวัง / THI)", () => {
  /* ป้ายพวกนี้ตอบคำถาม "ตอนนี้เป็นยังไง" ซึ่งค่าเมื่อวานตอบไม่ได้ */
  assert.match(page, /!stale && r\.kind/);
  assert.match(page, /\{thi != null && !stale && \(/);
});

test("ไม่บอกอายุข้อมูลเป็นนาทีดิบอีกแล้ว", () => {
  assert.doesNotMatch(page, /เก่า \{n\} นาที/);
  assert.match(page, /durationText\(t, age\)/);
});

/* ---------- เวลาอัปเดตต้องไม่ทำให้เข้าใจผิดว่าเป็นของวันนี้ (T1.305) ---------- */

test("เวลาที่วัดได้ของวันอื่น ต้องมีวันที่ติดมาด้วย ไม่ใช่เวลาเปล่า ๆ", () => {
  const now = new Date("2026-10-03T14:00:00+07:00");
  /* ★ ของจริง: หน้าโรงเรือนเขียน "อัปเดต 01:59 น." ทั้งที่เป็นค่าของ 29 ก.ย.
     เวลาอย่างเดียวไม่มีวันบอกได้ว่าเป็นของวันไหน คนอ่านจึงเข้าใจว่าเมื่อเช้านี้ */
  const old = formatWhen("2026-09-29T01:59:00+07:00", now);
  assert.match(old, /29/, "ต้องมีวันที่");
  assert.match(old, /01:59/);
  /* ของวันนี้ไม่ต้องรกด้วยวันที่ */
  const today = formatWhen("2026-10-03T09:15:00+07:00", now);
  assert.doesNotMatch(today, /ต\.ค\./);
  assert.match(today, /09:15/);
});

test("ไม่รู้เวลา ต้องพูดว่าไม่รู้ ไม่ใช่บอกว่าเพิ่งอัปเดตเดี๋ยวนี้", () => {
  const t = (k, v = {}) => Object.entries(v).reduce((s, [a, b]) => s.replaceAll(`{${a}}`, b), k);
  /* ★ ของเดิมใช้ `agoMinutes ?? 0` แล้วได้ "อัปเดต 0 นาทีที่แล้ว"
     = คำตอบที่มั่นใจที่สุดเท่าที่เป็นไปได้ ทั้งที่เราไม่รู้อะไรเลย */
  assert.equal(updatedText(t, null), "ไม่รู้ว่าอัปเดตเมื่อไร");
  assert.equal(updatedText(t, {}), "ไม่รู้ว่าอัปเดตเมื่อไร");
  assert.equal(updatedText(t, { agoMinutes: null, at: null }), "ไม่รู้ว่าอัปเดตเมื่อไร");
});

test("รู้เวลาแล้วต้องบอกเป็นหน่วยที่อ่านง่าย ไม่ใช่นาทีดิบ", () => {
  const t = (k, v = {}) => Object.entries(v).reduce((s, [a, b]) => s.replaceAll(`{${a}}`, b), k);
  const now = new Date("2026-10-03T14:00:00+07:00");
  assert.equal(updatedText(t, { agoMinutes: 3 }), "อัปเดต 3 นาที ที่แล้ว");
  /* สี่วันต้องไม่กลายเป็น "5,761 นาที" */
  assert.match(updatedText(t, { at: "2026-09-29T01:59:00+07:00" }, now), /4 วัน/);
});
