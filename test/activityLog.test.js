/**
 * ใครทำอะไรในระบบ (T1.359)
 *
 * ★★ ความเสี่ยงของงานนี้ไม่ใช่ "ไม่บันทึก" แต่คือ **"บันทึกแล้วอ่านไม่รู้เรื่อง"**
 * และ **"ส่งเข้าไลน์จนโควตาหมด"** เทสต์ชุดนี้จึงกันสองเรื่องนั้นเป็นหลัก
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  FIELD_LABEL,
  ROLE_LABEL,
  changeText,
  ACTIVITY_KINDS,
  ACTIVITY_KIND_IDS,
  ACTIVITY_MAX_LINES,
  activityMessage,
  clip,
  isActivityKind,
  summaryOf,
} from "../server/src/activity/kinds.js";

test("หมวดครบสี่ และทุกหมวดมีป้ายไทยกับคำอธิบาย", () => {
  assert.deepEqual(ACTIVITY_KIND_IDS.sort(), ["admin", "barnlog", "control", "settings"]);
  for (const k of ACTIVITY_KINDS) {
    assert.ok(k.label, `หมวด ${k.id} ไม่มีป้าย`);
    assert.ok(k.hint, `หมวด ${k.id} ไม่มีคำอธิบาย`);
  }
});

test("★ หมวดแปลกปลอมต้องไม่ผ่าน — ค่าหลุดมาจากคำขอภายนอกได้", () => {
  for (const bad of ["", "ADMIN", "x", null, undefined, "settings "]) {
    assert.equal(isActivityKind(bad), false, `ไม่ควรผ่าน: ${String(bad)}`);
  }
});

test("★★ ทุกข้อความต้องบอกว่าใครทำ", () => {
  const actions = [
    "comfort.update", "farm.create", "farm.delete", "barn.create", "barn.delete",
    "user.create", "user.update", "user.delete", "user.password",
    "barnlog.create", "barnlog.delete", "control.command",
  ];
  for (const action of actions) {
    const text = summaryOf({ action, actorName: "สมชาย", target: "เล้า A1" });
    assert.ok(text.startsWith("สมชาย"), `${action} ไม่ได้ขึ้นต้นด้วยชื่อคนทำ: ${text}`);
  }
});

test("ไม่รู้ว่าใครทำ ต้องเขียนว่าไม่ทราบ ไม่ใช่เว้นว่าง", () => {
  const text = summaryOf({ action: "farm.create", actorName: "", target: "ฟาร์ม ก" });
  assert.match(text, /ไม่ทราบผู้ใช้/);
});

test("★ การกระทำที่ยังไม่มีข้อความเฉพาะ ต้องไม่หาย — ตกไปใช้ข้อความกลาง", () => {
  const text = summaryOf({ action: "something.new", actorName: "สมชาย" });
  assert.match(text, /สมชาย/);
  assert.match(text, /something\.new/);
});

test("เปลี่ยนสิทธิ์ต้องเขียนแยกจากการแก้ชื่อ", () => {
  const role = summaryOf({ action: "user.update", actorName: "ก", target: "ข", detail: { role: "admin" } });
  const plain = summaryOf({ action: "user.update", actorName: "ก", target: "ข" });
  assert.match(role, /เปลี่ยนสิทธิ์/);
  assert.match(plain, /แก้ข้อมูลผู้ใช้/);
  assert.notEqual(role, plain);
});

test("★ บันทึกที่มาจากไลน์ต้องบอกว่ามาจากไลน์", () => {
  const viaLine = summaryOf({
    action: "barnlog.create", actorName: "ก", target: "F-KPP-A1",
    detail: { label: "หมูตาย", amount: 2, unit: "ตัว", via: "line" },
  });
  assert.match(viaLine, /ผ่านไลน์/);
  const onWeb = summaryOf({
    action: "barnlog.create", actorName: "ก", target: "F-KPP-A1",
    detail: { label: "หมูตาย", amount: 2, unit: "ตัว" },
  });
  assert.doesNotMatch(onWeb, /ผ่านไลน์/);
});

test("★ ชื่อยาวต้องถูกตัด — ชื่อฟาร์มที่ผู้ใช้พิมพ์เองยาวได้ไม่จำกัด", () => {
  const long = "ก".repeat(500);
  assert.ok(clip(long, 120).length <= 120);
  assert.ok(summaryOf({ action: "farm.create", actorName: long, target: long }).length < 200);
});

test("★★ หลายรายการต้องรวมเป็นข้อความเดียว ไม่ใช่ใบละรายการ (โควตาไลน์)", () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, summary: `รายการ ${i + 1}` }));
  const text = activityMessage(rows, { now: new Date("2026-11-02T10:00:00+07:00") });
  assert.equal(typeof text, "string");
  for (const r of rows) assert.ok(text.includes(r.summary), `ตกรายการ ${r.summary}`);
  assert.match(text, /5 รายการ/);
});

test("★ เกินเพดานบรรทัด ต้องบอกว่าเหลืออีกกี่รายการ ไม่ใช่ตัดเงียบ", () => {
  const n = ACTIVITY_MAX_LINES + 7;
  const rows = Array.from({ length: n }, (_, i) => ({ id: i + 1, summary: `ร ${i + 1}` }));
  const text = activityMessage(rows, { now: new Date() });
  assert.match(text, new RegExp(`อีก ${n - ACTIVITY_MAX_LINES} รายการ`));
  assert.ok(text.includes(`${n} รายการ`));
});

test("ไม่มีรายการ = ไม่มีข้อความ (ห้ามส่งใบเปล่ากินโควตา)", () => {
  assert.equal(activityMessage([]), null);
  assert.equal(activityMessage(null), null);
});

/* ═══ ข้อความต้องบอกว่าเปลี่ยนจากเท่าไรเป็นเท่าไร (T1.364) ═══
   ★★ "แก้เกณฑ์ · tempMax" อ่านแล้วไม่รู้อะไรเลย คนอ่านในไลน์ต้องตัดสินใจได้
   จากข้อความใบเดียว โดยไม่ต้องเปิดเว็บดูต่อ */

test("★★ แก้เกณฑ์ช่องเดียว ต้องบอกค่าเก่า ค่าใหม่ และหน่วย", () => {
  const text = summaryOf({
    action: "comfort.update", actorName: "สมชาย",
    detail: { changes: [{ field: "tempMax", from: 26, to: 29 }] },
  });
  assert.match(text, /สมชาย/);
  assert.match(text, /อุณหภูมิสูงสุด/);
  assert.match(text, /26/);
  assert.match(text, /29/);
  assert.match(text, /°C/);
  /* ห้ามหลุดชื่อช่องดิบ ๆ ออกไปให้คนอ่าน */
  assert.doesNotMatch(text, /tempMax/);
});

test("★ บอกทิศทางด้วย — เพิ่มหรือลด", () => {
  const up = summaryOf({ action: "comfort.update", actorName: "ก",
    detail: { changes: [{ field: "tempMax", from: 26, to: 29 }] } });
  const down = summaryOf({ action: "comfort.update", actorName: "ก",
    detail: { changes: [{ field: "tempMax", from: 29, to: 26 }] } });
  assert.match(up, /เพิ่ม/);
  assert.match(down, /ลด/);
});

test("แก้หลายช่อง บอกครบทุกช่องพร้อมค่า", () => {
  const text = summaryOf({
    action: "comfort.update", actorName: "ก",
    detail: { changes: [
      { field: "tempMax", from: 26, to: 29 },
      { field: "nh3Limit", from: 15, to: 18 },
    ] },
  });
  assert.match(text, /2 อย่าง/);
  assert.match(text, /อุณหภูมิสูงสุด/);
  assert.match(text, /แอมโมเนีย/);
  assert.match(text, /ppm/);
});

test("ไม่มีรายละเอียดค่า ต้องยังอ่านรู้เรื่อง ไม่ใช่พัง", () => {
  const text = summaryOf({ action: "comfort.update", actorName: "ก", target: "" });
  assert.match(text, /ก ได้แก้เกณฑ์สภาพแวดล้อม/);
});

test("★ เปลี่ยนสิทธิ์ ต้องบอกจากอะไรเป็นอะไร ด้วยชื่อไทย", () => {
  const text = summaryOf({
    action: "user.update", actorName: "ก", target: "สมหญิง (somying)",
    detail: { role: "editor", roleFrom: "viewer" },
  });
  assert.match(text, /จากผู้ชม/);
  assert.match(text, /เป็นผู้บันทึก/);
  assert.doesNotMatch(text, /viewer|editor/);
});

test("ปิดบัญชีต้องเห็นชัดพอ ๆ กับเปลี่ยนสิทธิ์", () => {
  const off = summaryOf({ action: "user.update", actorName: "ก", target: "ข", detail: { active: false } });
  assert.match(off, /ปิดบัญชี/);
});

test("ค่าที่ไม่ใช่ตัวเลข ใช้คำว่าเปลี่ยน ไม่ใช่เพิ่ม/ลด", () => {
  const text = changeText("name", "ฟาร์มเก่า", "ฟาร์มใหม่");
  assert.match(text, /เปลี่ยนชื่อ/);
  assert.match(text, /ฟาร์มเก่า/);
  assert.match(text, /ฟาร์มใหม่/);
});

test("ค่าว่างต้องเขียนว่า (ว่าง) ไม่ใช่ปล่อยช่องโหว่", () => {
  assert.match(changeText("province", null, "นครสวรรค์"), /\(ว่าง\)/);
});

test("ทุกช่องที่แก้ได้มีชื่อไทย และระดับสิทธิ์ครบสี่ขั้น", () => {
  for (const f of ["tempMin", "tempMax", "humidityMin", "humidityMax", "nh3Limit"]) {
    assert.ok(FIELD_LABEL[f]?.name, `ขาดชื่อไทยของ ${f}`);
    assert.ok(FIELD_LABEL[f]?.unit, `ขาดหน่วยของ ${f}`);
  }
  for (const r of ["viewer", "editor", "operator", "admin"]) {
    assert.ok(ROLE_LABEL[r], `ขาดชื่อไทยของสิทธิ์ ${r}`);
  }
});

test("★ ทุกประโยคขึ้นต้นด้วย \"<ชื่อ> ได้…\" ตามที่ผู้ใช้ขอ", () => {
  const actions = [
    "comfort.update", "farm.create", "farm.update", "farm.delete", "farm.restore",
    "barn.create", "barn.update", "barn.delete", "barn.restore",
    "user.create", "user.update", "user.delete", "user.password",
    "line.link", "line.unlink", "barnlog.create", "barnlog.delete", "control.command",
    "something.unknown",
  ];
  for (const action of actions) {
    const text = summaryOf({ action, actorName: "สมชาย", target: "เล้า A1" });
    assert.ok(text.startsWith("สมชาย ได้"), `${action} ไม่ได้ขึ้นต้นว่า "สมชาย ได้": ${text}`);
  }
});
