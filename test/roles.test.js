/**
 * สิทธิ์ 4 ระดับไล่ขั้น (T1.251) — ผู้ชม < ผู้บันทึก < ผู้ควบคุมอุปกรณ์ < ผู้ดูแลระบบ
 *
 * สิ่งที่ห้ามพลาดแบบเงียบ ๆ:
 *   · ขั้นสูงต้องทำได้ทุกอย่างที่ขั้นต่ำทำได้ (ไม่มีช่องโหว่กลางบันได)
 *   · ค่าเพี้ยน/ค่ารุ่นเก่าใน localStorage ต้องไม่กลายเป็นสิทธิ์สูง
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ACCOUNT_ROLES, PERMISSIONS, ROLE_ORDER, getAccountRole, roleCan } from "../src/lib/auth/roles.js";

test("ตรงตามที่ผู้ใช้เลือก: ผู้ชมดูได้อย่างเดียว", () => {
  for (const action of ["record.write", "rules.write", "equipment.control", "farm.manage", "system.settings"]) {
    assert.equal(roleCan("viewer", action), false, action);
  }
  assert.equal(roleCan("viewer", "prefs.write"), true);
});

test("ผู้บันทึก = แก้ไขบางส่วน (งานบันทึก + เกณฑ์/แจ้งเตือน) แต่คุมอุปกรณ์ไม่ได้", () => {
  assert.equal(roleCan("editor", "record.write"), true);
  assert.equal(roleCan("editor", "rules.write"), true);
  assert.equal(roleCan("editor", "equipment.control"), false);
  assert.equal(roleCan("editor", "farm.manage"), false);
});

test("ผู้ควบคุมอุปกรณ์คุมพัดลม/ปั๊มได้ แต่จัดการฟาร์มและระบบไม่ได้", () => {
  assert.equal(roleCan("operator", "equipment.control"), true);
  assert.equal(roleCan("operator", "farm.manage"), false);
  assert.equal(roleCan("operator", "system.settings"), false);
});

test("ไล่ขั้นจริง — ระดับสูงกว่าทำได้ทุกอย่างที่ระดับต่ำกว่าทำได้", () => {
  for (const action of Object.keys(PERMISSIONS)) {
    let allowedBelow = false;
    for (const id of ROLE_ORDER) {
      const ok = roleCan(id, action);
      if (allowedBelow) assert.equal(ok, true, `${id} ต้องทำ ${action} ได้เพราะขั้นต่ำกว่าทำได้`);
      allowedBelow = allowedBelow || ok;
    }
  }
});

test("ผู้ดูแลระบบทำได้ทุกอย่าง · คีย์ที่ไม่มีในตารางทำไม่ได้แม้เป็นแอดมิน", () => {
  for (const action of Object.keys(PERMISSIONS)) assert.equal(roleCan("admin", action), true, action);
  assert.equal(roleCan("admin", "typo.key"), false);
});

test("ค่ารุ่นเก่า user → ผู้บันทึก · ค่าไม่รู้จัก → ผู้ชม (ต่ำสุด)", () => {
  assert.equal(getAccountRole("user").id, "editor");
  assert.equal(getAccountRole("superadmin").id, "viewer");
  assert.equal(getAccountRole(undefined).id, "viewer");
  assert.equal(roleCan("superadmin", "farm.manage"), false);
});

test("ลำดับใน ACCOUNT_ROLES ตรงกับ ROLE_ORDER (หน้าจอเรียงตามนี้)", () => {
  assert.deepEqual(ACCOUNT_ROLES.map((r) => r.id), ROLE_ORDER);
});
