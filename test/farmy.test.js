/**
 * เทสต์ของสะพานต่อ "ระบบวอยซ์ Farmy" ของทีมอื่น (T1.267)
 *
 * เจ้าของระบบส่งโมดูลมาให้ฝัง โดยเขียนไว้ให้ยิงตรงจากเบราว์เซอร์และเก็บ token
 * ไว้ใน localStorage — **เราทำแบบนั้นไม่ได้** เทสต์ชุดนี้กันไม่ให้ใครเผลอทำตามต้นฉบับ
 * เพราะทั้งสองข้อพังแบบเงียบ ๆ: CORS พังเฉพาะบนเบราว์เซอร์จริง (curl ไม่เจอ)
 * ส่วน token หลุดไม่มีอาการอะไรให้เห็นเลยจนกว่าจะมีคนเอาไปใช้
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const route = read("../server/src/modules/farmy/route.js");
const client = read("../src/lib/api/farmyVoice.js");
/* สมองของแผงย้ายไป useVoiceConversation.js แล้ว (T1.286) — อ่านทั้งสองไฟล์ต่อกัน */
const panel =
  read("../src/components/voice/useVoiceConversation.js") +
  "\n" +
  read("../src/components/voice/VoicePanel.jsx");
const app = read("../server/src/app.js");

const srcFiles = (() => {
  const dir = new URL("../src/", import.meta.url).pathname;
  const walk = (d) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
    );
  return walk(dir).filter((f) => f.endsWith(".js") || f.endsWith(".jsx"));
})();

/** ตัดคอมเมนต์ออกก่อนตรวจ — ที่อยู่เซิร์ฟเวอร์ของเขาถูกพูดถึงในคำอธิบายได้ ห้ามแค่ในโค้ดจริง */
const codeOnly = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

test("หน้าเว็บต้องไม่คุยกับเซิร์ฟเวอร์ Farmy ตรง ๆ", () => {
  /* ด่านหน้าของเขาไม่ยอมให้หัวข้อ X-Admin-Token ผ่าน preflight — ยิงตรงเมื่อไหร่
     เบราว์เซอร์บล็อกทิ้งก่อนส่งด้วยซ้ำ และ curl จะไม่มีวันเจอปัญหานี้ */
  for (const file of srcFiles) {
    const text = codeOnly(readFileSync(file, "utf8"));
    assert.ok(
      !text.includes("fern.plotnexuslab.com"),
      `${file} ยิงตรงไปเซิร์ฟเวอร์ Farmy — ต้องผ่าน /api/farmy ของเราเท่านั้น`,
    );
    assert.ok(
      !text.includes("X-Admin-Token"),
      `${file} มี token ของ Farmy อยู่ฝั่งหน้าเว็บ — ของแบบนี้อยู่ที่เซิร์ฟเวอร์เท่านั้น`,
    );
  }
});

test("ทั้งสองเส้นทางของ /api/farmy ต้องผ่านด่านล็อกอินของเราก่อน", () => {
  /* ไม่มีด่าน = ใครก็ตามที่ยิงถึงพอร์ตนี้ได้ ใช้บัญชี Farmy ของเราถามฟรีไม่จำกัด */
  assert.ok(route.includes('farmyRouter.get("/status", requireAuth'), "status ไม่มีด่าน");
  assert.ok(route.includes('farmyRouter.post("/ask", requireAuth'), "ask ไม่มีด่าน");
  assert.ok(app.includes('app.use("/api/farmy", farmyRouter)'), "ยังไม่ได้ต่อเส้นทางเข้ากับ app");
});

test("บัญชี Farmy อ่านจาก .env เท่านั้น ห้ามมีค่าจริงอยู่ในโค้ด", () => {
  assert.ok(route.includes("process.env.FARMY_USERNAME"), "ไม่ได้อ่านชื่อผู้ใช้จาก .env");
  assert.ok(route.includes("process.env.FARMY_PASSWORD"), "ไม่ได้อ่านรหัสผ่านจาก .env");
  /* ตัวแปรที่ตั้งค่าไว้ต้องเป็นค่าว่างเสมอในโค้ด (ค่าจริงมาจาก .env ตอนรัน) */
  assert.match(route, /const USERNAME = process\.env\.FARMY_USERNAME \|\| "";/);
  assert.match(route, /const PASSWORD = process\.env\.FARMY_PASSWORD \|\| "";/);
});

test("เซิร์ฟเวอร์เขาล่ม = บอกว่ายังไม่พร้อม ไม่ใช่พัง", () => {
  /* เครื่องที่ต่อไม่ได้ต้องใช้แดชบอร์ดได้ตามปกติ แค่ไม่มีสมองของ Farmy */
  assert.ok(route.includes("ready: false"), "status ไม่ได้ตอบว่ายังไม่พร้อม");
  assert.ok(panel.includes("farmyInfo?.ready"), "แผงวอยซ์ไม่ได้ดูก่อนว่าพร้อมไหม");
});

test("★ ถามได้โดยไม่ต้องมีบัญชี — `/ask` เป็นเส้นทางเปิด (T1.288)", () => {
  /* เอกสารชุด 29 ก.ย. 2569 ระบุว่า `/ask` สิทธิ์ "เปิด" — ของเดิมบังคับล็อกอินก่อนถาม
     ทำให้เครื่องที่ไม่มีบัญชีใน .env ใช้ไม่ได้เลยทั้งที่ถามได้ และยิง /admin/login
     บ่อยกว่าที่จำเป็นจนเสี่ยงโดนล็อกบัญชี */
  const ask = route.slice(route.indexOf("async function askOnce"), route.indexOf("farmyRouter.get"));
  assert.doesNotMatch(ask, /await ensureToken\(\)/, "askOnce ยังบังคับล็อกอินก่อนถาม");
  assert.match(ask, /token \? \{ "X-Admin-Token": token \}/, "ควรแนบ token เฉพาะเมื่อมีอยู่แล้ว");
  /* และต้องไม่กันคำถามทิ้งเพราะไม่มีบัญชี */
  const askRoute = route.slice(route.indexOf('farmyRouter.post("/ask"'));
  assert.doesNotMatch(askRoute, /if \(!farmyConfigured\)/, "ยังกันคำถามทิ้งเมื่อไม่มีบัญชี");
});

test("★ สถานะดูจาก /health ซึ่งเป็นเส้นทางเปิด ไม่ใช่ลองล็อกอิน (T1.288)", () => {
  /* สิ่งที่หน้าจอต้องรู้คือ "ถามได้ไหม" ไม่ใช่ "บัญชีเราใช้ได้ไหม" — ผูกกันแล้วจะบอกว่า
     ไม่พร้อมทั้งที่ใช้ได้ และเส้นทางที่ต้องเขียนข้อมูลค่อยดูที่ canWrite แยกต่างหาก */
  /* ตัดเฉพาะตัว handler ของ /status เท่านั้น — จบก่อน /data/:key (เส้นอ่านข้อมูล
     ที่ล็อกอินจริง) ไม่งั้น ensureToken ของ /data จะหลุดเข้ามาในสไลซ์แล้วเข้าใจผิด */
  const status = route.slice(route.indexOf('farmyRouter.get("/status"'), route.indexOf('farmyRouter.get("/data'));
  assert.match(status, /\/health/, "status ไม่ได้ถาม /health");
  assert.doesNotMatch(status, /await ensureToken\(\)/, "status ยังลองล็อกอินอยู่");
  assert.match(status, /canWrite/, "ไม่ได้แยกบอกว่าเขียนข้อมูลได้ไหม");
});

test("★ หมดเวลา ≠ ต่อไม่ได้ — เซิร์ฟเวอร์ของเขาหลับ ไม่ใช่ดับ", () => {
  /* โฮสต์ฟรีของ Farmy หลับเมื่อไม่มีคนใช้ แล้วตื่นช้ากว่าเวลาที่เรารอ
     วัดเมื่อ 12 ต.ค. 2569: /health ครั้งแรกหมดเวลาที่ 25 วิ ครั้งถัดไปตอบใน 0.28 วิ
     ข้อความ `reason` ขึ้นบนหน้าจอตรง ๆ (VoicePanel) — ถ้าบอกว่า "ต่อไม่ได้"
     ตอนที่เขาแค่หลับ ผู้ใช้จะเลิกใช้ทั้งที่กดซ้ำอีกครั้งก็ได้แล้ว
     กติกาเดียวกับ "ไม่ตอบ ≠ ดับ" ของกล่อง: เขียนตามอาการ ห้ามเดาสาเหตุ */
  const status = route.slice(route.indexOf('farmyRouter.get("/status"'), route.indexOf('farmyRouter.get("/data'));
  assert.match(status, /TimeoutError/, "ไม่ได้แยกกรณีหมดเวลาออกจากกรณีต่อไม่ได้");
  assert.match(status, /ตื่นจากหลับ/, "ไม่มีข้อความบอกว่าเขากำลังตื่น");
  assert.match(status, /ต่อเซิร์ฟเวอร์ Farmy ไม่ได้/, "ข้อความกรณีต่อไม่ได้จริงหายไป");
});

test("ประวัติที่ส่งให้ Farmy ต้องใช้คำว่า model ไม่ใช่ assistant", () => {
  /* ฝั่งเขารับ role เป็น user/model (คนละแบบกับ AI ตัวอื่นที่ใช้ user/assistant)
     ส่งผิดคำแล้วเขาไม่ได้ error — แค่มองไม่เห็นประวัติ แล้วตอบเหมือนเพิ่งเริ่มคุยทุกครั้ง */
  assert.match(panel, /role: m\.from === "user" \? "user" : "model"/);
  assert.match(route, /role: m\.role === "model" \? "model" : "user"/);
});

test("ส่งประวัติแค่ไม่กี่เทิร์นล่าสุด และตัดซ้ำที่เซิร์ฟเวอร์ด้วย", () => {
  /* README ของเขาบอกให้ส่งไม่กี่เทิร์น (ประหยัดโควตา) · หน้าเว็บส่งอะไรมาก็ได้
     เซิร์ฟเวอร์จึงต้องตัดเองอีกชั้น ไม่ใช่เชื่อหน้าเว็บ */
  assert.ok(client.includes("history"), "ตัวเรียกไม่ได้ส่งประวัติเลย");
  assert.match(panel, /\.slice\(-6\)/);
  assert.match(route, /\.slice\(-6\)/);
});

/* ---------- ตามสเปกของโมดูลเขา: เซิร์ฟเวอร์ที่เพิ่งตื่น (T1.273) ---------- */

test("เขาตอบ 5xx ครั้งแรกเพราะเพิ่งตื่น ต้องลองซ้ำให้ครั้งเดียว", () => {
  /* README ของโมดูลบอกไว้ตรง ๆ ว่า "5xx/ต่อไม่ได้ = ลองซ้ำ 1 ครั้งหลัง 3 วิ"
     ของเขาอยู่บน Render ซึ่งหลับเมื่อไม่มีคนใช้ ถ้าไม่ลองซ้ำ คำถามแรกของวันจะตกทุกครั้ง */
  const code = codeOnly(route);
  assert.ok(/WAKE_MS\s*=\s*3_000/.test(code), "ไม่ได้ตั้งเวลารอก่อนลองซ้ำเป็น 3 วินาทีตามสเปกเขา");
  /* ลองซ้ำ 5xx อยู่ 3 ที่: ตอนล็อกอิน · ตอนถาม (/ask) · ตอนอ่านข้อมูล (/data/:key)
     เส้นอ่านข้อมูลก็ยิงไปโฮสต์ฟรีตัวเดียวกันที่หลับได้ จึงต้องลองซ้ำเหมือนกัน */
  assert.equal(
    (code.match(/status\s*>=\s*500/g) ?? []).length,
    3,
    "ต้องลองซ้ำ 5xx ทั้งตอนล็อกอิน ตอนถาม และตอนอ่านข้อมูล",
  );
});

test("บัญชีผิดต้องไม่ถูกลองซ้ำ และต้องรอนานกว่าเดิม", () => {
  /* เขามีระบบล็อกบัญชี เตือนตั้งแต่ล็อกอินผิดครั้งที่สอง — ยิงซ้ำคือพาไปโดนล็อก
     ส่วน "เขาหลับอยู่" ไม่ใช่เรื่องบัญชี ไม่ต้องให้ผู้ใช้รอเป็นนาที */
  const code = codeOnly(route);
  assert.ok(/RETRY_MS\s*=\s*60_000/.test(code), "บัญชีผิดต้องรอ 1 นาที");
  assert.ok(/SOFT_RETRY_MS\s*=\s*5_000/.test(code), "ต่อไม่ได้ควรรอสั้น ๆ พอกันยิงรัว");
  assert.ok(
    code.includes("lastFail.bad ? RETRY_MS : SOFT_RETRY_MS"),
    "ยังใช้เวลารอชุดเดียวกับทั้งสองสาเหตุ",
  );
});
