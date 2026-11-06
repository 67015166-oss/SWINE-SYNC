/**
 * โครงหน้าแบบแถบเมนูซ้ายเต็มความสูง — ใช้กับหน้าที่ต้องการพื้นที่เต็มจอ
 * (ตอนนี้ใช้ที่ /dashboard/pigs · หน้าอื่นในแดชบอร์ดยังใช้แถบเมนูบนของ AppLayout)
 *
 * รับเมนูเข้ามาทาง prop `nav` — ลิงก์ขึ้นต้นด้วย "#" จะถือเป็นลิงก์ข้ามส่วนในหน้าเดียวกัน
 * ส่วนหัวรับ title/subtitle/icon และแถบเครื่องมือเสริมทาง `tools`
 */
import { Link } from "react-router-dom";
import Icon from "../ui/Icon.jsx";
import BackButton from "../ui/BackButton.jsx";
import HomeButton from "../ui/HomeButton.jsx";
import SettingsButton from "../ui/SettingsButton.jsx";
import BarnArt from "../ui/BarnArt.jsx";
import AppSidebar from "./AppSidebar.jsx";
import AppBrand from "./AppBrand.jsx";
import { useSettings } from "../../lib/settings/useSettings.js";
import { useAuth } from "../../lib/auth/useAuth.js";
import { formatWhen } from "../../lib/format.js";
import "./SideLayout.css";
import { useT } from "../../lib/i18n/useT.js";

export default function SideLayout({
  /* eslint-disable-next-line no-unused-vars -- ยังรับไว้ให้หน้าที่เรียกอยู่ไม่พัง (เมนูย้ายไป AppSidebar แล้ว) */
  nav = [],
  title,
  subtitle,
  icon = "pig",
  updatedAt,
  children,
}) {
  const t = useT();
  const { openSettings } = useSettings();
  const { role: account, signOut } = useAuth();

  return (
    <div className="sl">
      {/* ใช้แถบเมนูตัวเดียวกับทุกหน้า — เดิมหน้ากลุ่มนี้มีแถบซ้ายของตัวเอง
          เมนูจึงไม่ตรงกับหน้าอื่น (ผู้ใช้สั่งให้รวมเป็นอันเดียว 31 ส.ค. 2569)
          prop `nav` ยังรับไว้เพื่อไม่ให้หน้าที่เรียกอยู่พัง แต่ไม่ได้ใช้แล้ว */}
      <AppSidebar
        footer={
          <div className="sl-side-art" aria-hidden="true">
            <BarnArt className="sl-side-scene" variant={1} />
          </div>
        }
      />

      <div className="sl-body">
        <header className="sl-top">
          {/* ขีดสามขีด + โลโก้ — ต้องมีทุกโครงหน้า ไม่งั้นสลับหน้าแล้วเปิดเมนูไม่ได้ */}
          <AppBrand compact />
          {/* ปุ่มย้อนกลับ — หน้าเหล่านี้เข้ามาจากหน้าอื่นเสมอ (ป๊อบอัพเลือกโรงเรือน/การ์ดสุกร) */}
          <BackButton />
          <HomeButton />
          <span className="icon-chip sl-top-icon" aria-hidden="true">
            <Icon name={icon} size={26} />
          </span>
          <span className="sl-top-headings">
            <h1 className="sl-title">{title}</h1>
            {subtitle && <p className="sl-sub">{subtitle}</p>}
          </span>

          <span className="sl-top-right">
            {updatedAt && (
              <span className="sl-updated">
                <Icon name="clock" size={17} />
                {t("อัปเดตล่าสุด {time}", { time: formatWhen(updatedAt) })}
              </span>
            )}
            {/* ปุ่ม Voice AI ย้ายไปอยู่บนแถบลอยล่างจอแล้ว (16 ก.ย. 2569 · components/dock/AppDock.jsx) */}
            {/* ชิปสิทธิ์ — ใช้คลาสเดียวกับแถบเมนูบน หน้าจอทุกโครงจะได้บอกสิทธิ์เหมือนกันหมด */}
            <button
              type="button"
              className={"app-account is-" + account.id}
              onClick={() => openSettings("account")}
              title={account.tagline}
            >
              <Icon name={account.icon} size={17} />
              <span className="app-account-text">{account.name}</span>
            </button>
            <SettingsButton />
            <Link to="/" className="sl-logout" onClick={signOut}>
              <Icon name="login" size={19} />
              {t("ออกจากระบบ")}
            </Link>
          </span>
        </header>

        <main className="sl-main">{children}</main>
      </div>

    </div>
  );
}
