/**
 * สมุดบันทึกสุขภาพกล่อง (T1.308)
 *
 * สิ่งที่ต้องกันไว้ให้ได้ เพราะพลาดแล้วสมุดจะโกหกตอนที่เราต้องพึ่งมันที่สุด:
 *   · อ่าน MemFree แทน MemAvailable — จะดูเหมือนแรมใกล้หมดตลอดเวลา
 *   · ค่าที่อ่านไม่ได้กลายเป็น 0 — จะดูเหมือนเครื่องกำลังจะตายทั้งที่แค่อ่านไม่ได้
 *   · ตัดไฟล์แล้วเก็บผิดหัวท้าย — จะเหลือแต่ตอนที่กล่องยังสบายดีเมื่อหลายเดือนก่อน
 */
import test from "node:test";
import assert from "node:assert/strict";

import { KEEP_LINES, cgKv, cgNum, parseLoadavg, parseMeminfo, parseUptime, sampleLine, shouldTrim, toMb, trimKeep } from "../server/src/watchdog/boxHealth.js";

const MEMINFO = `MemTotal:       32543852 kB
MemFree:          943200 kB
MemAvailable:   20441600 kB
Buffers:          123456 kB
SwapTotal:       2097152 kB
SwapFree:         524288 kB
`;

/* ---------- อ่าน /proc ---------- */

test("ต้องใช้ MemAvailable ไม่ใช่ MemFree — ไม่งั้นแรมจะดูใกล้หมดตลอดเวลา", () => {
  const m = parseMeminfo(MEMINFO);
  /* MemFree 943 MB ดูน่าตกใจ แต่ของที่ใช้ได้จริงคือ MemAvailable ~19.9 GB
     เพราะแคชที่ระบบคืนได้ไม่ได้ถูกนับใน MemFree */
  assert.equal(m.memAvail, 19963);
  assert.equal(m.memTotal, 31781);
  assert.equal(m.swapTotal, 2048);
  assert.equal(m.swapFree, 512);
});

test("อ่านไม่ได้ต้องเป็น null ไม่ใช่ศูนย์", () => {
  /* ★ 0 แปลว่า "แรมหมดแล้ว" ซึ่งเป็นคนละเรื่องกับ "อ่านค่าไม่ได้"
     ถ้าปล่อยให้กลายเป็น 0 คนที่มาอ่านทีหลังจะสรุปสาเหตุผิดทั้งหมด */
  const m = parseMeminfo("");
  assert.deepEqual(m, { memTotal: null, memAvail: null, swapTotal: null, swapFree: null });
  assert.equal(parseUptime("ไม่ใช่ตัวเลข"), null);
  assert.equal(parseLoadavg("").load1, null);
});

test("แกะโหลดและจำนวนโปรเซสจาก /proc/loadavg ได้", () => {
  const l = parseLoadavg("7.94 17.42 12.53 2/310 12345");
  assert.equal(l.load1, 7.94);
  assert.equal(l.load5, 17.42);
  assert.equal(l.running, 2);
  assert.equal(l.procs, 310);
});

test("เวลาที่คอนเทนเนอร์เริ่มมา ปัดเป็นวินาทีเต็ม", () => {
  assert.equal(parseUptime("842.37 1620.55"), 842);
});

/* ---------- หนึ่งบรรทัดของสมุด ---------- */

test("หนึ่งตัวอย่างต้องเป็น JSON หนึ่งบรรทัด อ่านกลับได้", () => {
  const now = new Date("2026-10-05T09:40:00+07:00");
  const line = sampleLine({
    mem: parseMeminfo(MEMINFO),
    load: parseLoadavg("7.94 17.42 12.53 2/2333 1"),
    uptime: 842,
    zombies: 1,
    disk: 88.4,
    rss: [{ pid: 40, mb: 120, cmd: "node src/bridge/index.js" }],
    cg: CG,
  }, now);

  assert.equal(line.endsWith("\n"), true);
  assert.equal(line.trim().includes("\n"), false, "ต้องเป็นบรรทัดเดียว");
  const row = JSON.parse(line);
  assert.equal(row.t, now.toISOString());
  assert.equal(row.zombies, 1);
  assert.equal(row.diskFreePct, 88.4);
  assert.equal(row.rssTop[0].mb, 120);
});

/* ---------- ★ ค่าของกล่อง ต้องไม่ปนกับค่าของเครื่องแม่ ---------- */

const CG = {
  memCurrent: 374296576,     // 357 MB
  memMax: 4294967296,        // 4 GB
  memPeak: 1073741824,       // 1 GB
  pidsCurrent: 70,
  pidsMax: 500,
  oomKill: 0,
  nrThrottled: 2044,
  throttledUsec: 356479724,
};

test("แรมของกล่องต้องมาจาก cgroup ไม่ใช่ /proc — ต่างกัน 8 เท่า", () => {
  /* ★ ของจริง 5 ต.ค. 2569: /proc บอกแรม 31 GB แต่กล่องถูกจำกัดไว้ที่ 4 GB
     ถ้าใช้ค่าจาก /proc สมุดจะเขียนว่า "เหลือ 20 GB สบายมาก"
     ในนาทีที่กล่องกำลังจะถูกฆ่าเพราะแรมหมด */
  const row = JSON.parse(sampleLine({ mem: parseMeminfo(MEMINFO), cg: CG }));
  assert.equal(row.memMaxMb, 4096, "ขีดจำกัดจริงของกล่อง");
  assert.equal(row.memMb, 357);
  assert.equal(row.memPeakMb, 1024);
  /* ค่าของเครื่องแม่ยังเก็บไว้ แต่ต้องอยู่ใต้คีย์ host ให้ชัดว่าเป็นคนละเรื่อง */
  assert.equal(row.host.memTotalMb, 31781);
  assert.notEqual(row.memMaxMb, row.host.memTotalMb);
});

test("ต้องเก็บตัวนับการถูกฆ่าเพราะแรมหมด และการถูกเบรกซีพียู", () => {
  /* oom_kill คือหลักฐานตรง ๆ ว่ากล่องตายเพราะตัวเองหรือถูกคนอื่นฆ่า */
  const row = JSON.parse(sampleLine({ cg: CG }));
  assert.equal(row.oomKill, 0);
  assert.equal(row.pids, 70);
  assert.equal(row.pidsMax, 500);
  assert.equal(row.cpuThrottled, 2044);
  assert.equal(row.cpuThrottledSec, 356);
});

test("จำนวนงานจาก /proc/loadavg เป็นของเครื่องแม่ ต้องไม่ถูกเรียกว่าโปรเซสของกล่อง", () => {
  /* ของจริง: /proc/loadavg บอก 2,333 งาน แต่ในคอนเทนเนอร์มี 29 โปรเซส */
  const row = JSON.parse(sampleLine({ load: parseLoadavg("1 2 3 2/2333 1"), cg: CG }));
  assert.equal(row.host.tasks, 2333);
  assert.equal(row.pids, 70, "ของกล่องต้องมาจาก cgroup");
});

test("cgroup ที่เขียนว่า max แปลว่าไม่จำกัด ต้องเป็น null ไม่ใช่ศูนย์", () => {
  assert.equal(cgNum("max"), null);
  assert.equal(cgNum(""), null);
  assert.equal(cgNum("4294967296"), 4294967296);
  assert.equal(toMb(null), null);
  assert.equal(cgKv("low 0 \nhigh 0 \noom_kill 3 ").oom_kill, 3);
});

test("ไม่มีข้อมูลอะไรเลยก็ยังเขียนบรรทัดได้ และทุกช่องเป็น null", () => {
  /* เขียนบรรทัดที่มีแต่ null ยังมีประโยชน์ — มันบอกว่า "ตอนนั้นกล่องยังมีชีวิต" */
  const row = JSON.parse(sampleLine(null, new Date("2026-10-05T00:00:00Z")));
  assert.equal(row.memMb, null);
  assert.equal(row.memMaxMb, null);
  assert.equal(row.oomKill, null);
  assert.equal(row.zombies, null);
  assert.equal(row.host.memTotalMb, null);
  assert.ok(row.t);
});

/* ---------- ตัดของเก่า ---------- */

test("ตัดแล้วต้องเก็บบรรทัดท้าย ไม่ใช่บรรทัดแรก", () => {
  /* ★ ตอนสืบเหตุเราอยากได้ช่วงก่อนตายล่าสุด ไม่ใช่ตอนกล่องเพิ่งเริ่มใช้เมื่อหลายเดือนก่อน */
  const text = Array.from({ length: 10 }, (_, i) => `{"n":${i}}`).join("\n") + "\n";
  const out = trimKeep(text, 3);
  assert.equal(out, '{"n":7}\n{"n":8}\n{"n":9}\n');
});

test("ยังไม่ถึงเกณฑ์ต้องไม่ตัด (คืน null)", () => {
  assert.equal(trimKeep('{"n":1}\n{"n":2}\n', 5), null);
  assert.equal(shouldTrim(1024), false);
  assert.equal(shouldTrim(9 * 1024 * 1024), true);
});

test("เก็บย้อนหลังได้ราวสองสัปดาห์ที่ความถี่นาทีละครั้ง", () => {
  /* ถ้าวันหนึ่งมีคนลดค่านี้ลงมาก สมุดจะสั้นจนสืบเหตุไม่ได้ — เขียนไว้ให้เห็นชัด */
  assert.ok(KEEP_LINES / (60 * 24) >= 13, "ต้องเก็บได้อย่างน้อย 13 วัน");
});
