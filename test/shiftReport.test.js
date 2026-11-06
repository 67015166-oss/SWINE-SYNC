/**
 * รายงานส่งเวร (T1.268) — ส่วนคำนวณที่ผิดแล้วรายงาน "โกหกแบบดูน่าเชื่อ"
 *
 * ตัวอย่างจริงตอนสร้าง (กะดึก 17→18 ก.ย. 2569): มีข้อมูลแค่ 25 นาทีจาก 12 ชั่วโมง
 * ถ้าไม่บอกความครบ "สูงสุด 25.9°C อยู่ในเกณฑ์ทั้งคืน" จะดูเหมือนคืนนั้นปกติทั้งที่ไม่มีใครรู้
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  coverageOf,
  kwhUsed,
  minutesOutside,
  splitAlerts,
} from "../server/src/reports/shiftCalc.js";
import {
  hasEnded,
  lastEndedShift,
  nextShift,
  previousShift,
  shiftAt,
  shiftFromKey,
  shiftKey,
} from "../src/lib/report/shifts.js";

const T0 = Date.parse("2026-09-17T12:00:00Z"); /* 19:00 น. เวลาไทย */
const min = (m) => T0 + m * 60_000;

test("coverageOf: ข้อมูลครบทั้งกะ = 100% ไม่มีช่วงขาด", () => {
  const times = Array.from({ length: 144 }, (_, k) => min(k * 5));
  const c = coverageOf(times, T0, min(720));
  assert.equal(c.ratio, 1);
  assert.equal(c.totalMinutes, 720);
  assert.deepEqual(c.gaps, []);
});

test("coverageOf: ขาดกลางกะ 60 นาที นับเป็นหนึ่งช่วงพร้อมเวลาเริ่ม-จบ", () => {
  const times = Array.from({ length: 144 }, (_, k) => min(k * 5)).filter(
    (t) => t < min(120) || t >= min(180),
  );
  const c = coverageOf(times, T0, min(720));
  assert.equal(c.gaps.length, 1);
  assert.equal(c.gaps[0].from, min(120));
  assert.equal(c.gaps[0].to, min(180));
  assert.equal(c.gaps[0].minutes, 60);
  assert.equal(c.missingMinutes, 60);
});

test("coverageOf: สะดุดสั้นกว่า 15 นาทีไม่นับเป็นช่วงขาด แต่ยังลดความครบ", () => {
  const times = Array.from({ length: 144 }, (_, k) => min(k * 5)).filter((t) => t !== min(300));
  const c = coverageOf(times, T0, min(720));
  assert.deepEqual(c.gaps, []);
  assert.ok(c.ratio < 1);
});

test("coverageOf: ไม่มีข้อมูลเลยทั้งกะ = 0% และขาดทั้งกะ", () => {
  const c = coverageOf([], T0, min(720));
  assert.equal(c.ratio, 0);
  assert.equal(c.gaps.length, 1);
  assert.equal(c.gaps[0].minutes, 720);
});

test("coverageOf: ขาดท้ายกะที่ยังไม่จบ นับถึง 'ตอนนี้' ไม่ใช่ถึงเวลาจบกะ", () => {
  const times = Array.from({ length: 12 }, (_, k) => min(k * 5)); /* มีข้อมูล 60 นาทีแรก */
  const c = coverageOf(times, T0, min(90)); /* ตอนนี้ = นาทีที่ 90 */
  assert.equal(c.totalMinutes, 90);
  assert.equal(c.gaps.at(-1).to, min(90));
  assert.equal(c.gaps.at(-1).minutes, 30);
});

test("minutesOutside: นับแยกสูงเกิน/ต่ำกว่า และข้ามช่องที่ไม่มีค่า", () => {
  const buckets = [{ avg: 29 }, { avg: 31 }, { avg: 32 }, { avg: 19 }, { avg: null }, { avg: NaN }];
  assert.deepEqual(minutesOutside(buckets, { min: 20, max: 30 }), { high: 10, low: 5 });
});

test("minutesOutside: เกณฑ์ที่มีแต่เพดาน (NH3) ไม่นับฝั่งต่ำ", () => {
  assert.deepEqual(minutesOutside([{ avg: 1 }, { avg: 30 }], { min: null, max: 25 }), { high: 5, low: 0 });
});

test("splitAlerts: ใบที่ค้างมาก่อนกะและยังไม่ปิด ต้องอยู่ในงานค้าง ไม่อยู่ในเหตุที่เกิดในกะ", () => {
  /* ของจริง: ความชื้นเกินเปิดตั้งแต่ 12 ก.ย. ค้างข้ามหลายกะโดยไม่มีใครรับทราบ */
  const old = { opened_at: "2026-09-12T13:53:35Z", resolved_at: null };
  const { during, pending } = splitAlerts([old], T0, min(720));
  assert.deepEqual(during, []);
  assert.deepEqual(pending, [old]);
});

test("splitAlerts: เกิดในกะแล้วปิดในกะ = เหตุในกะ ไม่ใช่งานค้าง", () => {
  const a = { opened_at: new Date(min(60)), resolved_at: new Date(min(90)) };
  const { during, pending } = splitAlerts([a], T0, min(720));
  assert.deepEqual(during, [a]);
  assert.deepEqual(pending, []);
});

test("splitAlerts: เกิดในกะ ปิดหลังจบกะ = อยู่ทั้งสองกอง", () => {
  const a = { opened_at: new Date(min(600)), resolved_at: new Date(min(800)) };
  const { during, pending } = splitAlerts([a], T0, min(720));
  assert.equal(during.length, 1);
  assert.equal(pending.length, 1);
});

test("splitAlerts: ใบที่เปิดหลังจบกะไม่เกี่ยวกับกะนี้", () => {
  const a = { opened_at: new Date(min(721)), resolved_at: null };
  const { during, pending } = splitAlerts([a], T0, min(720));
  assert.deepEqual([during, pending], [[], []]);
});

test("kwhUsed: เลขถอยหลังหรือข้อมูลไม่พอ ต้องได้ null ไม่ใช่ 0", () => {
  assert.equal(kwhUsed(6017.78, 6041.98).toFixed(2), "24.20");
  assert.equal(kwhUsed(6041, 12), null);
  assert.equal(kwhUsed(null, 5), null);
  assert.equal(kwhUsed(undefined, undefined), null);
});

test("เส้นทาง: รับเวรต้องผู้บันทึกขึ้นไป และอ่านรายงานต้องล็อกอิน", () => {
  const route = readFileSync(new URL("../server/src/modules/reports/route.js", import.meta.url), "utf8");
  assert.match(route, /reportsRouter\.use\(requireAuth\)/);
  assert.match(route, /reportsRouter\.post\("\/:id\/shift-report\/handover", requireRole\("editor"\)/);
});

/* ---------- เวลากะฝั่งหน้าเว็บ (lib/report/shifts.js) ---------- */

const th = (s) => Date.parse(`${s}+07:00`);

test("shiftAt: บ่ายสองโมง = กะกลางวัน 07:00–19:00 เวลาไทย", () => {
  const s = shiftAt(th("2026-09-18T14:00:00"));
  assert.equal(s.id, "day");
  assert.equal(s.from, th("2026-09-18T07:00:00"));
  assert.equal(s.to, th("2026-09-18T19:00:00"));
});

test("shiftAt: ตีสองคือกะดึกที่เริ่มสองทุ่มของเมื่อวาน (คร่อมเที่ยงคืน)", () => {
  const s = shiftAt(th("2026-09-18T02:00:00"));
  assert.equal(s.id, "night");
  assert.equal(s.from, th("2026-09-17T19:00:00"));
  assert.equal(s.to, th("2026-09-18T07:00:00"));
});

test("shiftAt: ตรงต้นกะพอดีนับเป็นกะใหม่", () => {
  assert.equal(shiftAt(th("2026-09-18T19:00:00")).id, "night");
  assert.equal(shiftAt(th("2026-09-18T07:00:00")).id, "day");
});

test("ก่อนหน้า/ถัดไป ต่อกันพอดีไม่มีช่องว่าง", () => {
  const s = shiftAt(th("2026-09-18T14:00:00"));
  assert.equal(previousShift(s).to, s.from);
  assert.equal(nextShift(s).from, s.to);
  assert.equal(previousShift(previousShift(s)).id, "day");
});

test("lastEndedShift: บ่ายสองได้กะดึกเมื่อคืน · hasEnded ตรงตามเวลา", () => {
  const now = th("2026-09-18T14:00:00");
  const s = lastEndedShift(now);
  assert.equal(s.id, "night");
  assert.ok(hasEnded(s, now));
  assert.ok(!hasEnded(shiftAt(now), now));
});

test("shiftKey ↔ shiftFromKey ไปกลับได้ · ค่าเพี้ยนหรือกะอนาคตได้ null", () => {
  const now = th("2026-09-18T14:00:00");
  const s = lastEndedShift(now);
  assert.deepEqual(shiftFromKey(shiftKey(s), now), s);
  assert.equal(shiftFromKey("abc", now), null);
  assert.equal(shiftFromKey("", now), null);
  assert.equal(shiftFromKey(String(th("2026-09-19T07:00:00") / 1000), now), null);
});
