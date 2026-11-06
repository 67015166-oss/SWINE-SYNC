/**
 * ตัวเลขรวมของทุกฟาร์ม (T1.311)
 *
 * เจอตอนไล่ตรวจหน้าภาพรวม/ฝูงสุกร/การเงินเรื่อง "ข้อมูลไม่สด"
 * หน้าภาพรวมคิดค่าเฉลี่ยเองอย่างถูกต้องอยู่แล้ว (กรองโรงเรือนออฟไลน์ทั้งตัวตั้งและตัวหาร)
 * แต่ `summarizeFarms` ที่ **แถบเมนูบนกับผลการค้นหา** ใช้ ไม่ได้กรอง
 */
import test from "node:test";
import assert from "node:assert/strict";

import { summarizeFarms } from "../src/data/mock/farms.js";

/** ฟาร์มตัวอย่างที่ยังส่งค่าอยู่ */
const live = {
  id: "F-NSN", status: "good", pigs: 11200, barnCount: 7, alerts: 2,
  tempC: 29.1, humidity: 75, updatedAt: "2026-10-05T03:17:00.000Z",
};

/** ฟาร์มจริงที่ออฟไลน์ — ค่าทุกตัวเป็น null ตามกติกาข้อมูลไม่สด */
const offline = {
  id: "F-KPP", status: "offline", pigs: null, barnCount: 1, alerts: 1,
  tempC: null, humidity: null, updatedAt: "2026-09-28T18:59:02.923Z",
};

test("ฟาร์มที่ออฟไลน์ต้องไม่ถูกนับเป็นศูนย์ในค่าเฉลี่ย", () => {
  /* ★ ของเดิม: (29.1 + null) / 2 = 14.55 °C
     ซึ่งเป็นอุณหภูมิที่เป็นไปไม่ได้ในเล้าสุกร แต่หน้าจอจะโชว์หน้าตาเฉย ๆ */
  const s = summarizeFarms([live, offline]);
  assert.equal(s.avgTempC, 29.1, "ต้องเฉลี่ยจากฟาร์มที่มีค่าจริงเท่านั้น");
  assert.equal(s.avgHumidity, 75);
});

test("ไม่มีฟาร์มไหนมีค่าเลย ต้องเป็น null ไม่ใช่ 0 หรือ NaN", () => {
  /* null → หน้าจอขึ้นขีดกลาง ซึ่งอ่านว่า "ไม่รู้" ตรงกับความจริง
     0 → อ่านว่า "ศูนย์องศา" · NaN → อ่านไม่ออกเลย */
  const s = summarizeFarms([offline]);
  assert.equal(s.avgTempC, null);
  assert.equal(s.avgHumidity, null);
});

test("รายการว่างต้องไม่พัง", () => {
  const s = summarizeFarms([]);
  assert.equal(s.total, 0);
  assert.equal(s.pigs, 0);
  assert.equal(s.avgTempC, null);
  assert.equal(s.updatedAt, null);
});

test("จำนวนสุกรที่ไม่รู้ต้องไม่ทำให้ยอดรวมกลายเป็น NaN", () => {
  /* ฟาร์มจริงไม่มีข้อมูลจำนวนสุกร (pigs: null) — ยอดรวมต้องยังอ่านได้ */
  const s = summarizeFarms([live, offline, { ...offline, id: "X", pigs: undefined }]);
  assert.equal(s.pigs, 11200);
  assert.equal(Number.isNaN(s.pigs), false);
});

test("นับสถานะฟาร์มตามจริง", () => {
  const s = summarizeFarms([live, offline]);
  assert.equal(s.total, 2);
  assert.equal(s.good, 1);
  assert.equal(s.offline, 1);
  assert.equal(s.barns, 8);
  assert.equal(s.alerts, 3);
});

test("เวลาอัปเดตล่าสุดต้องเป็นของใหม่สุด และฟาร์มที่ไม่มีเวลาต้องไม่ลบของคนอื่นทิ้ง", () => {
  /* ★ `[null, "2026-10-05…"].sort()` ดัน null ไปอยู่ท้าย เพราะ "null" > "2026"
     แล้ว `.at(-1)` จะคืน null — ฟาร์มเดียวที่ไม่มีเวลาลบเวลาของทั้งหน้าทิ้ง */
  const s = summarizeFarms([live, offline, { ...live, id: "Y", updatedAt: null }]);
  assert.equal(s.updatedAt, live.updatedAt);
});
