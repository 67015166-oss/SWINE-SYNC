import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";
import "./ui.css";

/**
 * การ์ดพื้นฐาน — กล่องขาวขอบมน ใช้ห่อทุกบล็อกเนื้อหาบนหน้า
 *
 * @param {string}  [title]     หัวการ์ด
 * @param {string}  [subtitle]  คำอธิบายใต้หัว
 * @param {string}  [icon]      ชื่อไอคอนจาก Icon.jsx — ขึ้นเป็นกรอบไอคอนหน้าหัวการ์ด
 * @param {object}  [action]    ลิงก์ท้ายการ์ด { to, label, icon }
 * @param {string}  [id]        id ของ section — ใช้เป็นจุดหมายของลิงก์ข้ามส่วนในหน้า
 */
export default function Card({
  title,
  subtitle,
  icon,
  action,
  children,
  className = "",
  id,
}) {
  return (
    <section id={id} className={`card ${className}`.trim()}>
      {(title || icon) && (
        <header className="card-head">
          {icon && (
            <span className="icon-chip" aria-hidden="true">
              <Icon name={icon} />
            </span>
          )}
          <span className="card-headings">
            {title && <h3 className="card-title">{title}</h3>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </span>
        </header>
      )}

      {children}

      {action && (
        <Link className="card-action" to={action.to}>
          {action.icon && <Icon name={action.icon} size={18} />}
          {action.label}
          <Icon name="chevron" size={16} className="card-action-arrow" />
        </Link>
      )}
    </section>
  );
}
