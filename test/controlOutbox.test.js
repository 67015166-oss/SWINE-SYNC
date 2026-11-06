/**
 * กล่องขาออกของคำสั่งอุปกรณ์ (T1.310)
 *
 * สิ่งที่ต้องกันไว้ให้ได้ เพราะพลาดแล้วพัดลมในโรงเรือนจริงทำงานผิด:
 *   · ลำดับคำสั่งสลับ — สั่ง "เปิด" แล้ว "ปิด" ถ้าส่งสลับกัน ผลกลับด้าน
 *   · ส่งไม่สำเร็จแล้วเงียบ — ต้องบังคับให้บอกเหตุผล
 *   · ปิดรายการซ้ำ — จะลบร่องรอยว่าเคยส่งไม่สำเร็จมาก่อน
 *   · ข้อมูลคนสั่งหลุดออกไปนอกระบบ
 */
import test from "node:test";
import assert from "node:assert/strict";

import { MAX_BATCH, ackStatus, checkAck, clampLimit, toOutboxItem } from "../server/src/control/outbox.js";
import { statusText } from "../src/lib/api/controlText.js";

const ROW = {
  id: "11111111-2222-3333-4444-555555555555",
  barn_key: "F-KPP-A1",
  device_kind: "fan",
  device_id: "FAN 1",
  action: "speed",
  hz: 45,
  remote_addr: "plc/fan1",
  requested_at: "2026-10-05T10:00:00.000Z",
  /* ฟิลด์ที่ไม่ควรหลุดออกไป */
  reason: "ร้อนมาก",
  requested_by: "uuid-ของคน",
  client_id: "abc",
};

/* ---------- สิ่งที่ส่งออกไปให้ Node-RED ---------- */

test("ส่งออกไปเฉพาะสิ่งที่ Node-RED ต้องใช้ ไม่มากกว่านั้น", () => {
  /* ★ ชื่อคนสั่งกับเหตุผลที่พิมพ์ไว้ไม่ควรออกไปนอกระบบ
     อะไรที่ส่งออกไปก็มีโอกาสไปโผล่ใน log ของระบบอื่นที่เราควบคุมไม่ได้ */
  const item = toOutboxItem(ROW);
  assert.deepEqual(Object.keys(item).sort(), [
    "action", "barnKey", "deviceId", "deviceKind", "hz", "id", "remoteAddr", "requestedAt",
  ]);
  assert.equal(item.deviceId, "FAN 1");
  assert.equal(item.hz, 45);
  assert.equal(item.remoteAddr, "plc/fan1");
});

test("ไม่มีที่อยู่ฝั่ง PLC ก็ยังส่งออกได้ — ตัวแปลงอยู่ใน Node-RED", () => {
  /* ทางนี้ตั้งใจให้ Node-RED เป็นคนแปลง deviceId เป็นภาษา PLC
     ซึ่งเป็นเหตุผลที่เลือกทางนี้ตั้งแต่แรก */
  const item = toOutboxItem({ ...ROW, remote_addr: null });
  assert.equal(item.remoteAddr, null);
  assert.equal(item.deviceId, "FAN 1");
});

test("แถวที่ไม่มี id ต้องถูกตัดทิ้ง ไม่ใช่ส่งของพังออกไป", () => {
  assert.equal(toOutboxItem({ barn_key: "F-KPP-A1" }), null);
  assert.equal(toOutboxItem(null), null);
});

/* ---------- จำนวนที่ดึงได้ต่อครั้ง ---------- */

test("จำนวนที่ขอต้องถูกคุมไว้ ไม่ให้ขอทีเดียวหมด", () => {
  assert.equal(clampLimit(5), 5);
  assert.equal(clampLimit(9999), MAX_BATCH);
  /* ค่าที่อ่านไม่ออกต้องถอยไปค่าตั้งต้น ไม่ใช่กลายเป็น 0 แล้วไม่ได้อะไรเลย */
  assert.equal(clampLimit("มั่ว"), 10);
  assert.equal(clampLimit(0), 10);
  assert.equal(clampLimit(-3), 10);
  assert.equal(clampLimit(undefined), 10);
});

/* ---------- คำตอบจาก Node-RED ---------- */

test("ส่งไม่สำเร็จต้องบอกเหตุผล ไม่งั้นบันทึกจะว่างเปล่าตอนที่ต้องการที่สุด", () => {
  const bad = checkAck({ ok: false });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /เหตุผล/);

  const good = checkAck({ ok: false, detail: "PLC ไม่ตอบใน 5 วินาที" });
  assert.equal(good.ok, true);
  assert.equal(good.sent, false);
  assert.equal(good.detail, "PLC ไม่ตอบใน 5 วินาที");
});

test("สำเร็จแล้วไม่บอกอะไรก็ได้ แต่ต้องไม่เหลือช่องว่างในบันทึก", () => {
  const v = checkAck({ ok: true });
  assert.equal(v.ok, true);
  assert.equal(v.sent, true);
  assert.ok(v.detail.length > 0);
});

test("คำตอบที่ไม่มีฟิลด์ ok ต้องถูกปฏิเสธ — เดาแทนไม่ได้ว่าสำเร็จหรือไม่", () => {
  assert.equal(checkAck({}).ok, false);
  assert.equal(checkAck({ ok: "true" }).ok, false, "สตริงไม่ใช่ boolean");
  assert.equal(checkAck(null).ok, false);
  assert.equal(checkAck("ok").ok, false);
});

test("รายละเอียดที่ยาวเกินต้องถูกตัด ไม่ให้ log ของคนอื่นมาถมฐานเรา", () => {
  const v = checkAck({ ok: false, detail: "x".repeat(5000) });
  assert.equal(v.detail.length, 300);
});

/* ---------- สถานะที่บันทึก ---------- */

test("สถานะหลังรับคำตอบต้องแยกสำเร็จกับล้มเหลว", () => {
  assert.equal(ackStatus(true), "sent");
  assert.equal(ackStatus(false), "failed");
});

test("sent ไม่ได้แปลว่าตู้ทำตาม — ต้องไม่ไปแตะ confirmed", () => {
  /* ยืนยันว่าพัดลมหมุนจริงต้องรอช่องทางตอบกลับที่ยังไม่มี
     ถ้าเผลอตั้ง confirmed = true ตรงนี้ หน้าจอจะบอกว่าอุปกรณ์ทำงานแล้วทั้งที่ไม่มีใครรู้ */
  assert.notEqual(ackStatus(true), "confirmed");
});

/* ---------- ข้อความที่คนกดเห็น ---------- */

test("held สองแบบต้องพูดไม่เหมือนกัน — แบบหนึ่งกำลังจะไป อีกแบบไปไม่ได้", () => {
  /* ★ ถ้าบอกเหมือนกัน คนกดจะเข้าใจผิดว่าไม่มีอะไรเกิดขึ้น ทั้งที่อีกไม่กี่วินาที
     Node-RED จะมารับไปส่งให้ตู้ควบคุมจริง ๆ */
  const waiting = statusText("held", "outbox");
  const stuck = statusText("held", "hold");
  assert.notEqual(waiting, stuck);
  assert.match(waiting, /รอส่งให้ตู้ควบคุม/);
  assert.match(stuck, /ยังไม่มีสิทธิ์/);
});

test("ไม่รู้ว่าส่งทางไหน ต้องใช้ข้อความเดิมที่ระมัดระวังกว่า", () => {
  /* ไม่รู้ = ต้องไม่สัญญาว่ากำลังจะส่ง */
  assert.equal(statusText("held"), statusText("held", "hold"));
  assert.equal(statusText("held", undefined), statusText("held", "hold"));
});

test("สถานะอื่นไม่เปลี่ยนความหมายตามทางส่ง", () => {
  assert.equal(statusText("sent", "outbox"), statusText("sent", "hold"));
  assert.match(statusText("sent"), /รอตู้ควบคุมยืนยัน/);
  assert.match(statusText("rejected"), /ด่านความปลอดภัย/);
  /* สถานะที่ไม่รู้จักต้องคืนค่าเดิม ไม่ใช่คืนค่าว่าง */
  assert.equal(statusText("แปลก ๆ"), "แปลก ๆ");
});
