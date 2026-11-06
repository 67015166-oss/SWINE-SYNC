/**
 * กติกาของตัวเฝ้าระวัง "เครื่องหลักยังอยู่ไหม" (T1.285) — ฟังก์ชันล้วน ไม่ import อะไรเลย
 *
 * ═══ ทำไมต้องมี ═══
 * 25–28 ก.ย. 2569 กล่อง `box-mew` ดับไป **3 วันเต็มโดยไม่มีใครรู้**
 * ทั้งที่มันเป็นเครื่องที่คิดแจ้งเตือนและส่งไลน์ให้ทั้งระบบ — พอมันดับ
 * การแจ้งเตือนก็เงียบไปด้วย และ "ไม่มีข้อความเข้ามา" หน้าตาเหมือน "ทุกอย่างปกติ" เป๊ะ
 * นี่คือจุดบอดที่อันตรายที่สุดของระบบแจ้งเตือนทุกระบบ
 *
 * ═══ ทำไมไม่ทำให้เครื่องสำรองรับหน้าที่แจ้งเตือนแทนไปเลย ═══
 * เพราะการคิดแจ้งเตือน **ต้องใช้ฐานข้อมูล** และฐานข้อมูลอยู่บนเครื่องที่ดับไปนั่นเอง
 * จะให้เครื่องสำรองทำแทนได้ต้องมีฐานที่สอง แล้วก็ต้องมาแก้ปัญหาฐานสองชุดไม่ตรงกันอีก
 * ซึ่งเป็นของที่ **ส่งมอบให้คนอื่นดูแลต่อยาก** และพังเงียบกว่าเดิม
 * ตัวนี้จึงทำอย่างเดียว: **บอกคนให้รู้ภายในไม่กี่นาทีว่าเครื่องหลักหาย** แล้วให้คนไปแก้
 * ไม่ต้องใช้ฐานข้อมูล ไม่ต้องตัดสินใจแทนใคร และอ่านจบใน 5 นาที
 */

/** ตรวจทุกกี่นาที */
export const CHECK_EVERY_MIN = 5;

/** ต้องพลาดติดกันกี่ครั้งถึงจะเชื่อว่าดับจริง — กันเน็ตกระตุกชั่วครู่ */
export const FAILS_TO_ALARM = 3;

/**
 * ดับยาว ๆ ให้เตือนซ้ำทุกกี่นาที — 3 วันโดยไม่มีใครเตือนซ้ำคือสิ่งที่เคยเกิด
 *
 * เดิม 12 ชม. · เปลี่ยนเป็นวันละครั้งตามที่ผู้ใช้สั่ง (30 ก.ย. 2569) เพราะของจริงกลายเป็นว่า
 * **คนที่ได้ข้อความแก้เองไม่ได้** (ต้องรอเจ้าของกล่อง ดู T1.299) เตือนวันละสองครั้งจึงเป็นเสียงรบกวน
 * ที่ทำให้คนเลิกอ่าน — ซึ่งอันตรายกว่าการเตือนน้อยลงหนึ่งครั้งต่อวัน
 * ปรับต่อได้ที่ `PRIMARY_REMIND_MIN` / `FLOW_REMIND_MIN` ใน `.env` โดยไม่ต้องแก้โค้ด
 */
export const REMIND_EVERY_MIN = 1440;

/** สถานะตั้งต้นตอนยังไม่เคยตรวจ */
export const EMPTY = { status: "unknown", fails: 0, firstFailAt: null, lastNotifyAt: null, lastCheckAt: null };

const minutesBetween = (a, b) => (new Date(a).getTime() - new Date(b).getTime()) / 60000;

/** ถึงเวลาตรวจรอบใหม่หรือยัง */
export function shouldCheck(state, now = new Date(), everyMinutes = CHECK_EVERY_MIN) {
  if (!state?.lastCheckAt) return true;
  return minutesBetween(now, state.lastCheckAt) >= everyMinutes;
}

/**
 * ผลตรวจรอบนี้แปลว่าอะไร และต้องบอกใครไหม
 *
 * @param {object} state  สถานะเดิม (รูปเดียวกับ EMPTY)
 * @param {boolean} ok    รอบนี้เครื่องหลักตอบไหม
 * @param {Date} now
 * @param {object} [opt]  { failsToAlarm, remindEveryMin }
 * @returns {{state: object, notify: null|"down"|"still"|"up", downSince: string|null}}
 *
 * `still` = ยังดับอยู่และถึงรอบเตือนซ้ำ · ต่างจาก `down` ที่เป็นครั้งแรก
 * แยกกันเพราะข้อความต้องต่างกัน — ครั้งแรกคือ "เพิ่งเกิด" ครั้งหลังคือ "ยังไม่มีใครแก้"
 */
export function decide(state, ok, now = new Date(), opt = {}) {
  const failsToAlarm = opt.failsToAlarm ?? FAILS_TO_ALARM;
  const remindEveryMin = opt.remindEveryMin ?? REMIND_EVERY_MIN;
  const cur = { ...EMPTY, ...(state ?? {}) };
  const at = new Date(now).toISOString();

  if (ok) {
    /* กลับมาแล้ว — บอกเฉพาะตอนที่เคยประกาศว่าดับไปแล้วเท่านั้น
       ถ้ายังไม่เคยประกาศ (พลาดไปหนึ่งครั้งแล้วกลับมาเอง) ก็ไม่ต้องรบกวนใคร */
    const wasDown = cur.status === "down";
    return {
      state: { status: "up", fails: 0, firstFailAt: null, lastNotifyAt: wasDown ? at : cur.lastNotifyAt, lastCheckAt: at },
      notify: wasDown ? "up" : null,
      downSince: wasDown ? cur.firstFailAt : null,
    };
  }

  const fails = cur.fails + 1;
  const firstFailAt = cur.firstFailAt ?? at;

  /* ยังไม่ครบจำนวนครั้งที่เชื่อได้ — นับไว้เฉย ๆ ยังไม่บอกใคร */
  if (cur.status !== "down" && fails < failsToAlarm) {
    return {
      state: { ...cur, status: cur.status === "unknown" ? "unknown" : cur.status, fails, firstFailAt, lastCheckAt: at },
      notify: null,
      downSince: firstFailAt,
    };
  }

  /* เพิ่งประกาศว่าดับ */
  if (cur.status !== "down") {
    return {
      state: { status: "down", fails, firstFailAt, lastNotifyAt: at, lastCheckAt: at },
      notify: "down",
      downSince: firstFailAt,
    };
  }

  /* ดับอยู่แล้ว — เตือนซ้ำเมื่อถึงรอบ ไม่ใช่ทุกรอบตรวจ (โควตาไลน์มีจำกัด) */
  const due = !cur.lastNotifyAt || minutesBetween(now, cur.lastNotifyAt) >= remindEveryMin;
  return {
    state: { status: "down", fails, firstFailAt, lastNotifyAt: due ? at : cur.lastNotifyAt, lastCheckAt: at },
    notify: due ? "still" : null,
    downSince: firstFailAt,
  };
}

/** "3 วัน 2 ชั่วโมง" — บอกความยาวให้คนตัดสินใจได้ว่าเรื่องใหญ่แค่ไหน */
export function humanGap(fromISO, now = new Date()) {
  if (!fromISO) return null;
  const mins = Math.max(0, Math.round(minutesBetween(now, fromISO)));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d} วัน ${h} ชั่วโมง`;
  if (h > 0) return `${h} ชั่วโมง ${m} นาที`;
  return `${m} นาที`;
}

/**
 * ข้อความที่ส่งเข้าไลน์ — สั้น บอกผลกระทบ และบอกว่าต้องทำอะไร
 *
 * ★ ต้องเขียนว่า "การแจ้งเตือนหยุดทำงาน" ให้ชัด ไม่ใช่แค่ "เซิร์ฟเวอร์ดับ"
 *   เพราะคนอ่านต้องรู้ว่าตั้งแต่นี้ไป **ความเงียบไม่ได้แปลว่าปกติ**
 */
export function watchdogMessage(kind, { name, downSince, now = new Date(), owner = null } = {}) {
  const who = name || "เครื่องหลัก";
  /* ★ คนที่ดูแลแดชบอร์ด **ไม่มีสิทธิ์เปิดกล่องเอง** (ผู้ใช้ยืนยัน 30 ก.ย. 2569)
     ข้อความที่สั่งให้ "ไปเปิดเครื่อง" จึงสั่งสิ่งที่คนอ่านทำไม่ได้ และทำให้ดูเหมือนเขาเพิกเฉย
     ทั้งที่ทำอะไรไม่ได้จริง ๆ — ต้องบอกให้ไป **แจ้งคนที่มีสิทธิ์** แทน
     ตั้งชื่อ/ช่องทางติดต่อได้ที่ PRIMARY_OWNER ใน .env */
  const todo = owner
    ? `ที่ต้องทำ: แจ้ง${owner} ให้เปิด${who} กลับมา`
    : `ที่ต้องทำ: แจ้งผู้ดูแล${who} ให้เปิดกลับมา (คนดูแลแดชบอร์ดไม่มีสิทธิ์เปิดเอง)`;
  const gap = humanGap(downSince, now);

  if (kind === "down" || kind === "still") {
    return {
      type: "text",
      text: [
        kind === "down" ? `⚠ ${who} ไม่ตอบแล้ว` : `⚠ ${who} ยังไม่กลับมา`,
        gap ? `เงียบมา ${gap}` : null,
        "",
        /* ★ ห้ามใช้ markdown — LINE แสดงข้อความล้วน ดอกจันจะโผล่เป็นตัวอักษรจริง */
        "ระหว่างนี้ระบบไม่ส่งแจ้งเตือนอุณหภูมิและแก๊สให้เลย",
        "ถ้าไม่มีข้อความเข้ามา ไม่ได้แปลว่าทุกอย่างปกติ",
        "",
        todo,
        /* ★ ห้ามเขียนว่า "ข้อมูลไม่หาย" — ตัวเฝ้ารู้แค่ว่าเครื่องหลักไม่ตอบ
           มันไม่รู้ว่าเครื่องที่เก็บค่าดิบยังเก็บอยู่ไหม และ 26–27 ก.ย. 2569
           ปรากฏว่าเครื่องนั้นก็หลับไปด้วย ข้อมูลสองวันจึงเหลือ 0.2% ของปกติ
           สัญญาในสิ่งที่ตรวจไม่ได้ = ทำให้คนวางใจผิดที่ */
        "แล้วตรวจด้วยว่าเครื่องที่เก็บค่าเซนเซอร์ยังทำงานอยู่ — สองอย่างนี้เคยดับพร้อมกันมาแล้ว",
      ].filter((line) => line !== null).join("\n"),
    };
  }

  return {
    type: "text",
    text: [
      `✅ ${who} กลับมาแล้ว`,
      gap ? `ดับไปทั้งหมด ${gap}` : null,
      "การแจ้งเตือนกลับมาทำงานตามปกติ",
    ].filter(Boolean).join("\n"),
  };
}
