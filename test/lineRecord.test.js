/**
 * บันทึกงานในโรงเรือนผ่านไลน์ (T1.322)
 *
 * ★★ ความเสี่ยงของงานนี้ไม่ใช่ "บันทึกไม่ได้" แต่คือ **"บันทึกตอนที่ไม่ควรบันทึก"**
 * คำว่า ตาย · อาหาร · ป่วย โผล่ในคำถามธรรมดาตลอด ถ้าจับคำหลวม ๆ
 * คำถามของคนจะกลายเป็นข้อมูลจริงในฐาน แล้วไปโผล่ในตัวเลขที่ผู้บริหารอ่าน
 */
import test from "node:test";
import assert from "node:assert/strict";

import { RECORD_MAX, detectIntent, detectRecord } from "../server/src/line/intent.js";
import { LOG_LABEL, NEED_BARN, NOT_ALLOWED, askAmount, savedText } from "../server/src/line/recordText.js";
/* ชนิดที่หลังบ้านรับได้จริง — ใช้เทียบว่าไม่มีชนิดไหนตกหล่นจากฝั่งไลน์ */
import { LOG_TYPES as SERVER_TYPES } from "../server/src/barnlog/validate.js";

/* ---------- คำสั่งที่ต้องบันทึก ---------- */

test("พิมพ์คำสั่งกับจำนวน ต้องอ่านออกครบทุกชนิด", () => {
  assert.deepEqual(detectRecord("ตาย 1"), { type: "dead", unit: "ตัว", amount: 1, word: "ตาย", note: "", extra: false });
  assert.equal(detectRecord("หมูป่วย 2 ตัว").type, "sick");
  assert.equal(detectRecord("ให้อาหาร 200").type, "feed");
  assert.equal(detectRecord("ให้อาหาร 200").unit, "กิโลกรัม");
  assert.equal(detectRecord("ย้ายเข้า 500").type, "moveIn");
  assert.equal(detectRecord("ย้ายออก 50").type, "moveOut");
  assert.equal(detectRecord("ให้ยา 10").unit, "โดส");
  assert.equal(detectRecord("ขาดหาย 3").type, "missing");
});

test("คำยาวต้องชนะคำสั้นที่ซ้อนอยู่", () => {
  /* "ย้ายสุกรเข้า" ต้องไม่ถูกอ่านเป็น "ย้ายเข้า" คนละคำกันแต่ชนิดเดียวกัน
     ข้อนี้กันไว้เพื่อให้ข้อความที่ปุ่มเมนูส่งมาตรงกับที่ตารางคำคาดไว้ */
  assert.equal(detectRecord("ย้ายสุกรเข้า 100").word, "ย้ายสุกรเข้า");
  assert.equal(detectRecord("สุกรตาย 1").word, "สุกรตาย");
});

/* ---------- ★★ คำถามที่ห้ามกลายเป็นการบันทึก ---------- */

test("★★ คำถามที่มีคำเดียวกันต้องไม่ถูกบันทึก", () => {
  /* ทั้งสองประโยคมีคำสั่งอยู่ข้างใน แต่ไม่ได้ขึ้นต้นด้วยคำสั่ง
     ถ้าข้อนี้พลาด คนถามเรื่องอัตราตายจะกลายเป็นบันทึกหมูตายลงฐานจริง */
  for (const q of [
    "อัตราตายรายเดือนเท่าไร",
    "สต็อกอาหารเหลือเท่าไร",
    "เดือนนี้มีหมูป่วยกี่ตัว",
    "ดูข้อมูลสุกร",
    "รายงานประจำวัน",
  ]) {
    assert.equal(detectRecord(q), null, q);
  }
});

test("คำถามปกติต้องยังเข้าทางเดิมได้", () => {
  assert.equal(detectRecord("อุณหภูมิ"), null);
  assert.equal(detectIntent("อุณหภูมิ"), "temp");
  assert.equal(detectRecord("แจ้งเตือน"), null);
  assert.equal(detectIntent("แจ้งเตือน"), "alerts");
});

/* ---------- ไม่บอกจำนวน = ถามกลับ ห้ามเดา ---------- */

test("★ พิมพ์คำสั่งแต่ไม่บอกจำนวน ต้องถามกลับ ไม่ใช่เดาว่า 1", () => {
  const r = detectRecord("ตาย");
  assert.equal(r.type, "dead");
  assert.equal(r.amount, null, "ต้องไม่เดาจำนวน");
  assert.match(askAmount(r.type, r.unit), /กี่ตัว/);
});

test("จำนวนที่เป็นไปไม่ได้ต้องถามกลับ ไม่ใช่บันทึกไปเลย", () => {
  /* ศูนย์และติดลบไม่มีความหมาย · เลขหลุดมือ (กด 0 เกิน) ต้องไม่ลงฐาน */
  assert.equal(detectRecord("ตาย 0").amount, null);
  assert.equal(detectRecord(`ตาย ${RECORD_MAX + 1}`).amount, null);
  /* จำนวนสุกรต้องเป็นจำนวนเต็ม — "ตาย 1.5 ตัว" ไม่มีความหมาย */
  assert.equal(detectRecord("ตาย 1.5").amount, null);
  /* แต่อาหารเป็นทศนิยมได้ เพราะชั่งน้ำหนักได้ละเอียด */
  assert.equal(detectRecord("ให้อาหาร 12.5").amount, 12.5);
});

test("ข้อความว่างต้องไม่ใช่คำสั่งบันทึก", () => {
  assert.equal(detectRecord(""), null);
  assert.equal(detectRecord(null), null);
  assert.equal(detectRecord("   "), null);
});

/* ---------- ถอนรายการ ---------- */

test("คำสั่งถอนต้องถูกจับเป็น undo ไม่ใช่ unknown", () => {
  for (const w of ["ยกเลิก", "ถอน", "undo"]) assert.equal(detectIntent(w), "undo");
});

/* ---------- ข้อความที่ต้องบอกเหตุ ---------- */

test("★ ข้อความปฏิเสธต้องบอกว่าต้องไปขอใคร ไม่ใช่แค่ว่าทำไม่ได้", () => {
  /* คนหน้าฟาร์มที่พิมพ์แล้วไม่ได้ผล ต้องรู้ว่าต้องไปหาใคร ไม่ใช่คิดว่าระบบพัง */
  assert.match(NOT_ALLOWED, /ผู้ดูแลระบบ/);
  assert.match(NOT_ALLOWED, /ดูข้อมูลได้ตามปกติ/);
  /* และต้องบอกเหตุผลว่าทำไมต้องผูกบัญชี */
  assert.match(NOT_ALLOWED, /ใครเป็นคนบันทึก/);
});

test("ยังไม่เลือกโรงเรือน ต้องบอกวิธีเลือก", () => {
  assert.match(NEED_BARN, /เลือกโรงเรือน/);
});

test("ชื่อชนิดต้องตรงกับที่หน้าเว็บใช้", () => {
  /* ★ รายการเดียวกันต้องถูกเรียกชื่อเดียวกันทั้งในไลน์และบนหน้าจอ
     ไม่งั้นคนอ่านรายงานส่งเวรจะนึกว่าเป็นสองเรื่อง */
  assert.equal(LOG_LABEL.dead, "หมูตาย");
  assert.equal(LOG_LABEL.moveIn, "ย้ายสุกรเข้า");
  assert.equal(LOG_LABEL.medicine, "ให้ยา");
  /* ★ แยก "ให้วัคซีน" ออกจาก "ให้ยา" ตอน T1.366 — สองอย่างนี้คนละงานกันในเล้า */
  assert.equal(LOG_LABEL.vaccine, "ให้วัคซีน");
  assert.equal(LOG_LABEL.clean, "ทำความสะอาด");
  assert.equal(Object.keys(LOG_LABEL).length, 19);
});

/* ---------- ★★ คำสั่งซ้อนในข้อความเดียว (T1.326) ---------- */

test("★★ หลายคำสั่งในข้อความเดียวต้องติดธงเตือน", () => {
  /* เจอของจริง 9 ต.ค. 2569 — ผู้ใช้ส่งมาบรรทัดเดียวว่า
     "ตาย 1          ให้อาหาร 200          ยกเลิก"
     ระบบบันทึกแค่ ตาย 1 แล้วทิ้งที่เหลือไปเงียบ ๆ ผู้ใช้เข้าใจว่าบันทึกครบสามอย่าง
     ★ อันตรายตรงที่เงียบ — "ตาย 1 ย้ายออก 50" ที่บันทึกแค่อันแรก ทำให้จำนวนสุกรผิด
       โดยหน้าจอดูปกติทุกอย่าง */
  const r = detectRecord("ตาย 1          ให้อาหาร 200          ยกเลิก");
  assert.equal(r.type, "dead");
  assert.equal(r.amount, 1);
  assert.equal(r.extra, true, "ต้องรู้ว่ามีคำสั่งอื่นตามมา");

  assert.equal(detectRecord("ตาย 1 ย้ายออก 50").extra, true);
  /* คำสั่งถอนที่ต่อท้ายก็ต้องนับ — กรณีจริงมี "ยกเลิก" ต่อท้ายแล้วหายไปเฉย ๆ */
  assert.equal(detectRecord("ให้อาหาร 200 ยกเลิก").extra, true);
});

test("★ คำสั่งเดียวต้องไม่ถูกเตือนผิด", () => {
  /* หน่วยหรือคำขยายที่ตามมาไม่ใช่คำสั่ง — เตือนผิดทุกครั้งจะทำให้คนเลิกอ่านคำเตือน */
  for (const q of ["ตาย 1", "ตาย 1 ตัว", "ให้อาหาร 200 กิโลกรัม", "ย้ายออก 50 ตัวไปเล้า B", "ให้ยา 10 โดส"]) {
    assert.equal(detectRecord(q).extra, false, q);
  }
});

test("★ ข้อความเตือนต้องบอกว่าบันทึกอะไรไปแล้ว และที่เหลือยังไม่ได้บันทึก", () => {
  const entry = { type: "dead", amount: 1, unit: "ตัว" };
  const warned = savedText(entry, "โรงเรือน A1", true);
  const plain = savedText(entry, "โรงเรือน A1", false);
  /* ต้องยังยืนยันของที่บันทึกสำเร็จ ไม่ใช่เตือนอย่างเดียวจนคนไม่รู้ว่าสำเร็จหรือไม่ */
  assert.match(warned, /บันทึกแล้ว · หมูตาย 1 ตัว/);
  assert.match(warned, /ยังไม่ได้บันทึก/);
  assert.match(warned, /ทีละคำสั่ง/);
  /* คำสั่งเดียวต้องไม่มีคำเตือนมากวน */
  assert.ok(!plain.includes("ยังไม่ได้บันทึก"));
  /* ทั้งสองแบบต้องบอกวิธีถอนเหมือนกัน */
  for (const t of [warned, plain]) assert.match(t, /ยกเลิก/);
});

/* ═══ บันทึกได้มากกว่าจำนวนหมู (T1.366) ═══ */

test("★★ คำที่เป็นส่วนขยายของอีกคำ ต้องไม่ถูกคำสั้นกว่าดักไปก่อน", () => {
  /* สองเคสนี้พังแบบ "บันทึกผิดชนิดเงียบ ๆ" ซึ่งหายากกว่าไม่บันทึกเลย */
  assert.equal(detectRecord("อาหารเหลือ 300").type, "feedStock");
  assert.equal(detectRecord("ให้อาหาร 200").type, "feed");
  assert.equal(detectRecord("คนเข้าเล้า").type, "visitor");
  assert.equal(detectRecord("เข้าเล้า 50").type, "moveIn");
});

test("★ 'สต็อกอาหารเหลือเท่าไร' ยังต้องเป็นคำถาม ไม่ใช่คำสั่งบันทึก", () => {
  assert.equal(detectRecord("สต็อกอาหารเหลือเท่าไร"), null);
});

test("งานที่ไม่มีจำนวน ต้องไม่ถามกลับว่ากี่ครั้ง — เก็บเป็น 1 ครั้งเลย", () => {
  for (const [text, type] of [
    ["ทำความสะอาด", "clean"],
    ["ซ่อม", "repair"],
    ["ตรวจเล้า", "check"],
    ["คนเข้าเล้า", "visitor"],
    ["จด", "note"],
  ]) {
    const r = detectRecord(text);
    assert.equal(r.type, type, text);
    assert.equal(r.amount, 1, `${text} ต้องไม่ถามกลับ`);
    assert.equal(r.unit, "ครั้ง");
  }
});

test("★ ข้อความต่อท้ายงานที่ไม่มีจำนวน ต้องถูกเก็บไว้ พร้อมเว้นวรรคเดิม", () => {
  assert.equal(detectRecord("ซ่อม มอเตอร์พัดลมตัวที่ 2").note, "มอเตอร์พัดลมตัวที่ 2");
  assert.equal(detectRecord("จด น้ำรั่ว ที่รางให้น้ำ").note, "น้ำรั่ว ที่รางให้น้ำ");
  assert.equal(detectRecord("ตรวจเล้า ปกติดี").note, "ปกติดี");
});

test("★★ ตัวเลขในข้อความของงานที่ไม่มีจำนวน ต้องไม่ถูกอ่านเป็นจำนวน", () => {
  /* "ซ่อม มอเตอร์ตัวที่ 2" ต้องไม่กลายเป็น "ซ่อมอุปกรณ์ 2 ครั้ง" */
  const r = detectRecord("ซ่อม มอเตอร์พัดลมตัวที่ 2");
  assert.equal(r.amount, 1);
});

test("ชนิดใหม่อ่านจำนวนและหน่วยถูกต้อง", () => {
  for (const [text, type, amount, unit] of [
    ["คลอด 12", "birth", 12, "ตัว"],
    ["หย่านม 8", "wean", 8, "ตัว"],
    ["ผสม 3", "mate", 3, "ตัว"],
    ["ชั่ง 85.5", "weigh", 85.5, "กิโลกรัม"],
    ["ให้น้ำ 500", "water", 500, "ลิตร"],
    ["วัคซีน 10", "vaccine", 10, "โดส"],
    ["ให้ยา 5", "medicine", 5, "โดส"],
  ]) {
    const r = detectRecord(text);
    assert.equal(r.type, type, text);
    assert.equal(r.amount, amount, text);
    assert.equal(r.unit, unit, text);
  }
});

test("★ จำนวนสุกรยังต้องเป็นจำนวนเต็ม แต่น้ำหนักเป็นทศนิยมได้", () => {
  assert.equal(detectRecord("คลอด 12.5").amount, null, "ลูกหมู 12.5 ตัว ไม่มีความหมาย");
  assert.equal(detectRecord("ชั่ง 85.5").amount, 85.5, "น้ำหนักชั่งได้ละเอียด");
});

test("ทุกชนิดในหลังบ้านต้องมีชื่อไทยในไลน์ ไม่มีชนิดไหนตกหล่น", () => {
  for (const type of SERVER_TYPES) {
    assert.ok(LOG_LABEL[type], `ชนิด ${type} ไม่มีชื่อไทยใน LOG_LABEL`);
  }
});
