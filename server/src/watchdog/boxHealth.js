/**
 * กติกาของ "สมุดบันทึกสุขภาพกล่อง" (T1.308) — ฟังก์ชันล้วน ไม่ import อะไรเลย
 *
 * ═══ ทำไมต้องมี ═══
 * box-mew **เป็นคอนเทนเนอร์ ไม่ใช่เครื่องเซิร์ฟเวอร์** (ตรวจเองเมื่อ 5 ต.ค. 2569:
 * PID 1 คือ `sleep infinity` · มี `/.dockerenv` · ระบบไฟล์รากเป็น overlay · ไม่มี journald)
 *
 * ผลคือ **log ของระบบปฏิบัติการไม่มีอยู่จริงที่นี่** และทุกอย่างนอก `/home/dev`
 * ถูกล้างทุกครั้งที่คอนเทนเนอร์เริ่มใหม่ เราจึงไม่มีทางรู้เลยว่าตอนกล่องตายเกิดอะไรขึ้น
 * (เกิดจริง 2 ครั้งใน 10 วัน — 25 ก.ย. และ 4 ต.ค. ทั้งสองครั้งสืบสาเหตุไม่ได้)
 *
 * ไฟล์นี้จึงเก็บ "ชีพจร" ลง `/home/dev` ซึ่งเป็นที่เดียวที่รอด
 *
 * ═══ ★ สิ่งที่มันทำไม่ได้ และต้องรู้ไว้ ═══
 * ถ้าคอนเทนเนอร์ถูกสั่งหยุดจากเครื่องแม่ **เราจะไม่มีวันเห็นสาเหตุจากข้างใน**
 * ไม่ว่าจะเก็บละเอียดแค่ไหน — เพราะเหตุเกิดนอกกำแพงที่เรามองเห็น
 * สิ่งที่ไฟล์นี้ให้ได้คือ **แนวโน้มก่อนตาย** (แรมไต่ขึ้นไหม · โหลดพุ่งไหม · ดิสก์ใกล้เต็มไหม)
 * ซึ่งตอบได้ว่า "ตายเพราะตัวเองหรือถูกคนอื่นฆ่า" แค่นั้นก็ตัดความเป็นไปได้ไปได้ครึ่งหนึ่งแล้ว
 *
 * ═══ ★★★ กับดักที่พลาดมาแล้วและห้ามพลาดซ้ำ ★★★ ═══
 * **`/proc/meminfo` กับ `/proc/loadavg` ในคอนเทนเนอร์เป็นค่าของเครื่องแม่ ไม่ใช่ของกล่อง**
 * ตรวจจริง 5 ต.ค. 2569: `/proc/loadavg` บอก 2,333 งาน แต่นับในคอนเทนเนอร์จริงมี 29 โปรเซส
 * และ `/proc/meminfo` บอกแรม 31 GB ทั้งที่กล่องถูกจำกัดไว้ที่ **4 GB**
 *
 * ปล่อยไว้เมื่อไร สมุดจะเขียนว่า "เหลือ 20 GB สบายมาก" ในนาทีที่กล่องกำลังจะถูกฆ่าเพราะแรมหมด
 * (เป็นความผิดพลาดตระกูลเดียวกับการวัดดิสก์ในคอนเทนเนอร์ใน T1.297 — พลาดซ้ำรอยเดิม)
 *
 * **ค่าจริงของกล่องอยู่ใน cgroup v2** (`/sys/fs/cgroup/…`) และดีกว่าที่คาดไว้มาก:
 *   · `memory.max` / `memory.current` / `memory.peak` — ขีดจำกัดจริงและจุดสูงสุดที่เคยไปถึง
 *   · `memory.events` มี **`oom_kill`** = ตัวนับว่ามีโปรเซสถูกฆ่าเพราะแรมหมดกี่ครั้ง
 *     ★ นี่คือหลักฐานตรง ๆ ที่เคยคิดว่าหาไม่ได้จากข้างในคอนเทนเนอร์
 *   · `pids.current` / `pids.max` — เพดานจำนวนโปรเซส (ชนเมื่อไรเปิดงานใหม่ไม่ได้)
 *   · `cpu.stat` มี `nr_throttled` / `throttled_usec` — ถูกเบรกเพราะใช้ซีพียูเกินโควตากี่ครั้ง
 *
 * ค่าจาก `/proc` ยังเก็บไว้ แต่ **ใส่ไว้ใต้คีย์ `host` ให้ชัดว่าเป็นของเครื่องแม่**
 * เพราะมันก็มีประโยชน์: เครื่องแม่โหลดสูงคือเหตุผลหนึ่งที่คอนเทนเนอร์เราอาจถูกสั่งหยุด
 */

/** เก็บไว้กี่บรรทัดก่อนตัดของเก่าทิ้ง — นาทีละบรรทัด 20,000 บรรทัด ≈ 14 วัน */
export const KEEP_LINES = 20_000;

/** ตัดเมื่อไฟล์ใหญ่เกินนี้ (ไบต์) — กันไว้อีกชั้นเผื่อบรรทัดยาวผิดคาด */
export const MAX_BYTES = 8 * 1024 * 1024;

/** kB จาก /proc → MB จำนวนเต็ม (อ่านง่ายกว่าและไม่ต้องการความละเอียดกว่านี้) */
const mb = (kbText) => {
  const n = Number(kbText);
  return Number.isFinite(n) ? Math.round(n / 1024) : null;
};

/**
 * แกะ `/proc/meminfo` เอาเฉพาะบรรทัดที่ใช้จริง
 * @param {string} text เนื้อไฟล์ทั้งก้อน
 * @returns {{memTotal: number|null, memAvail: number|null, swapTotal: number|null, swapFree: number|null}}
 */
export function parseMeminfo(text) {
  const pick = (key) => {
    const m = String(text ?? "").match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
    return m ? mb(m[1]) : null;
  };
  return {
    memTotal: pick("MemTotal"),
    /* ★ ใช้ MemAvailable ไม่ใช่ MemFree — MemFree ไม่นับแคชที่ระบบคืนได้
       ทำให้ดูเหมือนแรมจะหมดตลอดเวลา ทั้งที่ยังมีให้ใช้อีกเยอะ */
    memAvail: pick("MemAvailable"),
    swapTotal: pick("SwapTotal"),
    swapFree: pick("SwapFree"),
  };
}

/**
 * แกะ `/proc/loadavg` → โหลด 1/5/15 นาที และจำนวนโปรเซส
 * รูปแบบ: "0.52 0.58 0.59 2/310 12345"
 */
export function parseLoadavg(text) {
  const p = String(text ?? "").trim().split(/\s+/);
  /* ★ ต้องกันช่องว่างก่อนแปลงเป็นตัวเลข — `Number("")` เท่ากับ **0** ไม่ใช่ NaN
     ปล่อยผ่านเมื่อไร "อ่านไม่ได้" จะกลายเป็น "โหลดเป็นศูนย์" ซึ่งแปลว่าเครื่องว่างสบาย
     ตรงข้ามกับความจริงพอดี (กับดักเดียวกับ `Number(null) === 0` ที่เจอใน T1.295) */
  const num = (i) => {
    const raw = String(p[i] ?? "").trim();
    return raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null;
  };
  const procs = String(p[3] ?? "").split("/");
  return {
    load1: num(0),
    load5: num(1),
    load15: num(2),
    running: Number(procs[0]) || null,
    procs: Number(procs[1]) || null,
  };
}

/** แกะ `/proc/uptime` → วินาทีที่คอนเทนเนอร์นี้เริ่มมา (จำนวนเต็ม) */
export function parseUptime(text) {
  const n = Number(String(text ?? "").trim().split(/\s+/)[0]);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * แกะไฟล์ cgroup ที่เป็นตัวเลขเดี่ยว — `"max"` แปลว่าไม่จำกัด จึงคืน null
 * ★ ห้ามคืน 0 เมื่ออ่านไม่ได้ ไม่งั้น "ไม่รู้" จะกลายเป็น "ไม่มีแรมเหลือ"
 */
export function cgNum(text) {
  const raw = String(text ?? "").trim();
  if (raw === "" || raw === "max") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** แกะไฟล์ cgroup แบบ "คีย์ ค่า" บรรทัดละคู่ เช่น `memory.events` และ `cpu.stat` */
export function cgKv(text) {
  const out = {};
  for (const line of String(text ?? "").split("\n")) {
    const [k, v] = line.trim().split(/\s+/);
    if (!k) continue;
    const n = Number(v);
    out[k] = Number.isFinite(n) ? n : null;
  }
  return out;
}

/** ไบต์ → MB จำนวนเต็ม (null ยังคงเป็น null) */
export const toMb = (bytes) => (bytes == null ? null : Math.round(bytes / 1048576));

/**
 * หนึ่งบรรทัดของสมุดบันทึก
 *
 * ★ **เป็น JSON หนึ่งบรรทัดต่อหนึ่งตัวอย่าง** ไม่ใช่ข้อความสวย ๆ
 *   เพราะคนที่มาอ่านทีหลังต้องเอาไปพล็อตกราฟหรือ grep ได้ทันที
 *   และบรรทัดที่เขียนไม่ครบ (ตอนถูกฆ่ากลางคัน) จะเสียแค่บรรทัดเดียว ไม่พังทั้งไฟล์
 */
export function sampleLine(raw, now = new Date()) {
  const {
    mem = {}, load = {}, uptime = null, zombies = null, disk = null, rss = null, cg = {},
  } = raw ?? {};

  const row = {
    t: now.toISOString(),
    up: uptime,

    /* ★ ค่าจริงของกล่องนี้ — มาจาก cgroup ไม่ใช่ /proc */
    memMb: toMb(cg.memCurrent),
    memMaxMb: toMb(cg.memMax),
    memPeakMb: toMb(cg.memPeak),
    oomKill: cg.oomKill ?? null,
    pids: cg.pidsCurrent ?? null,
    pidsMax: cg.pidsMax ?? null,
    cpuThrottled: cg.nrThrottled ?? null,
    cpuThrottledSec: cg.throttledUsec == null ? null : Math.round(cg.throttledUsec / 1e6),

    /* วัดเองในคอนเทนเนอร์ จึงเป็นของกล่องจริง */
    zombies,
    diskFreePct: disk,
    rssTop: rss,

    /* ★ ของเครื่องแม่ ไม่ใช่ของกล่อง — เก็บไว้เพราะเครื่องแม่แน่นก็เป็นเหตุให้เราถูกหยุดได้ */
    host: {
      load1: load.load1 ?? null,
      load5: load.load5 ?? null,
      tasks: load.procs ?? null,
      memTotalMb: mem.memTotal ?? null,
      memAvailMb: mem.memAvail ?? null,
    },
  };
  return `${JSON.stringify(row)}\n`;
}

/**
 * ตัดของเก่าทิ้งให้เหลือ `keep` บรรทัดท้าย
 *
 * ★ เก็บ **บรรทัดท้าย** ไม่ใช่บรรทัดแรก — ตอนสืบเหตุเราอยากได้ช่วงก่อนตายล่าสุด
 *   ไม่ใช่ตอนที่กล่องเพิ่งเริ่มใช้งานเมื่อหลายเดือนก่อน
 */
export function trimKeep(text, keep = KEEP_LINES) {
  const lines = String(text ?? "").split("\n").filter(Boolean);
  if (lines.length <= keep) return null;
  return `${lines.slice(-keep).join("\n")}\n`;
}

/** ถึงเวลาตัดหรือยัง — ดูทั้งขนาดไฟล์และจำนวนบรรทัดโดยประมาณ */
export const shouldTrim = (bytes, maxBytes = MAX_BYTES) => Number(bytes) > maxBytes;
