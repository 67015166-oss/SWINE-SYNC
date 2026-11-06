/**
 * ตัวส่งเข้า LINE (T1.275) — เทสต์เฉพาะส่วนที่ไม่แตะฐานข้อมูลและไม่ยิงเครือข่าย
 *
 * สิ่งที่ต้องกันไว้ให้ได้ เพราะพลาดแล้วเสียเงิน/เสียความน่าเชื่อถือ:
 *   · ส่งซ้ำ — รอบซิงก์เดินทุก 30 วินาที เหตุใบเดิมต้องไม่ถูกส่งสองครั้ง
 *   · ส่งของเก่า — คอนเทนเนอร์เพิ่งขึ้นต้องไม่ยิงเหตุค้างจากเมื่อวาน
 *   · ส่งระดับที่ไม่ได้ตกลงกันไว้ — ผู้ใช้เลือก "เฉพาะวิกฤต"
 *   · โหมดซ้อมต้องเป็นค่าตั้งต้น — ลืมตั้ง env แล้วต้องไม่ส่งออกจริง
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { alertFlex, alertText, dailyFlex, thaiDate } from "../server/src/line/flex.js";
import { ageText } from "../server/src/reports/shiftCalc.js";
import { DEFAULT_LEVELS, alertsToSend, bangkokDateKey, canSendMore, levelsFromEnv, parseTimeOfDay, shouldCooldown, shouldSendDaily, withinCooldown } from "../server/src/line/schedule.js";

const at = (iso) => new Date(iso);

/* ---------- เวลาไทย ---------- */

test("วันที่ในข้อความเป็นเวลาไทยและ พ.ศ. เสมอ ไม่ว่าเครื่องตั้งโซนอะไร", () => {
  /* 21 ก.ย. 2026 เวลา 00:30 UTC = 07:30 ตามเวลาไทยของวันเดียวกัน */
  assert.equal(thaiDate(at("2026-09-21T00:30:00Z")), "21 ก.ย. 2569");
  /* 20 ก.ย. 2026 เวลา 18:00 UTC = 21 ก.ย. 01:00 เวลาไทย — ต้องเป็นวันที่ 21 ไม่ใช่ 20 */
  assert.equal(thaiDate(at("2026-09-20T18:00:00Z")), "21 ก.ย. 2569");
  assert.equal(bangkokDateKey(at("2026-09-20T18:00:00Z")), "2026-09-21");
});

test("เวลาที่ตั้งได้ต้องเป็นรูปแบบ HH:MM เท่านั้น", () => {
  assert.equal(parseTimeOfDay("07:30"), 450);
  assert.equal(parseTimeOfDay("23:59"), 1439);
  assert.equal(parseTimeOfDay("24:00"), null);
  assert.equal(parseTimeOfDay("7.30"), null);
  assert.equal(parseTimeOfDay(undefined), null);
});

/* ---------- ตารางเวลาสรุปประจำวัน ---------- */

test("สรุปประจำวันส่งได้วันละครั้ง", () => {
  const now = at("2026-09-21T01:00:00Z"); // 08:00 เวลาไทย
  assert.equal(shouldSendDaily({ now, sendAtMinutes: 450, lastSentDateKey: null }), true);
  assert.equal(shouldSendDaily({ now, sendAtMinutes: 450, lastSentDateKey: "2026-09-21" }), false);
  /* ส่งของเมื่อวานไปแล้ว วันนี้ต้องส่งได้อีก */
  assert.equal(shouldSendDaily({ now, sendAtMinutes: 450, lastSentDateKey: "2026-09-20" }), true);
});

test("ยังไม่ถึงเวลาก็ยังไม่ส่ง และเลยมานานเกินไปก็ข้ามวันนั้น", () => {
  const before = at("2026-09-20T23:00:00Z"); // 06:00 เวลาไทย
  assert.equal(shouldSendDaily({ now: before, sendAtMinutes: 450, lastSentDateKey: null }), false);

  /* 12:00 เวลาไทย = เลยเวลาที่ตั้งไว้ 4.5 ชม. — เกินระยะผ่อนผัน 3 ชม. จึงไม่ส่งย้อนหลัง
     (คนอ่านตอนบ่ายว่า "สรุปประจำวัน" แล้วเข้าใจผิดว่าเป็นของเช้านี้) */
  const late = at("2026-09-21T05:00:00Z");
  assert.equal(shouldSendDaily({ now: late, sendAtMinutes: 450, lastSentDateKey: null }), false);

  /* เครื่องเพิ่งตื่นตอน 09:00 ไทย — ยังอยู่ในระยะผ่อนผัน ต้องได้สรุป */
  const grace = at("2026-09-21T02:00:00Z");
  assert.equal(shouldSendDaily({ now: grace, sendAtMinutes: 450, lastSentDateKey: null }), true);
});

/* ---------- เลือกเหตุที่จะส่ง ---------- */

const alert = (over) => ({
  id: "a1", level: "critical", code: "temp_c_high", metric: "temp_c",
  params: { value: 34.2, threshold: 30 }, opened_at: "2026-09-21T01:00:00Z",
  farmName: "ฟาร์มกำแพงเพชร", barnName: "A1", ...over,
});

test("ค่าตั้งต้นส่งทุกระดับที่ขึ้นบนแดชบอร์ด — ตัวกันความถี่คือช่วงพัก ไม่ใช่การตัดระดับทิ้ง", () => {
  const now = at("2026-09-21T01:10:00Z");
  const list = [alert(), alert({ id: "a2", level: "warning" }), alert({ id: "a3", level: "serious" })];
  assert.deepEqual(alertsToSend(list, new Set(), now).map((a) => a.id), ["a1", "a2", "a3"]);
  /* อยากได้เฉพาะวิกฤตก็ยังสั่งได้ */
  assert.deepEqual(alertsToSend(list, new Set(), now, 60, ["critical"]).map((a) => a.id), ["a1"]);
});

test("เหตุที่ส่งไปแล้วต้องไม่ส่งซ้ำ", () => {
  const now = at("2026-09-21T01:10:00Z");
  assert.equal(alertsToSend([alert()], new Set(["a1"]), now).length, 0);
});

test("เหตุที่เปิดค้างมานานแล้วไม่ต้องตามไปเตือนย้อนหลัง", () => {
  const now = at("2026-09-21T05:00:00Z"); // 4 ชม. หลังเหตุเปิด
  assert.equal(alertsToSend([alert()], new Set(), now).length, 0);
  /* ยืดเพดานอายุเองได้ ถ้าวันหนึ่งอยากให้ตามย้อนหลัง */
  assert.equal(alertsToSend([alert()], new Set(), now, 300).length, 1);
});

test("เพดานจำนวนครั้งต่อวันต้องกันการยิงรัว", () => {
  assert.equal(canSendMore(19, 20), true);
  assert.equal(canSendMore(20, 20), false);
});

/* ---------- หน้าตาข้อความ ---------- */

const summary = {
  dateLabel: "20 ก.ย. 2569",
  periodLabel: "สรุปทั้งวัน",
  to: at("2026-09-21T00:00:00+07:00"),
  /* วันปกติ: ค่าล่าสุดใหม่กว่าปลายช่วงที่สรุป เพราะข้อมูลยังไหลอยู่ */
  lastDataAt: at("2026-09-21T08:00:00+07:00"),
  lastDataAgeText: "12 นาที",
  barns: [
    { farmName: "ฟาร์มกำแพงเพชร", barnName: "A1", tempAvg: 27.04, tempMax: 34, tempMin: 24.8, humidityAvg: 84.2, coveragePct: 62.5, openAlerts: 2 },
    { farmName: "ฟาร์มกำแพงเพชร", barnName: "A2", tempAvg: null, tempMax: null, tempMin: null, humidityAvg: null, coveragePct: 0, openAlerts: 0 },
  ],
  totals: { barns: 2, barnsWithData: 1, openAlerts: 2, criticalAlerts: 0, sensorIssues: 1 },
};

/** เก็บข้อความทุกช่องในโครง Flex มาไว้ในสตริงเดียว ไว้ตรวจว่ามีคำที่ต้องมี */
const textIn = (node) =>
  JSON.stringify(node).replace(/\\u([0-9a-f]{4})/g, (_, c) => String.fromCharCode(parseInt(c, 16)));

test("การ์ดสรุปประจำวันต้องมี altText และบอกวันของข้อมูล", () => {
  const msg = dailyFlex(summary, "https://example.com/dashboard");
  assert.equal(msg.type, "flex");
  assert.ok(msg.altText.length > 0 && msg.altText.length <= 400);
  const s = textIn(msg);
  assert.match(s, /20 ก.ย. 2569/);
  assert.match(s, /A1/);
  assert.match(s, /27.0 °C/); // ทศนิยมหนึ่งตำแหน่งเหมือนหน้าเว็บ
});

test("โรงเรือนที่ไม่มีข้อมูลต้องเขียนว่าไม่มีข้อมูล ไม่ใช่เลข 0", () => {
  const s = textIn(dailyFlex(summary));
  assert.match(s, /ไม่มีข้อมูล/);
  assert.doesNotMatch(s, /เฉลี่ย 0 °C/);
});

test("ไม่มีลิงก์แดชบอร์ดก็ต้องไม่มีปุ่มที่กดแล้วไปไหนไม่ได้", () => {
  assert.doesNotMatch(textIn(dailyFlex(summary)), /"button"/);
  assert.match(textIn(dailyFlex(summary, "https://example.com")), /"button"/);
});

test("การ์ดเหตุวิกฤตรวบหลายใบไว้ในข้อความเดียว และไม่เกิน 5 ใบต่อการ์ด", () => {
  const many = Array.from({ length: 8 }, (_, i) => alert({ id: `a${i}` }));
  const msg = alertFlex(many);
  const s = textIn(msg);
  assert.match(s, /เหตุวิกฤต 8 รายการ/);
  assert.match(s, /และอีก 3 รายการ/);
  assert.ok(msg.altText.length <= 400);
});

test("ข้อความของเหตุต้องใช้ถ้อยคำชุดเดียวกับหน้าเว็บ", () => {
  const { title, detail } = alertText(alert());
  assert.equal(title, "อุณหภูมิสูงกว่าเกณฑ์ 4.2 °C");
  assert.equal(detail, "วัดได้ 34.2°C (เพดาน 30.0°C)"); // ไม่เว้นวรรคก่อนหน่วย เหมือน alertText.js ของหน้าเว็บ
  /* ทุก code ที่หน้าเว็บรู้จัก ฝั่งส่งไลน์ต้องรู้จักด้วย ไม่งั้นคนอ่านได้คำว่า "พบความผิดปกติ" เปล่า ๆ */
  const web = readFileSync(new URL("../src/lib/api/alertText.js", import.meta.url), "utf8");
  const line = readFileSync(new URL("../server/src/line/flex.js", import.meta.url), "utf8");
  for (const m of web.matchAll(/case "([a-z0-9_]+)":/g)) {
    assert.ok(line.includes(`case "${m[1]}":`), `flex.js ยังไม่รู้จัก code "${m[1]}"`);
  }
});

/* ---------- ค่าตั้งต้นที่ปลอดภัย ---------- */

test("โหมดซ้อมต้องเป็นค่าตั้งต้น — ลืมตั้ง env แล้วต้องไม่ส่งออกจริง", () => {
  const client = readFileSync(new URL("../server/src/line/client.js", import.meta.url), "utf8");
  assert.match(client, /process\.env\.LINE_DRY_RUN \?\? "1"/);
  /* กุญแจต้องไม่ถูกตั้งชื่อขึ้นต้น VITE_ ไม่งั้นหลุดไปอยู่ในไฟล์ที่เบราว์เซอร์โหลดได้ */
  assert.doesNotMatch(client, /VITE_LINE/);
});

test("เส้นทางที่สั่งส่งจริงต้องเป็นของผู้ดูแลระบบเท่านั้น", () => {
  const route = readFileSync(new URL("../server/src/modules/line/route.js", import.meta.url), "utf8");
  assert.match(route, /lineRouter\.post\("\/test", requireAdmin/);
  assert.match(route, /lineRouter\.post\("\/daily", requireAdmin/);
  assert.match(route, /lineRouter\.use\(requireAuth\)/);
});

/* ---------- ระดับที่ส่ง และตัวกันเตือนซ้ำ (T1.279) ---------- */

test("เหตุวิกฤตต้องไม่โดนช่วงพักกั้น — เรื่องด่วนต้องถึงมือเสมอ", () => {
  assert.equal(shouldCooldown({ level: "critical" }), false);
  assert.equal(shouldCooldown({ level: "serious" }), true);
  assert.equal(shouldCooldown({ level: "warning" }), true);
});

test("เลือกระดับเองได้จาก env และรูปแบบผิดต้องตกกลับเป็นค่าตั้งต้น", () => {
  assert.deepEqual(levelsFromEnv("critical"), ["critical"]);
  assert.deepEqual(levelsFromEnv("critical, serious ,warning"), ["critical", "serious", "warning"]);
  assert.deepEqual(levelsFromEnv(""), DEFAULT_LEVELS);
  assert.deepEqual(levelsFromEnv(undefined), DEFAULT_LEVELS);
});

test("เรื่องเดิมต้องไม่เตือนซ้ำจนกว่าจะพ้นช่วงพัก", () => {
  const now = at("2026-09-21T12:00:00Z");
  /* เพิ่งเตือนไป 3 ชม.ที่แล้ว ยังไม่ครบ 12 ชม. */
  assert.equal(withinCooldown(at("2026-09-21T09:00:00Z"), now, 12), true);
  /* เตือนไปเมื่อวาน ครบแล้ว เตือนใหม่ได้ */
  assert.equal(withinCooldown(at("2026-09-20T12:00:00Z"), now, 12), false);
  /* ไม่เคยเตือนเลย = เตือนได้ทันที */
  assert.equal(withinCooldown(null, now, 12), false);
});

/* ---------- ข้อมูลเงียบมานานแค่ไหน (T1.302) ---------- */

test("อายุข้อมูลต้องพูดเป็นหน่วยที่คนอ่านแล้วรู้สึกทันที", () => {
  assert.equal(ageText(41), "41 นาที");
  assert.equal(ageText(119), "119 นาที");
  /* เกินสองชั่วโมงห้ามพูดเป็นนาทีอีก — "2,462 นาที" ไม่มีใครหารเอง */
  assert.equal(ageText(180), "3 ชั่วโมง");
  assert.equal(ageText(2462), "41 ชั่วโมง");
  assert.equal(ageText(60 * 96), "4 วัน");
  assert.equal(ageText(-5), "0 นาที");
});

test("วันที่ข้อมูลไหลปกติ ต้องไม่มีแถวค่าล่าสุด — ไม่งั้นคนจะชินจนไม่อ่าน", () => {
  assert.doesNotMatch(textIn(dailyFlex(summary)), /ค่าล่าสุดที่ได้รับ/);
});

test("ข้อมูลเงียบ ต้องบอกทั้งเวลาที่ได้ค่าสุดท้ายและเงียบมานานแค่ไหน", () => {
  const silent = {
    ...summary,
    /* สรุปของวันที่ 2 ต.ค. แต่ค่าสุดท้ายที่ได้รับคือ 29 ก.ย. — ของจริงที่เกิดขึ้น 3 ต.ค. 2569 */
    dateLabel: "2 ต.ค. 2569",
    to: at("2026-10-03T00:00:00+07:00"),
    lastDataAt: at("2026-09-29T01:59:00+07:00"),
    lastDataAgeText: "4 วัน",
    barns: summary.barns.map((b) => ({ ...b, tempAvg: null, humidityAvg: null, coveragePct: 0 })),
    totals: { ...summary.totals, barnsWithData: 0 },
  };
  const s = textIn(dailyFlex(silent));
  assert.match(s, /ค่าล่าสุดที่ได้รับ/);
  assert.match(s, /29 ก.ย. 2569/);
  assert.match(s, /เงียบมา 4 วัน/);
  /* ★ คนจำนวนมากเห็นแค่บรรทัดแจ้งเตือนบนหน้าจอล็อก ไม่ได้เปิดการ์ด
     ถ้าบรรทัดนั้นเขียนว่า "เหตุค้าง 2 รายการ" เหมือนวันปกติ จะไม่มีใครรู้ว่าฟาร์มเงียบ */
  assert.match(dailyFlex(silent).altText, /ไม่มีค่าใหม่เข้ามา 4 วัน/);
});

test("ไม่เคยได้รับค่าเลย ต้องพูดต่างจากเงียบชั่วคราว", () => {
  const never = { ...summary, lastDataAt: null, lastDataAgeText: null };
  assert.match(textIn(dailyFlex(never)), /ยังไม่เคยได้รับค่าจากเล้าเลย/);
});

/* ---------- ใบที่ตรวจซ้ำไม่ได้ (T1.306) ---------- */

test("ใบที่ไม่มีค่าใหม่มาตรวจเลย ต้องถูกแยกออกจากใบที่เพิ่งตรวจมา", () => {
  /* ★ ของจริง: ใบ humidity_high เปิดค้างตั้งแต่ 18 ก.ย. และปิดเองไม่ได้
     เพราะเซนเซอร์เงียบตั้งแต่ 29 ก.ย. — ไม่มีค่ามาพิสูจน์ว่าหายแล้ว
     ถ้านับรวมกับใบอื่น คนอ่านจะเข้าใจว่าตอนนี้เล้ายังชื้นเกิน ทั้งที่เราไม่รู้ */
  const s = { ...summary, totals: { ...summary.totals, openAlerts: 2, unverifiedAlerts: 1 } };
  const text = textIn(dailyFlex(s));
  assert.match(text, /ในนั้นตรวจซ้ำไม่ได้/);
  assert.match(text, /1 รายการ — ไม่มีค่าใหม่ให้ตรวจ/);
});

test("วันที่ทุกใบตรวจมาแล้ว ต้องไม่มีแถวนี้โผล่มากวน", () => {
  const s = { ...summary, totals: { ...summary.totals, unverifiedAlerts: 0 } };
  assert.doesNotMatch(textIn(dailyFlex(s)), /ตรวจซ้ำไม่ได้/);
});
