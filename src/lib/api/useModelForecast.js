/**
 * คำทำนายจากโมเดลที่เราเทรนเอง — อ่านภาพนิ่งที่ห้องแล็บเขียนไว้ผ่าน `/api/forecast/model`
 *
 * ═══ ต่างจาก `useForecast` (Open-Meteo) ยังไง — สำคัญมาก อย่าเอาไปปนกัน ═══
 *   `useForecast`      = แบบจำลองอากาศของโลก ที่จุดกริดกว้าง ๆ ครอบฟาร์ม ใครก็เรียกได้
 *   ไฟล์นี้            = โมเดลที่เทรนจาก **ค่าที่เสาต้นนี้วัดได้จริง** จึงรู้จักนิสัยของจุดนี้
 * ตัวเลขสองชุดนี้ต่างกันหลายองศาเป็นเรื่องปกติ และนั่นคือประเด็นทั้งหมดของการเทรนเอง
 *
 * **ไฟล์ที่อ่านมาเป็นภาพนิ่ง ไม่ใช่ค่าสด** — คำนวณเมื่อไรก็เก่าตั้งแต่นาทีถัดไป
 * `ageMinutes` จากหลังบ้านจึงต้องส่งต่อให้หน้าจอเสมอ ห้ามกลืนหาย
 */
import { useEffect, useState } from "react";
import { apiGet, apiConfigured } from "./client.js";

/* ภาพนิ่งเปลี่ยนเฉพาะตอนมีคนสั่งเทรนใหม่ — ถามถี่กว่านี้ได้คำตอบเดิม */
const REFRESH_MS = 10 * 60_000;

/**
 * @param {string} target ค่าที่ทำนาย — ตอนนี้ใช้ `mast_temp_c` (อุณหภูมิข้างนอกที่ฟาร์ม)
 * @returns {{data: object|null, status: "idle"|"loading"|"ok"|"none"|"error", error: string|null}}
 *   `none` = ยังไม่เคยเทรน ซึ่งเป็นสถานะปกติของเครื่องที่เพิ่งติดตั้ง ไม่ใช่ความผิดพลาด
 */
export function useModelForecast(target = "mast_temp_c") {
  const [state, setState] = useState({ data: null, status: "idle", error: null });

  useEffect(() => {
    if (!apiConfigured) {
      setState({ data: null, status: "none", error: null });
      return undefined;
    }

    const controller = new AbortController();

    const load = () => {
      setState((prev) => ({ ...prev, status: prev.data ? prev.status : "loading" }));
      apiGet(`/forecast/model?target=${encodeURIComponent(target)}`, {
        signal: controller.signal,
      })
        .then((data) => {
          if (controller.signal.aborted) return;
          setState({ data, status: "ok", error: null });
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          /* ยังไม่เคยเทรน ≠ พัง — แยกสองอย่างนี้ให้หน้าจอ ไม่งั้นจะขึ้นข้อความสีแดง
             ให้คนที่แค่ยังไม่ได้สั่งเทรน แล้วเขาจะไปตามหาบั๊กที่ไม่มีอยู่ */
          const none = err.code === "no_snapshot" || err.code === "no_backend";
          setState({ data: null, status: none ? "none" : "error", error: err.message });
        });
    };

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [target]);

  return state;
}
