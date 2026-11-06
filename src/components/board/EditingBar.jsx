/**
 * แถบลอยที่โผล่เฉพาะตอน "กำลังจัดเลย์เอาต์"
 *
 * จำเป็นเพราะปุ่มเปิดโหมดจัดย้ายเข้าไปอยู่ในป๊อบอัพตั้งค่าแล้ว และป๊อบอัพก็ปิดตัวเอง
 * ตอนเริ่มจัด — ถ้าไม่มีแถบนี้ ผู้ใช้จะไม่มีทางออกจากโหมดจัดนอกจากเปิดตั้งค่าใหม่
 *
 * ลอยอยู่ล่างจอ (fixed) ไม่ดันเนื้อหา และมีตัวเดียวทั้งแอปเหมือนป๊อบอัพตั้งค่า
 */
import Icon from "../ui/Icon.jsx";
import { useLayout } from "../../lib/layout/useLayout.js";
import "./board.css";
import { useT } from "../../lib/i18n/useT.js";

export default function EditingBar() {
  const t = useT();
  const { editing, setEditing, activeBoard } = useLayout();

  if (!editing || !activeBoard) return null;

  return (
    <div className="eb" role="status">
      <span className="eb-text">
        <Icon name="grid" size={18} aria-hidden="true" />
        <b>{t("กำลังจัดเลย์เอาต์")}</b>
        <span className="eb-hint">
          {t("ลากแถบทองด้านบนของกล่องเพื่อย้าย · จับขอบหรือมุมเพื่อยืด · ลากขอบขวาของแถบเมนูเพื่อปรับความกว้าง (กดสองครั้งเพื่อคืนค่า) · บันทึกให้อัตโนมัติ")}
        </span>
      </span>

      <button type="button" className="eb-done" onClick={() => setEditing(false)}>
        <Icon name="check" size={18} />
        {t("เสร็จแล้ว")}
      </button>
    </div>
  );
}
