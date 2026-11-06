/**
 * กติกาแจ้งเตือนของแบบจำลองโรงเรือน (T1.264)
 *
 * กติกานี้ตัดสินว่าคนเลี้ยงจะโดนปลุกกลางดึกหรือไม่ — เตือนพร่ำเพรื่อคนจะเลิกเชื่อ
 * เตือนช้าไปหมูเครียดแล้ว ต้องมีเทสต์คุมทุกเงื่อนไข
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { deviationDecision, residualTone, isStuck } from "../server/src/twin/decide.js";
import { alertText } from "../src/lib/api/alertText.js";

const TH = { warn: 2, serious: 3 };
/** ส่วนต่าง (จริง − แบบจำลอง) ของแต่ละช่อง → รูปแบบเดียวกับ rollingForecast */
const series = (...residuals) => residuals.map((r) => ({ actual: 25 + r, twin: 25 }));

test("ร้อนกว่าที่คาดเกินเกณฑ์ติดกัน 3 ช่อง → เปิดแจ้งเตือน", () => {
  const d = deviationDecision(series(0, 2.5, 2.4, 2.6), TH);
  assert.equal(d.action, "open");
  assert.equal(d.level, "warning");
  assert.ok(Math.abs(d.residual - 2.6) < 1e-9);
});

test("ช่องล่าสุดเกินเกณฑ์รุนแรง → ระดับรุนแรง", () => {
  assert.equal(deviationDecision(series(2.5, 2.8, 3.4), TH).level, "serious");
});

test("เกินแค่ช่องสองช่อง (ค่ากระโดดชั่ววูบ) → ยังไม่เปิด และไม่ปิดของเดิม", () => {
  assert.equal(deviationDecision(series(0.5, 2.5, 2.6), TH).action, "hold");
});

test("กลับมาไม่เกินเกณฑ์ → ปิดอัตโนมัติ", () => {
  assert.equal(deviationDecision(series(2.5, 2.6, 1.2), TH).action, "resolve");
});

test("เย็นกว่าที่คาดมากแค่ไหนก็ไม่เตือน", () => {
  assert.equal(deviationDecision(series(-5, -5, -5), TH).action, "resolve");
});

test("จุดที่แบบจำลองยังไม่มีค่า (ช่วงเริ่ม 3 ชม.) ไม่ถูกนับ", () => {
  const s = [{ actual: 30, twin: null }, { actual: 30, twin: null }, ...series(2.5, 2.5)];
  assert.equal(deviationDecision(s, TH).action, "hold");
  assert.equal(deviationDecision([], TH).action, "hold");
});

test("ระดับบนหน้าจอใช้เกณฑ์เดียวกับแจ้งเตือน (2× และ 3× ความคลาดเคลื่อน)", () => {
  assert.equal(residualTone(1.9, 1), "good");
  assert.equal(residualTone(-2.1, 1), "warning");
  assert.equal(residualTone(3.1, 1), "serious");
  assert.equal(residualTone(null, 1), "offline");
});

test("เซนเซอร์ค้าง = ค่ามามากพอ แต่ไม่ซ้ำแค่ค่าเดียว · ค่าน้อยเกินไม่นับ (นั่นคือเงียบ)", () => {
  assert.equal(isStuck({ n: 1000, distinct: 1 }), true);
  assert.equal(isStuck({ n: 1000, distinct: 2 }), false);
  assert.equal(isStuck({ n: 5, distinct: 1 }), false);
});

test("ข้อความแจ้งเตือนจากแบบจำลองอ่านรู้เรื่อง และบอกว่าเป็นเซนเซอร์ในหรือนอกเล้า", () => {
  const hot = alertText({
    code: "twin_hotter",
    metric: "twin",
    params: { metric: "temp_c", value: 29.4, expected: 26.1, residual: 3.3 },
  });
  assert.equal(hot.title, "ร้อนกว่าที่แบบจำลองคาด");
  assert.match(hot.detail, /29\.4.*26\.1/);

  const stuck = alertText({
    code: "sensor_stuck",
    metric: "stuck:SENSOR-OUT:temp_c",
    params: { metric: "temp_c", value: 24.8, device: "SENSOR-OUT", outdoor: true, hours: 142 },
  });
  assert.equal(stuck.title, "เซนเซอร์นอกเล้าค่าค้าง");
  assert.match(stuck.detail, /24\.8.*142.*SENSOR-OUT/);
});

test("คีย์แปลของข้อความแจ้งเตือนจากแบบจำลองมีครบทั้งอังกฤษและจีน", () => {
  const en = readFileSync(new URL("../src/lib/i18n/en.js", import.meta.url), "utf8");
  const zh = readFileSync(new URL("../src/lib/i18n/zh.js", import.meta.url), "utf8");
  for (const key of [
    "ร้อนกว่าที่แบบจำลองคาด",
    "เซนเซอร์นอกเล้าค่าค้าง",
    "เซนเซอร์ในเล้าค่าค้าง",
    "วัดได้ {value} แต่แบบจำลองคาด {expected} — ตรวจพัดลม ระบบทำความเย็น และประตูที่อาจเปิดค้าง",
    "ส่งค่า {value} ซ้ำเดิมมา {hours} ชม. — ไม่ได้วัดจริง ตรวจตัวเซนเซอร์ {device}",
  ]) {
    assert.ok(en.includes(`"${key}":`), `อังกฤษขาด: ${key}`);
    assert.ok(zh.includes(`"${key}":`), `จีนขาด: ${key}`);
  }
});

test("สะพานเรียกแจ้งเตือนจากแบบจำลองแยก try ของตัวเอง — พังแล้วต้องไม่ลากแจ้งเตือนหลักไปด้วย", () => {
  const bridge = readFileSync(new URL("../server/src/bridge/index.js", import.meta.url), "utf8");
  const main = bridge.indexOf("await runAlertPass()");
  const twin = bridge.indexOf("await runTwinAlertPass(");
  assert.ok(main > 0 && twin > main, "ต้องเรียกหลังแจ้งเตือนหลัก");
  const between = bridge.slice(main, twin);
  assert.match(between, /catch \(err\)[\s\S]*try \{/);
});
