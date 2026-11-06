/**
 * สะพานข้อมูลต้องทนต่อ InfluxDB ล่ม (T1.280)
 *
 * เหตุที่ต้องมี: 24 ก.ย. 2569 ย้ายระบบไปรันที่ box-mew ซึ่งต่อ InfluxDB บนเครื่องผู้พัฒนาไม่ได้
 * สะพานจบทันทีที่บรรทัด `await ping()` **แจ้งเตือนจึงเงียบสนิท** ทั้งที่ข้อมูลในฐานมีให้คิดอยู่แล้ว
 * และเรื่องเดียวกันเกิดบนเครื่องผู้พัฒนาได้ด้วยถ้า container ของ Influx ล่ม
 *
 * เทสต์นี้อ่านซอร์สเพราะการเรียก `main()` จริงต้องมีฐานข้อมูลกับเครือข่าย —
 * สิ่งที่ต้องคุมคือ **โครงของโค้ด** ไม่ใช่ค่าที่คำนวณได้
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../server/src/bridge/index.js", import.meta.url), "utf8");

test("ต่อ InfluxDB ไม่ได้ตอนเริ่ม ต้องไม่ทำให้สะพานตาย", () => {
  const main = src.slice(src.indexOf("async function main()"));
  const ping = main.indexOf("await ping()");
  assert.ok(ping > 0, "หา await ping() ใน main() ไม่เจอ");
  /* ต้องมี try เปิดก่อนถึงบรรทัด ping และมี catch รับไว้ */
  const before = main.slice(0, ping);
  assert.ok(before.lastIndexOf("try {") > before.lastIndexOf("}"), "await ping() ต้องอยู่ใน try");
  assert.match(main.slice(ping, ping + 600), /catch \(err\)/);
});

test("ซิงก์ Influx ล้ม ต้องไม่ลากให้แจ้งเตือน/ไลน์/เฝ้าระวังหยุดตาม", () => {
  const tick = src.slice(src.indexOf("async function tick()"), src.indexOf("async function main()"));
  /* ทั้งสี่ก้อนต้องมี try/catch ของตัวเอง — นับ catch ให้ครบตามจำนวนก้อน */
  assert.ok((tick.match(/} catch \(err\) {/g) ?? []).length >= 4,
    "ทุกก้อนงานใน tick() ต้องห่อ try ของตัวเอง (ซิงก์ · แจ้งเตือน · แบบจำลอง · ไลน์ · เฝ้าระวัง)");
  /* ลำดับสำคัญ: syncWindow ต้องอยู่ใน try ที่ปิดก่อนถึง runAlertPass */
  const sync = tick.indexOf("syncWindow");
  const alert = tick.indexOf("runAlertPass");
  const notify = tick.indexOf("runLineNotifier");
  const health = tick.indexOf("runHealthCheck");
  assert.ok(sync < alert && alert < notify && notify < health, "ลำดับงานใน tick() ผิด");
  const between = tick.slice(sync, alert);
  assert.match(between, /catch \(err\)/, "ระหว่างซิงก์กับคิดแจ้งเตือนต้องมี catch คั่น");
});

test("แบ่งบทบาทได้สามแบบ และพิมพ์ผิดต้องล้มดัง ๆ", () => {
  /* 24 ก.ย. 2569: box-mew ต่อออกไปหา InfluxDB บนเครื่องผู้พัฒนาไม่ได้ (tailscaled userspace รับเข้าทางเดียว)
     จึงต้องแยก — เครื่องผู้พัฒนาซิงก์ข้อมูล box-mew คิดแจ้งเตือนและส่งไลน์ */
  assert.match(src, /const ROLE = \(process\.env\.BRIDGE_ROLE \|\| "full"\)/);
  assert.match(src, /\["full", "sync", "alerts"\]\.includes\(ROLE\)/);
  /* ค่าผิดต้องออกด้วย exit(1) ไม่ใช่เดินเงียบ ๆ แบบไม่ทำอะไร — แจ้งเตือนหายแล้วตามไม่เจอ */
  assert.match(src, /process\.exit\(1\)/);
  assert.match(src, /const doesSync = ROLE === "full" \|\| ROLE === "sync"/);
  assert.match(src, /const doesAlerts = ROLE === "full" \|\| ROLE === "alerts"/);
  /* tick() ต้องกั้นทั้งสองก้อนด้วยบทบาท — ตัดคอมเมนต์ก่อนเทียบ ไม่งั้นจะไปจับชื่อฟังก์ชัน
     ที่คอมเมนต์พูดถึงแทนโค้ดจริง (ตัวเฝ้าเครื่องหลัก T1.285 แทรกเข้ามาก่อนสองบรรทัดนี้
     และมันตั้งใจไม่ผูกกับบทบาท — เทสต์ของมันอยู่ใน primaryWatch.test.js) */
  const tick = src
    .slice(src.indexOf("async function tick()"))
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(tick, /if \(doesSync\) await syncPass\(\);\s*\n\s*if \(doesAlerts\) await alertPass\(\);/);
});

test("บทบาท alerts ต้องไม่ทักทาย InfluxDB ตอนเริ่ม", () => {
  /* ไม่งั้นเครื่องที่ไม่มีหน้าที่ซิงก์จะรอ timeout ทุกครั้งที่บูตโดยไม่มีเหตุผล */
  const main = src.slice(src.indexOf("async function main()"));
  const gate = main.indexOf("if (doesSync) {");
  const ping = main.indexOf("await ping()");
  assert.ok(gate > 0 && gate < ping, "await ping() ต้องอยู่ใน if (doesSync)");
});

test("ส่งไลน์ต้องอยู่หลังการคิดแจ้งเตือนเสมอ", () => {
  /* ไม่งั้นเหตุที่เพิ่งเปิดรอบนี้ต้องรออีกรอบหนึ่งถึงจะถูกส่ง */
  assert.ok(src.indexOf("runAlertPass") < src.indexOf("runLineNotifier"));
});
