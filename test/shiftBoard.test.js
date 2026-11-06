/**
 * หน้ารายงานส่งเวร (T1.268) — ของที่พังแล้วไม่มีใครเห็นทันที
 *   1. เมนูอยู่ผิดไฟล์ (เคยพลาดกับหน้าแบบจำลองโรงเรือน 17 ก.ย. 2569) หรือกล่องไม่มีตำแหน่งตั้งต้น
 *   2. **รายงานเงียบเรื่องข้อมูลขาด** — ตัวเลขของกะที่มีข้อมูล 3% ต้องไม่ดูเหมือนกะปกติ
 *   3. ปุ่มรับเวรเขียนข้อมูล ต้องผ่าน can() และบอกเหตุผลเมื่อกดไม่ได้ (CLAUDE.md)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { BOARDS, DEFAULT_LAYOUTS, COLS, reconcile } from "../src/lib/layout/presets.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("../src/pages/ShiftReport.jsx");
const chart = read("../src/components/report/ReportChart.jsx");
const sidebar = read("../src/components/layout/AppSidebar.jsx");
const nav = read("../src/components/layout/sideNav.js");
const app = read("../src/App.jsx");
const blockIds = [...page.matchAll(/<Block id="(\w+)"/g)].map((m) => m[1]);

test("มีเมนูในแผงที่ผู้ใช้เห็นจริง + เมนูของ SideLayout + เส้นทาง", () => {
  assert.match(sidebar, /to: "\/dashboard\/shift-report", label: "รายงานส่งเวร"/);
  assert.match(nav, /to: "\/dashboard\/shift-report", label: "รายงานส่งเวร"/);
  assert.match(app, /<Route path="shift-report" element=\{<ShiftReport \/>\} \/>/);
});

test("ห่อด้วย PageBoard และทุกกล่องมีตำแหน่งตั้งต้นที่ไม่ล้นขอบ", () => {
  assert.match(page, /const BOARD_ID = "shift"/);
  assert.ok(BOARDS.shift, "ขาดชื่อกระดานใน BOARDS");
  for (const id of new Set(blockIds)) {
    const box = DEFAULT_LAYOUTS.shift[id];
    assert.ok(box, `ขาดตำแหน่งตั้งต้นของกล่อง ${id}`);
    assert.ok(box.x + box.w <= COLS, `กล่อง ${id} ล้นขอบขวา`);
  }
});

test("กล่องวางแล้วไม่ทับกัน · ตอนต่อข้อมูลไม่ได้เหลือกล่องเดียวอยู่บนสุด", () => {
  const ids = [...new Set(blockIds)];
  const layout = reconcile(DEFAULT_LAYOUTS.shift, ids, DEFAULT_LAYOUTS.shift);
  const boxes = ids.map((id) => ({ id, ...layout[id] }));
  for (const a of boxes) {
    for (const b of boxes) {
      if (a.id >= b.id) continue;
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      assert.ok(apart, `กล่อง ${a.id} กับ ${b.id} ทับกัน`);
    }
  }
  assert.equal(reconcile(DEFAULT_LAYOUTS.shift, ["pick"], DEFAULT_LAYOUTS.shift).pick.y, 0);
});

test("บอกความครบของข้อมูลและช่วงที่ขาดบนจอ · กราฟเว้นรอยขาด ไม่ลากเส้นข้าม", () => {
  assert.match(page, /ข้อมูลครบ \{pct\}% ของกะ/);
  assert.match(page, /ข้อมูลขาด \{n\} ช่วง/);
  assert.match(chart, /connectNulls=\{false\}/);
});

test("ปุ่มรับเวรผ่าน can(\"record.write\") และมี AdminNote เมื่อกดไม่ได้", () => {
  assert.match(page, /allowed=\{can\("record\.write"\)\}/);
  assert.match(page, /<AdminNote action="record\.write">/);
});

test("กล่องข้อจำกัดบอกว่าบันทึกที่ยังค้างในเครื่องใครสักคนไม่อยู่ในรายงาน (T1.269)", () => {
  /* v1 บอกว่า "บันทึกของคนยังไม่อยู่ในรายงาน" — v2 อ่านจากระบบกลางแล้ว เหลือแค่ของที่ยังไม่ย้ายขึ้น */
  assert.match(page, /บันทึกที่ยังค้างอยู่ในเครื่องของใครสักคน/);
  assert.match(page, /<Block id="records"/);
});
