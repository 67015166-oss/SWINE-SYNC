/**
 * สิทธิ์การใช้งานต้องมีผลกับไลน์เหมือนกับบนเว็บ (T1.325)
 *
 * ★★ ช่องโหว่ที่ปิด: T1.322 ตรวจแค่ "ผูกบัญชีไว้ไหม" กับ "บัญชียังเปิดอยู่ไหม"
 * **ไม่ได้ตรวจระดับสิทธิ์** ผลคือเอาบัญชี viewer ไปผูกกับไลน์แล้วบันทึกข้อมูลได้
 * ทั้งที่บนเว็บ `requireRole("editor")` ปิดไว้ — เป็นประตูหลังที่เดินอ้อมด่านของเว็บ
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ROLES, roleAtLeast } from "../server/src/lib/roles.js";
import { MIN_ROLE, NOT_ALLOWED, ROLE_TOO_LOW } from "../server/src/line/recordText.js";

test("★ เกณฑ์ของไลน์ต้องเท่ากับของเว็บเป๊ะ", () => {
  /* ★ ถ้าสองฝั่งใช้เกณฑ์ต่างกันเมื่อไร ฝั่งที่หลวมกว่าจะกลายเป็นประตูหลังทันที
     เทสต์นี้จะล้มถ้ามีใครเผลอเปลี่ยนฝั่งใดฝั่งหนึ่ง */
  const web = readWebRule();
  assert.equal(MIN_ROLE, web, `ไลน์ใช้ ${MIN_ROLE} แต่เว็บใช้ ${web}`);
});

/** อ่านเกณฑ์ที่เว็บใช้จริงจากไฟล์ ไม่ใช่เขียนซ้ำไว้ในเทสต์ */
function readWebRule() {
  const src = readFileSync(new URL("../server/src/modules/barnlog/route.js", import.meta.url), "utf8");
  const m = src.match(/requireRole\("([a-z]+)"\)/);
  return m?.[1] ?? null;
}
import { readFileSync } from "node:fs";

test("★★ ผู้ชมต้องบันทึกไม่ได้", () => {
  /* นี่คือช่องโหว่ตัวจริงที่ปิดในงานนี้ */
  assert.equal(roleAtLeast({ role: "viewer" }, MIN_ROLE), false);
});

test("ผู้บันทึกขึ้นไปต้องบันทึกได้", () => {
  for (const r of ["editor", "operator", "admin"]) {
    assert.equal(roleAtLeast({ role: r }, MIN_ROLE), true, r);
  }
});

test("ระดับที่ไม่รู้จักต้องถือว่าต่ำกว่าทุกขั้น", () => {
  /* ★ ค่าแปลก ๆ ในฐานต้องไม่กลายเป็นสิทธิ์สูง — ปลอดภัยไว้ก่อนเสมอ */
  assert.equal(roleAtLeast({ role: "superuser" }, MIN_ROLE), false);
  assert.equal(roleAtLeast({ role: null }, MIN_ROLE), false);
  assert.equal(roleAtLeast({}, MIN_ROLE), false);
  assert.equal(roleAtLeast(null, MIN_ROLE), false);
});

test("ลำดับสิทธิ์ต้องไล่ขั้นจากต่ำไปสูง", () => {
  assert.deepEqual(ROLES, ["viewer", "editor", "operator", "admin"]);
  /* ขั้นสูงกว่าต้องทำสิ่งที่ขั้นต่ำกว่าทำได้เสมอ */
  assert.equal(roleAtLeast({ role: "admin" }, "viewer"), true);
  assert.equal(roleAtLeast({ role: "viewer" }, "admin"), false);
});

/* ---------- ★ ข้อความต้องพาไปแก้ถูกทาง ---------- */

test("★★ 'ยังไม่ผูกบัญชี' กับ 'สิทธิ์ไม่ถึง' ต้องพูดคนละอย่าง", () => {
  /* ทางแก้คนละทาง — ยังไม่ผูก = ไปขอผูก · สิทธิ์ไม่ถึง = ไปขอเลื่อนระดับ
     ถ้าใช้ข้อความเดียวกัน คนจะไปขอผิดเรื่องแล้ววนอยู่อย่างนั้น */
  assert.notEqual(NOT_ALLOWED, ROLE_TOO_LOW);
  assert.match(ROLE_TOO_LOW, /เลื่อนระดับ/);
  assert.match(NOT_ALLOWED, /ผูกบัญชี/);
});

test("ทั้งสองข้อความต้องบอกว่ายังดูข้อมูลได้", () => {
  /* ★ ปฏิเสธการเขียนไม่ใช่ปฏิเสธทั้งระบบ ถ้าไม่บอก คนจะคิดว่าใช้อะไรไม่ได้เลย */
  for (const t of [NOT_ALLOWED, ROLE_TOO_LOW]) assert.match(t, /ดูข้อมูล/);
});

test("ข้อความสิทธิ์ไม่ถึงต้องบอกว่าไปขอใคร", () => {
  assert.match(ROLE_TOO_LOW, /ผู้ดูแลระบบ/);
});
