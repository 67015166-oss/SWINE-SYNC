/**
 * ผูกบัญชีไลน์กับผู้ใช้ในระบบ (T1.363) — ฝั่งหน้าเว็บ
 *
 * ★★ การผูกคือ **การให้สิทธิ์** ไม่ใช่การตั้งค่าหน้าจอ
 *   ผูกแล้วบัญชีไลน์นั้นพูดแทนผู้ใช้คนนั้นได้ — บันทึกที่พิมพ์เข้ามาจะถูกนับว่าเป็นของเขา
 *   จึงเป็นของผู้ดูแลระบบเท่านั้น และหลังบ้านบันทึกลงประวัติกิจกรรมทุกครั้ง
 */
import { useCallback, useEffect, useState } from "react";
import { apiConfigured, apiGet, apiPut } from "./client.js";

export function useLineLinks(enabled = true) {
  const [state, setState] = useState({ links: [], status: "idle", error: null });

  const load = useCallback(() => {
    if (!enabled) return;
    if (!apiConfigured) {
      setState({ links: [], status: "error", error: "ยังไม่ได้ต่อกับเซิร์ฟเวอร์" });
      return;
    }
    setState((p) => ({ ...p, status: p.links.length ? p.status : "loading" }));
    apiGet("/line/links")
      .then((r) => setState({ links: r.links ?? [], status: "ok", error: null }))
      /* ★ ล้างรายการทิ้งด้วย — รายการเก่าคู่กับคำว่า "ต่อไม่ได้" ทำให้คนเข้าใจว่าเห็นครบแล้ว */
      .catch((err) => setState({ links: [], status: "error", error: err?.message ?? "ต่อไม่ได้" }));
  }, [enabled]);

  useEffect(load, [load]);

  /**
   * ผูก (ส่ง userId) หรือถอน (ส่ง null)
   * ★ ไม่ทำแบบมองโลกในแง่ดี — ของแบบนี้ต้องให้หลังบ้านยืนยันก่อนค่อยเปลี่ยนหน้าจอ
   *   ถ้าโชว์ว่าผูกแล้วทั้งที่ยังไม่สำเร็จ ผู้ดูแลจะเดินจากไปโดยคิดว่าเรียบร้อย
   */
  const setLink = useCallback(
    (lineUserId, userId) =>
      apiPut(`/line/links/${encodeURIComponent(lineUserId)}`, { userId })
        .then((r) => {
          load();
          return r;
        })
        .catch((err) => {
          setState((p) => ({ ...p, error: err?.message ?? "บันทึกไม่สำเร็จ" }));
          throw err;
        }),
    [load],
  );

  return { ...state, setLink, reload: load };
}
