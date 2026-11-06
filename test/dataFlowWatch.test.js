/**
 * ตัวเฝ้าระวังว่าข้อมูลยังไหลอยู่ไหม (T1.295)
 *
 * ของที่พังแล้วเงียบ — และ "เงียบ" คือตัวอาการเองอีกครั้ง:
 *   - ตัวเฝ้าไปพึ่งฐานข้อมูล → ตายพร้อมกล่องที่ดับ ซึ่งวันนั้นข้อมูลก็หยุดไหลพอดี (28–29 ก.ย. 2569)
 *   - ดูแค่ "มีข้อมูลเข้าไหม" → ท่อที่ส่ง 0 ทุกค่าจะนับว่าปกติ ทั้งที่ไม่มีค่าจริงสักตัว
 *   - ต่อ InfluxDB ไม่ได้แล้วบอกว่า "ข้อมูลหยุดไหล" → พาคนไปแก้ผิดเครื่อง
 *   - เตือนทุกรอบตรวจ → โควตาไลน์ 300/เดือนหมด แล้วแจ้งเตือนของจริงส่งไม่ออก
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { MAX_AGE_MIN, MIN_FREE_PCT, checkDisk, classifyFlow, flowMessage } from "../server/src/watchdog/flowRules.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const NOW = new Date("2026-09-30T14:00:00+07:00");
const ago = (min) => new Date(NOW.getTime() - min * 60000);

const climate = (min, value) => [
  { field: "temperature_1", at: ago(min), value },
  { field: "humidity_1", at: ago(min), value },
];

test("ค่าใหม่มาตรงเวลาและเป็นค่าจริง = ผ่าน", () => {
  const r = classifyFlow(climate(2, 27.4), NOW);
  assert.equal(r.ok, true);
  assert.equal(r.kind, null);
  assert.equal(r.ageMin, 2);
});

test("ไม่มีค่าเลยใน InfluxDB = ไม่ผ่าน และบอกว่าไม่มีค่าเลย", () => {
  const r = classifyFlow([], NOW);
  assert.equal(r.ok, false);
  assert.equal(r.kind, "empty");
  assert.equal(r.lastAt, null);
});

test("ค่าล่าสุดเก่าเกินเกณฑ์ = ท่อหยุด พร้อมบอกว่าเก่ากี่นาที", () => {
  /* ของจริง 29–30 ก.ย. 2569: ค่าสุดท้าย 02:16 น. เงียบต่อมาอีก 34 ชั่วโมง */
  const r = classifyFlow(climate(34 * 60, 27.4), NOW);
  assert.equal(r.ok, false);
  assert.equal(r.kind, "stale");
  assert.match(r.reason, /34 ชั่วโมง/);
  /* เลขนาทีดิบต้องไม่โผล่ออกไปหาคนอ่าน */
  assert.doesNotMatch(r.reason, /2040/);
  assert.equal(r.lastAt, ago(34 * 60).toISOString());
});

test("เกณฑ์อายุ: เท่ากับเกณฑ์ยังผ่าน · เกินหนึ่งนาทีไม่ผ่าน", () => {
  assert.equal(classifyFlow(climate(MAX_AGE_MIN, 27.4), NOW).ok, true);
  assert.equal(classifyFlow(climate(MAX_AGE_MIN + 1, 27.4), NOW).ok, false);
  /* ตั้งเกณฑ์เองได้ */
  assert.equal(classifyFlow(climate(10, 27.4), NOW, { maxAgeMin: 5 }).ok, false);
});

test("ค่ามาตรงเวลาแต่อุณหภูมิ/ความชื้นเป็น 0 ทั้งหมด = ท่อเดินแต่ของเสีย", () => {
  /* อาการของอุปกรณ์ที่อ่าน RS485 ไม่ได้ — สะพานทิ้งค่าพวกนี้อยู่แล้วแต่ไม่เคยบอกใคร */
  const r = classifyFlow(climate(1, 0), NOW);
  assert.equal(r.ok, false);
  assert.equal(r.kind, "zeros");
  assert.match(r.reason, /เป็น 0 ทั้งหมด/);
});

test("มีค่าจริงปนอยู่แม้แต่ตัวเดียว = ยังไม่ใช่ของเสียทั้งท่อ", () => {
  const points = [...climate(1, 0), { field: "temperature_3", at: ago(1), value: 28.1 }];
  assert.equal(classifyFlow(points, NOW).ok, true);
});

test("มิเตอร์ไฟเป็น 0 ไม่ถือว่าเสีย — ไม่มีโหลดก็เป็น 0 ได้จริง", () => {
  const points = [
    { field: "power_kw", at: ago(1), value: 0 },
    { field: "temperature_1", at: ago(1), value: 27.9 },
  ];
  assert.equal(classifyFlow(points, NOW).ok, true);
  /* มีแต่มิเตอร์ที่เป็นศูนย์ ไม่มี field อากาศเลย ก็ยังผ่าน (ไม่มีอะไรให้ตัดสิน) */
  assert.equal(classifyFlow([{ field: "power_kw", at: ago(1), value: 0 }], NOW).ok, true);
});

test("ค่าที่ไม่ใช่ตัวเลขหรือไม่มีเวลา ไม่ทำให้ล่ม", () => {
  assert.equal(classifyFlow([{ field: "temperature_1", at: ago(1), value: null }], NOW).kind, "empty");
  assert.equal(classifyFlow([{ field: "temperature_1", at: "พัง", value: 27 }], NOW).kind, "empty");
  assert.equal(classifyFlow(null, NOW).kind, "empty");
});

test("ข้อความไลน์: ไม่มี markdown · ไม่สัญญาว่าข้อมูลไม่หาย · บอกว่าต้องไปดูตรงไหน", () => {
  for (const kind of ["down", "still", "up"]) {
    const { text } = flowMessage(kind, { gap: "2 ชั่วโมง 5 นาที", reason: "ค่าล่าสุดเก่า 2 ชั่วโมง" });
    assert.ok(!text.includes("*"), `ข้อความ ${kind} มีดอกจัน`);
    assert.ok(!text.includes("ข้อมูลไม่หาย"), `ข้อความ ${kind} สัญญาในสิ่งที่ตรวจไม่ได้`);
    assert.ok(text.includes("2 ชั่วโมง 5 นาที"));
  }
  const down = flowMessage("down", { gap: null, reason: "ค่าเข้ามาตรงเวลาแต่เป็น 0 ทั้งหมด (4 field)" }).text;
  assert.match(down, /Node-RED/);
  assert.match(down, /MQTT|ตู้ควบคุม/);
  assert.match(down, /หน้าจอค้างที่ค่าเดิม/);
  assert.match(down, /อาการ: ค่าเข้ามาตรงเวลาแต่เป็น 0/);
  assert.match(flowMessage("up", {}).text, /กลับมาไหลแล้ว/);
});

test("ตัวรันห้ามแตะฐานข้อมูล — สิ่งที่มันเฝ้ากับฐานเคยดับพร้อมกันมาแล้ว", () => {
  const runner = read("../server/src/watchdog/dataflow.js");
  const rules = read("../server/src/watchdog/flowRules.js");
  for (const src of [runner, rules]) {
    assert.doesNotMatch(src, /db\/pool\.js|from "pg"|query\(/);
  }
  /* กติกาต้องไม่ import อะไรเลย จะได้เทสต์ได้จากรากโดยไม่ต้องมีฐาน */
  assert.doesNotMatch(rules, /^import /m);
});

test("ต่อ InfluxDB ไม่ได้ ต้องข้ามรอบ ไม่ใช่ประกาศว่าข้อมูลหยุดไหล", () => {
  const runner = read("../server/src/watchdog/dataflow.js");
  assert.match(runner, /if \(probe\.probeFailed\)/);
  assert.match(runner, /return \{ skipped: "อ่าน InfluxDB ไม่ได้"/);
});

test("สะพานเรียกตัวเฝ้าทุกบทบาท และเรียกก่อนซิงก์", () => {
  const bridge = read("../server/src/bridge/index.js");
  const tick = bridge.slice(bridge.indexOf("async function tick()"));
  const watch = tick.indexOf("await runDataFlowWatch()");
  const sync = tick.indexOf("if (doesSync) await syncPass()");
  assert.ok(watch > 0, "tick() ไม่ได้เรียกตัวเฝ้าข้อมูล");
  assert.ok(watch < sync, "ต้องเรียกตัวเฝ้าก่อน syncPass()");
  assert.doesNotMatch(tick.slice(0, watch + 20), /if \(doesSync\) await runDataFlowWatch/);
});

test("สวิตช์ส่งไลน์แยกจากตัวอื่น และค่าตั้งต้นใน compose คือยังไม่ส่ง", () => {
  const runner = read("../server/src/watchdog/dataflow.js");
  assert.match(runner, /process\.env\.FLOW_WATCH_NOTIFY \?\? "1"/);
  /* ต้องไม่ **อ่าน** LINE_NOTIFY (พูดถึงในคอมเมนต์ได้ — อธิบายว่าทำไมถึงไม่ใช้) */
  assert.doesNotMatch(runner, /process\.env\.LINE_NOTIFY/);
  const compose = read("../docker-compose.yml");
  assert.match(compose, /FLOW_WATCH_NOTIFY: \$\{FLOW_WATCH_NOTIFY:-0\}/);
  assert.match(compose, /FLOW_STATE_FILE: \/state\/dataflow-watch\.json/);
});

test("คำถามที่ยิงไป InfluxDB ต้องเอาแค่จุดสุดท้ายของแต่ละ field และย้อนไกลพอ", () => {
  const influx = read("../server/src/bridge/influx.js");
  const fn = influx.slice(influx.indexOf("export async function lastReadings"));
  assert.match(fn, /\|> group\(columns: \["_field"\]\)/);
  assert.match(fn, /\|> last\(\)/);
  assert.match(fn, /start = "-7d"/);
});

/* ---------- ดิสก์ใกล้เต็ม (T1.297) ---------- */

test("checkDisk: เหลือมากกว่าเกณฑ์ = ผ่าน · น้อยกว่า = เตือนพร้อมบอกเปอร์เซ็นต์", () => {
  assert.equal(checkDisk({ avail: 50, total: 100 }).ok, true);
  const r = checkDisk({ avail: 2035199, total: 120699413 }); /* ตัวเลขจริงจากเครื่อง 30 ก.ย. 2569 */
  assert.equal(r.ok, false);
  assert.equal(r.freePct, 1.7);
  assert.match(r.reason, /1\.7% \(เกณฑ์ 5%\)/);
});

test("checkDisk: คิดเป็นสัดส่วน จึงไม่ขึ้นกับหน่วยหรือขนาดบล็อก", () => {
  /* กับดักจริง: statfs ในคอนเทนเนอร์คืน bsize 1 MiB ทั้งที่บล็อกจริง 4 KiB
     ถ้าคิดเป็นไบต์จะได้ "ว่าง 1,987 GB" ทั้งที่เครื่องเหลือ 7.8 GB */
  const blocks = checkDisk({ avail: 2035199, total: 120699413 });
  const bytes = checkDisk({ avail: 2035199 * 4096, total: 120699413 * 4096 });
  assert.deepEqual(blocks, bytes);
});

test("checkDisk: วัดไม่ได้ต้องไม่ตัดสิน (ดีกว่าเตือนผิด)", () => {
  for (const bad of [null, undefined, {}, { avail: 5, total: 0 }, { avail: "x", total: 10 }]) {
    assert.equal(checkDisk(bad).ok, true, JSON.stringify(bad));
    assert.equal(checkDisk(bad).freePct, null);
  }
});

test("checkDisk: เกณฑ์ตั้งเองได้ และค่าตั้งต้นคือ 5%", () => {
  assert.equal(MIN_FREE_PCT, 5);
  assert.equal(checkDisk({ avail: 7, total: 100 }, { minFreePct: 10 }).ok, false);
  assert.equal(checkDisk({ avail: 7, total: 100 }).ok, true);
});

test("ข้อความตอนดิสก์ใกล้เต็มต้องพาไปลบไฟล์ ไม่ใช่ไปไล่ Node-RED", () => {
  const disk = flowMessage("down", { gap: "2 ชั่วโมง", reason: "ดิสก์ของเครื่องที่เก็บข้อมูลเหลือ 1.7% (เกณฑ์ 5%)", kind: "disk" }).text;
  assert.match(disk, /ดิสก์/);
  assert.match(disk, /ลบไฟล์/);
  /* เล่าเหตุการณ์เดิมที่มี Node-RED ได้ (เป็นบริบท) แต่**ห้ามสั่งให้ไปไล่ Node-RED** */
  assert.doesNotMatch(disk, /ที่ต้องทำ: ตรวจเครื่องที่รัน Node-RED/);
  assert.ok(!disk.includes("*"));
  /* ท่อหยุดด้วยเหตุอื่นยังต้องพาไป Node-RED เหมือนเดิม */
  assert.match(flowMessage("down", { reason: "ค่าล่าสุดเก่า 41 ชั่วโมง", kind: "stale" }).text, /Node-RED/);
  /* ตอนกลับมาปกติใช้ข้อความเดียวกันทุกสาเหตุ */
  assert.match(flowMessage("up", { gap: "2 ชั่วโมง", kind: "disk" }).text, /กลับมาไหลแล้ว/);
});

test("ตัวรันตรวจดิสก์ก่อนดูอายุข้อมูล และวัดจากโฟลเดอร์ที่ผูกมาจากเครื่อง", () => {
  const runner = read("../server/src/watchdog/dataflow.js");
  const probe = runner.slice(runner.indexOf("export async function probeFlow"));
  assert.ok(probe.indexOf("checkDisk(") < probe.indexOf("lastReadings("), "ต้องตรวจดิสก์ก่อน");
  assert.match(runner, /FLOW_DISK_PATH/);
  /* ต้องคืนเป็นจำนวนบล็อก ไม่ใช่ไบต์ — bsize ในคอนเทนเนอร์เชื่อไม่ได้ */
  assert.match(runner, /return \{ avail: st\.bavail, total: st\.blocks \};/);
  assert.doesNotMatch(runner, /st\.bsize \* st\.bavail/);
  const compose = read("../docker-compose.yml");
  assert.match(compose, /\.\/docs:\/hostdisk:ro/);
  assert.match(compose, /FLOW_DISK_PATH: \$\{FLOW_DISK_PATH:-\/hostdisk\}/);
});
