/**
 * ตัวเฝ้าระวัง "เครื่องหลักยังอยู่ไหม" (T1.285) — ตัวรันจริง
 *
 * ═══ กฎข้อเดียวที่ห้ามละเมิด ═══
 * **ห้ามใช้ฐานข้อมูล** ทั้งไฟล์นี้และ rules.js
 * เพราะสิ่งที่มันเฝ้าอยู่คือเครื่องที่ฐานข้อมูลอยู่ — ถ้ามันต้องพึ่งฐาน มันจะตายพร้อมกัน
 * สถานะจึงเก็บเป็นไฟล์เล็ก ๆ ในเครื่อง และการส่งไลน์ยิงตรงไป api.line.me ไม่ผ่านอะไรเลย
 *
 * ═══ ต้องรันที่ไหน ═══
 * รันบน **เครื่องที่ไม่ใช่เครื่องหลัก** โดยตั้ง `PRIMARY_HEALTH_URL` ไว้เท่านั้น
 * ไม่ตั้ง = ไม่ทำงานเลย (เครื่องหลักจึงไม่เฝ้าตัวเอง ซึ่งไม่มีประโยชน์อะไร)
 * วันนี้คือเครื่องที่รันสะพานบทบาท `sync` — เครื่องเดียวกับที่อ่าน InfluxDB
 *
 * ═══ เรื่องโควตา ═══
 * ส่งเฉพาะตอน **เปลี่ยนสถานะ** (เพิ่งดับ / กลับมา) และเตือนซ้ำอย่างมากทุก 12 ชม.
 * ดับยาว 3 วันจึงเสียโควตาราว 7 ข้อความ จาก 300/เดือน
 */
import { readFile, writeFile } from "node:fs/promises";
import { log } from "../lib/log.js";
import { sendLine } from "../line/client.js";
import { CHECK_EVERY_MIN, EMPTY, REMIND_EVERY_MIN, decide, shouldCheck, watchdogMessage } from "./rules.js";

const TIMEOUT_MS = 15_000;

const url = () => (process.env.PRIMARY_HEALTH_URL || "").trim();
const name = () => (process.env.PRIMARY_NAME || "").trim() || "เครื่องหลัก";
/** ใครมีสิทธิ์เปิดเครื่องหลัก — ใส่ชื่อทีม/ช่องทางติดต่อได้ เช่น "ทีม PlotNexus" */
const owner = () => (process.env.PRIMARY_OWNER || "").trim() || null;
const statePath = () =>
  (process.env.PRIMARY_STATE_FILE || "").trim() || "/tmp/swine-primary-watch.json";
const everyMin = () => Number(process.env.PRIMARY_CHECK_MIN || CHECK_EVERY_MIN);
/** ดับยาวแล้วเตือนซ้ำทุกกี่นาที — ค่าตั้งต้นวันละครั้ง */
const remindMin = () => Number(process.env.PRIMARY_REMIND_MIN || REMIND_EVERY_MIN);

/**
 * ★ ตัวเฝ้าใช้สวิตช์ของตัวเอง **ไม่ใช่ `LINE_NOTIFY`** — จงใจ
 *
 * `LINE_NOTIFY=0` แปลว่า "เครื่องนี้ไม่ใช่เครื่องที่ส่งแจ้งเตือน" ซึ่งตั้งไว้กันส่งซ้ำ
 * แต่ตัวเฝ้า**ต้องรันบนเครื่องที่ไม่ใช่เครื่องแจ้งเตือนเท่านั้น** (เครื่องหลักรายงานการตายของ
 * ตัวเองไม่ได้) ถ้าผูกสองอย่างนี้เข้าด้วยกัน ตัวเฝ้าจะเงียบตลอดไปบนเครื่องเดียวที่ควรพูด
 * — และเงียบแบบที่ไม่มีใครรู้ว่ามันเงียบ ซึ่งคือปัญหาเดิมที่เรากำลังแก้อยู่พอดี
 *
 * ยังเคารพ `LINE_DRY_RUN` อยู่ (sendLine เป็นคนจัดการ) จึงซ้อมได้โดยไม่ส่งออกจริง
 */
const notifyEnabled = () => (process.env.PRIMARY_WATCH_NOTIFY ?? "1") !== "0";

/** เปิดใช้ตัวเฝ้าไหม — ไม่ตั้งที่อยู่ = ไม่ทำงาน ไม่ใช่ error */
export const watchEnabled = () => url().length > 0;

async function readState() {
  try {
    return JSON.parse(await readFile(statePath(), "utf8"));
  } catch {
    /* ไฟล์หายหรืออ่านไม่ออก = เริ่มนับใหม่ อย่างมากคือเตือนซ้ำหนึ่งครั้ง ไม่ใช่เรื่องใหญ่ */
    return { ...EMPTY };
  }
}

async function writeState(state) {
  try {
    await writeFile(statePath(), JSON.stringify(state), "utf8");
  } catch (err) {
    /* เขียนไม่ได้ก็ยังทำงานต่อได้ (สถานะกลับเป็นค่าตั้งต้นทุกครั้ง = เตือนซ้ำบ่อยขึ้น)
       จึงเตือนใน log ให้คนไปแก้ แต่ไม่ล้มทั้งรอบ */
    log.warn({ err: err.message, ไฟล์: statePath() }, "ตัวเฝ้าเครื่องหลักเขียนไฟล์สถานะไม่ได้");
  }
}

/**
 * เครื่องหลักตอบไหม
 *
 * นับว่า "ตอบ" เฉพาะเมื่อได้ HTTP 2xx เท่านั้น — 503 จาก Cloudflare แปลว่า
 * ขอบนอกยังอยู่แต่ต้นทางตาย ซึ่งคือสิ่งที่เราต้องจับให้ได้พอดี (เจอจริง 28 ก.ย. 2569)
 */
export async function probePrimary() {
  try {
    const res = await fetch(url(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ok: res.ok, reason: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * หนึ่งรอบของตัวเฝ้า — เรียกได้บ่อยเท่าไรก็ได้ ข้างในคุมความถี่เอง
 * **ต้องไม่โยน error ออกไป** ไม่งั้นมันจะไปล้มงานอื่นในรอบเดียวกัน
 */
export async function runPrimaryWatch(now = new Date()) {
  if (!watchEnabled()) return { skipped: "ไม่ได้ตั้ง PRIMARY_HEALTH_URL" };

  try {
    const state = await readState();
    if (!shouldCheck(state, now, everyMin())) return { skipped: "ยังไม่ถึงรอบตรวจ" };

    const probe = await probePrimary();
    const r = decide(state, probe.ok, now, { remindEveryMin: remindMin() });
    await writeState(r.state);

    if (!r.notify) return { ok: probe.ok, notify: null };

    if (!notifyEnabled()) {
      log.warn(
        { ชนิด: r.notify, สถานะ: r.state.status },
        "ตัวเฝ้าเครื่องหลักมีเรื่องจะบอก แต่ปิดการส่งไว้ที่ PRIMARY_WATCH_NOTIFY=0",
      );
      return { ok: probe.ok, notify: r.notify, sent: false };
    }

    const out = await sendLine(
      watchdogMessage(r.notify, { name: name(), downSince: r.downSince, now, owner: owner() }),
    );
    log.warn(
      { ชนิด: r.notify, เหตุ: probe.reason, ดับตั้งแต่: r.downSince, ส่งแล้ว: out.sent },
      r.notify === "up" ? "เครื่องหลักกลับมาแล้ว" : "เครื่องหลักไม่ตอบ",
    );
    return { ok: probe.ok, notify: r.notify, sent: out.sent };
  } catch (err) {
    log.error({ err: err.message }, "ตัวเฝ้าเครื่องหลักทำงานผิดพลาด — ข้ามรอบนี้");
    return { error: err.message };
  }
}
