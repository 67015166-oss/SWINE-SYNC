/**
 * ช่องไหนของเกณฑ์ "เปลี่ยนจริง" (T1.362)
 *
 * ★★ บั๊กที่เทสต์ชุดนี้มีไว้กัน: หน้าเว็บซิงก์เกณฑ์ขึ้นมาเองตอนมีคนเข้าระบบ
 * และส่งมาครบทุกช่องเสมอ ถ้านับว่า "ส่งมา = แก้" จะมีบรรทัด "ใครบางคนแก้เกณฑ์"
 * โผล่ทุกครั้งที่มีคนเปิดแอป ทั้งที่ไม่มีใครแตะอะไร — **หลุดขึ้นเครื่องจริงมาแล้ว**
 */
import test from "node:test";
import assert from "node:assert/strict";

import { COMFORT_FIELDS, changedComfortFields } from "../server/src/alerts/changed.js";

/** ค่าเดิมแบบที่ฐานคืนมาจริง — คอลัมน์ numeric มาเป็น **สตริง** */
const BEFORE = [
  { metric: "temp_c", threshold_min: "24.0", threshold_max: "30.0" },
  { metric: "humidity", threshold_min: "50.0", threshold_max: "80.0" },
  { metric: "nh3", threshold_min: null, threshold_max: "15.0" },
];
const SAME_BODY = { tempMin: 24, tempMax: 30, humidityMin: 50, humidityMax: 80, nh3Limit: 15 };

test("★★ ส่งค่าเดิมมาครบทุกช่อง = ไม่มีอะไรเปลี่ยน (เคสที่ทำให้แจ้งเตือนรัว)", () => {
  assert.deepEqual(changedComfortFields(BEFORE, SAME_BODY), []);
});

test("★ ฐานคืนค่าเป็นสตริง ต้องเทียบแบบตัวเลข ไม่ใช่ !==", () => {
  /* "24.0" !== 24 ถ้าเทียบตรง ๆ ทุกช่องจะถูกนับว่าเปลี่ยนตลอดไป */
  assert.deepEqual(changedComfortFields(BEFORE, { tempMin: 24 }), []);
  assert.deepEqual(changedComfortFields(BEFORE, { tempMin: 24.0 }), []);
});

test("แก้จริงหนึ่งช่อง = รายงานช่องเดียว ไม่ใช่ทั้งก้อน", () => {
  assert.deepEqual(changedComfortFields(BEFORE, { ...SAME_BODY, tempMax: 31 }), ["tempMax"]);
});

test("แก้หลายช่อง รายงานครบและเรียงตามลำดับช่อง", () => {
  const got = changedComfortFields(BEFORE, { ...SAME_BODY, tempMin: 23, nh3Limit: 12 });
  assert.deepEqual(got, ["tempMin", "nh3Limit"]);
});

test("ช่องที่ไม่ได้ส่งมา ต้องไม่ถูกนับว่าเปลี่ยน", () => {
  assert.deepEqual(changedComfortFields(BEFORE, { tempMax: 30 }), []);
  assert.deepEqual(changedComfortFields(BEFORE, {}), []);
});

test("★ ยังไม่เคยมีค่าเดิมในฐาน = ตั้งค่าครั้งแรก ต้องนับว่าเปลี่ยน", () => {
  assert.deepEqual(changedComfortFields([], { tempMin: 24 }), ["tempMin"]);
  assert.deepEqual(changedComfortFields(null, { nh3Limit: 15 }), ["nh3Limit"]);
});

test("★ ค่าที่เทียบไม่ได้ (ไม่ใช่ตัวเลข) ต้องนับว่าเปลี่ยน ดีกว่าเงียบแล้วตกหล่น", () => {
  assert.deepEqual(changedComfortFields(BEFORE, { tempMin: "ไม่ใช่เลข" }), ["tempMin"]);
});

test("NH3 ผูกกับเพดาน ไม่ใช่ขั้นต่ำ", () => {
  const pair = COMFORT_FIELDS.find(([k]) => k === "nh3Limit");
  assert.deepEqual(pair, ["nh3Limit", "nh3", "threshold_max"]);
  assert.deepEqual(changedComfortFields(BEFORE, { nh3Limit: 15 }), []);
  assert.deepEqual(changedComfortFields(BEFORE, { nh3Limit: 20 }), ["nh3Limit"]);
});
