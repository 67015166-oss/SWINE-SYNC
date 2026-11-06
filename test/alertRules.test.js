/**
 * บันทึกเกณฑ์แล้วต้องแตะเฉพาะแถวที่มีคนแก้จริง (T1.259)
 *
 * เจอจริง 16 ก.ย. 2569 ตอนทดสอบด่านสิทธิ์: ยิง PUT /api/alerts/rules ด้วย body ว่าง
 * ได้ 200 ตามคาด (ผู้บันทึกขึ้นไปผ่านด่าน) แต่แถวเกณฑ์ NH3 กลับมี updated_at ขยับ
 * เพราะรายการ nh3 เขียนขั้นต่ำเป็น `null` แทน `undefined` บรรทัด "ไม่มีอะไรให้แก้ก็ข้าม"
 * จึงไม่ทำงาน — ค่าไม่เพี้ยนเพราะ coalesce คืนค่าเดิม แต่ "แก้ล่าสุดเมื่อไหร่" โกหก
 *
 * เทสต์นี้อ่านซอร์สตรง ๆ กันไม่ให้ใครเผลอเปลี่ยนกลับเป็น null อีก
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../server/src/modules/alerts/route.js", import.meta.url), "utf8");

test("NH3 ไม่มีขั้นต่ำ ต้องส่ง undefined ไม่ใช่ null", () => {
  assert.match(route, /\["nh3", undefined, body\.nh3Limit\]/);
  assert.doesNotMatch(route, /\["nh3", null,/);
});

test("ยังมีบรรทัดข้ามแถวที่ไม่มีอะไรให้แก้", () => {
  assert.match(route, /if \(min === undefined && max === undefined\) continue;/);
});

test("ทุกแถวที่ไม่ได้ส่งค่ามาต้องถูกข้าม ไม่ใช่เขียนทับด้วยค่าเดิม", () => {
  /* จำลองลูปเดียวกับในเส้นทาง: body ว่าง = ไม่มีแถวไหนถูกแตะเลย */
  const body = {};
  const updates = [
    ["temp_c", body.tempMin, body.tempMax],
    ["humidity", body.humidityMin, body.humidityMax],
    ["nh3", undefined, body.nh3Limit],
  ];
  const touched = updates
    .filter(([, min, max]) => !(min === undefined && max === undefined))
    .map(([metric]) => metric);
  assert.deepEqual(touched, []);
});

test("ส่งเฉพาะเพดาน NH3 มา ต้องแตะแถว NH3 แถวเดียว", () => {
  const body = { nh3Limit: 20 };
  const updates = [
    ["temp_c", body.tempMin, body.tempMax],
    ["humidity", body.humidityMin, body.humidityMax],
    ["nh3", undefined, body.nh3Limit],
  ];
  const touched = updates
    .filter(([, min, max]) => !(min === undefined && max === undefined))
    .map(([metric]) => metric);
  assert.deepEqual(touched, ["nh3"]);
});

test("เกณฑ์แก้ได้ตั้งแต่ผู้บันทึกขึ้นไป และคำอธิบายเหนือเส้นทางต้องไม่ขัดกับโค้ด", () => {
  assert.match(route, /alertsRouter\.put\("\/rules", requireAuth, requireRole\("editor"\)/);
  assert.doesNotMatch(route, /\*\*ต้องเป็นผู้ดูแลระบบ\*\*/);
});
