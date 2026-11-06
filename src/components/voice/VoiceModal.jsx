/**
 * ป๊อบอัพ Voice AI — เปิดจากปุ่มไมค์บนแถบบนขวา (ผู้ใช้สั่ง 15 ก.ย. 2569 · T1.248)
 *
 * ถามยืนยันก่อนทำ ผู้ใช้เลือก
 *   · กล่องกลางจอบานใหญ่ (ไม่ใช่แผงลอยมุมจอ) — เว็บ Farmy มีเมนูเยอะ ต้องใช้พื้นที่
 *   · **เฉพาะปุ่มบนแถบบน** — เมนู "Voice AI" ในแถบซ้ายกับกดสั้นที่ไมค์ในแชทยังไปหน้า /dashboard/voice
 *   · **ปิดแล้วเริ่มใหม่ทุกครั้ง** — Modal ไม่ render อะไรตอนปิด กรอบเว็บจึงถูกถอดทิ้งจริง
 *     ไมค์ในเว็บ Farmy หยุดแน่นอน ไม่มีทางฟังต่อทั้งที่มองไม่เห็น (แลกกับต้องรอโหลดใหม่)
 *
 * วาดผ่าน portal ไปที่ <body> — ปุ่มอยู่ในแถบบนของโครงหน้าสี่แบบ ถ้าวันหนึ่งแถบไหนมี
 * transform/filter กล่อง position: fixed จะถูกขังอยู่ในแถบนั้นแทนที่จะเต็มจอ
 */
import { useRef } from "react";
import { createPortal } from "react-dom";
import Modal from "../ui/Modal.jsx";
import Icon from "../ui/Icon.jsx";
import VoiceFrame from "./VoiceFrame.jsx";
import MicPermissionBar from "./MicPermissionBar.jsx";
import { VOICE } from "./voiceSystem.js";
import { useFullscreen } from "./useFullscreen.js";
import { useT } from "../../lib/i18n/useT.js";

export default function VoiceModal({ open, onClose }) {
  const t = useT();
  const stageRef = useRef(null);
  const fullscreen = useFullscreen(stageRef);
  if (!open) return null;
  const url = VOICE?.url ?? "";

  return createPortal(
    <Modal
      open
      onClose={onClose}
      icon="mic"
      title={t("Voice AI · ระบบสั่งงานด้วยเสียง")}
      subtitle={t("สั่งงานและถามข้อมูลด้วยเสียงพูด · ทำโดย{owner}", {
        owner: t(VOICE?.owner ?? ""),
      })}
      size="xl"
      className="vo-modal"
      footer={
        url ? (
          <>
            {/* สถานะไมค์ + ปุ่มขอสิทธิ์ (T1.249) — อนุญาตแล้วค่อยบอกว่าปิดหน้าต่างแล้วไมค์หยุด */}
            <MicPermissionBar readyText="ไมโครโฟนพร้อม · ปิดหน้าต่างนี้แล้ว Voice AI จะหยุดฟังทันที" />
            {/* เดิมเป็น "เปิดในแท็บใหม่" — ผู้ใช้สั่งเปลี่ยนเป็นเต็มจอ (15 ก.ย. 2569 · T1.250) */}
            <button type="button" className="modal-btn" onClick={fullscreen.toggle}>
              <Icon name={fullscreen.active ? "shrink" : "expand"} size={18} aria-hidden="true" />
              {fullscreen.active ? t("ออกจากเต็มจอ") : t("เต็มจอ")}
            </button>
          </>
        ) : null
      }
    >
      <VoiceFrame stageRef={stageRef} fullscreen={fullscreen} />
    </Modal>,
    document.body,
  );
}
