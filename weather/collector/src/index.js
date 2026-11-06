/**
 * ตัวเก็บข้อมูล — เดินอยู่ตลอดเวลา ดึงจากสองแหล่งพร้อมกันแล้วเก็บลงคลังของเรา
 *
 *   ฐานแดชบอร์ด/กล่อง box-mew (เซนเซอร์ที่ฟาร์ม)  ─┐
 *                                                  ├─►  TimescaleDB (obs · fcst)  ─►  Python
 *   Open-Meteo (อากาศภายนอก)                      ─┘
 *
 * (PlotNexus เคยเป็นแหล่งเซนเซอร์ ปิดไว้ตั้งแต่ 19 ต.ค. 2569 — ดู `sources/swine.js`)
 *
 * ═══ หลักการที่ห้ามละเมิด ═══
 * 1. **แหล่งหนึ่งล้ม อีกแหล่งต้องเดินต่อ** — สองแหล่งนี้ไม่เกี่ยวกันเลย
 *    ถ้ามัดรวมกันแล้วคลาวด์ของพี่เขาล่มสองวัน เราจะเสียข้อมูลอากาศไปด้วยทั้งที่
 *    Open-Meteo ยังทำงานปกติ ซึ่งไม่มีเหตุผลอะไรเลย
 * 2. **ล้มแล้วต้องบันทึกไว้ ไม่ใช่เงียบ** — ช่องว่างในข้อมูลที่ไม่รู้สาเหตุ
 *    ทำให้ตอนทำความสะอาดข้อมูลตัดสินใจไม่ได้ว่าควรเติมค่าหรือควรตัดช่วงนั้นทิ้ง
 * 3. **ไม่แตะข้อมูลของใคร** อ่านอย่างเดียวทั้งสองแหล่ง กุญแจ PlotNexus ที่ใช้
 *    ก็เป็นกุญแจอ่านอย่างเดียวอยู่แล้ว
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config, plotnexusReady, swineReady } from "./config.js";
import { pool, query, insertObs, insertFcst, logCollect, latestFromSource } from "./db.js";
import { fetchLatestRows } from "./sources/plotnexus.js";
import {
  fetchSince, closeSwinePool, SENSOR_MEASURES, POWER_MEASURES,
} from "./sources/swine.js";
import { fetchNowAndForecast } from "./sources/openmeteo.js";

const here = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(here, "..", "sql");

const stamp = () =>
  new Date().toLocaleString("th-TH", { timeZone: config.tz, hour12: false });
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const warn = (...a) => console.warn(`[${stamp()}] ⚠`, ...a);

/** รอจนฐานข้อมูลพร้อมรับคำสั่ง — คอนเทนเนอร์ฐานใช้เวลาบูตสักพัก */
async function waitForDb(tries = 30) {
  for (let i = 1; i <= tries; i++) {
    try {
      await query("select 1");
      return;
    } catch (err) {
      if (i === tries) throw err;
      log(`ยังต่อฐานไม่ได้ (ครั้งที่ ${i}/${tries}) — รอ 2 วินาทีแล้วลองใหม่`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

/**
 * สร้าง/อัปเดตโครงตาราง — รันทุกครั้งที่บูต
 * ไฟล์ SQL ทั้งสองเขียนให้รันซ้ำได้ จึงไม่ต้องมีระบบ migration ให้ซับซ้อน
 */
async function migrate() {
  for (const file of ["001_schema.sql", "002_views.sql"]) {
    const sql = await readFile(join(SQL_DIR, file), "utf8");
    await query(sql);
    log(`โครงตาราง: รัน ${file} แล้ว`);
  }
}

/* ── รอบเก็บของ PlotNexus ─────────────────────────────────────────── */
async function tickPlotnexus() {
  if (!plotnexusReady) return;
  try {
    const { rows, skipped } = await fetchLatestRows();
    const written = await insertObs(rows, "plotnexus");
    await logCollect("plotnexus", true, written, skipped.length ? `ข้าม: ${skipped.join(", ")}` : null);
    /* เขียน 0 แถวเป็นเรื่องปกติ ไม่ใช่ความผิดพลาด — แปลว่าเซนเซอร์ยังไม่ได้ส่งค่าใหม่
       ตั้งแต่รอบที่แล้ว ค่าที่ได้จึงซ้ำกับที่มีอยู่และถูก primary key กันไว้ */
    if (written > 0) log(`PlotNexus: เก็บใหม่ ${written} ค่า (จากที่ดึงมา ${rows.length})`);
  } catch (err) {
    warn("PlotNexus ล้ม:", err.message);
    await logCollect("plotnexus", false, 0, err.message).catch(() => {});
  }
}

/* ── รอบเก็บค่าเซนเซอร์จากฐานแดชบอร์ด (กล่อง box-mew) ──────────────── */

/**
 * เวลาล่าสุดที่เก็บไว้แล้ว — **แยกตามตารางต้นทาง ห้ามยุบเป็นตัวเดียว**
 * เหตุผลเต็ม (พร้อมของจริงที่หายไปหนึ่งเดือน) อยู่ที่ `fetchSince` ใน sources/swine.js
 *
 * ★ ค่าตั้งต้นอ่านจากฐาน ไม่ใช่ตั้งเป็น "เมื่อกี้" — ไม่งั้นทุกครั้งที่คอนเทนเนอร์
 *   รีสตาร์ต ช่วงที่มันดับอยู่จะกลายเป็นรูถาวรที่ไม่มีใครตามเก็บ
 */
let swineMark = null;

async function tickSwine() {
  if (!swineReady) return;
  try {
    if (swineMark === null) {
      swineMark = {
        sensor: await latestFromSource("swine_db", SENSOR_MEASURES),
        power: await latestFromSource("swine_db", POWER_MEASURES),
      };
    }
    const { rows, newest, read, more } = await fetchSince(swineMark);
    const written = await insertObs(rows, "swine_db");
    /* ขยับเฉพาะตารางที่อ่านได้จริง — ตารางที่ไม่มีแถวใหม่ต้องคงจุดเดิมไว้ */
    swineMark = {
      sensor: newest.sensor ?? swineMark.sensor,
      power: newest.power ?? swineMark.power,
    };
    await logCollect("swine_db", true, written, `อ่าน ${read} แถว${more ? " (ยังตามไม่ทัน)" : ""}`);
    /* เขียน 0 เป็นเรื่องปกติ — แปลว่ายังไม่มีค่าใหม่ตั้งแต่รอบที่แล้ว */
    if (written > 0) {
      log(`กล่อง box-mew: เก็บใหม่ ${written} ค่า (อ่านมา ${read} แถว)${more ? " — ยังตามไม่ทัน รอบหน้าเก็บต่อ" : ""}`);
    }
  } catch (err) {
    warn("อ่านจากฐานแดชบอร์ดไม่สำเร็จ:", err.message);
    await logCollect("swine_db", false, 0, err.message).catch(() => {});
  }
}

/* ── รอบเก็บของ Open-Meteo ────────────────────────────────────────── */
async function tickOpenMeteo() {
  try {
    /* ขอย้อนหลัง 10 วันทุกรอบ ไม่ใช่ 3 — **จำเป็น ไม่ใช่เผื่อไว้เฉย ๆ**
       คลัง ERA5 ที่ใช้ backfill ตามหลังปัจจุบันราว 5 วัน ถ้าขอย้อนหลังสั้นกว่านั้น
       จะเหลือรอยต่อที่ไม่มีใครเก็บอยู่ตรงกลางพอดี (เจอจริงตอนทดสอบ: ขาดวันที่ 31)
       และรอยแบบนี้ตัดชุดข้อมูลขาดเป็นสองท่อน ทำให้สร้างตัวแปรย้อนหลังข้ามรอยไม่ได้ */
    const { obs, fcst } = await fetchNowAndForecast(10, 3);
    const o = await insertObs(obs, "openmeteo");
    const f = await insertFcst(fcst, "openmeteo");
    await logCollect("openmeteo", true, o + f, `obs ${o} · fcst ${f}`);
    if (o > 0 || f > 0) log(`Open-Meteo: ค่าที่เกิดขึ้นแล้ว ${o} · คำพยากรณ์ ${f}`);
  } catch (err) {
    warn("Open-Meteo ล้ม:", err.message);
    await logCollect("openmeteo", false, 0, err.message).catch(() => {});
  }
}

/**
 * ตั้งรอบทำงาน แล้วยิงทันทีหนึ่งครั้งโดยไม่ต้องรอครบรอบแรก
 * (ไม่งั้นเปิดคอนเทนเนอร์แล้วต้องนั่งรอ 15 นาทีถึงจะรู้ว่าตั้งค่าถูกไหม)
 */
function every(seconds, fn) {
  fn();
  return setInterval(fn, seconds * 1000);
}

async function main() {
  if (!config.databaseUrl) {
    console.error("ไม่ได้ตั้ง DATABASE_URL — หยุดทำงาน");
    process.exit(1);
  }

  await waitForDb();
  await migrate();

  log("═══ ตัวเก็บข้อมูลเริ่มทำงาน ═══");
  log(`ฟาร์มที่พิกัด ${config.openMeteo.lat}, ${config.openMeteo.lon}`);
  log(`Open-Meteo: ทุก ${config.openMeteo.everySec} วินาที`);
  if (swineReady) {
    log(`ค่าเซนเซอร์จากฐานแดชบอร์ด (กล่อง box-mew): ทุก ${config.swine.everySec} วินาที`);
  } else {
    warn("ไม่ได้ตั้ง SWINE_DB_URL — จะเก็บเฉพาะข้อมูลอากาศภายนอก ไม่มีค่าในเล้า");
  }
  /* ★ บอกทุกครั้งที่บูตว่าทำไมไม่มี PlotNexus — ปิดเงียบ ๆ แล้ววันหลังจะมีคนสงสัยว่า
     ข้อมูลหายไปไหน แล้วไล่หาไม่เจอ (กติกาข้อ 2 ที่หัวไฟล์: ล้มแล้วต้องบันทึกไว้) */
  if (plotnexusReady) {
    log(`PlotNexus: ทุก ${config.plotnexus.everySec} วินาที (ชุดข้อมูล ${config.plotnexus.source})`);
  } else {
    log("PlotNexus: ปิดอยู่ (กุญแจถูกถอนสิทธิ์ 11 ก.ย. 2569) — ค่าเซนเซอร์มาจากกล่องแทน");
  }

  const timers = [
    every(config.swine.everySec, tickSwine),
    every(config.openMeteo.everySec, tickOpenMeteo),
  ];
  if (plotnexusReady) timers.push(every(config.plotnexus.everySec, tickPlotnexus));

  /* ปิดให้เรียบร้อยตอนโดนสั่งหยุด — ไม่งั้นคำสั่ง insert ที่ค้างอยู่จะถูกตัดกลางคัน
     แล้วรอบถัดไปต้องมาเก็บซ้ำ (ซึ่งก็ไม่พังเพราะกันแถวซ้ำไว้ แต่เสียเวลาเปล่า) */
  const stop = async (signal) => {
    log(`ได้รับสัญญาณ ${signal} — กำลังปิด`);
    timers.forEach(clearInterval);
    await closeSwinePool();
    await pool.end().catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
}

main().catch((err) => {
  console.error("เริ่มทำงานไม่สำเร็จ:", err);
  process.exit(1);
});
