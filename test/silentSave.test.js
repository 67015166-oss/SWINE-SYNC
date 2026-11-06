/**
 * การกรอกที่ไม่ได้ไปถึงระบบ ต้องไม่หน้าตาเหมือนบันทึกสำเร็จ (T1.339)
 *
 * ═══ ที่มา ═══
 * ผู้ใช้กรอกจำนวนสุกรแล้วถามว่า *"ลองเพิ่มแล้ว ขึ้นไหม"* (15 ต.ค. 2569)
 * ตรวจฐานแล้ว **วันนี้ไม่มีแถวใหม่เลยสักแถว** และล็อกฝั่งเซิร์ฟเวอร์ 12 ชม. ไม่มี error
 * — ไม่มีทั้งผลและร่องรอย แปลว่าไม่เคยมีคำขอส่งไปถึงหลังบ้าน
 * ผู้ใช้ตอบว่าป๊อบอัพ **"ปิดเงียบ ๆ เหมือนสำเร็จ"**
 *
 * ไล่แล้วพบทางเงียบสองทางที่เหลืออยู่ ทั้งคู่จบด้วย `onClose()` โดยไม่บอกอะไรเลย
 *
 *   1. ป๊อบอัพ "ปรับจำนวน" (`AdjustModal`) — ชั้นนี้เขียนลง localStorage เท่านั้น
 *      **ไม่เคยยิง API** ซึ่งอธิบายได้ว่าทำไมล็อกฝั่งเซิร์ฟเวอร์ถึงว่างเปล่า
 *   2. ฟอร์มโรงเรือน กรณีเลขที่กรอกเท่ากับยอดที่ระบบนับได้อยู่แล้ว
 *      `syncPigCount` คืน null เงียบ ๆ แบบเดียวกับตอน "ไม่มีค่าให้บันทึก"
 *
 * บทเรียนเดิมของ T1.335 ซ้ำอีกครั้ง: **ทางถอยที่เงียบคือทางถอยที่หลอกคน**
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { countDiffEntry, herdFromLogs } from "../src/lib/herdCount.js";

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

/** บันทึกจริงของ F-KPP-A1 ที่ดึงจากฐานบนกล่อง (15 ต.ค. 2569) */
const REAL_ENTRIES = [
  { id: "1", type: "sick", amount: 5, unit: "ตัว", at: "2026-10-14T13:59:40" },
  { id: "2", type: "sick", amount: 1, unit: "ตัว", at: "2026-10-14T13:59:05" },
  { id: "3", type: "dead", amount: 1, unit: "ตัว", at: "2026-10-09T11:36:49" },
  { id: "4", type: "dead", amount: 1, unit: "ตัว", at: "2026-10-09T11:25:00" },
  { id: "5", type: "moveIn", amount: 1200, unit: "ตัว", at: "2026-10-09T11:24:00" },
];

test("ยอดที่ระบบนับได้จากบันทึกจริงคือ 1,198 ตัว", () => {
  const s = herdFromLogs(REAL_ENTRIES);
  assert.equal(s.count, 1198);
  assert.equal(s.confident, true);
});

test("★ กรอกเลขเท่ากับยอดเดิม = ไม่มีรายการใหม่ — ซึ่งถูกต้อง แต่ต้องไม่เงียบ", () => {
  const s = herdFromLogs(REAL_ENTRIES);
  /* กรอก 60,000 ต้องเกิดบันทึกย้ายเข้า — ถ้าผู้ใช้กรอกเลขนี้จริงต้องมีแถวในฐาน */
  assert.deepEqual(countDiffEntry(s, 60000), { type: "moveIn", amount: 58802, unit: "ตัว" });
  /* กรอก 1,198 (เท่ายอดเดิม) ไม่มีอะไรให้บันทึก — เป็นกรณีที่หน้าจอต้องพูด ไม่ใช่ปิดเงียบ */
  assert.equal(countDiffEntry(s, 1198), null);
});

test("★ ตัวบันทึกต้องแยก 'ไม่มีอะไรให้เขียน' ออกจาก 'ไม่มีค่าให้บันทึก'", () => {
  /* เดิมคืน null เหมือนกันทั้งสองกรณี ฟอร์มจึงบอกความต่างไม่ได้ */
  const editor = src("lib/records/useFarmEditor.js");
  const fn = editor.slice(editor.indexOf("async function syncPigCount"), editor.indexOf("export function useFarmEditor"));
  for (const kind of ['"skipped"', '"same"', '"written"']) {
    assert.ok(fn.includes(kind), `syncPigCount ไม่ได้รายงานกรณี ${kind}`);
  }
  /* และต้องส่งต่อให้ผู้เรียกทั้งสองทาง ไม่ใช่คิดแล้วทิ้ง */
  assert.match(editor, /savedTo: "server", count/);
});

test("★ ฟอร์มโรงเรือนต้องบอกเมื่อบันทึกแล้วแต่จำนวนไม่ขยับ", () => {
  const modal = src("components/records/BarnFormModal.jsx");
  assert.match(modal, /saved\?\.count\?\.kind === "same"/);
  assert.match(modal, /จำนวนสุกรไม่ได้เปลี่ยน/);
  /* ต้อง return ก่อนถึง onClose() ไม่งั้นข้อความขึ้นแล้วป๊อบอัพก็ยังปิดอยู่ดี */
  const after = modal.slice(modal.indexOf('kind === "same"'));
  assert.ok(
    after.indexOf("return;") < after.indexOf("onClose()"),
    "ขึ้นข้อความแล้วยังปิดป๊อบอัพต่อ — ผู้ใช้จะไม่ทันอ่าน",
  );
});

test("★★ ป๊อบอัพ 'ปรับจำนวน' ต้องกดบันทึกไม่ได้ เมื่อปรับไปก็ไม่มีผล", () => {
  /* ชั้นนี้เขียนลง localStorage เท่านั้น ไม่เคยยิง API — ซึ่งอธิบายได้ว่าทำไม
     ล็อกฝั่งเซิร์ฟเวอร์ถึงไม่มีร่องรอยอะไรเลยตอนผู้ใช้บอกว่า "เพิ่มแล้ว"
     และ `barnCount` ให้บันทึกในฐานชนะค่าในเครื่องเสมอ ส่วนต่างจึงถูกทับทันที (T1.340) */
  const modal = src("components/adjust/AdjustModal.jsx");
  assert.ok(!/apiPost|apiPatch|addBarnLog/.test(modal), "ป๊อบอัพนี้ไม่ควรเขียนลงระบบเอง");
  assert.match(modal, /inSystem/, "ยังไม่รู้ว่าของที่ปรับอยู่ในระบบกลางหรือเปล่า");
  assert.match(modal, /ไม่มีผลกับตัวเลขที่เห็น/);

  /* ★ ปิดปุ่มจริง ไม่ใช่เตือนแล้วปล่อยให้กด — ปุ่มที่กดแล้วไม่เกิดอะไรขึ้น
     แย่กว่าปุ่มที่ปิดอยู่ เพราะผู้ใช้ไม่รู้ว่าต้องไปทำอย่างอื่นแทน */
  assert.match(modal, /const blocked = inSystem/);
  assert.match(modal, /disabled=\{!canWrite \|\| blocked/, "ปุ่มบันทึกยังกดได้ทั้งที่ไม่มีผล");
  assert.match(modal, /if \(!canWrite \|\| blocked/, "ตัวสั่งบันทึกยังไม่ได้กันไว้");

  /* ★ เหตุผลต้องอยู่เหนือตัวเลขและปุ่ม — อยู่ใต้ปุ่มเท่ากับไม่มี
     และต้องบอกทางที่ถูกด้วย ไม่ใช่บอกแค่ว่าทำไม่ได้ (กติกาใน CLAUDE.md) */
  assert.ok(
    modal.indexOf("aj-local") < modal.indexOf("aj-preview"),
    "เหตุผลอยู่ใต้ตัวเลข คนกดจะไม่ทันเห็น",
  );
  assert.match(modal, /บันทึกเป็นเหตุการณ์ \(ย้ายเข้า\/ย้ายออก\/ตาย\) ที่หน้าโรงเรือนแทน/);
});

test("★ ตัวเลขต้องไม่ขึ้นแป๊บเดียวแล้วเด้งกลับ ระหว่างรอบันทึกจากระบบ", () => {
  /* ผู้ใช้: "มันขึ้นโชว์แค่แป๊บเดียว แล้วก็กลับมาเป็นค่าเดิม" (15 ต.ค. 2569)
     เพราะระหว่างรอ `useHerdCounts` หน้าจอถอยไปโชว์ค่าในเครื่อง พอบันทึกมาถึง
     `barnCount` ให้บันทึกชนะ ตัวเลขจึงเด้งกลับ — ดูเหมือนแอปพังทั้งที่ทำถูกทั้งสองจังหวะ */
  const hook = src("lib/records/useBarnCounts.js");
  assert.match(hook, /const waiting = new Set/, "ยังไม่ได้กันช่วงที่บันทึกยังมาไม่ถึง");
  assert.match(hook, /if \(waiting\.has\(f\.id\)\) return/);
  /* ระหว่างรอต้องตอบ "ยังไม่รู้" (count: null) ไม่ใช่ตัวเลขที่จะถูกทับ */
  const block = hook.slice(hook.indexOf("waiting.has(f.id)"));
  assert.match(block.slice(0, 120), /count: null, from: null/);
});

test("หน้าที่เปิดป๊อบอัพปรับจำนวนต้องบอกด้วยว่าโรงเรือนนั้นอยู่ในระบบไหม", () => {
  for (const page of ["pages/FarmBarns.jsx", "pages/Herd.jsx"]) {
    assert.match(src(page), /inSystem=\{Boolean\(adjusting\?\.apiId\)\}/, `${page} ยังไม่ส่ง inSystem`);
  }
});
