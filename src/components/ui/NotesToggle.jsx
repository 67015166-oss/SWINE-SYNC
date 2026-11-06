/**
 * ปุ่ม "คำอธิบาย" — ซ่อน/กางบรรทัดอธิบายของทั้งการ์ด
 *
 * ใช้ร่วมกันหลายการ์ดที่มีตัวเลขเยอะ (สภาพแวดล้อมตอนนี้ · ระบบไฟฟ้า)
 * แยกออกมาเพราะถ้าเขียนซ้ำ วันหนึ่งคำบนปุ่มหรือไอคอนของสองที่จะไม่ตรงกัน
 * แล้วผู้ใช้จะไม่รู้ว่ามันคือปุ่มเดียวกัน
 *
 * **กติกาว่าอะไรซ่อนได้**: ตัวเลข หน่วย และป้ายสถานะ ต้องอยู่เสมอ —
 * ที่ซ่อนได้คือ "ทำไมถึงตัดสินแบบนั้น" (เกณฑ์ · สูตร · ส่วนต่าง) ซึ่งคนดูซ้ำทุกวัน
 * ไม่ได้อ่านทุกครั้ง
 */
import Icon from "./Icon.jsx";
import { useT } from "../../lib/i18n/useT.js";

/**
 * @param {boolean} on กางอยู่ไหม
 * @param {() => void} onToggle
 */
export default function NotesToggle({ on, onToggle }) {
  const t = useT();

  return (
    <button
      type="button"
      className={"notes-toggle" + (on ? " is-on" : "")}
      onClick={onToggle}
      aria-pressed={on}
    >
      <Icon name={on ? "eye-off" : "eye"} size={17} aria-hidden="true" />
      {on ? t("ซ่อนคำอธิบาย") : t("คำอธิบาย")}
    </button>
  );
}
