/**
 * ป๊อบอัพ "ตั้งค่า" — ทางเข้าคือปุ่มเฟืองที่มีอยู่ทุกโครงหน้า
 *
 * รวมการตั้งค่าทั้งหมดไว้ที่เดียว แบ่งเป็นแท็บเพราะเนื้อหายาวเกินกว่าจะเลื่อนหาเจอ:
 *   ธีมบทบาท · โหมดสี · การแสดงผล · เลย์เอาต์ · เกณฑ์ · แจ้งเตือน · บัญชี
 *
 * เปิด/ปิดจาก SettingsProvider (state กลาง) ไม่ใช่ state ของแต่ละโครงหน้า —
 * เพราะมีปุ่มเรียกจากหลายที่และต้องมีป๊อบอัพเดียวในแอปเท่านั้น
 *
 * ทุกช่องมีผลทันทีและเก็บลง localStorage ให้เอง ไม่มีปุ่มบันทึก
 */
import { useEffect, useRef, useState } from "react";
import { useActivitySettings } from "../../lib/api/activity.js";
import { Link, useNavigate } from "react-router-dom";
import { changePassword } from "../../lib/auth/authApi.js";
import Modal from "../ui/Modal.jsx";
import Icon from "../ui/Icon.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";
import AdminNote from "../ui/AdminNote.jsx";
import LayoutSettings from "../board/LayoutSettings.jsx";
import { RoleChooser, ModeChooser } from "../theme/ThemeChoosers.jsx";
import { useT, useLang } from "../../lib/i18n/useT.js";
import { LANGS } from "../../lib/i18n/langs.js";
import { useTheme } from "../../lib/theme/useTheme.js";
import { useSettings } from "../../lib/settings/useSettings.js";
import { useAuth } from "../../lib/auth/useAuth.js";
import { getAccountRole } from "../../lib/auth/roles.js";
import {
  MAX_NAV,
  MAX_TILES,
  NAV_KEYS,
  SECTIONS,
  TILE_KEYS,
} from "../../lib/theme/themes.js";
import {
  ALERT_MIN_LEVELS,
  COMFORT_LIMITS,
  DENSITIES,
  HOME_PAGES,
  KWH_RATE_LIMITS,
  PHOTO_STRENGTH,
  PHOTO_STRENGTH_MARKS,
  TEXT_SCALE,
  TEXT_SCALE_MARKS,
} from "../../lib/settings/defaults.js";
import { ALERT_CATEGORIES } from "../../data/mock/alerts.js";
import { LOG_EVENTS } from "../../lib/auth/sessions.js";
import { useAuthEvents } from "../../lib/auth/useAuthEvents.js";
import { formatNumber, formatNumber1, formatDateTime } from "../../lib/format.js";
import "./settings.css";

/** ต้องตรงกับที่หลังบ้านตรวจ (server/src/modules/auth/route.js) */
const MIN_PASSWORD = 8;

const TABS = [
  { id: "home", label: "หน้าเปิดระบบ", icon: "home" },
  { id: "role", label: "ธีมบทบาท", icon: "user" },
  { id: "color", label: "โหมดสี", icon: "grid" },
  { id: "lang", label: "ภาษา", icon: "globe" },
  { id: "display", label: "การแสดงผล", icon: "eye" },
  { id: "layout", label: "เลย์เอาต์", icon: "expand" },
  { id: "comfort", label: "เกณฑ์", icon: "thermometer" },
  { id: "alerts", label: "แจ้งเตือน", icon: "bell" },
  { id: "account", label: "บัญชี", icon: "key" },
];

/** จำนวนบรรทัดของบันทึกการเข้าใช้งานที่แสดงในป๊อบอัพ (ที่เก็บไว้จริงมากกว่านี้ — ดู sessions.js) */
const HISTORY_SHOWN = 8;

/** ตัวเลือกแบบติ๊กหลายอัน — ติ๊กครบเพดานแล้วอันที่เหลือกดไม่ได้ (ไม่ใช่ติ๊กแล้วค่อยด่า) */
function SectionPicker({ legend, keys, chosen, max, onChange }) {
  const t = useT();
  const toggle = (key) =>
    onChange(
      chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key],
    );

  return (
    <fieldset className="st-picker">
      <legend className="st-picker-head">
        {legend}
        <span className="st-picker-note">
          {t("เลือกได้สูงสุด {max} รายการ (ตอนนี้ {n})", {
            max: formatNumber(max),
            n: formatNumber(chosen.length),
          })}
        </span>
      </legend>

      <div className="st-picker-list">
        {keys.map((key) => {
          const section = SECTIONS[key];
          const on = chosen.includes(key);
          const full = !on && chosen.length >= max;
          return (
            <label
              key={key}
              className={
                "st-opt" + (on ? " is-on" : "") + (full ? " is-full" : "")
              }
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                disabled={full}
                onChange={() => toggle(key)}
              />
              <span className="st-opt-box" aria-hidden="true">
                {on && <Icon name="check" size={15} />}
              </span>
              <Icon name={section.icon} size={19} className="st-opt-icon" />
              {t(section.label)}
            </label>
          );
        })}
      </div>

      {/* ลำดับที่ติ๊กคือลำดับที่แสดงจริง บอกไว้ไม่งั้นผู้ใช้จะงงว่าทำไมสลับที่ */}
      <p className="st-picker-order">
        <Icon name="list" size={16} />
        {t("เรียงตามลำดับที่ติ๊ก: {list}", {
          list:
            chosen.length > 0
              ? chosen
                  .map((k) => (SECTIONS[k] ? t(SECTIONS[k].label) : null))
                  .filter(Boolean)
                  .join(" · ")
              : t("ยังไม่ได้เลือก"),
        })}
      </p>
    </fieldset>
  );
}

/** แถวตัวเลือกแบบเลือกได้อันเดียว */
/**
 * แถวตัวเลือกแบบเลือกอันเดียว
 * `locked` = สิทธิ์ไม่ถึง — ยังเห็นค่าที่ตั้งไว้ทั้งหมด แต่กดเปลี่ยนไม่ได้ (ดู AdminNote.jsx)
 */
function ChoiceRow({ legend, options, value, onChange, name, locked = false }) {
  const t = useT();
  return (
    <fieldset className="st-choice" disabled={locked}>
      <legend className="st-choice-head">{legend}</legend>
      <div className="st-choice-list" role="radiogroup" aria-label={legend}>
        {options.map((option) => {
          const on = option.id === value;
          return (
            <label
              key={option.id}
              className={
                "st-choice-opt" + (on ? " is-on" : "") + (locked ? " is-locked" : "")
              }
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                checked={on}
                disabled={locked}
                onChange={() => onChange(option.id)}
              />
              <b>{t(option.label)}</b>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** สวิตช์เปิด/ปิด — role="switch" เพราะเป็นการสั่งเปิด/ปิด ไม่ใช่ติ๊กในฟอร์ม */
function Toggle({ label, checked, onChange, locked = false }) {
  return (
    <div className="st-toggle">
      <span className="st-toggle-text">
        <b>{label}</b>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={"eq-switch" + (locked ? " is-locked" : "")}
        disabled={locked}
        onClick={() => onChange(!checked)}
      >
        <span className="eq-switch-knob" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * ช่องปรับตัวเลขแบบมีปุ่มลบ/บวก
 * ส่งค่าใหม่เป็น "ฟังก์ชันของค่าเดิม" เสมอ กดรัว ๆ หลายครั้งจึงนับครบทุกครั้ง
 * (ถ้าคำนวณจาก value ที่อ่านตอน render การกด 4 ครั้งเร็ว ๆ จะขยับแค่ขั้นเดียว)
 */
function NumberRow({ label, value, limits, format = formatNumber, onChange, locked = false }) {
  const t = useT();
  const step = limits.step;
  const clamp = (n) => Math.min(limits.max, Math.max(limits.min, n));
  /* ปัดให้ลงล็อกกับ step เสมอ กันเลขอย่าง 4.0000000001 จากการบวกทศนิยม */
  const snap = (n) => Number((Math.round(clamp(n) / step) * step).toFixed(2));

  return (
    <div className="st-number">
      <span className="st-number-text">
        <b>{label}</b>
      </span>
      <span className={"st-number-ctrl" + (locked ? " is-locked" : "")}>
        <button
          type="button"
          onClick={() => onChange((cur) => snap(cur - step))}
          disabled={locked || value <= limits.min}
          aria-label={t("ลด{label}", { label })}
        >
          <Icon name="minus" size={16} />
        </button>
        <b className="num">
          {format(value)} {t(limits.unit)}
        </b>
        <button
          type="button"
          onClick={() => onChange((cur) => snap(cur + step))}
          disabled={locked || value >= limits.max}
          aria-label={t("เพิ่ม{label}", { label })}
        >
          <Icon name="plus" size={16} />
        </button>
      </span>
    </div>
  );
}

/**
 * แถบเลื่อนขนาดตัวอักษร — ลากได้ต่อเนื่อง 80%–150% พร้อมตัวอย่างที่ขยายตามทันที
 * ใช้ <input type="range"> ของจริง จึงลากด้วยเมาส์/นิ้ว และกดลูกศรซ้าย-ขวาได้ในตัว
 */
function TextScaleSlider({ value, onChange }) {
  const t = useT();
  const pct =
    ((value - TEXT_SCALE.min) / (TEXT_SCALE.max - TEXT_SCALE.min)) * 100;

  return (
    <div className="st-slider">
      <div className="st-slider-head">
        <span className="st-slider-title">
          <b>{t("ขนาดตัวอักษร")}</b>
        </span>
        <span className="st-slider-value num">{formatNumber(value)}%</span>
      </div>

      <div className="st-slider-row">
        {/* ตัว ก เล็ก-ใหญ่ที่ปลายแถบ — บอกทิศได้ตรงกว่าไอคอนใด ๆ และไม่ผสมสไตล์ไอคอน */}
        <span className="st-slider-small" aria-hidden="true">
          ก
        </span>
        <span className="st-slider-track">
          {/* ส่วนที่ผ่านมาแล้วของแถบ — วาดเองเพราะแต่ละเบราว์เซอร์ทาสีคนละแบบ */}
          <span
            className="st-slider-fill"
            style={{ width: `${pct}%` }}
            aria-hidden="true"
          />
          <input
            type="range"
            min={TEXT_SCALE.min}
            max={TEXT_SCALE.max}
            step={TEXT_SCALE.step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label={t("ขนาดตัวอักษร เป็นเปอร์เซ็นต์")}
            aria-valuetext={t("{value} เปอร์เซ็นต์", { value })}
          />
        </span>
        <span className="st-slider-big" aria-hidden="true">
          ก
        </span>
      </div>

      {/* ขีดบอกตำแหน่งสำคัญ — กดได้ด้วย เผื่ออยากกลับไป 100% เร็ว ๆ */}
      <div className="st-slider-marks">
        {TEXT_SCALE_MARKS.map((mark) => (
          <button
            key={mark.value}
            type="button"
            className={
              "st-slider-mark" + (value === mark.value ? " is-on" : "")
            }
            onClick={() => onChange(mark.value)}
          >
            <span className="num">{mark.value}%</span>
            {t(mark.label)}
          </button>
        ))}
      </div>

      <p className="st-slider-preview">
        <b>{t("ตัวอย่าง")}</b>{" "}
        {t("อุณหภูมิโรงเรือน A1 อยู่ที่ 26.2 °C · ความชื้น 71%")}
      </p>
    </div>
  );
}

/**
 * แถบเลื่อน "ความเข้มของภาพพื้นหลัง" — โครงเดียวกับแถบขนาดตัวอักษร
 * ปลายซ้าย = ม่านทึบ (เห็นภาพจาง) · ปลายขวา = เห็นภาพเต็มที่
 * ใช้ไอคอนดวงตาสองขนาดบอกทิศ (กติกาห้ามใช้ emoji และต้องอ่านออกที่ 18px)
 */
function PhotoStrengthSlider({ value, onChange }) {
  const t = useT();
  const pct =
    ((value - PHOTO_STRENGTH.min) / (PHOTO_STRENGTH.max - PHOTO_STRENGTH.min)) *
    100;

  return (
    <div className="st-slider">
      <div className="st-slider-head">
        <span className="st-slider-title">
          <b>{t("ความเข้มของภาพพื้นหลัง")}</b>
        </span>
        <span className="st-slider-value num">{formatNumber(value)}%</span>
      </div>

      <div className="st-slider-row">
        <span className="st-slider-small" aria-hidden="true">
          <Icon name="eye" size={16} />
        </span>
        <span className="st-slider-track">
          <span
            className="st-slider-fill"
            style={{ width: `${pct}%` }}
            aria-hidden="true"
          />
          <input
            type="range"
            min={PHOTO_STRENGTH.min}
            max={PHOTO_STRENGTH.max}
            step={PHOTO_STRENGTH.step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label={t("ความเข้มของภาพพื้นหลัง เป็นเปอร์เซ็นต์")}
            aria-valuetext={t("{value} เปอร์เซ็นต์", { value })}
          />
        </span>
        <span className="st-slider-big" aria-hidden="true">
          <Icon name="eye" size={22} />
        </span>
      </div>

      <div className="st-slider-marks">
        {PHOTO_STRENGTH_MARKS.map((mark) => (
          <button
            key={mark.value}
            type="button"
            className={
              "st-slider-mark" + (value === mark.value ? " is-on" : "")
            }
            onClick={() => onChange(mark.value)}
          >
            <span className="num">{mark.value}%</span>
            {t(mark.label)}
          </button>
        ))}
      </div>

      {/* ตัวอย่างภาพจริงย่อส่วน — เห็นผลทันทีโดยไม่ต้องปิดป๊อบอัพไปดูหน้าเบื้องหลัง */}
      <span
        className="st-bg-preview"
        style={{ "--photo-strength": String(value / 100) }}
        aria-hidden="true"
      />
    </div>
  );
}

export default function SettingsModal() {
  const [tab, setTab] = useState("home");
  const t = useT();
  const navigate = useNavigate();
  const { lang, setLang } = useLang();
  const {
    role,
    mode,
    customNav,
    customTiles,
    setRoleId,
    setModeId,
    setCustomNav,
    setCustomTiles,
    reset: resetTheme,
  } = useTheme();
  const {
    settings,
    homeLabel,
    homePath,
    settingsOpen,
    settingsTab,
    closeSettings,
    set,
    setComfort,
    toggleCategory,
    isMuted,
    reset,
    clearAll,
  } = useSettings();
  /* สิทธิ์การใช้งาน — คนละเรื่องกับ `role` ข้างบนที่เป็น "ธีมบทบาท" (ดู lib/auth/roles.js) */
  const {
    role: account,
    userId: signedInAs,
    can,
    remembered,
    forget,
    signOut,
  } = useAuth();
  const canSystem = can("system.settings");
  /* เกณฑ์และการแจ้งเตือน — ผู้บันทึกขึ้นไปแก้ได้ (T1.251) · ค่าไฟ/ล้างข้อมูลยังเป็น canSystem */
  const canRules = can("rules.write");

  /* ---------- ฟอร์มเปลี่ยนรหัสผ่านของตัวเอง ----------
     เก็บ state ไว้ในป๊อบอัพนี้ ไม่ต้องมี context เพราะไม่มีใครนอกฟอร์มต้องรู้ค่าพวกนี้
     `pwState` = null (ยังไม่ได้ส่ง) · "busy" · { ok } · { error } */
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNext, setPwNext] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwState, setPwState] = useState(null);

  /* ถามยืนยันก่อนออกจากระบบ — ย้อนกลับเองไม่ได้ ต้องกรอกรหัสใหม่ */
  const [signOutAsking, setSignOutAsking] = useState(false);
  const signOutRef = useRef(null);

  /* แถบหมวดด้านซ้ายเลื่อนได้ (หมวดเยอะกว่าความสูงจอ) ปุ่มออกอยู่ล่างสุด
     พอกางเป็นคำถามยืนยัน ปุ่ม "ยืนยัน" อาจไปโผล่ใต้ขอบล่างพอดี
     ➜ เลื่อนให้เห็นเองทุกครั้งที่กาง คนจะได้ไม่ต้องหาว่าปุ่มยืนยันหายไปไหน */
  useEffect(() => {
    if (signOutAsking) signOutRef.current?.scrollIntoView({ block: "nearest" });
  }, [signOutAsking]);

  /**
   * ส่งฟอร์มเปลี่ยนรหัสผ่าน
   *
   * ตรวจสองอย่างที่ฝั่งนี้ก่อนยิง เพราะรู้คำตอบอยู่แล้วไม่ต้องรอเซิร์ฟเวอร์:
   * ความยาวขั้นต่ำ และช่องยืนยันตรงกัน (ที่เหลือเซิร์ฟเวอร์เป็นคนตัดสิน เช่นรหัสเดิมถูกไหม)
   *
   * **ล้างช่องทั้งหมดทุกครั้งที่จบ** ไม่ว่าสำเร็จหรือไม่ — รหัสผ่านไม่ควรค้างอยู่ในหน้าจอ
   */
  const submitPassword = async (e) => {
    e.preventDefault();
    if (pwNext.length < MIN_PASSWORD) {
      return setPwState({ error: t("รหัสผ่านใหม่ต้องยาวอย่างน้อย {n} ตัวอักษร", { n: MIN_PASSWORD }) });
    }
    if (pwNext !== pwConfirm) {
      return setPwState({ error: t("รหัสผ่านใหม่สองช่องไม่ตรงกัน") });
    }
    setPwState("busy");
    const res = await changePassword(pwCurrent, pwNext);
    setPwCurrent("");
    setPwNext("");
    setPwConfirm("");
    setPwState(res.ok ? { ok: true } : { error: res.message });
  };
  /* บันทึกการเข้าใช้งานจากเซิร์ฟเวอร์ — โหลดใหม่ทุกครั้งที่เปิดหมวดบัญชี (T1.255)
     ที่มาเดียวกับช่อง "เข้าล่าสุด" ของหน้าจัดการผู้ใช้ เวลาจึงตรงกัน
     ขอเกินที่โชว์ไปหนึ่งบรรทัด เพื่อรู้ว่ามีเก่ากว่านี้อีกไหม */
  const authLog = useAuthEvents(settingsOpen && tab === "account", signedInAs, HISTORY_SHOWN + 1);
  const recentHistory = authLog.events.slice(0, HISTORY_SHOWN);

  /* เปิดมาที่หมวดที่ผู้เรียกระบุ (เช่นกดชิปสิทธิ์บนแถบเมนู → หมวดบัญชี) */
  useEffect(() => {
    if (settingsOpen && settingsTab) setTab(settingsTab);
  }, [settingsOpen, settingsTab]);

  const c = settings.comfort;

  return (
    <Modal
      open={settingsOpen}
      onClose={closeSettings}
      icon="gear"
      title={t("ตั้งค่า")}
      /* ตรึงขนาดกล่อง — สลับแท็บแล้วต้องไม่เปลี่ยนรูปทรงและไม่ขยับตำแหน่ง */
      tall
      footer={
        <div className="st-actions">
          <span className="st-actions-now">
            {t("หน้าเปิดระบบ")}
            <b>{t(homeLabel)}</b> {t("· ธีม")}
            <b>{t(role.name)}</b> {t("· โทน")}
            <b>{t(mode.name)}</b> {t("· ภาษา")}
            <b>{LANGS.find((l) => l.id === lang)?.name}</b> ·{" "}
            <b>{formatNumber(settings.textScalePct)}%</b>
            <StatusBadge tone="good">{t("บันทึกในเครื่องแล้ว")}</StatusBadge>
          </span>
          <button
            type="button"
            className="modal-btn is-primary"
            onClick={closeSettings}
          >
            <Icon name="check" size={19} />
            {t("เสร็จสิ้น")}
          </button>
        </div>
      }
    >
      {/* แถบหมวดอยู่คอลัมน์ซ้าย เนื้อหาอยู่คอลัมน์ขวา — เห็นหมวดทั้งหมดพร้อมกันตลอดเวลา
          และเลื่อนดูเนื้อหายาว ๆ ได้โดยที่รายการหมวดไม่เลื่อนหนีไปด้วย */}
      <nav
        className="st-side"
        role="tablist"
        aria-label={t("หมวดการตั้งค่า")}
        aria-orientation="vertical"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={"st-tab" + (tab === item.id ? " is-on" : "")}
            onClick={() => setTab(item.id)}
          >
            <Icon name={item.icon} size={18} aria-hidden="true" />
            {t(item.label)}
          </button>
        ))}

        {/* ---------- ออกจากระบบ — ล่างสุดของแถบหมวดด้านซ้าย ----------
            ย้ายมาจากปุ่มทองบนแถบเมนู (T1.147 → T1.148 → ที่นี่)
            อยู่ล่างสุดของแถบซ้ายเพราะเป็น "ทางออก" ไม่ใช่หมวดตั้งค่าอีกหมวดหนึ่ง
            จึงคั่นด้วยเส้นและดันลงล่างด้วย margin-top:auto ให้ห่างจากรายการหมวด

            **อยู่นอก role="tablist" ไม่ได้** เพราะต้องอยู่ท้ายแถบเดียวกัน
            ➜ ใส่ role="none" กันไม่ให้โปรแกรมอ่านหน้าจอนับเป็นแท็บที่ 10
               (มันไม่ได้เปิดแผงอะไร แต่พาออกจากระบบ ซึ่งคนละเรื่องกันคนละชนิด)

            **ถามยืนยันก่อนเสมอ** — ออกจากระบบย้อนกลับเองไม่ได้ ต้องกรอกรหัสใหม่ */}
        <div className="st-signout" role="none" ref={signOutRef}>
          {signOutAsking ? (
            <>
              <p className="st-signout-ask">
                <Icon name="warn" size={16} aria-hidden="true" />
                {t("ออกแล้วต้องเข้าใหม่")}
              </p>
              {/* สองปุ่มเรียงแถวเดียว — แถบซ้ายสูงจำกัด ถ้าวางซ้อนกันสามชั้น
                  ตอนกางจะล้นขอบล่างจนต้องเลื่อนหาปุ่มยืนยัน */}
              <span className="st-signout-btns">
                <button
                  type="button"
                  className="st-signout-btn is-confirm"
                  onClick={() => {
                    setSignOutAsking(false);
                    closeSettings();
                    signOut();
                    navigate("/");
                  }}
                >
                  <Icon name="login" size={16} />
                  {t("ยืนยัน")}
                </button>
                <button
                  type="button"
                  className="st-signout-btn"
                  onClick={() => setSignOutAsking(false)}
                >
                  {t("ไม่ออก")}
                </button>
              </span>
            </>
          ) : (
            <button
              type="button"
              className="st-signout-btn"
              onClick={() => setSignOutAsking(true)}
            >
              <Icon name="login" size={17} />
              {t("ออกจากระบบ")}
            </button>
          )}
        </div>
      </nav>

      <div className="st-panel">
      {/* ---------- หน้าที่เปิดตอนเข้าระบบ ---------- */}
      {tab === "home" && (
        <>
          {/* บอกให้ชัดว่าค่านี้คุมอะไร — ไม่งั้นถูกเข้าใจว่าเป็นปลายทางของปุ่ม "หน้าแรก"
             แล้วพอตั้งเป็นหน้าอื่น กดปุ่มหน้าแรกทีไรก็งงว่าทำไมไม่ไปหน้าภาพรวม
             (ข้อความเดิมบอกว่ามีผลตอนกดโลโก้ด้วย ซึ่งไม่จริง โลโก้ไปหน้าภาพรวมเสมอ) */}
          <p className="st-picker-note">
            {t(
              "หน้าที่ระบบเปิดให้ทันทีหลังกดเข้าสู่ระบบ · โลโก้และปุ่ม “หน้าแรก” บนแถบเมนูยังไปหน้าภาพรวมเสมอ",
            )}
          </p>

          {/* ผลของค่านี้เห็นได้ครั้งต่อไปที่เข้าสู่ระบบ ซึ่งนานเกินกว่าจะรู้ว่ากดแล้วมีอะไรเปลี่ยน
              จึงบอกผลเป็นประโยคตรง ๆ พร้อมปุ่มลองเปิดหน้านั้นเดี๋ยวนี้ */}
          <div className="st-home-now">
            <span className="st-home-now-text">
              <Icon name="spark" size={18} aria-hidden="true" />
              {t("เข้าสู่ระบบครั้งต่อไป ระบบจะเปิดหน้า")}
              <b>{t(homeLabel)}</b>
            </span>
            <button
              type="button"
              className="st-home-now-btn"
              onClick={() => {
                closeSettings();
                navigate(homePath);
              }}
            >
              <Icon name="chevron" size={17} />
              {t("เปิดหน้านี้เลย")}
            </button>
          </div>

          <div
            className="st-homes"
            role="radiogroup"
            aria-label={t("หน้าที่เปิดตอนเข้าระบบ")}
          >
            {HOME_PAGES.map((page) => {
              const on = page.id === settings.homePage;
              return (
                <label
                  key={page.id}
                  className={"st-home" + (on ? " is-on" : "")}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name="st-home"
                    checked={on}
                    onChange={() => set("homePage", page.id)}
                  />
                  <span className="icon-chip is-sm" aria-hidden="true">
                    <Icon name={page.icon} size={18} />
                  </span>
                  <b>{t(page.label)}</b>
                  <span className="st-check" aria-hidden="true">
                    {on && <Icon name="check" size={15} />}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}

      {/* ---------- ธีมบทบาท ---------- */}
      {tab === "role" && (
        <>
          <RoleChooser value={role.id} onChange={setRoleId} name="st-role" />

          {role.custom ? (
            <div className="st-pickers">
              <SectionPicker
                legend={t("เมนูบนแถบเมนูหลัก")}
                keys={NAV_KEYS}
                chosen={customNav}
                max={MAX_NAV}
                onChange={setCustomNav}
              />
              <SectionPicker
                legend={t("กล่องสรุปในหน้าภาพรวม")}
                keys={TILE_KEYS}
                chosen={customTiles}
                max={MAX_TILES}
                onChange={setCustomTiles}
              />
            </div>
          ) : null}
        </>
      )}

      {/* ---------- โหมดโทนสี ---------- */}
      {tab === "color" && (
        <>
          <ModeChooser value={mode.id} onChange={setModeId} name="st-mode" />
        </>
      )}

      {/* ---------- ภาษา ----------
          ชื่อภาษาเขียนด้วยภาษานั้นเองเสมอ (ไทย · English · 中文) —
          คนที่เผลอสลับไปภาษาที่อ่านไม่ออกจะยังหาทางกลับได้ */}
      {tab === "lang" && (
        <div className="st-homes" role="radiogroup" aria-label={t("ภาษา")}>
          {LANGS.map((item) => {
            const on = item.id === lang;
            return (
              <label key={item.id} className={"st-home" + (on ? " is-on" : "")}>
                <input
                  type="radio"
                  className="sr-only"
                  name="st-lang"
                  checked={on}
                  onChange={() => setLang(item.id)}
                />
                <span className="icon-chip is-sm" aria-hidden="true">
                  <Icon name="globe" size={18} />
                </span>
                <b lang={item.id}>{item.name}</b>
                <span className="st-check" aria-hidden="true">
                  {on && <Icon name="check" size={15} />}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {/* ---------- การแสดงผล ---------- */}
      {tab === "display" && (
        <>
          <TextScaleSlider
            value={settings.textScalePct}
            onChange={(v) => set("textScalePct", v)}
          />

          <PhotoStrengthSlider
            value={settings.photoStrengthPct}
            onChange={(v) => set("photoStrengthPct", v)}
          />

          <ChoiceRow
            legend={t("ความหนาแน่นของเลย์เอาต์")}
            options={DENSITIES}
            value={settings.density}
            onChange={(v) => set("density", v)}
            name="st-density"
          />
          <Toggle
            label={t("ลดการเคลื่อนไหว")}
            checked={settings.reduceMotion}
            onChange={(v) => set("reduceMotion", v)}
          />
          {/* ทางกลับของปุ่มกากบาทบนแถบลอย — ปิดไปแล้วต้องมีที่เปิดคืนถาวร
              ปุ่มบนแถบมีสองตัวและเป็นคนละระบบ จึงต้องมีสวิตช์แยกกันสองตัว */}
          <Toggle
            label={t("แสดงผู้ช่วย AI บนแถบลอย")}
            checked={settings.showAssistant}
            onChange={(v) => set("showAssistant", v)}
          />
          <Toggle
            label={t("แสดง Voice AI บนแถบลอย")}
            checked={settings.showVoiceAi}
            onChange={(v) => set("showVoiceAi", v)}
          />
        </>
      )}

      {/* ---------- เลย์เอาต์ ---------- */}
      {tab === "layout" && (
        <>
          <LayoutSettings onStartEditing={closeSettings} />
        </>
      )}

      {/* ---------- เกณฑ์สภาพแวดล้อม ---------- */}
      {tab === "comfort" && (
        <>
          {/* เกณฑ์เปลี่ยนความหมายของคำว่า "ปกติ" ให้ทั้งแอป — ตัวเลข "หลุดเกณฑ์กี่หลัง"
              บนหน้าภาพรวมและหน้าอุณหภูมิของทุกคนขยับตามทันที จึงแก้ได้ตั้งแต่ผู้บันทึกขึ้นไป (T1.251) */}
          {!canRules && (
            <AdminNote action="rules.write">
              {t("เกณฑ์นี้เปลี่ยนตัวเลข “หลุดเกณฑ์” ที่ทุกคนเห็น")}
            </AdminNote>
          )}
          <div className="st-numbers">
            <NumberRow
              label={t("อุณหภูมิต่ำสุดที่ยอมรับ")}
              value={c.tempMin}
              limits={COMFORT_LIMITS.tempMin}
              locked={!canRules}
              onChange={(v) => setComfort("tempMin", v)}
            />
            <NumberRow
              label={t("อุณหภูมิสูงสุดที่ยอมรับ")}
              value={c.tempMax}
              limits={COMFORT_LIMITS.tempMax}
              locked={!canRules}
              onChange={(v) => setComfort("tempMax", v)}
            />
            <NumberRow
              label={t("ความชื้นต่ำสุดที่ยอมรับ")}
              value={c.humidityMin}
              limits={COMFORT_LIMITS.humidityMin}
              locked={!canRules}
              onChange={(v) => setComfort("humidityMin", v)}
            />
            <NumberRow
              label={t("ความชื้นสูงสุดที่ยอมรับ")}
              value={c.humidityMax}
              limits={COMFORT_LIMITS.humidityMax}
              locked={!canRules}
              onChange={(v) => setComfort("humidityMax", v)}
            />
            <NumberRow
              label={t("เกณฑ์แอมโมเนีย (NH₃)")}
              value={c.nh3Limit}
              limits={COMFORT_LIMITS.nh3Limit}
              locked={!canRules}
              onChange={(v) => setComfort("nh3Limit", v)}
            />
          </div>
        </>
      )}

      {/* ---------- การแจ้งเตือน ---------- */}
      {tab === "alerts" && (
        <>
          {/* ปิดหมวดแจ้งเตือนผิดใบเดียวอาจทำให้ทั้งทีมพลาดเรื่องสำคัญ — ไม่ใช่ค่าหน้าจอส่วนตัว */}
          {!canRules && (
            <AdminNote action="rules.write">
              {t("การปิดแจ้งเตือนมีผลกับทุกคน ไม่ใช่เฉพาะเครื่องนี้")}
            </AdminNote>
          )}
          <ChoiceRow
            legend={t("ระดับต่ำสุดที่จะแสดง")}
            options={ALERT_MIN_LEVELS}
            value={settings.alertMinLevel}
            onChange={(v) => set("alertMinLevel", v)}
            name="st-alert-level"
            locked={!canRules}
          />

          <fieldset className="st-picker" disabled={!canRules}>
            <legend className="st-picker-head">
              {t("หมวดที่ต้องการให้เตือน")}
              <span className="st-picker-note">
                {t("ปิดอยู่ {n} จาก {total} หมวด", {
                  n: formatNumber(settings.mutedCategories.length),
                  total: formatNumber(ALERT_CATEGORIES.length),
                })}
              </span>
            </legend>
            <div className="st-picker-list">
              {ALERT_CATEGORIES.map((category) => {
                const on = !isMuted(category.id);
                return (
                  <label
                    key={category.id}
                    className={
                      "st-opt" + (on ? " is-on" : "") + (canRules ? "" : " is-locked")
                    }
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      disabled={!canRules}
                      onChange={() => toggleCategory(category.id)}
                    />
                    <span className="st-opt-box" aria-hidden="true">
                      {on && <Icon name="check" size={15} />}
                    </span>
                    <Icon
                      name={category.icon}
                      size={19}
                      className="st-opt-icon"
                    />
                    {t(category.label)}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* ═══ แจ้งเตือนกิจกรรมของคน (T1.359) ═══ */}
          <ActivityNotify canRules={canRules} />

          {/* ตัวเลือก "แสดงตัวเลขบนกระดิ่ง" ถูกถอดออกพร้อมกับกระดิ่ง (T1.122) */}
        </>
      )}

      {/* ---------- บัญชีและระบบ ---------- */}
      {tab === "account" && (
        <>
          {/* ---------- สิทธิ์ที่ใช้อยู่ ----------
              อ่านอย่างเดียวโดยตั้งใจ: ถ้าเปลี่ยนสิทธิ์ตัวเองได้ตรงนี้ การแบ่งสิทธิ์ก็ไม่มีความหมาย
              ต้องออกจากระบบแล้วเข้าใหม่ ซึ่งเป็นที่เดียวที่เลือกสิทธิ์ได้ (ดู pages/Login.jsx) */}
          <section className="st-account">
            <p className="st-account-head">
              <span className="icon-chip is-sm" aria-hidden="true">
                <Icon name={account.icon} size={18} />
              </span>
              <span className="st-account-text">
                {/* บอกทั้ง "คุณคือใคร" และ "คุณมีสิทธิ์อะไร" — สิทธิ์ผูกกับรหัสผู้ใช้แล้ว
                    ยังไม่ได้เข้าสู่ระบบก็มีสิทธิ์อยู่ แต่ไม่มีรหัสจะแสดง */}
                <span>
                  {signedInAs
                    ? t("เข้าสู่ระบบด้วยรหัส {id}", { id: signedInAs })
                    : t("ยังไม่ได้เข้าสู่ระบบ")}
                </span>
                <b>{t(account.name)}</b>
              </span>
              <StatusBadge tone={account.tone}>
                {t(account.tagline)}
              </StatusBadge>
            </p>

            <div className="st-account-lists">
              <div className="st-account-list">
                <p className="st-account-list-head">
                  <Icon name="check" size={16} aria-hidden="true" />
                  {t("ทำได้")}
                </p>
                <ul>
                  {account.allows.map((line) => (
                    <li key={line}>{t(line)}</li>
                  ))}
                </ul>
              </div>

              {account.denies.length > 0 && (
                <div className="st-account-list is-deny">
                  <p className="st-account-list-head">
                    <Icon name="lock" size={16} aria-hidden="true" />
                    {t("ทำไม่ได้")}
                  </p>
                  <ul>
                    {account.denies.map((line) => (
                      <li key={line}>{t(line)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <p className="st-account-foot">
              <Icon name="clock" size={16} aria-hidden="true" />
              {t("สิทธิ์มาจากบัญชีที่เข้าระบบ — เปลี่ยนสิทธิ์ต้องออกจากระบบแล้วเข้าด้วยบัญชีอื่น")}
            </p>

            {/* ---------- เปลี่ยนรหัสผ่านของตัวเอง ----------
                **โชว์เฉพาะตอนเข้าสู่ระบบแล้ว** — ยังไม่ได้เข้าก็ไม่มีรหัสผ่านของใครให้เปลี่ยน
                พับไว้เป็นค่าตั้งต้น เพราะเป็นงานที่ทำนาน ๆ ครั้ง ไม่ควรกินที่ในหมวดนี้ตลอดเวลา */}
            {signedInAs && (
              <div className="st-pw">
                <button
                  type="button"
                  className="st-pw-toggle"
                  onClick={() => {
                    setPwOpen((v) => !v);
                    setPwState(null);
                  }}
                  aria-expanded={pwOpen}
                >
                  <Icon name="lock" size={18} aria-hidden="true" />
                  <span>
                    <b>{t("เปลี่ยนรหัสผ่าน")}</b>
                    {t("ต้องยืนยันรหัสผ่านเดิมก่อน")}
                  </span>
                  <Icon
                    name="chevron"
                    size={17}
                    className={pwOpen ? "st-pw-arrow is-open" : "st-pw-arrow"}
                    aria-hidden="true"
                  />
                </button>

                {pwOpen && (
                  <form className="st-pw-form" onSubmit={submitPassword}>
                    <label className="st-pw-field">
                      <span>{t("รหัสผ่านเดิม")}</span>
                      <input
                        type="password"
                        value={pwCurrent}
                        onChange={(e) => setPwCurrent(e.target.value)}
                        autoComplete="current-password"
                        required
                      />
                    </label>

                    <label className="st-pw-field">
                      <span>{t("รหัสผ่านใหม่")}</span>
                      <input
                        type="password"
                        value={pwNext}
                        onChange={(e) => setPwNext(e.target.value)}
                        autoComplete="new-password"
                        minLength={MIN_PASSWORD}
                        required
                      />
                    </label>

                    <label className="st-pw-field">
                      <span>{t("พิมพ์รหัสผ่านใหม่อีกครั้ง")}</span>
                      <input
                        type="password"
                        value={pwConfirm}
                        onChange={(e) => setPwConfirm(e.target.value)}
                        autoComplete="new-password"
                        required
                      />
                    </label>

                    {/* บอกผลด้วยไอคอน + ข้อความเสมอ ไม่ได้สื่อด้วยสีอย่างเดียว */}
                    {pwState?.error && (
                      <p className="st-pw-msg is-bad" role="alert">
                        <Icon name="warn" size={16} aria-hidden="true" />
                        {pwState.error}
                      </p>
                    )}
                    {pwState?.ok && (
                      <p className="st-pw-msg is-good" role="status">
                        <Icon name="check" size={16} aria-hidden="true" />
                        {t("เปลี่ยนรหัสผ่านแล้ว — เครื่องอื่นที่ค้างล็อกอินไว้ถูกให้ออกจากระบบทั้งหมด")}
                      </p>
                    )}

                    <button type="submit" className="st-pw-submit" disabled={pwState === "busy"}>
                      <Icon name="check" size={17} />
                      {pwState === "busy" ? t("กำลังบันทึก…") : t("บันทึกรหัสผ่านใหม่")}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* ทางเข้าหน้าจัดการผู้ใช้ — **โชว์ให้ทุกสิทธิ์เห็น** ไม่ซ่อนจากผู้ใช้งานทั่วไป
                (หน้าปลายทางบอกเองว่าต้องขอสิทธิ์จากใคร ตามกติกาใน CLAUDE.md)
                วางไว้หมวดบัญชีเพราะเป็นเรื่องเดียวกัน และไม่ไปเบียดเมนูซ้ายที่ผู้ใช้จัดไว้แล้ว */}
            <Link className="st-users-link" to="/dashboard/users" onClick={closeSettings}>
              <Icon name="user" size={18} aria-hidden="true" />
              <span>
                <b>{t("จัดการผู้ใช้")}</b>
                {t("เพิ่มคนเข้าระบบ · กำหนดสิทธิ์ · ปิดบัญชีที่ไม่ใช้แล้ว")}
              </span>
              <Icon name="chevron" size={17} aria-hidden="true" />
            </Link>

          </section>

          {/* ---------- บัญชีที่จดจำไว้ในเครื่องนี้ ----------
              เป็นค่าของ "เครื่องนี้" ไม่ใช่ของบัญชี ทุกสิทธิ์จึงลบของตัวเองได้
              (เก็บแค่รหัสผู้ใช้ ไม่เก็บรหัสผ่าน — ดู lib/auth/sessions.js) */}
          <section className="st-sessions">
            <p className="st-sessions-head">
              <Icon name="user" size={17} aria-hidden="true" />
              <b>{t("บัญชีที่จดจำไว้ในเครื่องนี้")}</b>
            </p>
            {remembered.length === 0 ? (
              <p className="st-sessions-empty">
                {t("ยังไม่ได้จดจำบัญชีไหนไว้ — ระบบจะถามให้ตอนเข้าสู่ระบบครั้งถัดไป")}
              </p>
            ) : (
              <ul className="st-sessions-list">
                {remembered.map((a) => (
                  <li key={a.userId} className="st-session">
                    <Icon
                      name={getAccountRole(a.roleId).icon}
                      size={17}
                      aria-hidden="true"
                    />
                    <b>{a.userId}</b>
                    {/* บอกตรง ๆ ว่าแถวไหนมีรหัสผ่านเก็บไว้ — คนจะได้รู้ว่ากำลังลบอะไรทิ้ง */}
                    {a.password && (
                      <StatusBadge tone="warning">{t("เก็บรหัสผ่านไว้ด้วย")}</StatusBadge>
                    )}
                    <span className="st-session-time">{formatDateTime(a.at)}</span>
                    <button
                      type="button"
                      className="st-session-btn"
                      onClick={() => forget(a.userId)}
                    >
                      <Icon name="cross" size={15} />
                      {t("ลืมบัญชีนี้")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {remembered.some((a) => a.password) && (
              <p className="st-sessions-foot">
                <Icon name="warn" size={15} aria-hidden="true" />
                {t(
                  "รหัสผ่านที่จดจำไว้เก็บอยู่ในเครื่องนี้แบบอ่านออกได้ — ใช้กับเครื่องส่วนตัวเท่านั้น",
                )}
              </p>
            )}
          </section>

          {/* ---------- บันทึกการเข้าใช้งาน ----------
              อ่านจากเซิร์ฟเวอร์ (T1.255) — ผู้ดูแลระบบเห็นทุกบัญชี · คนอื่นเห็นเฉพาะของตัวเอง
              ไม่มีปุ่มล้างแล้ว: เป็นหลักฐานว่าใครเข้าเมื่อไร คนที่กรอกรหัสผิดต้องลบร่องรอยตัวเองไม่ได้ */}
          <section className="st-sessions">
            <p className="st-sessions-head">
              <Icon name="clock" size={17} aria-hidden="true" />
              <b>{t("บันทึกการเข้าใช้งาน")}</b>
              {authLog.status === "ready" && (
                <span className="st-sessions-count">
                  {authLog.scope === "all" ? t("ทุกบัญชี|บันทึกเข้าใช้งาน") : t("เฉพาะบัญชีของคุณ")}
                </span>
              )}
            </p>
            {!signedInAs ? (
              <p className="st-sessions-empty">{t("เข้าสู่ระบบก่อนจึงจะเห็นบันทึก")}</p>
            ) : authLog.status === "error" ? (
              <p className="st-sessions-empty">{t("โหลดบันทึกจากเซิร์ฟเวอร์ไม่สำเร็จ")}</p>
            ) : authLog.status !== "ready" ? (
              <p className="st-sessions-empty">{t("กำลังโหลด…")}</p>
            ) : recentHistory.length === 0 ? (
              <p className="st-sessions-empty">{t("ยังไม่มีบันทึก")}</p>
            ) : (
              <ul className="st-sessions-list">
                {recentHistory.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="st-session">
                    <Icon
                      name={LOG_EVENTS[e.event]?.icon ?? "clock"}
                      size={17}
                      aria-hidden="true"
                    />
                    <b>{e.username || t("ยังไม่ได้เข้าสู่ระบบ")}</b>
                    <span className="st-session-time">{formatDateTime(e.at)}</span>
                    {/* ใส่บริบทต่อท้าย — ภาษาอังกฤษต้องเป็น "Signed in" (เหตุการณ์ที่เกิดไปแล้ว)
                        ไม่ใช่ "Sign in" ที่เป็นคำสั่งบนปุ่ม · ภาษาไทยใช้คำเดียวกันทั้งสองที่ */}
                    {LOG_EVENTS[e.event] && (
                      <StatusBadge tone={LOG_EVENTS[e.event].tone}>
                        {t(`${LOG_EVENTS[e.event].label}|บันทึกเข้าใช้งาน`)}
                      </StatusBadge>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {authLog.events.length > HISTORY_SHOWN && (
              <div className="st-sessions-foot">
                <span>{t("แสดง {n} รายการล่าสุด", { n: formatNumber(HISTORY_SHOWN) })}</span>
              </div>
            )}
          </section>

          <label className="st-field">
            <span className="st-field-label">
              {/* ชื่อของตัวเอง ใช้ติดไปกับรายการที่ตัวเองบันทึก — ทั้งสองสิทธิ์แก้ของตัวเองได้ */}
              <b>{t("ชื่อผู้บันทึก")}</b>
            </span>
            <input
              type="text"
              value={settings.userName}
              maxLength={40}
              onChange={(e) => set("userName", e.target.value)}
              placeholder={t("เช่น สมชาย ฟาร์มสุข")}
            />
          </label>

          {/* ค่าไฟต่อหน่วยไปโผล่เป็นตัวเงินในหน้าระบบไฟฟ้าและหน้าการเงินของทุกคน */}
          {!canSystem && (
            <AdminNote>
              {t("ค่าไฟและการล้างข้อมูลกระทบตัวเลขของทั้งระบบ จึงทำได้เฉพาะผู้ดูแลระบบ")}
            </AdminNote>
          )}
          <div className="st-numbers">
            <NumberRow
              label={t("ค่าไฟต่อหน่วย")}
              value={settings.bahtPerKwh}
              limits={{ ...KWH_RATE_LIMITS, unit: "บาท/kWh" }}
              format={formatNumber1}
              locked={!canSystem}
              onChange={(v) => set("bahtPerKwh", v)}
            />
          </div>

          <div className="st-danger">
            <div className="st-danger-btns">
              <button
                type="button"
                className={"st-reset-btn" + (canSystem ? "" : " is-locked")}
                disabled={!canSystem}
                onClick={() => {
                  reset();
                  resetTheme();
                }}
              >
                <Icon name={canSystem ? "power" : "lock"} size={19} />
                {t("คืนค่าเริ่มต้นทุกหมวด")}
              </button>
              <button
                type="button"
                className={"st-reset-btn is-danger" + (canSystem ? "" : " is-locked")}
                disabled={!canSystem}
                onClick={clearAll}
              >
                <Icon name={canSystem ? "trash" : "lock"} size={19} />
                {t("ล้างข้อมูลที่เก็บในเครื่อง")}
              </button>
            </div>
          </div>

          </>
      )}
      </div>
    </Modal>
  );
}

/**
 * เลือกว่ากิจกรรมของคนหมวดไหนให้ส่งเข้าไลน์ (T1.359)
 *
 * ★★ สองอย่างนี้ต้องแยกให้ขาดบนหน้าจอ ไม่งั้นคนติ๊กจะเข้าใจผิด:
 *   · **ในแอปเห็นทุกหมวดเสมอ** ไปดูได้ที่หน้าการแจ้งเตือน ไม่ขึ้นกับที่ติ๊กตรงนี้
 *   · ที่ติ๊กตรงนี้คุมเฉพาะ **การส่งออกไลน์** เพราะโควตามีจำกัด (300 ข้อความ/เดือน)
 *
 * ★ ค่านี้เก็บที่เซิร์ฟเวอร์ **มีผลกับทุกคน** เพราะตัวส่งไลน์มีตัวเดียว
 *   ไม่ใช่ค่าหน้าจอส่วนตัวเหมือนขนาดตัวอักษร
 */
function ActivityNotify({ canRules }) {
  const t = useT();
  const { kinds, lineKinds, everyMinutes, status, error, toggle } = useActivitySettings();

  if (status === "loading") {
    return <p className="st-picker-note">{t("กำลังโหลดการตั้งค่า…")}</p>;
  }
  if (status === "error") {
    /* ★ ต่อไม่ได้ = ไม่แสดงช่องติ๊กเลย ดีกว่าแสดงช่องที่ติ๊กแล้วไม่มีผลจริง */
    return (
      <p className="st-picker-note">
        {t("ตั้งค่าแจ้งเตือนกิจกรรมไม่ได้ตอนนี้")} — {t(error ?? "ต่อเซิร์ฟเวอร์ไม่ได้")}
      </p>
    );
  }

  return (
    <fieldset className="st-picker" disabled={!canRules}>
      <legend className="st-picker-head">
        {t("ส่งกิจกรรมของคนเข้าไลน์")}
        <span className="st-picker-note">
          {t("ในแอปเห็นทุกหมวดเสมอ · ที่ติ๊กคือส่งเข้าไลน์เท่านั้น")}
        </span>
      </legend>
      <div className="st-picker-list">
        {kinds.map((kind) => {
          const on = lineKinds.includes(kind.id);
          return (
            <label
              key={kind.id}
              className={"st-opt" + (on ? " is-on" : "") + (canRules ? "" : " is-locked")}
              title={t(kind.hint)}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                disabled={!canRules}
                onChange={() => toggle(kind.id)}
              />
              <span className="st-opt-box" aria-hidden="true">
                {on && <Icon name="check" size={15} />}
              </span>
              {t(kind.label)}
            </label>
          );
        })}
      </div>
      {/* ★ บอกจังหวะส่งไว้ด้วย ไม่งั้นคนติ๊กแล้วไม่เห็นอะไรเด้งทันทีจะคิดว่าไม่ทำงาน */}
      {everyMinutes != null && (
        <p className="st-picker-note">
          {t("รวบส่งเป็นใบเดียวอย่างน้อยทุก {n} นาที เพื่อไม่ให้โควตาไลน์หมด", {
            n: formatNumber(everyMinutes),
          })}
        </p>
      )}
    </fieldset>
  );
}
