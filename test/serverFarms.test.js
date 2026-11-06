/**
 * อ่านฟาร์มจริงจากหลังบ้านของเราเอง แทน PlotNexus (T1.303)
 *
 * สิ่งที่ต้องกันไว้ให้ได้ เพราะพลาดแล้วของเดิมของผู้ใช้หายหรือหน้าจอโกหก:
 *   · **ไอดีต้องไม่เปลี่ยน** — เลย์เอาต์กระดาน บันทึก และค่าตั้งค่าผูกกับ `F-KPP-A1` อยู่
 *     ถ้าเปลี่ยนไปใช้ uuid ของฐาน ของเดิมของผู้ใช้จะกลายเป็นของโรงเรือนที่ไม่มีอยู่จริง
 *   · ค่าเก่าต้องกลายเป็นออฟไลน์ ไม่ใช่โชว์เป็นค่าปัจจุบัน (กติกาเดียวกับ PlotNexus)
 *   · กระแสสามเฟสห้ามบวกกัน
 *   · ป้าย "ข้อมูลจริง/ตัวอย่าง" ต้องมาจากฐาน ห้ามตรึง
 */
import test from "node:test";
import assert from "node:assert/strict";

import { bagOf, electricalOf, toFarmBundleFromApi } from "../src/lib/api/serverFarms.js";

const BARN_UUID = "c02c1f07-471f-4937-aad3-06336950c138";
const FARM_UUID = "11111111-2222-3333-4444-555555555555";

const fresh = () => new Date().toISOString();
const old = () => new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();

const farmRow = {
  id: FARM_UUID, code: "F-KPP", name: "ฟาร์มกำแพงเพชร", province: "กำแพงเพชร",
  lat: 16.4828, lng: 99.5222, data_source: "live", last_reading_at: fresh(),
};

const barnRow = (at) => ({
  id: BARN_UUID, code: "A1", name: "โรงเรือน A1", stage: null, capacity: 900, data_source: "live",
  current: {
    temp_c: { value: 27.04, at, devices: 3 },
    humidity: { value: 84.2, at, devices: 3 },
    wind_ms: { value: 0.4, at, devices: 1 },
  },
  outdoor: {
    temp_c: { value: 31.5, at, devices: 1 },
    humidity: { value: 70.1, at, devices: 1 },
  },
});

const limits = { tempMin: 24, tempMax: 30, humidityMin: 50, humidityMax: 80 };

/* ---------- ไอดีต้องตรงกับของเดิม ---------- */

test("ไอดีฟาร์ม/โรงเรือนต้องเป็นรหัสของฐาน ไม่ใช่ uuid — ของเดิมของผู้ใช้ผูกกับรหัสนี้", () => {
  const { farm, barns } = toFarmBundleFromApi(farmRow, [barnRow(fresh())], limits);
  assert.equal(farm.id, "F-KPP");
  assert.equal(barns[0].id, "F-KPP-A1");
  /* uuid ยังต้องมีให้เรียก /api/barns/:id/... ได้ แต่ไม่ใช่ไอดีที่หน้าจอใช้ */
  assert.equal(barns[0].apiId, BARN_UUID);
  assert.equal(farm.apiId, FARM_UUID);
});

/* ---------- แปลงชื่อค่าที่วัด ---------- */

test("ชื่อค่าที่วัดของฐานต้องถูกแปลงเป็นชื่อที่หน้าจออ่าน", () => {
  const { barns } = toFarmBundleFromApi(farmRow, [barnRow(fresh())], limits);
  const b = barns[0];
  assert.equal(b.tempC, 27);
  assert.equal(b.humidity, 84.2);
  /* ลมในเล้าคือ airflow → windSpeed · ไม่ใช่ลมที่เสาอากาศ */
  assert.equal(b.windSpeed, 0.4);
  assert.equal(b.outdoor.tempC, 31.5);
  assert.equal(b.outdoor.humidity, 70.1);
});

test("ค่าที่ฐานเพิ่มใหม่แต่หน้าจอยังไม่รู้จัก ต้องถูกข้ามเงียบ ๆ ไม่ใช่หลุดเข้าไปปน", () => {
  const bag = bagOf({ temp_c: { value: 27, at: "2026-10-03T00:00:00Z" }, lux: { value: 900 } }, { temp_c: "temperature" });
  assert.deepEqual(Object.keys(bag), ["temperature"]);
  assert.equal(bag.temperature.value, 27);
});

/* ---------- ค่าเก่าต้องไม่ถูกแสดงเป็นค่าปัจจุบัน ---------- */

test("ค่าที่เก่าเกินเกณฑ์ต้องกลายเป็นออฟไลน์และค่าเป็นขีดกลาง", () => {
  const { farm, barns } = toFarmBundleFromApi(farmRow, [barnRow(old())], limits);
  assert.equal(barns[0].status, "offline");
  assert.equal(barns[0].tempC, null);
  assert.equal(barns[0].humidity, null);
  /* ทั้งฟาร์มออฟไลน์เมื่อไม่มีโรงเรือนไหนสด — ค่าเฉลี่ยต้องไม่ถูกคิดจากค่าที่ตายแล้ว */
  assert.equal(farm.status, "offline");
  assert.equal(farm.tempC, null);
});

/* ---------- ป้ายที่มาของข้อมูล ---------- */

test("ป้ายข้อมูลจริง/ตัวอย่างต้องมาจากฐาน ห้ามตรึงเป็น live", () => {
  const demo = { ...farmRow, data_source: "demo" };
  const demoBarn = { ...barnRow(fresh()), data_source: "demo" };
  const { farm, barns } = toFarmBundleFromApi(demo, [demoBarn], limits);
  assert.equal(farm.dataSource, "demo");
  assert.equal(barns[0].dataSource, "demo");
});

test("ฟาร์มที่ไม่มีรหัส ต้องคืน null ไม่ใช่สร้างฟาร์มไร้ชื่อขึ้นมา", () => {
  assert.equal(toFarmBundleFromApi({ id: FARM_UUID, name: "ไม่มีรหัส" }, [], limits), null);
});

/* ---------- ค่าไฟ ---------- */

const reading = {
  at: fresh(), voltage: 228.4, currents: { a: 12, b: 15, c: 9 },
  frequency: 50, powerKw: 7.8, kwhTotal: 128_400, todayKwh: 41.2, monthKwh: 980.5,
  todayFrom: fresh(), monthFrom: fresh(),
};

test("กระแสสามเฟสต้องเฉลี่ย ไม่ใช่บวกกัน", () => {
  const e = electricalOf(reading);
  assert.equal(e.online, true);
  assert.equal(e.circuitKind, "phase");
  assert.equal(e.currentPerPhase, 12);   // (12+15+9)/3 ไม่ใช่ 36
  assert.equal(e.totalCurrent, null);
});

test("ชื่อฟิลด์กำลังไฟต้องเป็น activePower — การ์ดไฟฟ้าอ่านชื่อนี้", () => {
  assert.equal(electricalOf(reading).activePower, 7.8);
});

test("หน่วยที่ใช้วันนี้/เดือนนี้ต้องส่งต่อมาจากหลังบ้าน (PlotNexus ให้ไม่ได้)", () => {
  const e = electricalOf(reading, { rate: 4.2 });
  assert.equal(e.todayKwh, 41.2);
  assert.equal(e.monthKwh, 980.5);
  assert.ok(e.todayFrom, "ต้องบอกด้วยว่าเริ่มนับจากเมื่อไร ไม่งั้นคนอ่านจะนึกว่าใช้ไฟแค่นี้ทั้งวัน");
  assert.equal(Math.round(e.cost), Math.round(41.2 * 4.2));
});

test("มิเตอร์ที่ค่าค้างเก่า ต้องขึ้นว่าออฟไลน์ ไม่ใช่โชว์แรงดันเก่าเป็นค่าปัจจุบัน", () => {
  assert.equal(electricalOf({ ...reading, at: old() }).online, false);
  assert.equal(electricalOf({ at: fresh(), voltage: null }).online, false);
  assert.equal(electricalOf(null).online, false);
});

test("ช่องที่มิเตอร์ไม่ได้วัด ต้องบอกว่าช่องไหน ไม่ใช่เงียบ ๆ เป็นขีดกลาง", () => {
  const e = electricalOf({ ...reading, powerKw: null, kwhTotal: null });
  assert.deepEqual(e.missing, ["กำลังไฟ", "หน่วยสะสม"]);
});

/* ---------- ค่านอกอาคารต้องตัดสินความสดด้วยเวลาของตัวเอง (T1.304) ---------- */

test("ค่านอกอาคารที่เก่าแล้ว ต้องเป็นขีดกลางเหมือนค่าในเล้า ไม่ใช่โชว์ต่อไป", () => {
  /* ★ บั๊กที่เห็นบนหน้าจอจริง: หัวกราฟเขียน "ใน — · นอก 29.7"
     ค่าในเล้าถูกกรองตามกติกาแล้ว แต่ค่านอกอาคารไม่เคยผ่านการกรองเลย
     คนอ่านจึงเข้าใจว่า 29.7 คือค่าตอนนี้ ทั้งที่เก่าพอ ๆ กัน */
  const { barns } = toFarmBundleFromApi(farmRow, [barnRow(old())], limits);
  assert.equal(barns[0].outdoor.tempC, null);
  assert.equal(barns[0].outdoor.humidity, null);
  assert.equal(barns[0].outdoor.dewPoint, null);
});

test("ค่านอกอาคารวัดอายุแยกจากในเล้า — คนละเซนเซอร์ หยุดส่งคนละเวลาได้", () => {
  /* ในเล้าสด แต่เสาอากาศหยุดส่งไปแล้ว → ในเล้าต้องยังมีค่า ส่วนนอกอาคารต้องเป็นขีดกลาง */
  const row = barnRow(fresh());
  row.outdoor = {
    temp_c: { value: 31.5, at: old(), devices: 1 },
    humidity: { value: 70.1, at: old(), devices: 1 },
  };
  const { barns } = toFarmBundleFromApi(farmRow, [row], limits);
  assert.equal(barns[0].tempC, 27, "ค่าในเล้ายังสด ต้องไม่ถูกลบตามไปด้วย");
  assert.equal(barns[0].outdoor.tempC, null);
});

/* ---------- แจ้งเตือนต้องมาจากตารางเดียวกับที่ไลน์ใช้ (T1.307) ---------- */

const served = [
  { id: "a1", barn_id: BARN_UUID, code: "humidity_high", level: "warning", metric: "humidity", value: 82.6 },
  { id: "a2", barn_id: BARN_UUID, code: "sensor_silent", level: "serious", metric: "sensor", value: null },
];

test("ถ้าหลังบ้านส่งแจ้งเตือนมา ต้องใช้ของหลังบ้าน ไม่ใช่คิดเองซ้ำอีกชุด", () => {
  /* ★ เดิมหน้าเว็บคิดเองในเบราว์เซอร์ ส่วนไลน์อ่านจากตาราง alert
     = เครื่องคิดสองตัวที่มีเกณฑ์คนละชุด สองฝั่งจึงบอกไม่เหมือนกันได้โดยไม่มีใครรู้ */
  const { alerts } = toFarmBundleFromApi(farmRow, [barnRow(old())], limits, { alerts: served });
  assert.deepEqual(alerts.map((a) => a.code).sort(), ["humidity_high", "sensor_silent"]);
});

test("ใบที่เปิดไว้ก่อนเซนเซอร์เงียบ ต้องถูกติดธงว่าตรวจซ้ำไม่ได้", () => {
  /* ของจริง: humidity_high เปิดค้างตั้งแต่ 18 ก.ย. ปิดเองไม่ได้เพราะไม่มีค่ามาพิสูจน์ว่าหายแล้ว
     ปิดให้เองก็ไม่ถูก เพราะเท่ากับบอกว่า "ตอนนี้ปกติแล้ว" ซึ่งไม่มีใครรู้ */
  const { alerts } = toFarmBundleFromApi(farmRow, [barnRow(old())], limits, { alerts: served });
  const byCode = Object.fromEntries(alerts.map((a) => [a.code, a]));
  assert.equal(byCode.humidity_high.unverified, true);
  /* ★ ใบ "เซนเซอร์เงียบ" เองยังจริงอยู่ — มันคือเรื่องของการไม่มีค่า */
  assert.equal(byCode.sensor_silent.unverified, false);
});

test("โรงเรือนที่ยังส่งค่าอยู่ ใบของมันต้องไม่ถูกติดธง", () => {
  const { alerts } = toFarmBundleFromApi(farmRow, [barnRow(fresh())], limits, { alerts: served });
  assert.equal(alerts.every((a) => a.unverified === false), true);
});
