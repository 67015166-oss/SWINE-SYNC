/**
 * ปุ่มบันทึก/ลบภาพจากกล้องต้องผ่านสิทธิ์ `record.write` (T1.344)
 *
 * ที่ต้องมีเทสต์นี้: `roles.js` เขียนไว้ตั้งแต่ต้นว่า `record.write` ครอบคลุม
 * "บันทึก/ลบภาพจากกล้อง" แต่หน้าจอกับฮุกลืมเช็กจริง ๆ อยู่นาน — ผู้ชมกดบันทึกภาพได้
 * ช่องแบบนี้ไม่ทำให้เทสต์เดิมแดงและไม่ทำให้หน้าจอพัง จึงหายเงียบจนกว่าจะมีคนลองกด
 *
 * เทสต์นี้อ่านไฟล์เป็นข้อความ ไม่ได้ render เพราะโปรเจกต์นี้ไม่มีตัว render ในเทสต์
 * สิ่งที่ล็อกไว้คือ "ด่านต้องยังอยู่" ไม่ใช่หน้าตาของปุ่ม
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { roleCan } from "../src/lib/auth/roles.js";

const snapshots = readFileSync(new URL("../src/lib/snapshots.js", import.meta.url), "utf8");
const barnDetail = readFileSync(new URL("../src/pages/BarnDetail.jsx", import.meta.url), "utf8");

test("กติกา: ผู้ชมบันทึกภาพไม่ได้ ผู้บันทึกขึ้นไปได้", () => {
  assert.equal(roleCan("viewer", "record.write"), false);
  assert.equal(roleCan("editor", "record.write"), true);
  assert.equal(roleCan("operator", "record.write"), true);
  assert.equal(roleCan("admin", "record.write"), true);
});

test("ด่านชั้นใน: ฮุก useSnapshots เช็กสิทธิ์เอง ไม่เชื่อว่าปุ่มถูกปิดมาแล้ว", () => {
  assert.match(snapshots, /can\("record\.write"\)/, "ฮุกต้องถาม can(\"record.write\")");
  /* add ต้องคืน null และ remove ต้องไม่ทำอะไร เมื่อไม่มีสิทธิ์ */
  assert.match(snapshots, /if \(!allowed\) return null;/, "add ต้องคืน null เมื่อไม่มีสิทธิ์");
  assert.match(snapshots, /if \(!allowed\) return;/, "remove ต้องไม่ลบเมื่อไม่มีสิทธิ์");
});

test("ด่านชั้นนอก: capture() ในหน้าโรงเรือนกันไว้ก่อนเรียกฮุก", () => {
  assert.match(
    barnDetail,
    /const capture = \(\) => \{[\s\S]{0,400}?if \(!cam \|\| !canWrite\) return;/,
    "capture() ต้องออกก่อนถ้าไม่มีสิทธิ์"
  );
});

test("ปุ่มที่เขียนข้อมูลเรื่องภาพต้องถูกปิด ไม่ใช่ซ่อน และต้องบอกเหตุผล", () => {
  /* ปุ่มบันทึกภาพสองที่ (บนภาพกล้อง + ในหน้าต่างขยาย) และปุ่มลบสามที่ */
  const guarded = barnDetail.match(/disabled=\{!canWrite\}/g) ?? [];
  assert.ok(guarded.length >= 5, `คาดว่ามีปุ่มที่ปิดด้วย !canWrite อย่างน้อย 5 จุด เจอ ${guarded.length}`);

  /* ห้ามบอกเหตุผลแค่ใน title อย่างเดียว — จอสัมผัสไม่มี hover */
  assert.match(
    barnDetail,
    /<AdminNote action="record\.write">[\s\S]{0,200}?บันทึกภาพใหม่และลบภาพไม่ได้/,
    "ต้องมี AdminNote อธิบายว่าทำไมปุ่มภาพถูกปิด"
  );
});
