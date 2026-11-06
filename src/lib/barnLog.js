/**
 * "บันทึกข้อมูลผู้ใช้งาน" ของโรงเรือน — รายการที่คนหน้าฟาร์มกรอกเอง
 * (หมูตาย · ย้ายเข้า/ออก · ให้อาหาร · ยา · ป่วย · หาย)
 *
 * **ทำไมต้องมีไฟล์นี้**: เดิมรายการเก็บอยู่ใน `useState` ของหน้าโรงเรือนเฉย ๆ
 * กรอกเพิ่มแล้วขึ้นในตารางจริง แต่พอรีเฟรชหรือเดินออกจากหน้าไปกลับมา ของที่กรอกหายหมด
 * และทุกโรงเรือนใช้รายการชุดเดียวกัน — แก้ที่ A1 แล้ว A2 เปลี่ยนตาม ซึ่งผิดชัด ๆ
 * ที่นี่จึงเก็บ **แยกตามโรงเรือน** และเขียนลงเครื่องทุกครั้งที่เปลี่ยน (โครงเดียวกับ lib/snapshots.js)
 *
 * **สองโหมด (T1.269)**
 *   - มีหลังบ้าน (`apiConfigured`) → อ่าน/เขียนที่ `/api/barn-logs/:barnKey` ทุกเครื่องเห็นตรงกัน
 *     และรายงานส่งเวรอ่านได้ · **ไม่มีรายการตัวอย่าง** (ของตัวอย่างบนฐานกลางจะดูเหมือนของจริง)
 *   - ไม่มีหลังบ้าน (เว็บที่โฮสต์บนคลาวด์ `build:host`) → เก็บใน localStorage แบบเดิม
 * ของที่เคยกรอกไว้ในเครื่องก่อนมีโหมดแรก ไม่ถูกส่งขึ้นเอง — ผู้ใช้กด "ย้ายขึ้นระบบ" (`importLocal`)
 * เพราะหลายเครื่องอาจมีชุดเดียวกัน ส่งขึ้นเองอัตโนมัติจะได้แถวซ้ำ (หลังบ้านกันซ้ำด้วย client_id อีกชั้น)
 *
 * โครงหนึ่งรายการ: { id, type, amount, unit, note, by, at }
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiConfigured, apiDelete, apiGet, apiPatch, apiPost } from "./api/client.js";

const KEY = "swine-sync:barn-log";

/** เก็บได้กี่รายการต่อโรงเรือน — เกินแล้วตัดของเก่าสุดทิ้ง กัน localStorage เต็ม */
export const LOG_LIMIT = 200;

const readAll = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const clean = {};
    for (const [barnId, list] of Object.entries(raw)) {
      if (!Array.isArray(list)) continue;
      /* คัดเฉพาะรายการที่ครบช่องที่ตารางต้องใช้ — ของรูปแบบเก่าที่อ่านไม่ออกทิ้งไป
         ดีกว่าปล่อยให้หน้าพังตอน render */
      clean[barnId] = list
        .filter((e) => e && e.id != null && typeof e.at === "string")
        .slice(0, LOG_LIMIT);
    }
    return clean;
  } catch {
    return {};
  }
};

const write = (all) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* เต็มหรือถูกปิดไว้ — ใช้ต่อได้ในรอบนี้ แค่ไม่ถูกจำไว้รอบหน้า */
  }
};

/** โหมดเก็บในเครื่อง — ของเดิมก่อน T1.269 (ใช้เมื่อไม่มีหลังบ้าน) */
function useLocalBarnLog(barnId, seed = []) {
  const [all, setAll] = useState(readAll);

  useEffect(() => {
    write(all);
  }, [all]);

  /* เช็กด้วย "มีคีย์นี้ไหม" ไม่ใช่ "ว่างหรือเปล่า" — ลบรายการจนหมดแล้วต้องว่างจริง ๆ
     ถ้าเช็กด้วยความว่าง รายการตัวอย่างจะโผล่กลับมาทุกครั้งที่ลบหมด */
  const list = barnId in all ? all[barnId] : seed;

  /** เขียนทับรายการของโรงเรือนนี้ทั้งชุด — ตัวช่วยกลางของสามคำสั่งด้านล่าง */
  const put = useCallback(
    (next) => setAll((s) => ({ ...s, [barnId]: next.slice(0, LOG_LIMIT) })),
    [barnId]
  );

  const add = useCallback(
    (entry) => put([{ ...entry, id: `L-${Date.now().toString(36)}` }, ...list]),
    [put, list]
  );

  const update = useCallback(
    (id, patch) =>
      put(list.map((e) => (e.id === id ? { ...e, ...(typeof patch === "function" ? patch(e) : patch) } : e))),
    [put, list]
  );

  const remove = useCallback((id) => put(list.filter((e) => e.id !== id)), [put, list]);

  /* รายการที่คนกรอกเองในเครื่องนี้ (id "L-…") — ของตัวอย่างไม่มี id จึงไม่ติดมาด้วย */
  const own = useMemo(() => (all[barnId] ?? []).filter((e) => String(e.id).startsWith("L-")), [all, barnId]);
  const forget = useCallback(
    (ids) => setAll((s) => ({ ...s, [barnId]: (s[barnId] ?? []).filter((e) => !ids.includes(e.id)) })),
    [barnId],
  );

  return { list, add, update, remove, own, forget };
}

const path = (barnId, id) => `/barn-logs/${encodeURIComponent(barnId)}${id ? `/${id}` : ""}`;

/* ───── ทางเข้าแบบไม่ผ่าน hook ─────
   ใช้ตอนฟอร์มโรงเรือนแปลงช่อง "จำนวนสุกร" เป็นบันทึกย้ายเข้า/ออก (T1.328)
   ตรงนั้นเป็น callback ของการบันทึกฟอร์ม เรียก hook ไม่ได้ และไม่ต้องการ state
   ของรายการทั้งหมดด้วย — ขอแค่ยิงสองครั้งแล้วจบ */

/** รายการบันทึกทั้งหมดของเล้าหนึ่ง (ไม่ผูกกับ React) */
export const listBarnLog = (barnId, opt) => apiGet(path(barnId), opt);

/** เขียนบันทึกหนึ่งรายการ (ไม่ผูกกับ React) */
export const addBarnLog = (barnId, entry) => apiPost(path(barnId), entry);

/** เวลาไทยไม่มีโซน "YYYY-MM-DDTHH:MM:SS" — รูปที่หน้าเว็บและหลังบ้านตกลงกัน */
const isLocalTime = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);

/**
 * รายการบันทึกของโรงเรือนหนึ่ง พร้อมคำสั่งเพิ่ม/แก้/ลบ
 *
 * @param {string} barnId รหัสโรงเรือนแบบหน้าเว็บ เช่น "F-KPP-A1"
 * @param {Array}  seed   รายการตัวอย่าง — ใช้เฉพาะโหมดเก็บในเครื่อง
 * @returns {{
 *   list: Array, add: function, update: function, remove: function,
 *   mode: "server"|"local", status: string, error: string|null,
 *   pendingLocal: number, importLocal: function, busy: boolean
 * }}
 * add/update/remove คืน Promise — โหมดหลังบ้านเขียนไม่สำเร็จจะ reject และตั้ง `error` ให้หน้าจอบอก
 */
export function useBarnLog(barnId, seed = []) {
  const local = useLocalBarnLog(barnId, seed);
  const server = apiConfigured;
  const [state, setState] = useState({ status: "loading", entries: [], error: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!server || !barnId) return undefined;
    const controller = new AbortController();
    setState({ status: "loading", entries: [], error: null });
    apiGet(path(barnId), { signal: controller.signal })
      .then(({ entries = [] }) => setState({ status: "ready", entries, error: null }))
      .catch((err) => {
        if (err.name === "AbortError") return;
        setState({
          status: err.status === 401 ? "unauthorized" : "error",
          entries: [],
          error: err.message,
        });
      });
    return () => controller.abort();
  }, [server, barnId]);

  /* เขียนหนึ่งครั้ง: กันกดซ้ำ + เก็บข้อความผิดพลาดไว้ให้หน้าจอ แล้วโยนต่อให้คนเรียกรู้ด้วย */
  const run = useCallback(async (job) => {
    setBusy(true);
    setState((s) => ({ ...s, error: null }));
    try {
      return await job();
    } catch (err) {
      setState((s) => ({ ...s, error: err.message }));
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const add = useCallback(
    (entry) =>
      run(async () => {
        const { entry: saved } = await apiPost(path(barnId), entry);
        setState((s) => ({ ...s, entries: [saved, ...s.entries] }));
        return saved;
      }),
    [run, barnId],
  );

  const update = useCallback(
    (id, patch) =>
      run(async () => {
        const current = state.entries.find((e) => e.id === id);
        if (!current) throw new Error("ไม่พบรายการนี้");
        const next = { ...current, ...(typeof patch === "function" ? patch(current) : patch) };
        const body = { type: next.type, amount: next.amount, unit: next.unit, note: next.note ?? "" };
        if (isLocalTime(next.at)) body.at = next.at;
        const { entry: saved } = await apiPatch(path(barnId, id), body);
        setState((s) => ({ ...s, entries: s.entries.map((e) => (e.id === id ? saved : e)) }));
        return saved;
      }),
    [run, barnId, state.entries],
  );

  const remove = useCallback(
    (id) =>
      run(async () => {
        await apiDelete(path(barnId, id));
        setState((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== id) }));
      }),
    [run, barnId],
  );

  /* ย้ายของในเครื่องขึ้นฐาน — ลบออกจากเครื่องเฉพาะเมื่อหลังบ้านยืนยันว่ารับไว้ครบ
     ถ้ามีแถวที่ข้อมูลเพี้ยนจนหลังบ้านไม่รับ (skipped) เก็บทั้งชุดไว้ในเครื่องต่อ ไม่ทิ้งของใคร */
  const { own, forget } = local;
  const importLocal = useCallback(
    () =>
      run(async () => {
        const result = await apiPost(`${path(barnId)}/import`, { entries: own });
        if (result.skipped === 0) forget(own.map((e) => e.id));
        const { entries = [] } = await apiGet(path(barnId));
        setState({ status: "ready", entries, error: null });
        return result;
      }),
    [run, barnId, own, forget],
  );

  if (!server) {
    const wrap = (fn) => (...args) => Promise.resolve(fn(...args));
    return {
      list: local.list,
      add: wrap(local.add),
      update: wrap(local.update),
      remove: wrap(local.remove),
      mode: "local",
      status: "ready",
      error: null,
      pendingLocal: 0,
      importLocal: () => Promise.resolve(null),
      busy: false,
    };
  }

  return {
    list: state.entries,
    add,
    update,
    remove,
    mode: "server",
    status: state.status,
    error: state.error,
    pendingLocal: own.length,
    importLocal,
    busy,
  };
}
