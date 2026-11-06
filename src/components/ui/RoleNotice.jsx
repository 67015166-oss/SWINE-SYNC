/**
 * ประกาศลอย "สิทธิ์ของคุณเปลี่ยนแล้ว" — โผล่เมื่อเซิร์ฟเวอร์บอกว่าบัญชีนี้ไม่ได้มีสิทธิ์เดิมแล้ว (T1.257)
 *
 * ต้นเหตุคือผู้ดูแลระบบเปลี่ยนระดับสิทธิ์ ปิดบัญชี หรือตั้งรหัสผ่านใหม่ให้ ขณะที่คนนั้นเปิดแอปค้างอยู่
 * `AuthProvider` เป็นคนจับได้และปรับปุ่มทั้งแอปทันที ตัวนี้มีหน้าที่เดียวคือ **บอกให้รู้ว่าทำไม**
 * — ไม่งั้นปุ่มที่เพิ่งกดได้เมื่อครู่กลายเป็นกดไม่ได้เฉย ๆ แล้วคนนึกว่าแอปพัง
 *
 * อยู่จนกว่าจะกดปิด (ไม่หายเอง) เพราะเป็นเรื่องที่ต้องรู้ ไม่ใช่ข้อความผ่านตา
 * มีตัวเดียวทั้งแอป วางไว้ใน App.jsx นอก <Routes> จึงเห็นได้ทุกหน้า รวมหน้าเข้าสู่ระบบ
 */
import Icon from "./Icon.jsx";
import { useAuth } from "../../lib/auth/useAuth.js";
import { getAccountRole } from "../../lib/auth/roles.js";
import { useSettings } from "../../lib/settings/useSettings.js";
import { useT } from "../../lib/i18n/useT.js";
import "./RoleNotice.css";

export default function RoleNotice() {
  const t = useT();
  const { roleNotice, dismissRoleNotice } = useAuth();
  const { openSettings } = useSettings();

  if (!roleNotice) return null;

  if (roleNotice.kind === "revoked") {
    return (
      <div className="rn is-revoked" role="alert">
        <Icon name="lock" size={20} aria-hidden="true" />
        <p className="rn-text">
          <b>{t("ออกจากระบบแล้ว")}</b>
          <span>
            {t("บัญชีนี้ใช้งานต่อไม่ได้ — ผู้ดูแลระบบอาจปิดบัญชีหรือตั้งรหัสผ่านใหม่ให้ เข้าสู่ระบบอีกครั้ง หรือติดต่อผู้ดูแลระบบ")}
          </span>
        </p>
        <button type="button" className="rn-close" onClick={dismissRoleNotice} aria-label={t("ปิดประกาศ")}>
          <Icon name="cross" size={18} />
        </button>
      </div>
    );
  }

  const from = getAccountRole(roleNotice.from);
  const to = getAccountRole(roleNotice.to);

  return (
    <div className="rn" role="status" aria-live="polite">
      <Icon name={to.icon} size={20} aria-hidden="true" />
      <p className="rn-text">
        <b>{t("ผู้ดูแลระบบเปลี่ยนสิทธิ์ของคุณแล้ว")}</b>
        <span>
          {t("จาก {from} เป็น {to} — {tagline}", {
            from: t(from.name),
            to: t(to.name),
            tagline: t(to.tagline),
          })}
        </span>
      </p>
      <button
        type="button"
        className="rn-more"
        onClick={() => {
          dismissRoleNotice();
          openSettings("account");
        }}
      >
        {t("ดูว่าทำอะไรได้บ้าง")}
      </button>
      <button type="button" className="rn-close" onClick={dismissRoleNotice} aria-label={t("ปิดประกาศ")}>
        <Icon name="cross" size={18} />
      </button>
    </div>
  );
}
