/**
 * วิธีที่ตัวส่งต่อโดเมนยอมให้ผ่าน มีแค่ GET กับ POST (T1.348)
 *
 * ตัวส่งต่อของผู้ให้บริการที่อยู่หน้าสุดตอบ 501 ให้ PUT/PATCH/DELETE ตั้งแต่ก่อนถึงกล่อง
 * ทำให้ **เขียนข้อมูลไม่ได้เลยเมื่อเปิดผ่านโดเมน** ทั้งที่รันในเครื่องแล้วใช้ได้ปกติ
 *
 * ★ เทสต์ชุดนี้จึงกันสองอย่าง
 *   1. หลังบ้านต้องแปลงกลับให้ถูก และ **ต้องไม่แปลงให้มากกว่าที่ควร**
 *   2. ฝั่งหน้าเว็บต้องยังส่งผ่าน POST อยู่ ไม่ใช่ย้อนกลับไปใช้ PUT ตรง ๆ ตอนรีแฟกเตอร์
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { methodOverride, OVERRIDE_HEADER } from "../server/src/lib/methodOverride.js";

/** คำขอปลอมแบบย่อ — `get()` ทำตัวเหมือนของ Express (ไม่สนตัวพิมพ์เล็กใหญ่) */
const reqOf = (method, headerValue) => ({
  method,
  headers: headerValue === undefined ? {} : { [OVERRIDE_HEADER]: headerValue },
  get(name) {
    return this.headers[String(name).toLowerCase()];
  },
});

const run = (req) => {
  let called = false;
  methodOverride(req, {}, () => { called = true; });
  assert.equal(called, true, "ต้องเรียก next() เสมอ ไม่ว่าจะแปลงหรือไม่");
  return req.method;
};

test("POST + หัวบอกวิธี → แปลงเป็นวิธีนั้น", () => {
  assert.equal(run(reqOf("POST", "PUT")), "PUT");
  assert.equal(run(reqOf("POST", "PATCH")), "PATCH");
  assert.equal(run(reqOf("POST", "DELETE")), "DELETE");
});

test("ตัวพิมพ์เล็กกับช่องว่างต้องใช้ได้ — ภาษาอื่นเขียนหัวคำขอไม่เหมือนกัน", () => {
  assert.equal(run(reqOf("POST", "patch")), "PATCH");
  assert.equal(run(reqOf("POST", "  delete  ")), "DELETE");
});

test("POST เปล่า ๆ ต้องยังเป็น POST", () => {
  assert.equal(run(reqOf("POST")), "POST");
  assert.equal(run(reqOf("POST", "")), "POST");
});

test("★ วิธีที่ไม่อยู่ในรายชื่อต้องไม่ถูกแปลง", () => {
  assert.equal(run(reqOf("POST", "TRACE")), "POST");
  assert.equal(run(reqOf("POST", "CONNECT")), "POST");
  assert.equal(run(reqOf("POST", "GET")), "POST");
  assert.equal(run(reqOf("POST", "OPTIONS")), "POST");
});

test("★★ แปลงได้เฉพาะคำขอที่เข้ามาเป็น POST — ไม่งั้น GET ที่แนบหัวนี้จะกลายเป็นคำสั่งลบ", () => {
  assert.equal(run(reqOf("GET", "DELETE")), "GET");
  assert.equal(run(reqOf("HEAD", "DELETE")), "HEAD");
  assert.equal(run(reqOf("OPTIONS", "PUT")), "OPTIONS");
});

test("คำขอที่ไม่มี req.get (ไม่ใช่ของ Express) ต้องไม่พัง", () => {
  const bare = { method: "POST", headers: { [OVERRIDE_HEADER]: "PATCH" } };
  methodOverride(bare, {}, () => {});
  assert.equal(bare.method, "PATCH");
});

/* ---------- ฝั่งหน้าเว็บ ---------- */

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const client = read("../src/lib/api/client.js");
const app = read("../server/src/app.js");

test("ตัวเรียก API ต้องห่อสามวิธีนั้นเป็น POST ไม่ใช่ยิงตรง", () => {
  assert.match(client, /VIA_POST = new Set\(\["PUT", "PATCH", "DELETE"\]\)/);
  assert.match(client, /"X-HTTP-Method-Override": method/);
  /* ★ ต้องไม่มี method ตายตัวเป็น PUT/PATCH/DELETE หลงเหลืออยู่ใน fetch */
  assert.doesNotMatch(client, /method: "(PUT|PATCH|DELETE)"/);
});

test("หลังบ้านต้องผูกตัวแปลงไว้ก่อนเส้นทางทั้งหมด", () => {
  const atUse = app.indexOf("app.use(methodOverride)");
  const atFirstRoute = app.indexOf('app.use("/api/auth"');
  assert.ok(atUse > 0, "ต้องเรียก app.use(methodOverride)");
  assert.ok(atUse < atFirstRoute, "ต้องวางก่อน router ตัวแรก ไม่งั้นเส้นทางที่มาก่อนจะไม่ได้รับการแปลง");
});

test("CORS ต้องยอมให้ส่งหัวนี้ข้ามโดเมนได้ด้วย", () => {
  assert.match(app, /Access-Control-Allow-Headers[\s\S]{0,120}X-HTTP-Method-Override/);
});
