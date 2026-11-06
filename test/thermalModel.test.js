/**
 * คณิตของแบบจำลองความร้อน (T1.261) — ตรวจด้วยข้อมูลสังเคราะห์ที่ "รู้คำตอบอยู่แล้ว"
 *
 * สร้างเล้าปลอมที่มี τ = 45 นาที · หน่วง 15 นาที · อัตราขยาย 0.7 แล้วให้โค้ดหากลับมาเอง
 * ถ้าหาไม่ตรง แปลว่าคณิตผิด ไม่ใช่ข้อมูลจริงแปลก — ต้องผ่านชุดนี้ก่อนเชื่อผลจากข้อมูลจริง
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  segmentsOf,
  maskStuck,
  fitGreyBox,
  leastSquares,
  fitThermalModel,
  simulate,
  evaluate,
} from "../server/src/twin/thermalModel.js";

const STEP = 300; // 5 นาที
const TAU_MIN = 45;
const LAG = 3; // 15 นาที
const GAIN = 0.7;
const OFFSET = 9; // สมดุล = 0.7·T_out + 9
const KW_EFFECT = -0.4; // เปิดไฟเพิ่ม 1 kW เย็นลง 0.4°C ที่สภาวะคงตัว

/** สุ่มแบบกำหนดผลได้ — เทสต์ต้องได้ผลเดิมทุกครั้ง */
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** เล้าปลอมหลายช่วง แต่ละช่วงคั่นด้วยช่องว่าง (จำลองเครื่องปิดกลางคืน) */
function fakeBarn({ segments = 6, hours = 8, noise = 0, withKw = false, seed = 7 }) {
  const rand = rng(seed);
  const a = Math.exp(-STEP / 60 / TAU_MIN);
  const rows = [];
  let t = 1_780_000_000;
  for (let s = 0; s < segments; s++) {
    const n = (hours * 3600) / STEP;
    const touts = [];
    let tin = 27;
    for (let k = 0; k < n; k++) {
      const hour = ((t / 3600) % 24 + 24) % 24;
      const tout = 28 + 3.5 * Math.sin((2 * Math.PI * (hour - 9)) / 24) + (rand() - 0.5) * 0.6;
      const kw = withKw ? 2 + 1.5 * rand() : undefined;
      touts.push(tout);
      rows.push({ t, tin: tin + (rand() - 0.5) * noise, tout, kw });
      const lagged = touts[Math.max(0, k - LAG)];
      const eq = GAIN * lagged + OFFSET + (withKw ? KW_EFFECT * kw : 0);
      tin = a * tin + (1 - a) * eq;
      t += STEP;
    }
    t += 10 * 3600; // ช่องว่าง 10 ชั่วโมง
  }
  return rows;
}

test("แบ่งช่วงต่อเนื่องตรงรอยขาด และตรงแถวที่ค่าหาย", () => {
  const rows = [
    { t: 0, tin: 1, tout: 1 },
    { t: 300, tin: 1, tout: 1 },
    { t: 900, tin: 1, tout: 1 }, // ขาดไปหนึ่งคาบ
    { t: 1200, tin: null, tout: 1 }, // ค่าหาย
    { t: 1500, tin: 1, tout: 1 },
  ];
  assert.deepEqual(segmentsOf(rows, 300).map((s) => s.length), [2, 1, 1]);
});

test("กำลังสองน้อยที่สุดหาเส้นตรงที่รู้คำตอบได้ตรง", () => {
  const X = [];
  const y = [];
  for (let i = 0; i < 50; i++) {
    X.push([i, 1]);
    y.push(2.5 * i - 4);
  }
  const [m, c] = leastSquares(X, y);
  assert.ok(Math.abs(m - 2.5) < 1e-9);
  assert.ok(Math.abs(c + 4) < 1e-9);
});

test("หา τ · เวลาหน่วง · อัตราขยาย กลับมาได้ตรงกับเล้าปลอม", () => {
  const segs = segmentsOf(fakeBarn({}), STEP);
  const m = fitThermalModel(segs, { stepSec: STEP, maxLag: 8 });
  assert.equal(m.lag, LAG);
  assert.ok(m.stable);
  assert.ok(Math.abs(m.tauMin - TAU_MIN) < 1, `τ ได้ ${m.tauMin}`);
  assert.ok(Math.abs(m.gainOut - GAIN) < 0.02, `อัตราขยายได้ ${m.gainOut}`);
});

test("ใส่ภาระไฟฟ้าแล้วหาผลของไฟกลับมาได้ถูกทิศและใกล้เคียง", () => {
  const segs = segmentsOf(fakeBarn({ withKw: true }), STEP);
  const m = fitThermalModel(segs, { stepSec: STEP, maxLag: 8, useKw: true });
  assert.equal(m.lag, LAG);
  assert.ok(Math.abs(m.kwEffect - KW_EFFECT) < 0.03, `ผลของไฟได้ ${m.kwEffect}`);
});

test("ไม่ลากเส้นข้ามช่องว่าง — ถ้าลากข้าม τ จะเพี้ยน", () => {
  /* เอาทุกแถวมาต่อกันเป็นช่วงเดียวแบบผิด ๆ แล้วเทียบกับแบ่งช่วงถูกต้อง */
  const rows = fakeBarn({ segments: 8, hours: 6 });
  const right = fitThermalModel(segmentsOf(rows, STEP), { stepSec: STEP, maxLag: 8 });
  const wrong = fitThermalModel([rows], { stepSec: STEP, maxLag: 8 });
  assert.ok(Math.abs(right.tauMin - TAU_MIN) < Math.abs(wrong.tauMin - TAU_MIN) + 1e-9);
});

test("แบบจำลองวิ่งเองไม่แอบดูค่าจริง และชนะการเดาว่าคงที่", () => {
  const rows = fakeBarn({ segments: 10, hours: 8, noise: 0.1, seed: 3 });
  const segs = segmentsOf(rows, STEP);
  const model = fitThermalModel(segs.slice(0, 7), { stepSec: STEP, maxLag: 8 });
  const sim = simulate(model, segs[8]);
  /* จุดแรกเท่านั้นที่ยืมค่าจริง นอกนั้นต้องเป็นค่าของแบบจำลองเอง */
  assert.equal(sim.filter((p) => p.predicted == null).length, LAG + 1);
  const score = evaluate(model, segs.slice(7));
  assert.ok(score.freeRunRmse < score.persistenceRmse, JSON.stringify(score));
  assert.ok(score.skill > 0.5, `skill ${score.skill}`);
});

test("ข้อมูลน้อยเกินไป ไม่ยอมเดาแบบจำลองออกมา", () => {
  const rows = fakeBarn({ segments: 1, hours: 1 });
  assert.equal(fitThermalModel(segmentsOf(rows, STEP).map((s) => s.slice(0, 10)), { stepSec: STEP }), null);
});

test("ค่าที่ค้างนิ่งนานเกินจริงถูกลบทิ้ง ส่วนค่าที่เปลี่ยนตามปกติอยู่ครบ", () => {
  const rows = [
    ...Array.from({ length: 40 }, (_, i) => ({ t: i * STEP, tout: 24.8 })), // ค้าง 40 ช่อง
    ...Array.from({ length: 10 }, (_, i) => ({ t: (40 + i) * STEP, tout: 26 + i * 0.1 })),
    { t: 50 * STEP, tout: 27 },
    { t: 51 * STEP, tout: 27 }, // ซ้ำแค่ 2 ช่อง เป็นเรื่องปกติ
  ];
  const masked = maskStuck(rows, "tout", 36);
  assert.equal(masked.slice(0, 40).filter((r) => r.tout === null).length, 40);
  assert.equal(masked.slice(40).filter((r) => r.tout === null).length, 0);
  assert.equal(rows[0].tout, 24.8, "ต้องไม่แก้แถวต้นฉบับ");
});

test("เซนเซอร์นอกเล้าค้างทั้งชุด = ไม่มีข้อมูลให้สอน ไม่ใช่ได้แบบจำลองปลอมออกมา", () => {
  const rows = fakeBarn({}).map((r) => ({ ...r, tout: 24.8 }));
  const segs = segmentsOf(maskStuck(rows, "tout", 36), STEP);
  assert.equal(fitThermalModel(segs, { stepSec: STEP, maxLag: 8 }), null);
});


/* ---------- กล่องเทา (T1.261) ---------- */

/** เล้าปลอมคาบ 15 นาที ขับด้วยอากาศนอก + แดด ตามรูปแบบเดียวกับ fitGreyBox */
function greyBarn({ tauMin, K, S, c, segments = 8, hours = 10, seed = 11 }) {
  const step = 900;
  const rand = rng(seed);
  const a = Math.exp(-step / 60 / tauMin);
  const rows = [];
  let t = 1_780_000_000 + 6 * 3600;
  for (let s = 0; s < segments; s++) {
    let tin = 26;
    for (let k = 0; k < (hours * 3600) / step; k++) {
      const hour = (((t + 7 * 3600) / 3600) % 24 + 24) % 24;
      const rad = Math.max(0, Math.sin((Math.PI * (hour - 6)) / 12)) * (0.7 + 0.3 * rand());
      const tout = 26 + 4 * Math.sin((2 * Math.PI * (hour - 9)) / 24) + (rand() - 0.5);
      rows.push({ t, tin, tout, rad });
      tin = a * tin + (1 - a) * (K * tout + S * rad + c);
      t += step;
    }
    t += 14 * 3600;
  }
  return rows;
}

test("กล่องเทาหา τ · อัตราขยาย · ผลของแดด · จุดตั้ง กลับมาได้ใกล้ค่าจริง", () => {
  const rows = greyBarn({ tauMin: 90, K: 0.4, S: 3, c: 15 });
  const m = fitGreyBox(segmentsOf(rows, 900), { stepSec: 900, extra: (r) => r.rad, maxLag: 2 });
  assert.ok(Math.abs(m.tauMin - 90) <= 15, `τ ได้ ${m.tauMin}`);
  assert.ok(Math.abs(m.gainOut - 0.4) <= 0.1, `K ได้ ${m.gainOut}`);
  assert.ok(Math.abs(m.sunEffect - 3) <= 0.5, `แดดได้ ${m.sunEffect}`);
  assert.ok(m.fitRmse < 0.1, `คลาดเคลื่อนตอนสอน ${m.fitRmse}`);
});

test("กล่องเทาไม่มีวันให้อัตราขยายติดลบหรือแดดทำให้เย็นลง แม้ข้อมูลอยากได้แบบนั้น", () => {
  /* เล้าที่ "ข้างนอกร้อน ข้างในเย็น" จริง ๆ (ฟิสิกส์ผิด) — ต้องชนขอบ 0 และบอกว่าชนขอบ */
  const rows = greyBarn({ tauMin: 60, K: -0.8, S: -2, c: 50 });
  const m = fitGreyBox(segmentsOf(rows, 900), { stepSec: 900, extra: (r) => r.rad, maxLag: 1 });
  assert.ok(m.gainOut >= 0 && m.sunEffect >= 0);
  assert.equal(m.atBound.gainLow, true);
});

test("ผลของกล่องเทาใช้กับ simulate/evaluate ได้ทันที และชนะการเดาว่าคงที่", () => {
  const rows = greyBarn({ tauMin: 75, K: 0.3, S: 2.5, c: 18, segments: 10 });
  const segs = segmentsOf(rows, 900);
  const m = fitGreyBox(segs.slice(0, 7), { stepSec: 900, extra: (r) => r.rad, maxLag: 1 });
  const score = evaluate(m, segs.slice(7), 12);
  assert.ok(score.freeRunRmse < score.persistenceRmse, JSON.stringify(score));
});
