/**
 * วัตถุดิบของแบบจำลองชั้นที่ 3 (T1.262) — พารามิเตอร์ · จุดเริ่ม · แดด 24 ชม. ข้างหน้า · วันที่ร้อนที่สุด
 * ถามครั้งเดียวตอนเปิดหน้า แล้วถามใหม่ทุก 15 นาที (พยากรณ์อากาศขยับรายชั่วโมง ไม่ต้องถี่กว่านี้)
 */
import { useEffect, useState } from "react";
import { apiConfigured, apiGet } from "./client.js";

const POLL_MS = 15 * 60_000;

export function useTwinScenario(barnId) {
  const [state, setState] = useState({ status: "idle", data: null, error: null });

  useEffect(() => {
    if (!barnId || !apiConfigured) return undefined;
    const controller = new AbortController();
    const load = async () => {
      try {
        const data = await apiGet(`/barns/${barnId}/twin/scenario`, { signal: controller.signal });
        setState({ status: "ready", data, error: null });
      } catch (err) {
        if (err.name === "AbortError") return;
        setState((prev) => ({ ...prev, status: "error", error: err.message }));
      }
    };
    setState((prev) => (prev.data ? prev : { ...prev, status: "loading" }));
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [barnId]);

  return state;
}
