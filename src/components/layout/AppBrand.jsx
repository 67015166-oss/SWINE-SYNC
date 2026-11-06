/**
 * ขีดสามขีด + โลโก้ — หัวแถบบนของทุกโครงหน้า (ผู้ใช้สั่ง 2 ก.ย. 2569)
 *
 * เดิมโลโก้ "SWINE SYNC / SMART FARM SOLUTION" อยู่ **ในแถบเมนูซ้าย**
 * พอแถบถูกซ่อนเป็นค่าตั้งต้น โลโก้ก็จะหายไปด้วย จึงย้ายขึ้นมาอยู่บนแถบบน
 * แล้ววางปุ่มขีดสามขีดไว้ "หน้าโลโก้" ตามที่ผู้ใช้สั่ง
 *
 * **ปุ่มต้องบอกสถานะด้วยข้อความ ไม่ใช่รูปอย่างเดียว** — `aria-expanded` บอกว่ากางอยู่ไหม
 * และ `title`/`aria-label` เปลี่ยนตามสถานะ (เปิดเมนู / ปิดเมนู)
 *
 * @param {boolean} [compact] แถบบนที่แคบ (หน้าโรงเรือน) — ย่อเหลือชื่อบรรทัดเดียว
 */
import { Link } from "react-router-dom";
import Icon from "../ui/Icon.jsx";
import { OVERVIEW_PATH } from "../../lib/theme/themes.js";
import { useSidebar } from "../../lib/nav/useSidebar.js";
import { useT } from "../../lib/i18n/useT.js";
import "./AppBrand.css";

export default function AppBrand({ compact = false }) {
  const t = useT();
  const { open, toggleSidebar } = useSidebar();

  return (
    <div className={"brand-head" + (compact ? " is-compact" : "")}>
      <button
        type="button"
        className={"brand-burger" + (open ? " is-on" : "")}
        aria-expanded={open}
        aria-controls="app-sidebar"
        aria-label={open ? t("ปิดเมนู") : t("เปิดเมนู")}
        title={open ? t("ปิดเมนู") : t("เปิดเมนู")}
        onClick={(e) => toggleSidebar(e.currentTarget)}
      >
        <Icon name={open ? "cross" : "menu"} size={22} />
      </button>

      {/* โลโก้ = กลับหน้าภาพรวมเสมอ ไม่ตามค่า "หน้าเปิดระบบ" (ดู OVERVIEW_PATH) */}
      <Link to={OVERVIEW_PATH} className="brand-link">
        <span className="app-brand-mark brand-mark" aria-hidden="true">
          <Icon name="pig" size={24} />
        </span>
        <span className="brand-text">
          <b>SWINE SYNC</b>
          <span>SMART FARM SOLUTION</span>
        </span>
      </Link>
    </div>
  );
}
