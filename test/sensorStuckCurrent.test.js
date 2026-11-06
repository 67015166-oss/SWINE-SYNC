/**
 * ไทล์ค่าปัจจุบันต้องไม่โชว์ค่าของเซนเซอร์ที่ไม่ได้วัด (T1.315)
 *
 * อาการ: เสาอากาศนอกเล้าส่ง 35.5 °C มาทุกนาทีตั้งแต่ 8 ก.ค. 2569 โดยไม่ขยับเลย
 * กราฟย้อนหลังตัดเส้นนี้ทิ้งไปแล้วตั้งแต่ T1.304/T1.312 **แต่ไทล์ค่าปัจจุบันยังโชว์อยู่**
 * พร้อมเวลา "อัปเดตเมื่อสักครู่" ซึ่งอ่านว่าเป็นค่าที่เพิ่งวัดได้ — หน้าเดียวกันบอกคนละอย่าง
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  seriesStuck,
  stuckEvidence,
  stuckFromEvidence,
  stuckKeysFromEvidence,
} from "../src/lib/sensorHealth.js";
import { bagOf, toFarmBundleFromApi } from "../src/lib/api/serverFarms.js";
import { toBarn } from "../src/lib/api/plotnexusFarms.js";

/* ---------- หลักฐานที่วัดมาจากของจริง (ฐานบน box-mew · 8 ต.ค. 2569 · ย้อนหลัง 24 ชม.) ---------- */

/** เสาอากาศนอกเล้า: 20 ช่วงรายชั่วโมง กินเวลา 23 ชม. ค่าไม่เปลี่ยนเลยแม้ครั้งเดียว */
const DEAD = { points: 20, spanHours: 23, changes: 0 };

/** เซนเซอร์ในเล้าที่ยังดีอยู่: ค่าเปลี่ยน 15 จาก 19 คู่ */
const ALIVE = { points: 20, spanHours: 23, changes: 15 };

test("เซนเซอร์ที่ส่งเลขเดิมทุกชั่วโมงต้องถูกจับว่าค้าง", () => {
  assert.equal(stuckFromEvidence(DEAD), true);
});

test("เซนเซอร์ที่ยังวัดจริงต้องไม่ถูกหาว่าค้าง", () => {
  assert.equal(stuckFromEvidence(ALIVE), false);
});

test("★ วันที่เล้านิ่งที่สุดก็ยังต้องไม่ถูกหาว่าค้าง", () => {
  /* ★★ กับดักที่เกือบส่งขึ้นของจริง
     เส้นแบ่ง "กี่ช่วงที่เข็มไม่ขยับ ≥ 0.8" วัดมาจากช่วงแบบ **รายวัน** (T1.304)
     พอเปลี่ยนมาใช้ช่วง **รายชั่วโมง** ตัวเลขชุดนั้นใช้ไม่ได้อีก —
     วัดของจริง 14 วัน: ในเล้าได้ 0.29–0.93 · นอกอาคารได้ 1.00 เป๊ะทุกวัน
     วันที่ 27 ก.ย. เซนเซอร์ในเล้าที่ยังดีอยู่ได้ **0.93 ซึ่งเกินเส้น 0.8 ไปแล้ว**

     จึงเป็นเหตุผลที่หลังบ้าน **จงใจไม่ส่ง** buckets/flatBuckets ออกมา
     เทสต์นี้กันไม่ให้ใครเติมสองฟิลด์นั้นกลับเข้าไปเพราะคิดว่า "ส่งให้ครบดีกว่า" */
  const worstRealDay = { points: 14, spanHours: 13, buckets: 14, flatBuckets: 13, changes: 11 };
  assert.equal(
    stuckFromEvidence(worstRealDay),
    true,
    "ถ้าส่ง flatBuckets มา ทางตัดสินจะเปลี่ยน แล้วเซนเซอร์ที่ดีจะโดนหาว่าค้าง",
  );
  /* หลักฐานชุดเดียวกันแต่ส่งแบบที่หลังบ้านส่งจริง — ตอบถูก */
  assert.equal(stuckFromEvidence({ points: 14, spanHours: 13, changes: 11 }), false);
});

test("หลักฐานไม่พอต้องตอบว่าไม่ค้าง — 'ไม่รู้' ห้ามกลายเป็น 'ค้าง'", () => {
  /* เพิ่งกลับมาส่งเมื่อสองชั่วโมงก่อน ยังตัดสินไม่ได้ */
  assert.equal(stuckFromEvidence({ points: 3, spanHours: 2, changes: 0 }), false);
  /* จุดพอแต่ช่วงเวลาสั้นเกิน */
  assert.equal(stuckFromEvidence({ points: 20, spanHours: 2, changes: 0 }), false);
  /* ไม่มีหลักฐานเลย */
  assert.equal(stuckFromEvidence({}), false);
  assert.equal(stuckFromEvidence(null), false);
});

test("ค่าที่อ่านเป็นตัวเลขไม่ได้ ต้องไม่ถูกนับเป็นศูนย์", () => {
  /* ★ กับดักเดิมของ T1.295/T1.308/T1.311 — `Number(null)` คือ 0 ซึ่ง "ผ่าน" ทุกด่าน
     ถ้าปล่อยผ่าน หลักฐานที่หายไปจะกลายเป็น "ไม่เปลี่ยนเลย" = ค้าง ซึ่งผิดทาง */
  assert.equal(stuckFromEvidence({ points: 20, spanHours: 23, changes: null }), false);
  assert.equal(stuckFromEvidence({ points: 20, spanHours: 23, changes: "" }), false);
  assert.equal(stuckFromEvidence({ points: null, spanHours: 23, changes: 0 }), false);
  assert.equal(stuckFromEvidence({ points: 20, spanHours: null, changes: 0 }), false);
});

test("กติกาเดิมที่กราฟใช้ต้องให้คำตอบเดิมทุกตัว", () => {
  /* แยกหลักฐานออกจากการตัดสินแล้ว แต่ `seriesStuck` ต้องตอบเหมือนเดิมเป๊ะ */
  const flat = Array.from({ length: 24 }, (_, i) => ({
    at: new Date(Date.UTC(2026, 9, 7, i)).toISOString(),
    value: 27.6,
    min: 27.6,
    max: 27.6,
  }));
  const moving = flat.map((p, i) => ({ ...p, value: 27 + i * 0.1, min: 26 + i * 0.1, max: 28 + i * 0.1 }));
  assert.equal(seriesStuck(flat), true);
  assert.equal(seriesStuck(moving), false);
  /* และต้องเท่ากับการตัดสินจากหลักฐานที่สรุปจากชุดเดียวกัน */
  assert.equal(stuckFromEvidence(stuckEvidence(flat)), true);
  assert.equal(stuckFromEvidence(stuckEvidence(moving)), false);
});

test("คีย์ที่ค้างต้องแยกในเล้ากับนอกอาคารออกจากกัน", () => {
  const keys = stuckKeysFromEvidence({
    "temp_c|in": ALIVE,
    "humidity|in": ALIVE,
    "temp_c|out": DEAD,
    "humidity|out": DEAD,
  });
  assert.deepEqual([...keys].sort(), ["humidity|out", "temp_c|out"]);
});

/* ---------- ชั้นข้อมูล: ค่าที่ค้างต้องไม่ไหลออกไปเป็นตัวเลข ---------- */

const NOW = new Date().toISOString();
const cell = (value) => ({ value, at: NOW, devices: 1 });

test("ถุงค่าต้องติดธงค้างตามคีย์ของตัวเอง", () => {
  const stuck = new Set(["temp_c|out"]);
  const out = bagOf({ temp_c: cell(35.5), humidity: cell(64.3) }, { temp_c: "temperature", humidity: "humidity" }, stuck, "out");
  assert.equal(out.temperature.stuck, true);
  assert.equal(out.humidity.stuck, false);
  /* ค่ากับเวลายังอยู่ครบ — ตัดทิ้งตอนอ่าน ไม่ใช่ตอนเก็บ เพื่อให้ตรวจย้อนได้ */
  assert.equal(out.temperature.value, 35.5);
  assert.equal(out.temperature.key, "temp_c|out");
});

test("โรงเรือนที่เสาอากาศค้าง ต้องขึ้นขีดกลาง ไม่ใช่เลขเดิม", () => {
  const inside = bagOf({ temp_c: cell(27.8), humidity: cell(89.3) }, { temp_c: "temperature", humidity: "humidity" }, new Set(), "in");
  const outside = bagOf(
    { temp_c: cell(35.5), humidity: cell(64.3) },
    { temp_c: "temperature", humidity: "humidity" },
    new Set(["temp_c|out", "humidity|out"]),
    "out",
  );
  const barn = toBarn("F-KPP", "uuid-1", { code: "A1", name: "โรงเรือน A1", stage: null }, inside, outside);

  /* ★ หัวใจของงานนี้ */
  assert.equal(barn.outdoor.tempC, null, "35.5 °C ไม่ใช่ค่าที่วัดได้ ต้องไม่ขึ้นบนจอ");
  assert.equal(barn.outdoor.humidity, null);
  /* จุดน้ำค้างคิดจากสองค่านั้น คิดต่อไม่ได้ก็ต้องเป็นขีดกลางด้วย ไม่ใช่คิดจากค่าค้าง */
  assert.equal(barn.outdoor.dewPoint, null);

  /* ในเล้ายังดีอยู่ ต้องไม่โดนหางเลข */
  assert.equal(barn.tempC, 27.8);
  assert.equal(barn.humidity, 89.3);
  assert.equal(barn.status, "good");

  /* และต้องบอกได้ว่าช่องไหนเป็นขีดกลางเพราะค้าง ไม่ใช่เพราะไม่มีเซนเซอร์ */
  assert.deepEqual(barn.stuckValues.sort(), ["humidity|out", "temp_c|out"]);
});

test("แหล่งข้อมูลที่ไม่มีหลักฐานให้ตรวจ ต้องทำงานเหมือนเดิม", () => {
  /* PlotNexus ส่ง "ถุง" ที่ไม่มีธงค้างมาเลย — ต้องไม่พังและไม่ตัดค่าอะไรทิ้ง */
  const barn = toBarn(
    "F-NSN",
    "loc-1",
    { code: "A1", name: "โรงเรือน A1", stage: null },
    { temperature: { value: 29.1, at: NOW }, humidity: { value: 75, at: NOW } },
    { temperature: { value: 31.2, at: NOW } },
  );
  assert.equal(barn.tempC, 29.1);
  assert.equal(barn.outdoor.tempC, 31.2);
  assert.deepEqual(barn.stuckValues, []);
});

test("ทั้งเส้นทางจากคำตอบของหลังบ้าน — ไม่ต้องให้หน้าจอรู้เรื่องหลักฐานเลย", () => {
  const bundle = toFarmBundleFromApi(
    { id: "farm-uuid", code: "F-KPP", name: "ฟาร์มกำแพงเพชร", province: "กำแพงเพชร", last_reading_at: NOW },
    [
      {
        id: "barn-uuid",
        code: "A1",
        name: "โรงเรือน A1",
        current: { temp_c: cell(27.8), humidity: cell(89.3) },
        outdoor: { temp_c: cell(35.5), humidity: cell(64.3) },
        /* หลักฐานจริงจากฐาน: ในเล้าขยับ · นอกอาคารไม่ขยับเลย */
        stuck_evidence: {
          "temp_c|in": ALIVE,
          "humidity|in": ALIVE,
          "temp_c|out": DEAD,
          "humidity|out": DEAD,
        },
      },
    ],
    {},
    { alerts: [] },
  );

  const [barn] = bundle.barns;
  assert.equal(barn.tempC, 27.8, "ค่าในเล้าต้องยังขึ้นปกติ");
  assert.equal(barn.outdoor.tempC, null, "ค่านอกอาคารที่ค้างต้องหายไปจากจอ");
  assert.deepEqual(barn.stuckValues.sort(), ["humidity|out", "temp_c|out"]);
});
