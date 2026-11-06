/**
 * ทะเบียนชนิดค่า (T1.346) — เตรียมให้แหล่งข้อมูลใหม่เสียบเข้าได้โดยไม่ต้องแก้โค้ดทุกครั้ง
 *
 * งานนี้เกิดจากโจทย์ต่อระบบ Easy Pairing เข้าแดชบอร์ด ซึ่งเพิ่มชนิดเซนเซอร์ได้เรื่อย ๆ
 * (ความชื้นดิน แสง ลม) แต่แดชบอร์ดเดิมรู้จักค่าแบบตายตัว 5 ชนิด และ **ข้ามค่าที่ไม่รู้จัก
 * ไปเงียบ ๆ** — เซนเซอร์ใหม่จึงไม่ขึ้นบนจอโดยไม่มีอะไรบอกเลย
 *
 * ★ ข้อแรกคือเทสต์กันพัง: ตารางแปลงชื่อที่คำนวณจากทะเบียน ต้องได้ผลเท่ากับตารางเดิมเป๊ะ
 *   ถ้าข้อนี้แดง แปลว่าการรีแฟกเตอร์เปลี่ยนพฤติกรรมของเส้นทางข้อมูลจริงเข้าแล้ว
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  METRICS, METRIC_ORDER, fieldMapFor, describeMetric, isKnownMetric, extrasOf, statusOf,
} from "../src/lib/metrics/registry.js";
import { bagOf } from "../src/lib/api/serverFarms.js";
import { COMFORT } from "../src/data/mock/climate.js";
import { AIR_LIMITS } from "../src/data/mock/airQuality.js";

/* ---------- กันพัง: ต้องเหมือนของเดิมทุกตัวอักษร ---------- */

/** ตารางที่เคยเขียนตรง ๆ ใน serverFarms.js ก่อนย้ายมาเป็นทะเบียน */
const LEGACY_INSIDE = { temp_c: "temperature", humidity: "humidity", wind_ms: "airflow", nh3: "nh3", co2: "co2" };
const LEGACY_OUTSIDE = { temp_c: "temperature", humidity: "humidity", wind_ms: "wind_speed" };

test("ตารางแปลงชื่อที่คำนวณจากทะเบียน ต้องเท่ากับตารางเดิมเป๊ะ", () => {
  assert.deepEqual(fieldMapFor("in"), LEGACY_INSIDE);
  assert.deepEqual(fieldMapFor("out"), LEGACY_OUTSIDE);
});

test("H₂S ต้องอยู่ในทะเบียนแต่ไม่รับเข้าถุง เพราะยังไม่มีเซนเซอร์จริง", () => {
  assert.ok(isKnownMetric("h2s"), "หน้าจอมีช่องของมัน จึงต้องรู้หน่วยกับเกณฑ์");
  assert.equal(METRICS.h2s.field, null, "ยัดเข้าถุงเมื่อไร ถุงจะมีคีย์ที่ไม่มีใครป้อนค่า");
  assert.ok(!Object.hasOwn(fieldMapFor("in"), "h2s"));
});

/* ---------- เกณฑ์ต้องตรงกับที่อื่นที่ถือชุดเดียวกัน ---------- */

test("เกณฑ์ในทะเบียนต้องตรงกับ COMFORT และ AIR_LIMITS", () => {
  assert.deepEqual(METRICS.temp_c.range, { min: COMFORT.tempC.min, max: COMFORT.tempC.max });
  assert.deepEqual(METRICS.humidity.range, { min: COMFORT.humidity.min, max: COMFORT.humidity.max });
  /* ★ NH₃ ต้องตรงกับที่หน้าจอเขียนว่า "ไม่เกิน 15" ไม่งั้น 17 ppm จะขึ้นเขียว */
  assert.equal(METRICS.nh3.range.max, AIR_LIMITS.nh3.max);
  assert.equal(METRICS.co2.range.max, AIR_LIMITS.co2.max);
  assert.equal(METRICS.h2s.range.max, AIR_LIMITS.h2s.max);
  assert.equal(METRICS.wind_ms.range.max, AIR_LIMITS.wind.max);
  assert.equal(METRICS.wind_ms.range.min, AIR_LIMITS.wind.min);
});

test("ทุกตัวในลำดับการแสดงผลต้องมีอยู่จริงในทะเบียน", () => {
  for (const key of METRIC_ORDER) assert.ok(METRICS[key], `${key} อยู่ในลำดับแต่ไม่มีในทะเบียน`);
  assert.equal(METRIC_ORDER.length, Object.keys(METRICS).length, "มีตัวที่ลืมใส่ลำดับ จะไม่ขึ้นบนจอ");
});

/* ---------- ★ หัวใจของงาน: ค่าที่ยังไม่รู้จักต้องไม่หายเงียบ ---------- */

const cell = (value) => ({ value, at: new Date().toISOString(), devices: 1 });

test("ค่าที่ไม่รู้จักต้องไม่เข้าถุง แต่ต้องโผล่ที่ extras", () => {
  const current = { temp_c: cell(27.6), soil_moisture: cell(42.1), lux: cell(18500) };

  /* ถุงยังสะอาดเหมือนเดิม — หน้าจอเก่าไม่เจอคีย์แปลกปลอม */
  const bag = bagOf(current, fieldMapFor("in"), new Set(), "in");
  assert.deepEqual(Object.keys(bag), ["temperature"]);

  /* แต่ของใหม่ไม่หาย */
  const extras = extrasOf(current, "in");
  assert.deepEqual(extras.map((e) => e.spec.key).sort(), ["lux", "soil_moisture"]);
  assert.equal(extras.find((e) => e.spec.key === "lux").value, 18500);
});

test("ค่าที่ไม่รู้จักต้องไม่มีเกณฑ์ และต้องไม่ขึ้นว่าปกติ", () => {
  const spec = describeMetric("soil_moisture");
  assert.equal(spec.known, false);
  assert.equal(spec.range, null, "เดาเกณฑ์ให้คือการบอกว่าปกติทั้งที่ไม่มีใครรู้");
  /* ★ null แปลว่า "ไม่มีเกณฑ์" ไม่ใช่ "ปกติ" — ถ้าหน้าจอแปลผิด เซนเซอร์ใหม่จะเขียวทั้งแถบ */
  assert.equal(statusOf("soil_moisture", 42.1), null);
  assert.equal(spec.label, "soil_moisture", "ใช้ชื่อดิบไปก่อน ดีกว่าเขียนว่าไม่ทราบ");
});

test("แหล่งข้อมูลส่งหน่วยมาด้วยได้ แล้วหน้าจอหยิบไปใช้ต่อ", () => {
  const spec = describeMetric("soil_moisture", { unit: "%", label: "ความชื้นดิน" });
  assert.equal(spec.unit, "%");
  assert.equal(spec.label, "ความชื้นดิน");
  assert.equal(spec.range, null, "ส่งหน่วยมาไม่ได้แปลว่ามีเกณฑ์");
});

test("ค่าที่รู้จักแต่ฝั่งนั้นไม่รับ ต้องได้สเปกจริง ไม่ใช่ของกลาง", () => {
  /* NH₃ ไม่มีช่องฝั่งนอกเล้า แต่ถ้าวันหนึ่งมีค่าส่งมา ต้องได้หน่วยกับไอคอนที่ถูก */
  const extras = extrasOf({ nh3: cell(12) }, "out");
  assert.equal(extras.length, 1);
  assert.equal(extras[0].spec.known, true);
  assert.equal(extras[0].spec.unit, "ppm");
});

/* ---------- การตัดสินสถานะ ---------- */

test("ตัดสินสถานะจากเกณฑ์ในทะเบียนได้ถูกต้อง", () => {
  assert.equal(statusOf("temp_c", 26), "good");
  assert.equal(statusOf("temp_c", 31), "warn");
  assert.equal(statusOf("temp_c", 19), "warn");
  assert.equal(statusOf("nh3", 17), "warn", "17 เกิน 15 ต้องไม่เขียว");
  assert.equal(statusOf("temp_c", null), null, "ไม่มีค่า ต้องไม่ใช่ปกติ");
});

test("เกณฑ์ที่ผู้ใช้ตั้งเองต้องชนะเกณฑ์ตั้งต้น", () => {
  assert.equal(statusOf("temp_c", 31), "warn");
  assert.equal(statusOf("temp_c", 31, { min: 20, max: 34 }), "good");
});

/* ---------- ★★ เส้นทางจริง: ค่าใหม่จากหลังบ้าน ต้องไปโผล่ที่โรงเรือน ---------- */

import { toFarmBundleFromApi } from "../src/lib/api/serverFarms.js";
import { DEFAULT_SETTINGS } from "../src/lib/settings/defaults.js";

test("เซนเซอร์ชนิดใหม่จากหลังบ้าน ต้องไปถึงโรงเรือนโดยไม่ต้องแก้โค้ด", () => {
  /* จำลองสิ่งที่จะเกิดขึ้นเมื่อต่อ Easy Pairing เข้ามา — บอร์ดส่งค่าที่แดชบอร์ดไม่เคยรู้จัก */
  const bundle = toFarmBundleFromApi(
    { code: "F-KPP", name: "ฟาร์มกำแพงเพชร" },
    [{
      id: "uuid-1", code: "A1", name: "โรงเรือน A1",
      current: { temp_c: cell(27.6), humidity: cell(86.1), soil_moisture: cell(42.1) },
      outdoor: {},
    }],
    DEFAULT_SETTINGS.comfort,
  );

  const barn = bundle.barns[0];

  /* ค่าที่รู้จักยังเข้าช่องเดิมทุกประการ */
  assert.equal(barn.tempC, 27.6);
  assert.equal(barn.humidity, 86.1);

  /* ★ ค่าใหม่ไม่หาย — เดิมจะถูกข้ามเงียบ ๆ ตั้งแต่ bagOf */
  const soil = barn.extras.inside.find((e) => e.spec.key === "soil_moisture");
  assert.ok(soil, "เซนเซอร์ชนิดใหม่หายไปจากระบบ — โจทย์ Easy Pairing ยังไม่ถูกแก้");
  assert.equal(soil.value, 42.1);
  assert.equal(soil.spec.known, false, "ยังไม่ขึ้นทะเบียน จึงต้องไม่มีเกณฑ์");
  assert.equal(soil.spec.range, null);
});

test("โรงเรือนที่ส่งแต่ค่าที่รู้จัก ต้องไม่มีของแปลกปลอมใน extras", () => {
  const bundle = toFarmBundleFromApi(
    { code: "F-KPP", name: "ฟาร์มกำแพงเพชร" },
    [{ id: "uuid-1", code: "A1", name: "โรงเรือน A1", current: { temp_c: cell(27.6) }, outdoor: {} }],
    DEFAULT_SETTINGS.comfort,
  );
  assert.deepEqual(bundle.barns[0].extras, { inside: [], outdoor: [] });
});

/* ---------- กันทะเบียนสองฝั่งหลุดจากกัน ---------- */

test("ชนิดค่าที่หลังบ้านยอมให้ดึงย้อนหลัง ต้องรู้จักในทะเบียนฝั่งหน้าจอ", () => {
  /* หลังบ้านมีรายชื่อที่อนุญาตของตัวเองใน readings/route.js (คนละไฟล์ คนละฝั่ง)
     ถ้าสองฝั่งหลุดจากกัน จะขอกราฟย้อนหลังของค่าที่หน้าจอไม่รู้จัก หรือรู้จักแล้วแต่ขอไม่ได้
     ★ ตอนนี้ยอมให้ต่างกันได้หนึ่งตัวคือ light_lux ซึ่งหลังบ้านรองรับแล้วแต่ยังไม่มีเซนเซอร์
       วันที่ติดเซนเซอร์แสงจริง ให้เพิ่มเข้าทะเบียนแล้วลบออกจากรายการยกเว้นนี้ */
  const serverSrc = readFileSync(new URL("../server/src/modules/readings/route.js", import.meta.url), "utf8");
  const line = serverSrc.match(/const METRICS = \[(.*?)\]/s);
  assert.ok(line, "หารายชื่อที่หลังบ้านอนุญาตไม่เจอ — ย้ายที่แล้วต้องตามแก้เทสต์นี้");

  const serverMetrics = [...line[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const KNOWN_GAP = ["light_lux"];
  const missing = serverMetrics.filter((m) => !isKnownMetric(m) && !KNOWN_GAP.includes(m));

  assert.deepEqual(
    missing,
    [],
    `หลังบ้านรองรับ ${missing.join(", ")} แต่ทะเบียนฝั่งหน้าจอยังไม่รู้จัก — กราฟจะขอได้แต่วาดไม่ถูก`,
  );
});
