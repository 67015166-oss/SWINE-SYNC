/**
 * เทสต์การจับคำแบบยืดหยุ่นของผู้ช่วย AI
 *
 * เคสในนี้มาจากที่ผู้ใช้แจ้งเองเป็นหลัก (2 ก.ย. 2569):
 * *"ฉันถามค่า sensor แต่แชทกลับตอบไม่ได้ ต้องพิมพ์เซ็นเซอร์ถึงจะรู้เรื่อง"*
 * ที่เหลือคือคำที่คนพิมพ์พลาดกันบ่อยในแป้นภาษาไทย
 */
import test from "node:test";
import assert from "node:assert/strict";

import { normalize, includesLoose, includesFuzzy, scoreWords, bestMatch } from "../src/lib/text/match.js";
import { topicIdFor, answerFor, TOPICS } from "../src/components/assistant/answers.js";
import { currentReadingAsk } from "../src/lib/api/sensorQuestion.js";

/* ---------- normalize ---------- */

test("normalize: ไม้ไต่คู้กับวรรณยุกต์ไม่ทำให้เป็นคนละคำ", () => {
  assert.equal(normalize("เซ็นเซอร์"), normalize("เซนเซอร"));
  assert.equal(normalize("ปั๊ม"), normalize("ปั้ม"));
  assert.equal(normalize("ร้อนนนนน"), "รอน");
});

test("normalize: ตัดวรรคตอนและช่องว่างเกิน", () => {
  /* ไม้โทหายไปด้วย เพราะ normalize ตัดรูปวรรณยุกต์ทิ้งทั้งหมด */
  assert.equal(normalize("  อุณหภูมิ ,  ตอนนี้?? "), "อุณหภูมิ ตอนนี");
});

/* ---------- คำทับศัพท์ ---------- */

test("คำอังกฤษต้องนับเป็นคำไทยคำเดียวกัน", () => {
  assert.ok(includesLoose("ค่า sensor ตอนนี้", "เซนเซอร์"));
  assert.ok(includesLoose("temp ตอนนี้เท่าไร", "อุณหภูมิ"));
  assert.ok(includesLoose("humidity in barn A1", "ความชื้น"));
  assert.ok(includesLoose("มี alert อะไรบ้าง", "แจ้งเตือน"));
});

/* ---------- พิมพ์ผิด ---------- */

test("พิมพ์ผิดหนึ่งถึงสองตัวยังต้องจับได้", () => {
  assert.ok(includesFuzzy("อุนหภูมิตอนนี้", "อุณหภูมิ"));
  assert.ok(includesFuzzy("ความชื่นเท่าไร", "ความชื้น"));
  assert.ok(includesFuzzy("มีแจ้งเตือนอะไรมั้ย", "แจ้งเตือน"));
  assert.ok(includesFuzzy("sesnor ตัวไหนเสีย", "เซนเซอร์"));
});

test("คำสั้นต้องเป๊ะ — ไม่งั้นจับมั่วไปหมด", () => {
  /* "ลม" ยาวสองตัว ถ้ายอมให้ผิดหนึ่งตัวจะไปตรงกับ "ลง" "คม" "ล่ม" ได้หมด */
  assert.equal(includesFuzzy("ลงทะเบียนยังไง", "ลม"), false);
  assert.equal(includesFuzzy("ค่าไฟเดือนนี้", "น้ำ"), false);
});

test("คำที่ไม่เกี่ยวกันต้องไม่ติด", () => {
  assert.equal(includesFuzzy("ราคาหมูวันนี้", "แจ้งเตือน"), false);
  assert.equal(includesFuzzy("เปิดหน้าการเงิน", "เซนเซอร์"), false);
});

/* ---------- การให้คะแนน ---------- */

test("คำที่ยาวกว่าและตรงเป๊ะต้องได้คะแนนมากกว่า", () => {
  const exact = scoreWords("ดูแอมโมเนียหน่อย", ["แอมโมเนีย"]);
  const fuzzy = scoreWords("ดูแอมโมเนยหน่อย", ["แอมโมเนีย"]);
  assert.ok(exact > fuzzy, `เป๊ะ ${exact} ต้องมากกว่าเดา ${fuzzy}`);
  assert.ok(scoreWords("ดูแอมโมเนียหน่อย", ["แอมโมเนีย"]) > scoreWords("ดูก๊าซหน่อย", ["ก๊าซ"]));
});

test("bestMatch: เลือกเรื่องที่ตรงที่สุด ไม่ใช่เรื่องที่อยู่บนสุด", () => {
  const items = [
    { id: "กว้าง", words: ["หมู"] },
    { id: "เจาะจง", words: ["แอมโมเนีย"] },
  ];
  const hit = bestMatch("แอมโมเนียในเล้าหมูเกินไหม", items, (i) => i.words);
  assert.equal(hit.id, "เจาะจง");
});

/* ---------- ต่อเข้ากับผู้ช่วยจริง ---------- */

test("ผู้ช่วย: ถามด้วยคำอังกฤษและคำที่พิมพ์ผิด ต้องเข้าเรื่องเดียวกับคำไทยเป๊ะ ๆ", () => {
  const cases = [
    ["มีเซนเซอร์ตัวไหนไม่ส่งค่า", "ค่า sensor ตัวไหนไม่ส่ง"],
    ["อุณหภูมิโรงเรือนไหนร้อนสุด", "อุนหภูมิโรงเรือนไหนร้อนสุด"],
    ["มีแจ้งเตือนอะไรค้างอยู่", "มี alert อะไรค้างอยู่"],
  ];
  for (const [เป๊ะ, ยืดหยุ่น] of cases) {
    assert.equal(topicIdFor(ยืดหยุ่น), topicIdFor(เป๊ะ), `"${ยืดหยุ่น}" ควรเข้าเรื่องเดียวกับ "${เป๊ะ}"`);
    assert.ok(topicIdFor(ยืดหยุ่น), `"${ยืดหยุ่น}" ต้องเข้าสักเรื่อง`);
  }
});

test("ผู้ช่วย: ถามเรื่องที่ไม่มีในระบบ ยังต้องบอกว่าไม่รู้ ไม่ใช่เดาตอบ", () => {
  const out = answerFor("วันนี้ฝนจะตกไหม", { comfort: {}, limits: {} });
  assert.match(out.text, /ยังไม่มีข้อมูล|ตอบได้เฉพาะ/);
});

test("ทุกเรื่องต้องมีคำอย่างน้อยหนึ่งคำ และ chip ต้องเข้าเรื่องของตัวเอง", () => {
  for (const topic of TOPICS) {
    assert.ok(topic.words.length > 0, `${topic.id} ไม่มีคำ`);
    assert.equal(
      topicIdFor(topic.chip),
      topic.id,
      `ปุ่มคำถามด่วน "${topic.chip}" กดแล้วไปเข้าเรื่องอื่น`,
    );
  }
});

/* ---------- คำถามขอค่าเซนเซอร์ ---------- */

test("ขอค่าเซนเซอร์: พิมพ์อังกฤษหรือพิมพ์ผิดก็ต้องรู้ว่าขอค่า", () => {
  assert.notEqual(currentReadingAsk("ค่า sensor ตอนนี้"), null);
  assert.notEqual(currentReadingAsk("temp ตอนนี้เท่าไร"), null);
  assert.notEqual(currentReadingAsk("อุนหภูมิตอนนี้"), null);
  assert.deepEqual(currentReadingAsk("humidity ตอนนี้"), ["humidity"]);
});

test("ขอค่าเซนเซอร์: คำถามที่ขอความเห็นต้องไม่ถูกฉกไปตอบด้วยตัวเลข", () => {
  assert.equal(currentReadingAsk("อุณหภูมิเท่าไรถึงจะอันตรายกับหมู"), null);
  assert.equal(currentReadingAsk("ควรตั้งอุณหภูมิเท่าไรดี"), null);
});

/* ---------- ตารางคำถามจริง ----------
   ชุดนี้คือ "คำถามแบบที่คนพิมพ์จริง" ไม่ใช่คำถามที่เขียนให้ตรงกับคำในรายการ
   เพิ่มคำใหม่ในรายการเมื่อไร ให้เพิ่มแถวที่นี่ด้วย จะได้รู้ทันทีถ้าไปแย่งเรื่องกันเอง */

const คำถามจริง = [
  ["ค่า sensor ตอนนี้", "offline"],
  ["เซ็นเซอร์ตัวไหนเสีย", "offline"],
  ["อุนหภูมิเท่าไหร่", "climate"],
  ["temp ตอนนี้", "climate"],
  ["humidity เท่าไร", "climate"],
  ["โรงเรือนไหนร้อนที่สุด", "climate"],
  ["มี alert ไหม", "alerts"],
  ["แจ้งเตีอนค้างกี่อัน", "alerts"],
  ["แอมโมเนยเกินไหม", "gas"],
  ["nh3 เกินมั้ย", "gas"],
  ["cost เท่าไร", "finance"],
  ["profit เป็นไง", "finance"],
  ["อาหารเหลือเท่าไหร่", "feed"],
  ["feed stock", "feed"],
  ["หมูตายกี่ตัว", "herd"],
  ["mortality เท่าไร", "herd"],
  ["กี่โรงเรือน", "farms"],
  ["มีหมูกี่ตัว", "farms"],
];

for (const [คำถาม, เรื่อง] of คำถามจริง) {
  test(`คำถาม "${คำถาม}" ต้องเข้าเรื่อง ${เรื่อง}`, () => {
    assert.equal(topicIdFor(คำถาม), เรื่อง);
  });
}
