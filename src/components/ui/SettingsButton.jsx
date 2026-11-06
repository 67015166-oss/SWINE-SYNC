import Icon from "./Icon.jsx";
import { useSettings } from "../../lib/settings/useSettings.js";
import "./ui.css";
import { useT } from "../../lib/i18n/useT.js";

/**
 * ปุ่มเฟือง — ทางเข้าป๊อบอัพตั้งค่า มีอยู่ทุกโครงหน้าในแดชบอร์ด
 *
 * เป็นปุ่มเปิดป๊อบอัพ ไม่ใช่ลิงก์ไปหน้าใหม่ — ผู้ใช้จะได้ไม่เสียหน้าที่กำลังดูอยู่
 * ตัวป๊อบอัพเองถูก render ไว้ที่ App.jsx ตัวเดียวทั้งแอป (state อยู่ใน SettingsProvider)
 */
export default function SettingsButton({ className = "" }) {
  const t = useT();
  const { settingsOpen, openSettings } = useSettings();

  return (
    <button
      type="button"
      className={`gear-btn${settingsOpen ? " is-current" : ""} ${className}`.trim()}
      onClick={openSettings}
      aria-haspopup="dialog"
      aria-expanded={settingsOpen}
      aria-label={t("ตั้งค่า")}
    >
      <Icon name="gear" size={21} />
    </button>
  );
}
