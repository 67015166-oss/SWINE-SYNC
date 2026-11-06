/**
 * บันทึกของคนขึ้นระบบกลาง (T1.269)
 *
 * ของที่พังแล้วเงียบ:
 *   - ชนิด/หน่วยฝั่งหน้าเว็บกับหลังบ้านไม่ตรงกัน → กดเพิ่มแล้วได้ 400 ทุกครั้งกับชนิดใหม่
 *   - เวลาหลุดโซน → บันทึกตอนสี่ทุ่มไปตกกะผิด (รายงานส่งเวรนับตามเวลา)
 *   - ย้ายของในเครื่องขึ้นฐานแล้วลบทิ้งทั้งที่หลังบ้านรับไม่ครบ → ข้อมูลหาย
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { BARN_KEY, LOG_TYPES as SERVER_TYPES, UNITS as SERVER_UNITS, checkEntry } from "../server/src/barnlog/validate.js";
import { LOG_TYPES, UNITS } from "../src/lib/barnLogTypes.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ok = { type: "dead", amount: 2, unit: "ตัว", at: "2026-09-17T22:30:00", note: "คอก 3", by: "สมชาย · ผู้บันทึก" };

test("ชนิดและหน่วยของหน้าเว็บกับหลังบ้านตรงกันทุกตัว", () => {
  assert.deepEqual(LOG_TYPES.map((k) => k.value).sort(), [...SERVER_TYPES].sort());
  assert.deepEqual([...UNITS].sort(), [...SERVER_UNITS].sort());
  /* ★ ไล่ migration ทุกไฟล์ ไม่ใช่ไฟล์แรกไฟล์เดียว — ชนิดใหม่มาทาง migration ใหม่
     (T1.366 เพิ่ม 12 ชนิด ด้วยการแก้ CHECK constraint ในไฟล์ของตัวเอง) */
  const dir = new URL("../server/src/db/migrations/", import.meta.url);
  const all = readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(new URL(f, dir), "utf8"))
    .join("\n");
  for (const type of SERVER_TYPES) assert.match(all, new RegExp(`'${type}'`));
});

test("checkEntry: รายการครบถูกต้องผ่าน และตัดช่องยาวเกิน", () => {
  const r = checkEntry({ ...ok, note: "ก".repeat(900) });
  assert.equal(r.ok, true);
  assert.equal(r.value.note.length, 500);
  assert.equal(r.value.at, "2026-09-17T22:30:00");
});

test("checkEntry: เวลาไม่มีวินาทีเติมให้ · เวลาที่มีโซนหรือรูปแปลกไม่รับ", () => {
  assert.equal(checkEntry({ ...ok, at: "2026-09-17T22:30" }).value.at, "2026-09-17T22:30:00");
  assert.equal(checkEntry({ ...ok, at: "2026-09-17T22:30:00Z" }).ok, false);
  assert.equal(checkEntry({ ...ok, at: "17/09/2026" }).ok, false);
});

test("checkEntry: ชนิด/หน่วย/จำนวนที่ไม่รู้จักไม่รับ และบอกช่องที่ผิด", () => {
  const r = checkEntry({ ...ok, type: "party", unit: "ลัง", amount: 0 });
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors.sort(), ["amount", "type", "unit"]);
  assert.equal(checkEntry({ ...ok, amount: -1 }).ok, false);
  assert.equal(checkEntry({ ...ok, amount: "abc" }).ok, false);
});

test("checkEntry partial: แก้บางช่องได้ ไม่บังคับครบ แต่ช่องที่ส่งมาต้องถูก", () => {
  assert.deepEqual(checkEntry({ note: "แก้" }, { partial: true }), { ok: true, value: { note: "แก้" } });
  assert.equal(checkEntry({ type: "x" }, { partial: true }).ok, false);
});

test("BARN_KEY: รหัสแบบหน้าเว็บผ่าน · ของแปลกไม่ผ่าน", () => {
  assert.ok(BARN_KEY.test("F-KPP-A1"));
  assert.ok(!BARN_KEY.test("../etc"));
  assert.ok(!BARN_KEY.test(""));
  assert.ok(!BARN_KEY.test("a b"));
});

test("เส้นทาง: อ่านต้องล็อกอิน · เขียนทุกเส้นต้องผู้บันทึกขึ้นไป · ลบเป็นแบบซ่อน", () => {
  const route = read("../server/src/modules/barnlog/route.js");
  assert.match(route, /barnLogRouter\.use\(requireAuth\)/);
  for (const line of [
    /barnLogRouter\.post\("\/:barnKey", requireRole\("editor"\)/,
    /barnLogRouter\.patch\("\/:barnKey\/:id", requireRole\("editor"\)/,
    /barnLogRouter\.delete\("\/:barnKey\/:id", requireRole\("editor"\)/,
    /barnLogRouter\.post\("\/:barnKey\/import", requireRole\("editor"\)/,
  ]) assert.match(route, line);
  assert.doesNotMatch(route, /delete from barn_log/i);
  /* เวลาไทยทั้งขาเข้าและขาออก */
  assert.match(route, /at time zone 'Asia\/Bangkok'/);
});

test("หน้าเว็บ: ย้ายขึ้นฐานแล้วลบในเครื่องเฉพาะเมื่อหลังบ้านรับครบ · บอกเสมอว่าบันทึกอยู่ที่ไหน", () => {
  const hook = read("../src/lib/barnLog.js");
  assert.match(hook, /if \(result\.skipped === 0\) forget\(/);
  const page = read("../src/pages/BarnDetail.jsx");
  assert.match(page, /บันทึกขึ้นระบบกลาง — ทุกเครื่องเห็นตรงกัน/);
  assert.match(page, /เก็บในเครื่องนี้เท่านั้น — เครื่องอื่นไม่เห็น/);
  assert.match(page, /disabled=\{!canWrite \|\| logBusy\}/);
});

test("รายงานส่งเวรอ่านบันทึกด้วยรหัส farm.code-barn.code และแยก 'ไม่รู้' ออกจาก 'ไม่มี'", () => {
  const report = read("../server/src/reports/shiftReport.js");
  assert.match(report, /`\$\{barn\.farm_code\}-\$\{barn\.code\}`/);
  assert.match(report, /if \(!barn\.farm_code \|\| !barn\.code\) return null;/);
  const page = read("../src/pages/ShiftReport.jsx");
  assert.match(page, /if \(records == null\)/);
});
