/**
 * สถานะ "ตอนนี้" ของฟาร์มสำหรับหน้าแบบจำลองโรงเรือน — ดึงจาก **หลังบ้านของเราเอง** (T1.260)
 *
 * ทำไมไม่ใช้ useLiveFarms ที่มีอยู่แล้ว: ตัวนั้นดึงจาก PlotNexus ซึ่งถูกถอนสิทธิ์ตั้งแต่
 * 11 ก.ย. 2569 (ตอบ 403 ทุกชุดข้อมูล) ส่วนหลังบ้านของเรายังรับค่าจากสะพาน MQTT → Influx
 * อยู่ตลอด — แบบจำลองต้องสะท้อน "ของจริงตอนนี้" จึงต้องอ่านจากแหล่งที่ยังมีชีวิต
 *
 * คืนค่าทุกอย่างที่ผังต้องใช้ในก้อนเดียว: โรงเรือน + ค่าล่าสุดในเล้า/นอกเล้า + เหตุที่ยังไม่ปิด
 * ล้มแล้วไม่ล้างของเดิมทิ้ง — ค่าล่าสุดที่เคยได้ยังจริงกว่าจอว่าง (บอกอายุข้อมูลกำกับไว้แทน)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiConfigured, apiGet } from "./client.js";

/** ถามใหม่ทุกกี่มิลลิวินาที — เซนเซอร์ส่งทุก ~10 วินาที แต่ผังไม่ต้องไวขนาดนั้น */
const POLL_MS = 20_000;

const EMPTY = {
  status: "loading",
  farms: [],
  barns: [],
  alerts: [],
  error: null,
  /** เวลาที่ดึงสำเร็จครั้งล่าสุด — ใช้บอกว่าภาพบนผังเก่าแค่ไหน */
  fetchedAt: null,
};

export function useTwinState(active = true) {
  const [state, setState] = useState(EMPTY);
  const busy = useRef(false);

  const load = useCallback(async (signal) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const { farms = [] } = await apiGet("/farms", { signal });
      /* ฟาร์มยังมีหลังเดียวในระบบจริง แต่เขียนเผื่อหลายฟาร์มไว้ตั้งแต่ต้น */
      const lists = await Promise.all(farms.map((f) => apiGet(`/farms/${f.id}/barns`, { signal })));
      const barns = farms.flatMap((farm, i) =>
        (lists[i]?.barns ?? []).map((b) => ({ ...b, farmId: farm.id, farmName: farm.name })),
      );
      const { alerts = [] } = await apiGet("/alerts", { signal });
      setState({
        status: "ready",
        farms,
        barns,
        alerts,
        error: null,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      if (err.name === "AbortError") return;
      /* 401 = ยังไม่ได้เข้าสู่ระบบ ต้องบอกให้ตรง ไม่ใช่ "หลังบ้านล่ม" */
      setState((prev) => ({
        ...prev,
        status: err.status === 401 ? "unauthorized" : "error",
        error: err.message,
      }));
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    if (!apiConfigured) {
      setState({ ...EMPTY, status: "error", error: "ยังไม่ได้ตั้งที่อยู่หลังบ้าน (VITE_API_BASE)" });
      return undefined;
    }
    const controller = new AbortController();
    load(controller.signal);
    const timer = setInterval(() => {
      /* ไม่มีใครดูอยู่ก็ไม่ต้องถาม — ประหยัดทั้งเครื่องและหลังบ้าน */
      if (document.visibilityState === "visible") load(controller.signal);
    }, POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [active, load]);

  return state;
}
