/**
 * หน้าภาพรวมอ่านจำนวนสุกรจากบันทึกจริง (T1.338)
 *
 * ═══ ที่มา ═══
 * ผู้ใช้ส่งรูปหน้าภาพรวมมาพร้อมคำว่า *"หน้านี้ก็ยังไม่ขึ้น"* (15 ต.ค. 2569)
 * กล่อง "จำนวนสุกรทั้งหมด" โชว์ 11,200 ซึ่งเป็นยอดของฟาร์มตัวอย่างล้วน ๆ
 * เพราะ `Overview.jsx` รับไว้เองในคอมเมนต์ว่า "หลังบ้านยังไม่ส่งค่านี้มา"
 * — ซึ่งจริง แต่เป็นคำตอบที่ผิดคำถาม: ยอดสุกรไม่เคยมาจากหลังบ้านเป็นก้อนเดียว
 * มันต้องคิดจากบันทึกเหตุการณ์ด้วยกติกาที่แยก "ยังไม่รู้" ออกจาก "ศูนย์" (lib/herdCount.js)
 *
 * ═══ สิ่งที่เทสต์ชุดนี้กัน ═══
 * ไม่ใช่ว่าเลขถูกไหม (ตัวคิดเลขมีเทสต์ของตัวเองใน herdCount.test.js แล้ว)
 * แต่กันสองอย่างที่พังเงียบ: **หน้าจอไม่เรียกตัวคิด** และ **สองหน้าถือกติกาคนละชุด**
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { barnCountTotal } from "../src/lib/herdCount.js";

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("★ หน้าภาพรวมต้องเรียกตัวนับจริง ไม่ใช่โชว์ยอดของข้อมูลตัวอย่างอย่างเดียว", () => {
  const page = src("pages/Overview.jsx");
  assert.match(page, /useBarnCounts\(/, "หน้าภาพรวมยังไม่เรียก useBarnCounts");
  /* ของจริงต้องมาก่อน ยอดตัวอย่างเป็นทางถอยเมื่อนับไม่ได้สักเล้า */
  assert.match(
    page,
    /live\.pigCount\.count \?\? summary\.pigs/,
    "ยอดตัวอย่างต้องเป็นทางถอย ไม่ใช่ตัวหลัก",
  );
  /* คอมเมนต์เดิมที่รับว่า "หลังบ้านยังไม่ส่งค่านี้มา" ต้องไม่เหลืออยู่ในฐานะเหตุผลที่ไม่ทำ */
  assert.ok(
    !/จำนวนสุกร: หลังบ้านยังไม่ส่งค่านี้มา/.test(page),
    "คอมเมนต์เดิมยังอ้างว่าทำไม่ได้ ทั้งที่ทำแล้ว",
  );
});

test("★★ กติกานับสุกรต้องมีชุดเดียวทั้งแอป — ห้ามสองหน้าถือคนละชุด", () => {
  /* นี่คือข้อที่สำคัญที่สุดในไฟล์นี้ ถ้าคัดลอกตรรกะไปเขียนซ้ำ สองหน้าจะตอบคำถาม
     เดียวกันคนละเลข **โดยไม่มีอะไรพังให้เห็น** ซึ่งแย่กว่าแอปพัง
     เพราะผู้ใช้ไม่มีทางรู้ว่าต้องเชื่อหน้าไหน */
  const hook = src("lib/records/useBarnCounts.js");
  assert.match(hook, /barnCount\(/);
  assert.match(hook, /barnCountTotal\(/);

  for (const page of ["pages/Overview.jsx", "pages/PigTypes.jsx"]) {
    const code = src(page);
    assert.match(code, /useBarnCounts/, `${page} ไม่ได้ใช้ตัวนับกลาง`);
    /* ★ จับ "การเรียกใช้" ไม่ใช่ "การเอ่ยถึง" — คอมเมนต์ที่อธิบายว่าตัวนับทำงานยังไง
       เป็นสิ่งที่ควรมี ไม่ใช่สิ่งที่ต้องห้าม */
    assert.ok(
      !/useHerdCounts\(/.test(code),
      `${page} ยังเรียก useHerdCounts เอง — ยิง API ซ้ำและเสี่ยงคิดเลขคนละแบบ`,
    );
    assert.ok(
      !/barnCountTotal\(/.test(code),
      `${page} ยังรวมยอดเอง แทนที่จะรับค่าจาก useBarnCounts`,
    );
  }
});

test("★ ยอดที่มีข้อมูลตัวอย่างปนแม้เล้าเดียว ต้องไม่ถูกป้ายว่าข้อมูลจริง", () => {
  /* หน้าภาพรวมรวมทุกฟาร์ม ฟาร์มจริงหนึ่ง + ฟาร์มตัวอย่างหนึ่ง = ยอดผสมเสมอ
     ถ้าป้ายตามฟาร์มจริง คนจะเอายอดที่มีเลขสมมติปนไปตัดสินใจ */
  const mixed = barnCountTotal([
    { count: 1198, from: "records" },
    { count: 11200, from: "demo" },
  ]);
  assert.equal(mixed.count, 12398);
  assert.equal(mixed.from, "demo", "ยอดผสมต้องรายงานแหล่งที่อ่อนที่สุด");
});

test("★ 'บันทึกในเครื่องนี้' ต้องไม่ถูกยุบเป็นข้อมูลจริงหรือข้อมูลตัวอย่าง", () => {
  /* เลขที่กรอกไว้ตอนยังไม่เข้าสู่ระบบ: คนกรอกเองจริง (ไม่ใช่ของสมมติ)
     แต่เครื่องอื่นไม่เห็น (ไม่ใช่ข้อมูลของระบบ) — ยุบไปทางไหนก็โกหกคนอ่าน
     บทเรียนตรงกับ T1.335 ที่ "เก็บลงเครื่อง" กับ "เก็บลงระบบ" หน้าตาเหมือนกันเป๊ะ */
  const page = src("pages/Overview.jsx");
  const map = page.match(/const PIG_SOURCE = \{[^}]*\}/)?.[0] ?? "";
  assert.match(map, /local:\s*"local"/, "local ถูกยุบไปเป็นป้ายอื่น");
  assert.match(map, /records:\s*"live"/);
  assert.match(map, /demo:\s*"demo"/);

  const badge = src("components/ui/DataSourceBadge.jsx");
  for (const kind of ["live", "mixed", "local", "demo"]) {
    assert.ok(badge.includes(`${kind}:`), `ป้ายยังไม่รองรับสถานะ ${kind}`);
  }
  /* ป้ายใหม่ต้องมีทั้งไอคอนและข้อความเหมือนป้ายอื่น ห้ามสื่อด้วยสีอย่างเดียว (กติกาใน CLAUDE.md) */
  assert.match(badge, /local: "monitor"/, "ป้าย local ไม่มีไอคอน");
});

test("นับไม่ครบต้องบอกเสมอ — ยอดที่ขาดต้องไม่ดูเหมือนยอดเต็ม", () => {
  const partial = barnCountTotal([
    { count: 500, from: "records" },
    { count: null, from: null },
    { count: null, from: null },
  ]);
  assert.equal(partial.knownBarns, 1);
  assert.equal(partial.unknownBarns, 2);

  const page = src("pages/Overview.jsx");
  assert.match(page, /unknownBarns > 0/, "กล่องสรุปไม่ได้บอกว่ายังนับไม่ครบ");
  assert.match(page, /ยังไม่รู้อีก \{u\} โรงเรือน/);
});
