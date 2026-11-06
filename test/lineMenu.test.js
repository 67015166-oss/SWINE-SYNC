/**
 * เมนู 6 ปุ่มบนไลน์ (T1.277) — เทสต์ส่วนที่ไม่แตะฐานข้อมูล
 *
 * สิ่งที่ต้องกันไว้:
 *   · ลิงก์ต้องมี `#` เสมอ — เว็บที่โฮสต์ใช้ HashRouter ลืมแล้วได้หน้า 404 ของโฮสต์
 *   · สถานะ "ปกติ/เฝ้าระวัง/ผิดปกติ" ต้องมาจากเกณฑ์จริง ไม่ใช่เดา
 *   · คำแนะนำต้องไม่ว่าง และต้องบอกตัวเลขที่ทำให้เกิดคำแนะนำนั้น
 *   · ค่าล่าสุดที่เก่าเกินไปต้องถูกทักเสมอ ไม่งั้นคนเชื่อเลขเก่าว่าเป็นตอนนี้
 */
import test from "node:test";
import assert from "node:assert/strict";

import { dashLink, PAGES } from "../server/src/line/links.js";
import { barnStatus, dailyActions, thiLevel, thiOf } from "../server/src/line/advice.js";
import { detectIntent, parsePostback, postbackData } from "../server/src/line/intent.js";

const BASE = "https://lab.plotnexuslab.com/p/mew/dashboard/";

/* ---------- ลิงก์ ---------- */

test("ลิงก์ทุกหน้าต้องมี # คั่น เพราะเว็บที่โฮสต์ใช้ HashRouter", () => {
  for (const page of Object.keys(PAGES)) {
    const url = dashLink(page, BASE);
    assert.match(url, /\/#\/dashboard/, `${page} ต้องมี /#/dashboard`);
  }
  assert.equal(dashLink("alerts", BASE), `${BASE}#/dashboard/alerts`);
  /* ไม่มีทับท้ายก็ต้องได้ผลเดียวกัน */
  assert.equal(dashLink("alerts", BASE.replace(/\/$/, "")), `${BASE}#/dashboard/alerts`);
});

test("ไม่ได้ตั้ง DASHBOARD_URL ต้องคืน null ไม่ใช่ลิงก์เสีย", () => {
  assert.equal(dashLink("home", ""), null);
  assert.equal(dashLink("home", undefined), null);
});

/* ---------- ปุ่มเมนู ---------- */

test("คำที่ปุ่มเมนูส่งมาต้องเข้าเมนูให้ถูกทุกปุ่ม", () => {
  assert.equal(detectIntent("เปิดแดชบอร์ด"), "dashboard");
  assert.equal(detectIntent("ดูแจ้งเตือน"), "alerts");
  assert.equal(detectIntent("ดูข้อมูลสภาพแวดล้อม"), "env");
  assert.equal(detectIntent("ดูข้อมูลสุกร"), "pigs");
  assert.equal(detectIntent("ดูรายงานประจำวัน"), "daily");
  assert.equal(detectIntent("ผู้ช่วย AI"), "assistant");
  assert.equal(detectIntent("เลือกฟาร์ม"), "pick");
  assert.equal(detectIntent("เปลี่ยนโรงเรือน"), "pick");
});

test("ข้อมูลที่ติดมากับปุ่มในการ์ดต้องอ่านกลับได้ตรง", () => {
  assert.deepEqual(parsePostback(postbackData("farm", "F-KPP")), { action: "farm", code: "F-KPP" });
  assert.deepEqual(parsePostback(postbackData("pick")), { action: "pick", code: null });
  assert.equal(parsePostback("ขยะ"), null);
  assert.equal(parsePostback(undefined), null);
});

/* ---------- สถานะและคำแนะนำ ---------- */

const limits = { temp_c: { min: 22, max: 28 }, humidity: { min: 50, max: 70 } };

test("ค่าอยู่ในเกณฑ์ = ปกติ และไม่มีข้อควรระวัง", () => {
  /* 24 °C / 60% → THI 71.4 = สบายตัว · จงใจเลือกค่าที่ THI ไม่เตือนด้วย
     (26 °C / 65% ได้ THI 74.7 ซึ่ง "เริ่มเครียด" แล้ว — ถูกของมันแต่ไม่ใช่กรณีที่จะทดสอบตรงนี้) */
  const s = barnStatus({ temp: 24, humidity: 60, limits, ageMinutes: 2 });
  assert.equal(s.tone, "good");
  assert.deepEqual(s.cautions, []);
});

test("อุณหภูมิเกินเพดาน = ผิดปกติ พร้อมบอกว่าเกินเท่าไรและต้องทำอะไร", () => {
  const s = barnStatus({ temp: 31.5, humidity: 65, limits, ageMinutes: 1 });
  assert.equal(s.tone, "bad");
  assert.match(s.cautions[0], /อุณหภูมิสูงกว่าเกณฑ์ 3.5 °C/);
  assert.match(s.cautions[0], /พัดลม|สเปรย์/);
});

test("ความชื้นเกินเพดานต้องถูกจับด้วย", () => {
  const s = barnStatus({ temp: 26, humidity: 86, limits, ageMinutes: 1 });
  assert.equal(s.tone, "bad");
  assert.ok(s.cautions.some((c) => /ความชื้นสูงกว่าเกณฑ์ 16%/.test(c)));
});

test("ค่าล่าสุดเก่าเกิน 15 นาที ต้องเตือนเสมอ แม้ตัวเลขจะดูปกติ", () => {
  const s = barnStatus({ temp: 26, humidity: 65, limits, ageMinutes: 90 });
  assert.equal(s.tone, "warn");
  assert.ok(s.cautions.some((c) => /ค่าล่าสุดเก่า 90 นาที/.test(c)));
});

test("ไม่มีค่าเลย ต้องไม่บอกว่าปกติ", () => {
  const s = barnStatus({ temp: null, humidity: null, limits });
  assert.notEqual(s.tone, "good");
  assert.match(s.headline, /ไม่มีค่า/);
});

test("เซนเซอร์ค้างต้องขึ้นเป็นข้อควรระวัง พร้อมชื่ออุปกรณ์", () => {
  const s = barnStatus({
    temp: 26, humidity: 65, limits, ageMinutes: 1,
    alerts: [{ code: "sensor_stuck", params: { device: "SENSOR-OUT" } }],
  });
  assert.equal(s.tone, "warn");
  assert.ok(s.cautions.some((c) => c.includes("SENSOR-OUT")));
});

test("THI คำนวณตรงกับสูตรของหน้าเว็บ และแบ่งระดับถูก", () => {
  assert.equal(thiOf(28, 86), Number((0.8 * 28 + 0.86 * (28 - 14.4) + 46.4).toFixed(1)));
  assert.equal(thiLevel(70).tone, "good");
  assert.equal(thiLevel(76).label, "เริ่มเครียด");
  assert.equal(thiLevel(81).label, "เครียดปานกลาง");
  assert.equal(thiLevel(85).label, "เครียดรุนแรง");
  assert.equal(thiOf(null, 80), null);
});

test("คำแนะนำประจำวันต้องไม่ว่าง และเหตุวิกฤตต้องมาก่อนเสมอ", () => {
  const status = barnStatus({ temp: 31, humidity: 65, limits, ageMinutes: 1 });
  const actions = dailyActions({
    status,
    openAlerts: [{ level: "critical" }, { level: "warning" }],
    coveragePct: 42,
  });
  assert.match(actions[0], /วิกฤต 1 รายการ/);
  assert.ok(actions.some((a) => /ข้อมูลเมื่อวานเข้ามาแค่ 42%/.test(a)));

  const calm = dailyActions({ status: barnStatus({ temp: 24, humidity: 60, limits, ageMinutes: 1 }), openAlerts: [], coveragePct: 95 });
  assert.deepEqual(calm, ["ไม่มีรายการเร่งด่วน ดูแลตามปกติ"]);
});
