/**
 * ตั๋วชั่วคราวสำหรับภาพสด (T1.356)
 *
 * ★★ ความเสี่ยงของเรื่องนี้คือ **ตั๋วกลายเป็นประตูหลังที่ไม่มีวันหมดอายุ**
 * เทสต์ชุดนี้จึงกันสองเรื่องเป็นหลัก: หมดอายุแล้วต้องใช้ไม่ได้จริง
 * และใบที่ไม่เคยออกต้องไม่ผ่านไม่ว่าจะส่งอะไรมา
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  TICKET_TTL_MS,
  _clearTickets,
  checkTicket,
  issueTicket,
} from "../server/src/vision/ticket.js";

test("ตั๋วที่เพิ่งออกใช้ได้ และบอกได้ว่าเป็นของใคร", () => {
  _clearTickets();
  const { ticket } = issueTicket("ผู้ใช้-1");
  const r = checkTicket(ticket);
  assert.equal(r.ok, true);
  assert.equal(r.userId, "ผู้ใช้-1");
});

test("★ หมดอายุแล้วใช้ไม่ได้", () => {
  _clearTickets();
  const now = Date.now();
  const { ticket } = issueTicket("ผู้ใช้-1", now);
  assert.equal(checkTicket(ticket, now + TICKET_TTL_MS - 1).ok, true);
  assert.equal(checkTicket(ticket, now + TICKET_TTL_MS).ok, false);
});

test("★ ใบที่ไม่เคยออก ใช้ไม่ได้ทุกกรณี", () => {
  _clearTickets();
  issueTicket("ผู้ใช้-1");
  for (const bad of [null, undefined, "", "ไม่ใช่ตั๋ว", "0", "undefined"]) {
    assert.equal(checkTicket(bad).ok, false, `ไม่ควรผ่าน: ${String(bad)}`);
  }
});

test("ใช้ซ้ำได้จนหมดอายุ — ภาพสดหลุดแล้วเบราว์เซอร์ต่อใหม่เอง", () => {
  _clearTickets();
  const { ticket } = issueTicket("ผู้ใช้-1");
  assert.equal(checkTicket(ticket).ok, true);
  assert.equal(checkTicket(ticket).ok, true);
});

test("ตั๋วคนละใบไม่ซ้ำกัน และยาวพอจะเดาไม่ได้", () => {
  _clearTickets();
  const a = issueTicket("ผู้ใช้-1").ticket;
  const b = issueTicket("ผู้ใช้-1").ticket;
  assert.notEqual(a, b);
  assert.ok(a.length >= 32, `ตั๋วสั้นเกินไป: ${a.length} ตัวอักษร`);
});

test("บอกอายุเป็นวินาทีให้หน้าเว็บต่ออายุทัน", () => {
  _clearTickets();
  assert.equal(issueTicket("ผู้ใช้-1").expiresInSec, Math.round(TICKET_TTL_MS / 1000));
});

test("★ ขอรัว ๆ แล้วใบล่าสุดต้องยังใช้ได้ — ไม่ใช่ถูกกันเพราะคลังเต็ม", () => {
  _clearTickets();
  let last = "";
  for (let i = 0; i < 600; i += 1) last = issueTicket(`ผู้ใช้-${i}`).ticket;
  assert.equal(checkTicket(last).ok, true);
});
