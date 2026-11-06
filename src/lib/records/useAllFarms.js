/**
 * มุมมอง "ฟาร์มและโรงเรือนทั้งหมด" = ฟาร์มที่มีเซนเซอร์จริง + ข้อมูลตัวอย่าง + ที่ผู้ใช้เพิ่มเอง
 *
 * ทุกหน้า/ทุกป๊อบอัพที่เคย `import { farms } from "data/mock/farms.js"` ตรง ๆ
 * ให้เปลี่ยนมาใช้ตัวนี้แทน จะได้เห็นฟาร์มชุดเดียวกันหมดทั้งแอป
 * (ก่อนหน้านี้แต่ละไฟล์อ่าน mock เอง เพิ่มฟาร์มแล้วจึงโผล่แค่บางหน้า)
 *
 * **ทุกฟาร์มมี `dataSource`** — `"live"` คือต่อเซนเซอร์จริงอยู่ · `"demo"` คือข้อมูลตัวอย่าง
 * หน้าจอต้องติดป้ายให้คนดูแยกออก ใช้ `<DataSourceBadge>` (ตกลงกับผู้ใช้ 24 ส.ค. 2026)
 * ฟาร์มจริงมาก่อนเสมอในรายการ เพราะเป็นของที่เชื่อตัวเลขได้
 */
import { useCallback, useMemo } from "react";
import { farms as systemFarms } from "../../data/mock/farms.js";
import { getFarmBarns } from "../../data/mock/barnsByFarm.js";
import { useRecords } from "./useRecords.js";
import { useLiveFarms } from "../api/useLiveFarms.js";
import { toUiAlert } from "../api/alertText.js";

/** ติดป้าย "ข้อมูลตัวอย่าง" ให้ของที่ไม่ได้มาจากเซนเซอร์จริง — ไม่ได้แก้ไฟล์ mock */
const asDemo = (item) => (item.dataSource ? item : { ...item, dataSource: "demo" });

/**
 * @returns {{
 *   farms: object[],
 *   barnsOf: (farmId: string) => object[],
 *   findFarm: (farmId: string) => object|null,
 *   liveStatus: "loading"|"ok"|"error",
 *   liveErrorKind: "nokey"|"denied"|"unreachable"|null,
 *   liveCachedAt: string|null,   เวลาที่ข้อมูลชุดนี้ถูกเก็บไว้ (null = ของสด)
 * }}
 */
export function useAllFarms() {
  const { mergeFarms, mergeBarns } = useRecords();
  const {
    farms: liveFarms,
    barnsByFarm: liveBarns,
    alerts: rawAlerts = [],
    status: liveStatus,
    errorKind: liveErrorKind = null,
    /* ของที่เห็นมาจากความจำตั้งแต่เมื่อไร — null = ของสด (T1.314) */
    cachedAt: liveCachedAt = null,
  } = useLiveFarms();

  const farms = useMemo(
    () => [...liveFarms, ...mergeFarms(systemFarms).map(asDemo)],
    [liveFarms, mergeFarms],
  );

  const barnsOf = useCallback(
    (farmId) => {
      /* ฟาร์มจริงไม่ผ่าน mergeBarns — โรงเรือนของมันมาจากหลังบ้าน
         ไม่ใช่ของที่ผู้ใช้เพิ่มเองใน localStorage */
      if (liveBarns[farmId]) return liveBarns[farmId];
      return mergeBarns(farmId, getFarmBarns(farmId) ?? []).map(asDemo);
    },
    [liveBarns, mergeBarns],
  );

  const findFarm = useCallback(
    (farmId) => farms.find((f) => f.id === farmId) ?? null,
    [farms],
  );

  /**
   * แจ้งเตือนของฟาร์มจริง แปลงเป็นรูปเดียวกับ `data/mock/alerts.js` แล้ว
   *
   * ต้องแปลงรหัสสองชั้น: หลังบ้านใช้ uuid ส่วนหน้าเว็บใช้รหัสอ่านออก (`F-KPP-A1`)
   * จับคู่ผ่าน `apiId` ที่ติดมากับโรงเรือนจากหลังบ้าน
   * หน้าไหนที่จะรวมกับแจ้งเตือนของข้อมูลตัวอย่าง ให้ต่อท้ายรายการนี้ได้เลย
   */
  const liveAlerts = useMemo(() => {
    if (rawAlerts.length === 0) return [];

    /* uuid ของโรงเรือน → { farmKey, barnKey } ที่หน้าเว็บใช้ */
    const keyOf = new Map();
    Object.entries(liveBarns).forEach(([farmKey, list]) => {
      list.forEach((b) => b.apiId && keyOf.set(b.apiId, { farmKey, barnKey: b.id }));
    });

    return rawAlerts
      .map((a) => {
        const key = keyOf.get(a.barn_id);
        /* แจ้งเตือนของโรงเรือนที่หน้าเว็บยังไม่รู้จัก (เพิ่งเพิ่มในฐาน ยังไม่ถึงรอบ poll)
           — ข้ามไปก่อน ดีกว่าโชว์รายการที่กดแล้วไม่รู้ว่าเป็นของโรงเรือนไหน */
        return key ? toUiAlert(a, key.farmKey, key.barnKey) : null;
      })
      .filter(Boolean);
  }, [rawAlerts, liveBarns]);

  return { farms, barnsOf, findFarm, liveAlerts, liveStatus, liveErrorKind, liveCachedAt };
}
