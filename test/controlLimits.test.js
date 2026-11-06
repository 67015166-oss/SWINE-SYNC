/**
 * ส่งคำสั่งไปตู้ควบคุมโรงเรือน (T1.284)
 *
 * ของที่พังแล้วเงียบ และเงียบแบบที่สัตว์เดือดร้อนก่อนคนรู้:
 *   - ด่าน "ห้ามเด็ดขาด" ถูกทำให้ยืนยันข้ามได้ → ปิดพัดลมตอน 34 °C ได้ด้วยการกดสองครั้ง
 *   - ไม่รู้อุณหภูมิแล้วปล่อยผ่าน → กันได้เฉพาะตอนที่ไม่ต้องกัน
 *   - ม่านน้ำหลุดจากด่านอุณหภูมิเพราะมันชื่อว่า "ปั๊ม" ไม่ใช่ "พัดลม"
 *   - ทะเบียนอุปกรณ์ฝั่งหลังบ้านไม่ตรงกับหน้าเว็บ → สั่งแล้วได้ 404 เฉพาะบางตัว
 *   - เส้นทางสั่งงานลืมด่านสิทธิ์ → ผู้ชมสั่งพัดลมได้
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { checkCommand, ACTIONS, FAN_HZ } from "../server/src/control/validate.js";
import { gate, NEAR_C, SLOW_HZ, RATE_PER_MINUTE, TEMP_STALE_MINUTES } from "../server/src/control/limits.js";
import { resolveDevice, defaultDevices, FAN_COUNT as SERVER_FANS, PUMP_DUTY } from "../server/src/control/devices.js";
import { transportName, canSend } from "../server/src/control/transport.js";
import { FAN_COUNT, PUMP_ROLES } from "../src/data/mock/barnSystems.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const dev = (id, kind) => resolveDevice(null, kind, id);
const cool = { online: true, tempMax: 28, tempAgeMinutes: 1, recentCount: 0 };
const cmd = (o) => ({ deviceKind: "fan", deviceId: "FAN 1", action: "off", hz: null, confirmed: false, ...o });

/* ── รูปคำสั่ง ─────────────────────────────────────────────── */

test("checkCommand: รับคำสั่งที่ถูก และบอกเหตุผลเมื่อผิด", () => {
  assert.equal(checkCommand({ deviceKind: "fan", deviceId: "FAN 3", action: "on", hz: 50 }).ok, true);
  assert.equal(checkCommand({ deviceKind: "pump", deviceId: "P2", action: "off" }).ok, true);
  assert.equal(checkCommand({ deviceKind: "pump", deviceId: "P2", action: "speed", hz: 40 }).ok, false);
  assert.equal(checkCommand({ deviceKind: "fan", deviceId: "FAN 0", action: "off" }).ok, false);
  assert.equal(checkCommand({ deviceKind: "light", deviceId: "L1", action: "off" }).ok, false);
  assert.equal(checkCommand({ deviceKind: "fan", deviceId: "FAN 1", action: "speed" }).ok, false);
});

test("checkCommand: hz ออกนอกช่วงไม่ผ่าน และ hz ใส่กับ action ที่ไม่รับไม่ได้", () => {
  for (const hz of [FAN_HZ.min - 1, FAN_HZ.max + 1, "เร็ว"]) {
    assert.equal(checkCommand({ deviceKind: "fan", deviceId: "FAN 1", action: "on", hz }).ok, false, `hz=${hz}`);
  }
  assert.equal(checkCommand({ deviceKind: "fan", deviceId: "FAN 1", action: "off", hz: 40 }).ok, false);
  assert.equal(checkCommand({ deviceKind: "fan", deviceId: "FAN 1", action: "auto", hz: 40 }).ok, false);
});

/* ── ด่านความปลอดภัย ──────────────────────────────────────── */

test("ร้อนถึงเพดานแล้วปิดพัดลมไม่ได้ และยืนยันก็ยังไม่ได้", () => {
  const ctx = { ...cool, tempC: 28.4, device: dev("FAN 1", "fan") };
  const r = gate(cmd(), ctx);
  assert.equal(r.ok, false);
  assert.equal(r.code, "too_hot");
  assert.notEqual(r.needsConfirm, true);
  /* ★ ข้อสำคัญที่สุดของไฟล์นี้ — ยืนยันแล้วต้องยังไม่ผ่าน */
  assert.equal(gate(cmd({ confirmed: true }), ctx).ok, false);
});

test("ใกล้เพดานต้องยืนยัน — ยืนยันแล้วผ่าน และจดว่าข้ามกติกาข้อไหนมา", () => {
  const ctx = { ...cool, tempC: 28 - NEAR_C + 0.1, device: dev("FAN 1", "fan") };
  const first = gate(cmd(), ctx);
  assert.equal(first.needsConfirm, true);
  assert.equal(first.code, "near_limit");
  const after = gate(cmd({ confirmed: true }), ctx);
  assert.equal(after.ok, true);
  assert.equal(after.confirmedPast, "near_limit");
});

test("อากาศเย็นพอ ปิดพัดลมได้เลย ไม่ต้องยืนยัน", () => {
  assert.equal(gate(cmd(), { ...cool, tempC: 24, device: dev("FAN 1", "fan") }).ok, true);
});

test("ไม่รู้อุณหภูมิ = ห้ามลดความเย็น แต่สั่ง auto ได้เสมอ", () => {
  for (const ctx of [
    { ...cool, tempC: null, device: dev("FAN 1", "fan") },
    { ...cool, tempC: 24, tempAgeMinutes: TEMP_STALE_MINUTES + 1, device: dev("FAN 1", "fan") },
  ]) {
    assert.equal(gate(cmd(), ctx).code, "temp_unknown");
    assert.equal(gate(cmd({ confirmed: true }), ctx).ok, false, "ยืนยันข้ามไม่ได้");
    assert.equal(gate(cmd({ action: "auto" }), ctx).ok, true, "auto ต้องผ่าน");
  }
});

test("หรี่พัดลมลงต่ำตอนอากาศใกล้ร้อนต้องยืนยัน แต่เร่งแรงผ่านเลย", () => {
  const ctx = { ...cool, tempC: 27.2, device: dev("FAN 1", "fan") };
  assert.equal(gate(cmd({ action: "speed", hz: SLOW_HZ - 5 }), ctx).needsConfirm, true);
  assert.equal(gate(cmd({ action: "speed", hz: 55 }), ctx).ok, true);
});

test("ม่านน้ำถูกด่านอุณหภูมิคุมเหมือนพัดลม แต่ปั๊มระบายน้ำไม่ถูกคุม", () => {
  const hot = { ...cool, tempC: 29 };
  const curtain = gate(cmd({ deviceKind: "pump", deviceId: "P3" }), { ...hot, device: dev("P3", "pump") });
  assert.equal(curtain.code, "too_hot", "ม่านน้ำเป็นอุปกรณ์ทำความเย็น");
  const drain = gate(cmd({ deviceKind: "pump", deviceId: "P2" }), { ...hot, device: dev("P2", "pump") });
  assert.equal(drain.ok, true, "ปั๊มระบายน้ำไม่เกี่ยวกับความเย็น");
});

test("ปิดปั๊มน้ำดื่มต้องยืนยันทุกครั้ง ไม่ว่าอากาศจะเย็นแค่ไหน", () => {
  const ctx = { ...cool, tempC: 22, device: dev("P1", "pump") };
  const r = gate(cmd({ deviceKind: "pump", deviceId: "P1" }), ctx);
  assert.equal(r.needsConfirm, true);
  assert.equal(r.code, "critical_pump");
  assert.equal(gate(cmd({ deviceKind: "pump", deviceId: "P1", confirmed: true }), ctx).ok, true);
});

test("โรงเรือนออฟไลน์ · สั่งถี่เกิน · อุปกรณ์ถูกปิดการสั่ง — ปฏิเสธและยืนยันข้ามไม่ได้", () => {
  const d = dev("FAN 1", "fan");
  const cases = [
    [{ ...cool, tempC: 24, device: d, online: false }, "barn_offline"],
    [{ ...cool, tempC: 24, device: d, recentCount: RATE_PER_MINUTE + 1 }, "too_many"],
    [{ ...cool, tempC: 24, device: { ...d, enabled: false } }, "device_disabled"],
  ];
  for (const [ctx, code] of cases) {
    assert.equal(gate(cmd({ confirmed: true }), ctx).code, code);
    assert.equal(gate(cmd({ action: "auto", confirmed: true }), ctx).ok, false, "auto ก็ไม่รอด");
  }
});

/* ── ทะเบียนอุปกรณ์ต้องตรงกับหน้าเว็บ ───────────────────── */

test("จำนวนพัดลมและหน้าที่ของปั๊มตรงกับที่หน้าเว็บใช้", () => {
  assert.equal(SERVER_FANS, FAN_COUNT);
  assert.deepEqual(Object.keys(PUMP_DUTY), PUMP_ROLES.map((p) => p.id));
  for (const role of PUMP_ROLES) {
    assert.equal(PUMP_DUTY[role.id].duty, role.duty, `หน้าที่ของ ${role.id}`);
  }
});

test("อุปกรณ์ที่ไม่มีตัวตนคืน null — สั่งของที่ไม่มีไม่ได้", () => {
  assert.equal(resolveDevice(null, "fan", `FAN ${FAN_COUNT + 1}`), null);
  assert.equal(resolveDevice(null, "pump", "P9"), null);
  assert.equal(defaultDevices().length, FAN_COUNT + PUMP_ROLES.length);
});

test("แถวในฐานทับค่าตั้งต้นได้ รวมถึงธง cooling", () => {
  const row = { kind: "pump", device_id: "P3", duty: "ม่านน้ำ", critical: false, cooling: false, enabled: true, remote_addr: "farm/x" };
  const d = resolveDevice(row, "pump", "P3");
  assert.equal(d.cooling, false);
  assert.equal(d.remote_addr, "farm/x");
});

/* ── ฐานและเส้นทางต้องสอดคล้องกับโค้ด ───────────────────── */

test("migration รับทุก action และทุกสถานะที่โค้ดใช้จริง", () => {
  const m = read("../server/src/db/migrations/1759100000000_control-command.js");
  for (const a of ACTIONS) assert.match(m, new RegExp(`'${a}'`), `action ${a}`);
  for (const s of ["rejected", "held", "sent", "confirmed", "failed"]) {
    assert.match(m, new RegExp(`'${s}'`), `status ${s}`);
  }
  assert.match(m, /cooling\s+boolean/, "ต้องมีคอลัมน์ cooling");
  assert.match(m, /unique \(barn_key, client_id\)/, "กดซ้ำต้องไม่ได้สองแถว");
});

test("เส้นทางสั่งงานมีด่านสิทธิ์ และคำสั่งที่ถูกปฏิเสธก็ต้องถูกบันทึก", () => {
  const r = read("../server/src/modules/control/route.js");
  assert.match(r, /controlRouter\.post\([^)]*requireEquipmentControl/s, "POST ต้องผ่าน requireEquipmentControl");
  assert.match(r, /save\("rejected"/, "คำสั่งที่ถูกปฏิเสธต้องบันทึก");
  assert.match(r, /app\.use|controlRouter\.use\(requireAuth\)/, "ทั้ง router ต้องล็อกอินก่อน");
  const app = read("../server/src/app.js");
  assert.match(app, /app\.use\("\/api\/control", controlRouter\)/);
});

test("ค่าตั้งต้นของทางส่งคือเก็บคิวไว้ ไม่ส่งออก", () => {
  assert.equal(transportName(), "hold");
  assert.equal(canSend(), false);
});
