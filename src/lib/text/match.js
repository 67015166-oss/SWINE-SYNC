/**
 * จับคำแบบ "ยืดหยุ่น" สำหรับผู้ช่วย AI — พิมพ์ผิด สะกดต่าง หรือพิมพ์อังกฤษก็ต้องเข้าใจ
 *
 * **ปัญหาที่แก้** (ผู้ใช้แจ้ง 2 ก.ย. 2569): เดิมทุกที่ใช้ `text.includes(คำ)` ตรง ๆ
 * ถาม "ค่า sensor ตอนนี้" แล้วไม่รู้เรื่อง ต้องพิมพ์ "เซนเซอร์" เป๊ะ ๆ เท่านั้น
 * แถม "เซ็นเซอร์" (มีไม้ไต่คู้ ซึ่งคนไทยพิมพ์กันแบบนี้มากกว่า) ก็ไม่ติดเหมือนกัน
 *
 * แก้สามชั้น เรียงจากถูกที่สุดไปแพงที่สุด:
 *   1. `normalize()` ตัดรูปที่ไม่เปลี่ยนความหมายทิ้ง — วรรณยุกต์ ไม้ไต่คู้ การันต์
 *      ช่องว่าง เครื่องหมายวรรคตอน ➜ "เซ็นเซอร์" กับ "เซนเซอร์" กลายเป็นคำเดียวกัน
 *   2. คำพ้อง/คำทับศัพท์ประกาศไว้ที่ `SYNONYMS` ➜ "sensor" นับเป็น "เซนเซอร์"
 *   3. ระยะแก้ไข (edit distance) เผื่อพิมพ์ตกหล่นสลับตัว ➜ "อุนหภูมิ" ยังติด "อุณหภูมิ"
 *
 * **ชั้นที่ 3 ใช้เฉพาะกับ "คำที่บอกว่าถามเรื่องอะไร" เท่านั้น**
 * ห้ามใช้กับรายการที่ทำหน้าที่เป็น "ตัวกัน" เช่น WANTS_THINKING หรือ OUTWARD_WORDS
 * เพราะที่นั่นการจับผิดพลาดแบบ false positive แพงกว่าการพลาดคำ — ตัวกันติดเกินไป
 * แปลว่าคำถามที่ตอบได้อยู่แล้วจะถูกโยนทิ้งไปหา AI หรือไปค้นเว็บโดยไม่จำเป็น
 */

/* วรรณยุกต์ · ไม้ไต่คู้ · การันต์ · นิคหิต · ยามักการ · พินทุ · ไม้ยมก
   ตัดทิ้งทั้งหมดเพราะคนพิมพ์ใส่บ้างไม่ใส่บ้าง และแทบไม่มีคู่คำที่ต่างกันแค่รูปพวกนี้
   ในบริบทฟาร์มสุกร (ถ้ามีวันนั้นค่อยกลับมาลดรายการนี้) */
const THAI_MARKS = /[็-๎ฺๆ]/g;

/** ตัดเครื่องหมายวรรคตอนที่ไม่ได้ให้ความหมายกับการจับคำ */
const PUNCT = /[.,!?;:"'`~^*_(){}[\]<>|\\/‘’“”๏๚๛-]/g;

/**
 * ทำข้อความให้เป็นรูปมาตรฐานก่อนเทียบ
 * @param {string} text
 * @returns {string} ตัวพิมพ์เล็ก ไม่มีรูปวรรณยุกต์ ไม่มีวรรคตอน ช่องว่างเดียว
 */
export function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    /* แยกสระ/วรรณยุกต์ที่รวมร่างกับตัวอักษรละตินออกก่อน แล้วค่อยตัด (é → e) */
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(THAI_MARKS, "")
    .replace(PUNCT, " ")
    /* พิมพ์ย้ำตัวเดียวกันสามตัวขึ้นไป = ลากเสียง ไม่ใช่คำใหม่ ("ร้อนนนน") */
    .replace(/(.)\1{2,}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** รูปที่ตัดช่องว่างออกหมด — ภาษาไทยไม่เว้นวรรคระหว่างคำ การเทียบจึงต้องไม่ติดช่องว่าง */
const squash = (text) => normalize(text).replace(/\s+/g, "");

/**
 * คำพ้องและคำทับศัพท์ — `คำมาตรฐาน: [คำที่คนพิมพ์จริง]`
 *
 * ประกาศไว้ที่เดียวเพื่อให้ทุกที่ที่จับคำได้ประโยชน์พร้อมกัน
 * (เดิมถ้าจะให้ "sensor" ใช้ได้ ต้องไปเติมในทุกรายการที่มีคำว่าเซนเซอร์)
 */
export const SYNONYMS = {
  เซนเซอร์: ["sensor", "sensors", "เซ็นเซอร์", "ตัววัด", "หัววัด"],
  อุณหภูมิ: ["temp", "temperature", "องศา", "celsius", "เซลเซียส", "กี่องศา"],
  ความชื้น: ["humidity", "rh", "ความชื่น"],
  แจ้งเตือน: ["alert", "alerts", "notification", "warning", "อลาม", "อะลาม"],
  โรงเรือน: ["barn", "barns", "house", "เล้า", "คอก"],
  ฟาร์ม: ["farm", "farms"],
  สุกร: ["pig", "pigs", "swine", "หมู"],
  อาหาร: ["feed", "food", "หัวอาหาร"],
  น้ำ: ["water"],
  การเงิน: ["finance", "money", "revenue", "งบ", "เงิน"],
  ต้นทุน: ["cost", "costs", "expense", "รายจ่าย"],
  กำไร: ["profit", "margin"],
  พัดลม: ["fan", "fans"],
  ปั๊ม: ["pump", "pumps", "ปั้ม"],
  ไฟฟ้า: ["electric", "electrical", "power", "kwh"],
  กล้อง: ["camera", "cameras", "cctv"],
  ออฟไลน์: ["offline", "disconnect", "ไม่ออนไลน์", "หลุด"],
  แอมโมเนีย: ["ammonia", "nh3"],
  ความเร็วลม: ["wind", "airflow", "ระบายอากาศ"],
  น้ำหนัก: ["weight", "adg"],
  ตาย: ["mortality", "death", "สูญเสีย"],
};

/** ค้นย้อน: คำที่ผู้ใช้พิมพ์ → คำมาตรฐาน (สร้างครั้งเดียวตอนโหลดโมดูล) */
const SYNONYM_OF = new Map();
for (const [standard, variants] of Object.entries(SYNONYMS)) {
  for (const v of variants) SYNONYM_OF.set(squash(v), squash(standard));
}

/**
 * ระยะแก้ไขที่น้อยที่สุดระหว่าง `word` กับ "ท่อนใดท่อนหนึ่ง" ของ `text`
 * (อัลกอริทึม Sellers — แถวแรกเป็นศูนย์ทั้งแถว แปลว่าเริ่มนับที่ตำแหน่งไหนก็ได้)
 *
 * ใช้แบบนี้แทนการไล่ตัดหน้าต่างทีละช่วง เพราะคิดครั้งเดียวจบ O(|text| × |word|)
 * ไล่หน้าต่างจะกลายเป็นหลักสิบล้านครั้งเมื่อคำค้นมีสองร้อยคำ
 */
function nearestDistance(text, word) {
  const m = word.length;
  const n = text.length;
  if (m === 0) return 0;
  let prev2 = new Array(n + 1).fill(0);
  let prev = new Array(n + 1).fill(0);
  let cur = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = word[i - 1] === text[j - 1] ? 0 : 1;
      let best = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      /* สลับตัวติดกันนับเป็นความผิดครั้งเดียว ("sesnor" ↔ "sensor")
         ถ้าไม่นับแบบนี้จะกลายเป็นสองครั้ง แล้วคำหกตัวอักษรจะหลุดเกณฑ์ทันที
         — การพิมพ์สลับนิ้วเป็นความผิดที่เจอบ่อยที่สุดแบบหนึ่ง */
      if (i > 1 && j > 1 && word[i - 1] === text[j - 2] && word[i - 2] === text[j - 1]) {
        best = Math.min(best, prev2[j - 2] + 1);
      }
      cur[j] = best;
    }
    const spare = prev2;
    prev2 = prev;
    prev = cur;
    cur = spare;
  }
  let best = Infinity;
  for (let j = 0; j <= n; j += 1) if (prev[j] < best) best = prev[j];
  return best;
}

/**
 * ยอมให้พิมพ์ผิดได้กี่ตัวสำหรับคำยาวเท่านี้
 * คำสั้นต้องเป๊ะ — "ลม" ยอมผิดหนึ่งตัวจะไปตรงกับ "ลง" "คม" "ล่ม" ได้หมด
 */
function slack(length) {
  if (length <= 4) return 0;
  if (length <= 8) return 1;
  return 2;
}

/**
 * กันการจับผิดชนิด "ตัดหัวตัดท้ายทิ้งแล้วบอกว่าเหมือน"
 *
 * ระยะแก้ไขอย่างเดียวหลวมเกินไป เจอของจริงตอนเขียนเทสต์สองเคส:
 *   · คำว่า "เตือน" ไปตรงกับ "โรงเรือน" (ต↔ร ผิดตัวเดียว) แล้วคำถามเรื่องอุณหภูมิ
 *     ถูกตีความเป็นคำถามเรื่องการแจ้งเตือน
 *   · คำว่า "กี่โรงเรือน" ไปตรงกับ "โรงเรือน" เพราะยอมให้ลบ "กี่" ทิ้งได้สองตัว
 *
 * ➜ บังคับว่าสองตัวแรกและสองตัวท้ายของคำต้องโผล่ในข้อความจริง ๆ
 *   พิมพ์ผิดกลางคำยังผ่าน (ซึ่งเป็นที่ที่คนพิมพ์ผิดบ่อยที่สุด) แต่หัวหรือท้ายหายไปทั้งท่อนไม่ผ่าน
 */
function edgesPresent(text, word) {
  return text.includes(word.slice(0, 2)) && text.includes(word.slice(-2));
}

/**
 * ต้องเช็กขอบคำไหม
 *
 * คำยาวตั้งแต่ 7 ตัวที่ผิดแค่ตัวเดียว บังเอิญตรงกันโดยไม่ได้ตั้งใจแทบเป็นไปไม่ได้
 * จึงยกเว้นให้ ไม่งั้น "แอมโมเนย" (พิมพ์ตกสระอีตัวท้าย) จะไม่ติด "แอมโมเนีย"
 * เพราะสองตัวท้ายเพี้ยนไปพอดี — ซึ่งเป็นตำแหน่งที่คนพิมพ์ตกบ่อย
 *
 * ส่วนคำสั้น (5–6 ตัว) ยังต้องเช็ก เพราะผิดตัวเดียวก็ชนคำอื่นได้ง่าย
 * เช่น "เตือน" กับ "เรือน" ต่างกันตัวเดียว แต่คนละเรื่องกันคนละโลก
 */
const needsEdgeCheck = (word, distance) => !(word.length >= 7 && distance <= 1);

/**
 * ข้อความนี้มีคำนี้อยู่ไหม — เทียบแบบตัดรูปวรรณยุกต์และช่องว่างแล้ว (ยังไม่เผื่อพิมพ์ผิด)
 * @param {string} text ข้อความที่ผู้ใช้พิมพ์
 * @param {string} word คำที่ตามหา
 */
export function includesLoose(text, word) {
  const t = squash(text);
  const w = squash(word);
  if (!t || !w) return false;
  if (t.includes(w)) return true;
  /* คำพ้อง: ผู้ใช้พิมพ์ "sensor" แต่รายการเก็บคำว่า "เซนเซอร์" ไว้ */
  for (const [variant, standard] of SYNONYM_OF) {
    if (standard === w && t.includes(variant)) return true;
  }
  return false;
}

/**
 * เหมือน `includesLoose` แต่เผื่อพิมพ์ผิดด้วย
 * **ใช้กับคำที่บอก "ถามเรื่องอะไร" เท่านั้น อย่าใช้กับรายการที่เป็นตัวกัน**
 */
export function includesFuzzy(text, word) {
  if (includesLoose(text, word)) return true;
  const t = squash(text);
  const w = squash(word);
  const allowed = slack(w.length);
  if (allowed === 0 || !t) return false;
  const d = nearestDistance(t, w);
  if (d <= allowed && (!needsEdgeCheck(w, d) || edgesPresent(t, w))) return true;
  /* เผื่อพิมพ์คำพ้องผิดด้วย เช่น "sesnor" */
  for (const [variant, standard] of SYNONYM_OF) {
    if (standard !== w) continue;
    const allowedVariant = slack(variant.length);
    if (allowedVariant === 0) continue;
    const dv = nearestDistance(t, variant);
    if (dv <= allowedVariant && (!needsEdgeCheck(variant, dv) || edgesPresent(t, variant))) {
      return true;
    }
  }
  return false;
}

/** มีคำไหนสักคำในรายการไหม (เผื่อพิมพ์ผิด) */
export const matchesAny = (text, words) => words.some((w) => includesFuzzy(text, w));

/** มีคำไหนสักคำในรายการไหม (ไม่เผื่อพิมพ์ผิด) — สำหรับรายการที่เป็นตัวกัน */
export const matchesAnyExact = (text, words) => words.some((w) => includesLoose(text, w));

/**
 * ให้คะแนนว่าข้อความเข้าเรื่องนี้แค่ไหน
 *
 * **ทำไมต้องให้คะแนน ไม่ใช่เจอคำแรกแล้วจบ** ของเดิมใช้ `TOPICS.find(...)` ซึ่งแปลว่า
 * เรื่องที่อยู่บนสุดของรายการชนะเสมอ ต่อให้คำถามพูดถึงอีกเรื่องชัดเจนกว่า
 * ตอนนี้คำที่ยาวกว่ามีน้ำหนักมากกว่า (คำยาวเจาะจงกว่า) และคำที่ตรงเป๊ะชนะคำที่เดาว่าพิมพ์ผิด
 *
 * @returns {number} 0 = ไม่เข้าเรื่องนี้เลย
 */
export function scoreWords(text, words) {
  let score = 0;
  for (const word of words) {
    const w = squash(word);
    if (!w) continue;
    if (includesLoose(text, word)) score += w.length;
    else if (includesFuzzy(text, word)) score += w.length * 0.6;
  }
  return score;
}

/**
 * เลือกตัวที่เข้าเรื่องที่สุดจากหลายตัวเลือก
 * คะแนนเท่ากัน = ตัวที่มาก่อนในรายการชนะ (คงลำดับความสำคัญเดิมของรายการไว้)
 *
 * @param {string} text
 * @param {Array} items
 * @param {(item: any) => string[]} wordsOf
 * @returns {any|null}
 */
export function bestMatch(text, items, wordsOf) {
  let best = null;
  let bestScore = 0;
  for (const item of items) {
    const score = scoreWords(text, wordsOf(item));
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}
