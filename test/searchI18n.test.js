/**
 * ช่องค้นหาและหัวข้อแจ้งเตือนต้องแสดงในภาษาที่ผู้ใช้เลือก (T2.1 · 18 ก.ย. 2569)
 *
 * เดิมรายการค้นหาเป็นไทยล้วน — สลับเป็นอังกฤษแล้วพิมพ์ "weather" ไม่เจออะไรเลย
 * ทั้งที่เมนูบนจอเขียนว่า Weather · หัวข้อแจ้งเตือนที่มีตัวเลขก็ค้างเป็นไทยกลางหน้าอังกฤษ
 *
 * search.js เรียกตรงจากเทสต์ไม่ได้ (ข้อมูลตัวอย่างพึ่ง import.meta.env ของ Vite)
 * จึงทดสอบตัวแปลใน searchText.js ตรง ๆ และอ่านรายการหน้าในระบบจากซอร์สมาตรวจคำแปล
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { thaiOnly, translateItem } from "../src/lib/searchText.js";
import { translate } from "../src/lib/i18n/langs.js";
import { alertText, alertTitle } from "../src/lib/api/alertText.js";

const en = (text, vars) => translate("en", text, vars);
const zh = (text, vars) => translate("zh", text, vars);
const thai = /[฀-๿]/;

test("ไม่ส่งตัวแปลมา = ไทยล้วน และเติมตัวแปรให้ถูก", () => {
  const it = translateItem(thaiOnly)({ label: "โรงเรือน A1", metaParts: ["ฟาร์ม", { key: "{n} ตัว", vars: { n: "120" } }, null] });
  assert.equal(it.label, "โรงเรือน A1");
  assert.equal(it.meta, "ฟาร์ม · 120 ตัว");
});

test("แปลส่วนย่อยของคำอธิบายแยกกัน แล้วต่อด้วยจุดคั่น", () => {
  const it = translateItem(en)({ label: "สภาพอากาศ", metaParts: [{ key: "{n} ตัว", vars: { n: "5" } }] });
  assert.ok(!thai.test(it.label) && !thai.test(it.meta), `${it.label} · ${it.meta}`);
  assert.match(it.meta, /5/);
});

test("ทุกหน้าในรายการค้นหามีคำแปลอังกฤษและจีนครบทั้งชื่อและคำอธิบาย", () => {
  const src = readFileSync(new URL("../src/lib/search.js", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("const PAGES = ["), src.indexOf("];", src.indexOf("const PAGES = [")));
  const pages = [...block.matchAll(/label: "([^"]+)"[^}]*meta: "([^"]+)"/g)].map((m) => [m[1], m[2]]);
  assert.ok(pages.length >= 10, `อ่านรายการหน้าได้แค่ ${pages.length}`);
  for (const [label, meta] of pages) {
    for (const [name, tr] of [["อังกฤษ", en], ["จีน", zh]]) {
      assert.ok(!thai.test(tr(label)), `${name}ขาด: ${label}`);
      assert.ok(!thai.test(tr(meta)), `${name}ขาด: ${meta}`);
    }
  }
});

test("หัวข้อแจ้งเตือนที่มีตัวเลขแปลได้ทุกภาษา ตัวเลขไม่หาย", () => {
  const ui = alertText({ code: "temp_c_high", metric: "temp_c", params: { value: 31.5, threshold: 30 } });
  assert.equal(alertTitle((s, v) => translate("th", s, v), ui), "อุณหภูมิสูงกว่าเกณฑ์ 1.5 °C");
  const e = alertTitle(en, ui);
  assert.ok(!thai.test(e) && e.includes("1.5"), e);
  for (const code of ["temp_c_low", "humidity_high", "humidity_low", "nh3_high"]) {
    const metric = code.split("_").slice(0, -1).join("_");
    const a = alertText({ code, metric, params: { value: 82, threshold: 75 } });
    for (const tr of [en, zh]) assert.ok(!thai.test(alertTitle(tr, a)), `${code}: ${alertTitle(tr, a)}`);
  }
});

test("หัวข้อแจ้งเตือนแบบคงที่ยังแปลผ่าน t(title) ได้", () => {
  for (const code of ["sensor_silent", "twin_hotter"]) {
    const a = alertText({ code, metric: "x", params: { metric: "temp_c", value: 30, expected: 27 } });
    assert.ok(!thai.test(alertTitle(en, a)), `${code}: ${alertTitle(en, a)}`);
  }
});

test("ทุกจุดที่แสดงหัวข้อแจ้งเตือนใช้ alertTitle ไม่ใช่ t(a.title) ตรง ๆ", () => {
  for (const f of ["Alerts.jsx", "Environment.jsx", "Twin.jsx"]) {
    const src = readFileSync(new URL(`../src/pages/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /\bt\([\w.]*\.title\)/, f);
  }
});
