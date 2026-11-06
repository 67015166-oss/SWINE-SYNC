import { createContext, useContext } from "react";
import { DEFAULT_LANG, translate } from "./langs.js";

/** ภาษาปัจจุบันของทั้งแอป — ค่าเริ่มต้นเผื่อ component ที่อยู่นอก provider (เช่นในเทสต์) */
export const LangContext = createContext({
  lang: DEFAULT_LANG,
  setLang: () => {},
});

export const useLang = () => useContext(LangContext);

/**
 * ตัวแปลข้อความ — ใช้ในทุก component ที่มีข้อความให้คนอ่าน
 *
 *   const t = useT();
 *   <h1>{t("ภาพรวมทุกฟาร์ม")}</h1>
 *   <p>{t("เฉลี่ย {n} ตัว/โรงเรือน", { n: formatNumber(avg) })}</p>
 */
export function useT() {
  const { lang } = useContext(LangContext);
  return (text, vars) => translate(lang, text, vars);
}
