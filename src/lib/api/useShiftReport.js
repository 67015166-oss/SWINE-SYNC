/**
 * ข้อมูลหน้ารายงานส่งเวร (T1.268) — โรงเรือนที่มีในหลังบ้าน + รายงานของกะที่เลือก
 *
 * อ่านจาก **หลังบ้านของเราเอง** เหมือนหน้าแบบจำลองโรงเรือน (PlotNexus ยังตอบ 403)
 * กะที่ยังไม่จบถามใหม่ทุกนาที · กะที่จบแล้วถามครั้งเดียวพอ ตัวเลขไม่เปลี่ยนอีก
 */
import { useCallback, useEffect, useState } from "react";
import { apiConfigured, apiGet, apiPost } from "./client.js";

const LIVE_POLL_MS = 60_000;

/** 401 = ยังไม่ได้เข้าสู่ระบบ ต้องบอกให้ตรง ไม่ใช่ "หลังบ้านล่ม" */
const statusOf = (err) => (err.status === 401 ? "unauthorized" : "error");

/** โรงเรือนทุกหลังในหลังบ้าน พร้อมชื่อฟาร์ม */
export function useReportBarns() {
  const [state, setState] = useState({ status: "loading", barns: [], error: null });

  useEffect(() => {
    if (!apiConfigured) {
      setState({ status: "error", barns: [], error: "ยังไม่ได้ตั้งที่อยู่หลังบ้าน (VITE_API_BASE)" });
      return undefined;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const { signal } = controller;
        const { farms = [] } = await apiGet("/farms", { signal });
        const lists = await Promise.all(farms.map((f) => apiGet(`/farms/${f.id}/barns`, { signal })));
        const barns = farms.flatMap((farm, i) =>
          (lists[i]?.barns ?? []).map((b) => ({ id: b.id, code: b.code, name: b.name, farmName: farm.name })),
        );
        setState({ status: "ready", barns, error: null });
      } catch (err) {
        if (err.name === "AbortError") return;
        setState({ status: statusOf(err), barns: [], error: err.message });
      }
    })();
    return () => controller.abort();
  }, []);

  return state;
}

/**
 * รายงานของกะหนึ่ง
 * @param {string|null} barnId
 * @param {{from: number, to: number}|null} shift
 * @param {boolean} live กะยังไม่จบ — ถามใหม่เป็นระยะ
 */
export function useShiftReport(barnId, shift, live) {
  const [state, setState] = useState({ status: "idle", data: null, error: null });
  const [nonce, setNonce] = useState(0);
  const from = shift?.from;
  const to = shift?.to;

  useEffect(() => {
    if (!barnId || from == null || !apiConfigured) return undefined;
    const controller = new AbortController();
    const qs = `from=${encodeURIComponent(new Date(from).toISOString())}&to=${encodeURIComponent(new Date(to).toISOString())}`;
    const load = async () => {
      try {
        const data = await apiGet(`/barns/${barnId}/shift-report?${qs}`, { signal: controller.signal });
        setState({ status: "ready", data, error: null });
      } catch (err) {
        if (err.name === "AbortError") return;
        setState((prev) => ({ ...prev, status: statusOf(err), error: err.message }));
      }
    };
    /* เปลี่ยนกะแล้วต้องล้างของกะเดิมทิ้งทันที — ไม่งั้นตัวเลขกะเก่าค้างบนจอระหว่างโหลดกะใหม่ */
    setState({ status: "loading", data: null, error: null });
    load();
    const timer = live
      ? setInterval(() => {
          if (document.visibilityState === "visible") load();
        }, LIVE_POLL_MS)
      : null;
    return () => {
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [barnId, from, to, live, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

/** กด "รับเวรแล้ว" — คืน handover ที่บันทึกแล้ว หรือโยน ApiError (409 = มีคนรับไปแล้ว) */
export async function receiveShift(barnId, shift, note) {
  const { handover } = await apiPost(`/barns/${barnId}/shift-report/handover`, {
    from: new Date(shift.from).toISOString(),
    to: new Date(shift.to).toISOString(),
    note,
  });
  return handover;
}
