/**
 * นับจำนวนสุกรจากบันทึกของคนหน้าฟาร์ม (T1.321)
 *
 * ตัวเลขนี้คือเลขที่เจ้านายถามก่อนทุกครั้ง ผิดแล้วเสียความเชื่อถือทั้งแดชบอร์ด
 * สิ่งที่ต้องกันให้ได้คือ **"ไม่รู้" ต้องไม่กลายเป็น "ศูนย์"** เพราะสองอย่างนี้
 * อ่านต่างกันสิ้นเชิง — ศูนย์อ่านว่าเล้าว่าง/ขายหมด ส่วนไม่รู้คือยังไม่ได้บันทึก
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  HERD_REASON,
  barnCount,
  barnCountTotal,
  STAGE_NONE,
  countDiffEntry,
  countsByStage,
  herdFromLogs,
  herdTotal,
} from "../src/lib/herdCount.js";

const log = (type, amount, unit = "ตัว") => ({ type, amount, unit });

test("ลงยอดตั้งต้นแล้วหักขาออก ได้จำนวนที่เชื่อได้", () => {
  const r = herdFromLogs([log("moveIn", 1200), log("dead", 3), log("moveOut", 200), log("missing", 2)]);
  assert.equal(r.count, 995);
  assert.equal(r.confident, true);
  assert.equal(r.reason, null);
});

test("ชนิดที่ไม่เปลี่ยนจำนวนต้องไม่ถูกนับ", () => {
  /* ให้อาหาร 200 กก. กับหมูป่วย 5 ตัว ไม่ได้ทำให้จำนวนสุกรเปลี่ยน
     ★ ป่วยคือยังอยู่ในเล้า ถ้าเอาไปหักจะกลายเป็นหมูหายไปจากฟาร์ม */
  const r = herdFromLogs([log("moveIn", 100), log("feed", 200, "กิโลกรัม"), log("sick", 5), log("medicine", 10, "โดส")]);
  assert.equal(r.count, 100);
});

test("★★ ไม่มีบันทึกเลย ต้องได้ null ไม่ใช่ 0", () => {
  /* 0 อ่านว่า "เล้าว่าง" ซึ่งคนละเรื่องกับ "ยังไม่รู้ว่ามีกี่ตัว"
     อันแรกทำให้คนนึกว่าขายหมดแล้ว อันหลังคือความจริง */
  const r = herdFromLogs([]);
  assert.equal(r.count, null);
  assert.equal(r.confident, false);
  assert.equal(r.reason, "no-logs");
  assert.ok(HERD_REASON[r.reason]);
});

test("★★ ขาออกมากกว่าขาเข้า = ยังไม่ได้ลงยอดตั้งต้น ไม่ใช่ติดลบ", () => {
  /* ฟาร์มที่เริ่มใช้ระบบกลางทางมีสุกรอยู่ก่อนแล้ว ถ้าบันทึกแต่หมูตาย
     โดยไม่เคยลง moveIn ของยอดเดิม ผลจะติดลบ — ห้ามโชว์ -3 ตัว
     และห้ามปัดเป็น 0 ด้วย เพราะทั้งคู่เป็นตัวเลขที่ไม่มีความหมาย */
  const r = herdFromLogs([log("dead", 3)]);
  assert.equal(r.count, null);
  assert.equal(r.reason, "no-opening");
  assert.match(HERD_REASON[r.reason], /ย้ายสุกรเข้า/);
});

test("มีแต่ขาออกแล้วหักกันพอดีเป็นศูนย์ ก็ยังสรุปไม่ได้", () => {
  /* net = 0 แต่ไม่เคยมี moveIn — เลข 0 ที่ได้มาแบบนี้ไม่ได้แปลว่าเล้าว่าง */
  const r = herdFromLogs([log("moveOut", 5), log("moveIn", 5), log("dead", 0)]);
  assert.equal(r.count, 0);
  assert.equal(r.confident, true, "อันนี้มี moveIn จริง จึงสรุปได้ว่าเหลือ 0");

  const bad = herdFromLogs([log("missing", 2), log("moveOut", 0)]);
  assert.equal(bad.confident, false);
  assert.equal(bad.reason, "no-opening");
});

test("จำนวนที่อ่านไม่ออกต้องถูกข้าม ไม่ใช่นับเป็นศูนย์", () => {
  /* ★ `Number(null)` และ `Number("")` เป็น 0 ซึ่งผ่าน Number.isFinite
     กับดักเดียวกับ T1.295 · T1.308 · T1.311 · T1.316 · T1.317 */
  const r = herdFromLogs([log("moveIn", 500), log("dead", null), log("dead", ""), log("dead", "x")]);
  assert.equal(r.count, 500);
  assert.equal(r.dead, 0);
});

test("หน่วยที่ไม่ใช่ตัวต้องไม่หลุดเข้ามาเป็นจำนวนสุกร", () => {
  /* ชนิดกับหน่วยตั้งไม่ตรงกันได้ในข้อมูลเก่า — 200 กิโลกรัมต้องไม่กลายเป็น 200 ตัว */
  const r = herdFromLogs([log("moveIn", 100), log("moveOut", 200, "กิโลกรัม")]);
  assert.equal(r.count, 100);
});

/* ---------- รวมหลายเล้าเป็นยอดฟาร์ม ---------- */

test("★ เล้าที่สรุปไม่ได้ต้องไม่ถูกนับเป็น 0 ในยอดฟาร์ม", () => {
  /* ถ้าเอามารวมเป็น 0 ยอดฟาร์มจะต่ำกว่าความจริงโดยที่หน้าจอดูเหมือนครบ
     — กับดักเดียวกับค่าเฉลี่ยอุณหภูมิใน T1.311 */
  const t = herdTotal({
    A1: herdFromLogs([log("moveIn", 1000), log("dead", 10)]),
    A2: herdFromLogs([]),
    A3: herdFromLogs([log("moveIn", 500)]),
  });
  assert.equal(t.count, 1490);
  assert.equal(t.knownBarns, 2);
  assert.equal(t.unknownBarns, 1);
  assert.equal(t.complete, false, "ต้องบอกได้ว่ายอดนี้ยังไม่ครบทุกเล้า");
});

test("ทุกเล้าสรุปได้ ยอดฟาร์มจึงครบ", () => {
  const t = herdTotal({ A1: herdFromLogs([log("moveIn", 10)]), A2: herdFromLogs([log("moveIn", 20)]) });
  assert.equal(t.count, 30);
  assert.equal(t.complete, true);
});

test("ไม่มีเล้าเลยต้องไม่บอกว่าครบ", () => {
  const t = herdTotal({});
  assert.equal(t.count, 0);
  assert.equal(t.complete, false);
});

/* ═══ countDiffEntry — ช่อง "จำนวนสุกร" ในฟอร์มกลายเป็นบันทึก (T1.328) ═══ */

test("กรอกจำนวนในเล้าที่ยังไม่มีบันทึกเลย → บันทึกย้ายเข้าเท่าที่กรอก", () => {
  assert.deepEqual(countDiffEntry(herdFromLogs([]), 1200), {
    type: "moveIn",
    amount: 1200,
    unit: "ตัว",
  });
});

test("★ เล้าที่มีแต่บันทึกขาออก ต้องเทียบผลรวมดิบ ไม่ใช่ตีเป็นศูนย์", () => {
  /* มีบันทึกตาย 2 · ยังไม่เคยลงยอดตั้งต้น (count = null) · คนกรอกว่าตอนนี้มี 1,198
     ถ้าตี null เป็น 0 จะได้ moveIn 1,198 แล้วนับใหม่เหลือ 1,196 — ขาดไป 2 */
  const before = herdFromLogs([{ type: "dead", amount: 2, unit: "ตัว" }]);
  assert.equal(before.count, null, "ด่านตั้งต้น: เล้านี้ต้องยังสรุปไม่ได้");

  const entry = countDiffEntry(before, 1198);
  assert.deepEqual(entry, { type: "moveIn", amount: 1200, unit: "ตัว" });

  /* นับใหม่หลังบันทึกแล้วต้องได้เท่าที่กรอกเป๊ะ */
  const after = herdFromLogs([{ type: "dead", amount: 2, unit: "ตัว" }, entry]);
  assert.equal(after.count, 1198);
  assert.equal(after.confident, true);
});

test("แก้จำนวนให้น้อยลง → บันทึกย้ายออกเท่าส่วนต่าง", () => {
  const before = herdFromLogs([{ type: "moveIn", amount: 100, unit: "ตัว" }]);
  const entry = countDiffEntry(before, 80);
  assert.deepEqual(entry, { type: "moveOut", amount: 20, unit: "ตัว" });
  assert.equal(herdFromLogs([{ type: "moveIn", amount: 100, unit: "ตัว" }, entry]).count, 80);
});

test("กรอกเท่าเดิม = ไม่บันทึกอะไร (กันบันทึกขยะทุกครั้งที่กดบันทึกฟอร์ม)", () => {
  const before = herdFromLogs([{ type: "moveIn", amount: 100, unit: "ตัว" }]);
  assert.equal(countDiffEntry(before, 100), null);
});

test("★ ไม่ได้กรอก ≠ กรอกศูนย์", () => {
  const before = herdFromLogs([{ type: "moveIn", amount: 100, unit: "ตัว" }]);
  /* เว้นว่าง = ไม่ได้ตั้งใจแก้จำนวน ต้องไม่ไปแตะอะไร */
  assert.equal(countDiffEntry(before, ""), null);
  assert.equal(countDiffEntry(before, null), null);
  /* กรอก 0 = บอกว่าเล้าว่างแล้ว ต้องบันทึกย้ายออกทั้งหมด */
  assert.deepEqual(countDiffEntry(before, 0), { type: "moveOut", amount: 100, unit: "ตัว" });
});

test("ค่าที่กรอกไม่เป็นตัวเลขหรือติดลบ = ไม่บันทึก", () => {
  const before = herdFromLogs([{ type: "moveIn", amount: 100, unit: "ตัว" }]);
  for (const bad of ["abc", -5, NaN, undefined]) {
    assert.equal(countDiffEntry(before, bad), null, `ค่า ${String(bad)} ต้องไม่ถูกบันทึก`);
  }
});

/* ═══ countsByStage — แยกตามขั้นการเลี้ยง (T1.330 · ทางเดียวใน T1.332) ═══ */

test("รวมยอดต่อขั้นการเลี้ยง และเรียงตามลำดับการเลี้ยง", () => {
  const rows = countsByStage([
    { stage: "ขุน", count: 100, from: "records" },
    { stage: "ขุน", count: 45, from: "records" },
    { stage: "แม่พันธุ์", count: 20, from: "records" },
  ]);
  assert.deepEqual(rows.map((r) => r.stage), ["แม่พันธุ์", "ขุน"]);
  assert.equal(rows.find((r) => r.stage === "ขุน").count, 145);
});

test("★ ขั้นที่ยังไม่มีเล้าไหนสรุปได้ ต้องไม่ขึ้นเป็น 0", () => {
  /* 0 อ่านว่า "เล้าว่าง" ซึ่งคนละเรื่องกับ "ยังไม่รู้ว่ามีกี่ตัว" */
  const rows = countsByStage([{ stage: "อนุบาล", count: null, from: null }]);
  assert.deepEqual(rows, []);
});

test("เล้าที่ไม่ได้ระบุขั้น แยกถังและอยู่ท้ายสุด", () => {
  const rows = countsByStage([
    { stage: null, count: 10, from: "local" },
    { stage: "ขุน", count: 20, from: "records" },
  ]);
  assert.deepEqual(rows.map((r) => r.stage), ["ขุน", STAGE_NONE]);
  assert.equal(rows.find((r) => r.stage === STAGE_NONE).from, "local");
});

/* ═══ barnCount / barnCountTotal — รวมสามทางเป็นเลขเดียว (T1.332) ═══ */

test("บันทึกในฐานมาก่อนค่าในเครื่องเสมอ", () => {
  const s = herdFromLogs([{ type: "moveIn", amount: 100, unit: "ตัว" }]);
  assert.deepEqual(barnCount(s, 9999), { count: 100, from: "records" });
});

test("ไม่มีบันทึกในฐาน → ใช้ค่าในเครื่อง และบอกว่ามาจากเครื่อง", () => {
  assert.deepEqual(barnCount(herdFromLogs([]), 10000), { count: 10000, from: "local" });
  /* ★ เล้าที่ยังสรุปจากบันทึกไม่ได้ (มีแต่ขาออก) ก็ยังใช้ค่าในเครื่องได้ */
  const noOpening = herdFromLogs([{ type: "dead", amount: 2, unit: "ตัว" }]);
  assert.deepEqual(barnCount(noOpening, 50), { count: 50, from: "local" });
});

test("ไม่มีทั้งสองทาง = ยังไม่รู้ ไม่ใช่ศูนย์", () => {
  assert.deepEqual(barnCount(herdFromLogs([]), null), { count: null, from: null });
  assert.deepEqual(barnCount(null, ""), { count: null, from: null });
  assert.deepEqual(barnCount(null, -5), { count: null, from: null });
});

test("ยอดรวมบอกด้วยว่ามีค่าในเครื่องปนอยู่ไหม", () => {
  const all = barnCountTotal([
    { count: 100, from: "records" },
    { count: 50, from: "records" },
  ]);
  assert.deepEqual(all, { count: 150, knownBarns: 2, unknownBarns: 0, from: "records" });

  const mixed = barnCountTotal([
    { count: 100, from: "records" },
    { count: 10000, from: "local" },
    { count: null, from: null },
  ]);
  assert.equal(mixed.count, 10100);
  assert.equal(mixed.unknownBarns, 1);
  assert.equal(mixed.from, "local", "มีของในเครื่องปน ต้องไม่บอกว่าเป็นข้อมูลจริงล้วน");
});

test("ไม่มีเล้าไหนสรุปได้เลย → from เป็น null ให้หน้าจอถอยไปใช้ข้อมูลตัวอย่าง", () => {
  const none = barnCountTotal([{ count: null, from: null }]);
  assert.equal(none.count, null);
  assert.equal(none.from, null);
});

test("★ ยอดผสมต้องรายงานแหล่งที่อ่อนที่สุด ไม่ใช่ดีที่สุด (T1.332)", () => {
  /* ถ้ารายงานตัวที่ดีที่สุด ยอดที่มีข้อมูลตัวอย่างปนจะถูกป้ายว่า "ข้อมูลจริง"
     ซึ่งหลอกคนอ่านให้เชื่อตัวเลขมากกว่าที่ควร */
  assert.equal(
    barnCountTotal([
      { count: 100, from: "records" },
      { count: 50, from: "demo" },
    ]).from,
    "demo",
  );
  assert.equal(
    barnCountTotal([
      { count: 100, from: "records" },
      { count: 50, from: "local" },
    ]).from,
    "local",
  );
  assert.equal(
    barnCountTotal([{ count: 100, from: "records" }]).from,
    "records",
  );
});
