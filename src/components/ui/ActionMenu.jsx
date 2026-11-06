/**
 * ปุ่มเฟือง + เมนูดรอปดาวน์ — รวมคำสั่งของแถวหนึ่งไว้ปุ่มเดียว (T1.254)
 * ใช้ครั้งแรกในตารางบัญชีของหน้าจัดการผู้ใช้ (แก้ไข · ตั้งรหัสใหม่ · ปิดบัญชี · ลบถาวร)
 *
 * **เมนูวาดผ่าน portal ไปที่ <body> แล้ววางแบบ fixed ตามตำแหน่งปุ่ม**
 * ตารางอยู่ในกล่อง `.table-scroll` ที่ overflow: auto — ถ้าวางเมนูในกล่องนั้น เมนูแถวล่าง ๆ
 * จะโดนตัดขอบหรือกลายเป็นแถบเลื่อนในตาราง
 *
 * กติกาที่ยึด
 *   · คำสั่งที่ทำไม่ได้ **ไม่ซ่อน** — ขึ้นจาง กดไม่ได้ พร้อมเหตุผลใต้ชื่อคำสั่ง (กติกา CLAUDE.md)
 *   · คำสั่งอันตราย (`danger`) แยกด้วยเส้นคั่นและสีแดง + ไอคอน ไม่ได้บอกด้วยสีอย่างเดียว
 *   · ปิดได้ทุกทาง: เลือกคำสั่ง · คลิกนอกเมนู · Esc · เลื่อนหน้า/ย่อขยายหน้าต่าง
 *   · แป้นพิมพ์: เปิดแล้วโฟกัสคำสั่งแรกที่กดได้ · ↑ ↓ Home End เลื่อน · Esc ปิดแล้วคืนโฟกัสให้ปุ่มเฟือง
 *
 * @param {string} label ชื่อเมนูสำหรับโปรแกรมอ่านหน้าจอ เช่น "จัดการบัญชี somchai"
 * @param {Array<{ id: string, label: string, icon: string, onSelect: () => void,
 *                 disabled?: boolean, reason?: string, danger?: boolean }>} items
 * @param {boolean} [disabled] ปิดทั้งปุ่ม (เช่นระหว่างบันทึก)
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";
import "./ActionMenu.css";

/** ช่องว่างระหว่างปุ่มกับเมนู และระยะห่างจากขอบจอขั้นต่ำ */
const GAP = 6;
const EDGE = 8;

export default function ActionMenu({ label, items, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    setPos(null);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  /* วางเมนูหลังวาดแล้วค่อยวัดขนาดจริง — ชิดขวากับปุ่ม · ล้นจอล่างเมื่อไรเปิดขึ้นด้านบนแทน */
  useLayoutEffect(() => {
    if (!open) return;
    const btn = triggerRef.current?.getBoundingClientRect();
    const menu = menuRef.current?.getBoundingClientRect();
    if (!btn || !menu) return;
    const left = Math.min(
      Math.max(EDGE, btn.right - menu.width),
      window.innerWidth - menu.width - EDGE,
    );
    const below = btn.bottom + GAP;
    const top =
      below + menu.height > window.innerHeight - EDGE
        ? Math.max(EDGE, btn.top - GAP - menu.height)
        : below;
    setPos({ top, left });
  }, [open]);

  /* โฟกัสคำสั่งแรกที่กดได้ทันทีที่เมนูเข้าที่ */
  useEffect(() => {
    if (open && pos) menuRef.current?.querySelector('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, [open, pos]);

  /* ปิดเมื่อคลิกนอกเมนู · เลื่อนหน้า · ย่อขยายหน้าต่าง (ตำแหน่ง fixed จะไม่ตามปุ่มไปแล้ว) */
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      close();
    };
    const onMove = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      close();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, close]);

  const onMenuKey = (e) => {
    const enabled = [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];
    const at = enabled.indexOf(document.activeElement);
    const focus = (i) => enabled[(i + enabled.length) % enabled.length]?.focus();
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focus(at + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focus(at - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focus(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focus(enabled.length - 1);
    } else if (e.key === "Tab") {
      close();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={"am-trigger" + (open ? " is-open" : "")}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Icon name="gear" size={18} />
      </button>

      {open &&
        createPortal(
          <ul
            ref={menuRef}
            id={menuId}
            className="am-menu"
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKey}
            /* ยังไม่ได้วัดตำแหน่ง = วาดไว้นอกจอก่อน (วัดขนาดได้ แต่ไม่กระพริบที่มุมซ้ายบน) */
            style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
          >
            {items.map((item, i) => (
              <li
                key={item.id}
                role="none"
                className={item.danger && !items[i - 1]?.danger ? "am-sep" : undefined}
              >
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className={"am-item" + (item.danger ? " is-danger" : "")}
                  aria-disabled={item.disabled || undefined}
                  onClick={() => {
                    if (item.disabled) return;
                    close(true);
                    item.onSelect();
                  }}
                >
                  <Icon name={item.icon} size={17} aria-hidden="true" />
                  <span className="am-item-text">
                    <span>{item.label}</span>
                    {item.disabled && item.reason && <em>{item.reason}</em>}
                  </span>
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
