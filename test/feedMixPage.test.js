/**
 * ผสมอาหารต้นทุนต่ำ (T1.294)
 *
 * ★ **บั๊กที่เจอในตัวคิดสูตรของทีม Farmy** — `feedMix.js` ไล่สัดส่วนทีละ 2.5%
 *   แต่ที่ว่างที่ต้องเติมคือ 98.5% (พรีมิกซ์กิน 1.5%) ซึ่ง 2.5 หารไม่ลงตัว
 *   โค้ดเขาปัดลงเหลือ 39 ช่อง = 97.5% ➜ สูตรรวมกับพรีมิกซ์แล้วได้ 99% ไม่ใช่ 100%
 *   ผสม "หนึ่งชุด 100 กก." จะได้ของจริง 99 กก. และหมูได้อาหารน้อยกว่าตั้งใจ 1% ทุกวัน
 *   แบบไม่มีอาการให้เห็น — เทสต์ชุดนี้ตรึงทั้งตัวบั๊กและตัวแก้ของเราไว้
 *
 * ของอื่นที่พังเงียบ ๆ:
 *   - นับราคาที่ยังไม่รู้เป็น 0 → ได้ต้นทุนต่ำกว่าจริงแต่ดูน่าเชื่อถือ ซึ่งแย่กว่าไม่บอกเลย
 *   - เติมส่วนที่ขาดจนล้ำเพดาน `max` ของวัตถุดิบ → เพดานพวกนั้นมีเหตุผลด้านสุขภาพ
 *     (รำมากไขมันซากนิ่ม · ปลาป่นมากเนื้อมีกลิ่น)
 *   - โชว์โภชนะจากค่าที่ solveMix คืนมา (คิดจาก 97.5%) คู่กับตารางที่เติมแล้ว → เลขไม่ตรงกัน
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { fillToHundred, mealSplit, summarize } from "../src/lib/farmy/feedPlan.js";
import {
  FEED_TABLE,
  INGREDIENTS,
  MEAL_PLANS,
  NUTRIENT_NEEDS,
  PREMIX,
  feedForAge,
  needsFor,
} from "../src/data/farmy/feed.js";
import { solveMix } from "../src/data/farmy/feedMix.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const page = read("../src/pages/guide/FeedMix.jsx");
const need = (id) => NUTRIENT_NEEDS.find((n) => n.id === id);
const priced = (at = 10) => INGREDIENTS.map((x) => ({ ...x, price: at }));

test("★ สูตรดิบของเขารวมไม่ถึง 100 — ตัวเติมต้องทำให้ครบพอดี", () => {
  const raw = solveMix(priced(), need("grower"), PREMIX);
  const rawSum = raw.mix.reduce((a, m) => a + m.percent, 0);
  assert.ok(rawSum + PREMIX.percent < 100, "บั๊กหายไปแล้ว — ถ้าเขาแก้ฝั่งเขา ให้ถอดตัวเติมออก");

  const plan = fillToHundred(raw.mix, PREMIX.percent);
  assert.equal(plan.total, 100);
  assert.equal(plan.gap, +(100 - PREMIX.percent - rawSum).toFixed(1));
  assert.ok(plan.filled.length > 0, "ไม่ได้บอกว่าเติมลงตัวไหน");
});

test("★ เติมลงวัตถุดิบหลัก และห้ามล้ำเพดานของวัตถุดิบนั้น", () => {
  /* เพดานมีเหตุผลด้านสุขภาพ ไม่ใช่ตัวเลขตกแต่ง */
  const plan = fillToHundred(
    [
      { id: "a", name: "ก", cp: 10, me: 3000, max: 70, percent: 68 },
      { id: "b", name: "ข", cp: 40, me: 2600, max: 35, percent: 25 },
    ],
    1.5,
  );
  const a = plan.rows.find((r) => r.id === "a");
  const b = plan.rows.find((r) => r.id === "b");
  assert.equal(a.percent, 70, "ตัวหลักต้องเติมได้แค่ถึงเพดาน");
  /* ที่ขาด = 100 - 1.5 - (68+25) = 5.5 · ตัวหลักรับได้แค่ 2 (ชนเพดาน 70) เหลือ 3.5 ไหลไป ข */
  assert.equal(b.percent, 28.5, "ส่วนที่เหลือต้องไหลไปตัวถัดไป");
  assert.equal(plan.total, 100);
  for (const row of plan.rows) assert.ok(row.percent <= row.max, `${row.id} ล้ำเพดาน`);
});

test("เติมไม่ได้ก็ต้องไม่โกหกว่าครบ", () => {
  /* ทุกตัวชนเพดานหมดแล้ว — ต้องคืนยอดจริง ไม่ใช่ดันเป็น 100 */
  const plan = fillToHundred([{ id: "a", name: "ก", cp: 10, me: 3000, max: 50, percent: 50 }], 1.5);
  assert.equal(plan.total, 51.5);
  assert.deepEqual(plan.filled, []);
});

test("สูตรที่ครบ 100 อยู่แล้วต้องไม่ถูกแตะ", () => {
  const rows = [{ id: "a", name: "ก", cp: 10, me: 3000, max: 90, percent: 98.5 }];
  const plan = fillToHundred(rows, 1.5);
  assert.equal(plan.gap, 0);
  assert.deepEqual(plan.filled, []);
  assert.equal(plan.rows[0].percent, 98.5);
});

test("★ ราคาที่ยังไม่รู้ ต้องทำให้ต้นทุนเป็นค่าว่าง ไม่ใช่นับเป็นศูนย์", () => {
  const rows = [
    { id: "a", name: "ก", cp: 10, me: 3000, percent: 60, price: 10 },
    { id: "b", name: "ข", cp: 40, me: 2600, percent: 38.5, price: null },
  ];
  assert.equal(summarize(rows, { ...PREMIX, price: 20 }).price, null, "ยังไม่รู้ราคาแต่ตอบต้นทุนมา");
  /* พรีมิกซ์ไม่รู้ราคาก็ต้องเป็นค่าว่างเหมือนกัน — มันอยู่ในทุกสูตร */
  const allPriced = rows.map((r) => ({ ...r, price: 10 }));
  assert.equal(summarize(allPriced, { ...PREMIX, price: null }).price, null);
  const ok = summarize(allPriced, { ...PREMIX, price: 20 });
  assert.equal(ok.price, +((10 * 98.5) / 100 + (20 * 1.5) / 100).toFixed(2));
});

test("★ โภชนะต้องคิดใหม่จากสูตรที่เติมแล้ว ไม่ใช้ค่าที่ solveMix คืนมา", () => {
  const raw = solveMix(priced(), need("grower"), PREMIX);
  const plan = fillToHundred(raw.mix, PREMIX.percent);
  const after = summarize(plan.rows, { ...PREMIX, price: 10 });
  assert.notEqual(after.cp, raw.cp, "เติมแล้วโภชนะต้องขยับ — ถ้าเท่าเดิมแปลว่าไม่ได้คิดใหม่");
  assert.ok(after.cp > raw.cp && after.me > raw.me);
  /* และหน้าจอต้องใช้ตัวที่คิดใหม่ */
  assert.match(page, /summarize\(plan\.rows/, "หน้าจอยังใช้ค่าจาก solveMix");
});

test("แบ่งมื้อแล้วรวมกันต้องเท่ากับปริมาณต่อวันเป๊ะ", () => {
  /* ปัดทีละมื้อแล้วรวมไม่ตรง คนจะคิดว่าเลขผิด */
  for (const n of [2, 3, 4]) {
    for (const kg of [2.4, 3, 0.5, 1.37]) {
      const rows = mealSplit(MEAL_PLANS[n], kg);
      assert.equal(rows.length, n);
      assert.equal(+rows.reduce((a, m) => a + m.kg, 0).toFixed(2), +kg.toFixed(2), `${n} มื้อ ${kg} กก.`);
    }
  }
  assert.deepEqual(mealSplit(MEAL_PLANS[3], 0), []);
});

test("สัดส่วนของทุกแผนมื้อต้องรวมได้ 100%", () => {
  for (const [n, plan] of Object.entries(MEAL_PLANS)) {
    assert.equal(plan.reduce((a, m) => a + m.share, 0), 100, `แผน ${n} มื้อ`);
  }
});

test("★ พรีมิกซ์ต้องอยู่ในสูตรเสมอ ติ๊กออกไม่ได้", () => {
  /* สูตรที่โปรตีนพอแต่ขาดแร่ธาตุ ทำให้ขาหัก กระดูกอ่อน โตไม่ดี */
  const list = page.slice(page.indexOf('<ul className="gd-ings">'), page.indexOf("</ul>"));
  assert.match(list, /is-fixed/, "พรีมิกซ์ไม่ได้ถูกตรึงไว้ในรายการ");
  assert.doesNotMatch(
    page,
    /toggle\(PREMIX\.id\)/,
    "มีทางติ๊กพรีมิกซ์ออกได้",
  );
  assert.match(page, /PREMIX\.percent/, "หน้าจอไม่ได้ใส่พรีมิกซ์ลงในตาราง");
});

test("เกณฑ์โภชนะต้องเลือกตามน้ำหนักได้ถูกช่วง", () => {
  assert.equal(needsFor(10).id, "nursery");
  assert.equal(needsFor(15).id, "nursery");
  assert.equal(needsFor(16).id, "starter");
  assert.equal(needsFor(60).id, "grower");
  assert.equal(needsFor(100).id, "finisher");
  /* แม่พันธุ์เลือกจากประเภทเท่านั้น ห้ามหลุดมาจากน้ำหนัก */
  assert.notEqual(needsFor(400).id, "sow");
});

test("★ ค่าที่อยู่นอกช่วงตารางต้องถูกทำเครื่องหมายว่าเป็นค่าประมาณ", () => {
  /* ยืดเส้นออกไปนอกตารางแล้วไม่บอก คนจะอ่านว่าเอกสารรับรองค่านั้น */
  assert.equal(feedForAge(FEED_TABLE[0].age - 10).estimated, true);
  assert.equal(feedForAge(FEED_TABLE[FEED_TABLE.length - 1].age + 30).estimated, true);
  assert.equal(feedForAge(120).estimated, false);
  assert.match(page, /row\.estimated/, "หน้าจอไม่ได้เตือนว่าเป็นค่าประมาณ");
});

test("ทุกกล่องบนหน้าต้องมีที่วางในเลย์เอาต์ตั้งต้น", () => {
  const preset = read("../src/lib/layout/presets.js");
  /* ชื่อนี้ขึ้นสองที่ — ใน BOARDS และในเลย์เอาต์ตั้งต้น ต้องเอาตัวหลัง */
  const start = preset.lastIndexOf("guideFeedMix: {");
  /* จบบล็อกที่ `\n  },` — ใช้ "}," เฉย ๆ จะไปชนท้ายบรรทัดของกล่องแรก */
  const block = preset.slice(start, preset.indexOf("\n  },", start));
  const ids = [...page.matchAll(/<Block id="([a-z]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 5, "จำนวนกล่องเปลี่ยน — ต้องอัปเดตเลย์เอาต์ตั้งต้นด้วย");
  for (const id of ids) {
    assert.ok(block.includes(`${id}: {`), `กล่อง "${id}" ไม่มีในเลย์เอาต์ตั้งต้น guideFeedMix`);
  }
  assert.ok(preset.includes('guideFeedMix: { id: "guideFeedMix"'), "ยังไม่ได้ลงทะเบียนใน BOARDS");
});
