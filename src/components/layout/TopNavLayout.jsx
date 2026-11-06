/**
 * โครงหน้าแบบ "แถบเมนูแนวนอนด้านบน" — **ใช้กับหน้าภาพรวมหน้าเดียว**
 *
 * ตอนรวมแถบเมนูซ้ายให้เหมือนกันทุกหน้า (T1.171) หน้าภาพรวมก็ถูกเปลี่ยนไปด้วย
 * แต่ผู้ใช้ขอให้ **หน้าภาพรวมกลับมาเป็นแบบเดิม** คือมีแถบบน ไม่มีแถบซ้าย (31 ส.ค. 2569)
 * เพราะเป็นหน้าแรกของระบบและเป็นหน้าที่ออกแบบมาให้กว้างเต็มจอ
 *
 * หน้าอื่นทั้งหมดใช้ `AppLayout` ซึ่งมีแถบเมนูซ้ายร่วมกัน
 *
 * แถบนี้ "พับเก็บ" ไว้ในปุ่มภาพรวม: ตอนพับจะเห็นแค่ โลโก้ · ปุ่มภาพรวม · ช่องค้นหา · ฝั่งขวา
 * กดปุ่มภาพรวมแล้วเมนูที่เหลือจะสไลด์ออกมาทางขวา และทุกเมนูจะมีลูกศรให้กางเมนูย่อยต่อ
 */
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import Icon from "../ui/Icon.jsx";
import BackButton from "../ui/BackButton.jsx";
import HomeButton from "../ui/HomeButton.jsx";
import SettingsButton from "../ui/SettingsButton.jsx";
import AppSidebar from "./AppSidebar.jsx";
import AppBrand from "./AppBrand.jsx";
import SearchBox from "./SearchBox.jsx";
import { useT } from "../../lib/i18n/useT.js";
import { useTheme } from "../../lib/theme/useTheme.js";
import { useSettings } from "../../lib/settings/useSettings.js";
import { useAuth } from "../../lib/auth/useAuth.js";
import { useAllFarms } from "../../lib/records/useAllFarms.js";
import { BARNS_HOME, buildTopNav } from "./topNav.js";
import { summarizeFarms } from "../../data/mock/farms.js";
import { PIG_TYPES } from "../../data/mock/pigTypes.js";
import { formatNumber, formatNumber1 } from "../../lib/format.js";
import "./AppLayout.css";

/**
 * ลิงก์ "อุณหภูมิ / ความชื้น" ในเมนูย่อย — ต้องระบุทั้งฟาร์มและโรงเรือนใน URL
 *
 * เดิมผูกกับฟาร์มแรกของข้อมูลตัวอย่างตายตัว ผู้ใช้ลบฟาร์มนั้นเมื่อไรลิงก์ก็ตาย
 * ➜ เลือกจากรายการฟาร์มที่มีอยู่จริงตอนนั้น และถ้าฟาร์มแรกยังไม่มีโรงเรือน
 *   (ฟาร์มที่ผู้ใช้เพิ่งเพิ่มเอง) ให้ถอยไปหน้าสภาพแวดล้อมซึ่งเลือกโรงเรือนเองได้
 */
const climateLinkOf = (farmList, barnsOf) => {
  const farm = farmList[0];
  const barnId = farm ? (barnsOf(farm.id)?.[0]?.id ?? null) : null;
  return barnId ? `/dashboard/climate/${farm.id}/${barnId}` : "/dashboard/environment";
};

/**
 * เมนูย่อยของแต่ละเมนูหลัก — ทุกปลายทางเป็นหน้าที่มีอยู่จริง
 * หน้าที่ยังอยู่ระหว่างพัฒนา (อาหาร & น้ำหนัก · การเงิน) บอกตรง ๆ ว่ายังไม่มีหน้าย่อย
 *
 * เป็นฟังก์ชันเพราะข้อความและตัวเลขต้องเปลี่ยนตามภาษาที่เลือก —
 * ถ้าคำนวณไว้ตอนโหลดไฟล์ (ค่าคงที่) เมนูย่อยจะค้างเป็นภาษาแรกที่เปิดตลอดไป
 */
const buildSubmenus = (t, farmList, barnsOf, summary) => ({
  "/dashboard": [
    {
      to: "/dashboard/farms",
      label: t("ฟาร์มทั้งหมด"),
      /* นับจากรายการที่รวมฟาร์มของผู้ใช้แล้ว ให้ตรงกับหัวหน้าฟาร์มทั้งหมด */
      meta: t("{n} ฟาร์ม", { n: formatNumber(farmList.length) }),
    },
    {
      to: "/dashboard/pigs",
      label: t("จำนวนสุกรทั้งหมด"),
      meta: t("{n} ตัว", { n: formatNumber(summary.pigs) }),
    },
    {
      to: climateLinkOf(farmList, barnsOf),
      label: t("อุณหภูมิ / ความชื้น"),
      meta: t("เฉลี่ย {temp} °C", { temp: formatNumber1(summary.avgTempC) }),
    },
    {
      to: "/dashboard/alerts",
      label: t("การแจ้งเตือน"),
      meta: t("{n} รายการ", { n: formatNumber(summary.alerts) }),
    },
  ],
  "/dashboard/farms": farmList.map((f) => ({
    to: `/dashboard/farms/${f.id}`,
    label: t(f.name),
    meta: t("{province} · {n} โรงเรือน", {
      province: t(f.province),
      n: formatNumber(barnsOf(f.id).length),
    }),
  })),
  "/dashboard/pigs": [
    {
      to: "/dashboard/pigs",
      label: t("จำนวนสุกรทั้งหมด"),
      meta: t("{n} ตัว", { n: formatNumber(summary.pigs) }),
    },
    ...PIG_TYPES.map((type) => ({
      to: `/dashboard/pigs/${type.id}`,
      label: t(type.name),
      meta: t("{n} ตัว", { n: formatNumber(type.count) }),
    })),
  ],
  [BARNS_HOME]: farmList.map((f) => ({
    to: `/dashboard/farms/${f.id}`,
    label: t(f.name),
    /* ฟาร์มที่ผู้ใช้เพิ่มเองยังไม่มีค่าอุณหภูมิ — แสดงเฉพาะจำนวนโรงเรือนแทนที่จะโชว์ "—  °C" */
    meta:
      f.tempC == null
        ? t("{n} โรงเรือน", { n: formatNumber(barnsOf(f.id).length) })
        : t("{n} โรงเรือน · {temp} °C", {
            n: formatNumber(barnsOf(f.id).length),
            temp: formatNumber1(f.tempC),
          }),
  })),
  "/dashboard/feed": [
    {
      to: "/dashboard/feed",
      label: t("ภาพรวมอาหาร & น้ำ"),
      meta: t("อยู่ระหว่างพัฒนา"),
    },
  ],
});

export default function TopNavLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const t = useT();
  /* ธีมบทบาทเป็นตัวกำหนดว่าแถบนี้มีเมนูอะไรบ้าง (ภาพรวมมีเสมอเป็นอันแรก) */
  const { navKeys } = useTheme();
  /* ตัวเลขบนกระดิ่งซ่อนได้จากหน้าตั้งค่า (บางคนไม่อยากเห็นตัวเลขแดงตลอดเวลา) */
  const { openSettings } = useSettings();
  /* สิทธิ์การใช้งานของบัญชี — คนละเรื่องกับ "ธีมบทบาท" ที่กำหนดว่าแถบนี้มีเมนูอะไรบ้าง */
  const { role: account } = useAuth();
  /* เมนูย่อย "ฟาร์ม/โรงเรือน" ต้องมีฟาร์มที่ผู้ใช้เพิ่มเองด้วย */
  const { farms: allFarms, barnsOf } = useAllFarms();
  /* เมนูคลี่ออกหรือยัง (ตอนพับจะเห็นแค่ปุ่มภาพรวมกับช่องค้นหา) */
  const [navOpen, setNavOpen] = useState(false);
  /* เมนูย่อยที่กางอยู่ — เก็บเป็น path ของเมนูหลัก กางได้ทีละอัน */
  const [openMenu, setOpenMenu] = useState(null);
  /* หลังสไลด์จบแล้วต้องเลิก clip กล่อง ไม่งั้นเมนูย่อยที่กางลงมาจะถูกตัดหาย */
  const [settled, setSettled] = useState(false);
  const barRef = useRef(null);

  useEffect(() => {
    if (!navOpen) {
      setSettled(false);
      return undefined;
    }
    const timer = setTimeout(() => setSettled(true), 340);
    return () => clearTimeout(timer);
  }, [navOpen]);

  /* กดที่อื่นหรือกด Esc = ปิดเมนูย่อย */
  useEffect(() => {
    if (!openMenu) return undefined;
    const onDown = (e) => {
      if (!barRef.current?.contains(e.target)) setOpenMenu(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const [overview, ...rest] = buildTopNav(navKeys);
  /* ตัวเลขบนกระดิ่งและในเมนูย่อยต้องนับจากฟาร์มที่มีอยู่จริง (รวมที่ผู้ใช้เพิ่ม/ลบเอง)
     เดิมคำนวณครั้งเดียวตอนโหลดไฟล์จากข้อมูลตัวอย่าง — เพิ่มหรือลบฟาร์มแล้วตัวเลขไม่ขยับตาม */
  const summary = summarizeFarms(allFarms);
  const submenus = buildSubmenus(t, allFarms, barnsOf, summary);

  /* เมนูที่ตรงกับหน้าปัจจุบัน — ใช้ทำแคปซูลสีเข้มกว่าอันอื่น
     เทียบด้วย match ถ้ากำหนดไว้ (เช่น "โรงเรือน" ครอบทุกหน้า /dashboard/farms/:farmId) */
  const isCurrent = (item) => {
    if (item.end) return pathname === item.to;
    return pathname.startsWith(item.match ?? item.to);
  };

  /* ลูกศรกางเมนูย่อย + ตัวเมนูย่อย (โผล่เฉพาะตอนเมนูคลี่ออกแล้ว) */
  const renderCaret = (item) => {
    const subs = submenus[item.to];
    if (!subs || !navOpen) return null;
    const open = openMenu === item.to;
    return (
      <>
        <button
          type="button"
          className="app-nav-caret"
          onClick={() => setOpenMenu(open ? null : item.to)}
          aria-expanded={open}
          aria-haspopup="true"
        >
          <span className="sr-only">{t("เมนูย่อยของ {label}", { label: t(item.label) })}</span>
          <Icon name="chevron" size={14} />
        </button>

        {open && (
          <div className="app-submenu">
            <ul>
              {subs.map((s) => (
                <li key={s.to + s.label}>
                  <Link
                    to={s.to}
                    className="app-submenu-link"
                    onClick={() => setOpenMenu(null)}
                  >
                    <span>{s.label}</span>
                    <span className="app-submenu-meta">{s.meta}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="app-shell">
      {/* แผงเมนูซ้ายแบบเลื่อนเข้า — ปิดอยู่จนกว่าจะกดขีดสามขีด */}
      <AppSidebar />

      <header className={"app-topnav" + (navOpen ? " is-nav-open" : "")}>
        <div className="app-topnav-inner" ref={barRef}>
          {/* ขีดสามขีด + โลโก้ (ผู้ใช้สั่ง 2 ก.ย. 2569)
              หน้านี้มีเมนูบนของตัวเองอยู่แล้ว แต่ยังต้องมีปุ่มขีดสามขีดเหมือนหน้าอื่น
              ไม่งั้นกดที่โลโก้หน้าแรกแล้วปุ่มหายไปเฉย ๆ ซึ่งอ่านเป็น "แอปพัง" มากกว่า
              "หน้านี้ไม่มีแถบซ้าย" — และเมนูในแผงเป็นชุดเดียวกับทุกหน้าตามกติกาใน AppSidebar */}
          <AppBrand />
          <BackButton />

          {/* ปุ่มกลับหน้าแรกโผล่เฉพาะตอนเมนูพับอยู่ — คลี่เมนูแล้วมันซ้ำกับเมนู "ภาพรวม"
              ที่อยู่ข้าง ๆ และยังกินที่ 111px จนเมนูทั้งแถวไม่พอที่ในจอ ~1024px */}
          {!navOpen && <HomeButton />}

          <nav
            className={
              "app-nav" + (navOpen ? " is-open" : "") + (settled ? " is-settled" : "")
            }
            aria-label={t("เมนูหลัก")}
          >
            <ul className="app-nav-list">
              {/* ภาพรวม = ปุ่มพับ/คลี่เมนู (พอคลี่แล้วเป็นลิงก์ปกติ + มีเมนูย่อยของตัวเอง) */}
              <li className={"app-nav-item" + (isCurrent(overview) ? " is-current" : "")}>
                {navOpen ? (
                  <NavLink
                    to={overview.to}
                    end={overview.end}
                    className={({ isActive }) =>
                      "app-nav-link" + (isActive ? " is-active" : "")
                    }
                  >
                    <Icon name={overview.icon} size={20} />
                    {t(overview.label)}
                  </NavLink>
                ) : (
                  /* ตอนเมนูพับ ปุ่มนี้ทำสองหน้าที่ — แต่ต้อง "ไปหน้าภาพรวม" ก่อนเสมอถ้ายังไม่ได้อยู่ที่นั่น
                     เดิมกดแล้วคลี่เมนูอย่างเดียว ยืนอยู่หน้าอาหารกดปุ่มชื่อ "ภาพรวม" ก็ยังค้างอยู่หน้าอาหาร
                     (แถมทาสี is-active ตายตัวเหมือนกำลังอยู่หน้าภาพรวมอยู่แล้วทุกหน้า)
                     ตอนนี้: อยู่หน้าอื่น = พาไปหน้าภาพรวมพร้อมคลี่เมนู · อยู่หน้าภาพรวมแล้ว = คลี่เมนูเฉย ๆ */
                  <button
                    type="button"
                    className={
                      "app-nav-link app-nav-trigger" +
                      (isCurrent(overview) ? " is-active" : "")
                    }
                    onClick={() => {
                      setNavOpen(true);
                      if (!isCurrent(overview)) navigate(overview.to);
                    }}
                    aria-expanded={false}
                    aria-controls="app-nav-rest"
                  >
                    <Icon name={overview.icon} size={20} />
                    {t(overview.label)}
                    <Icon name="chevron" size={14} className="app-nav-trigger-arrow" />
                  </button>
                )}
                {renderCaret(overview)}
              </li>

              {/* เมนูที่เหลือ — สไลด์ออกมาทางขวาเมื่อกดภาพรวม */}
              <li className="app-nav-rest" id="app-nav-rest">
                <ul>
                  {rest.map((item) => (
                    <li
                      key={item.to}
                      className={"app-nav-item" + (isCurrent(item) ? " is-current" : "")}
                    >
                      <NavLink
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          "app-nav-link" + (isActive ? " is-active" : "")
                        }
                      >
                        <Icon name={item.icon} size={20} />
                        {t(item.label)}
                      </NavLink>
                      {renderCaret(item)}
                    </li>
                  ))}

                  <li>
                    <button
                      type="button"
                      className="app-nav-collapse"
                      onClick={() => {
                        setNavOpen(false);
                        setOpenMenu(null);
                      }}
                    >
                      <span className="sr-only">{t("พับเมนู")}</span>
                      <Icon name="chevron" size={16} />
                    </button>
                  </li>
                </ul>
              </li>
            </ul>
          </nav>

          {/* ช่องค้นหา — โผล่เฉพาะตอนเมนูพับอยู่ (ตามแบบ) */}
          {!navOpen && <SearchBox />}

          <div className="app-topnav-right">
            {/* เวลาอัปเดตถูกถอดออกจากแถบบนตามที่ผู้ใช้สั่ง (T1.146)
                ทุกหน้าบอกเวลาอัปเดตของตัวเองอยู่แล้วใต้ชื่อหน้า และตรงกว่าด้วย
                เพราะเป็นเวลาของข้อมูลที่กำลังดู ไม่ใช่เวลารวมของทั้งเครือ */}
            {/* กระดิ่งแจ้งเตือนถูกถอดออกตามที่ผู้ใช้สั่ง (T1.122)
                ทางเข้าหน้าแจ้งเตือนยังอยู่ครบที่เมนู */}
            {/* ปุ่ม Voice AI ย้ายไปอยู่บนแถบลอยล่างจอแล้ว (16 ก.ย. 2569 · components/dock/AppDock.jsx) */}
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
            {/* ปุ่ม "ออกจากระบบ" ย้ายเข้าไปอยู่ในป๊อบอัพตั้งค่า หมวดบัญชี (T1.147)
                ที่นั่นบอกอยู่แล้วว่ากำลังเข้าระบบด้วยรหัสอะไรและมีสิทธิ์อะไร */}
          </div>
        </div>
      </header>

      <main className="app-content">
        <Outlet />
      </main>

    </div>
  );
}
