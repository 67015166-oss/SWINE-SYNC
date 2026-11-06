import { useState } from "react";
import PickerScene from "./PickerScene.jsx";
import { asset } from "../../lib/asset.js";

/** ไฟล์ภาพหัวป๊อบอัพที่จะลองใช้ตามลำดับ — วางไฟล์ชื่อใดชื่อหนึ่งใน public/ ได้เลย */
const SOURCES = [asset("/picker-hero.png"), asset("/picker-hero.jpg"), asset("/picker-hero.webp")];

/**
 * ภาพประกอบหัวป๊อบอัพ — ใช้ภาพจริงจาก public/ ถ้าไม่มีไฟล์จะถอยไปใช้ภาพวาด SVG
 * ใช้ร่วมกันทุกป๊อบอัพที่เป็นแบบ "หัวกลาง + ภาพประกอบ"
 */
export default function PickerArt({ className = "cp-art" }) {
  const [index, setIndex] = useState(0);
  const src = SOURCES[index];

  if (!src) return <PickerScene className={className} />;

  return (
    <img
      className={className}
      src={src}
      alt=""
      onError={() => setIndex((i) => i + 1)}
    />
  );
}
