import { useCallback, useEffect, useId, useRef } from "react";
import { useT } from "../../lib/i18n/useT.js";
import Icon from "./Icon.jsx";
import "./Modal.css";

const FOCUSABLE =
  'a[href], button:not([disabled]), select, input, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * กล่องป๊อบอัพกลางจอ (dialog) — ใช้เมื่อผู้ใช้ต้องเลือกอะไรก่อนไปต่อ
 *
 * ปิดได้ 3 ทาง: ปุ่มกากบาท · กดพื้นหลัง · ปุ่ม Esc
 * โฟกัสถูกขังไว้ในกล่อง (วนด้วย Tab) และคืนโฟกัสให้ปุ่มที่เปิดกล่องเมื่อปิด
 *
 * @param {boolean}  open      เปิดอยู่หรือไม่ (ปิด = ไม่ render อะไรเลย)
 * @param {string}   title     หัวกล่อง
 * @param {string}   [subtitle] คำอธิบายใต้หัว
 * @param {string}   [icon]    ชื่อไอคอนจาก Icon.jsx
 * @param {function} onClose   สั่งปิดกล่อง
 * @param {node}     [footer]  แถวปุ่มท้ายกล่อง
 * @param {node}     [art]     ภาพประกอบเหนือหัวกล่อง (ใช้กับ align="center")
 * @param {"start"|"center"} [align] จัดหัวกล่องชิดซ้าย (ค่าเริ่มต้น) หรือกึ่งกลาง
 * @param {string}   [size]    "sm" = กล่องแคบ · "xl" = บานใหญ่เกือบเต็มจอ สูงคงที่ (ค่าเริ่มต้นคือกว้าง)
 * @param {string}   [className] คลาสเพิ่มของกล่อง — ให้ป๊อบอัพที่มีเนื้อหาพิเศษจัดเนื้อในเองได้
 *   (เช่นป๊อบอัพ Voice AI ที่กรอบเว็บต้องกินเต็มกล่องโดยไม่มีระยะขอบ)
 * @param {boolean}  [tall]    ตรึงความสูงกล่องไว้คงที่ ไม่ยืด-หดตามเนื้อหาข้างใน
 *   ใช้กับป๊อบอัพที่สลับหน้าย่อยได้ (เช่น ตั้งค่า) — ไม่งั้นกดสลับแท็บทีกล่องจะเปลี่ยนขนาด
 *   แล้วเด้งกลับไปกึ่งกลางจอใหม่ ทำให้แถบแท็บเลื่อนหนีเมาส์
 */
export default function Modal({
  open,
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
  art,
  align = "start",
  size,
  tall = false,
  className = "",
}) {
  const t = useT();
  const cardRef = useRef(null);
  const openerRef = useRef(null);
  const titleId = useId();

  const handleKey = useCallback(
    (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      /* ขังโฟกัสไว้ในกล่อง — Tab ที่ปลายทางวนกลับมาต้นทาง */
      const items = [...(cardRef.current?.querySelectorAll(FOCUSABLE) ?? [])];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return undefined;

    openerRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cardRef.current?.querySelector(FOCUSABLE)?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      openerRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* คีย์บอร์ดถูกจัดการที่กล่องนี้ทั้งหมด (Esc + Tab) */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        className={
          "modal" +
          (align === "center" ? " is-center" : "") +
          (size ? ` is-${size}` : "") +
          (tall ? " is-tall" : "") +
          (className ? ` ${className}` : "")
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={cardRef}
        onKeyDown={handleKey}
      >
        <button type="button" className="modal-close" onClick={onClose}>
          <span className="sr-only">{t("ปิดหน้าต่าง")}</span>
          <Icon name="cross" size={20} />
        </button>

        <header className="modal-head">
          {art && <div className="modal-art">{art}</div>}
          {icon && (
            <span className="icon-chip" aria-hidden="true">
              <Icon name={icon} />
            </span>
          )}
          <span className="modal-headings">
            <h2 className="modal-title" id={titleId}>
              {title}
            </h2>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </span>
        </header>

        <div className="modal-body">{children}</div>

        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}
