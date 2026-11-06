/**
 * ป๊อบอัพยืนยันก่อนทำสิ่งที่ย้อนยาก — ใช้กับการลบฟาร์ม/โรงเรือน
 *
 * กติกาที่ยึด:
 *   - บอกให้ครบว่า "จะเกิดอะไรขึ้นกับอะไร" ไม่ใช่แค่ถามว่าแน่ใจไหม
 *     (เช่น ลบฟาร์มแล้วโรงเรือนของมันหายตามไปกี่หลัง)
 *   - ปุ่มยืนยันเขียนคำกริยาจริง ("ลบฟาร์มขอนแก่น") ไม่ใช่ "ตกลง" — กดพลาดยากขึ้นมาก
 *   - ปุ่มยกเลิกอยู่ซ้ายและเป็นปุ่มธรรมดา ปุ่มลบเป็นสีแดงอยู่ขวา
 */
import Modal from "./Modal.jsx";
import Icon from "./Icon.jsx";
import "./confirm.css";
import { useT } from "../../lib/i18n/useT.js";

/**
 * @param {boolean}  open
 * @param {function} onClose
 * @param {function} onConfirm
 * @param {string}   title
 * @param {string}   message   ผลที่จะเกิดขึ้น เขียนเป็นประโยคเดียวให้ชัด
 * @param {string}   confirmLabel ข้อความบนปุ่มยืนยัน — ต้องเป็นคำกริยา + ชื่อสิ่งที่ทำ
 * @param {string}   [note]    บรรทัดเสริม เช่น บอกว่ากู้คืนได้
 * @param {"danger"|"normal"} [tone]
 */
export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  note,
  tone = "danger",
}) {
  const t = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      align="center"
      size="sm"
      icon={tone === "danger" ? "warn" : "check"}
      title={title}
      footer={
        <div className="cf-actions">
          <button type="button" className="modal-btn" onClick={onClose}>
            {t("ยกเลิก")}
          </button>
          <button
            type="button"
            className={"modal-btn" + (tone === "danger" ? " cf-danger" : " is-primary")}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            <Icon name={tone === "danger" ? "trash" : "check"} size={20} />
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="cf-message">{message}</p>
      {note && (
        <p className="cf-note">
          <Icon name="shield" size={17} aria-hidden="true" />
          {note}
        </p>
      )}
    </Modal>
  );
}
