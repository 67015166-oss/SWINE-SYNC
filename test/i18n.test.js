/**
 * เทสต์ความครบถ้วนของพจนานุกรมสามภาษา
 *
 * เขียนตอนไล่แปลหน้าที่ยังเป็นภาษาไทยล้วน (10 ก.ย. 2569) เพราะพลาดจริงสองแบบ
 * ระหว่างทาง และทั้งสองแบบไม่ทำให้แอปพัง — มันแค่ทำให้หน้าจอกลับไปเป็นภาษาไทย
 * เงียบ ๆ ตรงจุดที่ลืม ซึ่งเป็นอาการเดียวกับ "ยังไม่ได้แปล" จึงหาไม่เจอด้วยตา
 */
import test from "node:test";
import assert from "node:assert/strict";

import { EN } from "../src/lib/i18n/en.js";
import { ZH } from "../src/lib/i18n/zh.js";

test("อังกฤษกับจีนต้องมีคีย์ชุดเดียวกันเป๊ะ", () => {
  /* เติมคำแปลอังกฤษแล้วลืมเติมจีน = หน้าจีนกลับไปเป็นไทยเฉพาะคำนั้น */
  const missingZh = Object.keys(EN).filter((k) => ZH[k] === undefined);
  const missingEn = Object.keys(ZH).filter((k) => EN[k] === undefined);
  assert.deepEqual(missingZh, [], `ขาดคำแปลจีน: ${missingZh.join(" · ")}`);
  assert.deepEqual(missingEn, [], `ขาดคำแปลอังกฤษ: ${missingEn.join(" · ")}`);
});

test("ตัวแปรในคำแปลต้องตรงกับต้นฉบับไทยทุกตัว", () => {
  /* พิมพ์ {n} เป็น {N} หรือลืมใส่ = ผู้ใช้เห็นปีกกาดิบ ๆ กลางประโยค
     (ตัวแปลไม่ได้เช็กให้ มันแทนเฉพาะชื่อที่ตรงกันเท่านั้น) */
  const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  const bad = [];
  for (const [thai, en] of Object.entries(EN)) {
    /* ตัดบริบทหลัง "|" ออกก่อน — ฝั่งไทยไม่เคยมีตัวแปรอยู่ในนั้น */
    const want = vars(thai.includes("|") ? thai.slice(0, thai.indexOf("|")) : thai);
    for (const [lang, text] of [["en", en], ["zh", ZH[thai]]]) {
      /* คำแปลอังกฤษเขียนรูปพหูพจน์เป็น "เอกพจน์||พหูพจน์" — เช็กทีละฝั่ง */
      for (const part of String(text).split("||")) {
        if (vars(part).join() !== want.join()) bad.push(`${lang}: ${thai} → ${part}`);
      }
    }
  }
  assert.deepEqual(bad, [], `ตัวแปรไม่ตรง:\n${bad.join("\n")}`);
});
