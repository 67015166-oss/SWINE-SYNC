import { useEffect, useMemo, useState } from "react";
import CameraScene from "./CameraScene.jsx";
import { asset } from "../../lib/asset.js";
import { useT } from "../../lib/i18n/useT.js";

/** ไฟล์ภาพนิ่งที่จะลองใช้ตามลำดับ — วางไฟล์ทับใน public/camera/ ได้เลยโดยไม่ต้องแก้โค้ด */
const FILE_SOURCES = [asset("/camera/barn-detect.jpg"), asset("/camera/barn-detect.png"), asset("/camera/barn-detect.webp")];

/**
 * ภาพจากกล้อง AI ในโรงเรือน — ไล่หาแหล่งภาพลงมาทีละชั้น
 *
 *   1. **สตรีมสด** จาก prop `stream` (ยังไม่มีกล้องจริง จึงยังไม่มีใครส่งค่านี้มา)
 *   2. **ไฟล์ภาพนิ่ง** ใน `public/camera/` ← ที่ใช้อยู่ตอนนี้
 *   3. **ฉากวาด SVG** (`CameraScene`) — ตัวสำรองสุดท้าย ไม่ต้องพึ่งไฟล์ใด ๆ
 *
 * ชั้นไหนโหลดไม่ขึ้นจะถอยไปชั้นถัดไปเองอัตโนมัติ (onError) — กล้องดับแล้วหน้าจอไม่ว่าง
 *
 * **รองรับ MJPEG อยู่แล้ว**: สตรีม MJPEG (`multipart/x-mixed-replace`) เปิดได้ด้วย `<img src>`
 * ตรง ๆ เบราว์เซอร์จะไล่เฟรมให้เอง ไม่ต้องมี library หรือ <video>
 * ต่อกล้องจริงเมื่อไหร่ให้ส่ง URL ของสตรีมเข้ามาทาง `stream` เช่น
 *   <CameraView stream="http://192.168.1.50:8080/stream.mjpg" />
 * แล้วโครงที่เหลือใช้ต่อได้เลย (ที่มาของ URL คือ `camera.stream` ใน data/mock/barnsByFarm.js)
 *
 * ⚠️ สตรีม HLS/RTSP/WebRTC ใช้แท็กนี้ไม่ได้ ต้องมีตัวเล่นแยก — ถ้าวันหน้าจะรองรับ
 * ให้แตกเป็น component ใหม่ อย่าดัดตรงนี้
 *
 * @param {string}  [className] คลาสของกรอบภาพ
 * @param {number}  [flagIndex] ลำดับตัวที่ AI ทำเครื่องหมาย "เฝ้าดู" (ใช้เฉพาะตอนถอยไปใช้ฉากวาด)
 * ═══ ★★ กล้องจริงห้ามถอยไปใช้ภาพตัวอย่าง (T1.356) ═══
 * การถอยทีละชั้นข้างบนถูกต้องสำหรับกล้องตัวอย่าง แต่**ผิดอันตรายกับกล้องจริง**
 * กล้องจริงดับแล้วหน้าจอจะขึ้นภาพเล้าสวย ๆ ที่คนดูเข้าใจว่าเป็นภาพสดของเล้านั้น
 * ทั้งที่เป็นไฟล์ภาพนิ่งที่เราแถมมากับแอป — คนเฝ้าเวรจะเชื่อว่าเล้าปกติดีทั้งที่ไม่เห็นอะไรเลย
 *
 * ส่ง `live` มาด้วยเมื่อเป็นกล้องจริง แล้วภาพที่โหลดไม่ขึ้นจะกลายเป็น `onLost`
 * ให้ผู้เรียกไปขึ้นป้าย "ไม่มีสัญญาณ" แทน **ไม่ถอยไปชั้นไหนทั้งนั้น**
 *
 * @param {string}  [stream]    URL ของสตรีม MJPEG ถ้ามีกล้องจริงแล้ว
 * @param {boolean} [live]      นี่คือกล้องจริง — ห้ามถอยไปใช้ภาพตัวอย่าง
 * @param {Function}[onLost]    เรียกเมื่อกล้องจริงโหลดภาพไม่ขึ้น
 * @param {string}  [alt]       คำอธิบายภาพสำหรับผู้ใช้โปรแกรมอ่านหน้าจอ
 */
export default function CameraView({
  className = "",
  flagIndex = -1,
  stream = null,
  live = false,
  onLost,
  alt,
}) {
  const t = useT();
  const label = alt ?? t("ภาพจากกล้อง AI ภายในโรงเรือน พร้อมกรอบตรวจจับสุกร");
  /* ★ กล้องจริงมีแหล่งเดียวคือสตรีมของมันเอง ไม่มีชั้นสำรอง */
  const sources = useMemo(
    () => (live ? (stream ? [stream] : []) : stream ? [stream, ...FILE_SOURCES] : FILE_SOURCES),
    [stream, live]
  );
  const [index, setIndex] = useState(0);

  /* เปลี่ยนกล้อง (คนละสตรีม) ต้องเริ่มไล่แหล่งภาพใหม่ ไม่งั้นกล้องตัวถัดไปจะข้ามสตรีมของตัวเอง */
  useEffect(() => setIndex(0), [sources]);

  const src = sources[index];
  /* กล้องจริงที่ไม่มีภาพ = ไม่มีสัญญาณ ให้ผู้เรียกตัดสินใจว่าจะขึ้นอะไร
     ห้ามถอยไปฉากวาด เพราะฉากวาดก็เป็นภาพปลอมเหมือนกัน */
  if (!src) return live ? null : <CameraScene className={className} flagIndex={flagIndex} />;

  return (
    <img
      className={className}
      src={src}
      alt={label}
      onError={() => {
        /* กล้องจริงไม่มีชั้นถัดไปให้ถอย — บอกผู้เรียกไปขึ้นป้าย "ไม่มีสัญญาณ" */
        if (live) onLost?.();
        setIndex((i) => i + 1);
      }}
    />
  );
}
