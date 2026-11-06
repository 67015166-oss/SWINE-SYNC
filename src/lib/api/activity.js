/**
 * ใครทำอะไรในระบบ (T1.359) — ฝั่งหน้าเว็บ
 *
 * ★ รายการนี้ **เห็นในแอปเสมอ** ไม่ขึ้นกับการตั้งค่า
 *   ค่าที่ติ๊กในหน้าตั้งค่าคุมเฉพาะว่าจะ**ส่งออกไลน์**หรือไม่ เพราะโควตาไลน์มีจำกัด
 *   แต่การดูย้อนหลังในเว็บไม่เสียอะไร (ดู server/src/activity/settings.js)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiConfigured, apiGet, apiPut } from "./client.js";

/** ดึงใหม่ทุกกี่วินาที — กิจกรรมของคนไม่ใช่ค่าที่วิ่งตลอดเวลา ไม่ต้องถี่เท่าค่าเซนเซอร์ */
const REFRESH_MS = 60_000;

/**
 * @param {number} [limit] จำนวนรายการล่าสุดที่ขอ
 * @returns {{rows: Array, kinds: Array, status: "idle"|"loading"|"ok"|"error", error: string|null}}
 */
export function useActivity(limit = 30) {
  const [state, setState] = useState({ rows: [], kinds: [], status: "idle", error: null });

  useEffect(() => {
    if (!apiConfigured) {
      setState({ rows: [], kinds: [], status: "error", error: "ยังไม่ได้ต่อกับเซิร์ฟเวอร์" });
      return undefined;
    }
    const controller = new AbortController();
    const load = () => {
      setState((prev) => ({ ...prev, status: prev.rows.length ? prev.status : "loading" }));
      apiGet(`/activity?limit=${limit}`, { signal: controller.signal })
        .then((r) => {
          if (controller.signal.aborted) return;
          setState({ rows: r.activity ?? [], kinds: r.kinds ?? [], status: "ok", error: null });
        })
        .catch((err) => {
          if (err?.name === "AbortError" || controller.signal.aborted) return;
          /* ★ ล้างรายการทิ้งด้วย ไม่ใช่โชว์ของเก่าคู่กับคำว่า "ต่อไม่ได้"
             คนอ่านจะนึกว่ารายการที่เห็นคือล่าสุด ทั้งที่อาจมีของใหม่ที่ดึงไม่มา */
          setState({ rows: [], kinds: [], status: "error", error: err?.message ?? "ต่อไม่ได้" });
        });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [limit]);

  return state;
}

/**
 * หมวดที่ตั้งไว้ว่าให้ส่งเข้าไลน์
 *
 * ★★ เป็นค่า **ระดับระบบ มีผลกับทุกคน** ไม่ใช่ค่าหน้าจอส่วนตัว
 *   เพราะตัวส่งไลน์มีตัวเดียวอยู่ที่เซิร์ฟเวอร์ — หน้าจอต้องบอกข้อนี้ให้ชัด
 */
export function useActivitySettings() {
  /* ★ ค่าจริงอยู่ที่นี่ ไม่ใช่ใน state — อ่านได้ทันทีโดยไม่ต้องรอ React วาดใหม่ */
  const kinds = useRef([]);
  /* คิวคำขอ — ส่งทีละใบตามลำดับที่กด ไม่ให้แซงกัน */
  const queue = useRef(Promise.resolve());
  const [state, setState] = useState({
    kinds: [],
    lineKinds: [],
    everyMinutes: null,
    status: "loading",
    error: null,
  });

  const load = useCallback(() => {
    if (!apiConfigured) {
      setState((p) => ({ ...p, status: "error", error: "ยังไม่ได้ต่อกับเซิร์ฟเวอร์" }));
      return;
    }
    apiGet("/activity/settings")
      .then((r) => {
        kinds.current = r.lineKinds ?? [];
        setState({
          kinds: r.kinds ?? [],
          lineKinds: kinds.current,
          everyMinutes: r.everyMinutes ?? null,
          status: "ok",
          error: null,
        });
      })
      .catch((err) => setState((p) => ({ ...p, status: "error", error: err?.message ?? "ต่อไม่ได้" })));
  }, []);

  useEffect(load, [load]);

  /**
   * สลับหมวดหนึ่ง (แก้ T1.367)
   *
   * ═══ ★★ บั๊กที่เพิ่งแก้: `setState` ไม่ได้ทำงานทันที ═══
   * ของเดิมเขียนแบบนี้
   *   let next = null;
   *   setState((p) => { next = ...; return ...; });   // ← React เรียกทีหลัง ไม่ใช่ตอนนี้
   *   apiPut("/activity/settings", { lineKinds: next });  // ← next ยังเป็น null อยู่
   *
   * ผลคือทุกครั้งที่ติ๊ก จะส่ง `lineKinds: null` ไปหาเซิร์ฟเวอร์ ซึ่งตอบ 400
   * แล้วช่องเด้งกลับ — **ติ๊กไม่ติดสักครั้ง** (ผู้ใช้แจ้งเอง 2 พ.ย. 2569)
   *
   * ★ ค่าจริงอยู่ใน `ref` ไม่ใช่ใน state — คิดค่าใหม่ได้ทันทีแบบไม่ต้องรอ React
   *
   * ═══ ★★ และต่อคิวคำขอ ไม่ยิงพร้อมกัน ═══
   * ติ๊กสามช่องเร็ว ๆ แล้วยิงสามคำขอพร้อมกัน ตัวที่ตอบช้าสุดจะเขียนทับตัวอื่น
   * ช่องที่ติ๊กทีหลังหายเงียบ — **เป็นบั๊กเดียวกับ T1.351 ที่ตู้กลางเคยเจอมาแล้ว**
   * ต่อคิวให้ส่งทีละใบตามลำดับที่กด จึงไม่มีทางแซงกัน
   */
  const toggle = useCallback((id) => {
    const cur = kinds.current;
    const next = cur.includes(id) ? cur.filter((k) => k !== id) : [...cur, id];
    kinds.current = next;
    setState((p) => ({ ...p, lineKinds: next, error: null }));

    queue.current = queue.current
      .then(() => apiPut("/activity/settings", { lineKinds: next }))
      .then((r) => {
        /* ★ ยึดค่าที่เซิร์ฟเวอร์ตอบกลับ ไม่ใช่ค่าที่เราเดา — เผื่อมันกรองบางค่าทิ้ง */
        const saved = Array.isArray(r?.lineKinds) ? r.lineKinds : next;
        kinds.current = saved;
        setState((p) => ({ ...p, lineKinds: saved }));
      })
      .catch((err) => {
        /* ★★ ล้มแล้ว **ไปถามค่าจริงจากเซิร์ฟเวอร์ ไม่เดาย้อนเอง**
           ถ้าเดาย้อนตอนมีหลายคำขอค้างอยู่ จะย้อนผิดตัวแล้วหน้าจอไม่ตรงกับของจริง */
        setState((p) => ({ ...p, error: err?.message ?? "บันทึกไม่สำเร็จ" }));
        return apiGet("/activity/settings")
          .then((r) => {
            kinds.current = r.lineKinds ?? [];
            setState((p) => ({ ...p, lineKinds: kinds.current }));
          })
          .catch(() => {});
      });

    return queue.current;
  }, []);

  return { ...state, toggle, reload: load };
}
