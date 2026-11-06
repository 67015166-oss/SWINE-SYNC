/**
 * โครงหน้าหลังเข้าสู่ระบบ — **แถบเมนูซ้ายเต็มความสูง + แถบเครื่องมือบางด้านบน**
 *
 * เดิมเป็นแถบเมนูแนวนอนด้านบนที่พับ/คลี่ได้พร้อมเมนูย่อยสามชั้น
 * ผู้ใช้สั่งให้ **เอาเมนูบนออก ใช้แถบซ้ายอย่างเดียว** (31 ส.ค. 2569) เพราะแอปมีโครงหน้า
 * อยู่สามแบบปนกัน — หน้าส่วนใหญ่ใช้เมนูบน หน้ารายละเอียดโรงเรือนกับหน้าสุกรรายประเภท
 * มีแถบซ้ายคนละชุด ขนาดและตำแหน่งไม่ตรงกันสักหน้า
 *
 * ตอนนี้ทุกหน้าใช้ `<AppSidebar>` ตัวเดียวกัน กว้างเท่ากันจาก `--side-w`
 *
 * **ผลข้างเคียงที่ตั้งใจ** — "ธีมบทบาท" เคยเป็นตัวกำหนดว่าแถบเมนูมีเมนูอะไรบ้าง
 * ตอนนี้เมนูเป็นชุดเดียวกันทุกบทบาทตามที่ผู้ใช้กำหนดรายการมาเอง
 * ธีมบทบาทยังมีผลกับกล่องสรุปในหน้าภาพรวมเหมือนเดิม
 *
 * แถบบนเหลือเฉพาะเครื่องมือ: ย้อนกลับ · หน้าแรก · ค้นหา · สิทธิ์ที่ใช้อยู่ · ตั้งค่า
 */
import { Outlet } from "react-router-dom";
import BackButton from "../ui/BackButton.jsx";
import HomeButton from "../ui/HomeButton.jsx";
import SettingsButton from "../ui/SettingsButton.jsx";
import SearchBox from "./SearchBox.jsx";
import AppSidebar from "./AppSidebar.jsx";
import AppBrand from "./AppBrand.jsx";
import Icon from "../ui/Icon.jsx";
import { useT } from "../../lib/i18n/useT.js";
import { useSettings } from "../../lib/settings/useSettings.js";
import { useAuth } from "../../lib/auth/useAuth.js";
import "./AppLayout.css";

export default function AppLayout() {
  const t = useT();
  const { openSettings } = useSettings();
  /* สิทธิ์การใช้งานของบัญชี — คนละเรื่องกับ "ธีมบทบาท" (ดู CLAUDE.md) */
  const { role: account } = useAuth();

  /* `is-side` เป็นตัวเปิดโครงสองคอลัมน์ — หน้าภาพรวม (TopNavLayout) ใช้ `.app-shell`
     เปล่า ๆ จึงยังเป็นแถบเมนูบนเต็มความกว้างเหมือนเดิม
     เคยพลาดมาแล้ว: ใส่ grid ไว้ที่ `.app-shell` ตรง ๆ ทำให้แถบบนของหน้าภาพรวม
     ถูกบีบลงคอลัมน์แรกกว้าง 284px แล้วยืดสูงเต็มหน้า */
  return (
    <div className="app-shell is-side">
      <AppSidebar />

      <div className="app-main">
        <header className="app-bar">
          {/* ขีดสามขีด + โลโก้ อยู่หน้าสุด (ผู้ใช้สั่ง 2 ก.ย. 2569)
              โลโก้เคยอยู่ในแถบเมนูซ้าย พอแถบปิดเป็นค่าตั้งต้นจึงต้องย้ายขึ้นมาที่นี่ */}
          <AppBrand />
          <BackButton />
          <HomeButton />

          <SearchBox />

          <div className="app-bar-right">
            {/* ปุ่ม Voice AI ย้ายไปอยู่บนแถบลอยล่างจอแล้ว (16 ก.ย. 2569 · components/dock/AppDock.jsx)
                ที่นั่นมีตัวเดียวทั้งแอป จึงไม่ต้องใส่ซ้ำในแถบบนของโครงหน้าทุกแบบอีก */}
            {/* สิทธิ์ที่ใช้อยู่ — ต้องเห็นได้ตลอดเวลา ไม่งั้นผู้ใช้เจอปุ่มกดไม่ได้แล้วไม่รู้สาเหตุ
                กดแล้วเปิดหมวด "บัญชี" ที่บอกครบว่าสิทธิ์นี้ทำอะไรได้และไม่ได้ */}
            <button
              type="button"
              className={"app-account is-" + account.id}
              onClick={() => openSettings("account")}
              title={t(account.tagline)}
            >
              <Icon name={account.icon} size={17} />
              <span className="app-account-text">{t(account.name)}</span>
            </button>
            <SettingsButton />
          </div>
        </header>

        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
