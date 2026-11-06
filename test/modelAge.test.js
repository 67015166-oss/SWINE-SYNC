/**
 * "ภาพนิ่งคำทำนายเก่าแค่ไหน" ต้องถึงหน้าจอ (T1.343)
 *
 * ═══ ที่มา ═══
 * ตรวจเรื่องอื่นอยู่แล้วบังเอิญเปิดดูไฟล์คำทำนายของโมเดล พบว่าลงวันที่ 10 ก.ย. 2569
 * — **เก่า 39 วัน** — แต่หน้าสภาพอากาศไม่ขึ้นคำเตือนอะไรเลยสักคำ
 *
 * สาเหตุ: หน้าจอดูแต่ `stale` ที่ฝังมาในไฟล์ ซึ่ง**ตอบคนละคำถาม**
 *   `stale`      "ตอนโมเดลรัน ค่าเซนเซอร์ที่มันเห็นเก่าเกินไป"   → ท่อข้อมูลมีปัญหา
 *   อายุของไฟล์  "โมเดลรันไปนานแล้ว ไม่มีใครสั่งรันใหม่"        → ไม่มีใครเทรน
 * ข้อแรกมีป้ายเตือนอยู่แล้ว ข้อหลังไม่เคยมี ทั้งที่หลังบ้านส่ง `ageMinutes` มาให้
 * พร้อมคอมเมนต์ว่า "ห้ามกลืนหาย" — รับมาแล้ววางไว้เฉย ๆ
 *
 * ★ โมเดลนี้ทำนาย "ล่วงหน้า 1–24 ชม. นับจากตอนที่รัน" ไม่ใช่ "นับจากตอนนี้"
 *   ภาพนิ่งที่เก่ากว่าช่วงที่ทำนาย = เวลาที่ตัวเลขพูดถึงผ่านไปหมดแล้ว
 *   แต่ตัวเลขยังอ่านได้สวยเหมือนเดิม ไม่มีอะไรฟ้อง — เป็นความพังที่เงียบที่สุดแบบหนึ่ง
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { modelAge, horizonOf, DEFAULT_HORIZON_H } from "../src/lib/api/modelAge.js";

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("ไม่รู้อายุ ต้องตอบว่าไม่รู้ ห้ามเดาว่าสด", () => {
  /* ★ `Number(null)` คือ 0 ซึ่งผ่าน Number.isFinite แล้วกลายเป็น "เพิ่งคำนวณ"
     บั๊กชนิดเดียวกับ T1.341 — ค่าที่แปลว่า "ไม่รู้" ถูกกดให้เป็น "ศูนย์" */
  for (const v of [null, undefined, "", "abc", -5]) {
    assert.equal(modelAge(v).level, "unknown", `${JSON.stringify(v)} ต้องเป็น unknown`);
  }
  assert.equal(modelAge(null).hours, null);
});

test("เพิ่งคำนวณ = สด ไม่ต้องรบกวนคนอ่าน", () => {
  assert.equal(modelAge(0).level, "fresh");
  assert.equal(modelAge(59).level, "fresh");
  assert.equal(modelAge(5 * 60).level, "fresh");
});

test("เริ่มเก่าก่อนหมดอายุจริง จะได้เตือนทัน", () => {
  assert.equal(modelAge(6 * 60).level, "old");
  assert.equal(modelAge(23 * 60).level, "old");
});

test("เก่ากว่าช่วงที่ทำนาย = หมดอายุ เวลาที่พูดถึงผ่านไปแล้ว", () => {
  assert.equal(modelAge(24 * 60).level, "expired");
  /* ของจริงที่เจอ: ไฟล์ลงวันที่ 10 ก.ย. ตรวจเมื่อ 19 ต.ค. = 39 วัน */
  const got = modelAge(39 * 24 * 60);
  assert.equal(got.level, "expired");
  assert.equal(Math.round(got.hours), 936);
});

test("ช่วงที่ทำนายอ่านจากภาพนิ่งเอง ไม่ใช่ฝังเลขไว้ตายตัว", () => {
  const snap = { horizons: [{ horizon_h: 1 }, { horizon_h: 6 }, { horizon_h: 12 }] };
  assert.equal(horizonOf(snap), 12);
  /* โมเดลที่ทำนายสั้นกว่า ต้องหมดอายุเร็วกว่าด้วย */
  assert.equal(modelAge(13 * 60, horizonOf(snap)).level, "expired");
  assert.equal(modelAge(13 * 60, DEFAULT_HORIZON_H).level, "old");
});

test("ภาพนิ่งที่อ่านค่าไม่ได้ ต้องถอยไปใช้ค่าตั้งต้น ไม่ใช่พัง", () => {
  for (const bad of [null, undefined, {}, { horizons: [] }, { horizons: [{}] }]) {
    assert.equal(horizonOf(bad), DEFAULT_HORIZON_H);
  }
});

test("หน้าสภาพอากาศต้องใช้ ageMinutes ที่หลังบ้านส่งมา", () => {
  const page = src("pages/Weather.jsx");
  assert.match(page, /modelAge\(/);
  assert.match(page, /ageMinutes/);
  /* ต้องเตือนทั้งสองระดับ ไม่ใช่เตือนแต่ตอนหมดอายุแล้ว */
  assert.match(page, /age\.level === "expired"/);
  assert.match(page, /age\.level === "old"/);
});

test("ป้าย stale เดิมต้องยังอยู่ — มันตอบคนละคำถาม", () => {
  /* ถ้าวันหนึ่งมีคนเห็นว่าซ้ำซ้อนแล้วลบทิ้ง จะเหลือแต่เรื่องอายุไฟล์
     ส่วนเรื่อง "เซนเซอร์ไม่ส่งค่าแล้ว" จะหายไปเงียบ ๆ ทั้งที่อันตรายกว่า */
  assert.match(src("pages/Weather.jsx"), /model\.data\.stale/);
});
