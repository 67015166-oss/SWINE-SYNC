/**
 * พยากรณ์อากาศของฟาร์มหนึ่ง — ห่อ `fetchForecast` ให้หน้าจอเรียกง่าย
 *
 * ดึงใหม่ทุก 30 นาที: Open-Meteo อัปเดตแบบจำลองราวชั่วโมงละครั้ง
 * ถามถี่กว่านี้ได้คำตอบเดิมและเป็นการรบกวนบริการฟรีโดยไม่จำเป็น
 */
import { useEffect, useState } from "react";
import { fetchForecast } from "./openMeteo.js";

const REFRESH_MS = 30 * 60_000;

/**
 * @param {{lat: number, lng: number}|null} at พิกัดฟาร์ม — null = ยังไม่รู้ว่าฟาร์มไหน
 * @returns {{hours: Array, days: Array, status: "idle"|"loading"|"ok"|"error", error: string|null}}
 */
export function useForecast(at) {
  const [state, setState] = useState({ hours: [], days: [], status: "idle", error: null });

  /* แยกเป็นตัวเลขก่อนใส่ใน dependency — ถ้าใส่ object ตรง ๆ จะดึงใหม่ทุกครั้งที่หน้า
     วาดใหม่ เพราะ object ใบใหม่ไม่เท่ากับใบเดิมเสมอ แม้พิกัดจะเหมือนกันเป๊ะ */
  const lat = at?.lat ?? null;
  const lng = at?.lng ?? null;

  useEffect(() => {
    if (lat == null || lng == null) {
      setState({ hours: [], days: [], status: "idle", error: null });
      return undefined;
    }

    const controller = new AbortController();
    let timer = null;

    const load = () => {
      setState((prev) => ({ ...prev, status: prev.days.length ? prev.status : "loading" }));
      fetchForecast({ lat, lng }, controller.signal)
        .then(({ hours, days }) => {
          if (controller.signal.aborted) return;
          setState({ hours, days, status: "ok", error: null });
        })
        .catch((err) => {
          if (err.name === "AbortError" || controller.signal.aborted) return;
          /* ดึงไม่ได้ = หน้าจอขึ้นเหตุผลตรง ๆ ไม่ใช่การ์ดว่าง ๆ ที่ดูเหมือนแอปพัง */
          setState({ hours: [], days: [], status: "error", error: err.message });
        });
    };

    load();
    timer = setInterval(load, REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [lat, lng]);

  return state;
}
