/**
 * ผู้ดูแลระบบเปลี่ยนสิทธิ์ของใคร หน้าจอของคนนั้นต้องเปลี่ยนตาม (T1.257)
 *
 * เดิมหน้าเว็บถาม /auth/me แค่ตอนเปิดแอป — ลดสิทธิ์ใครแล้ว เซิร์ฟเวอร์กันทันทีก็จริง
 * แต่ปุ่มกับป้ายสิทธิ์บนจอของคนนั้นยังเป็นของเดิมจนกว่าจะรีเฟรชเอง
 * เทสต์นี้อ่านซอร์สตรง ๆ กันไม่ให้ตัวถามซ้ำหลุดหายไปตอนแก้ไฟล์
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const provider = read("../src/lib/auth/AuthProvider.jsx");
const client = read("../src/lib/api/client.js");
const authApi = read("../src/lib/auth/authApi.js");
const app = read("../src/App.jsx");

test("AuthProvider ถามเซิร์ฟเวอร์ซ้ำเป็นระยะ ตอนกลับมาที่แท็บ และตอนโดนปฏิเสธ", () => {
  assert.match(provider, /setInterval\(/);
  assert.match(provider, /addEventListener\("focus", check\)/);
  assert.match(provider, /addEventListener\("visibilitychange"/);
  assert.match(provider, /addEventListener\(AUTH_STALE_EVENT, check\)/);
});

test("ตัวเรียก API ยิงอีเวนต์เมื่อได้ 401/403 ตอนถือ token อยู่ — ทุกเมธอดผ่านตัวเดียวกัน", () => {
  assert.match(client, /authToken && \(res\.status === 401 \|\| res\.status === 403\)/);
  assert.equal((client.match(/throw await toApiError\(res\)/g) ?? []).length, 3);
});

test("ต่อไม่ติดต้องไม่เตะออกจากระบบ — ออกเฉพาะตอนเซิร์ฟเวอร์ตอบ 401", () => {
  assert.match(authApi, /err\.status === 401 \? "unauthorized" : "error"/);
  assert.match(provider, /res\.status === "unauthorized"/);
});

test("มีประกาศบอกเหตุผลบนจอ วางไว้นอก Routes", () => {
  assert.match(app, /<RoleNotice \/>/);
  assert.match(provider, /setRoleNotice\(\{ kind: "changed"/);
});
