/**
 * สิทธิ์ไมโครโฟนของหน้านี้ — ใช้ร่วมกันทั้งไมค์ในแชท และป๊อบอัพ/หน้า Voice AI (T1.249)
 *
 * **ทำไมต้องขอสิทธิ์ที่หน้าแม่ก่อน** ทั้งที่ไมค์จริงอยู่ในเว็บ Farmy (ในกรอบ)
 * Chrome ผูกสิทธิ์ไมค์ของกรอบที่ได้ `allow="microphone"` ไว้กับ **โดเมนของหน้าแม่**
 * (localhost:8080 ฯลฯ) — อนุญาตที่หน้าแม่ครั้งเดียว กรอบใช้ได้เลยโดยไม่ถามซ้ำ
 * กลับกัน ถ้าหน้าแม่ถูกบล็อกไว้ ไมค์ในกรอบก็ใช้ไม่ได้ และเว็บในกรอบบอกเหตุผลเราไม่ได้
 * จึงต้องให้หน้าเราเป็นคนเช็กและบอกทางแก้เอง
 *
 * **ไมค์ในแชท** เดิมกดค้างครั้งแรก Chrome เด้งถามสิทธิ์ พอปล่อยนิ้วไปกด "อนุญาต" การฟังก็ถูกยกเลิก
 * ผู้ใช้เลยเห็นว่า "กดแล้วไม่เกิดอะไร" ➜ ขอสิทธิ์ให้เสร็จก่อน แล้วค่อยให้กดค้างพูด
 *
 * state:
 *   "granted"  อนุญาตแล้ว
 *   "prompt"   ยังไม่เคยถาม — ต้องกดขอ
 *   "denied"   ถูกบล็อก — ต้องไปเปิดในการตั้งค่าเว็บไซต์ของเบราว์เซอร์ (ขอซ้ำจากโค้ดไม่ได้)
 *   "no-device" ขอแล้วแต่ไม่เจอไมค์ในเครื่อง
 *   "insecure" หน้าเปิดผ่าน http ที่ไม่ใช่ localhost — เบราว์เซอร์ปิดไมค์ทั้งหน้า
 *   "unknown"  เบราว์เซอร์ไม่บอกสถานะ (บางรุ่นไม่รองรับ permissions.query ของไมค์) — ให้กดขอได้
 */
import { useCallback, useEffect, useState } from "react";

const initial = () => {
  if (typeof window === "undefined") return "unknown";
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return "insecure";
  return "unknown";
};

export function useMicPermission() {
  const [state, setState] = useState(initial);

  /* อ่านสถานะจริง + ฟังตอนผู้ใช้ไปเปลี่ยนในการตั้งค่าเว็บไซต์ (Chrome ส่ง change ให้) */
  useEffect(() => {
    if (initial() === "insecure" || !navigator.permissions?.query) return undefined;
    let status = null;
    let alive = true;
    const sync = () => alive && status && setState(status.state);
    navigator.permissions
      .query({ name: "microphone" })
      .then((s) => {
        status = s;
        sync();
        s.addEventListener("change", sync);
      })
      .catch(() => {
        /* Firefox รุ่นเก่า ๆ ไม่รู้จัก "microphone" — ปล่อยเป็น unknown ให้กดขอได้ */
      });
    return () => {
      alive = false;
      status?.removeEventListener("change", sync);
    };
  }, []);

  /**
   * ขอสิทธิ์ — เปิดไมค์แล้วปิดทันที (ไม่ได้อัดเสียงอะไร แค่ให้เบราว์เซอร์เด้งถาม)
   * @returns {Promise<string>} สถานะหลังขอ
   */
  const request = useCallback(async () => {
    if (initial() === "insecure") return "insecure";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setState("granted");
      return "granted";
    } catch (err) {
      const next =
        err?.name === "NotFoundError" || err?.name === "OverconstrainedError"
          ? "no-device"
          : "denied";
      setState(next);
      return next;
    }
  }, []);

  return { state, request };
}

/**
 * ข้อความบอกผู้ใช้ตามสถานะ — คีย์ไทยสำหรับ t() · null = ไม่ต้องบอกอะไร
 * (แชทกับป๊อบอัพใช้ชุดเดียวกัน คนจะได้เจอวิธีแก้แบบเดียวกันทุกที่)
 */
export const MIC_STATE_TEXT = {
  prompt: "ก่อนพูดสั่งงาน ต้องอนุญาตให้หน้านี้ใช้ไมโครโฟนก่อน",
  unknown: "ก่อนพูดสั่งงาน ต้องอนุญาตให้หน้านี้ใช้ไมโครโฟนก่อน",
  /* **ต้องบอกสองชั้น** — บน macOS ต่อให้กดอนุญาตในเบราว์เซอร์แล้ว ถ้าระบบปฏิบัติการ
     ยังไม่ให้เบราว์เซอร์ตัวนั้นใช้ไมโครโฟน ก็ยังใช้ไม่ได้ และ getUserMedia โยน
     NotAllowedError เหมือนกันเป๊ะทั้งสองกรณี แยกจากโค้ดไม่ได้ จึงต้องบอกทั้งคู่
     (ผู้ใช้เจอเองตอนเปิดที่ localhost:8080 ซึ่งเป็นหน้าที่เบราว์เซอร์ยอมให้ใช้ไมค์อยู่แล้ว) */
  denied:
    "ไมโครโฟนถูกปิดอยู่ — (1) กดไอคอนทางซ้ายของช่องที่อยู่เว็บ → ไมโครโฟน → อนุญาต แล้วรีเฟรช (2) ถ้ายังไม่ได้ ให้เปิดสิทธิ์ไมโครโฟนของเบราว์เซอร์ในการตั้งค่าเครื่อง (Mac: System Settings → Privacy & Security → Microphone)",
  "no-device": "ไม่เจอไมโครโฟนในเครื่อง — ตรวจว่าเสียบหรือเปิดไมค์อยู่ แล้วลองอีกครั้ง",
  insecure:
    "หน้านี้เปิดผ่าน http เบราว์เซอร์จึงไม่ให้ใช้ไมโครโฟน — เปิดผ่าน localhost หรือ https แทน",
  granted: null,
};

/** ข้อผิดพลาดของตัวถอดเสียง (Web Speech API) → คีย์ไทยสำหรับ t() */
export const DICTATION_ERROR_TEXT = {
  "not-allowed": MIC_STATE_TEXT.denied,
  "service-not-allowed":
    "เบราว์เซอร์นี้ไม่เปิดบริการถอดเสียง — ใช้ Google Chrome หรือ Microsoft Edge",
  "audio-capture": MIC_STATE_TEXT["no-device"],
  network:
    "ถอดเสียงไม่ได้ เพราะต่อบริการถอดเสียงของเบราว์เซอร์ทางอินเทอร์เน็ตไม่ได้ — ตรวจเน็ต หรือลองเครือข่ายอื่น",
  "no-speech": "ไม่ได้ยินเสียงพูด — กดค้างแล้วพูดใกล้ไมค์อีกครั้ง",
  "language-not-supported": "บริการถอดเสียงไม่รองรับภาษานี้ — ลองเปลี่ยนภาษาของแอป",
};
