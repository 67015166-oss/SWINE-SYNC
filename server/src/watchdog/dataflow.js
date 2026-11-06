/**
 * ตัวเฝ้าระวัง "ข้อมูลยังไหลอยู่ไหม" (T1.295) — ตัวรันจริง
 *
 * ═══ กฎเดียวกับตัวเฝ้าเครื่องหลัก ═══
 * **ห้ามใช้ฐานข้อมูล** — ฐานอยู่บนกล่องที่ดับบ่อย และ 28–29 ก.ย. 2569 กล่องดับ
 * กับข้อมูลหยุดไหล **เกิดพร้อมกัน** ตัวเฝ้าที่พึ่งฐานจะเงียบในวันที่ต้องพูดที่สุด
 * สถานะเก็บเป็นไฟล์ · ส่งไลน์ยิงตรง api.line.me
 *
 * ═══ ต้องรันที่ไหน ═══
 * บนเครื่องที่อ่าน InfluxDB ได้ = เครื่องที่รันสะพานบทบาท `sync` (วันนี้คือเครื่องผู้พัฒนา)
 * ไม่ได้ตั้ง `INFLUX_URL` = ไม่ทำงาน ไม่ใช่ error
 *
 * ★ ต้องเป็นคนละเครื่องกับต้นทางข้อมูลไม่ได้ — วันนี้ Node-RED กับตัวเฝ้าอยู่เครื่องเดียวกัน
 *   ถ้าเครื่องนี้หลับทั้งเครื่อง ตัวเฝ้าก็หลับด้วยและจะไม่มีใครบอก
 *   **ตัวที่กันเคสนั้นคือตัวเฝ้าเครื่องหลักที่รันอยู่คนละเครื่อง (T1.285)** — สองตัวนี้เฝ้ากันไขว้
 *   จึงเหลือรูเดียวคือ "ทั้งสองเครื่องดับพร้อมกัน" ซึ่งอย่างน้อยก็ดังทางไลน์จากฝั่งใดฝั่งหนึ่งก่อนเสมอ
 *
 * ═══ เรื่องโควตาไลน์ ═══
 * ใช้กติกาเดียวกับ T1.285 — ส่งตอนเปลี่ยนสถานะ และเตือนซ้ำอย่างมากทุก 12 ชม.
 */
import { readFile, statfs, writeFile } from "node:fs/promises";
import { log } from "../lib/log.js";
import { sendLine } from "../line/client.js";
import { lastReadings } from "../bridge/influx.js";
import { CHECK_EVERY_MIN, EMPTY, REMIND_EVERY_MIN, decide, humanGap, shouldCheck } from "./rules.js";
import { MAX_AGE_MIN, MIN_FREE_PCT, checkDisk, classifyFlow, flowMessage } from "./flowRules.js";

const statePath = () =>
  (process.env.FLOW_STATE_FILE || "").trim() || "/tmp/swine-dataflow-watch.json";
const everyMin = () => Number(process.env.FLOW_CHECK_MIN || CHECK_EVERY_MIN);
const maxAgeMin = () => Number(process.env.FLOW_MAX_AGE_MIN || MAX_AGE_MIN);
const minFreePct = () => Number(process.env.FLOW_MIN_DISK_PCT || MIN_FREE_PCT);
const remindMin = () => Number(process.env.FLOW_REMIND_MIN || REMIND_EVERY_MIN);

/**
 * โฟลเดอร์ที่ใช้วัดที่ว่างของดิสก์ — ต้องเป็นโฟลเดอร์ที่**ผูกมาจากเครื่องจริง**
 *
 * ★ ในคอนเทนเนอร์ `/` คือดิสก์ของ Docker ไม่ใช่ของเครื่อง — วัดจากตรงนั้นได้ตัวเลขที่ดูสบายใจ
 *   แต่ผิด (ตรวจจริง 30 ก.ย. 2569: ในคอนเทนเนอร์เห็นว่าง 416 GB ขณะที่เครื่องเหลือจริง 7.8 GB)
 *   compose จึงผูก `./docs` เข้ามาที่ `/hostdisk` แบบอ่านอย่างเดียวไว้ให้วัด
 * ไม่ได้ตั้ง = ข้ามการตรวจดิสก์ไปเฉย ๆ (ไม่ใช่ error)
 */
const diskPath = () => (process.env.FLOW_DISK_PATH || "").trim();

async function freeSpace() {
  const path = diskPath();
  if (!path) return null;
  try {
    const st = await statfs(path);
    /* ★ คืนเป็น "จำนวนบล็อก" ไม่ใช่ไบต์ — `bsize` ในคอนเทนเนอร์ไม่ตรงกับบล็อกจริง
       (เห็นเอง 30 ก.ย. 2569: คูณแล้วได้ว่าง 1,987 GB ทั้งที่เครื่องเหลือ 7.8 GB) */
    return { avail: st.bavail, total: st.blocks };
  } catch (err) {
    log.warn({ err: err.message, path }, "ตัวเฝ้าข้อมูลอ่านที่ว่างของดิสก์ไม่ได้");
    return null;
  }
}

/** สวิตช์ของตัวเอง ไม่ผูกกับ `LINE_NOTIFY` — เหตุผลเดียวกับ watchdog/primary.js */
const notifyEnabled = () => (process.env.FLOW_WATCH_NOTIFY ?? "1") !== "0";

/** เปิดใช้ไหม — เครื่องที่ไม่มี InfluxDB ให้อ่านก็เฝ้าไม่ได้ */
export const flowWatchEnabled = () => (process.env.INFLUX_URL || "").trim().length > 0;

async function readState() {
  try {
    return JSON.parse(await readFile(statePath(), "utf8"));
  } catch {
    return { ...EMPTY };
  }
}

async function writeState(state) {
  try {
    await writeFile(statePath(), JSON.stringify(state), "utf8");
  } catch (err) {
    log.warn({ err: err.message, ไฟล์: statePath() }, "ตัวเฝ้าข้อมูลเขียนไฟล์สถานะไม่ได้");
  }
}

/**
 * ดูว่าข้อมูลยังไหลอยู่ไหม
 *
 * ★ ต่อ InfluxDB ไม่ได้ **ไม่นับว่าข้อมูลหยุดไหล** — คนละเรื่องกัน และถ้านับรวมกัน
 *   ข้อความจะพาไปแก้ผิดที่ (ไปไล่ Node-RED ทั้งที่ Influx ต่างหากที่ล่ม)
 *   กรณีนั้นคืน `probeFailed` ให้ผู้เรียกข้ามรอบไปเฉย ๆ แล้วบันทึกไว้ใน log
 */
export async function probeFlow(now = new Date()) {
  /* วัดดิสก์ไม่ได้ = ไม่ตัดสิน ดีกว่าเตือนผิด (กติกาเดียวกับ checkDisk) */
  let disk = { ok: true, reason: null, freePct: null };
  try {
    disk = checkDisk(await freeSpace(), { minFreePct: minFreePct() });
  } catch { /* ข้ามไป ใช้ค่าตั้งต้นที่ไม่ตัดสิน */ }

  /* ★★ ตรวจอายุข้อมูล **ทุกรอบ** ไม่ว่าดิสก์จะผ่านหรือไม่ (T1.317)
     ของเดิมคืนค่าทันทีเมื่อดิสก์ไม่ผ่าน จึงไม่เคยได้วัดอายุข้อมูลเลย
     ผลคือช่วงที่ดิสก์ใกล้เต็ม (8 วันเต็มตั้งแต่ 30 ก.ย. 2569) **ตัวเฝ้ามองไม่เห็น
     ว่าท่อข้อมูลเป็นอย่างไร** — ถ้าท่อตายจริงในช่วงนั้นก็ยังรายงานแค่ว่าดิสก์เหลือน้อย
     ไม่มีใครรู้ว่าข้อมูลหยุด ซึ่งคือเหตุการณ์ 29 ก.ย. ที่เงียบไป 34 ชั่วโมง
     และเป็นเหตุผลที่สร้างตัวเฝ้านี้ขึ้นมาตั้งแต่ต้น (เห็นได้จาก lastDataAt: null ในแฟ้มสถานะ) */
  let flow = null;
  let readErr = null;
  try {
    flow = classifyFlow(await lastReadings(), now, { maxAgeMin: maxAgeMin() });
  } catch (err) {
    readErr = err.message;
  }

  if (readErr) {
    /* ★ อ่าน InfluxDB ไม่ได้ แต่ถ้ารู้อยู่แล้วว่าดิสก์ใกล้เต็ม ต้องรายงานเรื่องนั้นต่อ
       ไม่ใช่ข้ามรอบไปเฉย ๆ — ไม่งั้นคำเตือนเรื่องดิสก์จะหายไปตอนที่ต้องการที่สุด */
    if (!disk.ok) {
      return {
        probeFailed: false, ok: false, kind: "disk",
        reason: `${disk.reason} · และอ่าน InfluxDB ไม่ได้ด้วย`,
        ageMin: null, lastAt: null, freePct: disk.freePct,
      };
    }
    return { probeFailed: true, ok: false, reason: readErr, kind: null, ageMin: null, lastAt: null };
  }

  /* ★ ท่อตายแล้ว **และ** ดิสก์ใกล้เต็ม — นำด้วยดิสก์เพราะเป็นสาเหตุที่น่าจะเป็น
     (28 ก.ย. 2569 Node-RED ขึ้น "Write to InfluxDB failed" ตอนดิสก์ใกล้เต็ม)
     ถ้ารายงานว่า "ไปดู Node-RED กับตู้ในฟาร์ม" คนจะไล่หาสาเหตุผิดทางอยู่นาน
     แต่ต้องบอกด้วยว่าข้อมูล**หยุดแล้ว** ไม่ใช่แค่ดิสก์เหลือน้อย เพราะสองอย่างนี้เร่งด่วนไม่เท่ากัน */
  if (!flow.ok && !disk.ok) {
    return {
      probeFailed: false, ok: false, kind: "disk",
      reason: `${disk.reason} — และข้อมูลหยุดไหลแล้ว: ${flow.reason}`,
      ageMin: flow.ageMin, lastAt: flow.lastAt, freePct: disk.freePct,
    };
  }

  if (!flow.ok) return { probeFailed: false, ...flow, freePct: disk.freePct };

  /* ★ ดิสก์ใกล้เต็มแต่ข้อมูลยังไหลอยู่ — **ต้องไม่พูดว่า "ข้อมูลหยุดไหล"**
     ของเดิมพูดอย่างนั้น ซึ่งยังไม่จริง คนอ่านจะตกใจผิดเรื่อง หรือไปเช็กแล้วพบว่า
     ข้อมูลไหลปกติ แล้วเลิกเชื่อการแจ้งเตือนทั้งระบบ ซึ่งแพงกว่าการไม่เตือนเลย */
  if (!disk.ok) {
    return {
      probeFailed: false, ok: false, kind: "disk",
      reason: `${disk.reason} — ข้อมูลยังไหลอยู่ปกติ แต่เต็มแล้วจะเขียนไม่ลงและข้อมูลหายเงียบ ๆ`,
      ageMin: flow.ageMin, lastAt: flow.lastAt, freePct: disk.freePct,
    };
  }

  return { probeFailed: false, ...flow, freePct: disk.freePct };
}

/**
 * หนึ่งรอบ — เรียกบ่อยแค่ไหนก็ได้ ข้างในคุมความถี่เอง · **ห้ามโยน error ออกไป**
 */
export async function runDataFlowWatch(now = new Date()) {
  if (!flowWatchEnabled()) return { skipped: "ไม่ได้ตั้ง INFLUX_URL" };

  try {
    const state = await readState();
    if (!shouldCheck(state, now, everyMin())) return { skipped: "ยังไม่ถึงรอบตรวจ" };

    const probe = await probeFlow(now);
    if (probe.probeFailed) {
      /* สถานะเดิมค้างไว้ตามเดิม ไม่นับเป็นพลาด — แต่ต้องมีร่องรอยว่าตรวจไม่ได้ */
      log.warn({ err: probe.reason }, "ตัวเฝ้าข้อมูลอ่าน InfluxDB ไม่ได้ — ข้ามรอบนี้");
      return { skipped: "อ่าน InfluxDB ไม่ได้", error: probe.reason };
    }

    const r = decide(state, probe.ok, now, { remindEveryMin: remindMin() });
    /* เก็บอาการล่าสุดไว้ในไฟล์สถานะด้วย เผื่อคนมาเปิดดูว่าตอนนั้นเกิดอะไร */
    await writeState({ ...r.state, lastReason: probe.reason, lastDataAt: probe.lastAt });

    if (!r.notify) return { ok: probe.ok, notify: null, ageMin: probe.ageMin };

    if (!notifyEnabled()) {
      log.warn(
        { ชนิด: r.notify, อาการ: probe.reason },
        "ตัวเฝ้าข้อมูลมีเรื่องจะบอก แต่ปิดการส่งไว้ที่ FLOW_WATCH_NOTIFY=0",
      );
      return { ok: probe.ok, notify: r.notify, sent: false };
    }

    const out = await sendLine(
      flowMessage(r.notify, { gap: humanGap(r.downSince, now), reason: probe.reason, kind: probe.kind }),
    );
    log.warn(
      { ชนิด: r.notify, อาการ: probe.reason, หยุดตั้งแต่: r.downSince, ค่าล่าสุด: probe.lastAt, ส่งแล้ว: out.sent },
      r.notify === "up" ? "ข้อมูลเซนเซอร์กลับมาไหลแล้ว" : "ข้อมูลเซนเซอร์หยุดไหล",
    );
    return { ok: probe.ok, notify: r.notify, sent: out.sent };
  } catch (err) {
    log.error({ err: err.message }, "ตัวเฝ้าข้อมูลทำงานผิดพลาด — ข้ามรอบนี้");
    return { error: err.message };
  }
}
