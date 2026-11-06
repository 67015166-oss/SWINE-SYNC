/**
 * กล้อง AI ของทีม VISION SWINE — ฝั่งหน้าเว็บ (T1.356)
 *
 * ทุกอย่างวิ่งผ่าน `/api/vision` ของหลังบ้านเราเอง **ห้ามยิงไปหาเครื่องเขาตรง ๆ**
 * หน้าเว็บเป็น https ส่วนของเขาเป็น http เบราว์เซอร์จะบล็อกทิ้งเงียบ ๆ
 * และที่อยู่ของเขาอยู่ในเครือข่ายส่วนตัว คนที่เปิดจากข้างนอกเรียกไม่ถึง
 *
 * ═══ ★★ ตอนนี้มีกล้องจริงตัวเดียว ═══
 * ทีมเขาต่อ Jetson Nano มาทดสอบหนึ่งชุด **ห้ามเอาภาพเดียวกันไปแปะแทนกล้องทุกตัว**
 * กล้องที่เหลือยังเป็นของตัวอย่าง ต้องขึ้นว่าตัวอย่างตามเดิม
 * ผูกไว้ที่ `REAL_CAMERA` ที่เดียว — ย้ายกล้องไปโรงเรือนอื่นให้แก้ตรงนั้นจุดเดียว
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost, apiUrl, apiConfigured } from "./client.js";

/**
 * กล้องจริงตัวเดียวที่มีอยู่ตอนนี้ ผูกกับโรงเรือนไหน
 *
 * ★ `F-KPP-A1` เป็นโรงเรือนเดียวที่ต่อข้อมูลจริงอยู่แล้ว จึงวางไว้ที่นี่ก่อน
 *   แต่**ตัวกล้องยังตั้งอยู่ที่โต๊ะของทีมเขา ไม่ได้อยู่ในเล้าจริง** ถ้ายกไปติดที่อื่น
 *   ให้แก้ `barnKey` ตรงนี้จุดเดียว ทั้งหน้าจะตามเอง
 */
export const REAL_CAMERA = {
  barnKey: "F-KPP-A1",
  /** ตรงกับ `cameras[0].id` ของโรงเรือนนั้น — กล้องตัวแรกเป็นตัวแทนบนผนังรวม */
  cameraId: "CAM-1",
  name: "กล้อง AI จริง (VISION SWINE)",
};

/** โรงเรือนหนึ่งคือหลังที่มีกล้องจริงไหม */
export const isRealCamera = (barnKey, cameraId) =>
  barnKey === REAL_CAMERA.barnKey && (cameraId == null || cameraId === REAL_CAMERA.cameraId);

/** ถามสถานะถี่แค่ไหน — ของเขาเดินที่ ~12 เฟรม/วินาที ตัวเลขนับเปลี่ยนตลอด
    แต่ถามทุกวินาทีก็ไม่ได้ช่วยให้คนอ่านทัน และเป็นการรบกวนกล่องเขาเปล่า ๆ */
const POLL_MS = 5000;

/** ขอตั๋วใหม่ก่อนใบเดิมหมดอายุเท่าไร — เผื่อเวลาเดินทางและเครื่องช้า */
const TICKET_EARLY_MS = 10_000;

/**
 * สถานะและตัวเลขของกล้องจริง
 *
 * ★ **ล้มแล้วต้องบอกว่าล้ม ห้ามคืนค่าเก่าค้างไว้เฉย ๆ** ไม่งั้นคนดูจะอ่านเลขเมื่อวาน
 *   แล้วนึกว่าเป็นของตอนนี้ — อันตรายกว่าหน้าจอว่าง
 *
 * @returns {{state:"working"|"idle"|"down"|"unknown"|"loading", counts:object|null,
 *            fps:number|null, why:string|null, at:string|null, ok:boolean}}
 */
export function useVisionHealth(enabled = true) {
  const [s, setS] = useState({ state: "loading", counts: null, fps: null, why: null, at: null, ok: false });

  useEffect(() => {
    if (!enabled || !apiConfigured) {
      setS({ state: "down", counts: null, fps: null, why: "ยังไม่ได้ต่อกับเซิร์ฟเวอร์", at: null, ok: false });
      return undefined;
    }
    const controller = new AbortController();
    const load = () =>
      apiGet("/vision/health", { signal: controller.signal })
        .then((r) => {
          if (controller.signal.aborted) return;
          setS({
            state: r.ai?.state ?? "unknown",
            why: r.ai?.why ?? null,
            counts: r.counts ?? null,
            fps: r.camera?.fps ?? null,
            at: r.at ?? null,
            ok: Boolean(r.camera?.ok),
          });
        })
        .catch((err) => {
          if (err?.name === "AbortError" || controller.signal.aborted) return;
          /* ★ ล้างตัวเลขทิ้งด้วย ไม่ใช่เก็บของเก่าไว้ข้าง ๆ คำว่า "ขัดข้อง" */
          setS({ state: "down", counts: null, fps: null, why: err?.message ?? "ต่อไม่ได้", at: null, ok: false });
        });

    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [enabled]);

  return s;
}

/**
 * ที่อยู่ภาพสดที่ `<img>` เปิดได้
 *
 * ★★ `<img>` แนบหัว `Authorization` ไม่ได้ เบราว์เซอร์เป็นคนไปดึงเอง
 *   จึงต้องขอ**ตั๋วชั่วคราว**จากหลังบ้านก่อน แล้วต่อท้าย URL
 *   (ห้ามเอา token ของ session ใส่ใน URL — ไปโผล่ใน log และประวัติเบราว์เซอร์)
 *
 * ★ ตั๋วอายุสั้น จึงต้องต่ออายุเองก่อนหมด ไม่งั้นภาพจะดับเงียบ ๆ หลังผ่านไปหนึ่งนาที
 *   และคนดูจะนึกว่ากล้องเสีย ทั้งที่กล้องยังดีอยู่
 */
export function useVisionStreamUrl(enabled = true) {
  const [url, setUrl] = useState(null);
  const timer = useRef(null);

  const renew = useCallback(() => {
    if (!enabled || !apiConfigured) return;
    apiPost("/vision/ticket")
      .then(({ ticket, expiresInSec }) => {
        setUrl(`${apiUrl("/vision/stream")}?ticket=${encodeURIComponent(ticket)}`);
        const next = Math.max(5_000, expiresInSec * 1000 - TICKET_EARLY_MS);
        clearTimeout(timer.current);
        timer.current = setTimeout(renew, next);
      })
      /* ขอตั๋วไม่ได้ = ไม่มีภาพให้ดู ปล่อยเป็น null ให้หน้าจอขึ้น "ไม่มีสัญญาณ" */
      .catch(() => setUrl(null));
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setUrl(null);
      return undefined;
    }
    renew();
    return () => clearTimeout(timer.current);
  }, [enabled, renew]);

  return url;
}
