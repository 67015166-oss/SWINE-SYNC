/**
 * ตรวจค่าก่อนเขียนฟาร์ม/โรงเรือนลงฐาน (T1.316)
 *
 * ของพวกนี้เขียนลงฐานจริงที่มีค่าเซนเซอร์สี่แสนแถวผูกอยู่ ผิดแล้วแก้ยาก
 * จึงกันไว้ที่ตัวตรวจ ไม่ใช่หวังว่าหน้าจอจะส่งมาถูก
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  STAGES,
  barnCode,
  farmCode,
  normalizeBarn,
  normalizeFarm,
  updateParts,
} from "../server/src/modules/farms/validate.js";

const fails = (fn, re) => assert.throws(fn, (e) => e.status === 400 && re.test(e.message));

/* ---------- รหัส ---------- */

test("รหัสฟาร์มพิมพ์เล็กมาก็ใช้ได้ แต่เก็บเป็นตัวใหญ่", () => {
  /* หน้าจอใช้รหัสนี้เป็น id ในลิงก์ ถ้าเก็บทั้งเล็กทั้งใหญ่จะกลายเป็นสองฟาร์มคนละใบ */
  assert.equal(farmCode("f-kpp"), "F-KPP");
  assert.equal(farmCode("  f-npt  "), "F-NPT");
});

test("รหัสที่ใส่ใน URL ไม่ได้ต้องถูกปฏิเสธ", () => {
  fails(() => farmCode("F KPP"), /รหัสฟาร์ม/);
  fails(() => farmCode("ฟาร์ม1"), /รหัสฟาร์ม/);
  fails(() => farmCode("F"), /รหัสฟาร์ม/);
  fails(() => farmCode(""), /รหัสฟาร์ม/);
  fails(() => farmCode(null), /รหัสฟาร์ม/);
});

test("รหัสโรงเรือนต้องเป็นอักษรตามด้วยเลข", () => {
  assert.equal(barnCode("a1"), "A1");
  assert.equal(barnCode("B12"), "B12");
  fails(() => barnCode("1A"), /รหัสโรงเรือน/);
  fails(() => barnCode("AB"), /รหัสโรงเรือน/);
});

/* ---------- ★★ กับดักพิกัด ---------- */

test("★ ไม่กรอกพิกัดต้องได้ null ไม่ใช่ศูนย์", () => {
  /* ★★ `Number(null)` และ `Number("")` ทั้งคู่เป็น **0** ซึ่งผ่าน Number.isFinite
     ถ้าพลาดข้อนี้ ฟาร์มที่ไม่ได้กรอกพิกัดจะถูกบันทึกเป็น lat 0 lng 0
     = จุดกลางมหาสมุทรแอตแลนติก แล้วหมุดไปโผล่ที่นั่นบนแผนที่
     ดูเหมือนข้อมูลครบ แต่ผิดโดยไม่มีอะไรฟ้อง — กับดักเดียวกับ T1.295/T1.308/T1.311 */
  assert.equal(normalizeFarm({ code: "F-A", name: "ก", lat: null, lng: null }).lat, null);
  assert.equal(normalizeFarm({ code: "F-A", name: "ก", lat: "", lng: "" }).lng, null);
});

test("พิกัดที่อ่านไม่ออกต้องไม่ผ่าน และไม่กลายเป็น null เงียบ ๆ", () => {
  /* "อ่านไม่ออก" ต่างจาก "ไม่ได้กรอก" — ถ้าปล่อยเป็น null คนกรอกจะไม่รู้ว่าพิมพ์ผิด */
  fails(() => normalizeFarm({ code: "F-A", name: "ก", lat: "abc" }), /ละติจูด/);
  fails(() => normalizeFarm({ code: "F-A", name: "ก", lng: "๑๒๓" }), /ลองจิจูด/);
});

test("พิกัดนอกโลกต้องถูกปฏิเสธ", () => {
  fails(() => normalizeFarm({ code: "F-A", name: "ก", lat: 95 }), /ละติจูด/);
  fails(() => normalizeFarm({ code: "F-A", name: "ก", lng: -181 }), /ลองจิจูด/);
  /* ขอบพอดีต้องผ่าน */
  assert.equal(normalizeFarm({ code: "F-A", name: "ก", lat: 90, lng: 180 }).lat, 90);
});

/* ---------- ป้ายข้อมูลจริง/ตัวอย่าง ---------- */

test("★ ฟาร์มที่คนกรอกเองต้องเป็น demo เสมอถ้าไม่ได้สั่งเป็นอย่างอื่น", () => {
  /* ป้าย "ข้อมูลจริง" บนหน้าจอมาจากช่องนี้ ฟาร์มที่ยังไม่มีเซนเซอร์เลย
     ต้องไม่ถูกติดป้ายว่าเชื่อตัวเลขได้ */
  assert.equal(normalizeFarm({ code: "F-A", name: "ก" }).data_source, "demo");
  assert.equal(normalizeBarn({ code: "A1", name: "ก" }).data_source, "demo");
});

test("ป้ายที่ฐานไม่รู้จักต้องไม่หลุดลงไป", () => {
  fails(() => normalizeFarm({ code: "F-A", name: "ก", dataSource: "real" }), /live หรือ demo/);
});

/* ---------- แก้เฉพาะช่องที่ส่งมา ---------- */

test("★ แก้แล้วต้องไม่ล้างช่องที่ไม่ได้ส่งมา", () => {
  /* ส่งมาแค่ชื่อ = เปลี่ยนแค่ชื่อ · จังหวัดกับพิกัดเดิมต้องไม่หายไป
     ถ้าตัวตรวจคืน province: null มาด้วย คำสั่ง update จะไปล้างทิ้ง */
  const patch = normalizeFarm({ name: "ชื่อใหม่" }, { partial: true });
  assert.deepEqual(Object.keys(patch), ["name"]);
  assert.equal(Object.hasOwn(patch, "province"), false);
  assert.equal(Object.hasOwn(patch, "lat"), false);
});

test("ส่งช่องมาเป็นค่าว่างคือสั่งล้างจริง ต่างจากไม่ส่งมา", () => {
  const patch = normalizeFarm({ province: "" }, { partial: true });
  assert.deepEqual(patch, { province: null });
});

test("แก้แบบไม่ส่งอะไรมาเลยต้องถูกปฏิเสธ", () => {
  fails(() => normalizeFarm({}, { partial: true }), /ไม่มีช่องไหนให้แก้/);
  fails(() => normalizeBarn({}, { partial: true }), /ไม่มีช่องไหนให้แก้/);
});

/* ---------- โซน/อาคาร คิดจากรหัส ---------- */

test("★ โซนกับเลขอาคารต้องคิดจากรหัสแบบเดียวกับหน้าจอ", () => {
  /* `toBarn` ตัดอักษรแรกเป็นโซนและเลขที่เหลือเป็นอาคาร ถ้าฐานคิดคนละแบบ
     โรงเรือนเดียวกันจะถูกจัดกลุ่มคนละโซนในแต่ละหน้า */
  const b = normalizeBarn({ code: "B12", name: "โรงเรือน B12" });
  assert.equal(b.zone, "B");
  assert.equal(b.building, 12);
});

test("ส่งโซนมาเองก็ต้องเคารพค่าที่ส่งมา", () => {
  const b = normalizeBarn({ code: "A1", name: "ก", zone: "C", building: 9 });
  assert.equal(b.zone, "C");
  assert.equal(b.building, 9);
});

/* ---------- ขั้นการเลี้ยง · ความจุ ---------- */

test("ขั้นการเลี้ยงต้องตรงกับที่ฐานยอมรับ", () => {
  for (const s of STAGES) assert.equal(normalizeBarn({ code: "A1", name: "ก", stage: s }).stage, s);
  /* ★ ถ้าหลุดไปถึงฐาน จะเป็น error 23514 ที่หน้าจออ่านไม่รู้เรื่อง */
  fails(() => normalizeBarn({ code: "A1", name: "ก", stage: "หมูใหญ่" }), /ขั้นการเลี้ยง/);
  /* ไม่ระบุได้ — โรงเรือนว่างยังไม่รู้ว่าจะเลี้ยงขั้นไหน */
  assert.equal(normalizeBarn({ code: "A1", name: "ก", stage: "" }).stage, null);
});

test("ความจุต้องเป็นจำนวนเต็มไม่ติดลบ", () => {
  assert.equal(normalizeBarn({ code: "A1", name: "ก", capacity: "1200" }).capacity, 1200);
  fails(() => normalizeBarn({ code: "A1", name: "ก", capacity: -5 }), /ติดลบ/);
  fails(() => normalizeBarn({ code: "A1", name: "ก", capacity: 12.5 }), /จำนวนเต็ม/);
});

/* ---------- ชื่อ ---------- */

test("ชื่อว่างต้องไม่ผ่าน — การ์ดบนหน้าจอจะอ่านไม่ออก", () => {
  fails(() => normalizeFarm({ code: "F-A", name: "   " }), /ชื่อฟาร์ม/);
  fails(() => normalizeBarn({ code: "A1", name: "" }), /ชื่อโรงเรือน/);
});

test("ชื่อยาวเกินต้องถูกปฏิเสธพร้อมบอกความยาวที่ส่งมา", () => {
  assert.throws(
    () => normalizeFarm({ code: "F-A", name: "ก".repeat(200) }),
    (e) => e.status === 400 && e.details?.got === 200,
  );
});

/* ---------- ชิ้นส่วนคำสั่ง update ---------- */

test("สร้างชิ้นส่วน update ให้ตรงกับลำดับพารามิเตอร์", () => {
  /* $1 สงวนไว้ให้ id เสมอ จึงเริ่มนับที่ 2 — พลาดข้อนี้คือแก้ผิดแถว */
  const { sql, values } = updateParts({ name: "ก", province: "ข" }, 2);
  assert.equal(sql, "name = $2, province = $3");
  assert.deepEqual(values, ["ก", "ข"]);
});

test("ไม่มีช่องให้แก้ต้องได้คำสั่งว่าง ไม่ใช่คำสั่งที่พัง", () => {
  assert.equal(updateParts({}, 2).sql, "");
});

/* ═══ ขั้นการเลี้ยงของฟอร์มต้องตรงกับที่หลังบ้านยอมรับ (T1.329) ═══ */

test("★ รายการ 'ขั้นการเลี้ยง' ในฟอร์มต้องตรงกับของหลังบ้านเป๊ะ", () => {
  /* เคยไม่ตรง: ฟอร์มมี "คลอด/ลูกสุกร" แต่หลังบ้านกับ check constraint ของฐาน
     รับแค่ "ลูกสุกร" → เลือกขั้นนั้นแล้วบันทึกโรงเรือนได้ 400 ทุกครั้ง
     ผู้ใช้เห็นแค่ "บันทึกไม่สำเร็จ" โดยไม่รู้ว่าเป็นเพราะช่องนี้ */
  const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  const pick = (src, name) => {
    const m = new RegExp(`const ${name} = (\\[[^\\]]*\\])`).exec(src);
    assert.ok(m, `หา ${name} ไม่เจอ`);
    return JSON.parse(m[1].replace(/'/g, '"'));
  };
  const form = pick(read("../src/components/records/BarnFormModal.jsx"), "STAGES");
  const server = pick(read("../server/src/modules/farms/validate.js"), "STAGES");
  assert.deepEqual(form, server, "ฟอร์มกับหลังบ้านรับขั้นการเลี้ยงไม่ตรงกัน");

  /* และต้องตรงกับ check constraint ของฐานด้วย ไม่งั้นผ่านหลังบ้านแล้วไปตายที่ฐาน */
  const schema = read("../server/src/db/migrations/1756040000000_core-schema.js");
  const inDb = /stage\s+text check \(stage in \(([^)]*)\)\)/.exec(schema);
  assert.ok(inDb, "หา check constraint ของ stage ไม่เจอ");
  const dbList = inDb[1].split(",").map((x) => x.trim().replace(/^'|'$/g, ""));
  assert.deepEqual(form, dbList, "ฟอร์มกับ check constraint ของฐานไม่ตรงกัน");
});

/* ═══ ตัวเลขต้องไม่กระพริบตอนดึงข้อมูลซ้ำ (T1.333) ═══ */

test("★ useHerdCounts ต้องไม่ล้างข้อมูลเดิมทิ้งตอนโหลดซ้ำหรือพลาด", () => {
  /* หน้าแม่ดึงใหม่ทุก 30 วินาที ถ้าล้างทุกรอบ ตัวเลขจะถอยไปใช้ข้อมูลตัวอย่าง
     ชั่วขณะแล้วเด้งกลับ ผู้ใช้เห็นเป็น "เดี๋ยวขึ้นเดี๋ยวไม่ขึ้น" เหมือนบั๊ก
     (ผู้ใช้แจ้งอาการนี้จริง 15 ต.ค. 2569) */
  const src = readFileSync(new URL("../src/lib/api/useHerdCounts.js", import.meta.url), "utf8");
  assert.doesNotMatch(
    src,
    /setState\(\{\s*\.\.\.EMPTY,\s*status:\s*"loading"/,
    "ยังล้างข้อมูลทิ้งตอนเริ่มโหลดซ้ำ",
  );
  assert.doesNotMatch(
    src,
    /setState\(\{\s*status:\s*"error",\s*farms:\s*\[\]/,
    "ยังล้างข้อมูลทิ้งตอนพลาด",
  );
  assert.match(src, /setState\(\(prev\) => \(\{ \.\.\.prev, status: "loading"/, "ไม่ได้เก็บของเดิมไว้ตอนโหลดซ้ำ");

  /* และหน้าจอต้องใช้ของที่เก็บไว้ ไม่ใช่รอ status === "ready" อย่างเดียว */
  const page = readFileSync(new URL("../src/pages/PigTypes.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(
    page,
    /realHerd\.status === "ready" \? realHerd\.farms : \[\]/,
    "หน้าจอยังผูกกับ status === \"ready\" ตัวเลขจะกระพริบอยู่ดี",
  );
});

/* ═══ เก็บลงเครื่อง ≠ เก็บลงระบบ ต้องบอกผู้ใช้ (T1.335) ═══ */

test("★ บันทึกที่ไม่ได้เข้าระบบกลาง ต้องไม่ปิดป๊อบอัพเงียบ ๆ", () => {
  /* ผู้ใช้กรอกจำนวนสุกรแล้วป๊อบอัพปิดไปเฉย ๆ จึงเข้าใจว่าบันทึกเข้าระบบแล้ว
     ทั้งที่ onServer เป็น false ค่าจึงอยู่แค่ในเครื่อง แล้วหน้าที่อ่านจากระบบไม่เห็นเลข
     วนเจอสามรอบ 14–15 ต.ค. 2569 กว่าจะรู้ว่าปัญหาอยู่ตรงนี้ */
  const editor = readFileSync(new URL("../src/lib/records/useFarmEditor.js", import.meta.url), "utf8");
  assert.match(editor, /savedTo: "local"/, "useFarmEditor ไม่ได้บอกว่าบันทึกลงเครื่อง");
  assert.match(editor, /savedTo: "server"/, "useFarmEditor ไม่ได้บอกว่าบันทึกลงระบบ");

  const modal = readFileSync(new URL("../src/components/records/BarnFormModal.jsx", import.meta.url), "utf8");
  assert.match(modal, /savedTo === "local"/, "ฟอร์มไม่ได้ตรวจว่าบันทึกลงที่ไหน");
  /* ต้อง return ก่อนถึง onClose ไม่ใช่ปิดป๊อบอัพทิ้งไปเลย */
  const idx = modal.indexOf('savedTo === "local"');
  const close = modal.indexOf("onClose();", idx);
  const ret = modal.indexOf("return;", idx);
  assert.ok(ret !== -1 && ret < close, "ยังปิดป๊อบอัพก่อนที่ผู้ใช้จะได้อ่านข้อความ");
});
