/**
 * ตัวกลางของ "รายการที่ผู้ใช้เพิ่มเอง" (ฟาร์ม/โรงเรือน)
 * แยกจาก RecordsProvider.jsx ด้วยเหตุผลเดียวกับ useSettings.js / useAdjust.js
 */
import { createContext, useContext } from "react";

export const RecordsContext = createContext(null);

/**
 * @returns {{
 *   farms: object[],
 *   barns: object[],
 *   addFarm: (data: object) => object,
 *   addBarn: (farmId: string, data: object) => object,
 *   updateFarm: (id: string, patch: object) => void,
 *   updateBarn: (id: string, patch: object) => void,
 *   removeFarm: (id: string) => void,
 *   removeBarn: (id: string) => void,
 *   restore: (id?: string|null) => void,
 *   resetEdits: (id?: string|null) => void,
 *   mergeFarms: (base: object[]) => object[],
 *   mergeBarns: (farmId: string, base: object[]) => object[],
 *   isMine: (id: string) => boolean,
 *   isEdited: (id: string) => boolean,
 *   removedIds: string[],
 * }}
 */
export function useRecords() {
  const value = useContext(RecordsContext);
  if (!value) throw new Error("useRecords ต้องอยู่ภายใน <RecordsProvider>");
  return value;
}

/** รหัสของรายการที่ผู้ใช้เพิ่มเองขึ้นต้นด้วย U- เสมอ — ดูปราดเดียวก็รู้ว่าไม่ใช่ข้อมูลระบบ */
export const USER_PREFIX = "U-";
export const isUserRecord = (id) => String(id ?? "").startsWith(USER_PREFIX);
