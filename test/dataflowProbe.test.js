/**
 * ตัวเฝ้าข้อมูลต้องตรวจทั้งดิสก์และอายุข้อมูลทุกรอบ (T1.317)
 *
 * ของเดิมคืนค่าทันทีเมื่อดิสก์ไม่ผ่าน จึงไม่เคยวัดอายุข้อมูลเลยตลอด 8 วันที่ดิสก์ใกล้เต็ม
 * (เห็นได้จาก `lastDataAt: null` ในแฟ้มสถานะจริง) — ถ้าท่อตายในช่วงนั้นก็ไม่มีใครรู้
 * ซึ่งคือเหตุการณ์ 29 ก.ย. 2569 ที่เงียบไป 34 ชั่วโมง และเป็นเหตุผลที่สร้างตัวเฝ้านี้ขึ้นมา
 */
import test from "node:test";
import assert from "node:assert/strict";

import { checkDisk, classifyFlow, MAX_AGE_MIN, MIN_FREE_PCT } from "../server/src/watchdog/flowRules.js";

const NOW = new Date("2026-10-08T05:45:00.000Z");
const minsAgo = (m) => new Date(NOW.getTime() - m * 60_000).toISOString();

/* ---------- กติกาดิสก์ ---------- */

test("ดิสก์เหลือน้อยกว่าเกณฑ์ต้องไม่ผ่าน และบอกเป็นเปอร์เซ็นต์", () => {
  /* ของจริง 8 ต.ค. 2569: เหลือ 6.9 GiB จาก 460 GiB = 1.5% */
  const r = checkDisk({ avail: 15, total: 1000 });
  assert.equal(r.ok, false);
  assert.equal(r.freePct, 1.5);
  assert.match(r.reason, /1\.5%/);
});

test("ดิสก์พอต้องผ่าน และขอบเกณฑ์พอดีถือว่าผ่าน", () => {
  assert.equal(checkDisk({ avail: 100, total: 1000 }).ok, true);
  assert.equal(checkDisk({ avail: MIN_FREE_PCT, total: 100 }).ok, true);
});

test("วัดดิสก์ไม่ได้ต้องไม่ตัดสิน — เตือนผิดแพงกว่าไม่เตือน", () => {
  /* ★ `statfs` ในคอนเทนเนอร์คืนขนาดบล็อกไม่ตรงของจริง เคยได้ "ว่าง 1,987 GB"
     ทั้งที่เหลือ 7.8 GB จึงใช้สัดส่วน และถ้าอ่านไม่ได้เลยต้องเงียบ ไม่ใช่เดา */
  for (const bad of [null, {}, { avail: null, total: 1000 }, { avail: 10, total: 0 }]) {
    assert.equal(checkDisk(bad).ok, true);
    assert.equal(checkDisk(bad).freePct, null);
  }
});

/* ---------- กติกาอายุข้อมูล ---------- */

test("ค่าล่าสุดสด = ผ่าน และต้องรายงานอายุกับเวลาล่าสุดกลับมา", () => {
  const r = classifyFlow([{ value: 27.8, at: minsAgo(1) }], NOW, { maxAgeMin: MAX_AGE_MIN });
  assert.equal(r.ok, true);
  assert.equal(r.ageMin, 1);
  assert.ok(r.lastAt);
});

test("ค่าล่าสุดเก่าเกินเกณฑ์ = ท่อหยุด พร้อมบอกอายุแบบอ่านง่าย", () => {
  const r = classifyFlow([{ value: 27.8, at: minsAgo(2460) }], NOW, { maxAgeMin: MAX_AGE_MIN });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "stale");
  /* ★ "41 ชั่วโมง" ไม่ใช่ "2460 นาที" — เลขนาทีดิบต้องหารในใจก่อนจะรู้ว่านานแค่ไหน */
  assert.match(r.reason, /ชั่วโมง/);
});

test("ไม่มีค่าเลยต้องแยกจากค่าที่เก่า — คนละอาการ คนละที่ต้องไปดู", () => {
  assert.equal(classifyFlow([], NOW).kind, "empty");
  assert.equal(classifyFlow(null, NOW).kind, "empty");
});

test("ค่าที่อ่านเป็นตัวเลขไม่ได้ต้องไม่ถูกนับว่ามีข้อมูล", () => {
  /* ★ กับดักเดิม: `Number(null)` และ `Number("")` เป็น 0 ซึ่งดูเหมือนค่าที่วัดได้
     ถ้าปล่อยผ่าน ท่อที่ส่งแต่ค่าว่างจะถูกนับว่า "ยังไหลอยู่" */
  assert.equal(classifyFlow([{ value: null, at: minsAgo(1) }], NOW).kind, "empty");
  assert.equal(classifyFlow([{ value: "", at: minsAgo(1) }], NOW).kind, "empty");
});

/* ---------- ★★ สองอาการที่ต้องพูดไม่เหมือนกัน ---------- */

test("★ ดิสก์ใกล้เต็มแต่ข้อมูลยังไหล — ต้องตรวจอายุข้อมูลได้ ไม่ใช่มองไม่เห็น", () => {
  /* นี่คือสภาพจริงของระบบวันที่ 8 ต.ค. 2569: ดิสก์ 1.5% แต่ค่าล่าสุดเก่าแค่ 29 วินาที
     ของเดิมคืนค่าทันทีที่ดิสก์ไม่ผ่าน จึงได้ lastAt เป็น null ตลอด
     ทั้งสองกติกาต้องให้คำตอบของตัวเองได้ เพื่อให้ผู้เรียกประกอบข้อความที่ถูกต้องได้ */
  const disk = checkDisk({ avail: 15, total: 1000 });
  const flow = classifyFlow([{ value: 27.8, at: minsAgo(0) }], NOW, { maxAgeMin: MAX_AGE_MIN });
  assert.equal(disk.ok, false, "ดิสก์ต้องไม่ผ่าน");
  assert.equal(flow.ok, true, "แต่ข้อมูลยังไหลอยู่");
  assert.ok(flow.lastAt, "และต้องรู้เวลาค่าล่าสุด ไม่ใช่ null");
});

test("★ ดิสก์ใกล้เต็มและข้อมูลหยุดจริง — เป็นคนละสถานะกับข้อบน", () => {
  const disk = checkDisk({ avail: 15, total: 1000 });
  const flow = classifyFlow([{ value: 27.8, at: minsAgo(2040) }], NOW, { maxAgeMin: MAX_AGE_MIN });
  assert.equal(disk.ok, false);
  assert.equal(flow.ok, false);
  /* ผู้เรียกต้องนำด้วยเรื่องดิสก์เพราะเป็นสาเหตุที่น่าจะเป็น แต่ต้องบอกด้วยว่าหยุดแล้ว
     — สองอาการนี้เร่งด่วนไม่เท่ากัน ข้อความเดียวกันทั้งสองกรณีคือสิ่งที่แก้ใน T1.317 */
  assert.match(flow.reason, /ค่าล่าสุดเก่า/);
});
