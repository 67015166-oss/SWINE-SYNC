import Icon from "./Icon.jsx";
import "./ui.css";

const TONE_ICON = {
  good: "check",
  warning: "warn",
  serious: "warn",
  critical: "cross",
  offline: "power", // ไม่มีสัญญาณ — ไม่ใช่ "แย่" แต่คือ "ไม่รู้"
};

/**
 * ป้ายสถานะ — ต้องมีทั้งไอคอนและข้อความเสมอ (ห้ามสื่อความหมายด้วยสีอย่างเดียว)
 *
 * @param {"good"|"warning"|"serious"|"critical"|"offline"} tone
 * @param {string} children ข้อความสถานะ เช่น "ปกติ", "อุณหภูมิสูง"
 */
export default function StatusBadge({ tone = "good", children }) {
  return (
    <span className={`status-badge is-${tone}`}>
      <Icon name={TONE_ICON[tone]} size={15} />
      {children}
    </span>
  );
}
