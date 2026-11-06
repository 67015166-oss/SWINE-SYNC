/**
 * คำทำนายจากโมเดลที่เราเทรนเอง — อ่านจาก "ภาพนิ่ง" ที่ห้องแล็บเขียนทิ้งไว้
 *
 * ═══ ทำไมไม่ต่อฐานของคลังโมเดลตรง ๆ ═══
 * `weather/` ตั้งใจแยกขาดจากแดชบอร์ด — คนละ compose คนละฐาน คนละ volume
 * เพื่อให้ `docker compose down -v` ล้างคลังโมเดลได้โดยไม่แตะฐานของแดชบอร์ด
 * ถ้า API ตัวนี้ต่อ `wx-db` โดยตรง ความแยกขาดนั้นหายทันที: วันที่ปิดคลังไปลองอะไร
 * หน้าเว็บจะพังตามไปด้วย
 *
 * จึงคุยกันผ่าน **ไฟล์เดียว** ที่ `weather/lab/predict.py` เขียนไว้ แล้ว compose
 * ผูกโฟลเดอร์นั้นเข้ามาแบบอ่านอย่างเดียว ไม่มีไฟล์ = ตอบว่ายังไม่เคยเทรน
 * ไม่ใช่ 500 — เพราะ "ยังไม่ได้เทรน" เป็นสถานะปกติของเครื่องที่เพิ่งติดตั้ง
 *
 * **ไฟล์นี้เก่าได้** และนั่นคือเรื่องสำคัญที่ต้องบอกคนดู จึงส่ง `ageMinutes` ไปด้วยเสมอ
 * ให้หน้าจอตัดสินใจเองว่าจะเตือนไหม แทนที่จะซ่อนความเก่าไว้เงียบ ๆ
 */
import { Router } from "express";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { badRequest } from "../../lib/error.js";
import { requireAuth } from "../../lib/auth.js";

export const forecastRouter = Router();

const DIR = process.env.MODEL_SNAPSHOT_DIR || "/app/model-snapshots";

/* รายชื่อตายตัว — ชื่อไฟล์ประกอบจากค่าที่ผู้ใช้ส่งมา ถ้าไม่จำกัดไว้
   `?target=../../etc/passwd` จะอ่านไฟล์อะไรก็ได้ในคอนเทนเนอร์ */
const TARGETS = new Set([
  "mast_temp_c",
  "mast_rh",
  "mast_wind_ms",
  "barn_temp_c",
  "barn_thi",
]);

/** GET /api/forecast/model?target=mast_temp_c */
forecastRouter.get("/model", requireAuth, async (req, res, next) => {
  const target = String(req.query.target || "mast_temp_c");
  if (!TARGETS.has(target)) {
    return next(badRequest("ไม่รู้จักสิ่งที่จะทำนายนี้", { got: target }));
  }

  const file = path.join(DIR, `forecast-${target}.json`);
  try {
    const [raw, info] = await Promise.all([readFile(file, "utf8"), stat(file)]);
    const snapshot = JSON.parse(raw);
    res.json({
      ...snapshot,
      ageMinutes: Math.round((Date.now() - info.mtimeMs) / 60_000),
    });
  } catch (err) {
    if (err.code === "ENOENT") {
      return res.status(404).json({
        error: {
          code: "no_snapshot",
          message: "ยังไม่เคยเทรนโมเดลสำหรับค่านี้",
          hint: "cd weather && docker compose exec wx-lab "
            + "python /home/jovyan/scripts/predict.py --target " + target,
        },
      });
    }
    return next(err);
  }
});
