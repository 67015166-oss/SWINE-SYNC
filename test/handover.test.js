/**
 * ของสำหรับส่งมอบต้องไม่เน่าเงียบ ๆ (T1.298)
 *
 * ระบบนี้ต้องส่งต่อให้บริษัทดูแลแทน — เอกสารกับสคริปต์ตรวจสุขภาพคือทางเดียวที่คนใหม่จะรับช่วงได้
 * เทสต์ชุดนี้กันสองอย่าง: ลิงก์ที่ชี้ไปไฟล์ที่ไม่มีอยู่ · สคริปต์ที่ขาดการตรวจสำคัญไปเงียบ ๆ
 */
import test from "node:test";
import assert from "node:assert/strict";
import { accessSync, constants, readdirSync, readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const script = read("../ops/health-check.sh");

/* เอกสารส่งมอบแยกเป็นหน้า ๆ แล้ว (30 ต.ค. 2569) — หน้าสารบัญ + docs/handover/*.md
   เทสต์ต้องดูทั้งชุด ไม่ใช่แค่หน้าสารบัญ ไม่งั้นเนื้อหาที่ย้ายออกไปจะหลุดการตรวจ */
const PAGE_DIR = new URL("../docs/ส่งมอบ/ฉบับใช้งาน/handover/", import.meta.url);
const pages = [
  { url: new URL("../docs/ส่งมอบ/ฉบับใช้งาน/HANDOVER.md", import.meta.url), name: "HANDOVER.md" },
  ...readdirSync(PAGE_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ url: new URL(f, PAGE_DIR), name: `handover/${f}` })),
];
const handover = pages.map((p) => readFileSync(p.url, "utf8")).join("\n");

test("ลิงก์ในเอกสารส่งมอบทุกหน้าต้องชี้ไปไฟล์ที่มีอยู่จริง", () => {
  assert.ok(pages.length >= 5, "เอกสารส่งมอบควรมีหน้าสารบัญและหน้าย่อยอย่างน้อยสี่หน้า");
  let checked = 0;
  for (const page of pages) {
    const body = readFileSync(page.url, "utf8");
    const links = [...body.matchAll(/\]\(([^)\s]+\.md)\)/g)].map((m) => m[1]);
    for (const l of new Set(links)) {
      if (/^https?:/.test(l)) continue;
      /* ลิงก์เขียนแบบสัมพัทธ์กับไฟล์ที่มันอยู่ จึงต้องแก้จาก URL ของหน้านั้น ไม่ใช่จาก docs/ */
      accessSync(new URL(l, page.url), constants.R_OK);
      checked += 1;
    }
  }
  assert.ok(checked >= 10, "เอกสารส่งมอบควรลิงก์ถึงกันและถึงเอกสารอื่นมากกว่านี้");
});

test("หน้าสารบัญต้องลิงก์ไปหน้าย่อยครบทุกหน้า", () => {
  const index = readFileSync(pages[0].url, "utf8");
  for (const page of pages.slice(1)) {
    const file = page.name.replace("handover/", "");
    assert.ok(index.includes(`handover/${file}`), `หน้าสารบัญไม่ได้ลิงก์ไป ${file}`);
  }
});

test("เอกสารส่งมอบต้องบอกครบ: อะไรรันที่ไหน · ตรวจยังไง · ความลับอยู่ไหน · อะไรค้าง", () => {
  for (const must of [
    "box-mew",
    "ops/health-check.sh",
    ".env",
    "300 ข้อความ/เดือน",
    "TLS interception",
  ]) {
    assert.ok(handover.includes(must), `เอกสารส่งมอบไม่ได้พูดถึง "${must}"`);
  }
});

test("★ ต้องมีหน้าที่อธิบายว่าลิงก์ไหนคืออะไร — คนใหม่สับสนชื่อโดเมนที่คล้ายกัน", () => {
  const page = pages.find((p) => p.name.includes("ลิงก์"));
  assert.ok(page, "ไม่มีหน้าพจนานุกรมลิงก์ใน docs/handover/");
  const body = readFileSync(page.url, "utf8");
  /* สี่ชื่อนี้ลงท้ายเหมือนกันแต่เป็นของคนละเจ้าของ — ต้องบอกให้ครบว่าอันไหนคืออะไร */
  for (const host of ["mew.plotnexuslab.com", "lab.plotnexuslab.com", "ota.plotnexuslab.com", "fern.plotnexuslab.com"]) {
    assert.ok(body.includes(host), `หน้าลิงก์ไม่ได้อธิบาย ${host}`);
  }
  /* ด่านของแต่ละเส้นทางคนละแบบกัน เดาผิดแล้วไล่ 401 ผิดทาง */
  for (const route of ["/api/health", "/api/ingest", "/api/line/webhook", "/api/control/outbox"]) {
    assert.ok(body.includes(route), `หน้าลิงก์ไม่ได้อธิบาย ${route}`);
  }
});

test("สคริปต์ตรวจสุขภาพต้องตรวจครบทั้ง 5 เรื่อง และอ่านอย่างเดียว", () => {
  for (const check of ["PRIMARY_HEALTH_URL", "swine-bridge", "node-red", "dataflow-watch.json", "df -h"]) {
    assert.ok(script.includes(check), `สคริปต์ไม่ได้ตรวจ "${check}"`);
  }
  /* ห้ามแก้อะไรในเครื่องเด็ดขาด — คนใหม่ต้องกล้ารันโดยไม่ต้องอ่านโค้ดก่อน
     คำสั่งแก้ไขมีได้เฉพาะใน**ข้อความแนะนำ** (บรรทัด bad/warn) กับคอมเมนต์ ไม่ใช่บรรทัดที่รันจริง */
  const dangerous = /\brm\b|docker (compose )?(up|down|restart|stop)\b|launchctl (kickstart|bootout)/;
  /* เผื่อบรรทัดที่เป็นกิ่งของ case เช่น `0) warn "…" ;;` */
  const advice = /^\s*(\S+\)\s*)?(#|bad |warn |echo |printf )/;
  const executed = script
    .split("\n")
    .filter((line) => dangerous.test(line) && !advice.test(line));
  assert.deepEqual(executed, [], "สคริปต์มีบรรทัดที่แก้ของในเครื่องจริง");
});

test("★ บน macOS ต้องวัดดิสก์ที่วอลุ่มข้อมูล ไม่ใช่ / ซึ่งเป็นวอลุ่มระบบ", () => {
  /* เจอจริงตอนเขียนสคริปต์: `df /` บอก "ใช้ไป 60%" ทั้งที่วอลุ่มข้อมูลเต็ม 99% */
  assert.match(script, /\/System\/Volumes\/Data/);
});

test("★ ห้ามใช้สรรพนามบุรุษที่หนึ่งหรือเจาะจงชื่อคน (ผู้ใช้สั่ง 5 พ.ย. 2569)", () => {
  /* เอกสารส่งมอบต้องอ่านได้โดยไม่ต้องรู้ว่าใครเขียน — ใช้คำแทนบทบาทเท่านั้น
     เช่น "ผู้พัฒนาเดิม" · "ผู้ดูแลระบบเดิม" · "ส่วนงานนี้" · "ระบบนี้" · "ฝั่ง BOX-mew"
     ★ ชื่อทางเทคนิคที่เปลี่ยนไม่ได้ (box-mew · mew.plotnexuslab.com · jewly-desktop)
       ไม่นับเป็นการเจาะจงชื่อคน เพราะเป็นที่อยู่เครื่องที่ระบบใช้จริง */
  const BANNED = ["เรา", "หนู", "มิว", "ฉัน", "ดิฉัน", "ผมเอง", "จิว", "เหมย", "มุ้ย"];
  for (const f of pages) {
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
