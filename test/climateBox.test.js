/**
 * หน้าระบบติดตามสภาพแวดล้อมต้องอ่านของจริงจากกล่อง (T1.336)
 *
 * ═══ ที่มา ═══
 * ผู้ใช้สั่งว่า "ตรงข้อมูลให้ใช้ข้อมูลทั้งหมดจากของจริงในบ็อกซ์มิว" (15 ต.ค. 2569)
 * ไล่ทั้งหน้าแล้วเจอสองจุดที่ยังไม่ใช่ของจริง และทั้งสองจุด**เงียบ** ไม่มีอะไรบนหน้าจอบอก
 *
 *   1. ผังเซนเซอร์  หน้าจอส่งคำตอบดิบของหลังบ้านเข้าการ์ดตรง ๆ ทั้งที่การ์ดรอรูปของ
 *                   `getSensorMap()` คนละรูปกันทุกช่อง → ผังขึ้น "ทุกจุดวัดไม่ส่งค่า"
 *                   ทั้งที่กล่องมีค่ารายจุดอยู่
 *   2. อุปกรณ์      เรียก `getEquipment()` ของข้อมูลตัวอย่างกับทุกโรงเรือน โรงเรือนจริง
 *                   ไม่มีในไฟล์ตัวอย่างจึงได้ชุด "ไม่มีสัญญาณ" แล้วสวิตช์ถูกล็อกทั้งการ์ด
 *                   ทั้งที่ `fetchControlState` มีอยู่ในโค้ดมาตลอดแต่ไม่มีใครเรียก
 *
 * เทสต์ชุดนี้จึงกันสองอย่าง: ตัวแปลงทำงานถูก **และ** หน้าจอเรียกใช้มันจริง
 * (ข้อหลังสำคัญกว่า เพราะบั๊กเดิมคือ "มีของแต่ไม่มีใครเรียก" ไม่ใช่ "แปลงผิด")
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { sensorMapOf } from "../src/lib/api/serverFarms.js";
import { equipmentFromBox, lastCommandByDevice, UNKNOWN } from "../src/lib/controlEquipment.js";
import { statusShort, statusText } from "../src/lib/api/controlText.js";
import { ZONES } from "../src/data/mock/barnSystems.js";

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

/** คำตอบจริงของ `GET /api/barns/:id/sensor-map` ที่กำแพงเพชร (15 ต.ค. 2569)
    SENSOR-B ส่งค่าอยู่ · SENSOR-A/C เงียบ · SENSOR-OUT เป็นจุดนอกอาคาร */
const BOX_MAP = {
  barnId: "11111111-1111-1111-1111-111111111111",
  nodes: [
    { code: "SENSOR-A", zone: "A", outdoor: false, readings: {} },
    {
      code: "SENSOR-B",
      zone: "B",
      outdoor: false,
      readings: {
        temp_c: { value: 27.9, at: "2026-10-15T03:39:00.000Z" },
        humidity: { value: 88.2, at: "2026-10-15T03:39:00.000Z" },
        wind_ms: { value: 0.4, at: "2026-10-15T03:39:00.000Z" },
      },
    },
    { code: "SENSOR-C", zone: "C", outdoor: false, readings: {} },
    {
      code: "SENSOR-OUT",
      zone: null,
      outdoor: true,
      readings: {
        temp_c: { value: 30.4, at: "2026-10-15T03:39:00.000Z" },
        humidity: { value: 88.2, at: "2026-10-15T03:39:00.000Z" },
      },
    },
  ],
};

test("★ ผังเซนเซอร์ของจริงต้องเงียบทีละจุด ไม่ใช่เงียบทั้งผัง", () => {
  const map = sensorMapOf(BOX_MAP);
  /* จุดที่ยังส่งค่าต้องไม่หายไปพร้อมจุดที่เงียบ — นี่คืออาการที่ผู้ใช้เห็น */
  assert.equal(map.online, true);
  assert.deepEqual(
    map.nodes.map((n) => [n.id, n.silent]),
    [["A", true], ["B", false], ["C", true]],
  );
  const b = map.nodes.find((n) => n.id === "B");
  assert.equal(b.tempC, 27.9);
  assert.equal(b.humidity, 88.2);
  assert.equal(b.wind, 0.4);
  /* จุดที่เงียบต้องเป็น null ไม่ใช่ 0 — 0 แปลว่า "วัดได้ศูนย์" ซึ่งคนละความหมาย */
  const a = map.nodes.find((n) => n.id === "A");
  assert.equal(a.tempC, null);
  assert.equal(a.humidity, null);
});

test("จุดนอกอาคารต้องแยกออกจากผังในเล้า ห้ามนับเป็นจุดวัดในเล้า", () => {
  const map = sensorMapOf(BOX_MAP);
  assert.equal(map.nodes.length, 3, "จุดนอกอาคารหลุดเข้ามาในผังในเล้า");
  assert.equal(map.outdoor.length, 1);
  assert.equal(map.outdoor[0].tempC, 30.4);
  assert.equal(map.outdoor[0].label, "นอกอาคาร");
});

test("ชื่อโซนต้องถือชุดเดียวกับผังของข้อมูลตัวอย่าง (ZONES)", () => {
  /* คัดลอกชื่อไปไว้สองที่เมื่อไร ผังสองฝั่งจะเรียกโซนเดียวกันคนละชื่อโดยไม่มีใครรู้ */
  const map = sensorMapOf(BOX_MAP);
  for (const node of map.nodes) {
    const want = ZONES.find((z) => z.id === node.id)?.label;
    assert.equal(node.label, want, `โซน ${node.id} ใช้ชื่อไม่ตรงกับ ZONES`);
  }
});

test("โซนที่ผังยังไม่รู้จักต้องยังโผล่ในผัง ไม่ใช่หายเงียบ ๆ", () => {
  const map = sensorMapOf({
    nodes: [{ code: "SENSOR-E", zone: "E", outdoor: false, readings: { temp_c: { value: 29, at: "x" } } }],
  });
  assert.equal(map.nodes.length, 1);
  assert.equal(map.nodes[0].id, "E");
  assert.equal(map.nodes[0].label, "E", "ไม่มีชื่อโซนก็ต้องใช้รหัสโซนเป็นป้าย");
});

test("กล่องไม่มีผังให้ = null เพื่อให้หน้าจอถอยไปใช้ผังตัวอย่างได้", () => {
  assert.equal(sensorMapOf(null), null);
  assert.equal(sensorMapOf({ nodes: [] }), null);
});

test("ไม่มีเซนเซอร์ก๊าซ = NH₃ ต้องเป็น null ห้ามคิดค่าให้", () => {
  const map = sensorMapOf(BOX_MAP);
  assert.equal(map.nh3, null);
  assert.equal(map.nh3Zone, null);
});

/* ══════════════════ อุปกรณ์จากกล่อง ══════════════════ */

/** คำตอบจริงของ `GET /api/control/F-KPP-A1/state` — `control_device` ว่าง จึงได้ชุดตั้งต้นของกล่อง */
const BOX_STATE = {
  barnKey: "F-KPP-A1",
  real: true,
  online: true,
  temp: { tempC: 28, tempAgeMinutes: 1.2, staleAfterMinutes: 20 },
  tempMax: 32,
  transport: "hold",
  canSend: false,
  devices: [
    ...[1, 2, 3, 4, 5].map((n) => ({
      kind: "fan",
      device_id: `FAN ${n}`,
      duty: "ระบายอากาศ",
      critical: false,
      cooling: true,
      enabled: true,
    })),
    { kind: "pump", device_id: "P1", duty: "น้ำดื่ม", critical: true, cooling: false, enabled: true },
    { kind: "pump", device_id: "P2", duty: "ระบายน้ำ", critical: false, cooling: false, enabled: true },
    { kind: "pump", device_id: "P3", duty: "ม่านน้ำ", critical: false, cooling: true, enabled: true },
  ],
};

test("★ อุปกรณ์จากกล่องต้องปลดล็อกสวิตช์ได้ (online) แต่ไม่อ้างว่ารู้ว่าเดินอยู่", () => {
  const eq = equipmentFromBox(BOX_STATE, []);
  /* บั๊กเดิม: ชุดตัวอย่างคืน online:false → `locked = !online` ล็อกสวิตช์ทั้งการ์ด
     ทั้งที่กล่องรับคำสั่งได้จริงและมีด่านความปลอดภัยของตัวเองอยู่แล้ว */
  assert.equal(eq.online, true);
  /* กล่องไม่มีโหมด AUTO/MANUAL และไม่มีสถานะการทำงาน — ห้ามเดาทั้งสองอย่าง */
  assert.equal(eq.auto, null);
  assert.equal(eq.known, false);
  assert.equal(eq.from, "box");
  assert.equal(eq.canSend, false, "ส่งออกไปตู้จริงยังไม่ได้ — การ์ดต้องบอกคนกด");
});

test("ทุกตัวต้องเป็น 'ไม่ทราบสถานะ' และไม่มีตัวเลข Hz/A ปลอม", () => {
  const eq = equipmentFromBox(BOX_STATE, []);
  assert.equal(eq.fans.length, 5);
  assert.equal(eq.pumps.length, 3);
  for (const fan of eq.fans) {
    assert.equal(fan.state, UNKNOWN);
    assert.equal(fan.hz, null, "กล่องไม่ได้วัดรอบพัดลม ห้ามใส่เลข");
    assert.equal(fan.amp, null, "กล่องไม่ได้วัดกระแสพัดลม ห้ามใส่เลข");
  }
  for (const pump of eq.pumps) {
    /* null = ไม่รู้ · false = รู้ว่าหยุด — สองอย่างนี้ห้ามยุบเป็นค่าเดียวกัน */
    assert.equal(pump.running, null);
    assert.equal(pump.amp, null);
    assert.equal(pump.watt, null);
  }
  /* หน้าที่ของปั๊มมาจากกล่อง ไม่ใช่จากไฟล์ตัวอย่าง */
  assert.deepEqual(eq.pumps.map((p) => p.duty), ["น้ำดื่ม", "ระบายน้ำ", "ม่านน้ำ"]);
});

test("กล่องยังไม่ตอบ = null เพื่อให้หน้าจอถอยไปชุดตัวอย่าง", () => {
  assert.equal(equipmentFromBox(null, []), null);
});

test("คำสั่งล่าสุดต้องเอาใบใหม่สุด และใบที่ถูกปฏิเสธต้องไม่นับว่าผ่าน", () => {
  const last = lastCommandByDevice([
    { deviceKind: "fan", deviceId: "FAN 1", action: "on", status: "held", requestedAt: "2026-10-14T09:00:00.000Z" },
    { deviceKind: "fan", deviceId: "FAN 1", action: "off", status: "rejected", requestedAt: "2026-10-15T02:00:00.000Z" },
    { deviceKind: "pump", deviceId: "P3", action: "on", status: "held", requestedAt: "2026-10-15T01:00:00.000Z" },
  ]);
  assert.equal(last["fan|FAN 1"].action, "off");
  assert.equal(last["fan|FAN 1"].accepted, false, "ใบที่ด่านปฏิเสธต้องไม่ถือว่าผ่าน");
  assert.equal(last["pump|P3"].accepted, true);
  assert.equal(last["fan|FAN 5"], undefined);
});

test("ชุดสถานะที่ถือว่า 'ผ่าน' ต้องตรงกับที่ statusText รู้จัก", () => {
  /* เขียนชื่อสถานะที่หลังบ้านไม่เคยส่งไว้ในชุดนี้ = ธง accepted ตายไปเงียบ ๆ */
  const text = src("lib/api/controlText.js");
  for (const status of ["held", "sent", "confirmed"]) {
    assert.ok(text.includes(`${status}:`), `statusText ไม่รู้จักสถานะ ${status}`);
  }
  for (const status of ["failed", "rejected"]) {
    const last = lastCommandByDevice([
      { deviceKind: "fan", deviceId: "FAN 1", action: "on", status, requestedAt: "x" },
    ]);
    assert.equal(last["fan|FAN 1"].accepted, false, `${status} ต้องไม่ถือว่าผ่าน`);
  }
});

test("★ คำสั่งล่าสุดต้องพา transport ไปด้วย — `held` มีสองความหมาย (T1.310)", () => {
  /* ตกช่องนี้ = คำสั่งที่กำลังจะถึงตู้ในไม่กี่วินาที อ่านเหมือนคำสั่งที่ไม่มีวันถูกส่ง */
  const last = lastCommandByDevice([
    { deviceKind: "fan", deviceId: "FAN 1", action: "on", status: "held",
      transport: "outbox", requestedAt: "2026-10-15T02:00:00.000Z" },
  ]);
  assert.equal(last["fan|FAN 1"].transport, "outbox");
  assert.equal(statusShort("held", last["fan|FAN 1"].transport), "รอส่งให้ตู้");
  assert.equal(statusShort("held", "hold"), "ค้างในคิว");
  assert.notEqual(statusShort("held", "outbox"), statusShort("held", "hold"));
});

test("ฉบับสั้นกับฉบับเต็มของสถานะต้องรู้จักสถานะชุดเดียวกัน", () => {
  /* หลังบ้านเพิ่มสถานะใหม่แล้วเติมแค่ชุดเดียว = อีกชุดโชว์รหัสดิบเงียบ ๆ */
  for (const status of ["held", "sent", "confirmed", "failed", "rejected"]) {
    for (const [name, fn] of [["statusText", statusText], ["statusShort", statusShort]]) {
      assert.notEqual(fn(status, "hold"), status, `${name} ไม่รู้จักสถานะ ${status}`);
    }
  }
});

test("การ์ดอุปกรณ์ต้องใช้ฉบับสั้นในบรรทัดใต้สวิตช์ ไม่ใช่ฉบับเต็ม", () => {
  /* ฉบับเต็มยาวเกือบห้าสิบตัวอักษร วางในช่อง ~94px แล้วดันการ์ดสูงขึ้นเท่าตัว */
  const panel = src("components/climate/EquipmentPanel.jsx");
  const block = panel.slice(panel.indexOf("const lastLine"), panel.indexOf("export default"));
  assert.match(block, /statusShort\(last\.status, last\.transport\)/);
  assert.ok(!/statusText\(/.test(block), "ยังใช้ฉบับเต็มในบรรทัดเล็ก");
});

test("★ ค่าที่ด่านความปลอดภัยใช้ตัดสินต้องถูกเอามาแสดง ไม่ใช่ดึงมาแล้วทิ้ง", () => {
  const eq = equipmentFromBox(BOX_STATE, []);
  /* กล่องส่งสามอย่างนี้มาให้อยู่แล้ว — คนกดต้องรู้ว่าทำไมคำสั่งถึงถูกถามกลับ/ถูกห้าม */
  assert.equal(eq.temp.tempC, 28);
  assert.equal(eq.temp.tempAgeMinutes, 1.2);
  assert.equal(eq.temp.staleAfterMinutes, 20);
  assert.equal(eq.tempMax, 32);

  const panel = src("components/climate/EquipmentPanel.jsx");
  assert.match(panel, /equipment\.temp\?\.tempC != null/, "การ์ดยังไม่แสดงค่าที่ด่านใช้");
  assert.match(panel, /equipment\.tempMax/, "การ์ดยังไม่แสดงเพดานอุณหภูมิ");
  /* ★ อายุของค่าสำคัญเท่าตัวค่า — ค่าเก่าเกินเพดานทำให้ด่านห้ามคำสั่งที่ลดความเย็น */
  assert.match(panel, /staleAfterMinutes/, "การ์ดไม่ได้บอกว่าค่าเก่าเกินเกณฑ์หรือยัง");
});

/* ══════════════════ หน้าจอต้องเรียกใช้จริง ══════════════════ */

test("★ คำตอบดิบของผังเซนเซอร์ต้องไม่ถึงการ์ดโดยไม่ผ่านตัวแปลง", () => {
  /* บั๊กเดิมคือ `sensorMap: mapRes ?? null` — ส่งของดิบเข้าการ์ดตรง ๆ */
  const hook = src("lib/api/useBarnHistory.js");
  assert.match(hook, /sensorMapOf\(mapRes\)/, "useBarnHistory ยังไม่แปลงผังก่อนส่งออก");
  assert.ok(
    !/sensorMap:\s*mapRes/.test(hook),
    "ยังมีทางที่คำตอบดิบถึงการ์ดได้ — การ์ดจะขึ้นว่าไม่มีจุดไหนส่งค่า",
  );
});

test("★ หน้าสภาพแวดล้อมต้องถามกล่องเรื่องอุปกรณ์ ไม่ใช่ใช้ชุดตัวอย่างอย่างเดียว", () => {
  const page = src("pages/Environment.jsx");
  assert.match(page, /useBarnControl\(/, "หน้านี้ยังไม่เรียก useBarnControl");
  /* ของจริงต้องมาก่อนชุดตัวอย่างเสมอ (กติกาเดียวกับกราฟย้อนหลังและค่าไฟ) */
  assert.match(
    page,
    /boxControl\.equipment\s*\?\?\s*\(barn \? getEquipment/,
    "ชุดตัวอย่างต้องเป็นทางถอย ไม่ใช่ทางหลัก",
  );
  /* ห้ามทับชุดที่มาจากกล่องด้วยผลการกดในเครื่อง — คำสั่งยังค้างในคิว ไม่ได้ถึงพัดลม */
  assert.match(page, /fromBox \? autoEquipment :/, "ผลการกดในเครื่องยังทับชุดของกล่องได้");
});

test("★ การ์ดอุปกรณ์ต้องแยก 'ไม่ทราบสถานะ' ออกจาก 'ไม่มีสัญญาณ'", () => {
  const panel = src("components/climate/EquipmentPanel.jsx");
  assert.match(panel, /unknown: \{ tone: "offline", label: "ไม่ทราบสถานะ" \}/);
  /* และต้องไม่นับ "กี่ตัวกำลังทำงาน" ตอนที่ไม่รู้ */
  assert.match(panel, /known\s*$|const known = equipment\.known !== false/m);
  assert.match(panel, /ไม่ทราบว่าเดินอยู่กี่ตัว/);
});

test("★ กราฟก๊าซย้อนหลังต้องใช้ค่าของจุดนั้น ไม่ใช่ค่าปัจจุบันซ้ำทุกจุด", () => {
  /* `gasesFor` ทางฟาร์มจริงอ่าน `barn.co2` ตรง ๆ — ไม่ส่ง co2 ของจุดเข้าไป
     ทุกจุดจะได้ค่าเดียวกันหมด กลายเป็นเส้นแบนที่ไม่ใช่ของจริง */
  const page = src("pages/Environment.jsx");
  const block = page.slice(page.indexOf("const gasData"), page.indexOf("const hasGas"));
  assert.match(block, /co2: point\.co2/, "ยังไม่ส่งค่า CO₂ ของจุดนั้นเข้า gasesFor");
});
