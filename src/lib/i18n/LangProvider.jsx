/**
 * เก็บภาษาที่ผู้ใช้เลือก แล้วกระจายให้ทั้งแอป
 *
 * - เก็บลง localStorage คีย์ของตัวเอง (คนละคีย์กับธีม/การตั้งค่า/เลย์เอาต์)
 * - ตั้ง `lang` ที่ <html> ให้ถูกต้องตามภาษา — โปรแกรมอ่านหน้าจอออกเสียงถูก
 *   และเบราว์เซอร์เลือกฟอนต์/การตัดคำได้ถูกภาษา (จีนตัดคำคนละแบบกับไทย)
 * - บอก lib/format.js ด้วยว่าตอนนี้ใช้ locale ไหน ตัวเลข/วันที่จะได้เปลี่ยนตามภาษา
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { LangContext } from "./useT.js";
import { DEFAULT_LANG, getLang } from "./langs.js";
import { setFormatLocale } from "../format.js";

const STORE_KEY = "swine-sync:lang";

const readLang = () => {
  try {
    return getLang(localStorage.getItem(STORE_KEY) ?? DEFAULT_LANG).id;
  } catch {
    /* โหมดส่วนตัวของบางเบราว์เซอร์ห้ามอ่าน localStorage */
    return DEFAULT_LANG;
  }
};

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(readLang);

  /* ต้องตั้ง locale ให้ format ก่อนที่ลูกจะ render รอบแรก ไม่งั้นตัวเลขรอบแรกเป็นภาษาเก่า */
  const current = getLang(lang);
  if (typeof document !== "undefined") setFormatLocale(current.locale);

  useEffect(() => {
    document.documentElement.lang = current.id;
    try {
      localStorage.setItem(STORE_KEY, current.id);
    } catch {
      /* เขียนไม่ได้ก็ยังใช้ได้จนกว่าจะปิดแท็บ */
    }
  }, [current]);

  const setLang = useCallback((id) => setLangState(getLang(id).id), []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}
