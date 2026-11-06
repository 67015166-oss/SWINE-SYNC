/**
 * เทสต์ชุดแรกของโปรเจกต์ — `npm test`
 *
 * ใช้ `node:test` ที่มากับ Node เอง **ไม่เพิ่ม dependency ใหม่**
 * (เครือข่าย CPF ดัก TLS ทำให้ npm install ล้มบ่อย — ดู docs/RUNBOOK.md)
 *
 * ครอบเฉพาะ "ฟังก์ชันบริสุทธิ์ที่เคยพังจริง" ก่อน ไม่ได้ตั้งใจครอบทั้งแอปในรอบเดียว
 * ทุกเคสในนี้มาจากบั๊กที่เจอของจริง ไม่ใช่เคสที่คิดขึ้นเอง — ดู T1.191 ใน docs/TASKS.md
 */
import test from "node:test";
import assert from "node:assert/strict";

import { paddedDomain } from "../src/lib/chartTheme.js";
import { climateStats, thiOf, thiLevel, readingStatus } from "../src/data/mock/climate.js";
import { hashPassword, verifyPassword } from "../server/src/lib/password.js";

/* ---------- paddedDomain: null เคยถูกนับเป็น 0 ---------- */

test("paddedDomain: null ปนมาแล้วต้องไม่ถูกนับเป็น 0", () => {
  /* ของจริง: บางช่วงเวลามีค่าในโรงเรือนแต่ไม่มีค่านอกโรงเรือน ฝั่งที่ขาดมาเป็น null
     ของเดิมได้ [-2, 30] เพราะ Math.min แปลง null เป็น 0 */
  const values = [27.1, null, 28.4, null, 26.9, null];
  assert.deepEqual(paddedDomain(values, 1.5, { band: { min: 22, max: 28 } }), [22, 30]);
});

test("paddedDomain: อาร์เรย์ว่างต้องไม่คืน Infinity", () => {
  /* ของเดิมในหน้าโรงเรือนไม่มีตัวกันเคสนี้ ได้ [Infinity, -Infinity] แล้วกราฟไม่วาดอะไรเลย */
  assert.deepEqual(paddedDomain([], 1, { band: { min: 22, max: 28 } }), [22, 28]);
  assert.deepEqual(paddedDomain([], 1), [0, 1]);
  assert.deepEqual(paddedDomain([null, undefined, NaN], 1), [0, 1]);
});

test("paddedDomain: floor/ceil ตัดขอบตามที่สั่ง", () => {
  assert.deepEqual(paddedDomain([95, 99], 10, { floor: 0, ceil: 100 }), [85, 100]);
});

/* ---------- climateStats: null เคยทำให้ต่ำสุดเป็น 0 และเฉลี่ยเพี้ยน ---------- */

test("climateStats: ข้ามจุดที่เซนเซอร์เงียบ ไม่ใช่นับเป็น 0", () => {
  const series = [
    { tempC: 27.1, humidity: 80 },
    { tempC: null, humidity: null },
    { tempC: 26.9, humidity: 82 },
  ];
  const s = climateStats(series);
  assert.equal(s.tempMin, 26.9, "ของเดิมได้ 0");
  assert.equal(s.tempMax, 27.1);
  assert.equal(s.tempAvg, 27, "ของเดิมได้ 18.0");
  assert.equal(s.humidityMin, 80);
});

test("climateStats: ไม่มีค่าเลยคืน null ไม่ใช่ 0", () => {
  const s = climateStats([{ tempC: null, humidity: null }]);
  assert.equal(s.tempMin, null);
  assert.equal(s.tempAvg, null);
});

test("climateStats: ชั่วโมงที่ไม่มีค่าไม่นับเป็น 'หลุดเกณฑ์'", () => {
  /* ของเดิม `null < 22` เป็นจริง ชั่วโมงที่เซนเซอร์เงียบจึงถูกนับว่าหนาวเกินเกณฑ์ */
  const s = climateStats([
    { tempC: null, humidity: null },
    { tempC: null, humidity: null },
    { tempC: 26, humidity: 70 },
  ]);
  assert.equal(s.tempOutHours, 0);
});

/* ---------- สถานะของค่าที่วัดได้ ---------- */

test("readingStatus: ไม่มีค่าคือ 'ไม่มีสัญญาณ' ไม่ใช่ 'ต่ำกว่าเกณฑ์'", () => {
  assert.equal(readingStatus("tempC", null).tone, "offline");
});

test("thiOf/thiLevel: ค่าตรงตามสูตรและแบ่งระดับถูก", () => {
  /* 0.8×27 + (80/100)×(27−14.4) + 46.4 = 78.08 → ปัดเป็น 78.1 */
  assert.equal(thiOf(27, 80), 78.1);
  assert.equal(thiLevel(70).tone, "good");
  assert.equal(thiLevel(76).tone, "warning");
});

/* ---------- รหัสผ่าน (หลังบ้าน) ---------- */

test("รหัสผ่าน: hash แล้วตรวจกลับได้ และรหัสผิดต้องไม่ผ่าน", async () => {
  const hash = await hashPassword("ทดสอบ12345");
  assert.match(hash, /^scrypt\$\d+\$\d+\$\d+\$/);
  assert.equal(await verifyPassword("ทดสอบ12345", hash), true);
  assert.equal(await verifyPassword("ทดสอบ1234", hash), false);
});

test("รหัสผ่าน: hash เดิมสองครั้งต้องไม่เหมือนกัน (มี salt)", async () => {
  const a = await hashPassword("เหมือนกันเป๊ะ");
  const b = await hashPassword("เหมือนกันเป๊ะ");
  assert.notEqual(a, b);
});

test("รหัสผ่าน: ของที่เก็บไว้เพี้ยนต้องคืน false ไม่ใช่ throw", async () => {
  assert.equal(await verifyPassword("อะไรก็ได้", "ขยะ"), false);
  assert.equal(await verifyPassword("อะไรก็ได้", ""), false);
  assert.equal(await verifyPassword("อะไรก็ได้", null), false);
});
