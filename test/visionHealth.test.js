/**
 * กล้อง AI ยังประมวลผลอยู่จริงไหม (T1.355)
 *
 * ★★ ความเสี่ยงของงานนี้ไม่ใช่ "ดูไม่ได้" แต่คือ **"ดูได้แต่เป็นของเก่า/ของปลอม"**
 * ทีมกล้องบอกเองว่า /api/health ของเขาตรวจแค่ว่าเซิร์ฟเวอร์ตอบ เครื่องที่ค้างกลางทาง
 * ก็ยังตอบ 200 เหมือนเดิม — เทสต์ชุดนี้จึงกันเคส "ตอบ 200 แต่ไม่ได้ทำงาน" เป็นหลัก
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  AI_STATE_LABEL,
  FRESH_SEC,
  aiVerdict,
  lastEstimateAgeSec,
  pigCounts,
} from "../server/src/vision/health.js";

test("ต่อไม่ได้ = ขัดข้อง", () => {
  assert.equal(aiVerdict({ reachable: false, fps: null, lastEstimateAgeSec: null }).state, "down");
});

test("★ ตอบ 200 แต่ fps เป็นศูนย์ = ขัดข้อง (เคสที่ health ของเขาจับไม่ได้)", () => {
  const v = aiVerdict({ reachable: true, fps: 0, lastEstimateAgeSec: 5 });
  assert.equal(v.state, "down");
  assert.match(v.why, /ไม่ได้ประมวลผล/);
});

test("fps เดินอยู่ และมีผลประมวลผลใหม่ = กำลังประมวลผล", () => {
  assert.equal(aiVerdict({ reachable: true, fps: 12.5, lastEstimateAgeSec: 30 }).state, "working");
});

test("★ ไม่มีสุกรในภาพนาน ๆ = ว่าง ไม่ใช่พัง", () => {
  const v = aiVerdict({ reachable: true, fps: 12.5, lastEstimateAgeSec: FRESH_SEC + 1 });
  assert.equal(v.state, "idle");
  assert.notEqual(v.state, "down");
});

test("อ่านประวัติไม่ได้ = ไม่ทราบสถานะ ไม่ใช่เดาว่าทำงานอยู่", () => {
  assert.equal(aiVerdict({ reachable: true, fps: 12.5, lastEstimateAgeSec: null }).state, "unknown");
});

test("ทุกสถานะต้องมีป้ายภาษาไทย — ห้ามสื่อด้วยสีอย่างเดียว", () => {
  for (const s of ["working", "idle", "down", "unknown"]) {
    assert.ok(AI_STATE_LABEL[s], `ขาดป้ายของสถานะ ${s}`);
  }
});

test("อายุผลประมวลผล: หาค่าใหม่ที่สุดเอง ไม่เชื่อว่าแถวแรกใหม่สุด", () => {
  const now = Date.parse("2026-10-30T12:00:00+07:00");
  const rows = [
    { estimated_at: "2026-10-30T11:00:00+07:00" },
    { estimated_at: "2026-10-30T11:59:00+07:00" }, // ★ ใหม่กว่า แต่อยู่ท้าย
  ];
  assert.equal(lastEstimateAgeSec(rows, now), 60);
});

test("อายุผลประมวลผล: ไม่มีแถว หรือเวลาเสีย = null ไม่ใช่ 0", () => {
  assert.equal(lastEstimateAgeSec([], Date.now()), null);
  assert.equal(lastEstimateAgeSec([{ estimated_at: "ไม่ใช่เวลา" }], Date.now()), null);
  assert.equal(lastEstimateAgeSec(null, Date.now()), null);
});

test("★ เห็นในภาพตอนนี้ กับ สุทธิจากเส้นนับ ต้องเป็นคนละช่อง", () => {
  const c = pigCounts({ pig_counts: { total: 2, in: 7, out: 5, net: 2 } });
  assert.deepEqual(c, { inFrame: 2, in: 7, out: 5, net: 2 });
  /* เลขบังเอิญเท่ากันได้ แต่ต้องมาคนละช่อง ไม่ใช่ช่องเดียวกัน */
  assert.ok("inFrame" in c && "net" in c);
});

test("ค่าที่หายหรือไม่ใช่ตัวเลข = null ไม่ใช่ 0 (0 ตัวกับไม่รู้ ต่างกัน)", () => {
  assert.deepEqual(pigCounts({}), { inFrame: null, in: null, out: null, net: null });
  assert.equal(pigCounts({ pig_counts: { total: "—" } }).inFrame, null);
});
