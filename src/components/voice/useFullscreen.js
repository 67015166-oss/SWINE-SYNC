/**
 * เต็มจอ — ใช้กับกรอบ Voice AI ทั้งในป๊อบอัพและหน้า /dashboard/voice (T1.250)
 *
 * ใช้ Fullscreen API ของเบราว์เซอร์ก่อน (เต็มจอจริง ซ่อนแถบเบราว์เซอร์ · Esc ออกได้เอง)
 * เบราว์เซอร์ที่ไม่ยอมให้ element เต็มจอ (Safari บน iPhone) → **เต็มหน้าต่างแทน**
 * (position: fixed ทับทั้งหน้า) ไม่ซ่อนปุ่มทิ้ง ไม่งั้นคนใช้มือถือกดแล้วไม่เกิดอะไร
 *
 * @param {{ current: HTMLElement | null }} ref element ที่จะขยายเต็มจอ
 */
import { useCallback, useEffect, useState } from "react";

const nativeSupported = () =>
  typeof document !== "undefined" &&
  document.fullscreenEnabled &&
  typeof document.documentElement.requestFullscreen === "function";

export function useFullscreen(ref) {
  const [native, setNative] = useState(false);
  const [pseudo, setPseudo] = useState(false);

  useEffect(() => {
    const sync = () => setNative(Boolean(ref.current) && document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [ref]);

  /* แบบเต็มหน้าต่าง: Esc ต้องออกได้เหมือนเต็มจอจริง
     capture + stopPropagation — ไม่งั้น Esc ไปถึงป๊อบอัพแล้วปิดทั้งป๊อบอัพแทนที่จะแค่ย่อ */
  useEffect(() => {
    if (!pseudo) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setPseudo(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pseudo]);

  const exit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    setPseudo(false);
  }, []);

  const enter = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (nativeSupported()) {
      /* ขอเต็มจอจริงไม่สำเร็จ (บางเบราว์เซอร์ปฏิเสธ) → ถอยไปเต็มหน้าต่าง */
      el.requestFullscreen().catch(() => setPseudo(true));
    } else {
      setPseudo(true);
    }
  }, [ref]);

  /* ถอดคอมโพเนนต์ทิ้งระหว่างเต็มจอ (เช่นปิดป๊อบอัพ) — ต้องออกจากเต็มจอด้วย ไม่งั้นจอดำค้าง */
  useEffect(
    () => () => {
      if (ref.current && document.fullscreenElement === ref.current) {
        document.exitFullscreen?.().catch(() => {});
      }
    },
    [ref],
  );

  const active = native || pseudo;
  return { active, pseudo, enter, exit, toggle: active ? exit : enter };
}
