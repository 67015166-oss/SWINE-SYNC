/**
 * ตัวเฝ้าระวังว่าเครื่องหลักยังอยู่ไหม (T1.285)
 *
 * ของที่พังแล้วเงียบ — และคราวนี้ "เงียบ" คือตัวอาการเอง:
 *   - ตัวเฝ้าไปพึ่งฐานข้อมูล → ตายพร้อมสิ่งที่มันเฝ้า แล้วไม่มีใครรู้เลย (เกิดจริง 25-28 ก.ย.)
 *   - เตือนทุกรอบตรวจ → โควตาไลน์หมดใน 2 วัน แล้วแจ้งเตือนของจริงส่งไม่ออก
 *   - เน็ตกระตุกครั้งเดียวแล้วเตือน → คนเลิกอ่าน
 *   - ดับยาวแล้วเตือนครั้งเดียว → ลืมไป 3 วันเหมือนเดิม
 *   - นับ 503 ว่า "ตอบแล้ว" → Cloudflare ตอบแทนต้นทางที่ตายไปแล้ว จับไม่ได้เลย
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CHECK_EVERY_MIN,
  EMPTY,
  FAILS_TO_ALARM,
  REMIND_EVERY_MIN,
  decide,
  humanGap,
  shouldCheck,
  watchdogMessage,
} from "../server/src/watchdog/rules.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const T0 = new Date("2026-09-25T17:00:00+07:00");
const at = (min) => new Date(T0.getTime() + min * 60000);

/** เดินเวลาไปข้างหน้าแล้วป้อนผลตรวจทีละรอบ — คืนรายการข้อความที่ "จะถูกส่ง" */
function runFor(minutes, okAt, opt = {}) {
  let state = { ...EMPTY };
  const sent = [];
  for (let m = 0; m <= minutes; m += CHECK_EVERY_MIN) {
    const now = at(m);
    if (!shouldCheck(state, now)) continue;
    const r = decide(state, okAt(m), now, opt);
    state = r.state;
    if (r.notify) sent.push({ m, kind: r.notify, downSince: r.downSince });
  }
  return { state, sent };
}

test("กระตุกครั้งเดียวแล้วกลับมา ต้องไม่รบกวนใครเลย", () => {
  const { sent } = runFor(60, (m) => m !== 10);
  assert.deepEqual(sent, []);
});

test("พลาดติดกันครบเกณฑ์ถึงจะประกาศว่าดับ — และประกาศครั้งเดียว", () => {
  const { sent } = runFor(60, () => false);
  const downs = sent.filter((s) => s.kind === "down");
  assert.equal(downs.length, 1, "ประกาศว่าดับได้ครั้งเดียว");
  assert.equal(downs[0].m, (FAILS_TO_ALARM - 1) * CHECK_EVERY_MIN, "ต้องรอครบจำนวนครั้งก่อน");
});

test("★ กรณีจริง 25–28 ก.ย.: ดับ 3 วัน ต้องเตือนซ้ำวันละครั้ง ไม่ใช่เงียบ", () => {
  const threeDays = 3 * 24 * 60;
  const { sent } = runFor(threeDays, () => false);
  const stills = sent.filter((s) => s.kind === "still");
  /* เตือนซ้ำ **วันละครั้ง** (เดิม 12 ชม. · ผู้ใช้สั่งยืด 30 ก.ย. 2569 เพราะคนที่ได้ข้อความแก้เองไม่ได้)
     สิ่งที่ห้ามเกิดคือ "เงียบหายไปเลย" ไม่ใช่ "เตือนน้อยลงหนึ่งครั้งต่อวัน" */
  assert.ok(stills.length >= 2, `ดับ 3 วันต้องเตือนซ้ำอย่างน้อยวันละครั้ง (ได้ ${stills.length})`);
  /* แต่ต้องไม่ถี่จนกินโควตา — 300 ข้อความ/เดือน */
  assert.ok(sent.length <= 5, `3 วันต้องใช้ข้อความไม่เกิน 5 (ได้ ${sent.length})`);
  const gaps = stills.slice(1).map((s, i) => s.m - stills[i].m);
  for (const g of gaps) assert.equal(g, REMIND_EVERY_MIN, "เตือนซ้ำต้องห่างเท่ากันทุกครั้ง");
});

test("กลับมาแล้วต้องบอก และบอกครั้งเดียว", () => {
  const { sent } = runFor(300, (m) => m >= 200);
  assert.deepEqual(sent.map((s) => s.kind), ["down", "up"]);
  const up = sent.find((s) => s.kind === "up");
  assert.equal(up.m, 200);
});

test("ยังไม่เคยประกาศว่าดับ แล้วกลับมาเอง — ห้ามส่งข้อความ 'กลับมาแล้ว'", () => {
  const r = decide({ ...EMPTY, status: "unknown", fails: 1, firstFailAt: T0.toISOString() }, true, at(5));
  assert.equal(r.notify, null);
  assert.equal(r.state.status, "up");
});

test("ข้อความตอนดับต้องบอกว่าการแจ้งเตือนหยุด ไม่ใช่แค่ว่าเครื่องดับ", () => {
  const msg = watchdogMessage("down", { name: "box-mew", downSince: T0.toISOString(), now: at(185) });
  assert.match(msg.text, /box-mew/);
  assert.match(msg.text, /ไม่ส่งแจ้งเตือน/, "ต้องบอกผลกระทบ");
  assert.match(msg.text, /ไม่ได้แปลว่าทุกอย่างปกติ/, "ต้องเตือนว่าความเงียบไม่ใช่ความปกติ");
  /* ★ ห้ามสัญญาว่าข้อมูลไม่หาย — ตัวเฝ้าตรวจไม่ได้ และ 26–27 ก.ย. 2569 ข้อมูลหายจริง
     เพราะเครื่องที่เก็บค่าดิบหลับไปพร้อมกัน (เหลือ 0.2% ของปกติ) */
  assert.doesNotMatch(msg.text, /ข้อมูล\S*ไม่หาย|ไม่หาย/, "ห้ามสัญญาในสิ่งที่ตัวเฝ้าตรวจไม่ได้");
  assert.match(msg.text, /เครื่องที่เก็บค่าเซนเซอร์/, "ต้องเตือนให้ไปตรวจต้นทางข้อมูลด้วย");
  assert.match(msg.text, /3 ชั่วโมง/, "ต้องบอกว่าเงียบมานานแค่ไหน");
});

test("ข้อความตอนกลับมาต้องบอกว่าดับไปนานเท่าไร", () => {
  const msg = watchdogMessage("up", { name: "box-mew", downSince: T0.toISOString(), now: at(3 * 24 * 60) });
  assert.match(msg.text, /3 วัน/);
  assert.match(msg.text, /กลับมา/);
});

test("humanGap อ่านออกทุกช่วง", () => {
  assert.equal(humanGap(T0.toISOString(), at(7)), "7 นาที");
  assert.equal(humanGap(T0.toISOString(), at(125)), "2 ชั่วโมง 5 นาที");
  assert.equal(humanGap(T0.toISOString(), at(3 * 24 * 60 + 120)), "3 วัน 2 ชั่วโมง");
  assert.equal(humanGap(null), null);
});

test("shouldCheck คุมความถี่ — เรียกถี่แค่ไหนก็ตรวจตามรอบ", () => {
  const s = { ...EMPTY, lastCheckAt: T0.toISOString() };
  assert.equal(shouldCheck(s, at(1)), false);
  assert.equal(shouldCheck(s, at(CHECK_EVERY_MIN)), true);
  assert.equal(shouldCheck(null, T0), true, "ยังไม่เคยตรวจต้องตรวจเลย");
});

/* ── ข้อที่คุมว่าตัวเฝ้าจะไม่ตายพร้อมสิ่งที่มันเฝ้า ── */

test("★ ตัวเฝ้าต้องไม่แตะฐานข้อมูลเลย ทั้งกติกาและตัวรัน", () => {
  for (const f of ["../server/src/watchdog/rules.js", "../server/src/watchdog/primary.js"]) {
    const src = read(f);
    assert.doesNotMatch(src, /db\/pool\.js/, `${f} ต้องไม่ import pool`);
    assert.doesNotMatch(src, /\bquery\(/, `${f} ต้องไม่เรียก query()`);
  }
});

test("นับว่าตอบเฉพาะ 2xx — 503 ของ Cloudflare ต้องนับว่าดับ", () => {
  const src = read("../server/src/watchdog/primary.js");
  assert.match(src, /ok:\s*res\.ok/, "ต้องใช้ res.ok ไม่ใช่แค่ดูว่า fetch ไม่ throw");
});

test("สะพานเรียกตัวเฝ้าก่อนงานที่ใช้ฐาน และเรียกทุกบทบาท", () => {
  const src = read("../server/src/bridge/index.js");
  /* ตัดคอมเมนต์ทิ้งก่อน ไม่งั้นจะไปเจอชื่อฟังก์ชันที่คอมเมนต์พูดถึง แทนที่จะเป็นโค้ดจริง */
  const tick = src
    .slice(src.indexOf("async function tick()"))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/g, "");
  const watch = tick.indexOf("await runPrimaryWatch(");
  const sync = tick.indexOf("await syncPass(");
  assert.ok(watch > -1, "tick ต้องเรียก runPrimaryWatch");
  assert.ok(watch < sync, "ต้องเรียกก่อน syncPass ซึ่งล้มทันทีเมื่อฐานไม่ตอบ");
  /* บรรทัดที่เรียกตัวเฝ้าต้องไม่มีเงื่อนไขนำหน้า — ผูกกับบทบาทเมื่อไร มันจะเงียบบนเครื่องที่ควรเฝ้า */
  const line = tick.split("\n").find((l) => l.includes("await runPrimaryWatch("));
  assert.equal(line.trim(), "await runPrimaryWatch();", `บรรทัดที่เรียกต้องไม่มีเงื่อนไข (ได้: ${line.trim()})`);
});

test("compose ส่ง PRIMARY_HEALTH_URL และเก็บสถานะไว้ใน volume", () => {
  const yml = read("../docker-compose.yml");
  assert.match(yml, /PRIMARY_HEALTH_URL:/);
  assert.match(yml, /PRIMARY_STATE_FILE: \/state\//);
  assert.match(yml, /bridge_state:/);
});

test("★ ตัวเฝ้าต้องไม่ผูกกับ LINE_NOTIFY — เครื่องที่ควรเฝ้าคือเครื่องที่ตั้ง LINE_NOTIFY=0 พอดี", () => {
  const src = read("../server/src/watchdog/primary.js");
  assert.doesNotMatch(src, /lineEnabled/, "ห้ามใช้สวิตช์เดียวกับตัวส่งแจ้งเตือน");
  assert.match(src, /PRIMARY_WATCH_NOTIFY/, "ต้องมีสวิตช์ของตัวเอง");
});

test("ข้อความไลน์ต้องไม่มี markdown — LINE แสดงข้อความล้วน ดอกจันจะโผล่จริง", () => {
  for (const kind of ["down", "still", "up"]) {
    const { text } = watchdogMessage(kind, { name: "box", downSince: T0.toISOString(), now: at(60) });
    assert.doesNotMatch(text, /\*\*|__|\[.+\]\(/, `ข้อความ ${kind} มี markdown ปนมา`);
  }
});

/* ---------- คนอ่านต้องทำตามข้อความได้จริง (T1.299) ---------- */

test("ข้อความห้ามสั่งให้ไปเปิดเครื่องเอง — คนดูแลแดชบอร์ดไม่มีสิทธิ์นั้น", () => {
  /* ผู้ใช้บอกเอง 30 ก.ย. 2569: ไม่มีสิทธิ์เข้าหลังบ้านของกล่อง
     ข้อความที่สั่งสิ่งที่ทำไม่ได้ ทำให้คนอ่านดูเหมือนเพิกเฉยทั้งที่ทำอะไรไม่ได้จริง ๆ */
  const plain = watchdogMessage("down", { name: "กล่อง box-mew", downSince: "2026-09-25T12:00:00Z" }).text;
  assert.match(plain, /แจ้งผู้ดูแล/);
  assert.doesNotMatch(plain, /ที่ต้องทำ: เปิด/);

  const named = watchdogMessage("still", {
    name: "กล่อง box-mew",
    downSince: "2026-09-25T12:00:00Z",
    owner: "ทีม PlotNexus",
  }).text;
  assert.match(named, /แจ้งทีม PlotNexus ให้เปิดกล่อง box-mew กลับมา/);
  /* คำไทยต้องไม่ติดกับชื่อภาษาอังกฤษจนอ่านไม่ออก */
  assert.doesNotMatch(named, /box-mewให้|box-mewกลับ/);
});

test("จังหวะเตือนซ้ำปรับได้โดยไม่ต้องแก้โค้ด และค่าตั้งต้นคือวันละครั้ง", () => {
  assert.equal(REMIND_EVERY_MIN, 1440);
  /* ตั้งเองได้ผ่าน opt — ตัวรันอ่านจาก PRIMARY_REMIND_MIN / FLOW_REMIND_MIN */
  const { sent } = runFor(3 * 24 * 60, () => false, { remindEveryMin: 360 });
  assert.ok(sent.filter((s) => s.kind === "still").length >= 10, "ตั้งถี่ขึ้นแล้วต้องเตือนถี่ขึ้นจริง");
  for (const runner of ["primary", "dataflow"]) {
    const src = readFileSync(new URL(`../server/src/watchdog/${runner}.js`, import.meta.url), "utf8");
    assert.match(src, /remindEveryMin: remindMin\(\)/, `${runner}.js ไม่ได้ส่งจังหวะเตือนซ้ำเข้า decide()`);
  }
});
