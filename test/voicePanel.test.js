/**
 * เทสต์ของแผงวอยซ์ (components/voice/VoicePanel.jsx) และตัวเรียบเรียงค่าเซนเซอร์
 * ที่ถูกแยกออกมาให้ห้องแชทกับแผงวอยซ์ใช้ร่วมกัน (lib/api/nowReply.js · T1.263)
 *
 * กันสิ่งที่พังเงียบ ๆ: สองที่ตอบคำถามเดียวกันคนละแบบ เพราะแอบแยกกันเรียบเรียง
 * หรือเพราะลำดับการตัดสินใจไม่ตรงกัน
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { nowReply, describeAge, STALE_MS } from "../src/lib/api/nowReply.js";
import { answerFor, wantsAdvice } from "../src/components/assistant/answers.js";
import { currentReadingAsk } from "../src/lib/api/sensorQuestion.js";
import { DEFAULT_SETTINGS, comfortOf } from "../src/lib/settings/defaults.js";
import { splitForSpeech } from "../src/lib/voice/useSpeak.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
/* "แผงวอยซ์" ในเทสต์ชุดนี้หมายถึง **สมอง + หน้าตา** รวมกัน
   29 ก.ย. 2569 สมองถูกแยกไปอยู่ `useVoiceConversation.js` เพื่อให้หน้าเต็มจอใช้ตัวเดียวกัน
   (T1.286) เทสต์จึงอ่านทั้งสองไฟล์ต่อกัน — ข้อที่คุมอยู่ยังเป็นข้อเดิมทุกข้อ
   และย้ายโค้ดไปมาระหว่างสองไฟล์นี้จะไม่ทำให้เทสต์ผ่านโดยที่ของหาย */
const panel =
  read("../src/components/voice/useVoiceConversation.js") +
  "\n" +
  read("../src/components/voice/VoicePanel.jsx");
const assistant = read("../src/components/assistant/Assistant.jsx");
const speak = read("../src/lib/voice/useSpeak.js");
const defaults = read("../src/lib/settings/defaults.js");
const provider = read("../src/lib/settings/SettingsProvider.jsx");

const barnAt = (at) => [
  { farm: "ฟาร์มกำแพงเพชร", barn: "โรงเรือน A1", at, indoor: { temp_c: 29.4, humidity: 71 }, outdoor: {} },
];

/* ---------- ค่าเซนเซอร์ตอนนี้ ---------- */

test("ค่าสด — บอกชื่อฟาร์ม เวลา และค่าที่วัดได้ครบ", () => {
  const r = nowReply(barnAt(new Date().toISOString()), []);
  assert.ok(r.text.includes("ฟาร์มกำแพงเพชร"));
  assert.equal(r.stale, undefined);
  assert.ok(r.bullets.some((b) => b.includes("อุณหภูมิ") && b.includes("29.4")));
  assert.ok(r.bullets.some((b) => b.includes("ความชื้น")));
});

test("ค่าที่เงียบไปนานแล้ว ต้องบอกว่าไม่ใช่ค่าปัจจุบัน", () => {
  /* ของจริงที่อันตราย: สะพานข้อมูลหยุด ตัวเลขยังขึ้นเหมือนเดิมแต่เวลาค้าง
     ถ้าตอบว่าเป็นค่า "ตอนนี้" ผู้ช่วยจะพูดสวนกับหน้าจอที่ขึ้น "ไม่มีสัญญาณ" */
  const old = new Date(Date.now() - STALE_MS - 60_000).toISOString();
  const r = nowReply(barnAt(old), []);
  assert.equal(r.stale, true);
  assert.ok(r.text.includes("ไม่ใช่ค่าปัจจุบัน"));
  assert.ok(r.bullets.at(-1).includes("เงียบมาแล้ว"));
});

test("ถามค่าที่โรงเรือนนั้นไม่มีเซนเซอร์วัด ต้องคืน null ไม่ใช่หัวข้อเปล่า", () => {
  /* null = ให้ผู้เรียกส่งต่อไปถาม AI ซึ่งตอบได้ว่า "จุดนี้ไม่มีเซนเซอร์วัดค่านั้น"
     ซึ่งเป็นคำตอบที่ถูกต้องกว่าความเงียบ */
  assert.equal(nowReply(barnAt(new Date().toISOString()), ["nh3"]), null);
});

test("อายุของค่าอ่านเป็นภาษาคน ไม่ใช่มิลลิวินาที", () => {
  assert.equal(describeAge(90 * 60_000), "2 ชั่วโมง");
  assert.equal(describeAge(20 * 60_000), "20 นาที");
});

/* ---------- ห้องแชทกับแผงวอยซ์ต้องใช้เครื่องเดียวกัน ---------- */

test("ทั้งสองที่เรียบเรียงค่าเซนเซอร์ด้วยตัวเดียวกัน", () => {
  for (const [name, src] of [["แผงวอยซ์", panel], ["ห้องแชท", assistant]]) {
    assert.ok(src.includes('from "../../lib/api/nowReply.js"'), `${name} ไม่ได้ใช้ตัวกลาง`);
    assert.ok(!/const nowReply = /.test(src), `${name} เขียนตัวเรียบเรียงของตัวเองขึ้นมาใหม่`);
  }
});

test("แผงวอยซ์ตัดสินใจตามลำดับเดียวกับห้องแชท", () => {
  /* คำสั่งเปิดหน้า → ค่าตอนนี้ → AI จริง → ข้อมูลตัวอย่าง
     สลับลำดับเมื่อไหร่ "เปิดหน้าโรงเรือน" จะกลายเป็นคำถามแล้วได้ตัวเลขแทนที่จะพาไปหน้านั้น
     และคำถามค่าตอนนี้จะไปรอ AI คิด 28–150 วินาที ทั้งที่อ่านจากฐานข้อมูลได้ใน 0.1 วินาที */
  const order = ["navFor(", "currentReadingAsk(", "askAi(", "answerFor("];
  let at = 0;
  for (const step of order) {
    const found = panel.indexOf(step, at);
    assert.ok(found > 0, `แผงวอยซ์ไม่มีขั้นตอน ${step}`);
    at = found;
  }
});

test("ปิดแผง/ออกจากหน้าต้องหยุดไมค์ เสียง และคำถามที่ค้างอยู่", () => {
  /* เสียงที่ยังพูดต่อหลังผู้ใช้ปิดแผง น่ากลัวกว่าไมค์ค้างเสียอีก
     สมองรับเป็น `active` เพราะหน้าเต็มจอไม่มีสถานะ "พับ" แต่มีสถานะ "ออกจากหน้า" (T1.286) */
  const block = panel.slice(panel.indexOf("if (active) return;"), panel.indexOf("}, [active]);"));
  for (const call of ["dictation.stop()", "speech.stop()", "abortRef.current?.abort()"]) {
    assert.ok(block.includes(call), `ปิดแผงแล้วไม่ได้เรียก ${call}`);
  }
});

/* ---------- อ่านคำตอบออกเสียง ---------- */

test("คำตอบไทยยาว ๆ ที่ไม่มีจุดจบประโยค ต้องถูกหั่นเป็นก้อนสั้น", () => {
  /* Chrome เงียบกลางคันถ้าส่งก้อนยาวก้อนเดียว และภาษาไทยไม่ใส่จุดจบประโยค
     ตัวหั่นสำรอง (ตัดตามช่องว่าง) จึงเป็นตัวที่ทำงานจริงเกือบทุกครั้ง */
  const long = Array.from({ length: 60 }, (_, i) => `โรงเรือนที่${i}อุณหภูมิปกติ`).join(" ");
  const parts = splitForSpeech(long);
  assert.ok(parts.length > 1, "ยังเป็นก้อนเดียวที่ยาวเกินไป");
  for (const part of parts) assert.ok(part.length <= 180, `ก้อนยาว ${part.length}`);
  /* ห้ามทำตัวอักษรหายระหว่างหั่น — ต่อกลับแล้วต้องได้ของเดิมครบ */
  assert.equal(parts.join(" ").replace(/\s+/g, ""), long.replace(/\s+/g, ""));
});

test("ประโยคสั้นไม่ต้องหั่น", () => {
  assert.deepEqual(splitForSpeech("เปิดการแจ้งเตือนให้แล้วครับ"), ["เปิดการแจ้งเตือนให้แล้วครับ"]);
});

test("สั่งพูดแล้วไม่เริ่มสักที ต้องมีตัวปลดล็อก ไม่ใช่ค้างเป็น “หยุดอ่าน” ตลอดกาล", () => {
  /* เจอจริงตอนทดสอบในแท็บที่ถูกซ่อน: speaking เป็นจริงแต่เสียงไม่เริ่ม และไม่มี error ให้จับ */
  assert.ok(speak.includes("watchdog"), "ไม่มีตัวจับเวลากันค้าง");
  assert.ok(speak.includes("synth.resume?.()"), "ไม่ได้ปลุกตัวสังเคราะห์เสียงก่อนยอมแพ้");
  assert.ok(
    speak.includes("if (synth.speaking || synth.pending)"),
    "ยกเลิกคิวเก่าแบบไม่ดูว่ามีอะไรค้างจริงไหม — Chrome จะกลืนก้อนใหม่ทิ้ง",
  );
});

test("ปิดเสียงแล้วต้องไม่พูด และค่านั้นต้องถูกจำไว้", () => {
  assert.ok(panel.includes("if (speakOn) speech.speak("), "ปิดเสียงแล้วยังพูดอยู่");
  assert.ok(defaults.includes("speakAnswers:"), "defaults.js ไม่มีค่าตั้งต้นของ speakAnswers");
  assert.ok(provider.includes("saved.speakAnswers"), "SettingsProvider ไม่ได้กู้คืน speakAnswers");
});

/* ---------- กดครั้งเดียวแล้วพูด (ผู้ใช้สั่งเปลี่ยน 17 ก.ย. 2569) ---------- */

test("ปุ่มไมค์เป็นกดครั้งเดียว ไม่ใช่กดค้าง", () => {
  assert.ok(panel.includes("onClick={toggleListening}"), "ปุ่มไม่ได้สลับเปิด-ปิดด้วยการกด");
  for (const held of ["onPointerDown", "onPointerUp", "onPointerLeave"]) {
    assert.ok(!panel.includes(held), `ยังมี ${held} ของท่ากดค้างค้างอยู่`);
  }
});

test("ส่งคำถามตอน 'เลิกฟัง' ไม่ใช่ตอนกดปุ่ม", () => {
  /* บางเบราว์เซอร์เลิกฟังเองเมื่อเงียบนานพอ ถ้าดักที่ปุ่มอย่างเดียว
     ข้อความที่ถอดได้จะค้างอยู่บนจอโดยไม่มีใครส่ง แล้วผู้ใช้จะนึกว่าระบบไม่ตอบ */
  const effect = panel.slice(panel.indexOf("const wasListening"), panel.indexOf("}, [dictation.listening]);"));
  assert.ok(effect.includes("if (text.trim()) ask(text);"), "เลิกฟังแล้วไม่ได้ส่งคำถาม");
  assert.ok(effect.includes("cancelRef.current"), "ไม่มีทางยกเลิกตอนปิดแผง");
  assert.ok(effect.includes("dictation.error"), "ถอดเสียงพังแล้วยังส่งข้อความที่ได้ไม่ครบ");
});

test("ปิดแผงระหว่างฟังอยู่ = ทิ้งคำถามนั้น ไม่ส่งตามหลัง", () => {
  const close = panel.slice(panel.indexOf("if (active) return;"), panel.indexOf("}, [active]);"));
  assert.ok(close.includes("cancelRef.current = true"), "ปิดแผงแล้วไม่ได้ทำเครื่องหมายยกเลิก");
});

/* ---------- ปุ่มไมค์ในห้องแชท (T1.269 · T1.270) ---------- */

test("ห้องแชทก็เป็นกดครั้งเดียว และไม่เหลือโค้ดของท่ากดค้าง", () => {
  assert.ok(assistant.includes("onClick={toggleVoice}"), "ปุ่มไมค์ในห้องแชทยังไม่ใช่กดครั้งเดียว");
  for (const gone of ["HOLD_MS", "openVoiceSite", "onPointerDown"]) {
    assert.ok(!assistant.includes(gone), `ยังเหลือ ${gone} ของท่าเดิมอยู่`);
  }
});

test("พับห้องแชทแล้วไมค์ต้องหยุดฟัง", () => {
  /* ท่ากดครั้งเดียวไม่มีจังหวะ "ปล่อยนิ้ว" มาปิดให้ ถ้าไม่ปิดตรงนี้ไมค์ค้างเปิดโดยไม่มีใครรู้ */
  assert.ok(assistant.includes("if (!open) dictation.stop();"), "พับห้องแชทแล้วไมค์ยังฟังต่อ");
});

test("พูดจบแล้วเคอร์เซอร์ไปรอท้ายข้อความ ไม่ใช่เลือกทั้งก้อน", () => {
  /* เลือกทั้งก้อน = พิมพ์ต่อแล้วของเดิมหายหมด · ไม่โฟกัสเลย = ต้องไปหาที่คลิกเอง */
  const effect = assistant.slice(
    assistant.indexOf("const wasListening"),
    assistant.indexOf("}, [dictation.listening]);"),
  );
  assert.ok(effect.includes("box.focus()"), "ไม่ได้โฟกัสช่องพิมพ์ให้");
  assert.ok(effect.includes("box.setSelectionRange(end, end)"), "ไม่ได้วางเคอร์เซอร์ท้ายข้อความ");
  /* ห้องแชทต้องไม่ส่งเอง — ต่างจากแผงวอยซ์โดยตั้งใจ */
  assert.ok(!effect.includes("ask("), "ห้องแชทไม่ควรส่งคำถามให้เอง");
});

/* ---------- ตอบให้ตรงคำถาม (ผู้ใช้แจ้ง 17 ก.ย. 2569) ---------- */

test("เรื่องที่มีแต่แดชบอร์ดนี้รู้ ต้องมาก่อนการอ่านค่าเซนเซอร์สด", () => {
  /* ของจริงที่เจอ: "มีเซนเซอร์ตัวไหนไม่ส่งค่า" ถูกจับเป็น "ขอค่าล่าสุด"
     แล้วตอบค่าของตัวที่ยัง **ส่งอยู่** กลับไป ซึ่งตรงข้ามกับที่ถาม */
  for (const [name, src] of [["แผงวอยซ์", panel], ["ห้องแชท", assistant]]) {
    /* T1.282 รวมเงื่อนไขไว้ที่ `localOnlyTopicFor` ที่เดียว — เดิมสองที่เขียนเอง
       แล้วทางลัดนี้ลืมเช็กคำถามขอความเห็น "ทำไมหมูถึงไอ" จึงถูกตอบด้วยจำนวนฟาร์ม */
    const localOnly = src.indexOf("localOnlyTopicFor(text)");
    const reading = src.indexOf("currentReadingAsk(text)");
    assert.ok(localOnly > 0, `${name} ไม่ได้กันเรื่องที่มีแต่แดชบอร์ดรู้ไว้ก่อน`);
    assert.ok(localOnly < reading, `${name} ตรวจค่าเซนเซอร์ก่อนเรื่องของแดชบอร์ด`);
    /* ห้ามกลับไปเขียนเงื่อนไขเองอีก — สองที่จะเพี้ยนจากกันแล้วผู้ใช้เจอคำตอบไม่เหมือนกัน */
    assert.ok(
      !src.includes("LOCAL_ONLY_TOPICS.includes(topic)"),
      `${name} ยังเขียนเงื่อนไขเอง แทนที่จะใช้ localOnlyTopicFor`,
    );
  }
});

test("คำถามที่เข้าเรื่องของแดชบอร์ด ต้องตอบเองก่อนส่งให้ AI", () => {
  /* AI ข้างนอกไม่มีทางรู้ว่าไซโลของเราเหลือเท่าไร ถามแล้วได้ "คำถามของคุณไม่ชัดเจน" กลับมา
     ส่วนของในเครื่องตอบได้ใน 0.1 วินาทีและตรงกับตัวเลขบนหน้าจอ */
  const askAiAt = panel.indexOf("farmyAsk(");
  const localAt = panel.indexOf("const localTopic");
  assert.ok(localAt > 0 && localAt < askAiAt, "แผงวอยซ์ยังส่งคำถามของแดชบอร์ดไปหา AI ก่อน");
});

test("คำถามนอกฟาร์มต้องไม่ถูกตอบด้วยข้อมูลในเครื่อง", () => {
  /* "ราคาหมูวันนี้" เข้าเรื่อง finance เพราะคำจับกว้าง — ถ้าไม่กันไว้จะได้งบกำไรขาดทุนกลับไป
     และ "อากาศกรุงเทพ" ต้องไม่ถูกตอบด้วยค่าในเล้าเรา */
  assert.ok(panel.includes("isOutwardQuestion(text)"), "แผงวอยซ์ไม่มีตัวกันคำถามนอกฟาร์ม");
  assert.ok(panel.includes("weatherPlaceOutside(text"), "แผงวอยซ์ไม่มีตัวกันคำถามอากาศที่อื่น");
  assert.ok(assistant.includes("isOutwardQuestion(text)"), "ห้องแชทไม่มีตัวกันคำถามนอกฟาร์ม");
});

/* ---------- ตอบให้ตรงคำถาม รอบสอง (ผู้ใช้แจ้ง 17 ก.ย. 2569) ----------
   "ฉันถามอุณหภูมิ แต่วอยซ์มันตอบร้อนที่สุด…องศา ทั้ง ๆ ที่ฉันไม่ได้ถามร้อนที่สุด"
   คำตอบไม่ผิดข้อเท็จจริง แต่ไม่ใช่คำตอบของคำถามนั้น ซึ่งแย่กว่าตอบว่าไม่รู้ */

const ctx = {
  comfort: comfortOf(DEFAULT_SETTINGS),
  limits: { nh3Limit: DEFAULT_SETTINGS.comfort.nh3Limit },
};

test("ถามอุณหภูมิเฉย ๆ ต้องได้ค่าอุณหภูมิ ไม่ใช่หลังที่ร้อนที่สุด", () => {
  for (const q of ["อุณหภูมิเท่าไหร่", "ช่วยบอกอุณหภูมิหน่อย", "อุณหภูมิของโรงเรือน A1"]) {
    const { text } = answerFor(q, ctx);
    assert.ok(!text.startsWith("ร้อนที่สุด"), `"${q}" ยังถูกตอบด้วยหลังที่ร้อนที่สุด`);
    assert.ok(text.includes("เฉลี่ย"), `"${q}" ไม่ได้ตอบค่าอุณหภูมิกลับไป`);
  }
});

test("ถามหาหลังที่ร้อนที่สุด ยังต้องได้หลังนั้นเหมือนเดิม", () => {
  /* ตัวปุ่มลัดเองใช้ประโยคนี้ — แก้เรื่องข้างบนแล้วต้องไม่ทำของเดิมพัง */
  assert.ok(answerFor("โรงเรือนไหนร้อนที่สุด", ctx).text.startsWith("ร้อนที่สุด"));
  assert.ok(answerFor("หลังไหนเย็นที่สุด", ctx).text.startsWith("เย็นที่สุด"));
});

test("ถามความชื้นอย่างเดียว ต้องขึ้นต้นด้วยความชื้น", () => {
  assert.ok(answerFor("ความชื้นเท่าไหร่", ctx).text.startsWith("ความชื้น"));
});

test("คำถามขอความเห็นต้องไม่ถูกคำตอบสำเร็จรูปฉกไป", () => {
  /* `sensorQuestion.js` ตั้งใจปล่อยคำถามพวกนี้ผ่านไปหา AI อยู่แล้ว
     แต่ตอนเพิ่ม "ตอบเรื่องของแดชบอร์ดก่อน" (T1.271) มันไปโดนฉกที่ทางใหม่แทน */
  for (const q of ["อุณหภูมิเท่าไรถึงจะอันตรายกับหมู", "อุณหภูมิควรอยู่ที่เท่าไหร่", "แนวโน้มอุณหภูมิสัปดาห์นี้"]) {
    assert.ok(wantsAdvice(q), `"${q}" ควรถูกส่งให้ AI ตอบ`);
  }
  /* แต่คำถามที่แดชบอร์ดตอบเองได้ต้องไม่ติดตัวกันนี้ — ไม่งั้นย้อนกลับไปพังแบบรอบก่อน */
  for (const q of ["อาหารเหลือพอกี่วัน", "เดือนนี้กำไรเท่าไหร่", "โรงเรือนไหนร้อนที่สุด", "มีแจ้งเตือนอะไรค้างอยู่"]) {
    assert.ok(!wantsAdvice(q), `"${q}" ไม่ควรถูกโยนไปให้ AI`);
  }
});

test("ทั้งสองที่ต้องมีตัวกันคำถามขอความเห็นเหมือนกัน", () => {
  assert.ok(panel.includes("wantsAdvice(text)"), "แผงวอยซ์ไม่มีตัวกันคำถามขอความเห็น");
  assert.ok(assistant.includes("wantsAdvice(text)"), "ห้องแชทไม่มีตัวกันคำถามขอความเห็น");
});

test("ขอค่าด้วยประโยคพูด ต้องถึงเซนเซอร์", () => {
  /* คนพูดใส่ไมค์ใช้ "ช่วยบอก…หน่อย" บ่อยกว่า "…เท่าไหร่" มาก */
  assert.ok(currentReadingAsk("ช่วยบอกอุณหภูมิหน่อย"), "ประโยคขอค่าแบบพูดไม่ถึงเซนเซอร์");
  assert.equal(currentReadingAsk("อุณหภูมิเท่าไรถึงจะอันตรายกับหมู"), null);
});

/* ---------- อากาศของที่อื่น ต้องไม่ถูกตอบด้วยเซนเซอร์ของเรา (T1.274) ----------
   เจอตอนไล่ทดสอบ: "อากาศกรุงเทพวันนี้เป็นยังไง" มีทั้งคำว่า "อากาศ" และ "เป็นยังไง"
   จึงเข้าเงื่อนไข "ขอค่าล่าสุด" ครบ แล้วได้ค่าในเล้าที่กำแพงเพชรกลับไป
   ส่วนห้องแชทตอบถูกมาตลอดเพราะเช็กที่หัวเลย — สองที่ตอบคนละอย่างจากคำถามเดียวกัน */

test("คำถามอากาศที่อื่นเข้าเงื่อนไขขอค่าเซนเซอร์ — ตัวกันจึงต้องมาก่อน", () => {
  /* ถ้าวันหนึ่งมีคนแก้ให้ currentReadingAsk ไม่ติดคำถามแบบนี้แล้ว เทสต์นี้จะเตือนว่า
     เงื่อนไขเปลี่ยนไปแล้ว ไม่ใช่ปล่อยให้ลำดับที่วางไว้กลายเป็นของไม่จำเป็นเงียบ ๆ */
  assert.ok(currentReadingAsk("อากาศกรุงเทพวันนี้เป็นยังไง"), "คำถามนี้ไม่ติดเงื่อนไขขอค่าแล้ว");

  const placeAt = panel.indexOf("weatherPlaceOutside(text");
  const readingAt = panel.indexOf("currentReadingAsk(text)");
  assert.ok(placeAt > 0 && placeAt < readingAt, "แผงวอยซ์ยังเช็กค่าเซนเซอร์ก่อนถามว่าเป็นอากาศที่อื่น");
  assert.ok(panel.includes("place ? null : currentReadingAsk(text)"), "เจอชื่อที่อื่นแล้วยังตกไปอ่านเซนเซอร์ได้");
});

test("ห้องแชทกับแผงวอยซ์ต้องเรียบเรียงคำตอบเรื่องอากาศด้วยตัวเดียวกัน", () => {
  /* กติกาเดียวกับ nowReply — ต่างคนต่างเขียนเมื่อไหร่ วันหนึ่งสองที่จะตอบไม่เหมือนกัน */
  for (const [name, src] of [["แผงวอยซ์", panel], ["ห้องแชท", assistant]]) {
    assert.ok(
      src.includes('from "../../lib/api/weatherReply.js"'),
      `${name} ไม่ได้ใช้ตัวเรียบเรียงคำตอบเรื่องอากาศร่วมกัน`,
    );
  }
  assert.ok(!assistant.includes("const weatherReply ="), "ห้องแชทยังเขียนตัวเรียบเรียงของตัวเองไว้");
});

/* ---------- หน้าเต็มจอเลิกใช้ iframe แล้ว (T1.286) ---------- */

test("★ หน้า /dashboard/voice ต้องไม่ฝัง iframe ของ Farmy อีก", () => {
  /* iframe เข้าไปเป็น "ผู้เยี่ยมชม" เขาจึงปฏิเสธคำถามเกี่ยวกับฟาร์มทั้งหมด
     ซึ่งคือต้นเหตุของอาการ "วอยซ์ตอบไม่ตรงประเด็น" ที่ผู้ใช้แจ้งสองรอบ
     ถ้าวันหนึ่งมีคนเอา VoiceFrame กลับมาใส่หน้านี้ อาการจะกลับมาเงียบ ๆ */
  const page = read("../src/pages/Voice.jsx");
  assert.doesNotMatch(page, /VoiceFrame/, "หน้าเต็มจอกลับไปใช้กรอบเว็บของเขาแล้ว");
  assert.match(page, /VoiceStage/, "หน้าเต็มจอต้องใช้สกินของเราเอง");
});

test("★ แผงเล็กกับหน้าเต็มจอต้องใช้สมองตัวเดียวกัน", () => {
  /* สองที่ตอบคำถามเดียวกันคนละอย่างเมื่อไร คนใช้จะเลิกเชื่อทั้งคู่ */
  for (const f of ["../src/components/voice/VoicePanel.jsx", "../src/components/voice/VoiceStage.jsx"]) {
    const src = read(f);
    assert.match(src, /useVoiceConversation/, `${f} ไม่ได้ใช้สมองกลาง`);
    assert.doesNotMatch(src, /farmyAsk|askAi\(|currentReadingAsk/, `${f} เขียนลำดับการตัดสินใจขึ้นมาเองซ้ำ`);
  }
});

test("★ หน้าเต็มจอต้องผ่านหลังบ้านของเรา ไม่ยิงตรงไป fern.plotnexuslab.com", () => {
  /* token ของ Farmy เป็นสิทธิ์ผู้ดูแลทั้งระบบ — อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น
     (เหตุผลเต็มอยู่หัวไฟล์ server/src/modules/farmy/route.js) */
  /* ตัดคอมเมนต์ทิ้งก่อน — ที่อยู่ของเขาถูกพูดถึงในคำอธิบายเหตุผล ซึ่งควรอยู่ต่อไป */
  const client = read("../src/lib/api/farmyVoice.js")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/g, "");
  assert.doesNotMatch(client, /fern\.plotnexuslab\.com/, "หน้าเว็บยิงตรงไปเซิร์ฟเวอร์ของเขา");
  assert.match(client, /apiUrl\("\/farmy\//, "ต้องเรียกผ่านเส้นทางของหลังบ้านเรา");
});

/* ---------- ห้องแชทกับวอยซ์ต้องตัดสินใจเหมือนกัน (T1.287) ---------- */

/**
 * ลำดับที่โค้ดเรียกตัวช่วยจัดเส้นทาง
 *
 * ต้องตัดสองอย่างทิ้งก่อนเทียบ ไม่งั้นได้ลำดับปลอม:
 *   · คอมเมนต์ — ไม่งั้นจับชื่อฟังก์ชันที่คอมเมนต์พูดถึงแทนโค้ดจริง
 *   · ทุกอย่างนอกตัว `ask()` — ห้องแชทมีสาขา "ตอบคำถามที่ AI ย้อนถาม" อยู่หัวฟังก์ชัน
 *     ซึ่งเรียก askAiFor ตั้งแต่ต้น แต่นั่นคนละเรื่องกับลำดับจัดเส้นทาง
 */
function routeOrder(src, marker, endMarker) {
  const from = src.indexOf(marker);
  const to = src.indexOf(endMarker, from);
  const body = src
    .slice(from, to > -1 ? to : undefined)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/g, "");
  /* ชื่อที่ใช้เรียก AI ต่างกันสองที่ (`askAi({…})` กับ `askAiFor(…)`) จึงต้องจับทั้งคู่
     และต้องจับ **การเรียกฟังก์ชัน** เท่านั้น — `askAi: text` เป็นชื่อฟิลด์ในข้อความ
     ไม่ใช่การส่งคำถามไปหา AI (พลาดตรงนี้แล้วได้ลำดับปลอมที่ดูเหมือนต่างกัน) */
  const steps = [
    ["nav", ["navFor("]],
    ["local", ["localOnlyTopicFor("]],
    ["weather", ["weatherPlaceOutside("]],
    ["sensor", ["currentReadingAsk("]],
    ["advice", ["wantsAdvice("]],
    ["farmy", ["farmyAsk("]],
    /* ไม่นับ "ส่งให้ AI" ในลำดับนี้ เพราะแต่ละด่านมีทางถอยไปหา AI ของตัวเองซ้อนอยู่ข้างใน
       (เช่นหาที่ที่ถามอากาศไม่เจอ → ส่งต่อ AI) ซึ่งเป็นคนละเรื่องกับลำดับคัดกรอง
       ข้อที่ว่า AI เป็นด่านสุดท้ายเสมอ คุมด้วยเทสต์ถัดไปแทน */
  ];
  return steps
    .map(([label, needles]) => {
      const hits = needles.map((n) => body.indexOf(n)).filter((i) => i > -1);
      return [hits.length > 0 ? Math.min(...hits) : -1, label];
    })
    .filter(([i]) => i > -1)
    .sort((a, b) => a[0] - b[0])
    .map(([, label]) => label);
}

test("★ ห้องแชทกับวอยซ์ต้องเรียงลำดับการตัดสินใจเหมือนกันเป๊ะ", () => {
  /* **ผู้ใช้เจอเอง 29 ก.ย. 2569**: "วอยซ์แดชบอร์ดตอบตรง วอยซ์ในช่องแชทตอบไม่ตรง"
     ต้นเหตุคือห้องแชทไม่เคยเรียก Farmy เลย (คำว่า farmy ปรากฏ 0 ครั้งทั้งไฟล์)
     และสลับลำดับเรื่องอากาศกับเรื่องที่แดชบอร์ดรู้ไว้คนละแบบ

     สองที่นี้เป็นโค้ดคนละชุดที่ "ตั้งใจให้เหมือนกัน" ซึ่งแปลว่ามันเลื่อนออกจากกันได้เงียบ ๆ
     เทสต์ข้อนี้คือสิ่งเดียวที่กันไม่ให้เกิดอีก */
  const voice = routeOrder(
    read("../src/components/voice/useVoiceConversation.js"),
    "const ask = async",
    "const cancelRef",
  );
  const chat = routeOrder(
    read("../src/components/assistant/Assistant.jsx"),
    /* ข้ามสาขา "ตอบคำถามที่ AI ย้อนถาม" ที่หัวฟังก์ชันไป เริ่มนับที่คำถามใหม่จริง ๆ */
    "const nav = navFor(",
    "const askAiFor = async",
  );
  assert.deepEqual(chat, voice, `ห้องแชท: ${chat.join(" → ")}\n  วอยซ์  : ${voice.join(" → ")}`);
  /* และต้องมีครบทุกด่าน ไม่ใช่ว่างทั้งคู่แล้วผ่านเพราะเท่ากัน */
  assert.deepEqual(voice, ["nav", "local", "weather", "sensor", "advice", "farmy"]);
});

test("★ ห้องแชทต้องถาม Farmy จริง ไม่ใช่แค่ import ไว้เฉย ๆ", () => {
  const chat = read("../src/components/assistant/Assistant.jsx");
  assert.match(chat, /await farmyAsk\(/, "ห้องแชทไม่ได้เรียก farmyAsk");
  assert.match(chat, /origin: "farmy"/, "คำตอบจาก Farmy ไม่ได้ติดป้ายที่มา");
  /* ป้ายต้องมีข้อความของตัวเอง ไม่ตกไปเป็น "จากข้อมูลตัวอย่างในระบบ"
     คำตอบจากระบบของอีกทีมกับตัวเลขสมมติในเครื่อง เชื่อถือได้คนละระดับกัน */
  assert.match(chat, /msg\.origin === "farmy"/, "ป้ายที่มาไม่รู้จัก farmy");
});
