/**
 * ตอนที่ AI ย้อนถามว่า "เอาจุดไหน" — ทำให้ตอบง่ายและตอบสั้นได้
 *
 * **ปัญหาที่แก้** AI ย้อนถามมาแบบนี้
 *
 *   ต้องการดูอุณหภูมิอากาศที่จุดใดครับ
 *   1. กำแพงเพชร สำนักงาน (เสาพยากรณ์อากาศ)
 *   2. กำแพงเพชร เล้า R 5/2
 *   กดเลือกได้เลย หรือพิมพ์หมายเลข หรือพิมพ์ ‘ดูทั้งสองจุด’ ก็ได้ครับ
 *
 * แล้วมันรับแค่คำที่ตรงเป๊ะ — ทดสอบแล้ว **พิมพ์ "ทั้งสอง" มันไม่เข้าใจ**
 * ย้อนถามคำถามเดิมซ้ำอีกรอบ ต้องพิมพ์ "ทั้งสองจุด" เต็ม ๆ ถึงจะผ่าน
 * คนใช้งานจริงไม่มีทางรู้ว่าต้องพิมพ์ให้ตรงแค่ไหน แล้วจะติดวนอยู่ตรงนี้
 *
 * **สองชั้นที่ทำไว้**
 *   1. แปลงตัวเลือกเป็นปุ่มให้กด — ไม่ต้องพิมพ์เลย เป็นทางที่เร็วและไม่มีทางพิมพ์ผิด
 *      (คำว่า "กดเลือกได้เลย" ในข้อความบอกอยู่แล้วว่าฝั่งเขาตั้งใจให้มีปุ่ม เราแค่ยังไม่ได้ทำ)
 *   2. ถ้ายังพิมพ์เอา ก็แปลงคำที่ใกล้เคียงให้เป็นคำที่มันรับ ก่อนส่งออกไป
 *
 * **ไม่ฝังคำว่า "ดูทั้งสองจุด" ไว้ในโค้ด** — อ่านจากเครื่องหมายคำพูดในข้อความที่มันส่งมาเอง
 * วันหลังเขาเปลี่ยนคำ เราก็ยังตามถูกโดยไม่ต้องแก้อะไร
 */

/**
 * แยกตัวเลือกออกจากข้อความที่ AI ย้อนถาม
 * @returns {{options: Array<{n: string, label: string}>, allPhrase: string|null}|null}
 *          ไม่ใช่ข้อความย้อนถาม (หรือมีตัวเลือกเดียว) → null
 */
export function parseChoices(text) {
  const options = [];
  for (const line of String(text ?? "").split("\n")) {
    const m = /^\s*(\d{1,2})[.)]\s*(\S.*?)\s*$/.exec(line);
    if (m) options.push({ n: m[1], label: m[2] });
  }
  if (options.length < 2) return null;

  /* คำที่มันบอกให้พิมพ์ อยู่ในเครื่องหมายคำพูด — รับทั้งอัญประกาศโค้งและตรง */
  const quoted = /[‘'"“]\s*([^’'"”\n]{2,40}?)\s*[’'"”]/.exec(text);
  return { options, allPhrase: quoted?.[1] ?? null };
}

/** คำที่คนพิมพ์จริงเวลาหมายถึง "เอาหมดทุกจุด" */
const MEANS_ALL = [
  "ทั้งสอง", "ทั้ง 2", "ทั้ง2", "ทั้งหมด", "ทุกจุด", "ทุกที่", "สองจุด", "2 จุด",
  "หมดเลย", "both", "all",
];

/** คำที่แปลว่า "อันแรก/อันที่สอง" แทนการพิมพ์ตัวเลข */
const ORDINALS = [
  [1, ["แรก", "first", "๑"]],
  [2, ["ที่สอง", "อันสอง", "second", "๒"]],
];

/**
 * แปลงสิ่งที่ผู้ใช้พิมพ์ ให้เป็นคำที่ AI รับ
 *
 * @param {string} input   สิ่งที่ผู้ใช้พิมพ์
 * @param {object} choices ผลจาก `parseChoices`
 * @returns {string} คำที่ควรส่งออกไป (แปลงไม่ได้ = คืนของเดิม ไม่ดัดแปลงมั่ว)
 */
export function normalizeChoice(input, choices) {
  const raw = String(input ?? "").trim();
  if (!choices || !raw) return raw;

  const low = raw.toLowerCase();
  const numbers = choices.options.map((o) => o.n);

  /* พิมพ์เลขมาตรง ๆ อยู่แล้ว — ส่งต่อไม่ต้องยุ่ง */
  if (numbers.includes(raw)) return raw;

  /* "เอาหมด" — ใช้คำที่มันบอกไว้เอง ถ้าไม่มีก็ปล่อยผ่าน */
  if (MEANS_ALL.some((w) => low.includes(w.toLowerCase()))) {
    return choices.allPhrase ?? raw;
  }

  /* พิมพ์ชื่อจุดมา (หรือส่วนหนึ่งของชื่อ) → แปลงเป็นหมายเลขของจุดนั้น
     เทียบทั้งสองทาง เพราะคนพิมพ์ย่อ ("เล้า R") ก็ได้ พิมพ์เกิน ("ที่เล้า R 5/2 ครับ") ก็ได้ */
  const byLabel = choices.options.find((o) => {
    const label = o.label.toLowerCase();
    return label.includes(low) || low.includes(label);
  });
  if (byLabel) return byLabel.n;

  /* "อันแรก" / "อันที่สอง" */
  for (const [n, words] of ORDINALS) {
    if (words.some((w) => low.includes(w)) && numbers.includes(String(n))) return String(n);
  }

  return raw;
}

/**
 * แยกปุ่มแนะนำที่ AI แปะมาท้ายคำตอบ
 *
 * บางคำตอบมันต่อท้ายมาแบบนี้
 *
 *   …สถานะ normal
 *   [[ตัวเลือก]] ดูย้อนหลังแอมโมเนีย 24 ชม. | ตรวจสุขภาพเซนเซอร์ | ดูค่าปัจจุบันทั้งหมด
 *
 * เป็นรูปแบบปุ่มของหน้าจอฝั่งเขา — ถ้าเราไม่รู้จัก มันจะโผล่เป็นข้อความดิบ `[[ตัวเลือก]]`
 * กลางฟองคำตอบ ซึ่งทั้งอ่านไม่รู้เรื่องและกดไม่ได้
 * (มาไม่ทุกครั้ง — ไม่มีก็คืนข้อความเดิมเฉย ๆ)
 *
 * @returns {{text: string, suggestions: string[]}}
 */
export function splitSuggestions(answer) {
  const raw = String(answer ?? "");
  const m = /\[\[\s*ตัวเลือก\s*\]\]([\s\S]*)$/.exec(raw);
  if (!m) return { text: raw, suggestions: [] };

  const suggestions = m[1]
    .split(/[|\n]/)
    .map((x) => x.trim())
    .filter((x) => x.length > 1 && x.length <= 60);

  return { text: raw.slice(0, m.index).trim(), suggestions };
}
