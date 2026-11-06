/**
 * ตัวเก็บ "ธีมบทบาท + โหมดโทนสี" ของทั้งแอป
 *
 * - เก็บลง localStorage คีย์เดียว เปิดแอปใหม่แล้วยังได้ธีมเดิม
 * - ใส่ data-mode / data-scheme ไว้ที่ <html> ให้ styles/modes.css ทำงาน
 *   (ใส่ที่ <html> ไม่ใช่ที่ div ในแอป เพราะพื้นหลังของ body ต้องเปลี่ยนตามด้วย)
 * - ธีม "ปรับค่าเอง" เก็บรายการเมนู/กล่องสรุปของผู้ใช้แยกไว้ ไม่ทับค่าของธีมสำเร็จรูป
 *   ผู้ใช้จึงสลับไปธีมอื่นแล้วกลับมาได้โดยที่ค่าที่ปรับเองไม่หาย
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ThemeContext } from "./useTheme.js";
import {
  DEFAULT_MODE,
  DEFAULT_ROLE,
  MAX_NAV,
  MAX_TILES,
  ROLE_THEMES,
  SECTIONS,
  getMode,
  getRole,
} from "./themes.js";

const STORE_KEY = "swine-sync:theme";

const CUSTOM = ROLE_THEMES.find((r) => r.custom);

const readStore = () => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    /* โหมดส่วนตัวของบางเบราว์เซอร์ห้ามอ่าน localStorage — ใช้ค่าตั้งต้นไปก่อน */
    return {};
  }
};

/** กันค่าเพี้ยนจาก localStorage เก่า: ต้องเป็น key ที่มีจริงและไม่ซ้ำ */
const cleanKeys = (list, fallback, limit) => {
  if (!Array.isArray(list)) return fallback;
  const clean = [...new Set(list)].filter((k) => SECTIONS[k]).slice(0, limit);
  return clean.length > 0 ? clean : fallback;
};


export function ThemeProvider({ children }) {
  const [state, setState] = useState(() => {
    const saved = readStore();
    return {
      roleId: getRole(saved.roleId).id,
      modeId: getMode(saved.modeId).id,
      customNav: cleanKeys(saved.customNav, CUSTOM.nav, MAX_NAV),
      customTiles: cleanKeys(saved.customTiles, CUSTOM.tiles, MAX_TILES),
    };
  });

  const mode = getMode(state.modeId);

  /* ทาโหมดสีลงบน <html> — CSS ทั้งหมดผูกกับสอง attribute นี้ */
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.mode = mode.id;
    root.dataset.scheme = mode.scheme;
  }, [mode]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      /* เขียนไม่ได้ก็ไม่เป็นไร ธีมยังใช้ได้จนกว่าจะปิดแท็บ */
    }
  }, [state]);

  const setRoleId = useCallback(
    (roleId) => setState((s) => ({ ...s, roleId: getRole(roleId).id })),
    []
  );
  const setModeId = useCallback(
    (modeId) => setState((s) => ({ ...s, modeId: getMode(modeId).id })),
    []
  );
  const setCustomNav = useCallback(
    (keys) => setState((s) => ({ ...s, customNav: cleanKeys(keys, CUSTOM.nav, MAX_NAV) })),
    []
  );
  const setCustomTiles = useCallback(
    (keys) =>
      setState((s) => ({ ...s, customTiles: cleanKeys(keys, CUSTOM.tiles, MAX_TILES) })),
    []
  );
  const reset = useCallback(
    () =>
      setState({
        roleId: DEFAULT_ROLE,
        modeId: DEFAULT_MODE,
        customNav: CUSTOM.nav,
        customTiles: CUSTOM.tiles,
      }),
    []
  );

  const value = useMemo(() => {
    const base = getRole(state.roleId);
    /* ธีมปรับค่าเองใช้รายการของผู้ใช้ ธีมสำเร็จรูปใช้รายการที่กำหนดไว้ */
    const role = base.custom
      ? { ...base, nav: state.customNav, tiles: state.customTiles }
      : base;
    return {
      role,
      mode,
      navKeys: role.nav,
      tileKeys: role.tiles,
      customNav: state.customNav,
      customTiles: state.customTiles,
      setRoleId,
      setModeId,
      setCustomNav,
      setCustomTiles,
      reset,
    };
  }, [
    state.roleId,
    state.customNav,
    state.customTiles,
    mode,
    setRoleId,
    setModeId,
    setCustomNav,
    setCustomTiles,
    reset,
  ]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

