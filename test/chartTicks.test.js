/**
 * ขีดบนแกนกราฟต้องห่างเท่ากัน (T1.266)
 *
 * เจอจริง 18 ก.ย. 2569 ตอนได้เห็นกราฟหน้าแบบจำลองโรงเรือนครั้งแรก:
 * แกน Y ขึ้น 24·26·28·**31** และ 22·24·26·28·**29** · แกนเวลา …16:15 · **17:15**
 * เพราะ Recharts ต่อขอบช่วงเข้าท้ายขีดเสมอเมื่อช่วงหารขั้นไม่ลงตัว
 */
import test from "node:test";
import assert from "node:assert/strict";

import { evenTicks, hourTicks, paddedDomain } from "../src/lib/chartTheme.js";

const gaps = (ticks) => ticks.slice(1).map((v, i) => Math.round((v - ticks[i]) * 100) / 100);

test("evenTicks: ช่วง [24, 31] ต้องไม่จบที่ 31 แบบขั้นไม่เท่า", () => {
  const { domain, ticks } = evenTicks([24, 31]);
  assert.deepEqual(ticks, [24, 26, 28, 30, 32]);
  assert.deepEqual(domain, [24, 32]);
  assert.equal(new Set(gaps(ticks)).size, 1);
});

test("evenTicks: ช่วง [22, 29] (กราฟจำลองสถานการณ์) ขั้นเท่ากันและครอบข้อมูล", () => {
  const { domain, ticks } = evenTicks([22, 29]);
  assert.equal(new Set(gaps(ticks)).size, 1);
  assert.ok(domain[0] <= 22 && domain[1] >= 29);
  assert.equal(ticks[0], domain[0]);
  assert.equal(ticks.at(-1), domain[1]);
});

test("evenTicks: ไม่เกิน 7 ขีด และช่วงแคบใช้ขั้นละเอียดขึ้น", () => {
  for (const [lo, hi] of [[25, 27], [20, 34], [0, 100], [24.5, 26.5], [-3, 8]]) {
    const { ticks } = evenTicks([lo, hi]);
    assert.ok(ticks.length <= 7, `${lo}–${hi} ได้ ${ticks.length} ขีด`);
    assert.equal(new Set(gaps(ticks)).size, 1, `${lo}–${hi} ขั้นไม่เท่า`);
  }
  assert.deepEqual(evenTicks([25, 27]).ticks, [25, 25.5, 26, 26.5, 27]);
});

test("evenTicks: ใช้คู่กับ paddedDomain ได้ และช่วงพังไม่ทำให้ล่ม", () => {
  const { ticks } = evenTicks(paddedDomain([26.4, 29.7, null], 0.6));
  assert.equal(new Set(gaps(ticks)).size, 1);
  assert.equal(evenTicks([5, 5]).ticks, undefined);
  assert.equal(evenTicks([NaN, 3]).ticks, undefined);
});

/* เวลาสร้างจากเวลาท้องถิ่นของเครื่องที่รันเทสต์ — hourTicks อ่านชั่วโมงแบบท้องถิ่นเหมือนหน้าจอ */
const at = (h, m) => new Date(2026, 8, 18, h, m).getTime() / 1000;
const quarterHours = (fromH, fromM, count) =>
  Array.from({ length: count }, (_, k) => at(fromH, fromM) + k * 900);

test("hourTicks: ขีดตกต้นชั่วโมงเท่านั้น และห่างเท่ากัน", () => {
  const times = quarterHours(7, 15, 41); /* 07:15 → 17:15 แบบเดียวกับกราฟจริง */
  const idx = hourTicks(times);
  assert.ok(idx.length > 0 && idx.length <= 8);
  for (const i of idx) assert.equal(new Date(times[i] * 1000).getMinutes(), 0);
  assert.equal(new Set(gaps(idx)).size, 1);
  /* 10 ชั่วโมงเกิน 8 ขีด → ต้องขยับไปทุก 2 ชั่วโมง */
  assert.deepEqual(idx.map((i) => new Date(times[i] * 1000).getHours()), [8, 10, 12, 14, 16]);
});

test("hourTicks: 24 ชั่วโมงข้ามเที่ยงคืน ยังห่างเท่ากัน", () => {
  const times = quarterHours(11, 0, 97);
  const idx = hourTicks(times);
  assert.ok(idx.length <= 8);
  assert.equal(new Set(gaps(idx)).size, 1);
});

test("hourTicks: ข้อมูลไม่มีจุดต้นชั่วโมงเลย คืนว่าง ไม่ล่ม", () => {
  assert.deepEqual(hourTicks([at(7, 15), at(7, 30)]), []);
  assert.deepEqual(hourTicks([]), []);
});

test("evenTicks: กราฟจำลองสถานการณ์ (แถบเหมาะสม 20 + ข้อมูลถึง ~31) ต้องไม่ถ่างไปถึง 35", () => {
  /* เห็นจริงบนจอ: ขั้น 5 ทำให้แกนเป็น 20–35 ครึ่งบนว่างเปล่า */
  const { domain, ticks } = evenTicks([20, 31]);
  assert.deepEqual(domain, [20, 32]);
  assert.equal(ticks.length, 7);
});
