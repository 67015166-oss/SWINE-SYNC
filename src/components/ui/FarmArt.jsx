import { useState } from "react";
import FarmScene from "./FarmScene.jsx";
import { asset } from "../../lib/asset.js";

/** ไฟล์ภาพฟาร์มที่จะลองใช้ตามลำดับ — วางไฟล์ชื่อใดชื่อหนึ่งใน public/ ได้เลย */
const SOURCES = [asset("/farm.png"), asset("/farm.jpg"), asset("/farm.webp")];

/**
 * ภาพฟาร์ม (ผังโรงเรือนทั้งฟาร์ม) — ใช้ทุกจุดที่ต้องแสดงรูปฟาร์ม
 *
 * ใช้ภาพจริงจาก public/farm.png ถ้าไม่มีไฟล์จะถอยไปใช้ภาพวาด SVG (FarmScene) อัตโนมัติ
 * เปลี่ยนรูปทั้งระบบ = วางไฟล์ทับที่เดียว ไม่ต้องแก้โค้ด
 * (หน้า /login ไม่ได้ใช้ตัวนี้ เพราะต้องการภาพพื้นหลังเต็มจอคนละแบบ)
 *
 * @param {number} [crop] ใช้เฉพาะตอนถอยไปใช้ภาพวาด (เลือกกรอบภาพให้การ์ดแต่ละใบไม่ซ้ำกัน)
 */
export default function FarmArt({ className = "", crop }) {
  const [index, setIndex] = useState(0);
  const src = SOURCES[index];

  if (!src) return <FarmScene className={className} crop={crop} />;

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
