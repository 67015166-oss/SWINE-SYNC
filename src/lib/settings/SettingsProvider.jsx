/**
 * ตัวเก็บการตั้งค่าของทั้งแอป (คนละชุดกับธีม — ดู lib/settings/defaults.js ว่าทำไม)
 *
 * - เก็บลง localStorage คีย์ `swine-sync:settings`
 * - ค่าที่เป็น "หน้าตา" (ขนาดตัวอักษร ความหนาแน่น การเคลื่อนไหว) ทาเป็น data-* ที่ <html>
 *   แล้วให้ styles/settings.css เขียนทับ token — ไม่ต้องมี component ไหนรู้เรื่องเลย
 * - ค่าที่เป็น "ตรรกะ" (เกณฑ์สภาพแวดล้อม การแจ้งเตือน ค่าไฟ) ส่งออกทาง useSettings()
 *   ให้หน้าที่ใช้เรียกไปคำนวณเอง
 *
 * ค่าที่อ่านจาก localStorage ถูกกรองทุกตัวก่อนใช้ (sanitize) — ไฟล์เก่าหรือค่าที่ถูกแก้มือ
 * จะไม่ทำให้หน้าจอพัง แค่ตกกลับไปใช้ค่าตั้งต้นของช่องนั้น
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { SettingsContext } from "./useSettings.js";
import { useAuth } from "../auth/useAuth.js";
import { useAlertRuleSync } from "./useAlertRuleSync.js";
import {
  ALERT_MIN_LEVELS,
  COMFORT_LIMITS,
  DEFAULT_SETTINGS,
  DENSITIES,
  HOME_PAGES,
  homePathOf,
  KWH_RATE_LIMITS,
  LEVEL_RANK,
  PHOTO_STRENGTH,
  TEXT_SCALE,
  comfortOf,
} from "./defaults.js";
import { ALERT_CATEGORIES } from "../../data/mock/alerts.js";

const STORE_KEY = "swine-sync:settings";

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** เลือกจากรายการที่มีจริงเท่านั้น ไม่งั้นคืนค่าตั้งต้น */
const pick = (value, list, fallback) =>
  list.some((item) => item.id === value) ? value : fallback;

/** ตัวเลขที่อยู่ในช่วงที่อนุญาต ไม่งั้นคืนค่าตั้งต้น */
const num = (value, limits, fallback) =>
  typeof value === "number" && Number.isFinite(value)
    ? clamp(value, limits.min, limits.max)
    : fallback;

/**
 * เกณฑ์ของค่าชนิดที่เพิ่มมาภายหลัง — คีย์เปิด จึงต้องกรองเข้มกว่ช่องที่รู้ชื่อไว้แล้ว
 *
 * ของใน localStorage ถูกแก้มือหรือเก่าคนละรุ่นได้ ค่าที่รูปไม่ตรงจึงต้องทิ้งเงียบ ๆ
 * ★ ขอบล่างต้องน้อยกว่าขอบบนเสมอ — กลับด้านเมื่อไร จะไม่มีค่าไหนผ่านเกณฑ์ได้เลย
 *   แล้วทุกค่าจะขึ้นสีเตือนตลอดโดยหาสาเหตุไม่ได้
 */
const METRIC_KEY = /^[a-z][a-z0-9_]{0,63}$/i;
/** กันไม่ให้โตไม่รู้จบ ถ้ามีเกินนี้แปลว่ามีอะไรผิดปกติมากกว่าการตั้งเกณฑ์ด้วยมือ */
const MAX_METRIC_RANGES = 50;

function sanitizeMetricRanges(raw) {
  const saved = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const [key, value] of Object.entries(saved)) {
    if (!METRIC_KEY.test(key) || !value || typeof value !== "object") continue;

    const min = typeof value.min === "number" && Number.isFinite(value.min) ? value.min : null;
    const max = typeof value.max === "number" && Number.isFinite(value.max) ? value.max : null;
    /* ไม่มีขอบไหนเลย = ไม่ใช่เกณฑ์ ทิ้งไปดีกว่าเก็บก้อนเปล่าไว้ */
    if (min == null && max == null) continue;
    if (min != null && max != null && min >= max) continue;

    const range = {};
    if (min != null) range.min = min;
    if (max != null) range.max = max;
    out[key] = range;
    if (Object.keys(out).length >= MAX_METRIC_RANGES) break;
  }
  return out;
}

function sanitize(raw) {
  const saved = raw && typeof raw === "object" ? raw : {};
  const d = DEFAULT_SETTINGS;
  const savedComfort = saved.comfort && typeof saved.comfort === "object" ? saved.comfort : {};

  const comfort = {
    tempMin: num(savedComfort.tempMin, COMFORT_LIMITS.tempMin, d.comfort.tempMin),
    tempMax: num(savedComfort.tempMax, COMFORT_LIMITS.tempMax, d.comfort.tempMax),
    humidityMin: num(savedComfort.humidityMin, COMFORT_LIMITS.humidityMin, d.comfort.humidityMin),
    humidityMax: num(savedComfort.humidityMax, COMFORT_LIMITS.humidityMax, d.comfort.humidityMax),
    nh3Limit: num(savedComfort.nh3Limit, COMFORT_LIMITS.nh3Limit, d.comfort.nh3Limit),
  };
  /* ขอบล่างต้องน้อยกว่าขอบบนเสมอ ไม่งั้น "ช่วงเหมาะสม" จะกลับด้านจนไม่มีค่าไหนผ่านเลย */
  if (comfort.tempMin >= comfort.tempMax) comfort.tempMax = comfort.tempMin + 1;
  if (comfort.humidityMin >= comfort.humidityMax) comfort.humidityMax = comfort.humidityMin + 5;

  return {
    metricRanges: sanitizeMetricRanges(saved.metricRanges),
    homePage: pick(saved.homePage, HOME_PAGES, d.homePage),
    /* ปัดให้ลงล็อกกับ step ด้วย ค่าที่ถูกแก้มือมาแปลก ๆ จะไม่ทำให้แถบเลื่อนกระตุก */
    textScalePct:
      Math.round(num(saved.textScalePct, TEXT_SCALE, d.textScalePct) / TEXT_SCALE.step) *
      TEXT_SCALE.step,
    photoStrengthPct:
      Math.round(
        num(saved.photoStrengthPct, PHOTO_STRENGTH, d.photoStrengthPct) / PHOTO_STRENGTH.step
      ) * PHOTO_STRENGTH.step,
    density: pick(saved.density, DENSITIES, d.density),
    reduceMotion: typeof saved.reduceMotion === "boolean" ? saved.reduceMotion : d.reduceMotion,
    showAssistant:
      typeof saved.showAssistant === "boolean" ? saved.showAssistant : d.showAssistant,
    showVoiceAi: typeof saved.showVoiceAi === "boolean" ? saved.showVoiceAi : d.showVoiceAi,
    speakAnswers: typeof saved.speakAnswers === "boolean" ? saved.speakAnswers : d.speakAnswers,
    comfort,
    alertMinLevel: pick(saved.alertMinLevel, ALERT_MIN_LEVELS, d.alertMinLevel),
    mutedCategories: Array.isArray(saved.mutedCategories)
      ? saved.mutedCategories.filter((id) => ALERT_CATEGORIES.some((c) => c.id === id))
      : d.mutedCategories,
    userName:
      typeof saved.userName === "string" && saved.userName.trim()
        ? saved.userName.trim().slice(0, 40)
        : d.userName,
    bahtPerKwh: num(saved.bahtPerKwh, KWH_RATE_LIMITS, d.bahtPerKwh),
  };
}

const readStore = () => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return sanitize(raw ? JSON.parse(raw) : {});
  } catch {
    /* โหมดส่วนตัวของบางเบราว์เซอร์ห้ามอ่าน localStorage — ใช้ค่าตั้งต้นไปก่อน */
    return sanitize({});
  }
};

/**
 * ช่องที่นับเป็น "การตั้งค่าระดับระบบ" — ต้องมีสิทธิ์ผู้ดูแลระบบถึงแก้ได้ (ดู lib/auth/roles.js)
 * ที่เหลือใน DEFAULT_SETTINGS เป็นค่าหน้าจอส่วนตัวของเครื่อง ใครก็แก้ของตัวเองได้
 */
/* T1.251: เกณฑ์และการแจ้งเตือนย้ายลงมาให้ผู้บันทึกขึ้นไปแก้ได้ (rules.write)
   ค่าไฟต่อหน่วย · คืนค่า/ล้างข้อมูล ยังเป็นของผู้ดูแลระบบ (system.settings) */
const RULE_KEYS = ["alertMinLevel", "mutedCategories"];
const SYSTEM_KEYS = ["bahtPerKwh"];

const blocked = (name) => {
  console.warn(
    `[SWINE SYNC] ${name}: สิทธิ์ปัจจุบันแก้การตั้งค่าระดับระบบไม่ได้ — ไม่มีอะไรถูกบันทึก`
  );
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(readStore);
  /* ป๊อบอัพตั้งค่าเปิดอยู่ไหม — เก็บไว้ที่นี่เพราะมีปุ่มเรียกจากหลายที่
     (ปุ่มเฟืองทุกโครงหน้า · ชิปบทบาทบนแถบเมนู · ลิงก์ในหน้าศูนย์แจ้งเตือน) */
  const [settingsOpen, setSettingsOpen] = useState(false);
  /* แท็บที่ผู้เรียกอยากให้เปิดค้างไว้ (null = ใช้แท็บที่ป๊อบอัพค้างไว้เอง) */
  const [settingsTab, setSettingsTab] = useState(null);

  /* ทาค่าที่เป็น "หน้าตา" ลงบน <html> — ต้องเป็น html ไม่ใช่ div ในแอป
     เพราะพื้นหลังของ body และป๊อบอัพที่ลอยอยู่นอก #root ต้องได้ค่าเดียวกัน */
  useEffect(() => {
    const root = document.documentElement;
    /* ขนาดตัวอักษรเป็นตัวคูณต่อเนื่อง จึงเขียนเป็น CSS variable ไม่ใช่ data-* แบบขั้น ๆ */
    root.style.setProperty("--text-scale", String(settings.textScalePct / 100));
    /* ความเข้มของภาพพื้นหลัง — 0–1 คูณเข้ากับม่านคลุมภาพใน tokens.css */
    root.style.setProperty("--photo-strength", String(settings.photoStrengthPct / 100));
    root.dataset.density = settings.density;
    root.dataset.motion = settings.reduceMotion ? "off" : "on";
  }, [
    settings.textScalePct,
    settings.photoStrengthPct,
    settings.density,
    settings.reduceMotion,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(settings));
    } catch {
      /* เขียนไม่ได้ก็ไม่เป็นไร ค่ายังใช้ได้จนกว่าจะปิดแท็บ */
    }
  }, [settings]);

  /**
   * ประตูชั้นที่สองของสิทธิ์ "ตั้งค่าระดับระบบ" (ดู lib/auth/roles.js)
   *
   * ค่าในไฟล์นี้มีสองพวกที่ต่างกันคนละเรื่อง:
   *   · ค่าส่วนตัวของเครื่อง (ขนาดตัวอักษร · ความหนาแน่น · หน้าเปิดระบบ · ชื่อผู้บันทึก)
   *     ไม่กระทบใครเลย ทั้งสองสิทธิ์แก้ได้
   *   · ค่าระดับระบบ — **เปลี่ยนความหมายของตัวเลขที่ทุกคนอ่าน** จึงเป็นของผู้ดูแลระบบ
   *     เกณฑ์สภาพแวดล้อมเปลี่ยน "หลุดเกณฑ์กี่หลัง" ทั้งแอป · ตั้งค่าแจ้งเตือนเปลี่ยนว่า
   *     จะเห็นเรื่องอะไรบ้าง (ปิดหมวดผิดใบเดียวอาจพลาดเรื่องสำคัญ) · ค่าไฟเปลี่ยนตัวเลขการเงิน
   */
  const { can, userId } = useAuth();
  const canSystem = can("system.settings");
  const canRules = can("rules.write");

  /**
   * แก้ค่าเดี่ยว ๆ หนึ่งช่อง — ส่งค่าตรง ๆ หรือส่งฟังก์ชัน (ค่าเดิม) => ค่าใหม่ ก็ได้
   * แบบฟังก์ชันจำเป็นสำหรับปุ่มบวก/ลบ: กดรัว ๆ หลายครั้งก่อน React จะ re-render
   * ถ้าคำนวณจากค่าที่อ่านตอน render จะได้ผลลัพธ์เท่ากับกดครั้งเดียว
   */
  const set = useCallback(
    (key, value) => {
      if (!canSystem && SYSTEM_KEYS.includes(key)) return blocked(`set("${key}")`);
      if (!canRules && RULE_KEYS.includes(key)) return blocked(`set("${key}")`);
      setSettings((cur) =>
        sanitize({ ...cur, [key]: typeof value === "function" ? value(cur[key]) : value })
      );
    },
    [canSystem, canRules]
  );

  /** แก้เกณฑ์สภาพแวดล้อมหนึ่งช่อง (รับฟังก์ชันได้เหมือน set · sanitize คุมขอบล่าง/ขอบบนให้) */
  const setComfort = useCallback(
    (key, value) => {
      if (!canRules) return blocked(`setComfort("${key}")`);
      setSettings((cur) =>
        sanitize({
          ...cur,
          comfort: {
            ...cur.comfort,
            [key]: typeof value === "function" ? value(cur.comfort[key]) : value,
          },
        })
      );
    },
    [canRules]
  );

  /**
   * ตั้งหรือลบเกณฑ์ของค่าชนิดที่เพิ่มมาภายหลัง (T1.346)
   *
   * ส่ง `null` เพื่อลบเกณฑ์ทิ้ง — ค่านั้นจะกลับไปไม่มีป้ายสถานะเหมือนเดิม
   * ★ ใช้สิทธิ์เดียวกับเกณฑ์สภาพแวดล้อม (`rules.write`) เพราะมันเปลี่ยนความหมาย
   *   ของคำว่า "ปกติ" ที่ทุกคนเห็นเหมือนกัน ไม่ใช่การตั้งค่าส่วนตัวของคนดู
   */
  const setMetricRange = useCallback(
    (key, range) => {
      if (!canRules) return blocked(`setMetricRange("${key}")`);
      setSettings((cur) => {
        const next = { ...cur.metricRanges };
        if (range == null) delete next[key];
        else next[key] = range;
        return sanitize({ ...cur, metricRanges: next });
      });
    },
    [canRules]
  );

  /* เกณฑ์ระดับระบบต้องตรงกับที่หลังบ้านใช้ตัดสินแจ้งเตือนจริง —
     ไม่งั้นโรงเรือนจริงกับโรงเรือนตัวอย่างถูกตัดสินคนละเกณฑ์โดยไม่มีใครรู้
     (รายละเอียดทิศทางของความจริงอยู่หัวไฟล์ useAlertRuleSync.js) */
  const adoptComfort = useCallback(
    (next) => setSettings((cur) => sanitize({ ...cur, comfort: { ...cur.comfort, ...next } })),
    [],
  );
  useAlertRuleSync(settings.comfort, adoptComfort, canRules, userId);

  /** เปิด/ปิดการแจ้งเตือนของหมวดหนึ่ง */
  const toggleCategory = useCallback(
    (id) => {
      if (!canRules) return blocked(`toggleCategory("${id}")`);
      setSettings((cur) =>
        sanitize({
          ...cur,
          mutedCategories: cur.mutedCategories.includes(id)
            ? cur.mutedCategories.filter((c) => c !== id)
            : [...cur.mutedCategories, id],
        })
      );
    },
    [canRules]
  );

  /* คืนค่าเริ่มต้น "ทุกหมวด" รวมเกณฑ์กับการแจ้งเตือนด้วย จึงเป็นของผู้ดูแลระบบเหมือนกัน */
  const reset = useCallback(() => {
    if (!canSystem) return blocked("reset()");
    setSettings(sanitize({}));
  }, [canSystem]);

  /**
   * ล้างทุกอย่างที่เก็บไว้ในเครื่อง (การตั้งค่า · ธีม · บัญชีที่จดจำไว้ · บันทึกการเข้าใช้งาน)
   * แล้วโหลดหน้าใหม่
   *
   * **ไม่ล้าง `swine-sync:auth`** — การออกจากระบบเป็นคนละเรื่องและมีปุ่มของตัวเองอยู่แล้ว
   * กดล้างข้อมูลแล้วโดนเตะออกจากระบบไปด้วยเป็นผลข้างเคียงที่ไม่มีใครขอ
   */
  const clearAll = useCallback(() => {
    /* ล้างเกณฑ์กับการตั้งค่าแจ้งเตือนของทั้งระบบไปด้วย จึงเป็นของผู้ดูแลระบบเหมือน reset() */
    if (!canSystem) return blocked("clearAll()");
    try {
      localStorage.removeItem(STORE_KEY);
      localStorage.removeItem("swine-sync:theme");
      /* ของใหม่จาก lib/auth/sessions.js — เป็นข้อมูลของเครื่องนี้เหมือนกัน
         ถ้าไม่ล้างด้วย ปุ่มที่เขียนว่า "ล้างข้อมูลที่เก็บในเครื่อง" ก็พูดไม่จริง */
      localStorage.removeItem("swine-sync:remembered");
    } catch {
      /* ลบไม่ได้ก็ยังรีโหลดให้ เพื่อให้ผู้ใช้เห็นผลอะไรบางอย่างเสมอ */
    }
    window.location.reload();
  }, [canSystem]);

  /**
   * เปิดป๊อบอัพตั้งค่า — ส่งชื่อแท็บมาด้วยได้ เพื่อพาไปหมวดที่เกี่ยวข้องกับสิ่งที่เพิ่งกด
   * (เช่นกดชิปสิทธิ์บนแถบเมนู ควรได้หมวด "บัญชี" เลย ไม่ใช่หมวดแรกแล้วให้ไปหาเอง)
   *
   * ต้องเช็กว่าเป็นสตริงจริง ๆ เพราะหลายที่เขียน `onClick={openSettings}` ตรง ๆ
   * ซึ่งจะส่ง event ของการคลิกเข้ามาเป็นอาร์กิวเมนต์แรก ไม่ใช่ชื่อแท็บ
   */
  const openSettings = useCallback((tabId) => {
    setSettingsTab(typeof tabId === "string" ? tabId : null);
    setSettingsOpen(true);
  }, []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const value = useMemo(() => {
    const minRank = LEVEL_RANK[settings.alertMinLevel] ?? 1;
    return {
      settings,
      /* หน้าแรกที่ตั้งไว้ — ปุ่มกลับหน้าแรก โลโก้ และปุ่มเข้าสู่ระบบใช้ค่านี้ */
      homePath: homePathOf(settings.homePage),
      homeLabel:
        HOME_PAGES.find((page) => page.id === settings.homePage)?.label ??
        HOME_PAGES[0].label,
      settingsOpen,
      settingsTab,
      openSettings,
      closeSettings,
      /* รูปแบบเดียวกับ COMFORT ใน data/mock/climate.js — ส่งต่อให้ readingStatus ได้เลย */
      comfort: comfortOf(settings),
      set,
      setComfort,
      setMetricRange,
      toggleCategory,
      isMuted: (categoryId) => settings.mutedCategories.includes(categoryId),
      /** แจ้งเตือนหนึ่งรายการผ่านเกณฑ์ที่ตั้งไว้ไหม (ทั้งระดับและหมวด) */
      passesLevel: (level, categoryId) =>
        (LEVEL_RANK[level] ?? 1) >= minRank &&
        !(categoryId && settings.mutedCategories.includes(categoryId)),
      reset,
      clearAll,
    };
  }, [
    settings,
    settingsOpen,
    settingsTab,
    openSettings,
    closeSettings,
    set,
    setComfort,
    setMetricRange,
    toggleCategory,
    reset,
    clearAll,
  ]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
