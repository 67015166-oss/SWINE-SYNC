/**
 * สมุดบันทึกสุขภาพกล่อง (T1.308) — ตัวที่อ่าน /proc แล้วเขียนไฟล์จริง
 *
 * กติกาอยู่ใน `boxHealth.js` (ฟังก์ชันล้วน ทดสอบได้) ไฟล์นี้ทำแค่ I/O
 *
 * ═══ ทำไมฝากไว้กับสะพานข้อมูล ไม่ตั้งโปรเซสใหม่ ═══
 * `autostart.sh` ที่เปิดโปรแกรมในกล่อง **อยู่นอก repo** (อยู่ที่ `/home/dev` ของกล่อง)
 * ถ้าต้องเพิ่มโปรเซสใหม่ ต้องไปแก้ไฟล์นั้นด้วยมือทุกครั้งที่สร้างกล่องใหม่ ซึ่งจะถูกลืม
 * ฝากไว้กับสะพานแล้วมันติดไปกับการ deploy ปกติ ไม่มีขั้นตอนพิเศษให้ลืม
 *
 * ★ ผลข้างเคียงที่ยอมรับ: สะพานตายเมื่อไร สมุดก็หยุดเขียน
 *   แต่กรณีที่เราอยากสืบคือ "ทั้งกล่องถูกหยุด" ซึ่งสะพานก็ตายอยู่ดี จึงไม่เสียอะไร
 *   และ "สมุดหยุดเขียนตอนไหน" เองก็เป็นข้อมูลว่ากล่องตายตอนไหน
 *
 * ═══ เปิดใช้เมื่อไร ═══
 * เขียนเฉพาะเมื่อมีโฟลเดอร์ปลายทางอยู่จริง — บนกล่องคือ `/home/dev` ซึ่งเป็น
 * **ที่เดียวที่รอดการเริ่มคอนเทนเนอร์ใหม่** ส่วนบนเครื่องผู้พัฒนาไม่มีโฟลเดอร์นี้ จึงข้ามไปเอง
 * ไม่ต้องตั้ง env ไม่ต้องแก้ config ที่ไหน
 */
import { appendFile, readFile, stat, statfs, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { log } from "../lib/log.js";
import { cgKv, cgNum, parseLoadavg, parseMeminfo, parseUptime, sampleLine, shouldTrim, trimKeep } from "./boxHealth.js";

const filePath = () =>
  (process.env.BOX_HEALTH_FILE || "").trim() || "/home/dev/boxhealth.log";

/** บันทึกทุกกี่นาที — นาทีละครั้งพอเห็นแนวโน้ม และเบาจนไม่ต้องคิดเรื่องภาระเครื่อง */
const everyMin = () => Number(process.env.BOX_HEALTH_MIN || 1);

/** เปิดใช้ไหม — ไม่มีโฟลเดอร์ปลายทาง = ไม่ใช่เครื่องที่ต้องเก็บ (ไม่ใช่ error) */
export const recorderEnabled = () => {
  if ((process.env.BOX_HEALTH || "1") === "0") return false;
  try {
    return existsSync(dirname(filePath()));
  } catch {
    return false;
  }
};

let lastAt = 0;

/** นับโปรเซสที่ตายแล้วแต่ยังไม่ถูกเก็บศพ — สัญญาณว่าเครื่องเริ่มเปิดงานใหม่ไม่ไหว */
async function zombieCount() {
  try {
    const { readdir } = await import("node:fs/promises");
    const pids = (await readdir("/proc")).filter((d) => /^\d+$/.test(d));
    let n = 0;
    for (const pid of pids) {
      try {
        /* ฟิลด์ที่ 3 ของ /proc/<pid>/stat คือสถานะ — ชื่อโปรเซสมีวงเล็บครอบและอาจมีช่องว่าง
           จึงตัดถึงวงเล็บปิดตัวสุดท้ายก่อน ไม่ใช่ split ด้วยช่องว่างตรง ๆ */
        const s = await readFile(`/proc/${pid}/stat`, "utf8");
        if (s.slice(s.lastIndexOf(")") + 2, s.lastIndexOf(")") + 3) === "Z") n += 1;
      } catch { /* โปรเซสหายไประหว่างอ่าน — ปกติ ไม่ใช่ error */ }
    }
    return n;
  } catch {
    return null;
  }
}

/** สัดส่วนที่ว่างของดิสก์ปลายทาง — ใช้สัดส่วน ไม่ใช่ไบต์ ด้วยเหตุผลเดียวกับ flowRules.js */
async function diskFreePct() {
  try {
    const st = await statfs(dirname(filePath()));
    if (!st.blocks) return null;
    return Math.round((st.bavail / st.blocks) * 1000) / 10;
  } catch {
    return null;
  }
}

/** แรมที่โปรเซส node ของเราใช้ (MB) เรียงมากไปน้อย สูงสุด 3 ตัว */
async function rssTop() {
  try {
    const { readdir } = await import("node:fs/promises");
    const pids = (await readdir("/proc")).filter((d) => /^\d+$/.test(d));
    const rows = [];
    for (const pid of pids) {
      try {
        /* `cmdline` คั่นอาร์กิวเมนต์ด้วยไบต์ศูนย์ — ใช้ split แทน regex
           เพื่อเลี่ยงการเขียนอักขระควบคุมลงใน regex (lint เตือนถูกแล้ว) */
        const cmd = (await readFile(`/proc/${pid}/cmdline`, "utf8")).split("\u0000").join(" ").trim();
        if (!cmd.startsWith("node")) continue;
        const statm = (await readFile(`/proc/${pid}/statm`, "utf8")).trim().split(/\s+/);
        const pages = Number(statm[1]);
        if (!Number.isFinite(pages)) continue;
        rows.push({ pid: Number(pid), mb: Math.round((pages * 4096) / 1048576), cmd: cmd.slice(0, 40) });
      } catch { /* เหมือนข้างบน */ }
    }
    return rows.sort((a, b) => b.mb - a.mb).slice(0, 3);
  } catch {
    return null;
  }
}

async function readProc(name) {
  try {
    return await readFile(`/proc/${name}`, "utf8");
  } catch {
    return "";
  }
}

const CGROUP = "/sys/fs/cgroup";

/**
 * ค่าจริงของคอนเทนเนอร์นี้จาก cgroup v2
 *
 * ★ **นี่คือตัวเลขที่ถูกต้อง ไม่ใช่ `/proc`** — `/proc` ในคอนเทนเนอร์เป็นของเครื่องแม่
 *   (เจอจริง 5 ต.ค. 2569: /proc บอกแรม 31 GB แต่กล่องถูกจำกัดไว้ที่ 4 GB)
 *
 * อ่านไม่ได้ทั้งก้อน = ไม่ใช่ cgroup v2 หรือไม่ใช่คอนเทนเนอร์ → คืนค่าว่าง ไม่ใช่ error
 */
async function readCgroup() {
  const one = async (f) => {
    try {
      return cgNum(await readFile(`${CGROUP}/${f}`, "utf8"));
    } catch {
      return null;
    }
  };
  const kv = async (f) => {
    try {
      return cgKv(await readFile(`${CGROUP}/${f}`, "utf8"));
    } catch {
      return {};
    }
  };

  const [memCurrent, memMax, memPeak, pidsCurrent, pidsMax, events, cpu] = await Promise.all([
    one("memory.current"), one("memory.max"), one("memory.peak"),
    one("pids.current"), one("pids.max"), kv("memory.events"), kv("cpu.stat"),
  ]);

  return {
    memCurrent, memMax, memPeak, pidsCurrent, pidsMax,
    /* ★ ตัวนับว่ามีโปรเซสถูกฆ่าเพราะแรมหมดกี่ครั้ง — หลักฐานตรง ๆ ที่เคยคิดว่าหาไม่ได้ */
    oomKill: events.oom_kill ?? null,
    nrThrottled: cpu.nr_throttled ?? null,
    throttledUsec: cpu.throttled_usec ?? null,
  };
}

/** ตัดของเก่าทิ้งเมื่อไฟล์ใหญ่เกิน — ทำเท่าที่จำเป็น ไม่ใช่ทุกรอบ */
async function trimIfBig(path) {
  try {
    const { size } = await stat(path);
    if (!shouldTrim(size)) return;
    const next = trimKeep(await readFile(path, "utf8"));
    if (next) await writeFile(path, next, "utf8");
  } catch { /* ไฟล์ยังไม่มีก็ไม่ต้องตัด */ }
}

/**
 * หนึ่งรอบ — เรียกบ่อยแค่ไหนก็ได้ ข้างในคุมความถี่เอง · **ห้ามโยน error ออกไป**
 *
 * สมุดบันทึกต้องไม่มีวันทำให้สะพานข้อมูลล้ม — มันเป็นของที่มีไว้เผื่อ
 * ไม่ใช่ของที่ระบบต้องพึ่งเพื่อทำงาน
 */
export async function runBoxRecorder(now = new Date()) {
  if (!recorderEnabled()) return { skipped: "ไม่มีโฟลเดอร์ปลายทาง" };
  if (now.getTime() - lastAt < everyMin() * 60_000) return { skipped: "ยังไม่ถึงรอบ" };
  lastAt = now.getTime();

  try {
    const [meminfo, loadavg, uptime, zombies, disk, rss, cg] = await Promise.all([
      readProc("meminfo"),
      readProc("loadavg"),
      readProc("uptime"),
      zombieCount(),
      diskFreePct(),
      rssTop(),
      readCgroup(),
    ]);

    const path = filePath();
    await appendFile(
      path,
      sampleLine({
        mem: parseMeminfo(meminfo),
        load: parseLoadavg(loadavg),
        uptime: parseUptime(uptime),
        zombies,
        disk,
        rss,
        cg,
      }, now),
      "utf8",
    );
    await trimIfBig(path);
    return { ok: true };
  } catch (err) {
    log.warn({ err: err.message }, "สมุดบันทึกสุขภาพกล่องเขียนไม่ได้ — ข้ามรอบนี้");
    return { error: err.message };
  }
}
