/**
 * คำขอที่ไปไม่ถึงเซิร์ฟเวอร์ต้องได้ข้อความไทยที่บอกทางออก (T1.349)
 *
 * ที่ต้องมีเทสต์นี้: `fetch` โยน `TypeError` ดิบ ๆ เมื่อต่อไม่ติด หน้าจอที่เอา
 * `err.message` ไปโชว์จึงขึ้นคำของเบราว์เซอร์ — Safari "Load failed" ·
 * Chrome "Failed to fetch" เรื่องเดียวกันแต่คนละคำ และไม่บอกว่าต้องทำอะไรต่อ
 *
 * ★ กับดักของการแก้เรื่องนี้คือ **เผลอกลืน AbortError ไปด้วย** ซึ่งพังเงียบ:
 *   หน้าจอหลายที่เช็ก `err.name === "AbortError"` เพื่อเงียบตอนผู้ใช้เปลี่ยนหน้า
 *   ถ้าแปลงเป็นข้อความผิดพลาด ผู้ใช้จะเห็นคำเตือนเด้งทุกครั้งที่กดเปลี่ยนหน้าเร็ว ๆ
 *   เทสต์ข้อสุดท้ายกันเรื่องนี้ไว้
 */
import test from "node:test";
import assert from "node:assert/strict";

import { toNetworkError } from "../src/lib/api/networkError.js";

test("ต่อเซิร์ฟเวอร์ไม่ติด — ได้ข้อความไทยที่บอกทางออก ไม่ใช่คำของเบราว์เซอร์", () => {
  for (const raw of ["Load failed", "Failed to fetch"]) {
    const err = toNetworkError(new TypeError(raw));
    assert.equal(err.code, "offline");
    assert.match(err.message, /ติดต่อเซิร์ฟเวอร์ไม่ได้/);
    assert.doesNotMatch(err.message, /Load failed|Failed to fetch/, `คำของเบราว์เซอร์หลุดออกมา: ${raw}`);
  }
});

test("เซิร์ฟเวอร์ไม่ตอบจนหมดเวลา — บอกว่าไม่ตอบ ไม่ใช่บอกว่าต่อไม่ติด", () => {
  const err = toNetworkError(Object.assign(new Error("timed out"), { name: "TimeoutError" }));
  assert.equal(err.code, "timeout");
  assert.match(err.message, /เซิร์ฟเวอร์ไม่ตอบ/);
});

test("ข้อความผิดพลาดต้องบอกว่าให้ทำอะไรต่อ ไม่ใช่บอกแค่ว่าพัง", () => {
  for (const err of [toNetworkError(new TypeError("x")),
                     toNetworkError(Object.assign(new Error(), { name: "TimeoutError" }))]) {
    /* สองทางออกที่ผู้ใช้ทำได้จริง */
    assert.match(err.message, /ลองใหม่/);
    assert.match(err.message, /แจ้งผู้ดูแลระบบ/);
  }
});

test("★ ผู้ใช้เปลี่ยนหน้าระหว่างโหลด — ต้องยังเป็น AbortError ตัวเดิม", () => {
  const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
  const out = toNetworkError(abortErr);
  assert.equal(out, abortErr, "ต้องเป็นตัวเดิม ไม่ใช่สร้างใหม่");
  assert.equal(out.name, "AbortError", "หน้าจอเช็กชื่อนี้เพื่อเงียบไว้ ห้ามแปลง");
});

test("error ชนิดอื่นต้องผ่านไปตามเดิม ไม่กลืนของที่ไม่เกี่ยว", () => {
  const other = new RangeError("บางอย่าง");
  assert.equal(toNetworkError(other), other);
});
