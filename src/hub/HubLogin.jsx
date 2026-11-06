/**
 * หน้าเข้าสู่ระบบของตู้กลาง (T1.347)
 *
 * ★ ไม่ได้ใช้หน้าเข้าสู่ระบบของแดชบอร์ด เพราะตู้กลางเป็นคนละเว็บ — หัวหน้าสั่งให้แยก
 *   หน้านั้นมีลิงก์ "เข้าชมข้อมูลตัวอย่าง" กับแบรนด์ของฟาร์ม ซึ่งไม่เกี่ยวกับงานนี้เลย
 *   และถ้าใช้ร่วมกัน คนที่เข้ามาที่ตู้กลางจะเด้งไปเจอแดชบอร์ดฟาร์ม ซึ่งผิดโจทย์
 *
 * ที่ใช้ร่วมกับแดชบอร์ดมีแค่ `AuthProvider` — เป็นบัญชีชุดเดียวกัน คนละหน้าจอเท่านั้น
 */
import { useState } from "react";

import Icon from "../components/ui/Icon.jsx";
import { useAuth } from "../lib/auth/useAuth.js";
import { useT } from "../lib/i18n/useT.js";

export default function HubLogin() {
  const t = useT();
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const user = String(form.get("username") ?? "").trim();
    const pass = String(form.get("password") ?? "");

    if (!user || !pass) return setError(t("กรอกชื่อผู้ใช้และรหัสผ่าน"));

    setBusy(true);
    setError(null);
    try {
      const res = await signIn(user, pass);
      /* ★ ไม่ต้องพาไปไหน — แอปนี้มีหน้าเดียว พอเข้าระบบแล้วหน้าจอเปลี่ยนเอง */
      if (!res.ok) setError(res.message || t("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"));
    } catch (err) {
      setError(err.message || t("เข้าสู่ระบบไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hub-login">
      <form className="hub-login-card" onSubmit={submit}>
        <p className="hub-login-brand">
          <Icon name="globe" size={24} aria-hidden="true" />
          <b>{t("ตู้กลาง")}</b>
        </p>
        <p className="hub-login-sub">{t("ศูนย์รวมข้อมูลของทุกทีม")}</p>

        <label className="hub-field is-wide">
          <span>{t("ชื่อผู้ใช้")}</span>
          <input name="username" autoComplete="username" autoFocus />
        </label>
        <label className="hub-field is-wide">
          <span>{t("รหัสผ่าน")}</span>
          <input name="password" type="password" autoComplete="current-password" />
        </label>

        {error && <p className="hub-error" role="alert">{error}</p>}

        <button type="submit" className="hub-btn is-primary hub-login-submit" disabled={busy}>
          {busy ? t("กำลังเข้าสู่ระบบ…") : t("เข้าสู่ระบบ")}
        </button>

        {/* บอกตรง ๆ ว่าต้องใช้สิทธิ์ระดับไหน จะได้ไม่ต้องลองเข้าหลายบัญชี */}
        <p className="hub-login-note">{t("ต้องใช้บัญชีผู้ดูแลระบบของ SWINE SYNC")}</p>
      </form>
    </div>
  );
}
