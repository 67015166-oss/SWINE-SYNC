import { useState } from "react";
import BarnScene from "./BarnScene.jsx";
import { asset } from "../../lib/asset.js";

/** ไฟล์ภาพโรงเรือนที่จะลองใช้ตามลำดับ — วางไฟล์ชื่อใดชื่อหนึ่งใน public/ ได้เลย */
const SOURCES = [asset("/barn.png"), asset("/barn.jpg"), asset("/barn.webp")];

/**
 * ภาพโรงเรือน — ใช้ทุกจุดที่ต้องแสดงรูปโรงเรือน (การ์ดโรงเรือน · แถบเมนู · ป๊อบอัพ)
 *
 * ใช้ภาพจริงจาก public/barn.png ถ้าไม่มีไฟล์จะถอยไปใช้ภาพวาด SVG (BarnScene) อัตโนมัติ
 * เปลี่ยนรูปทั้งระบบ = วางไฟล์ทับที่เดียว ไม่ต้องแก้โค้ด
 *
 * @param {number} [variant] ใช้เฉพาะตอนถอยไปใช้ภาพวาด (สลับรายละเอียดเล็กน้อยของแต่ละใบ)
 */
export default function BarnArt({ className = "", variant = 0 }) {
  const [index, setIndex] = useState(0);
  const src = SOURCES[index];

  if (!src) return <BarnScene className={className} variant={variant} />;

  return (
    <img
      className={className}
      src={src}
      alt=""
      loading="lazy"
      onError={() => setIndex((i) => i + 1)}
    />
  );
}
