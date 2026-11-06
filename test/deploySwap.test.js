/**
 * สคริปต์สลับไฟล์เว็บขึ้นของจริง ต้อง "กดซ้ำแล้วไม่พัง" (6 พ.ย. 2569)
 *
 * ★★ ทำไมต้องมีเทสต์นี้
 *   วันนั้นคำสั่งสลับแบบเขียนยาวบรรทัดเดียวถูกกดซ้ำหลังรันสำเร็จไปแล้ว
 *   ขั้นแรกย้าย dist ออก **สำเร็จ** ขั้นสองล้มเพราะ dist-new ถูกใช้ไปแล้ว
 *   เว็บจึงไม่เหลือไฟล์ให้เสิร์ฟและตอบ 404
 *   ซ้ำร้าย dist-old-DATE มีอยู่แล้ว `mv` จึงย้าย **เข้าไปซ้อนข้างใน** แทนที่จะเขียนทับ
 *
 * ทดสอบกับโฟลเดอร์ชั่วคราว (ตั้ง ROOT) จึงไม่แตะเว็บจริงเลย
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../ops/deploy-swap-remote.sh", import.meta.url));

/** สร้างโฟลเดอร์แบบ dist ที่ "ครบ" (มี index.html + ไฟล์ใน assets) */
const makeDist = (dir, bundle) => {
  mkdirSync(path.join(dir, "assets"), { recursive: true });
  writeFileSync(path.join(dir, "assets", bundle), "// ไฟล์ทดสอบ");
  writeFileSync(path.join(dir, "index.html"), `<script src="/assets/${bundle}"></script>`);
};

const run = (root) => {
  try {
    return { code: 0, out: execFileSync("sh", [SCRIPT], { env: { ...process.env, ROOT: root }, encoding: "utf8" }) };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
};

const sandbox = () => mkdtempSync(path.join(tmpdir(), "swine-swap-"));
const bundleOf = (dir) => readdirSync(path.join(dir, "assets"))[0];

test("ปกติ: มีของใหม่ครบ → สำรองของเดิมแล้วสลับ", () => {
  const root = sandbox();
  makeDist(path.join(root, "dist"), "main-OLD.js");
  makeDist(path.join(root, "dist-new"), "main-NEW.js");

  const r = run(root);
  assert.equal(r.code, 0, r.out);
  assert.equal(bundleOf(path.join(root, "dist")), "main-NEW.js", "dist ต้องเป็นของใหม่");
  assert.ok(!existsSync(path.join(root, "dist-new")), "dist-new ต้องถูกใช้ไปแล้ว");

  const backups = readdirSync(root).filter((f) => f.startsWith("dist-old-"));
  assert.equal(backups.length, 1, "ต้องมีสำรองหนึ่งชุด");
  assert.equal(bundleOf(path.join(root, backups[0])), "main-OLD.js", "สำรองต้องเป็นของเดิม");
  rmSync(root, { recursive: true, force: true });
});

test("★★ กดซ้ำ: ไม่มี dist-new แล้ว → ต้องไม่แตะอะไรเลย และไม่ถือว่าผิดพลาด", () => {
  const root = sandbox();
  makeDist(path.join(root, "dist"), "main-LIVE.js");

  const r = run(root);
  assert.equal(r.code, 0, "ไม่มีของใหม่ไม่ใช่ความผิดพลาด");
  assert.match(r.out, /ไม่มี dist-new/);
  assert.ok(existsSync(path.join(root, "dist")), "★ dist ต้องยังอยู่ — นี่คือบั๊กที่ทำให้เว็บ 404");
  assert.equal(bundleOf(path.join(root, "dist")), "main-LIVE.js");
  assert.equal(readdirSync(root).filter((f) => f.startsWith("dist-old-")).length, 0, "ต้องไม่สร้างสำรองเปล่า");
  rmSync(root, { recursive: true, force: true });
});

test("★ ของใหม่ไม่ครบ (ไม่มี index.html) → หยุด และไม่แตะของเดิม", () => {
  const root = sandbox();
  makeDist(path.join(root, "dist"), "main-LIVE.js");
  mkdirSync(path.join(root, "dist-new", "assets"), { recursive: true });
  writeFileSync(path.join(root, "dist-new", "assets", "main-X.js"), "x");

  const r = run(root);
  assert.equal(r.code, 1, "ต้องออกด้วยรหัสผิดพลาด");
  assert.equal(bundleOf(path.join(root, "dist")), "main-LIVE.js", "ของเดิมต้องไม่ถูกแตะ");
  assert.ok(existsSync(path.join(root, "dist-new")), "ของใหม่ต้องยังอยู่ให้ไปแก้");
  rmSync(root, { recursive: true, force: true });
});

test("★ assets ว่าง → หยุด และไม่แตะของเดิม", () => {
  const root = sandbox();
  makeDist(path.join(root, "dist"), "main-LIVE.js");
  mkdirSync(path.join(root, "dist-new", "assets"), { recursive: true });
  writeFileSync(path.join(root, "dist-new", "index.html"), "<html>");

  const r = run(root);
  assert.equal(r.code, 1);
  assert.equal(bundleOf(path.join(root, "dist")), "main-LIVE.js");
  rmSync(root, { recursive: true, force: true });
});

test("★★ ชื่อสำรองชนกัน → หาชื่อใหม่ ห้ามย้ายเข้าไปซ้อนข้างใน", () => {
  const root = sandbox();
  makeDist(path.join(root, "dist"), "main-OLD.js");
  makeDist(path.join(root, "dist-new"), "main-NEW.js");
  /* จองชื่อที่สคริปต์จะเลือกไว้ก่อน (สแตมป์นาทีเดียวกัน) */
  const stamp = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const name = `dist-old-${stamp.getFullYear()}${p(stamp.getMonth() + 1)}${p(stamp.getDate())}-${p(stamp.getHours())}${p(stamp.getMinutes())}`;
  mkdirSync(path.join(root, name), { recursive: true });
  writeFileSync(path.join(root, name, "ของเก่ากว่า.txt"), "เดิม");

  const r = run(root);
  assert.equal(r.code, 0, r.out);
  assert.equal(bundleOf(path.join(root, "dist")), "main-NEW.js");
  assert.ok(
    !existsSync(path.join(root, name, "dist")),
    "★ ห้ามมี dist ซ้อนอยู่ในโฟลเดอร์สำรอง — นี่คืออาการที่ทำให้หาของไม่เจอ",
  );
  assert.ok(existsSync(path.join(root, name, "ของเก่ากว่า.txt")), "ของในสำรองเดิมต้องไม่ถูกกลบ");
  rmSync(root, { recursive: true, force: true });
});

test("★ ไม่มี dist เดิม (เว็บล่มอยู่) → วางของใหม่ลงไปได้เลย", () => {
  const root = sandbox();
  makeDist(path.join(root, "dist-new"), "main-FIX.js");

  const r = run(root);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ไม่มี dist เดิม/);
  assert.equal(bundleOf(path.join(root, "dist")), "main-FIX.js");
  rmSync(root, { recursive: true, force: true });
});
