/**
 * แถบสถานะไมโครโฟนของ Voice AI — ใช้ทั้งท้ายป๊อบอัพ (VoiceModal) และหน้า /dashboard/voice (T1.249)
 *
 * เว็บ Farmy อยู่ในกรอบคนละโดเมน มันบอกเราไม่ได้ว่าไมค์ติดอะไร และบอกผู้ใช้ได้แค่ "ใช้ไม่ได้"
 * แถบนี้จึงเป็นคนบอกสาเหตุกับทางแก้ แทนที่จะปล่อยให้กดไมค์ในกรอบแล้วเงียบ
 *   · ยังไม่อนุญาต → ปุ่ม "อนุญาตไมโครโฟน" (อนุญาตที่หน้าแม่ = กรอบใช้ได้ด้วย ดู useMicPermission)
 *   · ถูกบล็อก / ไม่เจอไมค์ / เปิดผ่าน http → บอกวิธีแก้ ไม่มีปุ่ม (กดซ้ำจากโค้ดไม่ช่วย)
 *   · อนุญาตแล้ว → ป้ายสั้น ๆ ว่าพร้อม
 * สถานะมีทั้งไอคอนและข้อความเสมอ (กติกา DESIGN.md)
 */
import Icon from "../ui/Icon.jsx";
import { MIC_STATE_TEXT, useMicPermission } from "../../lib/voice/useMicPermission.js";
import { useT } from "../../lib/i18n/useT.js";
import "./voice.css";

/**
 * @param {string} [readyText] ข้อความตอนอนุญาตแล้ว — ป๊อบอัพใช้บอกว่าปิดแล้วไมค์หยุด
 */
export default function MicPermissionBar({ readyText = "ไมโครโฟนพร้อม — กดไมค์ใน Voice AI แล้วพูดได้เลย" }) {
  const t = useT();
  const { state, request } = useMicPermission();

  if (state === "granted") {
    return (
      <p className="mic-bar is-ready" role="status">
        <Icon name="check" size={17} aria-hidden="true" />
        <span>{t(readyText)}</span>
      </p>
    );
  }

  const canAsk = state === "prompt" || state === "unknown";
  return (
    <p className={"mic-bar" + (canAsk ? " is-ask" : " is-blocked")} role="status">
      <Icon name={canAsk ? "mic" : "warn"} size={17} aria-hidden="true" />
      <span>{t(MIC_STATE_TEXT[state])}</span>
      {canAsk && (
        <button type="button" className="mic-bar-btn" onClick={request}>
          <Icon name="mic" size={16} aria-hidden="true" />
          {t("อนุญาตไมโครโฟน")}
        </button>
      )}
    </p>
  );
}
