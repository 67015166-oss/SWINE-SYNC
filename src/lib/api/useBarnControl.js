/**
 * ทะเบียนอุปกรณ์และคำสั่งของโรงเรือนจริง — อ่านจากกล่อง (T1.336)
 *
 * ก่อนหน้านี้หน้าสภาพแวดล้อมเรียก `getEquipment()` ของข้อมูลตัวอย่างกับทุกโรงเรือน
 * โรงเรือนจริงจึงได้ชุด "ไม่มีสัญญาณ" แล้ว **สวิตช์ถูกล็อกทั้งการ์ด** (`locked = !online`)
 * ทั้งที่กล่องรับคำสั่งได้จริงและมีด่านความปลอดภัยของตัวเองอยู่แล้ว
 * — คือเสียความสามารถที่มีอยู่จริงไป เพราะหน้าจอไม่เคยถามกล่องว่ามีอะไร
 *
 * ★ ดึงสองเส้นทางพร้อมกัน เพราะสองอย่างนี้ตอบคำถามต่างกัน
 *     /state     มีอุปกรณ์อะไรให้สั่ง · โรงเรือนยังเปิดใช้งานไหม · ส่งออกได้ไหม
 *     /commands  คำสั่งล่าสุดของแต่ละตัวไปถึงไหน (รวมใบที่ด่านปฏิเสธ)
 *   ขาดอันไหนก็ยังใช้ได้ — `/commands` ล้มแล้วได้ชุดอุปกรณ์ที่ไม่มีบรรทัด "สั่งล่าสุด"
 *   ดีกว่าทั้งการ์ดว่างเปล่า
 *
 * ★ ไม่มี polling — ทะเบียนอุปกรณ์แทบไม่เปลี่ยน และสถานะการทำงานกล่องก็ไม่ส่งมาให้
 *   ดึงซ้ำทุกไม่กี่วินาทีจึงได้ค่าเดิมเปล่า ๆ · หลังกดสั่งค่อยเรียก `reload()`
 */
import { useCallback, useEffect, useState } from "react";
import { apiConfigured } from "./client.js";
import { fetchControlHistory, fetchControlState } from "./control.js";
import { equipmentFromBox } from "../controlEquipment.js";

const EMPTY = { equipment: null, commands: [], status: "idle", error: null };

/**
 * @param {string|null} barnKey รหัสโรงเรือนแบบหน้าเว็บ ("F-KPP-A1") — null = ไม่ต้องถามกล่อง
 * @returns {{equipment: object|null, commands: Array,
 *            status: "idle"|"loading"|"ok"|"error", error: Error|null, reload: () => void}}
 *          `equipment` เป็น null = ยังไม่มีของจริง ให้ผู้เรียกถอยไปใช้ชุดตัวอย่างเอง
 */
export function useBarnControl(barnKey) {
  const [state, setState] = useState(EMPTY);
  /* นับรอบการกด "ดึงใหม่" — เปลี่ยนค่าแล้ว effect ทำงานซ้ำโดยไม่ต้องถือ AbortController ไว้ข้างนอก */
  const [round, setRound] = useState(0);
  const reload = useCallback(() => setRound((n) => n + 1), []);

  useEffect(() => {
    if (!barnKey || !apiConfigured) {
      setState(EMPTY);
      return undefined;
    }

    const controller = new AbortController();
    /* ★ คงของเดิมไว้ระหว่างโหลด ห้ามล้างเป็นค่าว่าง — ไม่งั้นการ์ดกระพริบเป็นช่องว่าง
       ทุกครั้งที่กดสั่งแล้วดึงใหม่ (บทเรียนเดียวกับ T1.333) */
    setState((prev) => ({ ...prev, status: "loading", error: null }));

    Promise.all([
      fetchControlState(barnKey, controller.signal),
      fetchControlHistory(barnKey, controller.signal).catch(() => null),
    ])
      .then(([st, hist]) => {
        if (controller.signal.aborted) return;
        const commands = hist?.commands ?? [];
        setState({
          equipment: equipmentFromBox(st, commands),
          commands,
          status: "ok",
          error: null,
        });
      })
      .catch((err) => {
        if (err?.name === "AbortError" || controller.signal.aborted) return;
        /* ★ ล้มแล้วต้องคืน `equipment: null` จริง ๆ — ผู้เรียกจะได้ถอยไปชุดตัวอย่างอย่างชัดเจน
           ไม่ใช่ค้างชุดเดิมไว้โดยที่หน้าจอไม่รู้ว่าข้อมูลนั้นเก่าแล้ว */
        setState({ equipment: null, commands: [], status: "error", error: err });
      });

    return () => controller.abort();
  }, [barnKey, round]);

  return { ...state, reload };
}
