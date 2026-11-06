/**
 * นับจำนวนสุกรจาก "บันทึกของคนหน้าฟาร์ม" (T1.321)
 *
 * ═══ ทำไมนับจากบันทึก ไม่ใช่เก็บเลขจำนวนไว้ตรง ๆ ═══
 * ฐานไม่มีคอลัมน์ "จำนวนสุกรตอนนี้" และ**ไม่ควรมี** เพราะเลขเดียวที่เก็บไว้
 * จะเพี้ยนทันทีที่มีคนลืมอัปเดต แล้วไม่มีใครรู้ว่าเพี้ยนตั้งแต่เมื่อไรหรือเพราะอะไร
 * นับจากเหตุการณ์ทุกครั้งที่ถาม ทำให้ตัวเลข**อธิบายที่มาของตัวเองได้เสมอ**
 *
 *   จำนวน = ย้ายเข้า − ย้ายออก − ตาย − ขาดหาย
 *
 * ═══ ★★ ติดลบไม่ได้แปลว่าคำนวณผิด — แปลว่า "ยังไม่ได้ลงยอดตั้งต้น" ═══
 * ฟาร์มที่เริ่มใช้ระบบกลางทางจะมีสุกรอยู่ในเล้าก่อนแล้ว ถ้าบันทึกแต่ขาออก
 * (ตาย/ย้ายออก) โดยไม่เคยลง `moveIn` ของยอดที่มีอยู่เดิม ผลลัพธ์จะติดลบ
 *
 * **ห้ามปัดเป็น 0 แล้วโชว์เฉย ๆ** เพราะ 0 อ่านว่า "เล้าว่าง" ซึ่งคนละเรื่องกับ
 * "เรายังไม่รู้ว่ามีกี่ตัว" — อันแรกทำให้คนนึกว่าขายหมดแล้ว อันหลังคือความจริง
 * จึงคืน `confident: false` ให้หน้าจอขึ้นคำอธิบายแทนตัวเลข
 *
 * วิธีลงยอดตั้งต้นคือบันทึก "ย้ายสุกรเข้า" เท่าจำนวนที่มีอยู่จริงหนึ่งครั้ง
 * — เป็นวิธีเดียวกับที่ระบบบัญชีสุกรทั่วไปใช้เริ่มต้น ไม่ต้องเพิ่มคอลัมน์ใหม่
 */

/** ชนิดที่ทำให้จำนวนเปลี่ยน — `feed`/`medicine`/`sick` ไม่เปลี่ยนจำนวน */
export const COUNT_EFFECT = {
  moveIn: +1,
  moveOut: -1,
  dead: -1,
  missing: -1,
};

/** คัดเลขที่อ่านไม่ออกทิ้ง — `null`/ช่องว่างต้องไม่กลายเป็น 0 แล้วถูกนับ */
const amountOf = (entry) => {
  const v = entry?.amount;
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * สรุปจำนวนสุกรของเล้าหนึ่งจากรายการบันทึกทั้งหมดของเล้านั้น
 *
 * @param {Array<{type: string, amount: number}>} entries รายการบันทึก (ลำดับไม่สำคัญ)
 * @returns {{count: number|null, confident: boolean, reason: string|null,
 *            moveIn: number, moveOut: number, dead: number, missing: number, entries: number}}
 */
export function herdFromLogs(entries) {
  const totals = { moveIn: 0, moveOut: 0, dead: 0, missing: 0 };
  let counted = 0;

  for (const e of entries ?? []) {
    if (!Object.hasOwn(COUNT_EFFECT, e?.type)) continue;
    const n = amountOf(e);
    if (n == null) continue;
    /* ★ นับเฉพาะ "ตัว" — บันทึกอาหารเป็นกิโลกรัมหลุดมาเป็นจำนวนสุกรไม่ได้
       (ชนิดกรองไปแล้วชั้นหนึ่ง แต่ชนิดกับหน่วยตั้งไม่ตรงกันได้ในของเก่า) */
    if (e.unit != null && e.unit !== "ตัว") continue;
    totals[e.type] += n;
    counted += 1;
  }

  const net = totals.moveIn - totals.moveOut - totals.dead - totals.missing;

  if (counted === 0) {
    return { count: null, confident: false, reason: "no-logs", ...totals, entries: 0 };
  }
  if (net < 0) {
    /* ★★ ขาออกมากกว่าขาเข้าที่บันทึกไว้ = ไม่เคยลงยอดตั้งต้น (ดูหัวไฟล์) */
    return { count: null, confident: false, reason: "no-opening", ...totals, entries: counted };
  }
  if (totals.moveIn === 0) {
    /* มีแต่บันทึกขาออกและหักกันพอดีเป็น 0 — ยังสรุปจำนวนไม่ได้เหมือนกัน */
    return { count: null, confident: false, reason: "no-opening", ...totals, entries: counted };
  }

  return { count: net, confident: true, reason: null, ...totals, entries: counted };
}

/**
 * รวมหลายเล้าเป็นยอดของฟาร์ม
 *
 * ★ เล้าที่ยังสรุปไม่ได้ **ไม่ถูกนับเป็น 0** แต่ถูกนับแยกไว้ที่ `unknownBarns`
 *   ถ้าเอามารวมเป็น 0 ยอดฟาร์มจะต่ำกว่าความจริงโดยที่หน้าจอดูเหมือนครบ
 *   — กับดักเดียวกับค่าเฉลี่ยอุณหภูมิใน T1.311
 *
 * @param {Record<string, ReturnType<typeof herdFromLogs>>} byBarn
 */
export function herdTotal(byBarn) {
  const rows = Object.values(byBarn ?? {});
  const known = rows.filter((r) => r?.confident);
  return {
    count: known.reduce((sum, r) => sum + r.count, 0),
    knownBarns: known.length,
    unknownBarns: rows.length - known.length,
    /* ยอดฟาร์มเชื่อได้เต็มที่ก็ต่อเมื่อทุกเล้าสรุปได้ และมีเล้าให้สรุปอยู่จริง */
    complete: rows.length > 0 && known.length === rows.length,
  };
}

/** คำอธิบายว่าทำไมยังไม่มีตัวเลข — หน้าจอต้องบอกเหตุ ไม่ใช่ขึ้นขีดกลางเฉย ๆ */
export const HERD_REASON = {
  "no-logs": "ยังไม่มีบันทึกของเล้านี้ — จำนวนจึงยังไม่รู้",
  "no-opening": "ยังไม่ได้ลงยอดตั้งต้น — บันทึก \"ย้ายสุกรเข้า\" เท่าจำนวนที่มีอยู่จริงหนึ่งครั้ง",
};

/**
 * ค่าที่คนกรอกในช่อง "จำนวนสุกร" → ตัวเลขที่ `countDiffEntry` รับได้ (T1.341)
 *
 * ═══ ★ ทำไมต้องอยู่ไฟล์นี้ ไม่ใช่ในฟอร์ม ═══
 * `countDiffEntry` แยก "ไม่ได้กรอก" (`null`) ออกจาก "กรอกศูนย์" (`0`) อย่างระมัดระวัง
 * เพราะสองอย่างนี้สั่งคนละเรื่อง — อย่างแรกคือ *อย่าทำอะไร* อย่างหลังคือ *ล้างเล้า*
 * แต่ฟอร์มแปลงค่าเองด้วย `Math.max(0, Number(text))` ซึ่ง `Number("")` คือ **0**
 * สองอย่างจึงถูกยุบเข้าหากัน**ก่อน**จะถึงด่านที่แยกมันออก
 *
 * ผลจริง: โรงเรือนจากหลังบ้านมี `pigs: null` ตลอด ช่องนี้จึงเปิดมาว่างเปล่า
 * แก้แค่ความจุแล้วกดบันทึก = บันทึก "ย้ายออก" เท่ายอดทั้งเล้า ฝูงหายเงียบ ๆ
 *
 * ย้ายการแปลงมาอยู่ติดกันเสียเลย ใครเพิ่มช่องกรอกจำนวนที่อื่นก็เรียกตัวนี้ตัวเดียว
 *
 * @param {string|number|null|undefined} text ค่าที่อยู่ในช่องกรอก
 * @returns {number|null} `null` = ไม่ได้กรอก (หรือกรอกมาอ่านไม่ออก) · ตัวเลข = จำนวนที่ต้องการ
 */
export function pigsField(text) {
  if (text == null) return null;
  const trimmed = String(text).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  /* ★ อ่านไม่ออกหรือติดลบ = "ไม่ได้กรอก" ห้ามกดลงเป็น 0
     ของเดิมใช้ Math.max(0, …) ซึ่งเปลี่ยนค่าที่ใช้ไม่ได้ให้กลายเป็นคำสั่งล้างเล้า */
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * ค่าตั้งต้นของช่อง "จำนวนสุกร" ตอนเปิดฟอร์มแก้ไข (T1.341)
 *
 * ★ `barn.pigs` ของโรงเรือนจริงเป็น `null` เสมอ — ยอดจริงอยู่ที่ยอดนับจากบันทึก
 *   ถ้าตั้งต้นจาก `barn.pigs` ตรง ๆ ช่องจะว่างทั้งที่ระบบรู้จำนวนอยู่
 *   คนกรอกจึงอ่านได้ว่า "ระบบไม่รู้" แล้วพิมพ์ทับ หรือปล่อยว่างไว้แล้วฝูงหาย
 *
 * @param {number|null} known ยอดที่ระบบนับได้ (จาก `useBarnCounts`)
 * @param {number|null} barnPigs ค่าในตัวโรงเรือนเอง (ฟาร์มตัวอย่างมี ฟาร์มจริงไม่มี)
 */
export function pigsSeed(known, barnPigs) {
  const pick = known ?? barnPigs;
  return pick == null ? "" : String(pick);
}

/**
 * ส่วนต่างระหว่าง "จำนวนที่คนกรอกในฟอร์ม" กับ "จำนวนที่นับได้จากบันทึก"
 * → บันทึกหนึ่งรายการที่ทำให้สองเลขตรงกัน (หรือ `null` ถ้าไม่ต้องบันทึกอะไร)
 *
 * ═══ ทำไมต้องมีตัวนี้ (T1.328) ═══
 * ฟอร์มเพิ่ม/แก้โรงเรือนมีช่อง "จำนวนสุกร" ให้กรอกมาตลอด แต่ค่าที่กรอกถูกตัดทิ้ง
 * ก่อนส่งขึ้นฐาน (ฐานไม่มีคอลัมน์นี้ และตามหัวไฟล์ก็**ไม่ควรมี**) ผู้ใช้จึงกรอกแล้ว
 * เลขหายเงียบ ๆ โดยไม่มีอะไรบอก — และหายเฉพาะฟาร์มจริง ส่วนฟาร์มตัวอย่างเก็บลงเครื่องได้
 * ฟอร์มหน้าตาเหมือนกันเป๊ะทั้งสองกรณี
 *
 * แทนที่จะเพิ่มคอลัมน์ (= มีเลขสองชุดที่ขัดกันเองได้) ให้แปลงสิ่งที่กรอกเป็น**เหตุการณ์**
 * ตามวิธีที่หัวไฟล์นี้เขียนไว้อยู่แล้ว: *"วิธีลงยอดตั้งต้นคือบันทึกย้ายสุกรเข้าเท่าจำนวนที่มีจริง"*
 *
 * ═══ ★ ต้องเทียบกับ "ผลรวมดิบ" ไม่ใช่ `count` ═══
 * `count` เป็น `null` เมื่อยังสรุปไม่ได้ (เช่นมีแต่บันทึกตาย ยังไม่เคยลงยอดตั้งต้น)
 * ถ้าตีค่า `null` เป็น 0 แล้วบันทึกเท่าที่กรอก ยอดจะขาดไปเท่ากับขาออกที่บันทึกไว้ก่อนหน้า
 *
 *   เล้ามีบันทึกตาย 2 · ยังไม่เคยลงยอดตั้งต้น · คนกรอกว่าตอนนี้มี 1,198 ตัว
 *   ถ้าเทียบกับ 0  → บันทึก moveIn 1,198 → นับใหม่ได้ 1,196 ❌ ขาดไป 2
 *   เทียบผลรวมดิบ −2 → บันทึก moveIn 1,200 → นับใหม่ได้ 1,198 ✅ ตรงกับที่กรอก
 *
 * @param {ReturnType<typeof herdFromLogs>|null} summary ผลนับปัจจุบันของเล้านั้น
 * @param {number|string|null} target จำนวนที่ผู้ใช้กรอก
 * @returns {{type: "moveIn"|"moveOut", amount: number, unit: "ตัว"}|null}
 */
export function countDiffEntry(summary, target) {
  /* ไม่ได้กรอก = ไม่ต้องทำอะไร — ต่างจากกรอก 0 ซึ่งแปลว่า "เล้าว่างแล้ว" และต้องบันทึก */
  if (target == null || target === "") return null;
  const want = Number(target);
  if (!Number.isFinite(want) || want < 0) return null;

  const n = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  const s = summary ?? {};
  const net = n(s.moveIn) - n(s.moveOut) - n(s.dead) - n(s.missing);

  const diff = Math.round(want - net);
  if (diff === 0) return null;
  return { type: diff > 0 ? "moveIn" : "moveOut", amount: Math.abs(diff), unit: "ตัว" };
}

/** ขั้นการเลี้ยงที่ฐานรับ — ต้องตรงกับ `STAGES` ของหลังบ้านและ check constraint ของฐาน */
export const STAGE_ORDER = ["แม่พันธุ์", "ลูกสุกร", "อนุบาล", "ขุน"];

/** เล้าที่ยังไม่ได้ระบุขั้นการเลี้ยง — แยกถังไว้ ไม่ยัดรวมกับขั้นใดขั้นหนึ่ง */
export const STAGE_NONE = "ไม่ได้ระบุขั้น";

/**
 * รวมแถวที่สรุปจำนวนแล้วเป็นยอดต่อ "ขั้นการเลี้ยง" (T1.330 · แก้ทางเดียวใน T1.332)
 *
 * ═══ ★ ทำไมจัดกลุ่มตามขั้นการเลี้ยง ไม่ใช่ "ประเภทสุกร" ของหน้าเดิม ═══
 * หน้า `/dashboard/pigs` เดิมแบ่งเป็น 4 ประเภท (คลอดลูก · เตรียมทดแทน · รุ่น · ขุน)
 * ซึ่งเป็นชุดของข้อมูลตัวอย่าง **ไม่มีอยู่ในข้อมูลจริงเลย** ของจริงที่ฐานเก็บคือ
 * `stage` ของโรงเรือน (แม่พันธุ์ · ลูกสุกร · อนุบาล · ขุน) ซึ่งคนละชุดและจับคู่กันไม่ลงตัว
 * (เช่น "แม่พันธุ์" จะไปเป็น "คลอดลูก" หรือ "เตรียมทดแทน" ก็ได้ ตอบแทนไม่ได้)
 * **การเดาคู่ให้เองคือการแต่งข้อมูล** จึงจัดตามของจริงที่มี
 *
 * @param {Array<{stage: string|null, count: number|null, from: string|null}>} rows
 */
export function countsByStage(rows) {
  const buckets = new Map();
  for (const r of rows ?? []) {
    const stage = r?.stage ?? STAGE_NONE;
    if (!buckets.has(stage)) buckets.set(stage, []);
    buckets.get(stage).push(r);
  }

  const rank = (s) => {
    const i = STAGE_ORDER.indexOf(s);
    return i === -1 ? STAGE_ORDER.length : i;
  };

  return [...buckets.entries()]
    .map(([stage, list]) => ({ stage, ...barnCountTotal(list) }))
    /* ขั้นที่ยังไม่มีเล้าไหนสรุปได้เลย ไม่ต้องขึ้นบนจอ — ขึ้นเป็น 0 จะอ่านว่า "เล้าว่าง" */
    .filter((row) => row.count != null)
    .sort((a, b) => rank(a.stage) - rank(b.stage) || a.stage.localeCompare(b.stage, "th"));
}

/**
 * จำนวนของเล้าหนึ่ง จากแหล่งที่น่าเชื่อถือที่สุดเท่าที่มี (T1.332)
 *
 * ═══ ทำไมต้องมี ═══
 * จำนวนสุกรของเล้าหนึ่งมีได้จากสามทาง และแต่ละทางไปคนละที่
 *   1. **บันทึกในฐาน** (`barn_log`) — ของจริง ทุกเครื่องเห็นตรงกัน · ต้องเข้าสู่ระบบ
 *   2. **ช่อง `pigs` ของเล้า** — ฟอร์มโรงเรือนตอน**ยังไม่เข้าสู่ระบบ** เก็บลงเครื่องนี้
 *   3. **ส่วนต่างจากป๊อบอัพ "ปรับจำนวน"** — เก็บลงเครื่องนี้เหมือนกัน (หน้าจอผสมให้ก่อนส่งมา)
 *
 * ผู้ใช้แจ้ง (15 ต.ค. 2569) ว่ากรอกจำนวนที่ฟอร์มโรงเรือนไปหมื่นตัวแล้วหน้าจำนวนสุกรไม่ขึ้น
 * — เพราะตอนนั้นยังไม่ได้เข้าสู่ระบบ ค่าจึงลงเครื่องตามทางที่ 2 ส่วนหน้านั้นอ่านแต่ทางที่ 1
 *
 * ★ **เรียงความน่าเชื่อถือ ไม่ใช่เอาทางไหนก็ได้** — บันทึกในฐานมาก่อนเสมอ
 *   เพราะอธิบายที่มาของตัวเองได้ (ดูหัวไฟล์) ส่วนค่าในเครื่องเป็นของเครื่องเดียว
 *   และต้องบอกผู้ใช้ด้วยว่ากำลังอ่านจากทางไหน ไม่ใช่สลับเงียบ ๆ
 *
 * @param {ReturnType<typeof herdFromLogs>|null} summary ผลนับจากบันทึกในฐาน
 * @param {number|string|null} fallback จำนวนที่เก็บไว้ในเครื่องนี้
 * @returns {{count: number|null, from: "records"|"local"|null}}
 */
export function barnCount(summary, fallback) {
  if (summary?.confident) return { count: summary.count, from: "records" };
  if (fallback == null || fallback === "") return { count: null, from: null };
  const n = Number(fallback);
  if (!Number.isFinite(n) || n < 0) return { count: null, from: null };
  return { count: n, from: "local" };
}

/**
 * รวมจำนวนของหลายเล้าเป็นยอดเดียว พร้อมบอกว่ายอดนี้มาจากทางไหนบ้าง (T1.332)
 *
 * `from` = "records" เมื่อทุกตัวที่นับได้มาจากบันทึกในฐาน · "local" เมื่อมีค่าในเครื่องปนอยู่
 * · `null` เมื่อไม่มีเล้าไหนสรุปได้เลย (หน้าจอต้องถอยไปใช้ข้อมูลตัวอย่างและบอกให้ชัด)
 */
export function barnCountTotal(rows) {
  /* ★ เรียงความน่าเชื่อถือจากต่ำไปสูง — ยอดผสมต้องรายงาน**ตัวที่อ่อนที่สุด**
     ไม่ใช่ตัวที่ดีที่สุด ไม่งั้นยอดที่มีข้อมูลตัวอย่างปนจะถูกป้ายว่า "ข้อมูลจริง" */
  const RANK = { demo: 0, local: 1, records: 2 };
  let count = 0;
  let known = 0;
  let unknown = 0;
  let weakest = null;
  for (const r of rows ?? []) {
    if (r?.count == null) { unknown += 1; continue; }
    count += r.count;
    known += 1;
    if (weakest == null || RANK[r.from] < RANK[weakest]) weakest = r.from;
  }
  return {
    count: known > 0 ? count : null,
    knownBarns: known,
    unknownBarns: unknown,
    from: known === 0 ? null : weakest,
  };
}
