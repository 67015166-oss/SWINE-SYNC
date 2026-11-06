/**
 * เอกสารส่งมอบฉบับองค์กร 12 หัวข้อต้องไม่เน่าเงียบ ๆ (5 พ.ย. 2569)
 *
 * ชุดนี้เป็นเอกสารที่ส่งให้บริษัทจริง — ลิงก์ตายหรือภาพหายแล้วคนรับช่วงจะตามต่อไม่ได้
 * และ **ห้ามมีความลับหลุดลงไป** เพราะไฟล์ชุดนี้อยู่ใน Git
 */
import test from "node:test";
import assert from "node:assert/strict";
import { accessSync, constants, readdirSync, readFileSync } from "node:fs";

const DIR = new URL("../docs/ส่งมอบองค์กร/", import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith(".md")).sort();
const body = (f) => readFileSync(new URL(f, DIR), "utf8");
const all = files.map(body).join("\n");

/**
 * ★ "ชุดทางการ" = หน้าสารบัญ + หัวข้อ 01–12 เท่านั้น
 *
 * โฟลเดอร์นี้มีไฟล์แนบอื่นปนอยู่ได้ และบางไฟล์ตั้งใจ**ไม่ให้ขึ้น Git** (อยู่ใน `.git/info/exclude`)
 * ➜ เทสต์ที่ตรวจ "ครบไหม" จึงต้องดูเฉพาะชุดทางการ ไม่ใช่ทุกไฟล์ในโฟลเดอร์
 *   ไม่งั้นผลจะต่างกันระหว่างเครื่องที่มีไฟล์แนบ กับเครื่องที่เพิ่ง clone มา
 * ➜ ส่วนกฎเรื่องความลับบังคับ**ทุกไฟล์ที่อ่านเจอ** ไม่สนว่าอยู่ในชุดทางการหรือไม่
 */
const formal = files.filter((f) => f === "README.md" || /^(0[1-9]|1[0-2])-/.test(f));

test("ต้องมีครบ 12 หัวข้อ พร้อมหน้าสารบัญ", () => {
  /* ★ ไม่เช็กจำนวนไฟล์ทั้งโฟลเดอร์ — เอกสารแนบเพิ่มได้ ขอแค่ชุดทางการครบ */
  assert.ok(files.includes("README.md"), "ไม่พบหน้าสารบัญ");
  assert.equal(formal.length, 13, `ชุดทางการควรมี README + 12 หัวข้อ แต่พบ ${formal.length} ไฟล์`);
  for (let n = 1; n <= 12; n += 1) {
    const prefix = String(n).padStart(2, "0");
    assert.ok(
      files.some((f) => f.startsWith(`${prefix}-`)),
      `ไม่พบหัวข้อที่ ${n}`,
    );
  }
});

test("หน้าสารบัญต้องลิงก์ไปครบทุกหัวข้อ", () => {
  const index = body("README.md");
  /* ★ เฉพาะชุดทางการ — ไฟล์แนบที่ไม่ขึ้น Git ไม่ต้องมีในสารบัญ */
  for (const f of formal.filter((f) => f !== "README.md")) {
    assert.ok(index.includes(`(${f})`), `สารบัญไม่ได้ลิงก์ไป ${f}`);
  }
});

test("ลิงก์และภาพทุกอันต้องชี้ไปไฟล์ที่มีอยู่จริง", () => {
  let checked = 0;
  for (const f of files) {
    const url = new URL(f, DIR);
    for (const m of body(f).matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1].split("#")[0];
      if (!target || /^(https?:|mailto:)/.test(target)) continue;
      accessSync(new URL(decodeURIComponent(target), url), constants.R_OK);
      checked += 1;
    }
  }
  assert.ok(checked >= 30, `ตรวจลิงก์ได้แค่ ${checked} อัน — น้อยผิดปกติ`);
});

test("ทุกหัวข้อต้องมีทางกลับหน้าสารบัญ", () => {
  for (const f of formal.filter((f) => f !== "README.md")) {
    assert.ok(body(f).includes("(README.md)"), `${f} ไม่มีลิงก์กลับสารบัญ`);
  }
});

test("★ ห้ามมีความลับหลุดลงเอกสารที่อยู่ใน Git", () => {
  /* จับรูปแบบของจริงเท่านั้น — ชื่อตัวแปรเปล่า ๆ เขียนได้ แต่ค่าที่ตามหลัง = ไม่ได้ */
  const leaks = [
    { re: /LINE_CHANNEL_(ACCESS_TOKEN|SECRET)\s*[=:]\s*\S/, ชื่อ: "โทเคนของไลน์" },
    { re: /\b(POSTGRES_PASSWORD|ADMIN_PASSWORD|FARMY_PASSWORD|INFLUX_TOKEN|CPF_AI_API_KEY|HUB_KEY_SECRET)\s*[=:]\s*\S/, ชื่อ: "รหัสผ่าน/กุญแจ" },
    { re: /postgres:\/\/[^:\s]+:[^@\s]+@/, ชื่อ: "สายต่อฐานที่มีรหัสผ่าน" },
    { re: /\beyJ[A-Za-z0-9_-]{20,}/, ชื่อ: "โทเคนรูปแบบ JWT" },
  ];
  for (const { re, ชื่อ } of leaks) {
    assert.ok(!re.test(all), `พบ${ชื่อ}ในเอกสารส่งมอบ — ต้องเอาออก`);
  }
});

test("ต้องบอกเรื่องที่คนรับช่วงพลาดไม่ได้", () => {
  for (const must of [
    "CHECK constraint",      // บทเรียนที่เสียโควตาไลน์ 177 ใบ
    "จองแถวก่อนส่ง",          // กติกาที่กันการส่งซ้ำไม่รู้จบ
    /* ★ เดิมบังคับคำว่า "QoS 0" กับ "BRIDGE_ROLE" ซึ่งเป็นศัพท์ของท่อรับค่าเซนเซอร์
       ผู้ใช้สั่ง 6 พ.ย. 2569 ว่าเอกสารส่งมอบไม่ต้องมีเรื่องท่อ จึงเปลี่ยนมาบังคับ
       **ใจความที่ยังต้องรู้** แทนศัพท์เฉพาะที่ถูกตัดออกไปแล้ว */
    "ดึงย้อนหลังกลับมาไม่ได้", // ค่าเซนเซอร์ที่ขาดช่วง เอากลับมาไม่ได้
    "health-check.sh",       // ทางตรวจว่าระบบยังดีอยู่ไหม
    "stream_grant",          // สิทธิ์ดึงข้อมูลเป็นศูนย์โดยค่าตั้งต้น
  ]) {
    assert.ok(all.includes(must), `เอกสารส่งมอบไม่ได้พูดถึง "${must}"`);
  }
});

test("★ ห้ามใช้สรรพนามบุรุษที่หนึ่งหรือเจาะจงชื่อคน (ผู้ใช้สั่ง 5 พ.ย. 2569)", () => {
  /* เอกสารส่งมอบต้องอ่านได้โดยไม่ต้องรู้ว่าใครเขียน — ใช้คำแทนบทบาทเท่านั้น
     เช่น "ผู้พัฒนาเดิม" · "ผู้ดูแลระบบเดิม" · "ส่วนงานนี้" · "ระบบนี้" · "ฝั่ง BOX-mew"
     ★ ชื่อทางเทคนิคที่เปลี่ยนไม่ได้ (box-mew · mew.plotnexuslab.com · jewly-desktop)
       ไม่นับเป็นการเจาะจงชื่อคน เพราะเป็นที่อยู่เครื่องที่ระบบใช้จริง */
  const BANNED = ["เรา", "หนู", "มิว", "ฉัน", "ดิฉัน", "ผมเอง", "จิว", "เหมย", "มุ้ย"];
  for (const f of formal.map((f) => ({ url: new URL(f, DIR), name: f }))) {
    const body = readFileSync(f.url, "utf8");
    body.split("\n").forEach((line, n) => {
      for (const w of BANNED) {
        assert.ok(
          !line.includes(w),
          `${f.name} บรรทัด ${n + 1} ใช้คำว่า "${w}" — เอกสารส่งมอบต้องใช้คำแทนบทบาท\n  ${line.trim()}`,
        );
      }
    });
  }
});
