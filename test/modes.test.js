/**
 * โหมดโทนสีทั้ง 20 ต้องอ่านออกจริง — ตรวจอัตราคอนทราสต์จาก `styles/modes.css` โดยตรง
 *
 * **ทำไมต้องเป็นเทสต์ ไม่ใช่ตรวจด้วยตา** — โหมดสีเพิ่มได้เรื่อย ๆ และคนเพิ่มมักดูแค่ว่า
 * "สวยไหม" ซึ่งไม่ได้แปลว่าอ่านออกบนจอกลางแดดหน้าโรงเรือน เกณฑ์ตัวเลขจับได้ตั้งแต่ก่อน merge
 *
 * เกณฑ์อ้าง WCAG 2.1:
 *   4.5:1 = ตัวอักษรขนาดปกติ · 3:1 = ตัวอักษรใหญ่และองค์ประกอบกราฟิก (ไอคอน เส้นขอบ)
 * จึงแยกกันว่า token ไหนใช้เป็น "ตัวหนังสือ" และ token ไหนใช้เป็น "ไอคอน/กราฟิก"
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles/modes.css", import.meta.url), "utf8");

/** อ่านทุกบล็อก [data-mode="…"] ออกมาเป็น { ชื่อโหมด: { token: ค่า } } */
function parseModes(source) {
  const out = {};
  const block = /\[data-mode="([a-z]+)"\]\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = block.exec(source))) {
    const tokens = {};
    for (const [, k, v] of m[2].matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) tokens[k] = v.trim();
    out[m[1]] = tokens;
  }
  return out;
}

const rgb = (hex) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
};

const luminance = (c) => {
  const f = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};

/** อัตราคอนทราสต์ตามสูตร WCAG — คืน null ถ้าค่าใดไม่ใช่ hex (เช่น gradient) */
export function contrast(a, b) {
  const ca = rgb(a ?? "");
  const cb = rgb(b ?? "");
  if (!ca || !cb) return null;
  const la = luminance(ca);
  const lb = luminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* [ชื่อที่อ่านรู้เรื่อง, สีหน้า, สีพื้น, เกณฑ์] */
const RULES = [
  ["ตัวหนังสือหลักบนการ์ด", "--ink-primary", "--bg-surface", 7],
  ["ตัวหนังสือหลักบนพื้นหน้า", "--ink-primary", "--bg-page", 7],
  ["ตัวหนังสือรองบนการ์ด", "--ink-secondary", "--bg-surface", 4.5],
  ["ตัวหนังสือรองบนแถวสลับ", "--ink-secondary", "--bg-tint", 4.5],
  ["ตัวหนังสือรองบนกล่องจม", "--ink-secondary", "--bg-sunken", 4.5],

  /* ★ --ink-muted เคยคุมไว้ที่ 3:1 และวัดกับพื้นการ์ดขาวเท่านั้น จึงเขียวมาตลอด
     ทั้งที่ของจริงตก 18/20 โหมด (T1.319) สองเรื่องที่ผิด:
       1. 3:1 เป็นเกณฑ์ของกราฟิก แต่ muted ถูกใช้เป็นตัวหนังสือ รวมถึงตัวเลขบนแกนกราฟ
          (chartTheme.js: tick.fill 13px) จึงต้อง 4.5:1
       2. พื้นการ์ดขาวเป็นพื้นที่ง่ายที่สุด ของจริงที่แย่สุดคือ bg-sunken กับ bg-tint
     ห้ามลดเกณฑ์กลับ — ถ้าสีใหม่ไม่ผ่าน ให้เปลี่ยนไปใช้ --ink-secondary ที่จุดนั้น */
  ["ป้ายเล็กบนการ์ด", "--ink-muted", "--bg-surface", 4.5],
  ["ป้ายเล็กบนพื้นหน้า", "--ink-muted", "--bg-page", 4.5],
  ["ป้ายเล็กบนแถวสลับ", "--ink-muted", "--bg-tint", 4.5],
  ["ป้ายเล็กบนกล่องจม", "--ink-muted", "--bg-sunken", 4.5],
  ["ลิงก์/ปุ่มบนการ์ด", "--accent", "--bg-surface", 4.5],
  ["ลิงก์/ปุ่มบนพื้นหน้า", "--accent", "--bg-page", 4.5],
  ["สถานะ hover บนการ์ด", "--accent-strong", "--bg-surface", 4.5],
  /* accent บนพื้น tint เป็น "ไอคอนในกรอบ" = กราฟิก เกณฑ์ 3:1
     ส่วนตัวหนังสือบนพื้น tint (เมนูที่เลือกอยู่) ใช้ accent-strong จึงคุม 4.5:1 แยกกัน */
  ["ไอคอนในกรอบ", "--accent", "--accent-tint", 3],
  ["ตัวหนังสือบนแถบที่เลือก", "--accent-strong", "--accent-tint", 4.5],
  ["ตัวหนังสือบนปุ่มทึบ", "--ink-inverse", "--accent", 4],
  ["สีเขียวบนการ์ด (กราฟิก)", "--green", "--bg-surface", 3],
  ["สีเขียวเข้ม (ตัวหนังสือ)", "--green-strong", "--bg-surface", 4.5],
];

const modes = parseModes(css);

test("modes.css: มีครบ 20 โหมด และทุกโหมดมี token ครบชุด", () => {
  const names = Object.keys(modes);
  assert.equal(names.length, 20, `เจอ ${names.length} โหมด`);
  const needed = RULES.flatMap(([, fg, bg]) => [fg, bg]);
  for (const name of names) {
    for (const token of new Set(needed)) {
      assert.ok(modes[name][token], `โหมด ${name} ไม่มี ${token}`);
    }
  }
});

for (const [name, tokens] of Object.entries(modes)) {
  test(`โหมด "${name}": อัตราคอนทราสต์ผ่านเกณฑ์ทุกคู่`, () => {
    for (const [label, fg, bg, need] of RULES) {
      const r = contrast(tokens[fg], tokens[bg]);
      assert.ok(r !== null, `${name}: ${label} อ่านค่าสีไม่ได้`);
      assert.ok(
        r >= need,
        `${name}: ${label} ได้ ${r.toFixed(2)}:1 ต้องการอย่างน้อย ${need}:1`,
      );
    }
  });
}

/* ============================================================
   ตัวหนังสือบน "พื้นสถานะ" — คู่ที่ token ชั้นเดียวตรวจไม่เจอ

   ★ ทำไมต้องมีชุดนี้แยก — `--status-*-bg` อยู่ในชั้น [data-scheme] (สว่าง/มืด)
   ส่วน `--ink-*` อยู่ในชั้น [data-mode] การตรวจทีละบล็อกจึงไม่เคยเอาสองตัวมาเทียบกัน
   และนั่นคือเหตุผลที่ `.tw-note` ในผังเซนเซอร์ (twin.css) ตก 18/20 โหมดอยู่นานโดยไม่มีใครรู้
   ============================================================ */

/** อ่านบล็อก [data-scheme="light"|"dark"] ออกมาเป็น { light: {token: ค่า}, dark: {…} } */
function parseSchemes(source) {
  const out = {};
  const block = /\[data-scheme="(light|dark)"\]\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = block.exec(source))) {
    const tokens = {};
    for (const [, k, v] of m[2].matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) tokens[k] = v.trim();
    out[m[1]] = tokens;
  }
  return out;
}

const schemes = parseSchemes(css);

const STATUS_BGS = [
  "--status-good-bg",
  "--status-warning-bg",
  "--status-serious-bg",
  "--status-critical-bg",
  "--status-offline-bg",
];

/** โหมดไหนเป็นโหมดมืด — ดูจากนิยาม ไม่ใช่จากชื่อ: ตัวหนังสือสว่างกว่าพื้นการ์ด */
const schemeOf = (tokens) =>
  luminance(rgb(tokens["--ink-primary"])) > luminance(rgb(tokens["--bg-surface"]))
    ? "dark"
    : "light";

test("มีชั้น data-scheme ครบสองชั้น พร้อมสีพื้นสถานะ", () => {
  for (const s of ["light", "dark"]) {
    assert.ok(schemes[s], `ไม่เจอบล็อก [data-scheme="${s}"]`);
    for (const t of STATUS_BGS) assert.ok(schemes[s][t], `${s} ไม่มี ${t}`);
  }
});

for (const [name, tokens] of Object.entries(modes)) {
  test(`โหมด "${name}": ตัวหนังสือบนพื้นสถานะอ่านออก`, () => {
    const bgs = schemes[schemeOf(tokens)];
    for (const bgToken of STATUS_BGS) {
      /* `.tw-note` ใช้ --ink-secondary — ถ้าจะเปลี่ยนไปใช้ token ที่จางกว่านี้
         ต้องวัดคู่นี้ก่อน เพราะพื้นสถานะจางกว่าพื้นการ์ดทุกตัว */
      const r = contrast(tokens["--ink-secondary"], bgs[bgToken]);
      assert.ok(r !== null, `${name}: ${bgToken} อ่านค่าสีไม่ได้`);
      assert.ok(
        r >= 4.5,
        `${name}: ink-secondary บน ${bgToken} ได้ ${r.toFixed(2)}:1 ต้องการ 4.5:1`,
      );
    }
  });
}
