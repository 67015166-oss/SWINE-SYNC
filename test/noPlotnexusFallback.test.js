/**
 * ไม่มีทางถอยไป PlotNexus แล้ว และต้องบอกสาเหตุจริงแทน (T1.342)
 *
 * ═══ ที่มา ═══
 * กุญแจ PlotNexus ถูกถอนสิทธิ์ตั้งแต่ 11 ก.ย. 2569 แต่แอปยังยิงไปทุกครั้งที่
 * **ยังไม่ได้เข้าสู่ระบบ** แล้วได้ 403 กลับมา — เห็นเองในคอนโซลตอนตรวจงาน 16 ต.ค.
 * (หกสัปดาห์หลังกุญแจตาย) จากนั้นหน้าจอถอยไปใช้ข้อมูลตัวอย่างพร้อมข้อความว่า
 * *"ต่อระบบเซนเซอร์ PlotNexus ไม่ได้"*
 *
 * ★ ข้อความนั้นเป็นความจริงที่ไร้ประโยชน์ — มันชวนให้ไปตรวจเซนเซอร์ที่ฟาร์ม
 *   ทั้งที่เซนเซอร์ปกติดี ข้อมูลจริงรออยู่ในระบบกลางแล้ว และทางแก้คือ
 *   **กดเข้าสู่ระบบ** ซึ่งใช้เวลาสองวินาที
 *
 * บทเรียนเดียวกับ T1.335/T1.341: ทางถอยที่ไม่มีวันสำเร็จ ไม่ใช่ทางถอย มันคือทางตาย
 * ที่กลบสาเหตุจริงเอาไว้
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { EN } from "../src/lib/i18n/en.js";

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("แหล่ง PlotNexus ต้องถูกปิดไว้ และกันไว้ที่ปากทางด้วย", () => {
  const client = src("lib/api/plotnexus.js");
  assert.match(client, /VITE_PLOTNEXUS_ENABLED/);
  /* `plotnexusReady` ต้องดูทั้งสวิตช์และกุญแจ ไม่ใช่ดูแค่ว่ามีกุญแจไหม */
  assert.match(client, /plotnexusReady\s*=\s*ENABLED\s*&&/);
  /* กันที่ฟังก์ชันยิงจริงด้วย — เผื่อวันหลังมีคนเพิ่มที่เรียกใหม่แล้วลืมเช็ก */
  assert.match(client, /if \(!ENABLED\) throw/);
});

test("ตอนไม่มีแหล่งจริง ต้องแยก \"ยังไม่ได้เข้าสู่ระบบ\" ออกจาก \"ต่อไม่ได้\"", () => {
  const provider = src("lib/api/LiveFarmsProvider.jsx");
  assert.match(provider, /errorKind: apiConfigured \? "needlogin" : "noserver"/);
  /* `nokey` เป็นของเดิมที่พูดถึงกุญแจ PlotNexus — ต้องไม่ถูกตั้งอีกแล้ว */
  assert.ok(
    !/errorKind:\s*"nokey"/.test(provider),
    "ยังตั้ง errorKind เป็น nokey อยู่ ซึ่งพูดถึงกุญแจที่เลิกใช้แล้ว",
  );
});

test("สองหน้าที่ขึ้นป้ายเตือน ต้องรู้จักสาเหตุใหม่ทั้งสองแบบ", () => {
  for (const page of ["pages/Farms.jsx", "pages/Weather.jsx"]) {
    const text = src(page);
    assert.match(text, /liveErrorKind === "needlogin"/, `${page} ไม่รู้จัก needlogin`);
    assert.match(text, /liveErrorKind === "noserver"/, `${page} ไม่รู้จัก noserver`);
  }
});

test("ป้ายเตือนต้องเลิกโทษ PlotNexus — เซนเซอร์ไม่ได้ผิดอะไร", () => {
  /* จับเฉพาะ**ข้อความที่ผู้ใช้เห็น** ไม่ใช่คำว่า PlotNexus ทั้งไฟล์
     (คอมเมนต์ที่อธิบายประวัติยังเอ่ยถึงได้ และควรเอ่ยด้วย) */
  for (const page of ["pages/Farms.jsx", "pages/Weather.jsx"]) {
    const text = src(page);
    assert.ok(
      !/t\("[^"]*PlotNexus[^"]*"\)/.test(text),
      `${page} ยังมีข้อความบนหน้าจอที่พูดถึง PlotNexus`,
    );
  }
});

test("ตัวดึงประวัติต้องไม่ยิงไปหาแหล่งที่ปิดอยู่", () => {
  for (const hook of ["lib/api/useBarnHistory.js", "lib/api/useWeatherHistory.js"]) {
    const text = src(hook);
    assert.match(text, /if \(!plotnexusReady\)/, `${hook} ยังยิงทั้งที่แหล่งปิดอยู่`);
  }
});

test("ข้อความใหม่ทุกอันต้องมีคำแปลอังกฤษ", () => {
  /* ไทยคือคีย์ ถ้าลืมเติมคำแปล หน้าอังกฤษจะกลับไปเป็นไทยเฉพาะประโยคนั้นแบบเงียบ ๆ
     (เทสต์ i18n เดิมเทียบแค่อังกฤษกับจีน จับกรณี "ลืมทั้งคู่" ไม่ได้) */
  const พูดใหม่ = [
    "ยังไม่ได้เข้าสู่ระบบ — ข้อมูลฟาร์มจริงอยู่ในระบบกลาง เข้าสู่ระบบแล้วจะเห็นทันที · ตอนนี้แสดงเฉพาะข้อมูลตัวอย่าง",
    "สำเนานี้ไม่ได้ต่อกับระบบกลาง จึงไม่มีข้อมูลจริงให้แสดง — แสดงเฉพาะข้อมูลตัวอย่าง",
    "ยังไม่ได้เข้าสู่ระบบ — หน้านี้แสดงเฉพาะค่าจริงจากเสาอากาศ ต้องเข้าสู่ระบบก่อนจึงจะเห็น",
    "สำเนานี้ไม่ได้ต่อกับระบบกลาง จึงอ่านค่าจากเสาอากาศไม่ได้",
  ];
  const ขาด = พูดใหม่.filter((k) => EN[k] === undefined);
  assert.deepEqual(ขาด, [], `ขาดคำแปล: ${ขาด.join(" · ")}`);
});
