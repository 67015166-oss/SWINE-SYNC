/**
 * ป้ายบอกที่มาของข้อมูล (T1.281)
 *
 * เหตุที่ต้องมี: หน้าภาพรวมโชว์ตัวเลขรวมทุกฟาร์ม แต่มีฟาร์มที่ต่อเซนเซอร์จริงอยู่ฟาร์มเดียว
 * ก่อนหน้านี้ไม่มีอะไรบอกเลยว่าเลขไหนเชื่อได้ — คนเห็น "กำไรเดือนล่าสุด" แล้วเข้าใจว่าเป็นของจริง
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { blendSource } from "../src/lib/records/dataSource.js";

test("มีทั้งของจริงและตัวอย่าง = ต้องบอกว่าผสมกัน ห้ามเลือกข้างใดข้างเดียว", () => {
  assert.equal(blendSource(true, true), "mixed");
});

test("มีอย่างเดียวก็ตอบตรง ๆ", () => {
  assert.equal(blendSource(true, false), "live");
  assert.equal(blendSource(false, true), "demo");
});

test("ไม่มีข้อมูลเลยต้องเป็น demo ไม่ใช่ live — ห้ามอ้างว่าเป็นของจริงเมื่อไม่มีอะไรยืนยัน", () => {
  assert.equal(blendSource(false, false), "demo");
});

test("ป้ายรองรับทั้งสามสถานะ และทุกสถานะต้องมีทั้งไอคอนและข้อความ", () => {
  const badge = readFileSync(new URL("../src/components/ui/DataSourceBadge.jsx", import.meta.url), "utf8");
  for (const kind of ["live", "mixed", "demo"]) {
    assert.ok(badge.includes(`${kind}:`), `ป้ายยังไม่รองรับสถานะ ${kind}`);
  }
  /* ห้ามสื่อด้วยสีอย่างเดียว — ต้องมี Icon และข้อความคู่กันเสมอ (กติกาใน CLAUDE.md) */
  assert.match(badge, /<Icon name=\{ICON\[kind\]\}/);
  assert.match(badge, /LABEL\[kind\]/);
});

test("ทุกกล่องสรุปในหน้าภาพรวมต้องประกาศที่มาของข้อมูล", () => {
  /* กันคนเพิ่มกล่องใหม่แล้วลืมติดป้าย ซึ่งจะกลับไปเป็นปัญหาเดิมทันที */
  const page = readFileSync(new URL("../src/pages/Overview.jsx", import.meta.url), "utf8");
  const tiles = page.slice(page.indexOf("const TILES = "), page.indexOf("export default"));
  const labels = (tiles.match(/^    label: /gm) ?? []).length;
  const sources = (tiles.match(/^    source: /gm) ?? []).length;
  assert.ok(labels > 0, "หากล่องสรุปใน TILES ไม่เจอ");
  assert.equal(sources, labels, `มี ${labels} กล่อง แต่ประกาศที่มาไว้ ${sources} กล่อง`);
});

test("ทุกหน้าที่โชว์ตัวเลขจากข้อมูลตัวอย่างล้วน ต้องมีคำอธิบายบอกผู้ใช้ (T1.283)", () => {
  /* หน้าการเงินคือใบที่อันตรายที่สุด — กำไรขาดทุนเป็นเลขที่คนเชื่อทันทีโดยไม่สงสัย
     ก่อนหน้านี้ทั้งหน้าเป็นเลขสมมติโดยไม่มีอะไรบอกเลยสักจุด */
  for (const page of ["Finance", "Herd", "Feed", "Cameras", "Overview"]) {
    const src = readFileSync(new URL(`../src/pages/${page}.jsx`, import.meta.url), "utf8");
    assert.match(src, /<DataSourceNote/, `หน้า ${page} ยังไม่มีคำอธิบายที่มาของข้อมูล`);
  }
});

test("หน้าที่อ่านจาก data/mock ล้วน ต้องติดป้ายกล่องตัวเลขว่าเป็นข้อมูลตัวอย่าง", () => {
  for (const page of ["Finance", "Herd", "Feed"]) {
    const src = readFileSync(new URL(`../src/pages/${page}.jsx`, import.meta.url), "utf8");
    const tiles = (src.match(/<StatTile/g) ?? []).length;
    /* นับเฉพาะป้ายที่อยู่ในกล่องตัวเลข — `<DataSourceNote source="demo">` ของทั้งหน้าไม่นับ */
    const tagged = (src.match(/<StatTile\s+source="demo"/g) ?? []).length;
    assert.ok(tiles > 0, `หน้า ${page} ไม่มีกล่องตัวเลข`);
    assert.equal(tagged, tiles, `หน้า ${page} มีกล่อง ${tiles} ใบ แต่ติดป้าย ${tagged} ใบ`);
  }
});

test("คำอธิบายต้องเป็น component กลาง ไม่ใช่ต่างหน้าต่างเขียนกล่องเอง", () => {
  /* ถ้าแต่ละหน้าเขียนกล่องของตัวเอง ข้อความกับหน้าตาจะเพี้ยนจากกันภายในไม่กี่เดือน */
  const note = readFileSync(new URL("../src/components/ui/DataSourceNote.jsx", import.meta.url), "utf8");
  assert.match(note, /className="source-note"/);
  const overviewCss = readFileSync(new URL("../src/pages/Overview.css", import.meta.url), "utf8");
  assert.doesNotMatch(overviewCss, /ov-source-note/, "ยังมี CSS ของเดิมค้างอยู่ในหน้าภาพรวม");
});
