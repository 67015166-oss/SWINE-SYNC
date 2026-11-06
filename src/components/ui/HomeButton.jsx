import { useLocation, useNavigate } from "react-router-dom";
import Icon from "./Icon.jsx";
import { OVERVIEW_PATH } from "../../lib/theme/themes.js";
import "./ui.css";
import { useT } from "../../lib/i18n/useT.js";

/**
 * ปุ่ม "หน้าแรก" — พากลับหน้าภาพรวมเสมอ
 *
 * ต่างจากปุ่มย้อนกลับตรงที่ปุ่มนั้นถอยทีละก้าวตามประวัติ ส่วนปุ่มนี้กระโดดกลับจุดตั้งต้นทันที
 * ไม่ว่าจะหลงไปลึกแค่ไหน — เป็นปุ่มรีเซ็ตการเดินทางของผู้ใช้
 *
 * **จงใจไม่ผูกกับค่า "หน้าที่เปิดตอนเข้าระบบ" ในป๊อบอัพตั้งค่า** — เคยผูกไว้แล้วเกิดเรื่อง:
 * ผู้ใช้ตั้งค่านั้นเป็นหน้าสภาพแวดล้อม พอกดปุ่มที่เขียนว่า "หน้าแรก" มันเลยเด้งไปหน้าสภาพแวดล้อม
 * ทั้งที่คำว่าหน้าแรกในแอปนี้หมายถึงหน้าภาพรวมหน้าเดียว (ผู้ใช้ยืนยันเอง)
 * ป้ายบนปุ่มต้องบอกปลายทางได้ถูกเสมอโดยไม่ต้องไปเปิดดูหน้าตั้งค่าก่อน
 *
 * เคยลองซ่อนปุ่มนี้เพราะซ้ำกับเมนู "ภาพรวม" ที่อยู่ข้าง ๆ — ผู้ใช้ไม่เอา อย่าเอาออกอีก
 */

export default function HomeButton() {
  const t = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  /* ยืนอยู่หน้าภาพรวมแล้ว ปุ่มไม่ต้องขึ้น (กดไปก็ไม่มีอะไรเกิดขึ้น) */
  if (pathname === OVERVIEW_PATH) return null;

  return (
    <button
      type="button"
      className="home-btn"
      onClick={() => navigate(OVERVIEW_PATH)}
      title={t("กลับไปหน้าภาพรวม")}
    >
      <Icon name="home" size={18} />
      <span className="home-btn-text">{t("หน้าแรก")}</span>
    </button>
  );
}
