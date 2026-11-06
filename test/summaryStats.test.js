/**
 * เทสต์กติกา "ค่าสูงสุดต้องเป็นยอดจริง ไม่ใช่ยอดของค่าเฉลี่ย" (T1.225)
 *
 * ที่มา — หน้าสภาพแวดล้อมเคยขึ้น "24 ชม. สูงสุด 27.7 °C" ขณะที่ค่าปัจจุบันที่อยู่
 * เหนือขึ้นไปไม่กี่เซนติเมตรบนจอเดียวกันเขียน 28.4 °C คนอ่านเห็นสองเลขนี้พร้อมกัน
 * แล้วเชื่อตัวเลขทั้งหน้าไม่ได้อีกเลย
 *
 * สาเหตุคือคิด min/max เอาจาก /series ซึ่งเป็นค่า**เฉลี่ยรายช่วง ~12 นาที**มาแล้ว
 * เทสต์ชุดนี้กันไม่ให้ใครย้อนกลับไปคิดแบบนั้นอีก และกันเคสขอบที่เคยทำให้ขึ้น "0"
 */
import test from "node:test";
import assert from "node:assert/strict";

import { rangeOf, statsFromPoints, toStats } from "../src/lib/api/summaryStats.js";

/** คำตอบย่อจาก /api/summary?source=pig&hours=24 ของจริง (4 ก.ย. 2569) */
const REAL = {
  สรุป: [
    { id: "temperature", จุดติดตั้ง: "barn_R", ต่ำสุด: 25.3, สูงสุด: 29.9, เฉลี่ย: 26.63, จำนวนค่า: 2217 },
    { id: "humidity", จุดติดตั้ง: "barn_R", ต่ำสุด: 69.1, สูงสุด: 88.5, เฉลี่ย: 84.48, จำนวนค่า: 2217 },
    /* จุดนอกอาคารร้อนกว่ามากเพราะเสาอากาศตากแดด — ห้ามหลุดมาปนกับค่าในเล้า */
    { id: "temperature", จุดติดตั้ง: "kamphaengphet_office", ต่ำสุด: 26.3, สูงสุด: 39.7, เฉลี่ย: 32.2, จำนวนค่า: 548 },
    { id: "humidity", จุดติดตั้ง: "kamphaengphet_office", ต่ำสุด: 38.6, สูงสุด: 84.5, เฉลี่ย: 62.27, จำนวนค่า: 546 },
  ],
};

test("ยอดที่ได้ต้องเป็นยอดจริงจาก /summary ไม่ใช่ยอดของเส้นกราฟที่เฉลี่ยมาแล้ว", () => {
  const s = toStats(REAL, "barn_R");
  assert.equal(s.tempMax, 29.9);
  assert.equal(s.tempMin, 25.3);
  assert.equal(s.tempAvg, 26.6);
});

test("ค่าปัจจุบันที่วัดได้ต้องไม่มีทางสูงกว่าค่าสูงสุดของช่วงเดียวกัน", () => {
  const s = toStats(REAL, "barn_R");
  const ค่าปัจจุบันที่เคยทำให้ขัดกัน = 28.4;
  assert.ok(
    ค่าปัจจุบันที่เคยทำให้ขัดกัน <= s.tempMax,
    `28.4 °C ต้องอยู่ในช่วง ${s.tempMin}–${s.tempMax} °C ไม่งั้นหน้าจอขัดกันเองเหมือนเดิม`,
  );
});

test("ค่านอกอาคารต้องไม่ปนเข้ามาในสรุปของเล้า", () => {
  const s = toStats(REAL, "barn_R");
  assert.notEqual(s.tempMax, 39.7, "39.7 °C เป็นของเสาอากาศที่ตากแดด ไม่ใช่ในเล้า");
});

test("เลือกจุดติดตั้งอื่นได้ และได้ยอดของจุดนั้นจริง ๆ", () => {
  const s = toStats(REAL, "kamphaengphet_office");
  assert.equal(s.tempMax, 39.7);
  assert.equal(s.humidityMin, 39);
});

test("ความชื้นปัดเป็นจำนวนเต็ม (หน้าจอไม่แสดงทศนิยมของ %RH)", () => {
  const s = toStats(REAL, "barn_R");
  assert.equal(s.humidityMax, 89);
  assert.equal(s.humidityMin, 69);
  assert.equal(s.humidityAvg, 84);
});

/* ---------- เคสขอบที่เคยทำให้ขึ้นเลขหลอก ---------- */

test("แถวที่ไม่มีค่าเลย (จำนวนค่า 0) ต้องไม่กลายเป็น 'ต่ำสุด 0'", () => {
  const empty = {
    สรุป: [{ id: "temperature", จุดติดตั้ง: "barn_R", ต่ำสุด: 0, สูงสุด: 0, เฉลี่ย: 0, จำนวนค่า: 0 }],
  };
  assert.equal(toStats(empty, "barn_R"), null);
});

test("มีแค่ความชื้น ไม่มีอุณหภูมิ ก็ยังสรุปได้ ส่วนที่ขาดเป็น null ไม่ใช่ 0", () => {
  const only = {
    สรุป: [{ id: "humidity", จุดติดตั้ง: "barn_R", ต่ำสุด: 60, สูงสุด: 80, เฉลี่ย: 70, จำนวนค่า: 10 }],
  };
  const s = toStats(only, "barn_R");
  assert.equal(s.tempMax, null);
  assert.equal(s.humidityAvg, 70);
});

test("ไม่มีจุดติดตั้งนี้ / คำตอบว่าง / เรียกไม่สำเร็จ → null ให้หน้าจอถอยไปคิดเอง", () => {
  assert.equal(toStats(REAL, "barn_ไม่มีจริง"), null);
  assert.equal(toStats({ สรุป: [] }, "barn_R"), null);
  assert.equal(toStats(null, "barn_R"), null);
});

/* ---------- สรุปจากจุดที่หลังบ้านของเราส่งมา (T1.303) ---------- */

const pt = (metric, value, extra = {}) => ({ metric, value, outdoor: false, ...extra });

test("ต่ำสุด/สูงสุดต้องเป็นของจริง ไม่ใช่ต่ำสุดของค่าเฉลี่ยรายช่วง", () => {
  const s = statsFromPoints([
    pt("temp_c", 27, { min: 24.2, max: 31.8, n: 300 }),
    pt("temp_c", 28, { min: 26.0, max: 29.0, n: 300 }),
  ]);
  /* ถ้าคิดจากค่าเฉลี่ยรายช่วงจะได้ 27–28 ซึ่งแคบกว่าความจริงมาก */
  assert.equal(s.tempMin, 24.2);
  assert.equal(s.tempMax, 31.8);
});

test("ค่าเฉลี่ยต้องถ่วงน้ำหนักด้วยจำนวนค่าในช่วง", () => {
  const s = statsFromPoints([
    pt("temp_c", 30, { n: 1 }),
    pt("temp_c", 20, { n: 99 }),
  ]);
  /* เฉลี่ยตรง ๆ จะได้ 25 ซึ่งให้น้ำหนักช่วงที่วัดได้ครั้งเดียวเท่ากับช่วงที่วัดได้ 99 ครั้ง */
  assert.equal(s.tempAvg, 20.1);
});

test("ค่านอกอาคารต้องไม่ถูกนับรวมกับค่าในเล้า", () => {
  const s = statsFromPoints([
    pt("temp_c", 27, { min: 27, max: 27, n: 10 }),
    { metric: "temp_c", value: 38, min: 38, max: 38, n: 10, outdoor: true },
  ]);
  assert.equal(s.tempMax, 27, "38 °C เป็นอุณหภูมินอกอาคาร ไม่ใช่ในเล้า");
});

test("ไม่มีจุดเลยต้องได้ null ไม่ใช่ศูนย์", () => {
  assert.equal(statsFromPoints([]), null);
  assert.equal(statsFromPoints(null), null);
  assert.equal(statsFromPoints([{ metric: "wind_ms", value: 1, outdoor: false }]), null);
});

/* ---------- แปลงช่วงเวลา (T1.303) ---------- */

test("ช่วงเวลาที่ส่งให้หลังบ้านต้องคงหน่วยเดิม — 30d ผ่าน แต่ 720h ถูกตีกลับ 400", () => {
  assert.equal(rangeOf("30d").api, "30d");
  assert.notEqual(rangeOf("30d").api, "720h");
});

test("ช่วงเวลาที่หน้าจอส่งมาต้องถูกแปลงตรงตามที่เลือก ไม่ใช่ตกไปใช้ 24 ชม. เงียบ ๆ", () => {
  /* ของเดิมเป็นตารางตายตัวที่มีแค่ 24h/7d/30d — กด "12 ชั่วโมงล่าสุด" แล้วได้ 24 ชม. */
  assert.deepEqual(rangeOf("12h"), { hours: 12, hourly: true, api: "12h" });
  assert.deepEqual(rangeOf("48h"), { hours: 48, hourly: true, api: "48h" });
  assert.deepEqual(rangeOf("24h"), { hours: 24, hourly: true, api: "24h" });
  /* เกินสองวันต้องสรุปรายวัน — เกณฑ์เดียวกับหลังบ้าน ไม่งั้นแกน X กับข้อมูลจะคนละความละเอียด */
  assert.deepEqual(rangeOf("7d"), { hours: 168, hourly: false, api: "7d" });
  assert.deepEqual(rangeOf("30d"), { hours: 720, hourly: false, api: "30d" });
  /* ค่าที่อ่านไม่ออกต้องถอยไป 24 ชม. ไม่ใช่พัง */
  assert.deepEqual(rangeOf("เมื่อวาน"), { hours: 24, hourly: true, api: "24h" });
  assert.deepEqual(rangeOf(undefined), { hours: 24, hourly: true, api: "24h" });
});
