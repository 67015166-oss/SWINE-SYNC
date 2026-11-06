/**
 * ตู้กลางรับข้อมูลจากกล่องของทีมอื่น (T1.347)
 *
 * box-mew ถูกกำหนดให้เป็นที่รวมข้อมูลของทั้ง 5 ทีม — PLC · กล้อง AI · Easy Pairing · Voice AI
 * ทุกกล่องส่งเข้ามาได้ และเจ้าของตู้เป็นคนกำหนดว่าใครดึงอะไรไปใช้ได้
 *
 * ของที่พังเงียบ ๆ ในงานแบบนี้
 *   - รับของเสียเข้าฐานแล้วไม่มีใครรู้ว่ามาจากตรงไหน · ตามแก้ย้อนหลังไม่ได้
 *   - เวลาที่ผู้ส่งบอกมาเพี้ยน (นาฬิกาไม่ตรง) แล้วกราฟมีจุดลอยไปอนาคต
 *   - ชื่อชุดเดิมแต่ส่งคนละชนิด ทำให้กราฟมีทั้งตัวเลขและข้อความปนกัน
 *   - กุญแจรั่วแล้วเพิกถอนไม่ได้ เพราะทุกกล่องใช้ใบเดียวกัน
 */
import test from "node:test";
import assert from "node:assert/strict";

import { checkItem, checkBatch, MAX_BATCH } from "../server/src/modules/ingest/validate.js";
import { mintBoxKey, hashBoxKey, boxKeyMatches, boxKeyFrom, codeFromKey } from "../server/src/lib/boxKey.js";

const NOW = new Date("2026-10-26T10:00:00Z");
const at = (iso) => iso;

/* ---------- กุญแจประจำกล่อง ---------- */

test("กุญแจแต่ละใบต้องไม่ซ้ำกัน และบอกได้ว่าของกล่องไหน", () => {
  const a = mintBoxKey("jew");
  const b = mintBoxKey("jew");
  assert.notEqual(a, b, "สุ่มได้ค่าเดิมสองครั้ง = เดาได้");
  assert.ok(a.startsWith("box_jew_"), "ต้องดูด้วยตาแล้วรู้ว่าใบไหนของใคร");
  assert.equal(codeFromKey(a), "jew");
});

test("กุญแจที่ถูกต้องผ่าน กุญแจอื่นไม่ผ่าน", () => {
  const key = mintBoxKey("muey");
  const stored = hashBoxKey(key);
  assert.equal(boxKeyMatches(key, stored), true);
  assert.equal(boxKeyMatches(mintBoxKey("muey"), stored), false, "กุญแจคนละใบต้องไม่ผ่าน");
});

test("แฮชที่เก็บไว้เพี้ยนต้องตอบไม่ผ่าน ไม่ใช่ทำให้พัง", () => {
  assert.equal(boxKeyMatches(mintBoxKey("dy"), "ไม่ใช่แฮช"), false);
  assert.equal(boxKeyMatches(mintBoxKey("dy"), null), false);
});

test("รับหัว Authorization ได้ทั้งแบบมีและไม่มี Bearer", () => {
  /* ทีมอื่นเขียนคนละภาษา บางภาษาใส่ Bearer ให้เอง — ไม่ใช่เรื่องที่ควรทำให้ข้อมูลหาย */
  assert.equal(boxKeyFrom("Bearer box_fern_abc"), "box_fern_abc");
  assert.equal(boxKeyFrom("box_fern_abc"), "box_fern_abc");
  assert.equal(boxKeyFrom("Basic xxxx"), null, "ของที่ไม่ใช่กุญแจกล่องต้องไม่ผ่าน");
  assert.equal(boxKeyFrom(""), null);
});

/* ---------- ตรวจข้อมูลที่ส่งเข้ามา ---------- */

test("ค่าตัวเลขปกติต้องผ่าน", () => {
  const got = checkItem({ stream: "camera.count", kind: "reading", value: 622, at: at("2026-10-26T09:59:00Z") }, NOW);
  assert.equal(got.ok, true);
  assert.equal(got.value.value, 622);
  assert.equal(got.value.name, "camera.count");
});

test("ไม่ส่งเวลามา ถือว่าเป็นตอนนี้", () => {
  const got = checkItem({ stream: "env.temp", value: 27.6 }, NOW);
  assert.equal(got.ok, true);
  assert.equal(got.value.at.getTime(), NOW.getTime());
  assert.equal(got.value.kind, "reading", "ไม่ระบุชนิด = ตัวเลข ซึ่งเป็นกรณีที่พบบ่อยที่สุด");
});

test("reading ที่ไม่มีตัวเลขต้องไม่ผ่าน", () => {
  for (const bad of [{ value: "27.6" }, { value: null }, { value: NaN }, {}]) {
    const got = checkItem({ stream: "env.temp", kind: "reading", ...bad }, NOW);
    assert.equal(got.ok, false, `ควรปฏิเสธ: ${JSON.stringify(bad)}`);
  }
});

test("★ เวลาที่อยู่ในอนาคตไกลต้องไม่ผ่าน", () => {
  /* นาฬิกาของเครื่องที่ส่งเพี้ยน แล้วกราฟจะมีจุดลอยไปข้างหน้าจนแกนเวลาเพี้ยนทั้งใบ */
  const got = checkItem({ stream: "env.temp", value: 1, at: at("2026-10-27T10:00:00Z") }, NOW);
  assert.equal(got.ok, false);
  assert.match(got.error, /อนาคต/);
});

test("เผื่อนาฬิกาคลาดกันเล็กน้อยได้", () => {
  const got = checkItem({ stream: "env.temp", value: 1, at: at("2026-10-26T10:02:00Z") }, NOW);
  assert.equal(got.ok, true, "คลาด 2 นาทีเป็นเรื่องปกติของเครื่องคนละตัว");
});

test("ชื่อชุดที่ใช้ไม่ได้ต้องถูกปฏิเสธพร้อมบอกว่าควรเป็นอะไร", () => {
  for (const name of ["", "ชื่อไทย", "a b", "x".repeat(101)]) {
    const got = checkItem({ stream: name, value: 1 }, NOW);
    assert.equal(got.ok, false, `ควรปฏิเสธชื่อ "${name}"`);
    assert.match(got.error, /stream/);
  }
});

/* ---------- ไฟล์ ---------- */

test("ไฟล์ต้องส่งที่อยู่มา ไม่ใช่ตัวไฟล์", () => {
  const got = checkItem(
    { stream: "camera.clip", kind: "file", url: "https://box-jew.local/clip.mp4", bytes: 2500000, type: "video/mp4" },
    NOW,
  );
  assert.equal(got.ok, true);
  assert.equal(got.value.url, "https://box-jew.local/clip.mp4");
  assert.equal(got.value.bytes, 2500000);
});

test("ไฟล์ที่ไม่มี url ต้องไม่ผ่าน", () => {
  assert.equal(checkItem({ stream: "camera.clip", kind: "file" }, NOW).ok, false);
  assert.equal(checkItem({ stream: "camera.clip", kind: "file", url: "/local/path.mp4" }, NOW).ok, false);
});

/* ---------- เหตุการณ์ ---------- */

test("ข้อความถาม-ตอบของวอยซ์ต้องผ่าน", () => {
  const got = checkItem(
    { stream: "voice.qa", kind: "event", payload: { q: "โรงเรือนไหนร้อนที่สุด", a: "A2 30.4 องศา" } },
    NOW,
  );
  assert.equal(got.ok, true);
  assert.equal(got.value.payload.q, "โรงเรือนไหนร้อนที่สุด");
});

test("payload ที่ใหญ่เกินต้องถูกปฏิเสธพร้อมบอกทางออก", () => {
  const got = checkItem({ stream: "voice.qa", kind: "event", payload: { x: "ก".repeat(30000) } }, NOW);
  assert.equal(got.ok, false);
  assert.match(got.error, /ไฟล์แทน/, "ต้องบอกว่าให้ส่งเป็นไฟล์ ไม่ใช่แค่บอกว่าใหญ่เกิน");
});

/* ---------- ส่งเป็นก้อน ---------- */

test("ส่งรายการเดียวแบบไม่ใส่อาเรย์ก็ได้", () => {
  const got = checkBatch({ stream: "env.temp", value: 27.6 }, NOW);
  assert.equal(got.ok, true);
  assert.equal(got.items.length, 1);
});

test("★ ต้องรายงานทุกรายการที่ผิดพร้อมเลขลำดับ ไม่ใช่หยุดที่ตัวแรก", () => {
  const got = checkBatch(
    [
      { stream: "ok.one", value: 1 },
      { stream: "", value: 2 },
      { stream: "ok.three", kind: "reading", value: "ไม่ใช่เลข" },
    ],
    NOW,
  );
  assert.equal(got.ok, false);
  assert.equal(got.errors.length, 2, "ทีมอื่นจะได้แก้รอบเดียวจบ ไม่ต้องส่งมาลองทีละตัว");
  assert.match(got.errors[0], /รายการที่ 2/);
  assert.match(got.errors[1], /รายการที่ 3/);
});

test("ส่งมาเกินครั้งละ 500 ต้องไม่ผ่าน", () => {
  const many = Array.from({ length: MAX_BATCH + 1 }, () => ({ stream: "x.y", value: 1 }));
  const got = checkBatch(many, NOW);
  assert.equal(got.ok, false);
  assert.match(got.errors[0], /500/);
});

test("ก้อนว่างต้องไม่ผ่าน", () => {
  assert.equal(checkBatch([], NOW).ok, false);
});

/* ---------- หน้าจอจัดการสิทธิ์ ---------- */

import { readFileSync } from "node:fs";
const srcOf = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const page = srcOf("../src/pages/Hub.jsx");
const hubApi = srcOf("../server/src/modules/hub/route.js");

test("หน้าตู้กลางต้องเป็นของผู้ดูแลระบบเท่านั้น ทั้งสองชั้น", () => {
  /* ★ ต้องเช็กด้วยชื่อสิทธิ์ที่มีอยู่จริง — ชื่อที่ไม่มีในตารางคืน false ให้ทุกคนเงียบ ๆ */
  const action = /can\("([a-z.]+)"\)/.exec(page)?.[1];
  assert.ok(action, "หน้าจอต้องเช็กสิทธิ์");
  assert.ok(
    srcOf("../src/lib/auth/roles.js").includes(`"${action}":`),
    `หน้าตู้กลางเช็กสิทธิ์ชื่อ "${action}" ซึ่งไม่มีใน PERMISSIONS — จะล็อกตัวเองทั้งที่ล็อกอินถูก`,
  );
  assert.ok(page.includes("ต้องมีสิทธิ์ผู้ดูแลระบบ"), "สิทธิ์ไม่พอต้องบอกเหตุผล ไม่ใช่หน้าว่าง");
  /* ★ ด่านจริงอยู่ที่หลังบ้าน — ปลดฝั่งหน้าจอได้ก็ยังเรียก API ไม่ผ่าน */
  assert.ok(
    /hubRouter\.use\(requireAuth, requireAdmin\)/.test(hubApi),
    "ไม่มีด่านที่หลังบ้าน — ใครแก้หน้าเว็บก็ตั้งสิทธิ์ของทุกทีมได้",
  );
});

test("★ load ต้องไม่ผูกกับ t — ไม่งั้นหน้าวนเรียกไม่สิ้นสุด", () => {
  /* useT() คืนฟังก์ชันใหม่ทุกครั้งที่เรนเดอร์ ใส่ไว้ใน deps เมื่อไร useEffect จะวนไม่จบ
     เจอจริงตอนเปิดหน้าดู — 249 error ใน 5 วินาที */
  assert.ok(/\}, \[\]\);/.test(page), "useCallback ของ load ต้องมี deps ว่าง");
  assert.ok(!/setError\(err\.message \|\| t\(/.test(page), "ห้ามเรียก t() ข้างใน load");
});

test("★ เขียนไม่สำเร็จต้องมีข้อความบอก ไม่ใช่ติ๊กเด้งกลับเฉย ๆ", () => {
  /* เดิม catch เรียก load() ทั้งหน้า ซึ่งเคลียร์ error ทิ้งก่อนคนเห็น จึงต้องบังคับลำดับ
     ตั้งแต่กดบันทึกทีเดียว (T1.353) ช่องที่ไม่ผ่านค้างอยู่ในร่างให้กดซ้ำได้ แล้วตั้งข้อความ
     สิ่งที่ยังต้องกันเหมือนเดิมคือ **ต้องมีข้อความขึ้น** ไม่ใช่ติ๊กเด้งกลับเงียบ ๆ */
  assert.ok(/failed\.set\(k, on\);\s*\n\s*lastError = err\.message;/.test(page), "ช่องที่ไม่ผ่านต้องค้างในร่าง");
  assert.ok(/setDraft\(failed\);\s*\n\s*if \(failed\.size === 0\) setGrantEdit\(false\);\s*\n\s*else setError\(lastError\);/.test(page),
    "บันทึกไม่ผ่านต้องอยู่ในโหมดแก้ไขต่อและตั้งข้อความบอกผู้ใช้");
  assert.ok(!/catch[^}]*await load\(\)/.test(page), "ห้ามโหลดใหม่ทั้งหน้าใน catch — error จะถูกล้างทิ้ง");
});

test("★ ติ๊กแล้วยังไม่มีผลจนกว่าจะกดบันทึก", () => {
  /* ผู้ใช้สั่ง (30 ต.ค. 2569): ติ๊กพลาดช่องเดียวเดิมเท่ากับเปิดข้อมูลให้อีกทีมทันที
     ตอนนี้ช่องติ๊กเปลี่ยนแค่ร่าง ต้องกด "แก้ไขสิทธิ์" ก่อนถึงติ๊กได้ และกด "บันทึก" ถึงส่งไปหลังบ้าน */
  assert.ok(/onChange=\{\(e\) => toggleDraft\(/.test(page), "ช่องติ๊กต้องแก้แค่ร่าง ไม่ยิงหลังบ้านเอง");
  assert.ok(/disabled=\{!grantEdit \|\| savingGrants\}/.test(page), "นอกโหมดแก้ไขต้องติ๊กไม่ได้");
  const toggle = page.slice(page.indexOf("const toggleDraft"), page.indexOf("const cancelGrants"));
  assert.ok(!/api(Put|Delete|Post)/.test(toggle), "toggleDraft ห้ามเรียกหลังบ้าน");
  assert.ok(page.includes('"beforeunload"'), "มีร่างค้างแล้วปิดหน้าต้องเตือน");
});

test("ตอนออกกุญแจใหม่ต้องเตือนว่าใบเดิมใช้ไม่ได้แล้ว", () => {
  /* ★ เดิมเขียนว่า "คัดลอกเก็บไว้ ปิดแล้วอ่านย้อนไม่ได้" ซึ่งไม่จริงอีกแล้ว
     ตั้งแต่เปิดให้ดูกุญแจย้อนหลังได้ (27 ต.ค. 2569) — สิ่งที่ต้องเตือนตอนนี้คือ
     ใบเดิมของทีมนั้นหยุดทำงานทันที ซึ่งเป็นผลที่ย้อนกลับไม่ได้จริง ๆ */
  assert.ok(page.includes("กุญแจใบเดิมของเขาจะใช้ไม่ได้ทันที"), "ต้องเตือนผลที่เกิดกับทีมอื่น");
  assert.ok(page.includes("freshKey.old"), "ต้องแยกข้อความระหว่างใบที่เพิ่งออกกับใบที่กดดู");

  /* คืนกุญแจเต็มได้เฉพาะตอนสร้าง ตอนออกใบใหม่ และตอนกดดู — เส้นทางอื่นห้ามคืน */
  assert.ok(/json\(\{ box: publicBox\([^)]*\), key \}\)/.test(hubApi), "ตอนสร้างต้องคืนกุญแจ");
  assert.ok(/json\(\{ key, warning:/.test(hubApi), "ตอนออกใบใหม่ต้องคืนกุญแจพร้อมคำเตือน");
  assert.ok(/json\(\{ code: rows\[0\]\.code, key, issuedAt/.test(hubApi), "ตอนกดดูต้องคืนกุญแจ");

  /* ★ ตัวกรองต้องไม่ปล่อยทั้งแฮชและของเข้ารหัสออกไปทาง API */
  const serializer = hubApi.slice(hubApi.indexOf("const publicBox"), hubApi.indexOf("/* ---------- กล่อง"));
  assert.ok(!serializer.includes("key_hash"), "ตัวกรองห้ามคืน key_hash");
  assert.ok(!serializer.includes("key_cipher:"), "ตัวกรองห้ามคืนของเข้ารหัส — ต้องกดขอทีละใบ");
  assert.ok(!/\.\.\.b[,\s}]/.test(serializer), "ห้ามกระจายทั้งแถว — ช่องใหม่จะหลุดตามไปเอง");
});

test("เจ้าของชุดข้อมูลต้องไม่ต้องขอสิทธิ์ดึงของตัวเอง", () => {
  assert.ok(hubApi.includes("เจ้าของชุดข้อมูลดึงของตัวเองได้อยู่แล้ว"), "หลังบ้านต้องปฏิเสธ");
  assert.ok(page.includes("hub-own"), "หน้าจอต้องแสดงเป็นเครื่องหมาย ไม่ใช่ช่องติ๊ก");
});

test("ติ๊กสิทธิ์ต้องส่งทีละช่อง ไม่ใช่ส่งรายชื่อทั้งชุดทับกัน", () => {
  /* ★ เดิมส่งรายชื่อทั้งชุดทุกครั้ง กดหลายช่องเร็ว ๆ ตอนเน็ตช้าแล้วคำขอที่ตอบทีหลัง
     ทับผลของช่องที่ติ๊กก่อน — ช่องหายเงียบ ๆ โดยไม่มี error (T1.351)
     ตอนนี้ช่องละคำขอ จึงไม่มีอะไรไปทับกันได้ */
  assert.ok(/grants\/\$\{boxId\}`/.test(page), "หน้าจอต้องยิงทีละช่อง");
  assert.ok(/if \(on\) await apiPut\(path, \{\}\);\s*\n\s*else await apiDelete\(path\);/.test(page));
  assert.ok(hubApi.includes('hubRouter.put("/streams/:id/grants/:boxId"'), "หลังบ้านต้องมีเส้นทางเปิดทีละช่อง");
  assert.ok(hubApi.includes('hubRouter.delete("/streams/:id/grants/:boxId"'), "หลังบ้านต้องมีเส้นทางปิดทีละช่อง");
  /* เส้นทางตั้งทั้งชุดยังอยู่สำหรับสคริปต์ และยังต้องล้างของเดิมก่อนเขียนชุดใหม่ */
  assert.ok(hubApi.includes("delete from stream_grant where stream_id"));
});

test("ทุกภาษาต้องมีคำแปลของหน้าตู้กลาง", () => {
  for (const lang of ["en", "zh"]) {
    const src = srcOf(`../src/lib/i18n/${lang}.js`);
    for (const key of ["ตู้กลาง", "เพิ่มกล่อง", "ออกกุญแจใหม่", "ชุดข้อมูล"]) {
      assert.ok(src.includes(`${key}:`), `${lang}.js ขาดคำแปลของ "${key}"`);
    }
  }
});

/* ---------- เส้นทางให้ทีมอื่นดึงข้อมูล ---------- */

const readApi = srcOf("../server/src/modules/ingest/readRoute.js");

test("★ ทุกเส้นทางดึงข้อมูลต้องผ่านด่านสิทธิ์เดียวกัน", () => {
  /* ถ้ามีใครเขียนคิวรีดึงข้อมูลที่ไม่ได้ join กับ stream_grant ไว้ที่อื่น
     ชุดของทีมหนึ่งจะหลุดไปให้อีกทีมโดยไม่มีใครรู้ */
  assert.ok(readApi.includes("async function visibleStream"), "ต้องมีด่านกลางตัวเดียว");
  assert.ok(
    /const stream = await visibleStream\(req\.box\.id, req\.params\.id\);\s*\n\s*if \(!stream\) throw notFound/.test(readApi),
    "เส้นทางข้อมูลต้องเรียกด่านก่อนเสมอ และตอบ 404 เมื่อไม่ผ่าน",
  );
});

test("เจ้าของดึงของตัวเองได้ ส่วนคนอื่นต้องมีแถวใน stream_grant", () => {
  assert.ok(readApi.includes("s.box_id = $1 or exists ("), "เจ้าของต้องผ่านโดยไม่ต้องมีแถวสิทธิ์");
  assert.ok(readApi.includes("from stream_grant g"), "คนอื่นต้องเช็กตารางสิทธิ์");
});

test("★ ชุดที่ดึงไม่ได้ต้องตอบเหมือนชุดที่ไม่มีจริง", () => {
  /* ถ้าแยกข้อความ คนที่เดาไอดีไปเรื่อย ๆ จะไล่หาได้ว่าทีมอื่นมีชุดอะไรบ้าง */
  assert.ok(
    readApi.includes('notFound("ชุดข้อมูลนี้ หรือยังไม่ได้รับสิทธิ์ให้ดึง")'),
    "ต้องใช้ข้อความเดียวกันทั้งกรณีไม่มีและไม่มีสิทธิ์",
  );
  assert.ok(!/throw forbidden|403/.test(readApi), "ห้ามตอบ 403 แยกจาก 404");
});

test("รายการชุดข้อมูลต้องแสดงเฉพาะที่กล่องนั้นแตะได้", () => {
  const list = readApi.slice(readApi.indexOf('streamsRouter.get("/"'), readApi.indexOf('streamsRouter.get("/:id/data"'));
  assert.ok(list.includes("where s.box_id = $1"), "ต้องกรองด้วยไอดีกล่องที่เรียก");
  assert.ok(list.includes("from stream_grant g"), "ต้องรวมชุดที่ได้รับสิทธิ์ด้วย");
});

test("ต้องบอกว่าดึงได้เพราะเป็นเจ้าของหรือเพราะได้รับสิทธิ์", () => {
  /* ทีมอื่นจะได้รู้ว่าถ้าชุดหายไปต้องไปถามใคร */
  assert.ok(readApi.includes('"owner" : "granted"'), "ต้องบอกที่มาของสิทธิ์");
});

test("ต้องจำกัดจำนวนและบอกเมื่อชนเพดาน", () => {
  assert.ok(readApi.includes("MAX_LIMIT"), "ต้องมีเพดาน กันคำขอเดียวลากทั้งตาราง");
  assert.ok(readApi.includes("truncated:"), "ชนเพดานแล้วต้องบอก ไม่งั้นผู้ดึงคิดว่ามีข้อมูลแค่นี้");
});

test("ต้องเรียงใหม่ไปเก่า", () => {
  /* เรียงเก่า→ใหม่แล้วตัดด้วย limit จะได้แต่ของเก่าและไม่รู้ว่าตกอะไรไป */
  assert.ok(readApi.includes("order by at desc"), "ต้องเอาของล่าสุดก่อน");
});

test("ไฟล์ต้องคืนแค่ที่อยู่ ไม่ใช่ตัวไฟล์", () => {
  assert.ok(/file: r\.file_url \? \{ url: r\.file_url/.test(readApi));
  assert.ok(!readApi.includes("readFile"), "ตู้กลางไม่อ่านไฟล์ให้ ผู้ดึงไปเอาเองจากที่อยู่");
});

test("ช่วงเวลาที่กรอกผิดต้องถูกปฏิเสธพร้อมบอกรูปแบบที่ถูก", () => {
  assert.ok(readApi.includes("from ต้องมาก่อน to"));
  assert.ok(readApi.includes("ISO"), "ต้องบอกรูปแบบเวลาที่รับ");
});

test("★ ตู้กลางต้องเป็นเว็บคนละตัว ไม่ใช่แค่คนละหน้า", () => {
  /* หัวหน้าสั่งให้แยก 27 ต.ค. 2569 — ตอนทำเป็นแค่เส้นทางหนึ่งในแอปเดิม
     ผู้ใช้ยังเจอแดชบอร์ดอยู่ดี (ล็อกอินหน้าเดียวกัน กดพลาดก็หลุดเข้าไป) */
  const app = srcOf("../src/App.jsx");
  assert.ok(!/path="\/?hub"/.test(app), "แอปแดชบอร์ดต้องไม่มีเส้นทาง /hub อีก");
  assert.ok(!app.includes("pages/Hub.jsx"), "แอปแดชบอร์ดต้องไม่ import หน้าตู้กลาง");

  /* มี entry ของตัวเอง */
  const vite = srcOf("../vite.config.js");
  assert.ok(vite.includes('hub: "hub.html"'), "ต้องตั้ง hub.html เป็น entry ที่สอง");
  assert.ok(srcOf("../hub.html").includes("src/hub/main.jsx"), "hub.html ต้องชี้ตัวเริ่มของตัวเอง");

  /* ตัวเริ่มของตู้กลางต้องไม่ลาก Provider ของฟาร์มมาด้วย
     ★ ดูเฉพาะบรรทัด import — คอมเมนต์หัวไฟล์อธิบายว่าตัดตัวไหนออกบ้าง จึงมีชื่อพวกนี้อยู่ */
  const mainImports = srcOf("../src/hub/main.jsx")
    .split("\n").filter((l) => l.startsWith("import")).join("\n");
  for (const farmOnly of ["LiveFarmsProvider", "RecordsProvider", "AdjustProvider", "LayoutProvider", "SidebarProvider"]) {
    assert.ok(!mainImports.includes(farmOnly), `ตู้กลางยังลาก ${farmOnly} ของฟาร์มมาด้วย`);
  }
});

test("ตู้กลางต้องมีหน้าเข้าสู่ระบบของตัวเอง", () => {
  /* ถ้าใช้หน้าเข้าสู่ระบบของแดชบอร์ด คนที่เปิดตู้กลางจะเด้งไปเจอแดชบอร์ดฟาร์ม ซึ่งผิดโจทย์ */
  const hubApp = srcOf("../src/hub/HubApp.jsx");
  assert.ok(hubApp.includes("HubLogin"), "ต้องมีหน้าเข้าสู่ระบบของตัวเอง");
  assert.ok(!hubApp.includes("pages/Login.jsx"), "ห้ามใช้หน้าเข้าสู่ระบบของแดชบอร์ด");
  assert.ok(srcOf("../src/hub/HubLogin.jsx").includes("signIn"), "ต้องเข้าระบบด้วยบัญชีชุดเดียวกัน");
});

test("ตัวเสิร์ฟหน้าเว็บต้องแยกสองแอปออกจากกัน", () => {
  /* ★ ไม่แยกตรงนี้ คนเปิด /hub จะได้ index.html ของแดชบอร์ด แล้วขึ้น "ไม่พบหน้านี้"
     ทั้งที่ที่อยู่ถูกแล้ว — งงมากและหาสาเหตุยาก */
  const srv = srcOf("../ops/web-server.js");
  assert.ok(srv.includes('"hub.html"'), "ต้องมี fallback เป็น hub.html");
  assert.ok(/urlPath === "\/hub" \|\| urlPath\.startsWith\("\/hub\/"\)/.test(srv), "ต้องจับทั้ง /hub และ /hub/*");
});

test("หน้าตู้กลางต้องไม่ใช้โครงของแดชบอร์ด", () => {
  const imports = page.split("\n").filter((l) => l.startsWith("import")).join("\n");
  for (const dashOnly of ["PageBoard", "AppLayout", "components/board/", "PageHeader"]) {
    assert.ok(!imports.includes(dashOnly), `หน้าตู้กลางยัง import ${dashOnly} ของแดชบอร์ดอยู่`);
  }
  assert.ok(page.includes("hub-topbar"), "ต้องมีหัวเว็บของตัวเอง");
});

test("ลบเลย์เอาต์ของแดชบอร์ดที่ไม่ใช้แล้วออกด้วย", () => {
  assert.ok(!srcOf("../src/lib/layout/presets.js").includes("hub"), "ยังมีเลย์เอาต์ hub ค้างอยู่");
});

/* ---------- ดูกุญแจย้อนหลัง + แก้ไขกล่อง (T1.347 · ผู้ใช้ขอ 27 ต.ค. 2569) ---------- */

test("กุญแจที่เก็บไว้ดูย้อนหลังต้องเข้ารหัส ไม่ใช่เก็บดิบ ๆ", async () => {
  process.env.HUB_KEY_SECRET = "x".repeat(32);
  const m = await import("../server/src/lib/boxKey.js?reveal=1");

  const key = m.mintBoxKey("jew");
  const sealed = m.sealBoxKey(key);

  assert.ok(sealed, "ต้องเข้ารหัสได้เมื่อมีความลับ");
  assert.ok(!sealed.includes(key), "★ ของที่เก็บลงฐานต้องไม่มีกุญแจตัวจริงปนอยู่");
  assert.equal(m.openBoxKey(sealed), key, "ถอดกลับต้องได้ของเดิม");
});

test("★ ได้ฐานข้อมูลไปอย่างเดียวต้องถอดกุญแจไม่ได้", async () => {
  /* นี่คือเหตุผลทั้งหมดที่ยอมเข้ารหัสแทนการเก็บดิบ — ไฟล์สำรองถูกคัดลอกไปมาง่าย
     และโปรเจกต์นี้เคยมีกุญแจหลุดไปอยู่ในประวัติ git มาแล้ว */
  process.env.HUB_KEY_SECRET = "x".repeat(32);
  const m = await import("../server/src/lib/boxKey.js?leak=1");
  const sealed = m.sealBoxKey(m.mintBoxKey("jew"));

  process.env.HUB_KEY_SECRET = "y".repeat(32);
  const other = await import("../server/src/lib/boxKey.js?leak=2");
  assert.equal(other.openBoxKey(sealed), null, "ความลับคนละตัวต้องถอดไม่ได้");
});

test("ไม่ได้ตั้งความลับ ต้องไม่เก็บดิบ ๆ แทนเงียบ ๆ", async () => {
  delete process.env.HUB_KEY_SECRET;
  const m = await import("../server/src/lib/boxKey.js?nosecret=1");
  assert.equal(m.canRevealKeys(), false);
  assert.equal(m.sealBoxKey("box_x_abc"), null, "ต้องคืน null ไม่ใช่คืนกุญแจดิบ");
});

test("ดูกุญแจต้องเป็น POST ไม่ใช่ GET", () => {
  /* ที่อยู่ของ GET ไปโผล่ในประวัติเบราว์เซอร์และล็อกของตัวกลางทุกชั้น
     การขอดูความลับไม่ควรทิ้งร่องรอยแบบนั้น */
  assert.ok(hubApi.includes('hubRouter.post("/boxes/:id/reveal"'), "ต้องใช้ POST");
  assert.ok(!hubApi.includes('hubRouter.get("/boxes/:id/reveal"'));
});

test("ใบเก่าที่ดูย้อนไม่ได้ ต้องบอกให้ตรง ไม่ใช่บอกว่าไม่มีกุญแจ", () => {
  /* กุญแจยังใช้ได้อยู่ แค่ออกก่อนเปิดระบบนี้ — ถ้าเขียนว่า "ไม่มีกุญแจ"
     คนอ่านจะนึกว่ากล่องใช้ไม่ได้แล้วและไปออกใบใหม่ทับโดยไม่จำเป็น */
  assert.ok(hubApi.includes("ใบนี้ออกก่อนเปิดระบบดูย้อนหลัง"), "ต้องอธิบายว่าทำไมดูไม่ได้");
  assert.ok(page.includes("b.canReveal &&"), "ปุ่มดูกุญแจต้องขึ้นเฉพาะใบที่ดูได้จริง");
});

test("ชื่อย่อกล่องต้องแก้ไม่ได้", () => {
  /* ★ ชื่อย่อฝังอยู่ในกุญแจที่ส่งให้ทีมอื่นไปแล้ว (box_jew_…)
     แก้แล้วกุญแจเดิมจะหาแถวไม่เจอ → ข้อมูลหยุดไหลโดยไม่มีใครรู้ */
  const patch = hubApi.slice(hubApi.indexOf('hubRouter.patch("/boxes/:id"'), hubApi.indexOf("/* ---------- ชุดข้อมูล"));
  assert.ok(!patch.includes('add("code"'), "หลังบ้านต้องไม่ยอมให้แก้ชื่อย่อ");
  assert.ok(page.includes("แก้ไม่ได้ เพราะอยู่ในกุญแจ"), "หน้าจอต้องบอกเหตุผลให้ผู้ใช้รู้");
});
