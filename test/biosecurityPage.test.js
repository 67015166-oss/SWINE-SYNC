/**
 * หน้าทำความสะอาด & ฆ่าเชื้อ (T1.292) — กันข้อพลาดที่ไม่มีอาการให้เห็น
 *
 * ของที่พังแบบเงียบ ๆ ในหน้านี้:
 *   - ไอคอนของทีม Farmy ที่ยังไม่ได้จับคู่ → `iconFor` คืน "info" เฉย ๆ
 *     หน้าไม่พัง ไม่มี error แต่กล่องความปลอดภัย 8 ด้านจะได้ไอคอนเหมือนกันหมด
 *     แล้วไอคอนก็เลิกเป็นเครื่องมือแยกหัวข้อไปเลย
 *   - ที่มา (SOURCE_NOTE) หลุดจากหน้าจอ → ผิดเงื่อนไขที่ทีม Farmy ให้เอาข้อมูลมาใช้
 *     และคนอ่านจะไม่รู้ว่าคำแนะนำอ้างจากอะไร
 *   - เหตุผลของแต่ละขั้น (`why`) ถูกตัดเพื่อประหยัดที่ → ขั้นที่ดูเสียเวลา
 *     (แช่น้ำ 2-4 ชม. · พักคอก 5-7 วัน) จะถูกลัดทุกครั้งที่งานรีบ
 *   - ป้ายความเสี่ยงของรถขึ้นเป็นเขียว → อ่านได้ว่ารถคันนั้นไม่ต้องล้าง
 *     ซึ่งตรงข้ามกับเนื้อหาทั้งหน้า
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BARN_STEPS,
  COMPONENTS,
  DISINFECTANTS,
  ROUTINE,
  SOURCE_NOTE,
  VEHICLE_RISK,
  VEHICLE_STEPS,
} from "../src/data/farmy/biosecurity.js";
import { iconFor } from "../src/data/farmy/icons.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const page = read("../src/pages/guide/Cleaning.jsx");

test("★ ไอคอนของทีม Farmy ที่หน้านี้ใช้ ต้องจับคู่ไว้ครบ", () => {
  /* ตกไปตัวเดียวก็ได้ไอคอน "info" มาแทนแบบไม่มีสัญญาณอะไรบอก */
  for (const c of COMPONENTS) {
    assert.notEqual(iconFor(c.icon), "info", `ยังไม่ได้จับคู่ไอคอน ${c.icon} (${c.title})`);
  }
  for (const r of ROUTINE) {
    assert.notEqual(iconFor(r.icon), "info", `ยังไม่ได้จับคู่ไอคอน ${r.icon} (${r.when})`);
  }
});

test("★ ที่มาของเนื้อหาต้องอยู่บนหน้าจอ", () => {
  /* เงื่อนไขที่ทีม Farmy ให้ยกข้อมูลมาใช้ — เขียนไว้ที่หัว biosecurity.js */
  assert.match(page, /SOURCE_NOTE/, "หน้าไม่ได้แสดงที่มาของเนื้อหา");
  assert.ok(SOURCE_NOTE.includes("มกอช"), "ตัวข้อความที่มาถูกแก้จนไม่อ้างมาตรฐานแล้ว");
});

test("★ ทุกขั้นต้องมีเหตุผล และหน้าต้องแสดงเหตุผลนั้น", () => {
  for (const s of [...BARN_STEPS, ...VEHICLE_STEPS]) {
    assert.ok(s.why?.length > 20, `ขั้น "${s.title}" ไม่มีเหตุผลกำกับ`);
  }
  assert.match(page, /step\.why/, "หน้าไม่ได้แสดงเหตุผลของแต่ละขั้น");
});

test("★ ป้ายความเสี่ยงของรถต้องไม่มีโทนเขียว", () => {
  /* รถทุกคันที่เข้าฟาร์มต้องล้าง — ป้ายเขียวว่า "ปกติ" จะอ่านได้ว่าไม่ต้องล้าง */
  const tone = page.slice(page.indexOf("const RISK_TONE"), page.indexOf("/** ขั้นตอนหนึ่งขั้น"));
  assert.doesNotMatch(tone, /"good"/, "มีระดับความเสี่ยงที่ขึ้นป้ายเขียว");
  /* ค่าที่หลุดตารางก็ต้องไม่กลายเป็นเขียว */
  assert.match(page, /RISK_TONE\[r\.level\] \?\? "warning"/, "ระดับที่ไม่รู้จักต้องไม่เป็นเขียว");
  for (const r of VEHICLE_RISK) {
    assert.ok(tone.includes(r.level), `ระดับ "${r.level}" ยังไม่มีในตารางโทนป้าย`);
  }
});

test("ขั้นตอนใช้เลขลำดับ ไม่ใช่ไอคอน", () => {
  /* สองรายการนี้คือลำดับงาน ข้ามขั้นแล้วขั้นหลังไม่ได้ผล เลขจึงต้องเป็นเครื่องหมายหลัก
     และเลขต้องเรียง 1..n จริง ไม่ใช่เลขที่ติดมากับข้อมูลแบบสุ่ม */
  assert.match(page, /gd-step-n/, "ไม่ได้แสดงเลขลำดับของขั้น");
  for (const list of [BARN_STEPS, VEHICLE_STEPS]) {
    assert.deepEqual(
      list.map((s) => s.n),
      list.map((_, i) => i + 1),
    );
  }
});

test("ข้อควรระวังของน้ำยาทุกกลุ่มต้องมี และต้องอยู่ในกล่องเน้น", () => {
  /* ของในนี้กัดผิวหนัง กัดโลหะ และเสื่อมฤทธิ์เงียบ ๆ — อ่านข้ามแล้วเสียของหรือเจ็บตัว */
  for (const d of DISINFECTANTS) {
    assert.ok(d.care?.length > 10, `น้ำยา "${d.name}" ไม่มีข้อควรระวัง`);
  }
  const css = read("../src/pages/guide/guide.css");
  /* `.gd-chem-care` ขึ้นสองที่ — ในกลุ่มที่แชร์ระยะ และกฎของตัวเองที่ใส่สีเน้น
     ต้องดูตัวหลัง จึงใช้ lastIndexOf ไม่ใช่ indexOf */
  const care = css.slice(css.lastIndexOf(".gd-chem-care {"));
  assert.match(care.slice(0, 300), /--status-warning-bg/, "ข้อควรระวังไม่ได้อยู่ในกล่องเน้น");
});

test("ทุกกล่องบนหน้าต้องมีที่วางในเลย์เอาต์ตั้งต้น", () => {
  /* กล่องที่ไม่มีในพรีเซ็ตจะถูกวางต่อท้ายแบบเดา ๆ ทับกล่องอื่นได้ */
  const preset = read("../src/lib/layout/presets.js");
  const block = preset.slice(preset.indexOf("guideCleaning: {"), preset.indexOf("routine: { x: 0, y: 127"));
  const ids = [...page.matchAll(/<Block id="([a-z]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 7, "จำนวนกล่องเปลี่ยน — ต้องอัปเดตเลย์เอาต์ตั้งต้นด้วย");
  for (const id of ids) {
    assert.ok(
      block.includes(`${id}: {`) || id === "routine",
      `กล่อง "${id}" ไม่มีในเลย์เอาต์ตั้งต้น guideCleaning`,
    );
  }
  assert.ok(preset.includes('guideCleaning: { id: "guideCleaning"'), "ยังไม่ได้ลงทะเบียนใน BOARDS");
});
