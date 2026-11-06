/**
 * แบบจำลองชั้นที่ 3 — ตัวจำลองฝั่งหน้าเว็บต้องให้ผลเดียวกับหลังบ้านเป๊ะ (T1.262)
 *
 * ถ้าสองฝั่งคิดไม่ตรงกัน กราฟ "ถ้าแดดจัดขึ้น" บนจอจะไม่ใช่แบบจำลองที่วัดความแม่นไว้
 * แต่เป็นอะไรอีกอย่างที่ไม่มีใครตรวจ — เทสต์นี้กันไว้
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { simulateTwin, summarize } from "../src/lib/twin/simulate.js";
import { simulate } from "../server/src/twin/thermalModel.js";

/** แปลงพารามิเตอร์แบบที่หลังบ้านส่งให้หน้าเว็บ → รูปที่ simulate() ของหลังบ้านใช้ */
const serverModel = (m) => ({
  a: m.a,
  b: (1 - m.a) * m.gainOut,
  c: (1 - m.a) * m.setpoint,
  e: 0,
  useKw: false,
  lag: m.lag,
  extras: [(r) => r.rad],
  extraCoef: [(1 - m.a) * m.sunEffect],
});

function drivers(n) {
  return Array.from({ length: n }, (_, k) => ({
    t: 1_789_600_000 + k * 900,
    tout: 27 + 3 * Math.sin(k / 8),
    rad: Math.max(0, Math.sin(k / 12)) * 0.8,
    tin: 26 + Math.sin(k / 10),
  }));
}

for (const lag of [0, 2]) {
  test(`ตัวจำลองหน้าเว็บตรงกับหลังบ้านทุกช่อง (เวลาหน่วง ${lag} ช่อง)`, () => {
    const m = { a: 0.82, gainOut: 0.3, sunEffect: 3, setpoint: 20, lag };
    const rows = drivers(40);
    const server = simulate(serverModel(m), rows);
    const client = simulateTwin(
      m,
      rows[0].tin,
      rows.map((r) => ({ tout: r.tout, rad: r.rad, actual: r.tin })),
    );
    server.forEach((p, i) => {
      const expected = p.predicted ?? p.actual;
      assert.ok(Math.abs(client[i] - expected) < 1e-9, `ช่อง ${i}: หน้าเว็บ ${client[i]} หลังบ้าน ${expected}`);
    });
  });
}

test("แดดศูนย์ = เล้าเข้าหาอุณหภูมิประจำ · แดดมากขึ้น = ร้อนขึ้น", () => {
  const m = { a: 0.82, gainOut: 0, sunEffect: 3, setpoint: 26.4, lag: 0 };
  const rows = Array.from({ length: 60 }, () => ({ tout: 30, rad: 0.8 }));
  const dark = simulateTwin(m, 25, rows, { sunScale: 0 });
  const normal = simulateTwin(m, 25, rows);
  const bright = simulateTwin(m, 25, rows, { sunScale: 1.5 });
  assert.ok(Math.abs(dark.at(-1) - 26.4) < 0.01, `มืด → ${dark.at(-1)}`);
  assert.ok(normal.at(-1) > dark.at(-1) && bright.at(-1) > normal.at(-1));
  assert.ok(Math.abs(normal.at(-1) - (26.4 + 3 * 0.8)) < 0.01);
});

test("เลื่อนอุณหภูมิประจำลง 1°C สภาวะคงตัวต้องลดลง 1°C พอดี", () => {
  const m = { a: 0.82, gainOut: 0, sunEffect: 3, setpoint: 26.4, lag: 0 };
  const rows = Array.from({ length: 80 }, () => ({ tout: 30, rad: 0.5 }));
  const base = simulateTwin(m, 26, rows).at(-1);
  const cooler = simulateTwin(m, 26, rows, { setpointShift: -1 }).at(-1);
  assert.ok(Math.abs(base - cooler - 1) < 0.001);
});

test("สรุปเส้น: สูงสุด · เวลาที่เกินเกณฑ์ · เกินครั้งแรก", () => {
  const times = [0, 900, 1800, 2700, 3600];
  const s = summarize([27, 28.5, 29.2, 28.1, 27], times, 28, 900);
  assert.equal(s.peak, 29.2);
  assert.equal(s.peakAt, 1800);
  assert.equal(s.overMinutes, 45);
  assert.equal(s.firstOver, 900);
  const none = summarize([26, 27], [0, 900], 28, 900);
  assert.equal(none.overMinutes, 0);
  assert.equal(none.firstOver, null);
});

test("ไม่มีตัวเลื่อนของสิ่งที่แบบจำลองยังไม่ได้เรียน (พัดลม · จำนวนสุกร · อากาศนอก)", () => {
  const src = readFileSync(new URL("../src/lib/twin/simulate.js", import.meta.url), "utf8");
  /* ตัวเลือกคือก้อน {...} สุดท้ายก่อน "= {})" ของฟังก์ชัน */
  const signature = src.match(/drivers, \{([^}]*)\} = \{\}\)/)[1];
  assert.deepEqual(signature.split(",").map((s) => s.split("=")[0].trim()).filter(Boolean), ["sunScale", "setpointShift"]);
});
