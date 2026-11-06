/**
 * บันทึกการเข้าใช้งานกับช่อง "เข้าล่าสุด" ต้องมาจากที่เดียวกัน (T1.255)
 *
 * เจอจริง 15 ก.ย. 2569: หน้าตั้งค่าจดบันทึกไว้ใน localStorage ของเบราว์เซอร์เอง
 * ส่วนหน้าจัดการผู้ใช้อ่าน auth_event ของเซิร์ฟเวอร์ — เข้าจากอีกหน้าต่างหนึ่งแล้วเวลาสองที่ไม่ตรงกัน
 * เทสต์นี้อ่านซอร์สตรง ๆ กันไม่ให้ใครย้อนกลับไปจดในเครื่องอีก
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const authRoute = read("../server/src/modules/auth/route.js");
const usersRoute = read("../server/src/modules/users/route.js");
const modal = read("../src/components/settings/SettingsModal.jsx");
const provider = read("../src/lib/auth/AuthProvider.jsx");
const sessions = read("../src/lib/auth/sessions.js");

test("ช่องเข้าล่าสุดกับบันทึกการเข้าใช้งานอ่านตาราง auth_event ทั้งคู่", () => {
  assert.match(usersRoute, /from auth_event/);
  assert.match(authRoute, /authRouter\.get\("\/events", requireAuth/);
  assert.match(authRoute.slice(authRoute.indexOf('"/events"')), /from auth_event/);
});

test("ผู้ดูแลระบบเห็นทุกบัญชี คนอื่นเห็นเฉพาะของตัวเอง", () => {
  const route = authRoute.slice(authRoute.indexOf('"/events"'));
  assert.match(route, /roleAtLeast\(req\.user, "admin"\)/);
  assert.match(route, /e\.user_id = \$2/);
});

test("หน้าตั้งค่าอ่านบันทึกจากเซิร์ฟเวอร์ และไม่มีปุ่มล้างบันทึก", () => {
  assert.match(modal, /useAuthEvents\(/);
  assert.doesNotMatch(modal, /clearHistory|ล้างบันทึก"\)/);
});

test("ไม่มีการจดบันทึกเข้า/ออกลง localStorage ของเครื่องอีก", () => {
  assert.doesNotMatch(provider, /logEvent|readLog|setHistory/);
  assert.doesNotMatch(sessions, /export function logEvent|export const readLog/);
});

/* ---------- เน็ตสะดุดตอนเปิดแอป ต้องไม่เตะออกจากระบบ (T1.313) ---------- */

test("ตอนเปิดแอปต้องแยก “ถูกปฏิเสธ” ออกจาก “ต่อไม่ติด”", () => {
  /* ★ ของเดิม `fetchMe()` คืน null ทุกกรณีที่ล้ม แล้ว AuthProvider เอาไปลบ token ทิ้ง
     ผลคือเน็ตสะดุดครั้งเดียว = หลุดออกจากระบบถาวร และหน้าจอกลับไปแสดงข้อมูลตัวอย่างเงียบ ๆ
     อาการที่ผู้ใช้เจอ: "ฟาร์มจริงหายไปบ้างขึ้นบ้าง รีเฟรชแล้วไม่เหมือนเดิม" */
  const api = readFileSync(new URL("../src/lib/auth/authApi.js", import.meta.url), "utf8");
  const fetchMeBody = api.slice(api.indexOf("export async function fetchMe"), api.indexOf("export async function checkMe"));
  assert.match(fetchMeBody, /return checkMe\(\)/, "fetchMe ต้องใช้ checkMe ที่แยกสองกรณีแล้ว");
  assert.doesNotMatch(fetchMeBody, /return null/, "ห้ามกลับไปคืน null ทุกกรณีที่ล้ม");
});

test("ออกจากระบบตอนเปิดแอปได้เฉพาะตอนเซิร์ฟเวอร์ปฏิเสธชัด ๆ", () => {
  const prov = readFileSync(new URL("../src/lib/auth/AuthProvider.jsx", import.meta.url), "utf8");
  const boot = prov.slice(prov.indexOf("fetchMe().then"), prov.indexOf("fetchMe().then") + 1400);
  /* ลบ token ได้ก็ต่อเมื่ออยู่ในสาขา unauthorized เท่านั้น */
  const cut = boot.indexOf('status === "unauthorized"');
  assert.ok(cut > -1, "ต้องมีสาขา unauthorized");
  assert.equal(boot.slice(0, cut).includes("writeToken(null)"), false,
    "ห้ามลบ token ก่อนตรวจว่าเซิร์ฟเวอร์ปฏิเสธจริง");
});
