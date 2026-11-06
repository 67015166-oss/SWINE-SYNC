/**
 * ช่อง "จำนวนสุกร" ในฟอร์มโรงเรือน — ว่างเปล่าต้องไม่ถูกอ่านว่า "ศูนย์ตัว" (T1.341)
 *
 * ═══ ที่มา ═══
 * โรงเรือนจากหลังบ้านมี `pigs: null` ตลอด (ดู `toBarn` — ฐานไม่มีคอลัมน์จำนวน
 * โดยเจตนา ยอดจริงนับจาก `barn_log`) ผลคือหน้าโรงเรือนของฟาร์มขึ้น "—"
 * และฟอร์มแก้ไขเปิดมาเจอช่องจำนวน**ว่างเปล่า** ทั้งที่ระบบนับได้ 1,198 ตัว
 *
 * ของเดิมฟอร์มแปลงช่องนั้นด้วย `Math.max(0, num(pigs))` ซึ่ง `Number("")` คือ **0**
 * เท่ากับ "ไม่ได้กรอก" ถูกแปลงเป็น "เล้าว่างแล้ว" — แก้แค่ความจุหรือขั้นการเลี้ยง
 * แล้วกดบันทึก จะได้บันทึก "ย้ายออก 1,198 ตัว" ไปเงียบ ๆ **ฝูงหายทั้งเล้า**
 *
 * `countDiffEntry` แยก `null`/`""` ออกจาก `0` ถูกต้องอยู่แล้ว (T1.328)
 * ฟอร์มเป็นคนยุบสองอย่างนั้นเข้าหากันก่อนเรียก — จึงแก้ที่ฟอร์ม
 * และย้ายการแปลงค่ามาไว้ข้าง `countDiffEntry` เพื่อไม่ให้สองฝั่งหลุดกันอีก
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { countDiffEntry, herdFromLogs, pigsField, pigsSeed } from "../src/lib/herdCount.js";

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

/** บันทึกจริงของ F-KPP-A1 จากฐานบนกล่อง — ยอดที่นับได้คือ 1,198 ตัว */
const REAL_ENTRIES = [
  { id: "1", type: "sick", amount: 5, unit: "ตัว", at: "2026-10-14T13:59:40" },
  { id: "2", type: "dead", amount: 1, unit: "ตัว", at: "2026-10-09T11:36:49" },
  { id: "3", type: "dead", amount: 1, unit: "ตัว", at: "2026-10-09T11:25:00" },
  { id: "4", type: "moveIn", amount: 1200, unit: "ตัว", at: "2026-10-09T11:24:00" },
];

/* ───── การแปลงค่าในช่องกรอก ───── */

test("ช่องว่างคือ \"ไม่ได้กรอก\" ไม่ใช่ศูนย์", () => {
  assert.equal(pigsField(""), null);
  assert.equal(pigsField("   "), null);
  assert.equal(pigsField(null), null);
  assert.equal(pigsField(undefined), null);
});

test("กรอกศูนย์คือ \"เล้าว่างแล้ว\" ต้องได้ 0 จริง ๆ", () => {
  assert.equal(pigsField("0"), 0);
  assert.equal(pigsField(0), 0);
});

test("ตัวเลขที่ใช้ได้ผ่านตามปกติ · ค่าที่อ่านไม่ออกหรือติดลบถือว่าไม่ได้กรอก", () => {
  assert.equal(pigsField("1200"), 1200);
  assert.equal(pigsField(" 1,2 "), null);
  assert.equal(pigsField("abc"), null);
  /* ★ ติดลบต้องเป็น null ไม่ใช่ 0 — ของเดิม Math.max(0, …) กด -5 ให้เป็น 0
     ซึ่งกลายเป็นคำสั่งล้างเล้าโดยที่คนกรอกไม่ได้สั่ง */
  assert.equal(pigsField("-5"), null);
});

/* ───── ผลต่อบันทึก ───── */

test("ไม่แตะช่องจำนวนแล้วกดบันทึก ต้องไม่เกิดบันทึกย้ายออกทั้งเล้า", () => {
  const summary = herdFromLogs(REAL_ENTRIES);
  assert.equal(summary.count, 1198);
  assert.equal(countDiffEntry(summary, pigsField("")), null);
});

test("สูตรเดิมของฟอร์มล้างฝูงทั้งเล้า — เก็บไว้เป็นหลักฐานว่าทำไมต้องแก้", () => {
  const summary = herdFromLogs(REAL_ENTRIES);
  const oldWay = Math.max(0, Number(String("").trim()));
  assert.equal(oldWay, 0);
  assert.deepEqual(countDiffEntry(summary, oldWay), {
    type: "moveOut",
    amount: 1198,
    unit: "ตัว",
  });
});

test("กรอก 0 เองยังล้างเล้าได้ตามเจตนา", () => {
  const summary = herdFromLogs(REAL_ENTRIES);
  assert.deepEqual(countDiffEntry(summary, pigsField("0")), {
    type: "moveOut",
    amount: 1198,
    unit: "ตัว",
  });
});

/* ───── ค่าตั้งต้นของช่อง ───── */

test("ช่องจำนวนตั้งต้นจากยอดที่ระบบนับได้ ไม่ใช่ค่าว่างของโรงเรือนจริง", () => {
  assert.equal(pigsSeed(1198, null), "1198");
  assert.equal(pigsSeed(null, 420), "420");
  assert.equal(pigsSeed(null, null), "");
  assert.equal(pigsSeed(0, null), "0");
});

/* ───── กันไม่ให้ไหลกลับ ───── */

test("ฟอร์มโรงเรือนต้องแปลงช่องจำนวนผ่าน pigsField ไม่ใช่ num() ของตัวเอง", () => {
  const form = src("components/records/BarnFormModal.jsx");
  assert.match(form, /pigsField\(/);
  assert.match(form, /pigsSeed\(/);
  /* ★ จับ **การกำหนดค่า** ไม่ใช่การเอ่ยถึง — คอมเมนต์ที่อธิบายว่าสูตรเดิมผิดยังไง
     ก็มีข้อความนั้นอยู่ด้วย ด่านที่จับแค่คำจะแดงเพราะคำอธิบายของตัวเอง (เจอมาแล้ว T1.338) */
  assert.ok(
    !/pigNum\s*=\s*Math\.max/.test(form),
    "ยังมีสูตรเดิมที่ยุบช่องว่างเป็น 0 อยู่",
  );
});

test("บรรทัดท้ายฟอร์มต้องบอกตามจริงว่าบันทึกไปไหน ไม่ใช่ข้อความเดียวตายตัว", () => {
  const form = src("components/records/BarnFormModal.jsx");
  /* ★ เคยเขียนว่า "เก็บในเครื่องนี้เท่านั้น" ไว้ตายตัว ซึ่งผิดสำหรับฟาร์มจริง
     — โกหกคนละทางกับ T1.335 แต่ทำให้คนกดเชื่อผิดเหมือนกัน */
  assert.match(form, /inSystem/);
  assert.match(form, /บันทึกเข้าระบบกลาง/);
});

test("หน้าโรงเรือนของฟาร์มต้องอ่านจำนวนจากกติกากลาง ไม่ใช่ b.pigs ที่เป็น null", () => {
  const page = src("pages/FarmBarns.jsx");
  assert.match(page, /useBarnCounts\(/);
  assert.ok(
    !/removingBarn\.pigs\s*\?\?\s*0/.test(page),
    "ข้อความยืนยันลบยังบอกว่า 0 ตัว ทั้งที่ระบบนับได้",
  );
});
