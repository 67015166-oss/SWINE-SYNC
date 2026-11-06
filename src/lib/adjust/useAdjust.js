/**
 * ตัวกลางของ "การปรับจำนวน" — แยกจาก AdjustProvider.jsx ด้วยเหตุผลเดียวกับ useSettings.js
 * (ไฟล์ที่ export component ห้าม export อย่างอื่นปน ไม่งั้น hot reload ตอน dev จะรีเฟรชทั้งหน้า)
 */
import { createContext, useContext } from "react";

export const AdjustContext = createContext(null);

/**
 * @returns {{
 *   netOf: (target: string) => number,
 *   valueOf: (target: string, base: number) => number,
 *   historyOf: (target: string) => object[],
 *   apply: (entry: object) => void,
 *   undo: (id: string) => void,
 *   clearTarget: (target: string) => void,
 * }}
 */
export function useAdjust() {
  const value = useContext(AdjustContext);
  if (!value) throw new Error("useAdjust ต้องอยู่ภายใน <AdjustProvider>");
  return value;
}

/** คีย์ของสิ่งที่ถูกปรับ — ใช้รูปแบบเดียวกันทั้งแอป จะได้ไม่ชนกันเอง */
export const targetKey = (kind, id, metric = "pigs") => `${kind}:${id}:${metric}`;
