/**
 * ตัวเลือกธีม — ใช้ร่วมกันระหว่างป๊อบอัพธีม (ปุ่มบนแถบเมนู) กับหน้าตั้งค่า
 * แก้ที่นี่ที่เดียว ทั้งสองที่เปลี่ยนตาม
 *
 * ทุกตัวเลือกเป็น <input type="radio"> ที่ซ่อนไว้ใต้ label —
 * ได้พฤติกรรมปุ่มลูกศรเลื่อนเลือกและการอ่านออกเสียงของ screen reader มาฟรี
 * (ถ้าทำเป็น <button> ต้องเขียน roving tabindex เองทั้งหมด)
 */
import Icon from "../ui/Icon.jsx";
import { COLOR_MODES, ROLE_THEMES } from "../../lib/theme/themes.js";
import { useT } from "../../lib/i18n/useT.js";
import "./theme.css";

/** เลือกธีมบทบาท 11 ธีม */
export function RoleChooser({ value, onChange, name = "tm-role" }) {
  return (
    <div className="tm-roles" role="radiogroup" aria-label="ธีมบทบาท">
      {ROLE_THEMES.map((role) => {
        const on = role.id === value;
        return (
          <label key={role.id} className={"tm-role" + (on ? " is-on" : "")}>
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={role.id}
              checked={on}
              onChange={() => onChange(role.id)}
            />
            <span className="icon-chip tm-role-icon" aria-hidden="true">
              <Icon name={role.icon} size={22} />
            </span>
            <span className="tm-role-text">
              <b>{role.name}</b>
            </span>
            <span className="tm-check" aria-hidden="true">
              {on && <Icon name="check" size={16} />}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * เลือกโหมดโทนสี — แยกเป็นกลุ่มสว่าง/มืดตามที่ผู้ใช้คุ้นเคย
 * ตัวอย่างสีข้างชื่อไม่ได้ฮาร์ดโค้ด แต่แปะ data-mode ของโหมดนั้นลงไป
 * แล้วอ้าง var(--bg-page/--bg-surface/--accent) ตามปกติ — สีจึงตรงกับของจริงเสมอ
 */
export function ModeChooser({ value, onChange, name = "tm-mode" }) {
  const t = useT();
  /* **นับจำนวนจากรายการจริง ห้ามเขียนตัวเลขตายตัวในหัวข้อ**
     ของเดิมเขียน "โทนสว่าง 5 โหมด" ไว้ พอเพิ่มโหมดก็กลายเป็นข้อความโกหกทันที */
  const group = (scheme, label, icon) => {
    const modes = COLOR_MODES.filter((m) => m.scheme === scheme);
    return (
    <div className="tm-mode-group">
      <h4 className="tm-mode-head">
        <Icon name={icon} size={18} />
        {label} · {modes.length}
      </h4>
      <div className="tm-modes" role="radiogroup" aria-label={label}>
        {modes.map((mode) => {
          const on = mode.id === value;
          return (
            <label key={mode.id} className={"tm-mode" + (on ? " is-on" : "")}>
              <input
                type="radio"
                className="sr-only"
                name={name}
                value={mode.id}
                checked={on}
                onChange={() => onChange(mode.id)}
              />
              <span
                className="tm-mode-art"
                data-mode={mode.id}
                data-scheme={mode.scheme}
                aria-hidden="true"
              >
                <span className="tm-mode-card">
                  <span className="tm-mode-dot" />
                  <span className="tm-mode-line" />
                  <span className="tm-mode-line is-short" />
                </span>
              </span>
              <span className="tm-mode-text">
                <b>{t(mode.name)}</b>
              </span>
              <span className="tm-check" aria-hidden="true">
                {on && <Icon name="check" size={16} />}
              </span>
            </label>
          );
        })}
      </div>
    </div>
    );
  };

  return (
    <div className="tm-mode-cols">
      {group("light", t("โทนสว่าง"), "spark")}
      {group("dark", t("โทนมืด"), "cloud")}
    </div>
  );
}
