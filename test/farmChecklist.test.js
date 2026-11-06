/**
 * เช็กลิสต์ฟาร์ม (T1.291) — เรื่องรอบของการติ๊ก
 *
 * ของที่พังแล้วอันตรายกว่าไม่มีเลย:
 *   - ติ๊กรายวันค้างข้ามวัน → คนเปิดมาเจอ "ตรวจครบแล้ว" ทั้งที่ยังไม่ได้เดินดูสักคอก
 *     นี่คือหลักฐานปลอมว่าตรวจแล้ว ซึ่งแย่กว่าช่องว่างเปล่า
 *   - รอบ "ทุกรุ่น" รีเซ็ตเอง → ระบบไม่มีทางรู้ว่าฟาร์มขึ้นรุ่นใหม่ตอนไหน เดาแล้วผิดแน่
 *   - เอาข้อ "ไม่ผ่านทำยังไง" ออกเพื่อประหยัดที่ → คนติ๊กผ่านเพราะไม่รู้จะทำอะไรต่อ
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  activeTicks,
  periodId,
  startNewBatch,
  toggleTick,
} from "../src/lib/farmy/checklistState.js";
import { CHECKS, FREQS, SYSTEMS } from "../src/data/farmy/checklist.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const day = (y, m, d) => new Date(y, m - 1, d);

test("★ ติ๊กรายวันต้องไม่ค้างข้ามวัน", () => {
  const t1 = day(2026, 9, 29);
  const s = toggleTick({}, "daily", "he1", t1);
  assert.deepEqual(activeTicks(s, "daily", t1).done, ["he1"]);
  assert.deepEqual(activeTicks(s, "daily", day(2026, 9, 30)).done, [], "ติ๊กเมื่อวานค้างมาวันนี้");
});

test("รายสัปดาห์และรายเดือนก็ต้องรีเซ็ตตามรอบของตัวเอง", () => {
  const mon = day(2026, 9, 28);
  const s = toggleTick(toggleTick({}, "weekly", "w1", mon), "monthly", "m1", mon);
  /* วันศุกร์สัปดาห์เดียวกัน — ยังต้องเห็นของเดิม */
  assert.deepEqual(activeTicks(s, "weekly", day(2026, 10, 2)).done, ["w1"]);
  /* สัปดาห์ถัดไป — ต้องว่าง */
  assert.deepEqual(activeTicks(s, "weekly", day(2026, 10, 6)).done, []);
  /* เดือนเดิม ยังอยู่ · ขึ้นเดือนใหม่ ต้องว่าง */
  assert.deepEqual(activeTicks(s, "monthly", day(2026, 9, 30)).done, ["m1"]);
  assert.deepEqual(activeTicks(s, "monthly", day(2026, 10, 1)).done, []);
});

test("สัปดาห์คร่อมปีต้องไม่ได้เลขซ้ำกับสัปดาห์แรกของปีถัดไป", () => {
  assert.notEqual(periodId("weekly", day(2026, 12, 31)), periodId("weekly", day(2027, 1, 18)));
});

test("★ รอบ 'ทุกรุ่น' ต้องไม่รีเซ็ตเอง — คนกดเท่านั้น", () => {
  const s = toggleTick({}, "batch", "b1", day(2026, 9, 29));
  /* ผ่านไปสามเดือนก็ยังต้องอยู่ เพราะรุ่นยังไม่จบ */
  assert.deepEqual(activeTicks(s, "batch", day(2026, 12, 29)).done, ["b1"]);
  const after = startNewBatch(s);
  assert.deepEqual(activeTicks(after, "batch", day(2026, 9, 29)).done, [], "กดเริ่มรุ่นใหม่แล้วยังค้าง");
});

test("เริ่มรุ่นใหม่ต้องไม่ล้างความถี่อื่นทิ้งไปด้วย", () => {
  let s = toggleTick({}, "daily", "he1", day(2026, 9, 29));
  s = toggleTick(s, "batch", "b1", day(2026, 9, 29));
  const after = startNewBatch(s);
  assert.deepEqual(activeTicks(after, "daily", day(2026, 9, 29)).done, ["he1"]);
});

test("ข้อมูลของทีม Farmy ครบและอ้างระบบที่มีจริง", () => {
  assert.ok(CHECKS.length >= 40, `เช็กลิสต์เหลือแค่ ${CHECKS.length} ข้อ`);
  const sys = new Set(SYSTEMS.map((s) => s.id));
  const freq = new Set(FREQS.map((f) => f.id));
  for (const c of CHECKS) {
    assert.ok(sys.has(c.sys), `ข้อ ${c.id} อ้างระบบที่ไม่มี (${c.sys})`);
    assert.ok(freq.has(c.freq), `ข้อ ${c.id} อ้างความถี่ที่ไม่มี (${c.freq})`);
    assert.ok(c.text && c.ok && c.fix, `ข้อ ${c.id} ขาดข้อความบางส่วน`);
  }
});

test("★ หน้าจอต้องแสดงทั้ง 'ผ่านแปลว่าอะไร' และ 'ไม่ผ่านทำยังไง'", () => {
  const page = read("../src/pages/guide/Checklist.jsx");
  assert.match(page, /c\.ok/, "ไม่ได้แสดงเกณฑ์ผ่าน");
  assert.match(page, /c\.fix/, "ไม่ได้แสดงวิธีแก้เมื่อไม่ผ่าน");
  /* และต้องบอกว่าเก็บในเครื่อง ไม่ใช่หลักฐานการตรวจ */
  assert.match(page, /ไม่ใช่หลักฐานการตรวจ/, "ไม่ได้บอกว่าผลติ๊กไม่ใช่หลักฐาน");
});

test("ไอคอนของทีม Farmy ต้องแปลงเป็นไอคอนของเราครบทุกตัวที่ใช้จริง", async () => {
  const { iconFor } = await import("../src/data/farmy/icons.js");
  const icons = read("../src/components/ui/Icon.jsx");
  const used = [...SYSTEMS.map((s) => s.icon), ...FREQS.map((f) => f.icon)];
  for (const name of used) {
    const ours = iconFor(name);
    assert.notEqual(ours, "info", `${name} ยังไม่ได้จับคู่ เลยตกไปเป็นไอคอนสำรอง`);
    assert.match(icons, new RegExp(`\\n  ${ours}:`), `ชุดไอคอนของเราไม่มี "${ours}"`);
  }
});
