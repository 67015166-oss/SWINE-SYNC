/**
 * เทสต์กติกา "เซนเซอร์ตายแล้วยังส่งค่า"
 *
 * ที่มา (3 ก.ย. 2569): ทีมที่ดูแลคลาวด์ทักว่า CO₂/NH₃ ของฟาร์มกำแพงเพชรเป็น 0
 * ตรวจย้อนหลัง 24 ชม. ผ่าน /series พบว่าเป็น 0.0 ทั้ง 121 จุด ไม่ขยับเลยแม้แต่จุดเดียว
 * แต่แดชบอร์ดกลับขึ้นป้ายเขียว "อยู่ในเกณฑ์" = เซนเซอร์ที่ตายอยู่ดูเหมือนอากาศดีเยี่ยม
 *
 * เทสต์ชุดนี้กันไม่ให้อาการนั้นกลับมา และกันฝั่งตรงข้ามด้วย —
 * เล้าที่อากาศดีจริงต้องไม่โดนหาว่าเซนเซอร์เสีย
 */
import test from "node:test";
import assert from "node:assert/strict";

import { GAS_FLOOR, belowPhysicalFloor, gasModuleSuspect, seriesStuck } from "../src/lib/sensorHealth.js";
import { airStatus } from "../src/data/mock/airQuality.js";

/* ---------- พื้นล่างทางกายภาพ ---------- */

test("CO₂ 0 ppm เป็นไปไม่ได้ — อากาศกลางแจ้งยังราว 420 ppm", () => {
  assert.equal(belowPhysicalFloor("co2", 0), true);
});

test("CO₂ ที่วัดได้จริงต้องไม่ถูกหาว่าเสีย", () => {
  for (const ppm of [420, 800, 1500, 2600]) {
    assert.equal(belowPhysicalFloor("co2", ppm), false, `${ppm} ppm ควรถือว่าใช้ได้`);
  }
});

test("NH₃ กับ H₂S ห้ามมีพื้นล่าง — 0 ppm ในเล้าที่ระบายอากาศดีเป็นค่าที่เป็นไปได้จริง", () => {
  assert.equal(GAS_FLOOR.nh3, undefined);
  assert.equal(GAS_FLOOR.h2s, undefined);
  assert.equal(belowPhysicalFloor("nh3", 0), false);
  assert.equal(belowPhysicalFloor("h2s", 0), false);
});

test("ไม่มีค่า ≠ ค่าที่เชื่อไม่ได้ — null ต้องไม่ถูกตัดสินตรงนี้", () => {
  assert.equal(belowPhysicalFloor("co2", null), false);
  assert.equal(gasModuleSuspect({ co2: null }), false);
  assert.equal(gasModuleSuspect(null), false);
});

/* ---------- ทั้งโมดูลพังพร้อมกัน ---------- */

test("CO₂ พัง = ทั้งโมดูลน่าสงสัย (NH₃ มาจากอุปกรณ์ตัวเดียวกัน)", () => {
  assert.equal(gasModuleSuspect({ co2: 0, nh3: 0 }), true);
});

test("CO₂ ปกติ = โมดูลใช้ได้ แม้ NH₃ จะเป็น 0", () => {
  assert.equal(gasModuleSuspect({ co2: 900, nh3: 0 }), false);
});

/* ---------- ป้ายบนหน้าจอ ---------- */

test("ค่าที่เชื่อไม่ได้ต้องไม่ขึ้นป้ายเขียว", () => {
  const status = airStatus("co2", null, 2000, true);
  assert.notEqual(status.tone, "good");
  assert.equal(status.tone, "warning");
  assert.equal(status.label, "สงสัยเซนเซอร์");
});

test('"สงสัยเซนเซอร์" ต้องแยกจาก "ไม่มีสัญญาณ" — คนละอาการ คนละวิธีแก้', () => {
  /* H₂S ไม่มีเซนเซอร์ตั้งแต่ต้น = ไม่มีอะไรให้ซ่อม
     ส่วน NH₃ มีอุปกรณ์อยู่และยังส่งค่าอยู่ แต่ค่าที่ส่งเป็นไปไม่ได้ = มีของต้องไปตาม */
  assert.equal(airStatus("h2s", null, 5, false).label, "ไม่มีสัญญาณ");
  assert.equal(airStatus("nh3", null, 15, true).label, "สงสัยเซนเซอร์");
});

test("ค่าปกติยังตัดสินเหมือนเดิมทุกประการ", () => {
  assert.equal(airStatus("co2", 900, 2000).tone, "good");
  assert.equal(airStatus("nh3", 20, 15).tone, "warning");
  assert.equal(airStatus("nh3", 30, 15).tone, "critical");
  assert.equal(airStatus("wind", 0.2).label, "ลมน้อยเกินไป");
});

/* ---------- เส้นที่เซนเซอร์ค้าง (T1.304) ---------- */

const line = (values, { stepMin = 60, start = "2026-09-24T00:00:00+07:00" } = {}) =>
  values.map((value, i) => ({ at: new Date(new Date(start).getTime() + i * stepMin * 60_000), value }));

test("ค่าเดิมซ้ำทั้งวันคือเซนเซอร์ค้าง ไม่ใช่สภาพอากาศที่นิ่งมาก", () => {
  /* ของจริง 24 ก.ย. 2569: เซนเซอร์นอกอาคารส่ง 3,525 ค่า เป็น 27.6 ทุกค่า */
  assert.equal(seriesStuck(line(Array(24).fill(27.6))), true);
});

test("ขยับครั้งเดียวในเดือนนึงก็ยังค้างอยู่ดี", () => {
  /* เกณฑ์ "ต้องมีมากกว่า 1 ค่าที่ต่างกัน" จะปล่อยเคสนี้ผ่าน ซึ่งผิด */
  const values = [...Array(360).fill(27.6), ...Array(360).fill(29.7)];
  assert.equal(seriesStuck(line(values)), true);
});

test("อากาศจริงที่ขึ้นลงตามกลางวันกลางคืน ต้องไม่ถูกหาว่าค้าง", () => {
  const values = Array.from({ length: 48 }, (_, i) => 27 + 5 * Math.sin((i / 24) * 2 * Math.PI));
  assert.equal(seriesStuck(line(values)), false);
});

test("ข้อมูลน้อยหรือช่วงสั้นเกินไป ต้องไม่ตัดสิน — เล้าที่คุมอุณหภูมิดีก็นิ่งได้", () => {
  /* นิ่ง 5 จุด = ยังบอกไม่ได้ */
  assert.equal(seriesStuck(line(Array(5).fill(27.6))), false);
  /* นิ่ง 24 จุดแต่ห่างกันจุดละนาที = แค่ 23 นาที ยังบอกไม่ได้ */
  assert.equal(seriesStuck(line(Array(24).fill(27.6), { stepMin: 1 })), false);
});

test("ค่าที่หายไปต้องไม่ถูกนับเป็นการเปลี่ยนแปลง", () => {
  /* ถ้านับ null เป็นค่าหนึ่ง เส้นที่ค้างแต่มีรูจะดู "ขยับ" ทั้งที่ไม่ได้ขยับ */
  const values = Array.from({ length: 40 }, (_, i) => (i % 2 ? null : 27.6));
  assert.equal(seriesStuck(line(values)), true, "ค่าจริง 20 จุดที่เท่ากันหมด = ค้าง");
});

/* ---------- ★ ใช้ min/max ของแต่ละช่วงเป็นตัวตัดสินหลัก (T1.304) ---------- */

const bucket = (value, min, max, i, { stepH = 24 } = {}) => ({
  at: new Date(new Date("2026-09-01T00:00:00+07:00").getTime() + i * stepH * 3_600_000),
  value, min, max,
});

test("เซนเซอร์ที่อัปเดตวันละครั้ง ต้องถูกจับว่าค้าง แม้ค่าเฉลี่ยรายวันจะต่างกันทุกวัน", () => {
  /* ★ เคสที่กติกาเดิมพลาด — ของจริงที่ฟาร์มกำแพงเพชร
     ค่าเฉลี่ยแต่ละวันไม่เท่ากัน (ดูเหมือนวัดจริง) แต่ภายในวันเดียวกันเข็มไม่ขยับเลยสักครั้ง
     หลังบ้านส่ง min/max มาให้ จึงรู้ได้ว่า "ในช่วงนั้นไม่มีการเปลี่ยนแปลงเลย" */
  const rows = [26.5, 27.6, 27.6, 29.7, 26.5, 27.6, 29.7, 26.5, 27.6, 29.7, 26.5, 27.6, 29.7, 26.5]
    .map((v, i) => bucket(v, v, v, i));
  assert.equal(seriesStuck(rows), true);
});

test("เซนเซอร์ที่เข็มขยับภายในแต่ละช่วง ต้องไม่ถูกหาว่าค้าง แม้ค่าเฉลี่ยจะเท่ากันทุกช่วง", () => {
  /* กลับกัน: ค่าเฉลี่ยเท่ากันหมดแต่ในแต่ละวันขยับ 24–30 °C = วัดจริงแน่นอน */
  const rows = Array.from({ length: 14 }, (_, i) => bucket(27, 24, 30, i));
  assert.equal(seriesStuck(rows), false);
});

test("ค้างเป็นบางช่วงแต่ไม่ถึงเกณฑ์ ต้องยังวาดเส้นให้ — ข้อมูลจริงบางส่วนมีค่า", () => {
  /* ครึ่งหนึ่งค้าง ครึ่งหนึ่งวัดจริง (0.5 < 0.8) — ตัดทิ้งทั้งเส้นจะทำให้ของจริงหายไปด้วย */
  const rows = Array.from({ length: 14 }, (_, i) =>
    i % 2 ? bucket(27, 27, 27, i) : bucket(27, 24, 30, i));
  assert.equal(seriesStuck(rows), false);
});

test("ไม่มี min/max มาด้วย ต้องถอยไปดูว่าค่าของช่วงติดกันเปลี่ยนบ่อยแค่ไหน", () => {
  const flat = Array.from({ length: 14 }, (_, i) => ({ at: bucket(0, 0, 0, i).at, value: 27.6 }));
  assert.equal(seriesStuck(flat), true);
});
