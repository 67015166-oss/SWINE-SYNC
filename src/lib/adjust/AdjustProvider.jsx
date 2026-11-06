/**
 * เก็บ "รายการปรับจำนวน" ที่ผู้ใช้บันทึกเอง — เช่น ย้ายสุกรเข้า/ออก ขาย ตาย นับใหม่
 *
 * ทำไมต้องเก็บเป็น "รายการปรับ" ไม่ใช่ทับตัวเลขไปเลย:
 *   1. ข้อมูลตั้งต้นมาจาก data/mock/ ซึ่งใช้ร่วมกันทุกหน้าและห้ามแก้โครงสร้าง
 *      (กติกาใน CLAUDE.md) — จึงเก็บเป็นชั้นส่วนต่างแล้วบวกตอนอ่านแทน
 *   2. ของจริงในฟาร์มต้องตอบได้ว่า "หายไป 12 ตัวเพราะอะไร" การเก็บแค่ยอดสุดท้าย
 *      ทำให้ย้อนดูไม่ได้เลย — ที่นี่จึงเก็บทุกครั้งที่ปรับพร้อมเหตุผลและเวลา
 *   3. ถอนคืนได้ทีละรายการ (undo) โดยไม่ต้องเดาว่ายอดเดิมคือเท่าไร
 *
 * **ยังไม่มี backend** — เก็บใน localStorage ของเครื่องนี้เท่านั้น เปลี่ยนเครื่องแล้วไม่ตามไป
 * หน้าจอต้องเขียนกำกับให้ผู้ใช้รู้เสมอ ห้ามทำเหมือนบันทึกขึ้นระบบกลางแล้ว
 * เมื่อต่อ API จริง: แทนที่ setStore ด้วยการยิง POST /api/adjustments แล้วรูปข้อมูลเดิมใช้ต่อได้ทันที
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdjustContext } from "./useAdjust.js";
import { useAuth } from "../auth/useAuth.js";

const KEY = "swine-sync:adjust";

/** อ่านของเก่าจากเครื่อง — พังหรือรูปผิดให้เริ่มใหม่ ดีกว่าทั้งแอปล่ม */
const read = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (e) => e && typeof e.target === "string" && Number.isFinite(e.delta)
    );
  } catch {
    return [];
  }
};

export function AdjustProvider({ children }) {
  const [store, setStore] = useState(read);

  /**
   * ด่านจริงอยู่ที่นี่ ไม่ใช่ที่ปุ่ม — ปิดปุ่มคือ "บอกให้รู้" ส่วนตรงนี้คือ "กันจริง"
   * ลืมปิดปุ่มไปสักที่ หรือมีทางเรียกใหม่ที่ยังไม่ได้ปิด ข้อมูลก็ยังไม่ถูกเขียน
   * (รูปแบบเดียวกับ guard ใน lib/records/RecordsProvider.jsx)
   */
  const canWrite = useAuth().can("record.write");
  const guard = useCallback(
    (name, fn) =>
      (...args) => {
        if (!canWrite) {
          console.warn(
            `[SWINE SYNC] ${name}(): สิทธิ์ปัจจุบันบันทึกการปรับจำนวนไม่ได้ — ไม่มีอะไรถูกบันทึก`
          );
          return null;
        }
        return fn(...args);
      },
    [canWrite]
  );

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      /* เต็มหรือถูกปิดไว้ — ใช้งานต่อได้ในรอบนี้ แค่ไม่ถูกจำไว้รอบหน้า */
    }
  }, [store]);

  /* รวมส่วนต่างของเป้าหมายหนึ่งไว้ล่วงหน้า — หน้ารายการเรียก netOf ทีละหลายสิบครั้งต่อ render
     ถ้าไล่ filter ทุกครั้งจะกลายเป็น O(n × รายการ) โดยไม่จำเป็น */
  const nets = useMemo(() => {
    const map = new Map();
    store.forEach((e) => map.set(e.target, (map.get(e.target) ?? 0) + e.delta));
    return map;
  }, [store]);

  const netOf = useCallback((target) => nets.get(target) ?? 0, [nets]);

  /** ค่าที่ควรแสดงบนหน้าจอ = ค่าตั้งต้นจาก mock + ส่วนต่างที่ผู้ใช้ปรับ (ไม่ต่ำกว่า 0) */
  const valueOf = useCallback(
    (target, base) => Math.max(0, (base ?? 0) + (nets.get(target) ?? 0)),
    [nets]
  );

  const historyOf = useCallback(
    (target) =>
      store.filter((e) => e.target === target).sort((a, b) => (a.at < b.at ? 1 : -1)),
    [store]
  );

  const apply = useCallback((entry) => {
    setStore((all) => [
      ...all,
      {
        ...entry,
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        at: new Date().toISOString(),
      },
    ]);
  }, []);

  const undo = useCallback((id) => {
    setStore((all) => all.filter((e) => e.id !== id));
  }, []);

  const clearTarget = useCallback((target) => {
    setStore((all) => all.filter((e) => e.target !== target));
  }, []);

  const value = useMemo(
    /* ตัวที่อ่านอย่างเดียว (netOf · valueOf · historyOf) ไม่ต้องกัน — ทั้งสองสิทธิ์ดูได้เท่ากัน
       ส่วนสามตัวที่เขียนต้องผ่าน guard หมด */
    () => ({
      netOf,
      valueOf,
      historyOf,
      canWrite,
      apply: guard("apply", apply),
      undo: guard("undo", undo),
      clearTarget: guard("clearTarget", clearTarget),
    }),
    [netOf, valueOf, historyOf, canWrite, guard, apply, undo, clearTarget]
  );

  return <AdjustContext.Provider value={value}>{children}</AdjustContext.Provider>;
}
