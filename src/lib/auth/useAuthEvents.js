/**
 * บันทึกการเข้าใช้งานจากเซิร์ฟเวอร์ — ใช้ในหน้าตั้งค่า หมวดบัญชี (T1.255)
 *
 * **ที่มาเดียวกับช่อง "เข้าล่าสุด" ของหน้าจัดการผู้ใช้** (ตาราง auth_event)
 * เวลาสองที่จึงตรงกันเสมอ ไม่ว่าจะเข้าจากเครื่องไหน
 *
 * โหลดใหม่ทุกครั้งที่ `active` เป็นจริง (เปิดป๊อบอัพตั้งค่า) และทุกครั้งที่สลับบัญชี
 * — ไม่เก็บค้างไว้ เพราะคนอื่นอาจเพิ่งเข้าจากอีกเครื่องระหว่างนั้น
 *
 * @param {boolean} active  เปิดหน้าที่ต้องใช้อยู่ไหม
 * @param {string}  userId  บัญชีที่เข้าอยู่ ("" = ยังไม่ได้เข้า ไม่ต้องถาม เซิร์ฟเวอร์ตอบ 401 แน่นอน)
 * @param {number}  limit   จำนวนบรรทัดที่ขอ
 * @returns {{ status: "idle"|"loading"|"ready"|"error", scope: "all"|"self", events: object[] }}
 */
import { useEffect, useState } from "react";
import { fetchAuthEvents } from "./authApi.js";

const IDLE = { status: "idle", scope: "self", events: [] };

export function useAuthEvents(active, userId, limit) {
  const [data, setData] = useState(IDLE);

  useEffect(() => {
    if (!active || !userId) {
      setData(IDLE);
      return undefined;
    }
    let alive = true;
    setData((cur) => ({ ...cur, status: "loading" }));
    fetchAuthEvents(limit).then((res) => {
      if (!alive) return;
      setData(res.ok ? { status: "ready", scope: res.scope, events: res.events } : { ...IDLE, status: "error" });
    });
    return () => {
      alive = false;
    };
  }, [active, userId, limit]);

  return data;
}
