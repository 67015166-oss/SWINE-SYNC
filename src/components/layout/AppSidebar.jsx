/**
 * แถบเมนูซ้าย — **ตัวเดียวที่ใช้ร่วมกันทุกหน้า**
 *
 * ก่อนหน้านี้แอปมีโครงหน้าอยู่สามแบบปนกัน: หน้าส่วนใหญ่ใช้เมนูบน (AppLayout)
 * หน้ารายละเอียดโรงเรือนมีแถบซ้ายเขียนเองในไฟล์ตัวเอง และหน้าสุกรรายประเภทมีแถบซ้ายอีกชุด
 * ผลคือเมนู ขนาด และตำแหน่งไม่ตรงกันสักหน้า (ผู้ใช้สั่งให้รวมเป็นอันเดียว 31 ส.ค. 2569)
 *
 * **กติกาของไฟล์นี้**
 * - รายการเมนูอยู่ที่ `NAV_ITEMS` ที่เดียว ห้ามหน้าไหนต่อเมนูเพิ่มเอง
 *   (เมนูต้องเหมือนกันทุกหน้า ถ้าหน้าหนึ่งมีไม่เท่ากันคนจะหาของไม่เจอ)
 * - ความกว้างมาจาก `--side-w` ตัวเดียว ห้ามหน้าไหนตั้งเอง
 * - **หนึ่งรายการต่อหนึ่งหน้า** ห้ามมีสองรายการที่กดแล้วไปหน้าเดียวกัน
 *   (เคยมีสามรายการชี้หน้ารายละเอียดโรงเรือนหน้าเดียวกัน ต่างแค่ `#…` — เอาออกแล้ว)
 *
 * **ตั้งแต่ 2 ก.ย. 2569 แถบนี้ปิดไว้เป็นค่าตั้งต้นทุกหน้า** และเลื่อนเข้ามาทับเนื้อหา
 * เมื่อกดปุ่มขีดสามขีดบนแถบบน (ผู้ใช้สั่ง) — ไม่ได้กินคอลัมน์ถาวรเหมือนเดิมแล้ว
 *   · เลื่อนเข้าแบบทับเนื้อหา ไม่ใช่ดันเนื้อหา — เนื้อหาจะได้ไม่ขยับตอนเปิด/ปิด
 *   · กดพื้นหลัง · กด Esc · หรือกดเมนูสักอัน = ปิด (กดเมนูแล้วเปลี่ยนหน้าอยู่แล้ว
 *     ถ้าไม่ปิดให้ แถบจะค้างบังหน้าใหม่ที่เพิ่งเปิด)
 *   · ตอนปิดต้องออกจากลำดับแท็บด้วย (`inert`) ไม่งั้นคนที่ใช้แป้นพิมพ์จะไล่แท็บ
 *     เข้าไปในเมนูที่มองไม่เห็น
 *   · โลโก้ย้ายขึ้นไปอยู่บนแถบบนแล้ว (components/layout/AppBrand.jsx)
 *     เพราะถ้าอยู่ในแถบนี้ต่อ พอแถบปิดโลโก้ก็หายไปทั้งหน้า
 */
import { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import Icon from "../ui/Icon.jsx";
import { useLayout } from "../../lib/layout/useLayout.js";
import { useSettings } from "../../lib/settings/useSettings.js";
import { useSidebar } from "../../lib/nav/useSidebar.js";
import { useT } from "../../lib/i18n/useT.js";
import { openAssistant } from "../../lib/nav/openAssistant.js";
import "./AppSidebar.css";

/**
 * เมนูทั้งหมด — **หนึ่งรายการต่อหนึ่งหน้า ห้ามมีสองรายการที่ไปหน้าเดียวกัน**
 *
 * เดิมมีสามรายการที่ชี้ไปหน้ารายละเอียดโรงเรือนหน้าเดียวกันหมด ต่างกันแค่ `#…` ที่เลื่อนไป
 * คนละกล่อง (แนวโน้มในโรงเรือนนี้ · บันทึกข้อมูล · การแจ้งเตือน)
 * ผู้ใช้สั่งให้เอาออก (31 ส.ค. 2569) — "มันก็คือหน้าเดียวกัน ไม่ต้องใส่ตรง sidebar ซ้าย"
 * กล่องพวกนั้นยังอยู่ครบในหน้าโรงเรือน เลื่อนดูได้ตามปกติ
 *
 * ส่วน "การแจ้งเตือน" ย้ายไปชี้ `/dashboard/alerts` ซึ่งเป็นหน้าของตัวเองจริง ๆ
 * ไม่ใช่กล่องในหน้าโรงเรือน — จึงไม่ซ้ำกับใคร
 *
 * `farmList` = ต้องเติมรหัสฟาร์มให้ (หน้ารายการโรงเรือนของฟาร์มที่ดูล่าสุด)
 */
const NAV_ITEMS = [
  { key: "overview", to: "/dashboard", label: "ภาพรวม", icon: "chart", end: true },
  /* **"ฟาร์ม" กับ "โรงเรือน" รวมเป็นปุ่มเดียว** (ผู้ใช้สั่ง 31 ส.ค. 2569)
     สองอันนี้ไปหน้าเดียวกันอยู่แล้ว (`/dashboard/farms`) ต่างกันแค่ป้ายเตือน
     ซึ่งเข้าข่าย "เมนูซ้ำ" ที่ผู้ใช้สั่งให้ตัดออกตั้งแต่ T1.174

     กดแล้วเข้าหน้า "ภาพรวมฟาร์มทั้งหมด" ตรง ๆ **ไม่มีป้ายเตือนขึ้นมาบัง**
     (เคยมีป้าย "โปรดเลือกฟาร์มและโรงเรือนก่อน" อยู่ช่วงหนึ่ง แล้วผู้ใช้ขอให้เข้าหน้านี้
      เลย 31 ส.ค. 2569 — หน้ามันบอกตัวเองอยู่แล้วว่าต้องเลือกฟาร์มก่อน
      และการหรี่จอทุกครั้งที่กดเมนูปกติเป็นการรบกวนโดยไม่จำเป็น)

     สว่างค้างไว้ตลอดตั้งแต่หน้ารายชื่อฟาร์ม → รายการโรงเรือน → รายละเอียดโรงเรือน
     เพราะทั้งสามหน้าอยู่ในเส้นทางเดียวกัน */
  { key: "farms", to: "/dashboard/farms", label: "ฟาร์ม / โรงเรือน", icon: "pin", farmFlow: true },
  { key: "camera", to: "/dashboard/cameras", label: "กล้อง AI", icon: "camera" },
  /* สามอันที่เพิ่มเข้ามา (31 ส.ค. 2569) — เดิมเข้าได้จากเมนูบนของหน้าภาพรวมเท่านั้น
     พอย้ายมาใช้แถบซ้ายทุกหน้าจึงตกสำรวจ · แทรกไว้ข้างเมนูที่เป็นเรื่องเดียวกัน
     ไม่ได้ต่อท้าย เพื่อให้กวาดตาแล้วเห็นเป็นกลุ่ม (สภาพแวดล้อม / ฝูงสุกร)
     **การเงินไม่ใส่ตามที่ผู้ใช้สั่ง** — เข้าจากเมนูบนของหน้าภาพรวมได้เหมือนเดิม
     **"อุณหภูมิ / ความชื้น" เอาออกแล้วตามที่ผู้ใช้สั่ง (15 ก.ย. 2569 · T1.246)** — หน้ายังอยู่
     เข้าได้จากกล่องสรุปในหน้าภาพรวม · ช่องค้นหา · ผู้ช่วย AI */
  /* สภาพอากาศ (เสาอากาศนอกโรงเรือน) อยู่ติดกับสภาพแวดล้อม (อากาศในเล้า) โดยตั้งใจ
     สองอันนี้เป็นเรื่องเดียวกันคนละฝั่งกำแพง กวาดตาแล้วต้องเห็นเป็นคู่ (ผู้ใช้สั่ง 9 ก.ย. 2569) */
  { key: "weather", to: "/dashboard/weather", label: "สภาพอากาศ", icon: "sun" },
  { key: "env", to: "/dashboard/environment", label: "ระบบควบคุมสภาพแวดล้อม", icon: "wind" },
  /* แบบจำลองโรงเรือน — ผังโรงเรือนที่สะท้อนค่าที่วัดได้จริง (ผู้ใช้สั่ง 17 ก.ย. 2569 · T1.260)
     วางติดกับสภาพแวดล้อมเพราะเป็นเรื่องอากาศในเล้าเหมือนกัน คนละมุมมองเท่านั้น */
  { key: "twin", to: "/dashboard/twin", label: "แบบจำลองโรงเรือน", icon: "monitor" },
  { key: "pigs", to: "/dashboard/pigs", label: "จำนวนสุกร", icon: "pig" },
  { key: "herd", to: "/dashboard/herd", label: "สุขภาพสุกร", icon: "pulse" },
  { key: "feed", to: "/dashboard/feed", label: "อาหาร & น้ำ", icon: "feed" },
  { key: "alerts", to: "/dashboard/alerts", label: "การแจ้งเตือน", icon: "bell" },
  /* รายงานส่งเวร (T1.268) — วางต่อจากการแจ้งเตือน เพราะหัวใจของรายงานคือ "เหตุที่ยังค้าง" */
  { key: "shift", to: "/dashboard/shift-report", label: "รายงานส่งเวร", icon: "clock" },
  /* ผู้ใช้สั่งให้มีเมนูด้วย (14 ก.ย. 2569) — ไปหน้าเดียวกับปุ่มไมค์บนแถบบน
     ชื่อเมนูเปลี่ยนจาก "สั่งงานด้วยเสียง" เป็น "Voice AI" ตามที่ผู้ใช้สั่ง (15 ก.ย. 2569 · T1.247)
     ต่อด้วย "Chatbot AI" ซึ่งเป็นปุ่ม ไม่ใช่รายการในนี้ (เปิดห้องแชท ไม่ได้ไปหน้าไหน) */
  { key: "voice", to: "/dashboard/voice", label: "Voice AI", icon: "mic" },
  /* คู่มือฟาร์ม (T1.289) — เนื้อหาจากทีม Farmy เรียบเรียงจากเอกสารกรมปศุสัตว์
     วางท้ายสุดเพราะเป็น "ของอ่านประกอบ" ไม่ใช่ของที่ต้องดูทุกวันเหมือนแจ้งเตือน */
  { key: "guideDiseases", to: "/dashboard/guide/diseases", label: "โรคและอาการ", icon: "pulse" },
  { key: "guideChecklist", to: "/dashboard/guide/checklist", label: "เช็กลิสต์ฟาร์ม", icon: "list" },
  { key: "guideCleaning", to: "/dashboard/guide/cleaning", label: "ทำความสะอาด & ฆ่าเชื้อ", icon: "drop" },
  { key: "guideBreeding", to: "/dashboard/guide/breeding", label: "ผสมพันธุ์ & สายพันธุ์", icon: "pig" },
  { key: "guideFeedMix", to: "/dashboard/guide/feed-mix", label: "ผสมอาหารต้นทุนต่ำ", icon: "feed" },
  { key: "guideFarmy", to: "/dashboard/guide/farmy", label: "ข้อมูลจากฟาร์มมี่", icon: "globe" },
];
/**
 * @param {React.ReactNode} [footer] การ์ดท้ายแถบ (หน้ารายละเอียดโรงเรือนใส่การ์ดฟาร์ม)
 */
export default function AppSidebar({ footer = null }) {
  const t = useT();
  const { openSettings } = useSettings();
  const { pathname } = useLocation();
  /* โหมดจัดเลย์เอาต์ — ตอนนี้ปรับความกว้างแถบเมนูได้ด้วย (ผู้ใช้สั่ง 1 ก.ย. 2569) */
  const { editing, sideW, setSideW, resetSideW, sideWMin, sideWMax, sideWDefault } =
    useLayout();
  const drag = useRef(null);
  const { open, closeSidebar } = useSidebar();
  const panelRef = useRef(null);

  /* เปลี่ยนหน้าแล้วปิดเอง — กดเมนูคือการไปหน้าใหม่ ถ้าแถบยังค้างอยู่ก็บังหน้านั้นทันที */
  useEffect(() => {
    closeSidebar();
  }, [pathname, closeSidebar]);

  /* Esc ปิด — ของที่ลอยทับเนื้อหาต้องปิดด้วย Esc ได้เสมอ (ป๊อบอัพในแอปนี้ก็ทำแบบเดียวกัน) */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") closeSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeSidebar]);

  /* เปิดแล้วย้ายโฟกัสเข้ามาในแถบ — ไม่งั้นคนที่ใช้แป้นพิมพ์กดเปิดแล้วโฟกัสยังค้างอยู่ข้างนอก
     (ตอนปิด Provider เป็นคนคืนโฟกัสให้ปุ่มขีดสามขีดเอง) */
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector("a, button")?.focus();
  }, [open]);

  /**
   * ลากขอบขวาเพื่อปรับความกว้าง
   *
   * **อัปเดต CSS variable ตรง ๆ ระหว่างลาก แล้วค่อยบันทึกตอนปล่อย**
   * ถ้าเรียก setSideW ทุก pointermove จะเขียน localStorage หลายสิบครั้งต่อการลากหนึ่งครั้ง
   * (Provider บันทึกทุกครั้งที่คลังเปลี่ยน) เส้นทางนี้จึงแตะ DOM ก่อน แล้วค่อยลงคลังทีเดียว
   */
  const onPointerDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startW: sideW, w: sideW };
  };

  const onPointerMove = (e) => {
    if (!drag.current) return;
    const next = Math.min(
      sideWMax,
      Math.max(sideWMin, Math.round(drag.current.startW + (e.clientX - drag.current.startX)))
    );
    drag.current.w = next;
    document.documentElement.style.setProperty("--side-w", `${next}px`);
  };

  const onPointerUp = (e) => {
    if (!drag.current) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setSideW(drag.current.w);
    drag.current = null;
  };

  /* ปุ่มลูกศรซ้าย/ขวาปรับทีละ 8px — คนที่ใช้คีย์บอร์ดอย่างเดียวต้องปรับได้ด้วย */
  const onKeyDown = (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setSideW((w) => w + (e.key === "ArrowRight" ? 8 : -8));
    }
  };

  /**
   * "โรงเรือน" กำลังเปิดอยู่หรือเปล่า
   *
   * **ห้ามให้ NavLink ตัดสินเอง** — ลิงก์ของมันชี้ไปฟาร์มที่ดูล่าสุด
   * ถ้าผู้ใช้เข้าฟาร์มอื่น (เช่นจำ F-KPP ไว้แต่กำลังดู F-NSN) เส้นทางจะไม่ตรงกับลิงก์
   * แล้วไม่มีเมนูไหนสว่างเลยทั้งหน้า — บั๊กที่ผู้ใช้แจ้ง 31 ส.ค. 2569
   * ➜ ตัดสินจาก "อยู่ใต้ /dashboard/farms/… หรือไม่" ซึ่งครอบทั้งหน้ารายการโรงเรือน
   *   และหน้ารายละเอียดโรงเรือนของทุกฟาร์ม
   */
  /* สว่างตั้งแต่หน้ารายชื่อฟาร์มไปจนถึงหน้ารายละเอียดโรงเรือน — ทั้งหมดคือเส้นทางเดียวกัน
     **ห้ามให้ NavLink ตัดสินเอง** เพราะเส้นทางลูกมีรหัสฟาร์มปนอยู่ (บั๊ก T1.177) */
  const onFarmFlow = pathname === "/dashboard/farms" || pathname.startsWith("/dashboard/farms/");

  return (
    <>
      {/* พื้นหลังหรี่ — กดที่ไหนก็ปิด และกันไม่ให้กดโดนของข้างหลังตอนเมนูกางอยู่
          ไม่ใช่ปุ่ม จึงไม่อยู่ในลำดับแท็บ (คนใช้แป้นพิมพ์ปิดด้วย Esc) */}
      <div
        className={"side-scrim" + (open ? " is-on" : "")}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      <aside
        id="app-sidebar"
        ref={panelRef}
        className={"side" + (open ? " is-open" : "")}
        /* ปิดอยู่ = ออกจากลำดับแท็บและจากสิ่งที่โปรแกรมอ่านหน้าจอเห็น */
        inert={!open}
      >
      {/* หัวแผง — ให้แผงมี "ยอด" ที่ชัดเจน ไม่ใช่รายการลอยขึ้นมาจากขอบบน
          และปุ่มปิดในตัวสำหรับมือถือ ที่นิ้วเอื้อมไปแตะพื้นหลังฝั่งขวาไม่ถนัด */}
      <div className="side-head">
        <span className="side-head-label">{t("เมนูหลัก")}</span>
        <button
          type="button"
          className="side-close"
          onClick={closeSidebar}
          title={t("ปิดเมนู")}
          aria-label={t("ปิดเมนู")}
        >
          <Icon name="cross" size={18} />
        </button>
      </div>

      <nav className="side-nav" aria-label={t("เมนูหลัก")}>
        <ul>
          {/* `--i` = ลำดับของรายการ ใช้ไล่จังหวะให้เมนูโผล่ทีละอัน (ดู AppSidebar.css)
              ทำด้วยตัวแปร CSS ตัวเดียว ไม่ต้องเขียนกติกา nth-child สิบกว่าอัน
              และเพิ่มเมนูใหม่แล้วจังหวะไล่ต่อให้เองโดยไม่ต้องแก้ CSS */}
          {NAV_ITEMS.map((item, i) =>
            item.farmFlow ? (
              <li key={item.key} style={{ "--i": i }}>
                {/* เป็นลิงก์จริง ไม่ใช่ปุ่ม — คลิกกลางเปิดแท็บใหม่ได้ และคัดลอกที่อยู่ได้
                    แต่คุมคลาสสว่างเอง เพราะเส้นทางลูกมีรหัสฟาร์มที่ NavLink จับไม่ได้ */}
                <NavLink
                  to={item.to}
                  className={"side-link" + (onFarmFlow ? " is-active" : "")}
                  aria-current={onFarmFlow ? "page" : undefined}
                >
                  <span className="side-link-icon" aria-hidden="true">
                    <Icon name={item.icon} size={20} />
                  </span>
                  {t(item.label)}
                </NavLink>
              </li>
            ) : (
              <li key={item.key} style={{ "--i": i }}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => "side-link" + (isActive ? " is-active" : "")}
                >
                  <span className="side-link-icon" aria-hidden="true">
                    <Icon name={item.icon} size={20} />
                  </span>
                  {t(item.label)}
                </NavLink>
              </li>
            )
          )}

          {/* Chatbot AI อยู่ใต้ Voice AI ตามที่ผู้ใช้สั่ง (T1.247) — เปิดห้องแชทผู้ช่วย AI มุมขวาล่าง
              ไม่ใช่หน้า จึงเป็นปุ่มเหมือน "ตั้งค่า" · ปิดแถบก่อน ไม่งั้นบนมือถือแถบบังห้องแชท */}
          <li style={{ "--i": NAV_ITEMS.length }}>
            <button
              type="button"
              className="side-link"
              aria-haspopup="dialog"
              onClick={() => {
                closeSidebar();
                openAssistant();
              }}
            >
              <span className="side-link-icon" aria-hidden="true">
                <Icon name="chat" size={20} />
              </span>
              {t("Chatbot AI")}
            </button>
          </li>

          {/* ตั้งค่าเป็นป๊อบอัพ ไม่ใช่หน้า จึงเป็นปุ่มไม่ใช่ลิงก์ */}
          <li style={{ "--i": NAV_ITEMS.length + 1 }}>
            <button type="button" className="side-link" onClick={openSettings}>
              <span className="side-link-icon" aria-hidden="true">
                <Icon name="gear" size={20} />
              </span>
              {t("ตั้งค่า")}
            </button>
          </li>
        </ul>
      </nav>

      {footer}

      {/* ตัวจับปรับความกว้าง — โผล่เฉพาะตอนจัดเลย์เอาต์ เหมือนขอบจับของกล่องบนกระดาน
          กดสองครั้งเพื่อคืนค่าตั้งต้น (บอกไว้ใน title กับแถบ "กำลังจัดเลย์เอาต์") */}
      {editing && (
        <div
          className="side-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("ปรับความกว้างแถบเมนู")}
          aria-valuenow={sideW}
          aria-valuemin={sideWMin}
          aria-valuemax={sideWMax}
          tabIndex={0}
          title={`${t("ลากเพื่อปรับความกว้าง")} · ${sideW}px · ${t("กดสองครั้งเพื่อคืนค่า")} (${sideWDefault}px)`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={resetSideW}
          onKeyDown={onKeyDown}
        >
          <span className="side-resize-grip" aria-hidden="true" />
          <span className="side-resize-size num" aria-hidden="true">
            {sideW}
          </span>
        </div>
      )}
      </aside>
    </>
  );
}
