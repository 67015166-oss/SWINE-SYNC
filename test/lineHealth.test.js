/**
 * ตัวเฝ้าระวังช่องทางไลน์ (T1.278) — เทสต์กติกาล้วน ๆ ไม่แตะฐานข้อมูลและไม่ยิงเครือข่าย
 *
 * เหตุที่ต้องมีตัวนี้: 23 ก.ย. 2569 ช่องทางตายไปเงียบ ๆ ทั้งที่ทุกอย่างในเครื่องปกติ
 * กว่าจะรู้ก็ต่อเมื่อมีคนลองกดแล้วไม่มีอะไรเกิดขึ้น
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { CHECK_EVERY_MIN, healthMessage, notifyKind, shouldCheck } from "../server/src/line/healthRules.js";

const at = (iso) => new Date(iso);

test("ยังไม่เคยตรวจ = ต้องตรวจทันที", () => {
  assert.equal(shouldCheck(null, at("2026-09-23T10:00:00Z")), true);
});

test("ตรวจไปแล้วต้องรอครบชั่วโมงก่อน", () => {
  const last = at("2026-09-23T10:00:00Z");
  assert.equal(shouldCheck(last, at("2026-09-23T10:30:00Z")), false);
  assert.equal(shouldCheck(last, at("2026-09-23T11:00:00Z")), true);
  assert.equal(CHECK_EVERY_MIN, 60);
});

test("บอกผู้ใช้เฉพาะตอนสถานะเปลี่ยน ไม่ใช่ทุกชั่วโมง", () => {
  /* พังต่อเนื่อง = เตือนครั้งเดียวตอนเพิ่งพัง */
  assert.equal(notifyKind(false, true), "down");
  assert.equal(notifyKind(false, false), null);
  /* กลับมาใช้ได้ = บอกให้รู้ด้วย จะได้ไม่ต้องเดา */
  assert.equal(notifyKind(true, false), "recovered");
  assert.equal(notifyKind(true, true), null);
});

test("ตรวจครั้งแรกแล้วพังเลย ต้องเตือน · ครั้งแรกแล้วปกติ ไม่ต้องทัก", () => {
  assert.equal(notifyKind(false, null), "down");
  assert.equal(notifyKind(true, null), null);
});

test("ข้อความตอนพังต้องบอกว่าอะไรยังใช้ได้ และต้องทำอะไรต่อ", () => {
  const msg = healthMessage("down", { since: "23 ก.ย. 2569 10:00 น.", reason: "COULD_NOT_CONNECT" });
  assert.equal(msg.type, "text");
  assert.match(msg.text, /ใช้ไม่ได้ชั่วคราว/);
  /* สำคัญ: คนต้องรู้ว่าแจ้งเตือนยังส่งอยู่ ไม่งั้นจะคิดว่าระบบตายทั้งหมด */
  assert.match(msg.text, /ยังส่งได้ตามปกติ/);
  assert.match(msg.text, /tailscale funnel/);
  assert.match(msg.text, /COULD_NOT_CONNECT/);

  assert.match(healthMessage("recovered").text, /กลับมาใช้ได้แล้ว/);
});

/* ---------- กติกาที่ห้ามรื้อ ---------- */

test("ตัวเฝ้าระวังต้องเคารพ LINE_NOTIFY เหมือนตัวส่งสรุป/แจ้งเตือน", () => {
  /* 24 ก.ย. 2569: ตอนย้ายระบบไป box-mew มีสองเครื่องรันชุดเดียวกัน เครื่องที่ยังไม่ถึงคิว
     ตั้ง LINE_NOTIFY=0 ไว้ แต่ตรงนี้เรียก sendLine ตรง ๆ จึงยังส่ง คนจะได้ข้อความซ้ำสองชุด */
  const src = readFileSync(new URL("../server/src/line/health.js", import.meta.url), "utf8");
  assert.match(src, /import \{ lineEnabled \} from "\.\/notifier\.js"/);
  assert.match(src, /if \(kind && lineEnabled\(\)\)/);
  /* ยังต้องบันทึกผลตรวจลงฐานทุกครั้ง แม้ปิดการส่ง — บันทึกไม่ได้กวนใคร */
  assert.ok(src.indexOf("insert into line_health") < src.indexOf("lineEnabled()"));
});
