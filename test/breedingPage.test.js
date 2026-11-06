/**
 * ผสมพันธุ์ & สายพันธุ์ (T1.293)
 *
 * ★ เลขที่ออกจากหน้านี้คือ **กำหนดคลอด** ผิดหนึ่งวันแปลว่าคนเตรียมคอกคลอดผิดวัน
 *   และผิดแบบไม่มีอาการให้เห็น — ปฏิทินที่เลื่อนไปวันเดียวยังดูสมเหตุสมผลทุกประการ
 *
 * ของอื่นที่พังเงียบ ๆ ในหน้านี้:
 *   - เส้นทางรูปของทีม Farmy เขียนไว้ `/breeds/x.svg` แต่ของเราอยู่ `public/farmy/breeds/`
 *     ถ้าเอาไปใช้ตรง ๆ จะได้กรอบรูปแตกทั้งหน้า และแอปที่ขึ้นในโฟลเดอร์ย่อยจะพังคนละแบบอีก
 *   - ซ่อน `cautions` แล้วเหลือแต่ข้อดี = กลายเป็นโฆษณา ไม่ใช่คำแนะนำ
 *   - หน้าตาของหน้านี้เหมือน "ระบบคำนวณให้จากข้อมูลฟาร์ม" ทั้งที่ยังไม่ได้ดูข้อมูลฝูงเลย
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { addDays, timelineFor, todayIso } from "../src/lib/farmy/breedingDates.js";
import {
  BREEDING_TIMELINE,
  BREEDS,
  DAM_OPTIONS,
  GOALS,
  recommendSire,
} from "../src/data/farmy/breeding.js";
import { iconFor } from "../src/data/farmy/icons.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const page = read("../src/pages/guide/Breeding.jsx");

test("★ นับ 114 วันต้องข้ามเดือนและข้ามปีได้ถูก", () => {
  assert.equal(addDays("2026-09-29", 114), "2027-01-21");
  assert.equal(addDays("2026-01-01", 114), "2026-04-25");
  /* ปีอธิกสุรทิน — 2028 มี 29 ก.พ. ถ้าลืมไปวันหนึ่งจะเห็นตรงนี้ */
  assert.equal(addDays("2028-01-01", 114), "2028-04-24");
  assert.equal(addDays("2027-01-01", 114), "2027-04-25");
});

test("★ บวกวันตามปฏิทิน ไม่ใช่บวกมิลลิวินาที", () => {
  /* ช่วง 114 วันคร่อมการเปลี่ยนเวลาของหลายเขตเวลา — ถ้าคำนวณด้วย 86400000
     ผลจะขาดหรือเกินไปหนึ่งชั่วโมง แล้วปัดวันเพี้ยนไปทั้งวัน
     (ไทยไม่มี DST แต่เบราว์เซอร์ใช้เขตเวลาของเครื่อง ซึ่งเราไม่ได้เป็นคนกำหนด) */
  /* ตัดคอมเมนต์ออกก่อนตรวจ — คำอธิบายในไฟล์พูดถึง 86400000 ได้ ห้ามแค่ในโค้ดจริง */
  const lib = read("../src/lib/farmy/breedingDates.js")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(lib, /86_?400_?000|24 \* 60 \* 60/, "ยังบวกวันด้วยมิลลิวินาที");
  /* เดินทีละวันจากวันผสมต้องได้ผลเท่ากับบวกทีเดียว */
  let step = "2026-10-25";
  for (let i = 0; i < 114; i += 1) step = addDays(step, 1);
  assert.equal(step, addDays("2026-10-25", 114));
});

test("วันที่ที่ไม่มีจริงต้องคืนค่าว่าง ไม่ใช่วันที่อื่นที่ดูสมเหตุสมผล", () => {
  /* JS จะเลื่อน 2026-02-31 ให้เป็น 3 มี.ค. เองแบบไม่บอกอะไร — อันตรายกว่าค่าว่าง */
  assert.equal(addDays("2026-02-31", 0), null);
  assert.equal(addDays("2026-13-01", 0), null);
  assert.equal(addDays("", 114), null);
  assert.equal(addDays("2026-09-29", 1.5), null);
  /* 2569 (2026) ไม่ใช่ปีอธิกสุรทิน — 28 ก.พ. + 1 ต้องเป็น 1 มี.ค. ไม่ใช่ 29 ก.พ. */
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
});

test("ไทม์ไลน์ต้องเติมวันที่ครบทุกหมุด และหมุดคลอดต้องเป็นวันที่ 114", () => {
  const rows = timelineFor("2026-09-29", BREEDING_TIMELINE);
  assert.equal(rows.length, BREEDING_TIMELINE.length);
  assert.ok(rows.every((r) => typeof r.date === "string"), "มีหมุดที่ไม่ได้วันที่");
  const birth = rows.find((r) => r.label.includes("คลอด") && r.day === 114);
  assert.ok(birth, "ไม่มีหมุดกำหนดคลอดที่วันที่ 114 แล้ว — เลขนี้คือหัวใจของเครื่องนับ");
  assert.equal(birth.date, "2027-01-21");
  /* วันที่ผสมใช้ไม่ได้ ทุกหมุดต้องว่างพร้อมกัน ไม่ใช่บางหมุดมีบางหมุดไม่มี */
  assert.ok(timelineFor("", BREEDING_TIMELINE).every((r) => r.date === null));
});

test("todayIso ให้รูปแบบเดียวกับช่องกรอกวันที่ของเบราว์เซอร์", () => {
  assert.equal(todayIso(new Date(2026, 8, 29)), "2026-09-29");
  assert.equal(todayIso(new Date(2026, 0, 5)), "2026-01-05");
  assert.match(todayIso(), /^\d{4}-\d{2}-\d{2}$/);
});

test("★ รูปสายพันธุ์ต้องประกอบ URL ใหม่ ไม่ใช้เส้นทางในข้อมูลของเขาตรง ๆ", () => {
  assert.match(page, /BASE_URL\}farmy\/breeds\//, "ไม่ได้ประกอบเส้นทางรูปผ่าน BASE_URL");
  /* ข้อมูลของเขาต้องไม่ถูกแก้ให้ path ตรง — คำเตือนที่หัวไฟล์เขาห้ามไว้ */
  const data = read("../src/data/farmy/breeding.js");
  assert.match(data, /img: '\/breeds\//, "ไฟล์ข้อมูลของทีม Farmy ถูกแก้เส้นทางรูป");
});

test("★ ข้อควรระวังและทางเลือกสำรองต้องอยู่บนหน้า ไม่ถูกพับเก็บ", () => {
  assert.match(page, /plan\.cautions/, "ไม่ได้แสดงข้อควรระวังของคำแนะนำ");
  assert.match(page, /plan\.alt/, "ไม่ได้แสดงทางเลือกสำรอง");
  /* และคู่ที่ข้อมูลของเขามีคำเตือนไว้ ต้องยังมีคำเตือนอยู่จริง */
  const duroc = recommendSire("duroc", "fatten");
  assert.ok(duroc.cautions.length > 0, "คู่ที่เคยมีคำเตือน กลายเป็นไม่มีคำเตือนแล้ว");
});

test("★ ต้องบอกว่าคำแนะนำไม่ได้คิดจากข้อมูลฝูงนี้", () => {
  /* หน้าตาของมันเหมือนระบบคำนวณให้ ซึ่งชวนเข้าใจผิดว่าดูประวัติผสมของคอกเราแล้ว */
  assert.match(page, /ไม่ได้คิดจากประวัติผสม/, "หน้าไม่ได้บอกว่าเป็นคำแนะนำทั่วไปจากเอกสาร");
  assert.match(page, /SOURCE_NOTE/, "หน้าไม่ได้แสดงที่มาของเนื้อหา");
});

test("ทุกคู่ของแม่พันธุ์ × เป้าหมาย ต้องมีคำแนะนำ", () => {
  /* ปุ่มที่กดแล้วไม่มีอะไรขึ้นคือปุ่มเสีย — ถ้าเขาเพิ่มตัวเลือกใหม่ เทสต์นี้จะบอกก่อน */
  for (const d of DAM_OPTIONS) {
    for (const g of GOALS) {
      const r = recommendSire(d.id, g.id);
      assert.ok(r, `ไม่มีคำแนะนำสำหรับ ${d.id} × ${g.id}`);
      assert.ok(r.sire?.img && r.out && r.why.length > 0, `คำแนะนำ ${d.id} × ${g.id} ไม่ครบ`);
    }
  }
  /* คู่ที่ไม่มีจริงต้องคืน null ให้หน้าจอจับได้ ไม่ใช่โยน error */
  assert.equal(recommendSire("ไม่มีพันธุ์นี้", "fatten"), null);
});

test("ไอคอนของปุ่มเป้าหมายต้องจับคู่ไว้ และต้องไม่ซ้ำกัน", () => {
  /* สองปุ่มนี้อยู่ติดกัน ไอคอนซ้ำกันเมื่อไรก็เลิกช่วยแยกว่าปุ่มไหนคือปุ่มไหน */
  const icons = GOALS.map((g) => iconFor(g.icon));
  for (const [i, name] of icons.entries()) {
    assert.notEqual(name, "info", `ยังไม่ได้จับคู่ไอคอน ${GOALS[i].icon}`);
  }
  assert.equal(new Set(icons).size, icons.length, "ปุ่มเป้าหมายใช้ไอคอนซ้ำกัน");
});

test("รูปของทุกสายพันธุ์ต้องมีไฟล์อยู่จริง", () => {
  const dir = new URL("../public/farmy/breeds/", import.meta.url).pathname;
  const files = new Set(readdirSync(dir));
  for (const b of [...BREEDS, ...DAM_OPTIONS]) {
    assert.ok(files.has(b.img.split("/").pop()), `ไม่มีไฟล์รูปของ ${b.name}`);
  }
});
