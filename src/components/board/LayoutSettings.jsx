/**
 * แผง "จัดเลย์เอาต์" ในป๊อบอัพตั้งค่า — สลับโหมดจัด · เลือกชุด · เพิ่ม/แก้ไข/ลบ · คืนค่า
 *
 * เดิมเป็นแถบเครื่องมือเกาะอยู่ข้างหัวของทุกหน้า แต่มันเป็นของที่นาน ๆ ใช้ที
 * จึงกินที่ในหัวหน้าโดยเปล่าประโยชน์ ➜ ย้ายมารวมกับการตั้งค่าอื่นทั้งหมดในปุ่มเฟือง
 *
 * แผงนี้สั่งงาน "กระดานของหน้าที่เปิดอยู่" ซึ่ง PageBoard ลงทะเบียนไว้ที่ LayoutProvider
 * (ป๊อบอัพตั้งค่าอยู่นอกตาราง route จึงไม่รู้ด้วยตัวเองว่ากำลังดูหน้าไหน)
 *
 * ตั้งชื่อชุดด้วยช่องกรอกในแผงเอง ไม่ใช้ window.prompt เพราะ prompt ถูกบล็อกในหลายบริบท
 * และไม่มีทางทำให้เข้ากับดีไซน์ได้เลย
 */
import { useState } from "react";
import Icon from "../ui/Icon.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";
import { useLayout } from "../../lib/layout/useLayout.js";
import { BOARDS } from "../../lib/layout/presets.js";
import { formatNumber } from "../../lib/format.js";
import "./board.css";
import { useT } from "../../lib/i18n/useT.js";

/** @param {function} onStartEditing เรียกตอนกด "เริ่มจัด" — ใช้ปิดป๊อบอัพให้ผู้ใช้ลากได้ทันที */
export default function LayoutSettings({ onStartEditing }) {
  const t = useT();
  const {
    editing,
    setEditing,
    DEFAULT_ID,
    activeBoard,
    activeLayout,
    presetsOf,
    activeIdOf,
    activeNameOf,
    isDefaultActive,
    addPreset,
    renamePreset,
    deletePreset,
    selectPreset,
    resetActive,
  } = useLayout();

  /* form = null (ไม่เปิด) | "add" (ตั้งชื่อชุดใหม่) | "rename" (แก้ชื่อชุดที่ใช้อยู่) */
  const [form, setForm] = useState(null);
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  /* ป๊อบอัพเลือกชุดเลย์เอาต์ + คำค้นในนั้น */
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");

  if (!activeBoard) {
    return (
      <p className="ls-board">
        <Icon name="grid" size={17} aria-hidden="true" />
        หน้านี้ไม่มีกระดานให้จัด
      </p>
    );
  }

  const boardId = activeBoard.boardId;
  const boardName = t(BOARDS[boardId]?.label ?? "หน้านี้");
  const presets = presetsOf(boardId);
  const activeId = activeIdOf(boardId);
  const onDefault = isDefaultActive(boardId);

  /* ค่าเริ่มต้นของระบบอยู่หัวรายการเสมอ — เป็นจุดกลับบ้านที่ต้องหาเจอง่ายที่สุด */
  const allPresets = [{ id: DEFAULT_ID, name: t("ค่าเริ่มต้นของระบบ") }, ...presets];
  const q = query.trim().toLowerCase();
  const matched = q ? allPresets.filter((p) => p.name.toLowerCase().includes(q)) : allPresets;

  const openPicker = () => {
    setPicker(true);
    setQuery("");
    setForm(null);
    setConfirmDelete(false);
  };
  const closePicker = () => {
    setPicker(false);
    setQuery("");
  };

  const openForm = (mode) => {
    setForm(mode);
    setName(mode === "rename" ? activeNameOf(boardId) : "");
    setConfirmDelete(false);
  };

  const submit = (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    if (form === "add") addPreset(boardId, name, activeLayout());
    else renamePreset(boardId, activeId, name);
    setForm(null);
  };

  return (
    <div className="ls">
      <p className="ls-board">
        <Icon name="grid" size={17} aria-hidden="true" />
        กำลังตั้งค่าเลย์เอาต์ของ<b>{boardName}</b>
      </p>

      {/* **เป็นปุ่มเปิดป๊อบอัพ ไม่ใช่ dropdown** (ผู้ใช้สั่ง 31 ส.ค. 2569)
          กดปุ่มแล้วเปิดรายการชุดที่เคยบันทึกไว้ พร้อมช่องค้นหา
          — ชุดเยอะขึ้นเมื่อไรก็ยังหาเจอ ต่างจาก dropdown ที่ต้องไล่กวาดตาเอง
          และต่างจากปุ่มเรียงยาวที่กินที่ในแผงตั้งค่าจนดันของอื่นตกจอ */}
      <div className="ls-presets">
        <span className="ls-presets-label">{t("ชุดเลย์เอาต์ที่ใช้อยู่")}</span>
        <button
          type="button"
          className="ls-picker-btn"
          onClick={() => openPicker()}
          aria-haspopup="dialog"
          aria-expanded={picker}
        >
          <Icon name="grid" size={17} aria-hidden="true" />
          <span className="ls-picker-name">{activeNameOf(boardId)}</span>
          <span className="ls-picker-count">
            {t("{n} ชุด", {
              n: presets.length > 0 ? formatNumber(presets.length + 1) : 1,
            })}
          </span>
          <Icon name="chevron" size={16} aria-hidden="true" />
        </button>

        {picker && (
          <div className="ls-picker" role="dialog" aria-label={t("เลือกชุดเลย์เอาต์")}>
            <div className="ls-picker-head">
              <label className="ls-search">
                <Icon name="search" size={16} aria-hidden="true" />
                <input
                  type="text"
                  value={query}
                  autoFocus
                  placeholder={t("ค้นหาชื่อชุด…")}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && closePicker()}
                />
              </label>
              <button
                type="button"
                className="ls-picker-close"
                onClick={closePicker}
                aria-label={t("ปิดรายการ")}
              >
                <Icon name="cross" size={16} />
              </button>
            </div>

            {matched.length === 0 ? (
              /* ไม่เจอ — บอกไปตรง ๆ พร้อมคำที่ค้น ดีกว่ารายการว่างเปล่าที่อ่านไม่ออกว่าเกิดอะไรขึ้น */
              <p className="ls-picker-empty">
                <Icon name="search" size={16} aria-hidden="true" />
                ไม่พบชุดที่ชื่อตรงกับ “{query}”
              </p>
            ) : (
              <ul className="ls-picker-list">
                {matched.map((preset) => {
                  const on = preset.id === activeId;
                  return (
                    <li key={preset.id}>
                      <button
                        type="button"
                        className={"ls-picker-item" + (on ? " is-on" : "")}
                        onClick={() => {
                          selectPreset(boardId, preset.id);
                          closePicker();
                        }}
                        aria-pressed={on}
                      >
                        <Icon
                          name={on ? "check" : preset.id === DEFAULT_ID ? "power" : "grid"}
                          size={16}
                        />
                        <span className="ls-picker-item-name">{preset.name}</span>
                        {/* ชุดที่ใช้อยู่บอกด้วยไอคอน + คำ ไม่ใช่สีอย่างเดียว */}
                        {on && <span className="ls-preset-on">{t("ใช้อยู่")}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="ls-row">
        <button
          type="button"
          className={"ls-toggle" + (editing ? " is-on" : "")}
          onClick={() => {
            const next = !editing;
            setEditing(next);
            if (next) onStartEditing?.();
          }}
          aria-pressed={editing}
        >
          <Icon name={editing ? "check" : "expand"} size={18} />
          {editing ? t("กำลังจัดอยู่ — กดเพื่อหยุด") : t("เริ่มจัดเลย์เอาต์")}
        </button>
      </div>

      <div className="ls-actions">
        <button type="button" className="ls-btn" onClick={() => openForm("add")}>
          <Icon name="plus" size={17} />
          บันทึกเป็นชุดใหม่
        </button>

        <button
          type="button"
          className="ls-btn"
          onClick={() => openForm("rename")}
          disabled={onDefault}
          title={onDefault ? t("ค่าเริ่มต้นของระบบเปลี่ยนชื่อไม่ได้") : undefined}
        >
          <Icon name="pencil" size={17} />
          แก้ไขชื่อ
        </button>

        <button
          type="button"
          className={"ls-btn" + (confirmDelete ? " is-danger" : "")}
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            deletePreset(boardId, activeId);
            setConfirmDelete(false);
          }}
          disabled={onDefault}
          title={onDefault ? t("ค่าเริ่มต้นของระบบลบไม่ได้") : undefined}
        >
          <Icon name="trash" size={17} />
          {confirmDelete ? t("กดอีกครั้งเพื่อลบ") : t("ลบชุดนี้")}
        </button>

        {/* คืนทั้งตำแหน่งกล่องและความกว้างแถบเมนู — ทั้งสองอย่างปรับในโหมดจัดเลย์เอาต์เหมือนกัน
            เขียนบอกไว้ใน title ด้วย เพราะชื่อปุ่มสั้นเกินกว่าจะบอกได้ว่าคืนอะไรบ้าง */}
        <button
          type="button"
          className="ls-btn"
          onClick={() => resetActive(boardId)}
          title={t("คืนตำแหน่งและขนาดกล่องทั้งหมดของหน้านี้ พร้อมความกว้างแถบเมนูซ้าย")}
        >
          <Icon name="power" size={17} />
          คืนค่าเริ่มต้น
        </button>
      </div>

      {form && (
        <form className="ls-form" onSubmit={submit}>
          <label className="ls-field">
            <span>{form === "add" ? t("ชื่อชุดใหม่") : t("ชื่อใหม่ของชุดนี้")}</span>
            <input
              type="text"
              value={name}
              maxLength={40}
              autoFocus
              placeholder={t("เช่น จอใหญ่หน้างาน · มือถือ · เน้นการเงิน")}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button type="submit" className="ls-btn is-primary" disabled={!name.trim()}>
            <Icon name="check" size={17} />
            {form === "add" ? t("บันทึก") : t("เปลี่ยนชื่อ")}
          </button>
          <button type="button" className="ls-btn" onClick={() => setForm(null)}>
            ยกเลิก
          </button>
        </form>
      )}

      <p className="ls-saved">
        <StatusBadge tone="good">{t("บันทึกอัตโนมัติ")}</StatusBadge>
        {presets.length > 0 && t("{n} ชุดในหน้านี้", { n: formatNumber(presets.length) })}
      </p>
    </div>
  );
}
