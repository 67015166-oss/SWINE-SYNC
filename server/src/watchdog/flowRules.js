/**
 * กติกาของตัวเฝ้าระวัง "ข้อมูลยังไหลอยู่ไหม" (T1.295) — ฟังก์ชันล้วน ไม่ import อะไรเลย
 *
 * ═══ ทำไมต้องมี ═══
 * 29 ก.ย. 2569 ข้อมูลเซนเซอร์หยุดไหลตั้งแต่ตี 2 — ไม่มีใครรู้จนผมไปเปิดดูตอนบ่ายวันถัดมา
 * ก่อนหน้านั้น 26–28 ก.ย. ก็เกิดมาแล้วครั้งหนึ่ง (เหลือ 0.2% ของปกติ)
 *
 * ตัวเฝ้าเครื่องหลัก (T1.285) จับเรื่องนี้ไม่ได้ เพราะเครื่องหลัก "ตอบ" อยู่ตามปกติ
 * มันแค่ไม่มีข้อมูลใหม่ให้คิด — และหน้าจอยังขึ้นเลขเดิมค้างไว้เหมือนทุกอย่างปกติ
 *
 * ═══ สองอาการที่ต้องแยกกัน ═══
 *   1. **ท่อหยุด** — ไม่มีค่าใหม่เข้า InfluxDB เลย (Node-RED หลับ · MQTT หลุด · ตู้ในฟาร์มดับ)
 *   2. **ท่อเดินแต่ของเสีย** — ค่าเข้ามาตรงเวลาแต่เป็น 0 ทั้งหมด (อุปกรณ์อ่าน RS485 ไม่ได้)
 *      อาการนี้อันตรายกว่า เพราะ "มีข้อมูลเข้า" ทำให้ทุกตัวนับว่าปกติ ทั้งที่ไม่มีค่าจริงสักตัว
 *      สะพานทิ้งค่าพวกนี้อยู่แล้ว (`ทิ้งค่าที่เป็นไปไม่ได้` ใน log) แต่ไม่เคยบอกใครนอกจาก log
 *
 * ═══ ทำไมกติกา "ค่าเป็นศูนย์" ตรงนี้ถึงหยาบกว่าของสะพาน ═══
 * ช่วงที่ยอมรับได้จริงของแต่ละ field อยู่ในตาราง `sensor_source_map` ของ**ฐานข้อมูล**
 * แต่ตัวเฝ้าห้ามแตะฐาน (กฎเดียวกับ rules.js — มันต้องรอดตอนฐานล่ม)
 * จึงใช้กติกาที่พิสูจน์แล้วจากของจริง: อุณหภูมิ/ความชื้นที่อ่านไม่ได้จะคืน **0 เป๊ะ**
 * หยาบกว่าแต่ไม่พึ่งอะไรเลย และไม่เคยมีค่า 0 จริงในเล้าสุกร
 */

/**
 * ดิสก์เหลือน้อยกว่านี้ (%) = เตือน — เขียนข้อมูลไม่ลงเมื่อไร ข้อมูลหายเงียบ ๆ
 *
 * **ทำไมเป็นเปอร์เซ็นต์ ไม่ใช่กิกะไบต์** — `statfs` ในคอนเทนเนอร์รายงานขนาดบล็อกไม่ตรงกับของจริง
 * (ตรวจจริง 30 ก.ย. 2569: คิดเป็นไบต์แล้วได้ "ว่าง 1,987 GB" ทั้งที่เครื่องเหลือจริง 7.8 GB
 *  เพราะ `bsize` คืนค่า 1 MiB แต่บล็อกจริงคือ 4 KiB)
 * **สัดส่วนว่าง/ทั้งหมด ไม่ขึ้นกับขนาดบล็อก** จึงถูกเสมอไม่ว่าจะวัดจากในหรือนอกคอนเทนเนอร์
 *
 * 5% ของดิสก์ 460 GB ≈ 23 GB — ดังก่อนถึงจุดที่เริ่มเขียนไม่ลง (28 ก.ย. 2569 พังตอนเหลือ ~7 GB)
 */
export const MIN_FREE_PCT = 5;

/**
 * ดิสก์ของเครื่องที่เก็บข้อมูลดิบเหลือพอไหม
 *
 * ★ ทำไมอยู่ในตัวเฝ้าข้อมูล ไม่ใช่ตัวเฝ้าแยก — เพราะ **ดิสก์เต็มทำให้ข้อมูลหยุดไหล**
 *   28 ก.ย. 2569 Node-RED ขึ้น "Write to InfluxDB failed — Request timed out" ตอนดิสก์ใกล้เต็ม
 *   ถ้าไม่ตรวจข้อนี้ ตัวเฝ้าจะบอกว่า "ไปดู Node-RED กับตู้ในฟาร์ม" ซึ่ง**ชี้ผิดที่**
 *   และคนจะไล่หาสาเหตุผิดทางอยู่นาน ทั้งที่คำตอบคือลบไฟล์
 *
 * @param {{avail: number, total: number}} disk จำนวนบล็อกว่าง / ทั้งหมด (หน่วยอะไรก็ได้ ขอให้หน่วยเดียวกัน)
 * @returns {{ok: boolean, reason: string|null, freePct: number|null}}
 */
export function checkDisk(disk, opt = {}) {
  const minPct = opt.minFreePct ?? MIN_FREE_PCT;

  /* ★★ `Number(null)` และ `Number("")` คือ **0** ซึ่งผ่าน `Number.isFinite` (T1.317)
     ของเดิมใช้ `Number.isFinite` ตัวเดียว ผลคือ `avail: null` กลายเป็น
     **"ดิสก์เหลือ 0% — เต็มแล้ว"** ทั้งที่ความจริงคือ *อ่านค่าไม่ได้*
     เป็นการเตือนผิดในตัวเฝ้าเอง ซึ่งขัดกับกติกาที่เขียนไว้ข้างล่างบรรทัดนี้เอง
     และเป็นกับดักเดียวกับ T1.295 · T1.308 · T1.311 · T1.316 — รอบที่ห้า */
  const num = (v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const avail = num(disk?.avail);
  const total = num(disk?.total);

  /* วัดไม่ได้ = ไม่ตัดสิน (ดีกว่าเตือนผิด) */
  if (avail == null || total == null || total <= 0) {
    return { ok: true, reason: null, freePct: null };
  }

  const freePct = Math.round((avail / total) * 1000) / 10;
  if (freePct >= minPct) return { ok: true, reason: null, freePct };
  return {
    ok: false,
    reason: `ดิสก์ของเครื่องที่เก็บข้อมูลเหลือ ${freePct}% (เกณฑ์ ${minPct}%)`,
    freePct,
  };
}

/** ค่าใหม่ล่าสุดเก่ากว่านี้ (นาที) = ท่อหยุด — เซนเซอร์ส่งทุก ~10 วินาที 30 นาทีจึงนานผิดปกติมาก */
export const MAX_AGE_MIN = 30;

/** field ที่ต้องมีค่าจริง ไม่ใช่ 0 — ขึ้นต้นด้วยชื่อพวกนี้ */
const MUST_NOT_BE_ZERO = ["temperature", "humidity"];

/** "41 ชั่วโมง" / "25 นาที" — เลขนาทีดิบอย่าง "2462 นาที" คนอ่านต้องหารในใจก่อนถึงจะรู้ว่านานแค่ไหน */
function readableAge(min) {
  if (min < 120) return `${min} นาที`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} ชั่วโมง`;
  return `${Math.round(h / 24)} วัน`;
}

const isClimateField = (field) =>
  MUST_NOT_BE_ZERO.some((prefix) => String(field ?? "").startsWith(prefix));

/**
 * ผลตรวจรอบนี้ผ่านไหม
 *
 * @param {Array<{field: string, at: Date|string, value: number}>} points ค่าล่าสุดของแต่ละ field
 * @param {Date} now
 * @param {{maxAgeMin?: number}} [opt]
 * @returns {{ok: boolean, reason: string|null, kind: null|"empty"|"stale"|"zeros", ageMin: number|null, lastAt: string|null}}
 *
 * `reason` เป็นข้อความสำหรับคนอ่าน (เข้า log และเข้าไลน์) ไม่ใช่รหัสให้โปรแกรมแยกเคส
 * ตัวที่โปรแกรมใช้แยกคือ `kind`
 */
export function classifyFlow(points, now = new Date(), opt = {}) {
  const maxAgeMin = opt.maxAgeMin ?? MAX_AGE_MIN;
  /* ★ `Number(null)` คือ 0 ไม่ใช่ NaN — ถ้ากรองด้วย Number.isFinite เฉย ๆ ค่าที่หายไป
     จะกลายเป็น "ศูนย์" แล้วตัวเฝ้าจะประกาศว่าอุปกรณ์เสียทั้งที่แค่ไม่มีค่ามา (เจอตอนเขียนเทสต์) */
  const rows = (points ?? []).filter(
    (p) => p && p.value !== null && p.value !== "" && Number.isFinite(Number(p.value)),
  );

  if (rows.length === 0) {
    return { ok: false, reason: "ไม่มีค่าใน InfluxDB เลย", kind: "empty", ageMin: null, lastAt: null };
  }

  const times = rows.map((p) => new Date(p.at).getTime()).filter((t) => Number.isFinite(t));
  if (times.length === 0) {
    return { ok: false, reason: "ค่าที่อ่านมาไม่มีเวลากำกับ", kind: "empty", ageMin: null, lastAt: null };
  }
  const newest = Math.max(...times);
  const ageMin = Math.max(0, Math.round((new Date(now).getTime() - newest) / 60000));
  const lastAt = new Date(newest).toISOString();

  if (ageMin > maxAgeMin) {
    return {
      ok: false,
      reason: `ค่าล่าสุดเก่า ${readableAge(ageMin)} (เกณฑ์ ${maxAgeMin} นาที)`,
      kind: "stale",
      ageMin,
      lastAt,
    };
  }

  /* ถึงตรงนี้แปลว่าค่ายังมาตรงเวลา — เหลือดูว่าเป็นของจริงหรือศูนย์เปล่า ๆ
     ดูเฉพาะ field อุณหภูมิ/ความชื้น (มิเตอร์ไฟเป็น 0 ได้จริงตอนไม่มีโหลด) */
  const climate = rows.filter((p) => isClimateField(p.field));
  if (climate.length > 0 && climate.every((p) => Number(p.value) === 0)) {
    return {
      ok: false,
      reason: `ค่าเข้ามาตรงเวลาแต่เป็น 0 ทั้งหมด (${climate.length} field)`,
      kind: "zeros",
      ageMin,
      lastAt,
    };
  }

  return { ok: true, reason: null, kind: null, ageMin, lastAt };
}

/**
 * ข้อความเข้าไลน์ — บอกผลกระทบ แล้วบอกว่าต้องไปดูตรงไหน
 *
 * ★ ห้ามใช้ markdown — LINE แสดงข้อความล้วน ดอกจันจะโผล่เป็นตัวอักษรจริง
 * ★ ห้ามบอกว่า "ข้อมูลไม่หาย" — ค่าที่ไม่ถูกส่งในช่วงนี้ **หายถาวร** ไม่มีใครเก็บไว้ให้
 *   (MQTT ที่ใช้อยู่เป็น QoS 0 · ดู docs/RUNBOOK.md หัวข้อท่อเซนเซอร์)
 *
 * @param {"down"|"still"|"up"} kind
 * @param {{gap: string|null, reason: string|null, now?: Date}} info
 */
export function flowMessage(kind, { gap = null, reason = null, kind: cause = null } = {}) {
  /* ดิสก์เต็มต้องบอกวิธีแก้ที่ตรงเรื่อง — ไล่ Node-RED ไปก็ไม่เจออะไร */
  if (cause === "disk" && kind !== "up") {
    return {
      type: "text",
      text: [
        kind === "down" ? "⚠ ดิสก์ของเครื่องเก็บข้อมูลใกล้เต็ม" : "⚠ ดิสก์ยังใกล้เต็มอยู่",
        reason,
        "",
        "เขียนค่าเซนเซอร์ลงฐานไม่ได้เมื่อไร ข้อมูลช่วงนั้นหายถาวร",
        "เคยเกิดแล้ว 28 ก.ย. 2569 — Node-RED เขียน InfluxDB ไม่สำเร็จเพราะหมดเวลา",
        "",
        "ที่ต้องทำ: ลบไฟล์ในเครื่องให้เหลือที่ว่างมากกว่าเกณฑ์ข้างบน",
      ].filter((line) => line !== null).join("\n"),
    };
  }

  if (kind === "up") {
    return {
      type: "text",
      text: [
        "✅ ข้อมูลเซนเซอร์กลับมาไหลแล้ว",
        gap ? `หยุดไปทั้งหมด ${gap}` : null,
        "ค่าที่ขาดช่วงนั้นเอากลับมาไม่ได้ กราฟจะมีรอยขาด",
      ].filter(Boolean).join("\n"),
    };
  }

  return {
    type: "text",
    text: [
      kind === "down" ? "⚠ ข้อมูลเซนเซอร์หยุดไหล" : "⚠ ข้อมูลเซนเซอร์ยังไม่กลับมา",
      gap ? `หยุดมา ${gap}` : null,
      reason ? `อาการ: ${reason}` : null,
      "",
      "ระหว่างนี้หน้าจอค้างที่ค่าเดิม และระบบแจ้งเตือนไม่เห็นความผิดปกติใหม่",
      "ค่าช่วงที่ขาดไปเอากลับมาไม่ได้",
      "",
      "ที่ต้องทำ: ตรวจเครื่องที่รัน Node-RED ว่ายังตื่นและยังต่อ MQTT อยู่",
      "แล้วตรวจว่าตู้ควบคุมในฟาร์มยังส่งค่าออกมา",
    ].filter((line) => line !== null).join("\n"),
  };
}
