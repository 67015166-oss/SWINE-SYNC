/**
 * การ์ดที่วาดจากทะเบียนชนิดค่า (T1.346) — ตรวจแบบเดียวกับเทสต์หน้าจออื่นในโปรเจกต์
 *
 * ของที่พังเงียบ ๆ ในงานนี้
 *   - ไทล์ขึ้นป้าย "อยู่ในเกณฑ์" ให้ค่าที่ยังไม่มีเกณฑ์ → เซนเซอร์ใหม่เขียวทั้งแถบวันแรก
 *   - ลืมต่อ `extras` เข้าหน้าจอ → ทะเบียนทำงานถูกแต่ไม่มีใครเห็นผล
 *   - ใช้ชื่อโทเคนสีที่ไม่มีใน tokens.css → หน้าไม่พัง แต่สีเพี้ยนเฉพาะบางธีม
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const srcOf = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const tiles = srcOf("../src/components/metrics/MetricTiles.jsx");
const chart = srcOf("../src/components/metrics/MetricChart.jsx");
const css = srcOf("../src/components/metrics/metrics.css");
const tokens = srcOf("../src/styles/tokens.css");
const envPage = srcOf("../src/pages/Environment.jsx");

test("ไทล์ต้องขึ้นป้ายสถานะเฉพาะตอนมีเกณฑ์", () => {
  /* ป้ายต้องอยู่หลังเงื่อนไข status ซึ่ง statusOf คืน null เมื่อไม่มีเกณฑ์ */
  assert.ok(/\{status && \(\s*<StatusBadge/.test(tiles), "ป้ายต้องผูกกับ status ไม่ใช่ขึ้นตลอด");
  assert.ok(tiles.includes('t("ยังไม่ได้ตั้งเกณฑ์")'), "ค่าที่ไม่มีเกณฑ์ต้องบอกตรง ๆ ว่ายังไม่ได้ตั้ง");
});

test("ไทล์ต้องใช้กติกาค่าค้างตัวเดียวกับทั้งระบบ", () => {
  assert.ok(tiles.includes("heldReading.js"), "ห้ามเขียนเงื่อนไขค่าค้างขึ้นมาเอง");
});

test("ไทล์ต้องหยิบไอคอนกับหน่วยจากทะเบียน ไม่ใช่เขียนตาย", () => {
  assert.ok(tiles.includes("spec.icon"), "ไอคอนต้องมาจากทะเบียน");
  assert.ok(tiles.includes("spec.unit"), "หน่วยต้องมาจากทะเบียน");
  assert.ok(tiles.includes("spec.decimals"), "ทศนิยมต้องมาจากทะเบียน");
});

test("กราฟต้องมีแกน Y เดียว และวาดแถบเกณฑ์เฉพาะตอนมีเกณฑ์ครบสองฝั่ง", () => {
  assert.equal((chart.match(/<YAxis/g) ?? []).length, 1, "กติกาใน CLAUDE.md ห้าม dual-axis");
  assert.ok(
    /range\?\.min != null && range\?\.max != null && \(\s*<ReferenceArea/.test(chart),
    "มีเกณฑ์ด้านเดียวแล้ววาดแถบ จะกินทั้งกราฟและอ่านผิด",
  );
});

test("กราฟที่ไม่มีจุดต้องบอกว่าไม่มีข้อมูล ไม่ใช่วาดเส้นเปล่า", () => {
  assert.ok(chart.includes('t("ยังไม่มีข้อมูลย้อนหลังของค่านี้")'));
});

test("สีกราฟต้องมาจาก chartTheme ไม่ใช่ hex ในคอมโพเนนต์", () => {
  assert.ok(chart.includes("SERIES"), "สี series ต้องเรียงตาม chartTheme");
  assert.ok(!/#[0-9a-fA-F]{3,6}/.test(chart), "ห้ามเขียน hex ตรง ๆ ตามกติกาใน CLAUDE.md");
});

test("ทุกโทเคนสีที่ใช้ ต้องมีอยู่จริงใน tokens.css", () => {
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);
  const missing = [...new Set(used)].filter(
    (v) => !tokens.includes(`${v}:`) && !css.includes(`${v}:`),
  );
  assert.deepEqual(missing, [], `โทเคนที่ไม่มีจริง: ${missing.join(", ")}`);
});

test("หน้าสภาพแวดล้อมต้องต่อ extras เข้าหน้าจอแล้ว", () => {
  /* ทะเบียนทำงานถูกแต่ไม่มีใครเรียกใช้ = ผู้ใช้ไม่เห็นผลอะไรเลย */
  assert.ok(envPage.includes("MetricTiles"), "ยังไม่ได้ต่อการ์ดเข้าหน้าจอ");
  assert.ok(envPage.includes("extras?.inside"), "ต้องส่งค่าที่ยังไม่รู้จักเข้าการ์ด");
  assert.ok(envPage.includes("extras?.outdoor"));
});

test("ไทล์ต้องตัดสินความเก่าของค่าเอง", () => {
  /* ★ เจอจากการตรวจบนหน้าจอจริง: ค่าที่มาทาง extras ยังไม่ผ่านการกรองความเก่า
     ไทล์เคยเอาค่าอายุ 40 นาทีไปเทียบเกณฑ์แล้วขึ้นป้าย "อยู่ในเกณฑ์" เหมือนค่าสด */
  assert.ok(tiles.includes("STALE_MS"), "ต้องเทียบกับเกณฑ์ความเก่าตัวเดียวกับที่อื่น");
  assert.ok(
    /statusOf\(spec\.key, live/.test(tiles),
    "ต้องตัดสินสถานะจากค่าที่ยังสด ไม่ใช่ค่าดิบ ไม่งั้นเซนเซอร์เงียบจะขึ้นเขียว",
  );
});

/* ---------- ฟอร์มตั้งเกณฑ์ของค่าชนิดใหม่ ---------- */

const provider = srcOf("../src/lib/settings/SettingsProvider.jsx");

test("เกณฑ์ที่ตั้งเองต้องกันไว้ที่ Provider ด้วย ไม่ใช่กันแค่ที่ปุ่ม", () => {
  /* กติกาใน CLAUDE.md — การเขียนที่ทุกคนเห็นตาม ต้องมีด่านที่ Provider
     พิสูจน์แล้วบนหน้าจอจริง: ปลดเช็กที่ปุ่มอย่างเดียวยังบันทึกไม่ได้ */
  assert.ok(
    /if \(!canRules\) return blocked\(`setMetricRange/.test(provider),
    "ไม่มีด่านที่ Provider — ปลดปุ่มได้เมื่อไรก็เขียนทับเกณฑ์ของทุกคนได้",
  );
});

test("เกณฑ์ที่อ่านจากเครื่องต้องผ่านตัวกรองก่อนใช้", () => {
  assert.ok(provider.includes("sanitizeMetricRanges"), "ของใน localStorage แก้มือได้ ต้องกรองก่อน");
  assert.ok(provider.includes("METRIC_KEY"), "คีย์เปิด จึงต้องจำกัดรูปแบบชื่อ");
  assert.ok(provider.includes("MAX_METRIC_RANGES"), "ต้องจำกัดจำนวน กันของโตไม่รู้จบ");
});

test("ปุ่มตั้งเกณฑ์ต้องขึ้นเฉพาะค่าที่ยังไม่มีเกณฑ์จากทะเบียน", () => {
  /* ค่าหลักอย่างอุณหภูมิมีหน้าตั้งค่าของตัวเองอยู่แล้ว
     ถ้าแก้ได้สองที่จะมีเกณฑ์สองชุดที่ขัดกันโดยไม่มีใครรู้ว่าอันไหนใช้จริง */
  assert.ok(/!spec\.range && \(/.test(tiles), "ปุ่มต้องผูกกับการไม่มีเกณฑ์ในทะเบียน");
});

test("ไม่มีสิทธิ์ต้องบอกว่าต้องใช้สิทธิ์ระดับไหน ไม่ใช่ซ่อนปุ่มทิ้ง", () => {
  assert.ok(tiles.includes("AdminNote"), "กติกาใน CLAUDE.md ห้ามซ่อนปุ่มเฉย ๆ");
  assert.ok(tiles.includes('action="rules.write"'), "ต้องบอกสิทธิ์ที่ต้องใช้ให้ตรง");
});

test("ฟอร์มต้องตรวจค่าที่กรอกก่อนบันทึก", () => {
  for (const msg of ["กรอกเป็นตัวเลข", "กรอกอย่างน้อยหนึ่งช่อง", "ค่าต่ำสุดต้องน้อยกว่าค่าสูงสุด"]) {
    assert.ok(tiles.includes(`t("${msg}")`), `ขาดการตรวจ: ${msg}`);
  }
  assert.ok(tiles.includes('role="alert"'), "ข้อความผิดพลาดต้องประกาศให้โปรแกรมอ่านหน้าจอรู้");
});

test("key ของไทล์ต้องไม่ผูกกับเวลา", () => {
  /* ★ เจอจากการกดทดสอบบนหน้าจอจริง — key ที่มีเวลาอยู่ด้วยทำให้ React สร้างไทล์ใหม่
     ทุกครั้งที่ข้อมูลรีเฟรช ฟอร์มที่เปิดค้างอยู่จะปิดเองพร้อมเลขที่พิมพ์ไปแล้ว */
  assert.ok(tiles.includes("key={spec.key}"), "key ต้องเป็นชื่อค่าอย่างเดียว");
  assert.ok(!/key=\{`\$\{spec\.key\}-\$\{at/.test(tiles), "key ห้ามผสมเวลา");
});

test("ทุกภาษาต้องมีคำแปลของข้อความในฟอร์ม", () => {
  for (const lang of ["en", "zh"]) {
    const src = srcOf(`../src/lib/i18n/${lang}.js`);
    for (const key of ["ตั้งเกณฑ์", "แก้เกณฑ์", "ลบเกณฑ์", "กรอกเป็นตัวเลข"]) {
      assert.ok(src.includes(`${key}:`), `${lang}.js ขาดคำแปลของ "${key}"`);
    }
  }
});
