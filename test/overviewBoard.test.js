/**
 * หน้าภาพรวมจัดเป็นคอลัมน์ (T1.358)
 *
 * ★★ สิ่งที่เทสต์ชุดนี้กันไว้คือ **"สองคอลัมน์จบบรรทัดล่างไม่ตรงกัน"**
 * ถ้าแผนที่สูงไม่เท่ากับกล่องสรุปทุกใบรวมกัน จะเหลือหางว่างข้างใดข้างหนึ่ง
 * ที่ผู้ใช้ลากปิดไม่ได้ และมองด้วยตาตอนรีวิวไม่เห็น เพราะต่างกันไม่กี่สิบพิกเซล
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { BOARDS, COLS, DEFAULT_LAYOUTS, MIN_H } from "../src/lib/layout/presets.js";

const src = readFileSync(new URL("../src/pages/Overview.jsx", import.meta.url), "utf8");
const TILES = ["farms", "pigs", "alerts", "climate"];
const ALL = [...TILES, "map"];
const layoutOf = (ids) => DEFAULT_LAYOUTS.overview(ids);

test("หน้าภาพรวมห่อด้วย PageBoard", () => {
  assert.match(src, /<PageBoard boardId=\{BOARD_ID\}>/);
  assert.ok(BOARDS.overview, "ขาดชื่อกระดานใน BOARDS");
});

test("แผนที่เป็นคอลัมน์ซ้าย กล่องสรุปเป็นคอลัมน์ขวา", () => {
  const l = layoutOf(ALL);
  assert.equal(l.map.x, 0, "แผนที่ต้องชิดซ้าย");
  assert.equal(l.map.y, 0, "แผนที่ต้องเริ่มบนสุด");
  for (const id of TILES) {
    assert.equal(l[id].x, l.map.w, `กล่อง ${id} ต้องอยู่คอลัมน์ขวาติดแผนที่พอดี`);
    assert.equal(l[id].w, COLS - l.map.w, `กล่อง ${id} ต้องเต็มความกว้างคอลัมน์ขวา`);
  }
});

test("★★ สองคอลัมน์จบบรรทัดล่างตรงกันพอดี", () => {
  const l = layoutOf(ALL);
  const right = Math.max(...TILES.map((id) => l[id].y + l[id].h));
  assert.equal(l.map.y + l.map.h, right, "แผนที่กับคอลัมน์ขวาต้องจบที่แถวเดียวกัน");
});

test("กล่องสรุปเรียงลงต่อกัน ไม่ทับกันและไม่เหลือช่องว่างคั่น", () => {
  const l = layoutOf(ALL);
  const sorted = TILES.map((id) => l[id]).sort((a, b) => a.y - b.y);
  sorted.forEach((b, i) => {
    if (i === 0) return assert.equal(b.y, 0, "ใบแรกต้องเริ่มบนสุด");
    const prev = sorted[i - 1];
    assert.equal(b.y, prev.y + prev.h, "กล่องต้องต่อกันพอดี ไม่ทับและไม่เว้นช่อง");
  });
});

test("ทุกกล่องสูงไม่ต่ำกว่าที่กระดานยอมให้ (ยืดคืนไม่ได้ถ้าเตี้ยเกิน)", () => {
  const l = layoutOf(ALL);
  for (const [id, b] of Object.entries(l)) {
    assert.ok(b.h >= MIN_H, `กล่อง ${id} เตี้ยกว่า MIN_H`);
    assert.ok(b.x + b.w <= COLS, `กล่อง ${id} ล้นขอบขวา`);
  }
});

test("★ ซ่อนกล่องสรุปหมด แผนที่ยังต้องมีความสูงของตัวเอง ไม่ยุบเป็นศูนย์", () => {
  const l = layoutOf(["map"]);
  assert.ok(l.map.h >= MIN_H, "แผนที่ยุบจนลากคืนไม่ได้");
});

test("เพิ่มกล่องสรุปใบใหม่แล้วยังอยู่ในคอลัมน์ขวาและยังจบตรงกัน", () => {
  const ids = [...TILES, "extra", "map"];
  const l = layoutOf(ids);
  assert.equal(l.extra.x, l.map.x + l.map.w);
  const right = Math.max(...ids.filter((i) => i !== "map").map((id) => l[id].y + l[id].h));
  assert.equal(l.map.y + l.map.h, right);
});
