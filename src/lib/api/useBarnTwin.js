/**
 * แบบจำลองชั้นที่ 2 ของโรงเรือนหนึ่งหลัง — แบบจำลองความร้อน + สุขภาพเซนเซอร์นอกเล้า (T1.261)
 *
 * แยกจาก useTwinState เพราะคำนวณหนักกว่า (หลังบ้านสอนแบบจำลองใหม่ชั่วโมงละครั้ง)
 * จึงถามห่างกว่า — นาทีละครั้งพอ ค่าที่มันตอบไม่ได้เปลี่ยนเร็วขนาดนั้น
 */
import { useEffect, useState } from "react";
import { apiConfigured, apiGet } from "./client.js";

const POLL_MS = 60_000;

export function useBarnTwin(barnId) {
  const [state, setState] = useState({ status: "idle", data: null, error: null });

  useEffect(() => {
    if (!barnId || !apiConfigured) return undefined;
    const controller = new AbortController();
    const load = async () => {
      try {
        const data = await apiGet(`/barns/${barnId}/twin`, { signal: controller.signal });
        setState({ status: "ready", data, error: null });
      } catch (err) {
        if (err.name === "AbortError") return;
        setState((prev) => ({ ...prev, status: "error", error: err.message }));
      }
    };
    setState((prev) => ({ ...prev, status: prev.data ? prev.status : "loading" }));
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
