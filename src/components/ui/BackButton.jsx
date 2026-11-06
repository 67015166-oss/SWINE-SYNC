import { useLocation, useNavigate } from "react-router-dom";
import Icon from "./Icon.jsx";
import "./ui.css";
import { useT } from "../../lib/i18n/useT.js";

/**
 * ปุ่มย้อนกลับไปหน้าก่อนหน้า — อยู่ที่ส่วนหัวของทุกโครงหน้าในแดชบอร์ด
 *
 * เป็นลูกศรอย่างเดียวทุกที่ ไม่มีแบบมีข้อความอีกแล้ว — ปุ่มเดียวกันต้องหน้าตาเดียวกัน
 * ทุกหน้า ไม่งั้นผู้ใช้ต้องมองหาใหม่ทุกครั้งที่เปลี่ยนโครงหน้า
 * คำว่า "ย้อนกลับ" ยังอยู่ในปุ่มให้โปรแกรมอ่านหน้าจออ่าน แค่ไม่แสดงด้วยตา
 * (ถ้าลบทิ้งเลยจะกลายเป็นปุ่มไม่มีชื่อ คนที่ใช้โปรแกรมอ่านหน้าจอจะไม่รู้ว่าปุ่มนี้ทำอะไร)
 *
 * เปิดหน้านั้นตรง ๆ จาก URL (ยังไม่มีหน้าก่อนหน้าให้ย้อน) จะพาไปหน้าใน `fallback` แทน
 * ผู้ใช้จึงไม่มีทางกดแล้วค้างอยู่ที่เดิม
 *
 * @param {string} [fallback] ปลายทางเมื่อไม่มีประวัติให้ย้อน (ค่าเริ่มต้น: หน้าภาพรวม)
 */
export default function BackButton({ fallback = "/dashboard" }) {
  const t = useT();
  const navigate = useNavigate();
  const { key, pathname } = useLocation();

  /* key = "default" คือหน้านี้เป็นหน้าแรกที่เปิด ยังไม่มีประวัติให้ย้อนกลับ */
  const canGoBack = key !== "default";

  /* หน้าที่เป็นปลายทางของ fallback อยู่แล้ว (หน้าภาพรวม = หน้าแรกของแดชบอร์ด) ไม่ต้องมีปุ่มย้อนกลับ */
  if (pathname === fallback) return null;

  return (
    <button
      type="button"
      className="back-btn"
      onClick={() => (canGoBack ? navigate(-1) : navigate(fallback))}
    >
      <Icon name="chevron" size={18} className="back-btn-icon" />
      <span className="sr-only">{t("ย้อนกลับ")}</span>
    </button>
  );
}
