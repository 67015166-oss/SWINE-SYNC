/**
 * เซนเซอร์เงียบแล้วต้อง "ค้างค่าล่าสุด" ไม่ใช่หายไปเป็นขีดกลาง (T1.345)
 *
 * ผู้ใช้สั่งเมื่อ 21 ต.ค. 2569: "อย่าทำให้มันหาย ถ้าขัดข้องให้ค้างที่ค่าล่าสุดไว้ก่อน"
 *
 * ★ แต่ค้างได้เฉพาะ "ช่องที่หน้าจอหยิบไปแสดง" (`barn.held`) เท่านั้น
 *   `barn.tempC` ยังต้องเป็น null ตามเดิม เพราะมีอีก 33 ไฟล์ที่เอาไปเทียบเกณฑ์
 *   ถ้าปล่อยค่าเก่าไหลไปตรงนั้น เซนเซอร์ที่ตายแล้วจะขึ้น "อยู่ในเกณฑ์" เขียวทั้งแถบ
 *   ซึ่งคือบั๊กที่ไล่แก้กันไปแล้วเมื่อ 3 ต.ค. 2569 — งานนี้ต้องไม่ปลุกมันขึ้นมาอีก
 */
import test from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import { bagOf } from "../src/lib/api/serverFarms.js";
import { toBarn } from "../src/lib/api/plotnexusFarms.js";

const MAP = { temp_c: "temperature", humidity: "humidity", airflow: "airflow" };
const META = { code: "A1", name: "โรงเรือน A1", stage: null };

const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
const cell = (value, minutesAgo) => ({ value, at: at(minutesAgo), devices: 1 });

const barnAged = (minutesAgo) => {
  const inside = bagOf(
    { temp_c: cell(27.6, minutesAgo), humidity: cell(86.1, minutesAgo), airflow: cell(0.6, minutesAgo) },
    MAP,
    new Set(),
    "in",
  );
  return toBarn("F-KPP", "uuid-1", META, inside, bagOf({}, MAP, new Set(), "out"));
};

test("เซนเซอร์ยังสด — ค่าขึ้นปกติทั้งสองช่อง", () => {
  const barn = barnAged(2);
  assert.equal(barn.status, "good");
  assert.equal(barn.tempC, 27.6);
  assert.equal(barn.held.tempC, 27.6, "ช่องค้างต้องมีค่าด้วย เพื่อให้พร้อมใช้ทันทีที่เงียบ");
});

test("เซนเซอร์เงียบ — ค่าค้างยังอยู่ แต่ช่องที่ตรรกะใช้ต้องว่าง", () => {
  const barn = barnAged(45);

  /* ★ หัวใจของงานนี้: ตัวเลขไม่หายไปจากหน้าจอ */
  assert.equal(barn.held.tempC, 27.6, "ค่าล่าสุดต้องยังถืออยู่ ไม่ใช่หายเป็นขีดกลาง");
  assert.equal(barn.held.humidity, 86.1);
  assert.equal(barn.held.windSpeed, 0.6);
  assert.ok(barn.held.at, "ต้องมีเวลาของค่าติดมาด้วย ไม่งั้นหน้าจอบอกอายุไม่ได้");

  /* ★ และต้องไม่ปลุกบั๊กเก่า: ช่องที่เอาไปเทียบเกณฑ์ยังว่างตามเดิม */
  assert.equal(barn.tempC, null, "ค่าเก่าห้ามไหลเข้าช่องที่ 33 ไฟล์เอาไปเทียบเกณฑ์");
  assert.equal(barn.humidity, null);
  assert.equal(barn.windSpeed, null);
  assert.equal(barn.status, "offline", "สถานะยังต้องบอกว่าไม่มีสัญญาณ");
  assert.equal(barn.devices.sensor, "offline");
});

test("ไม่เคยมีค่าเลย — ช่องค้างต้องว่าง ไม่ใช่เดาเลขให้", () => {
  const empty = bagOf({}, MAP, new Set(), "out");
  const barn = toBarn("F-KPP", "uuid-1", META, bagOf({}, MAP, new Set(), "in"), empty);
  assert.equal(barn.held.tempC, null);
  assert.equal(barn.held.at, null);
  assert.equal(barn.status, "offline");
});

/* ---------- ชั้นหน้าจอ: ตรวจแบบเดียวกับเทสต์หน้าอื่นในโปรเจกต์ (อ่านซอร์ส) ---------- */

const srcOf = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const envCompare = readFileSync(new URL("../src/components/climate/EnvCompare.jsx", import.meta.url), "utf8");

test("การ์ดเทียบใน-นอก ต้องหยิบค่าค้างมาแสดงครบทั้งสามค่า", () => {
  for (const key of ["tempC", "humidity", "windSpeed"]) {
    assert.ok(
      new RegExp(`shownValue\\(barn\\.${key}, "${key}"`).test(envCompare),
      `ลืมต่อค่าค้างของ ${key} — ช่องนั้นจะกลับไปเป็นขีดกลางเวลาเซนเซอร์เงียบ`,
    );
  }
  /* สามค่าต้องส่งบรรทัดอายุเข้าไทล์ด้วย ไม่ใช่แค่ตัวเลข */
  for (const name of ["tempShown", "humidShown", "windShown"]) {
    assert.ok(envCompare.includes(`heldNote={${name}.note}`), `${name} ยังไม่ส่งอายุของค่า`);
  }
});

test("ค่าค้างต้องกลบบรรทัดเทียบกับภายนอกทิ้ง", () => {
  /* เทียบค่าเก่าในเล้ากับค่าสดข้างนอกคือการเทียบคนละเวลา
     จะได้ประโยคอย่าง "เย็นกว่าภายนอก 5.4 °C" ที่ไม่เป็นความจริงในเวลาใดเลย */
  assert.ok(
    /heldNote \?[\s\S]{0,400}?\) : \(\s*compare &&/.test(envCompare),
    "บรรทัดเทียบต้องอยู่ใน else ของค่าค้าง ไม่ใช่แสดงคู่กัน",
  );
});

test("ค่าค้างต้องมีทั้งไอคอนและข้อความ ไม่สื่อด้วยสีอย่างเดียว", () => {
  /* กติกาใน CLAUDE.md — สถานะห้ามสื่อด้วยสีเพียงอย่างเดียว */
  assert.ok(envCompare.includes('<Icon name="clock"'), "ต้องมีไอคอนนาฬิกาคู่กับข้อความ");
  /* คำว่า "ค่าค้างไว้" ย้ายไปอยู่กติกากลางแล้ว — ทุกจุดจึงได้ข้อความเหมือนกันโดยอัตโนมัติ */
  assert.ok(
    srcOf("../src/lib/heldReading.js").includes('t("ค่าค้างไว้")'),
    "กติกากลางต้องมีข้อความบอกว่าเป็นค่าค้าง",
  );
});

/* ---------- ไล่ให้ครบทุกจุดที่แสดงค่าเซนเซอร์ (ผู้ใช้สั่ง 21 ต.ค. 2569) ---------- */


test("ทุกจุดที่แสดงค่าต้องเรียกกติกากลาง ไม่เขียนเงื่อนไขเอง", () => {
  const sites = {
    "การ์ดเทียบใน-นอก": "../src/components/climate/EnvCompare.jsx",
    "หน้าสภาพแวดล้อม": "../src/pages/Environment.jsx",
    "หน้ารายฟาร์ม": "../src/pages/FarmBarns.jsx",
  };
  for (const [name, rel] of Object.entries(sites)) {
    assert.ok(
      srcOf(rel).includes("heldReading.js"),
      `${name} ยังไม่ได้ต่อกติกากลาง — ค่าจะหายเป็นขีดกลางตรงนั้น`,
    );
  }
});

test("ผังเซนเซอร์ต้องบอกอายุของค่าที่เก่าเกินเกณฑ์", () => {
  /* ผังนี้ไม่เคยกรองค่าเก่าอยู่แล้ว — ค่าดิบจากหลังบ้านมาเท่าไรก็ขึ้นเท่านั้น
     ปัญหาเดิมคือไม่บอกอายุ จึงอ่านได้ว่าเป็นค่าตอนนี้ทั้งที่อาจเก่าเป็นชั่วโมง */
  const src = srcOf("../src/components/climate/SensorMap.jsx");
  assert.ok(src.includes("STALE_MS"), "ต้องเทียบกับเกณฑ์ความเก่าตัวเดียวกับที่อื่น");
  assert.ok(src.includes("sm-node-held"), "ต้องมีบรรทัดบอกอายุของค่า");
});

test("หน้าภาพรวมต้องค้างค่าเฉลี่ยไว้ ไม่ใช่ขึ้นขีดกลางทั้งใบ", () => {
  const src = srcOf("../src/pages/Overview.jsx");
  assert.ok(src.includes("heldAvg"), "ต้องมีค่าเฉลี่ยจากค่าค้าง");
  assert.ok(
    /climateAvg\.held\s*\n?\s*\?/.test(src),
    "ไทล์สภาพอากาศต้องสลับไปบอกอายุเมื่อเป็นค่าค้าง ไม่ใช่โชว์ความชื้นเฉย ๆ",
  );
});

test("ทุกภาษาต้องมีคำแปลของคำว่าค่าค้าง", () => {
  for (const lang of ["en", "zh"]) {
    assert.ok(
      srcOf(`../src/lib/i18n/${lang}.js`).includes("ค่าค้างไว้:"),
      `${lang}.js ยังไม่มีคำแปล — ผู้ใช้ภาษานั้นจะเห็นคำไทยโผล่มาคำเดียว`,
    );
  }
});
