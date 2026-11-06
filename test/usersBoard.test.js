/**
 * หน้าจัดการผู้ใช้อยู่บนกระดานจัดเลย์เอาต์ (T1.256)
 *
 * รหัสกล่องในหน้า (`<Block id>`) ต้องมีตำแหน่งตั้งต้นใน DEFAULT_LAYOUTS.users ทุกใบ
 * ไม่งั้นกล่องไปตกขนาดสำรอง 3×9 ช่อง แล้วฟอร์ม/ตารางถูกบีบเหลือหนึ่งในสี่ของจอ
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { BOARDS, DEFAULT_LAYOUTS, reconcile } from "../src/lib/layout/presets.js";

const src = readFileSync(new URL("../src/pages/Users.jsx", import.meta.url), "utf8");
const blockIds = [...src.matchAll(/<Block id="(\w+)"/g)].map((m) => m[1]);

test("หน้าจัดการผู้ใช้ห่อด้วย PageBoard boardId=users", () => {
  assert.match(src, /<PageBoard boardId="users">/);
  assert.ok(BOARDS.users, "ขาดชื่อกระดานใน BOARDS");
});

test("ทุกกล่องในหน้ามีตำแหน่งตั้งต้นเต็มกว้าง", () => {
  assert.deepEqual(blockIds.sort(), ["add", "denied", "edit", "lineLinks", "list", "matrix", "reset"]);
  for (const id of blockIds) {
    assert.ok(DEFAULT_LAYOUTS.users[id], `ขาดตำแหน่งตั้งต้นของกล่อง ${id}`);
    assert.equal(DEFAULT_LAYOUTS.users[id].w, 12, `กล่อง ${id} ต้องเต็มกว้าง`);
  }
});

test("ปิดฟอร์มทุกใบแล้ว รายชื่อบัญชีขึ้นไปชิดบนสุด ไม่เหลือแถวว่าง", () => {
  const layout = reconcile(DEFAULT_LAYOUTS.users, ["list", "matrix"], DEFAULT_LAYOUTS.users);
  assert.equal(layout.list.y, 0);
  assert.equal(layout.matrix.y, layout.list.h);
});

for (const form of ["add", "reset", "edit"]) {
  test(`เปิดฟอร์ม ${form} แล้วรายชื่อบัญชีต่อใต้ฟอร์มพอดี ไม่ทับกัน`, () => {
    const layout = reconcile(DEFAULT_LAYOUTS.users, [form, "list", "matrix"], DEFAULT_LAYOUTS.users);
    assert.equal(layout[form].y, 0);
    assert.equal(layout.list.y, layout[form].h);
    assert.equal(layout.matrix.y, layout.list.y + layout.list.h);
  });
}
