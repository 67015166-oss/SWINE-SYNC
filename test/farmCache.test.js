/**
 * ฟาร์มจริงต้องไม่หายไปจากหน้าจอเพราะต่อหลังบ้านไม่ได้ (T1.314)
 *
 * สิ่งที่ต้องกันไว้ให้ได้:
 *   · ของเก่าเกินไปต้องไม่ถูกหยิบมาใช้ (ฟาร์มอาจถูกลบหรือเปลี่ยนชื่อไปแล้ว)
 *   · ของรุ่นเก่าที่รูปไม่ตรงต้องถูกทิ้ง ไม่ใช่แปลงจนพัง
 *   · **ต้องเก็บคำตอบดิบ ไม่ใช่ค่าที่แปลงแล้ว** ไม่งั้นจะกลายเป็นเอาค่าเก่ามาโชว์เป็นค่าปัจจุบัน
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { MAX_AGE_DAYS, isFresh } from "../src/lib/api/farmCache.js";

const days = (n) => n * 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-07T10:00:00+07:00").getTime();

test("ของที่จำไว้เมื่อวานยังใช้ได้", () => {
  assert.equal(isFresh(new Date(NOW - days(1)).toISOString(), NOW), true);
});

test("ของที่เก่าเกินเกณฑ์ต้องไม่ถูกหยิบมาใช้", () => {
  /* ฟาร์มอาจถูกลบหรือเปลี่ยนชื่อไปแล้ว แสดงของเก่าจะหลอกคนอ่าน */
  assert.equal(isFresh(new Date(NOW - days(MAX_AGE_DAYS + 1)).toISOString(), NOW), false);
});

test("ไม่มีเวลาหรือเวลาเพี้ยน ต้องถือว่าใช้ไม่ได้", () => {
  /* ★ ไม่รู้ว่าเก็บไว้เมื่อไร = บอกผู้ใช้ไม่ได้ว่าตัวเลขเก่าแค่ไหน จึงไม่ควรแสดง */
  assert.equal(isFresh(null, NOW), false);
  assert.equal(isFresh(undefined, NOW), false);
  assert.equal(isFresh("ไม่ใช่วันที่", NOW), false);
  assert.equal(isFresh(0, NOW), false);
});

test("เก็บคำตอบดิบ ไม่ใช่ค่าที่แปลงแล้ว", () => {
  /* ★ คำตอบดิบมี "เวลาที่วัด" ติดมาด้วย พอเอามาแปลงใหม่ตอนออฟไลน์
     ตัวแปลงจะเห็นว่าเก่าเกิน 15 นาที แล้วล้างค่าเป็นขีดกลางให้เอง
     ถ้าเก็บค่าที่แปลงแล้ว ต้องไปไล่ล้างเองทีละช่อง แล้ววันหนึ่งจะลืมช่องใดช่องหนึ่ง */
  const src = readFileSync(new URL("../src/lib/api/LiveFarmsProvider.jsx", import.meta.url), "utf8");
  assert.match(src, /saveFarmCache\(raw\)/, "ต้องเก็บตัวแปร raw ที่เป็นคำตอบดิบ");
  assert.match(src, /toBundles\(cached, /, "ตอนหยิบมาใช้ต้องแปลงใหม่ทุกครั้ง");
});

test("ตอนต่อไม่ได้ต้องบอกเวลาของข้อมูลที่แสดงอยู่", () => {
  /* แสดงฟาร์มค้างไว้โดยไม่บอกว่าตัวเลขเก่าแค่ไหน = ปัญหาเดิมที่ไล่แก้มาทั้งสัปดาห์ */
  const src = readFileSync(new URL("../src/lib/api/LiveFarmsProvider.jsx", import.meta.url), "utf8");
  assert.match(src, /cachedAt: cached\.capturedAt/);
});
