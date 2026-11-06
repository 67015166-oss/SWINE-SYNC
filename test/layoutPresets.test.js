/**
 * ค่าตั้งต้นของกระดานต้องไม่ทับกันเอง (6 พ.ย. 2569)
 *
 * ★ ของเดิมมีตัวตรวจอยู่แล้วแต่ทำงานเฉพาะตอน dev และพูดผ่าน `console.warn`
 *   ซึ่งไม่มีใครเห็นตอน build และไม่มีอะไรกันไม่ให้หลุดขึ้นของจริง
 *   หน้าจัดการผู้ใช้เตือน 6 คู่อยู่หลายสัปดาห์โดยไม่มีใครรู้ว่ามันเตือนผิด
 *
 * ★★ คำเตือนที่ผิดบ่อย ๆ อันตรายกว่าไม่เตือนเลย เพราะคนจะเลิกอ่านคำเตือนทั้งหมด
 *   เทสต์นี้จึงบังคับสองอย่าง: ห้ามมีคู่ที่ทับกันโดยไม่ได้ขึ้นทะเบียน
 *   **และ** ห้ามขึ้นทะเบียนคู่ที่ไม่ได้ทับกันจริง (ทะเบียนค้างก็ต้องเก็บกวาด)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LAYOUTS, MIN_H, MIN_W, ALLOWED_OVERLAPS } from "../src/lib/layout/presets.js";

/** กระดานที่ค่าตั้งต้นเป็นฟังก์ชัน (รายชื่อกล่องไม่คงที่) — เรียกด้วยรายชื่อเปล่าไม่ได้ */
const fixedBoards = Object.entries(DEFAULT_LAYOUTS).filter(
  ([, blocks]) => typeof blocks === "object" && blocks !== null,
);

const hits = (a, b) => {
  const ah = Math.max(a.h, MIN_H);
  const bh = Math.max(b.h, MIN_H);
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + bh && b.y < a.y + ah;
};

const pairsOf = (blocks) => {
  const list = Object.entries(blocks);
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) out.push([list[i], list[j]]);
  }
  return out;
};

const registered = (boardId, a, b) =>
  (ALLOWED_OVERLAPS[boardId] ?? []).some((p) => p.includes(a) && p.includes(b));

test("ทุกกล่องสูงและกว้างไม่ต่ำกว่าขั้นต่ำ", () => {
  for (const [boardId, blocks] of fixedBoards) {
    for (const [id, b] of Object.entries(blocks)) {
      assert.ok(b.h >= MIN_H, `${boardId}/${id} สูง ${b.h} ต่ำกว่า MIN_H (${MIN_H})`);
      assert.ok(b.w >= MIN_W, `${boardId}/${id} กว้าง ${b.w} ต่ำกว่า MIN_W (${MIN_W})`);
    }
  }
});

test("★ ไม่มีกล่องทับกันโดยไม่ได้ขึ้นทะเบียนว่าตั้งใจ", () => {
  const bad = [];
  for (const [boardId, blocks] of fixedBoards) {
    for (const [[aId, a], [bId, b]] of pairsOf(blocks)) {
      if (hits(a, b) && !registered(boardId, aId, bId)) bad.push(`${boardId}: ${aId} × ${bId}`);
    }
  }
  assert.deepEqual(bad, [], `กล่องทับกันโดยไม่ตั้งใจ:\n  ${bad.join("\n  ")}`);
});

test("★ ทะเบียนคู่ที่ยอมให้ทับ ต้องยังทับกันจริง (ไม่ปล่อยให้ค้าง)", () => {
  const stale = [];
  for (const [boardId, pairs] of Object.entries(ALLOWED_OVERLAPS)) {
    const blocks = DEFAULT_LAYOUTS[boardId];
    if (typeof blocks !== "object" || blocks === null) continue;
    for (const [aId, bId] of pairs) {
      const a = blocks[aId];
      const b = blocks[bId];
      /* กล่องหายไปจากค่าตั้งต้นแล้ว = ทะเบียนค้าง */
      if (!a || !b) { stale.push(`${boardId}: ${aId} × ${bId} (ไม่มีกล่องนี้แล้ว)`); continue; }
      if (!hits(a, b)) stale.push(`${boardId}: ${aId} × ${bId} (ไม่ได้ทับกันแล้ว)`);
    }
  }
  assert.deepEqual(stale, [], `ทะเบียนค้าง ควรเก็บกวาด:\n  ${stale.join("\n  ")}`);
});
