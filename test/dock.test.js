/**
 * เทสต์ของ "แถบลอยล่างจอ" (components/dock/) — ผู้ใช้สั่งรวมปุ่มผู้ช่วย AI กับ Voice AI
 * ไว้ที่เดียว (16 ก.ย. 2569 · T1.260)
 *
 * กันสามอย่างที่ **พังเงียบ ๆ** คือไม่มี error ไม่มีจอแดง แต่ของบนจอผิด:
 *   1. ชื่อตัวแปร CSS พิมพ์ผิด — `var(--ชื่อที่ไม่มี)` ไม่ใช่ error เบราว์เซอร์แค่ข้ามไป
 *      ผลคือห้องแชทไปเกาะขอบล่างจอทับแถบที่เป็นปุ่มเปิด-ปิดตัวเอง
 *   2. มีคนเอาปุ่มกลับไปใส่บนแถบบนของโครงหน้าใดหน้าหนึ่ง แล้วมีปุ่มไมค์สองที่
 *   3. ห้องแชทถูกวาดแบบ `{open && <Assistant/>}` — ประวัติการคุยจะหายทุกครั้งที่พับห้อง
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { scrollVerdict } from "../src/components/dock/useScrollHide.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const tokens = read("../src/styles/tokens.css");
const dockCss = read("../src/components/dock/dock.css");
const assistantCss = read("../src/components/assistant/assistant.css");
const appDock = read("../src/components/dock/AppDock.jsx");
const app = read("../src/App.jsx");
const defaults = read("../src/lib/settings/defaults.js");
const provider = read("../src/lib/settings/SettingsProvider.jsx");

test("ตัวแปรความสูง/ระยะของแถบลอย ต้องประกาศไว้ใน tokens.css", () => {
  assert.match(tokens, /--dock-h:\s*\d+px/);
  assert.match(tokens, /--dock-bottom:\s*\d+px/);
});

test("ทุก var(--dock-*) ที่ถูกเรียกใช้ ต้องมีตัวจริงอยู่", () => {
  /* ห้องแชทคำนวณตำแหน่งตัวเองจากตัวเลขของแถบ พิมพ์ชื่อผิดที่เดียว
     ทั้ง calc() จะใช้ไม่ได้ แล้วห้องแชทตกลงไปทับแถบโดยไม่มีคำเตือนอะไรเลย */
  const used = new Set();
  for (const css of [dockCss, assistantCss]) {
    for (const m of css.matchAll(/var\((--dock-[a-z-]+)\)/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 2, "ห้องแชทต้องอ้างตัวเลขของแถบ ไม่ใช่เขียนตัวเลขตายตัวซ้ำ");
  for (const name of used) {
    assert.ok(tokens.includes(`${name}:`), `tokens.css ไม่มี ${name}`);
  }
});

test("ปุ่ม Voice AI ต้องมีที่เดียวคือแถบลอย ไม่ใช่แถบบนของโครงหน้าแต่ละแบบ", () => {
  /* ของเดิมต้องไปใส่ซ้ำในโครงหน้าสี่แบบ ลืมแบบไหนปุ่มก็หายไปเฉย ๆ ตอนสลับโครง */
  const dir = new URL("../src/", import.meta.url).pathname;
  const walk = (d) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
    );
  const offenders = walk(dir)
    .filter((f) => f.endsWith(".jsx") || f.endsWith(".js"))
    .filter((f) => readFileSync(f, "utf8").includes("VoiceAiButton"));
  assert.deepEqual(offenders, [], "ยังมีไฟล์อ้างถึง VoiceAiButton ที่ถูกถอดออกไปแล้ว");
});

test("แถบลอยต้องวาดห้องแชทค้างไว้เสมอ ไม่ใช่วาดเฉพาะตอนเปิด", () => {
  /* state ของบทสนทนาอยู่ใน Assistant.jsx — ถอดออกจากจอเมื่อไหร่ประวัติหายทั้งหมด
     ตัวมันคืน null เองตอน open เป็นเท็จ จึงต้องวาดค้างไว้ตลอด */
  assert.match(appDock, /<Assistant\s+open=\{/);
  assert.ok(
    !/\{\s*chat\s*&&\s*<Assistant/.test(appDock),
    "ห้ามวาดห้องแชทแบบมีเงื่อนไข — ประวัติการคุยจะหายทุกครั้งที่พับห้อง",
  );
  assert.ok(app.includes("<AppDock />"), "App.jsx ต้องวาดแถบลอยไว้นอก <Routes>");
});

/* ---------- หลบตอนเลื่อนหน้าลง ---------- */

test("เลื่อนลงไกลพอ = ซ่อน · เลื่อนขึ้น = โผล่", () => {
  assert.deepEqual(scrollVerdict(400, 300), { hidden: true });
  assert.deepEqual(scrollVerdict(300, 400), { hidden: false });
});

test("ยังอยู่ใกล้หัวหน้า ต้องเห็นแถบเสมอ", () => {
  /* เลื่อนลงแต่ยังอยู่แถวบนสุด — ซ่อนตรงนี้จะกลายเป็นแถบกระพริบตั้งแต่ขยับนิดเดียว */
  assert.deepEqual(scrollVerdict(60, 0), { hidden: false });
});

test("เลื่อนช้า ๆ ทีละไม่กี่พิกเซล ระยะต้องสะสมจนถึงเกณฑ์", () => {
  /* กับดักของจริง: ถ้าจำตำแหน่งใหม่ทุกรอบแม้ตอนที่ยังไม่ถึงเกณฑ์
     คนที่ค่อย ๆ เลื่อนทีละ 3px จะไม่มีวันครบเกณฑ์ แถบก็ไม่ขยับสักที
     `null` แปลว่า "ยังไม่ตัดสิน และห้ามจำตำแหน่งใหม่" */
  let from = 200;
  let y = from;
  for (let i = 0; i < 2; i += 1) {
    y += 3;
    assert.equal(scrollVerdict(y, from), null);
  }
  y += 3; // สะสมครบ 9px > เกณฑ์ 8px
  assert.deepEqual(scrollVerdict(y, from), { hidden: true });
});

/* ---------- กากบาทเอาปุ่มออกจากแถบ ---------- */

test("ทุกคีย์ตั้งค่าที่กากบาทใช้ ต้องมีค่าตั้งต้นและถูกกู้คืนตอนเปิดแอป", () => {
  /* พังเงียบ ๆ ที่สุดของเรื่องนี้: ลืมเติมคีย์ใหม่ใน SettingsProvider
     สวิตช์จะใช้ได้ปกติทั้งรอบ แต่พอรีเฟรชค่าถูกทิ้ง ปุ่มที่เอาออกไปแล้วกลับมาเอง */
  const keys = [...appDock.matchAll(/key:\s*"(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, ["showAssistant", "showVoiceAi"]);
  for (const key of keys) {
    assert.ok(defaults.includes(`${key}:`), `defaults.js ไม่มีค่าตั้งต้นของ ${key}`);
    assert.ok(provider.includes(`saved.${key}`), `SettingsProvider ไม่ได้อ่าน ${key} ที่บันทึกไว้`);
  }
});

test("เอาออกครบทั้งสองปุ่มแล้ว ต้องไม่เหลือพิลล์เปล่าลอยอยู่", () => {
  assert.match(appDock, /const empty = !shown && !hasVoice;/);
  assert.match(appDock, /\{!hidden && !empty && \(/);
});
