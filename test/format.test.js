/**
 * เทสต์ของ `lib/format.js` และของ "รายชื่อหน้า" ที่ช่องค้นหาใช้
 *
 * ทุกเคสมาจากบั๊กที่เจอจริงตอนไล่ตรวจก่อนส่งงาน (10 ก.ย. 2569) ไม่ใช่เคสที่คิดขึ้นเอง
 * — ตามกติกาเดียวกับ test/pure.test.js
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  formatNumber,
  formatNumber1,
  formatNumber2,
  formatBaht,
  formatDateShort,
} from "../src/lib/format.js";
import { SECTIONS } from "../src/lib/theme/themes.js";
import { shiftDate, shiftMonth } from "../src/data/mock/asOf.js";

/* ---------- ค่าว่างเคยกลายเป็น "0" กับ "NaN" กลางการ์ด ---------- */

test("ไม่มีค่า ต้องเป็นขีดกลาง — ห้ามกลายเป็นศูนย์", () => {
  /* ของจริงที่อันตรายที่สุด: `Intl.NumberFormat().format(null)` คืน "0"
     ฟิลด์ที่เซนเซอร์/หลังบ้านยังไม่ส่งมาจึงขึ้นหน้าจอว่า "0 ตัว" · "฿0"
     ซึ่งอ่านแล้วเข้าใจว่า "วัดได้ และได้ศูนย์" ทั้งที่ความจริงคือ "ยังไม่มีข้อมูล" */
  assert.equal(formatNumber(null), "—");
  assert.equal(formatBaht(null), "—");
  assert.equal(formatNumber1(null), "—");
  assert.equal(formatNumber2(null), "—");
});

test("ค่าที่หายไป ต้องไม่ทำให้คำว่า NaN โผล่บนจอ", () => {
  /* `format(undefined)` คืน "NaN" · `format("ห้าสิบ")` ก็คืน "NaN" เหมือนกัน */
  assert.equal(formatNumber(undefined), "—");
  assert.equal(formatNumber1(undefined), "—");
  assert.equal(formatBaht(undefined), "—");
  assert.equal(formatNumber("ห้าสิบ"), "—");
  assert.equal(formatNumber(""), "—");
  assert.equal(formatNumber(Number.NaN), "—");
  assert.equal(formatNumber(Number.POSITIVE_INFINITY), "—");
});

test("ศูนย์จริง ๆ ยังต้องเป็น 0 ไม่ใช่ขีดกลาง", () => {
  /* ฝนสะสม 0.0 มม. กับลม 0.0 m/s เป็นค่าที่วัดได้จริง คนละเรื่องกับ "ไม่มีค่า" */
  assert.equal(formatNumber(0), "0");
  assert.equal(formatNumber1(0), "0.0");
  assert.equal(formatBaht(0), "฿0");
});

test("ตัวเลขปกติและสตริงตัวเลข ยัง format ได้เหมือนเดิม", () => {
  assert.equal(formatNumber(3918), "3,918");
  assert.equal(formatNumber("3918"), "3,918");
  assert.equal(formatNumber1(28.456), "28.5");
  assert.equal(formatNumber2(2.4567), "2.46");
  assert.equal(formatBaht(125000), "฿125,000");
});

test("วันที่ที่ใช้ไม่ได้ ต้องเป็นขีดกลาง ไม่ใช่ throw ทั้งหน้า", () => {
  /* `Intl.DateTimeFormat.format()` โยน RangeError — เคยทำให้หน้าฟาร์มขาวทั้งหน้า */
  assert.equal(formatDateShort(null), "—");
  assert.equal(formatDateShort(undefined), "—");
  assert.equal(formatDateShort("ไม่ใช่วันที่"), "—");
});

/* ---------- ช่องค้นหาเคยเก่ากว่าตัวแอป ---------- */

test("ทุกส่วนงานใน SECTIONS ต้องมีอยู่ในรายชื่อหน้าของช่องค้นหา", () => {
  /* ของจริง: พิมพ์ "กล้อง" หรือ "สภาพอากาศ" ในช่องค้นหาแล้วได้ผลลัพธ์ว่าง
     ทั้งที่ทั้งสองหน้าเปิดได้จริงและมีเมนูซ้ายพาไป — รายชื่อใน search.js ถูกเขียนมือ
     แล้วไม่ได้ตามเวลาเพิ่มหน้าใหม่

     อ่าน search.js เป็น "ตัวหนังสือ" ไม่ได้ import เข้ามา เพราะมันลากไปถึง
     lib/asset.js ซึ่งต้องมี import.meta.env ของ vite (Node เปล่า ๆ รันไม่ได้) */
  const source = readFileSync(new URL("../src/lib/search.js", import.meta.url), "utf8");
  const missing = Object.entries(SECTIONS)
    .filter(([, section]) => section.to && !source.includes(`to: "${section.to}"`))
    /* หน้ารายการโรงเรือนใช้ค่าคงที่ BARNS_HOME ไม่ได้เขียน path ตรง ๆ */
    .filter(([id]) => id !== "barns")
    .map(([id]) => id);
  assert.deepEqual(missing, [], `หน้าที่ค้นหาไม่เจอ: ${missing.join(", ")}`);
});

/* ---------- ข้อมูลตัวอย่างเคยค้างอยู่ที่ 3 ส.ค. 2569 ---------- */

test("วันที่ล่าสุดของข้อมูลตัวอย่าง ต้องเป็น 'วันนี้' เสมอ", () => {
  /* ของจริง: เปิดดูวันที่ 10 ก.ย. แล้วหน้าฝูงสุกรขึ้น "ข้อมูล ณ 1 ส.ค."
     หน้าการเงินขึ้น "เดือนล่าสุด ก.ค." — อ่านแล้วเข้าใจว่าระบบหยุดส่งข้อมูลไปแล้ว */
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate(),
  ).padStart(2, "0")}`;
  assert.equal(shiftDate("2026-08-03"), iso);
  assert.equal(shiftDate("2026-08-03T10:17:00"), `${iso}T10:17:00`);
});

test("เลื่อนแล้วระยะห่างระหว่างวันต้องเท่าเดิมทุกคู่", () => {
  /* ถ้าระยะเพี้ยน ชุดเลี้ยงจะอายุเปลี่ยน และเหตุการณ์จะสลับลำดับกัน */
  const day = (iso) => new Date(`${iso}T00:00:00`).getTime() / 86_400_000;
  const before = ["2026-04-18", "2026-07-18", "2026-07-30", "2026-08-03"];
  const after = before.map(shiftDate);
  for (let i = 1; i < before.length; i += 1) {
    assert.equal(day(after[i]) - day(after[i - 1]), day(before[i]) - day(before[i - 1]));
  }
});

test("ไม่มีวันไหนถูกเลื่อนไปเป็นอนาคต", () => {
  /* วันที่ใหม่ที่สุดในชุดคือตัวยึด (3 ส.ค.) ทุกตัวจึงต้องอยู่ที่วันนี้หรือก่อนหน้า
     ข้อมูลตัวอย่างที่ลงวันที่ล่วงหน้าจะอ่านเหมือนระบบทำนายอดีตย้อนหลัง */
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  for (const iso of ["2026-08-03T10:17:00", "2026-08-01", "2026-07-18", "2026-02-01"]) {
    assert.ok(new Date(shiftDate(iso)) <= endOfToday, `${iso} → ${shiftDate(iso)}`);
  }
});

test("กราฟรายเดือน: เดือนล่าสุดยังเป็น 'เดือนที่แล้ว' เหมือนที่ออกแบบไว้", () => {
  /* ตัวยึดคือ 3 ส.ค. และเดือนล่าสุดของกราฟคือ ก.ค. = เดือนก่อนหน้าเต็มเดือน
     ความสัมพันธ์นี้ต้องอยู่เหมือนเดิมไม่ว่าจะเปิดดูเดือนไหน */
  const now = new Date();
  const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  assert.equal(shiftMonth("2026-08"), expected);
  const [y, m] = shiftMonth("2026-07").split("-").map(Number);
  assert.equal(y * 12 + m, now.getFullYear() * 12 + now.getMonth());
});
