/**
 * หน้าแบบจำลองโรงเรือน — ชั้นที่ 1 "เห็นสถานะจริง" (T1.260)
 *
 * เทสต์ชุดนี้กันสองอย่างที่พังแล้วไม่มีใครเห็นทันที:
 *   1. กล่องบนกระดานไม่มีตำแหน่งตั้งต้น → ตกไปใช้ขนาดสำรอง 3×9 แล้วผังถูกบีบจนอ่านไม่ออก
 *   2. **แบบจำลองโกหก** → ผังไล่เฉดสีเหมือนมีเซนเซอร์หลายจุด ทั้งที่ในเล้ามีจุดวัดจุดเดียว
 *      ข้อนี้สำคัญกว่าข้อแรก เพราะภาพที่ดูน่าเชื่อแต่ไม่จริงอันตรายกว่าภาพที่ดูพัง
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { BOARDS, DEFAULT_LAYOUTS, COLS, reconcile } from "../src/lib/layout/presets.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("../src/pages/Twin.jsx");
const plan = read("../src/components/twin/BarnTwin.jsx");
/* แถบเมนูซ้ายที่ผู้ใช้เห็นจริงคือแผงเลื่อนเข้า AppSidebar.jsx — ไม่ใช่ sideNav.js
   (sideNav.js เป็นของ SideLayout ซึ่งตอนนี้ใช้แค่หน้ารายละเอียดสุกรรายประเภท)
   เจอจริง 17 ก.ย. 2569: เพิ่มเมนูผิดไฟล์ ผู้ใช้เปิดเว็บแล้วไม่เจอช่องแบบจำลองโรงเรือน */
const sidebar = read("../src/components/layout/AppSidebar.jsx");
const nav = read("../src/components/layout/sideNav.js");
const app = read("../src/App.jsx");
const blockIds = [...page.matchAll(/<Block id="(\w+)"/g)].map((m) => m[1]);

test("มีช่องแบบจำลองโรงเรือนในแผงเมนูที่ผู้ใช้เห็นจริง และมีเส้นทางรองรับ", () => {
  assert.match(sidebar, /to: "\/dashboard\/twin", label: "แบบจำลองโรงเรือน"/);
  assert.match(app, /<Route path="twin" element=\{<Twin \/>\} \/>/);
});

test("แถบเมนูของ SideLayout มีช่องเดียวกัน เมนูสองชุดจะได้ไม่เพี้ยนกัน", () => {
  assert.match(nav, /to: "\/dashboard\/twin", label: "แบบจำลองโรงเรือน"/);
});

test("หน้าห่อด้วย PageBoard boardId=twin และมีชื่อกระดาน", () => {
  assert.match(page, /<PageBoard boardId=\{BOARD_ID\}>/);
  assert.match(page, /const BOARD_ID = "twin"/);
  assert.ok(BOARDS.twin, "ขาดชื่อกระดานใน BOARDS");
});

test("ทุกกล่องในหน้ามีตำแหน่งตั้งต้น และไม่ล้นขอบกระดาน", () => {
  assert.deepEqual([...new Set(blockIds)].sort(), ["alerts", "lab", "model", "now", "plan", "trust"]);
  for (const id of blockIds) {
    const box = DEFAULT_LAYOUTS.twin[id];
    assert.ok(box, `ขาดตำแหน่งตั้งต้นของกล่อง ${id}`);
    assert.ok(box.x + box.w <= COLS, `กล่อง ${id} ล้นขอบขวาของกระดาน`);
  }
});

test("ตอนยังต่อข้อมูลไม่ได้ หน้าเหลือกล่องเดียว แล้วกล่องนั้นต้องอยู่บนสุด", () => {
  const layout = reconcile(DEFAULT_LAYOUTS.twin, ["plan"], DEFAULT_LAYOUTS.twin);
  assert.equal(layout.plan.y, 0);
});

test("กล่องทั้งสี่ใบวางแล้วไม่ทับกัน", () => {
  const layout = reconcile(DEFAULT_LAYOUTS.twin, blockIds, DEFAULT_LAYOUTS.twin);
  const boxes = blockIds.map((id) => ({ id, ...layout[id] }));
  for (const a of boxes) {
    for (const b of boxes) {
      if (a.id >= b.id) continue;
      const apart =
        a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      assert.ok(apart, `กล่อง ${a.id} กับ ${b.id} ทับกัน`);
    }
  }
});

test("ผังไม่ไล่เฉดสีเลียนแบบว่ามีเซนเซอร์หลายจุด", () => {
  /* มีเซนเซอร์ในเล้าจุดเดียว — gradient/heatmap ใด ๆ คือการวาดข้อมูลที่ไม่มีจริง */
  assert.doesNotMatch(plan, /linearGradient|radialGradient|feGaussianBlur/);
});

test("หน้าบอกขอบเขตของแบบจำลองไว้บนจอ ไม่ใช่ซ่อนไว้ในโค้ด", () => {
  assert.match(page, /แบบจำลองนี้รู้อะไรบ้าง/);
  assert.match(page, /พัดลมหมุนอยู่จริงหรือไม่/);
  assert.match(page, /มีจุดวัดจุดเดียว จึงไล่เฉดสีไม่ได้/);
});

test("ค่าที่ไม่มีต้องขึ้นว่าไม่มีค่า ไม่ใช่ศูนย์", () => {
  assert.match(page, /t\("ไม่มีค่า"\)/);
  assert.doesNotMatch(page, /\?\?\s*0\b/);
});
