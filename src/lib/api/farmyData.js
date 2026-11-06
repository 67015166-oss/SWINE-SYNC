/**
 * ดึงข้อมูลอ่านอย่างเดียวจากฝั่ง Farmy (T1.290) — ผ่านหลังบ้านของเราเสมอ
 *
 * เหตุผลเดียวกับ `farmyVoice.js`: ไม่ยิงตรงจากเบราว์เซอร์ (CORS · ของเขาเป็นโฮสต์ฟรีที่หลับ ·
 * และเราอยากเก็บคำตอบไว้สั้น ๆ ที่เซิร์ฟเวอร์เพื่อไม่ยิงซ้ำใส่เขา)
 * ปลายทางที่เรียกได้เป็น **allowlist ที่ฝั่งเซิร์ฟเวอร์** หน้าเว็บเลือกเองไม่ได้
 *
 * ทั้งสามชุดนี้เป็น **ข้อมูลของทีมอื่น** ไม่ใช่ข้อมูลในฐานของเรา หน้าจอต้องติดป้ายบอกให้ชัด
 * ไม่งั้นคนจะเอาไปปนกับตัวเลขของเราแล้วเข้าใจว่าเป็นชุดเดียวกัน
 */
import { useEffect, useState } from "react";
import { ApiError, apiConfigured, apiGet } from "./client.js";

/** ชุดข้อมูลที่ดึงได้ — ต้องตรงกับ READS ฝั่งเซิร์ฟเวอร์ (server/src/modules/farmy/route.js) */
export const FARMY_SETS = ["vaccine-due", "farm-tasks", "vet-posts"];

export const fetchFarmySet = (key, signal) =>
  apiGet(`/farmy/data/${encodeURIComponent(key)}`, { signal });

/**
 * โหลดชุดข้อมูลหนึ่งชุด
 *
 * คืน `error` เป็นข้อความพร้อมโชว์ **ไม่โยนทิ้ง** — ระบบของเขาล่มบ่อยกว่าของเรา
 * และหน้านี้ต้องใช้งานต่อได้แม้ชุดหนึ่งพัง ไม่ใช่ทั้งหน้าว่างเพราะชุดเดียวไม่มา
 */
export function useFarmySet(key) {
  const [state, setState] = useState({ loading: apiConfigured, data: null, error: null });

  useEffect(() => {
    if (!apiConfigured) {
      setState({ loading: false, data: null, error: "สำเนานี้ยังไม่ได้ต่อกับเซิร์ฟเวอร์" });
      return;
    }
    const ctrl = new AbortController();
    let alive = true;
    setState({ loading: true, data: null, error: null });
    fetchFarmySet(key, ctrl.signal)
      .then((body) => alive && setState({ loading: false, data: body?.data ?? null, error: null }))
      .catch((err) => {
        if (!alive || err?.name === "AbortError") return;
        setState({
          loading: false,
          data: null,
          error: err instanceof ApiError ? err.message : "ดึงข้อมูลไม่สำเร็จ",
        });
      });
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [key]);

  return state;
}

/** คำตอบของเขาอาจเป็นรายการตรง ๆ หรือห่อไว้ในคีย์ — คลี่ให้เป็นรายการเสมอ */
export function rowsOf(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  for (const v of Object.values(data)) if (Array.isArray(v)) return v;
  return [];
}
