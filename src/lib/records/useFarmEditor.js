/**
 * ตัวตัดสินว่า "ฟาร์มใบนี้แก้ที่ไหน" — ฐานจริง หรือ เครื่องนี้ (T1.316)
 *
 * ═══ ทำไมต้องมีชั้นนี้ ═══
 * แอปมีฟาร์มสองพันธุ์ปนกันในรายการเดียว
 *   · **ฟาร์มจริง** มีแถวอยู่ในฐาน มี `apiId` เป็น uuid → แก้แล้วต้องไปถึงฐาน ทุกเครื่องเห็นตาม
 *   · **ฟาร์มตัวอย่าง** มีอยู่แค่ในไฟล์ `data/mock/` ไม่มีแถวในฐานเลย → ส่งไปหลังบ้านจะได้ 404
 *
 * ชั้นนี้จึงดูที่ `apiId` แล้วเลือกทางให้เอง หน้าจอเรียกชื่อฟังก์ชันเดิมไม่ต้องรู้เรื่อง
 *
 * ═══ ★ ทำไมไม่ย้ายตรรกะนี้ไปไว้ใน RecordsProvider ═══
 * `RecordsProvider` อยู่ **นอก** `LiveFarmsProvider` ในลำดับ Provider (ดู main.jsx)
 * จึงอ่านรายการฟาร์มจริงไม่ได้เลย และสลับลำดับก็ไม่ได้เพราะ `useAllFarms`
 * ต้องอ่านทั้งสองฝั่งพร้อมกัน — ชั้นนี้จึงอยู่ระดับ hook ที่หน้าจอเรียก
 * ซึ่งอยู่ในสุดและเห็นทั้งสองฝั่งอยู่แล้ว
 */
import { useCallback } from "react";
import { useRecords } from "./useRecords.js";
import { useLiveFarms } from "../api/useLiveFarms.js";
import { apiConfigured } from "../api/client.js";
import { addBarnLog, listBarnLog } from "../barnLog.js";
import { countDiffEntry, herdFromLogs } from "../herdCount.js";
import {
  closeBarn, closeFarm, createBarn, createFarm,
  patchBarn, patchFarm, reopenBarn, reopenFarm, toAppFarm,
} from "../api/farmAdmin.js";

/** ช่องที่หลังบ้านรับ — ช่องอื่นที่ฟอร์มเก็บไว้ (เช่น pigs) ยังไม่มีที่เก็บในฐาน */
const farmBody = (data) => ({
  ...(data.code != null ? { code: data.code } : {}),
  ...(data.name != null ? { name: data.name } : {}),
  ...(data.province != null ? { province: data.province } : {}),
  ...(data.district != null ? { district: data.district } : {}),
  ...(Object.hasOwn(data, "lat") ? { lat: data.lat } : {}),
  ...(Object.hasOwn(data, "lng") ? { lng: data.lng } : {}),
});

const barnBody = (data) => ({
  ...(data.code != null ? { code: data.code } : {}),
  ...(data.name != null ? { name: data.name } : {}),
  ...(data.stage != null ? { stage: data.stage } : {}),
  ...(Object.hasOwn(data, "capacity") ? { capacity: data.capacity } : {}),
});

/** เวลาไทยไม่มีโซน รูปเดียวกับที่ `barnLog.js` กับหลังบ้านตกลงกัน */
const nowLocal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/**
 * แปลงช่อง "จำนวนสุกร" ในฟอร์มโรงเรือนเป็นบันทึกย้ายเข้า/ออก (T1.328)
 *
 * ★ เดิมค่านี้ถูก `barnBody()` ตัดทิ้งก่อนส่งขึ้นฐาน เพราะฐานไม่มีคอลัมน์เก็บ
 *   ผู้ใช้จึงกรอกแล้วเลขหายเงียบ ๆ — และหายเฉพาะฟาร์มจริง ส่วนฟาร์มตัวอย่าง
 *   เก็บลงเครื่องได้ตามปกติ ทั้งที่ฟอร์มหน้าตาเหมือนกันเป๊ะ
 *
 *   ไม่เพิ่มคอลัมน์ เพราะจะกลายเป็นเลขสองชุดที่ขัดกันเองได้ (ดูหัวไฟล์ `herdCount.js`)
 *   แปลงเป็นเหตุการณ์แทน ตามวิธีที่ระบบนี้ใช้ลงยอดตั้งต้นอยู่แล้ว
 *
 * @param {string} barnKey รหัสโรงเรือนแบบหน้าเว็บ เช่น "F-KPP-A1"
 * @param {number|string|null} pigs จำนวนที่กรอกในฟอร์ม
 * @param {{fresh?: boolean}} opt `fresh` = เล้าเพิ่งถูกสร้าง ไม่ต้องไปอ่านบันทึกเก่า
 */
async function syncPigCount(barnKey, pigs, { fresh = false } = {}) {
  if (pigs == null || pigs === "") return { kind: "skipped", count: null };
  const entries = fresh ? [] : ((await listBarnLog(barnKey))?.entries ?? []);
  const summary = herdFromLogs(entries);
  const diff = countDiffEntry(summary, pigs);
  /* ★ "ไม่ต้องเขียนอะไร" ต้องแยกออกจาก "เขียนแล้ว" ตั้งแต่ตรงนี้ (T1.339)
     เดิมคืน null เหมือนกันทั้งสองกรณี ผู้เรียกจึงบอกความต่างไม่ได้
     แล้วฟอร์มก็ปิดเงียบ ๆ เหมือนบันทึกสำเร็จทุกประการ ทั้งที่ยอดไม่ได้ขยับเลย
     — ผู้ใช้กรอกแล้วกลับมาถามว่า "ขึ้นไหม" ซึ่งเราตอบไม่ได้จากในแอป ต้องไปเปิดฐานดู */
  if (!diff) return { kind: "same", count: summary.count };
  await addBarnLog(barnKey, { ...diff, at: nowLocal(), note: "ตั้งจำนวนจากฟอร์มโรงเรือน" });
  return { kind: "written", count: Number(pigs) };
}

export function useFarmEditor() {
  const records = useRecords();
  const live = useLiveFarms();
  const refresh = live?.refresh;

  /** หลังบ้านใช้ได้จริงไหม — ตั้งค่าไว้ และรอบล่าสุดได้ของจากเซิร์ฟเวอร์ (ไม่ใช่ความจำสำรอง) */
  const onServer = apiConfigured && live?.source === "server" && !live?.cachedAt;

  const findFarm = useCallback(
    (farmId) => (live?.farms ?? []).find((f) => f.id === farmId) ?? null,
    [live?.farms],
  );

  const findBarn = useCallback(
    (barnId) =>
      Object.values(live?.barnsByFarm ?? {})
        .flat()
        .find((b) => b.id === barnId) ?? null,
    [live?.barnsByFarm],
  );

  /* ---------- ฟาร์ม ---------- */

  const addFarm = useCallback(
    async (data) => {
      if (!onServer) return records.addFarm(data);
      const row = await createFarm(farmBody(data));
      await refresh?.();
      return toAppFarm(row);
    },
    [onServer, records, refresh],
  );

  const updateFarm = useCallback(
    async (farmId, patch) => {
      const apiId = findFarm(farmId)?.apiId;
      /* ไม่มี apiId = ฟาร์มตัวอย่าง เก็บเป็น patch ในเครื่องเหมือนเดิม */
      if (!onServer || !apiId) return records.updateFarm(farmId, patch);
      await patchFarm(apiId, farmBody(patch));
      await refresh?.();
      return null;
    },
    [onServer, records, refresh, findFarm],
  );

  const removeFarm = useCallback(
    async (farmId) => {
      const apiId = findFarm(farmId)?.apiId;
      if (!onServer || !apiId) return records.removeFarm(farmId);
      await closeFarm(apiId);
      await refresh?.();
      return null;
    },
    [onServer, records, refresh, findFarm],
  );

  /* ---------- โรงเรือน ---------- */

  const addBarn = useCallback(
    async (farmId, data) => {
      const apiId = findFarm(farmId)?.apiId;
      /* ★ เก็บลงเครื่องไม่ใช่ "สำเร็จ" แบบเดียวกับเก็บลงระบบ — ต้องบอกคนเรียกด้วย
         ว่าลงที่ไหน ไม่งั้นหน้าจอปิดป๊อบอัพเงียบ ๆ แล้วผู้ใช้เข้าใจว่าเข้าระบบแล้ว
         (ผู้ใช้วนเจอปัญหานี้สามรอบ 14–15 ต.ค. 2569 · T1.335) */
      if (!onServer || !apiId) {
        const made = await records.addBarn(farmId, data);
        return { ...(made ?? {}), savedTo: "local" };
      }
      const row = await createBarn(apiId, barnBody(data));
      /* id ของโรงเรือนในแอปคือ `<รหัสฟาร์ม>-<รหัสโรงเรือน>` ตามที่ toBarn ประกอบไว้ */
      const barnKey = `${farmId}-${row.code}`;
      /* ★ เล้าสร้างสำเร็จไปแล้ว — ถ้าเขียนบันทึกจำนวนไม่ผ่าน ต้องบอกให้ชัดว่า
         "เล้าสร้างแล้ว แต่จำนวนยังไม่ได้ลง" ไม่งั้นผู้ใช้จะกดสร้างซ้ำแล้วได้เล้าซ้อน */
      let count;
      try {
        count = await syncPigCount(barnKey, data.pigs, { fresh: true });
      } catch (err) {
        await refresh?.();
        throw new Error(`สร้างโรงเรือนแล้ว แต่ลงจำนวนสุกรไม่สำเร็จ (${err.message}) — แก้จำนวนได้ที่หน้าโรงเรือน ไม่ต้องสร้างใหม่`);
      }
      await refresh?.();
      return { id: barnKey, apiId: row.id, farmId, name: row.name, savedTo: "server", count };
    },
    [onServer, records, refresh, findFarm],
  );

  const updateBarn = useCallback(
    async (barnId, patch) => {
      const barn = findBarn(barnId);
      const farmApiId = barn ? findFarm(barn.id.split("-").slice(0, -1).join("-"))?.apiId : null;
      if (!onServer || !barn?.apiId || !farmApiId) {
        await records.updateBarn(barnId, patch);
        return { savedTo: "local" };
      }
      await patchBarn(farmApiId, barn.apiId, barnBody(patch));
      /* แก้ซ้ำด้วยจำนวนเดิมจะไม่เกิดบันทึกใหม่ — และต้องบอกฟอร์มด้วยว่าไม่ได้เกิด */
      const count = await syncPigCount(barnId, patch.pigs);
      await refresh?.();
      return { savedTo: "server", count };
    },
    [onServer, records, refresh, findBarn, findFarm],
  );

  const removeBarn = useCallback(
    async (barnId) => {
      const barn = findBarn(barnId);
      const farmApiId = barn ? findFarm(barn.id.split("-").slice(0, -1).join("-"))?.apiId : null;
      if (!onServer || !barn?.apiId || !farmApiId) return records.removeBarn(barnId);
      await closeBarn(farmApiId, barn.apiId);
      await refresh?.();
      return null;
    },
    [onServer, records, refresh, findBarn, findFarm],
  );

  /**
   * กู้คืนของที่ปิดไว้
   *
   * ★ ของในเครื่องกับของในฐานเป็นคนละรายการกัน — ปุ่ม "กู้คืนทั้งหมด" บนหน้าจอ
   *   หมายถึงของในเครื่องเท่านั้น ส่วนของในฐานต้องระบุทีละใบ เพราะต้องรู้ uuid
   */
  const restore = useCallback(
    async (id = null) => {
      if (!onServer || !id) return records.restore(id);
      const farm = findFarm(id);
      if (farm?.apiId) {
        await reopenFarm(farm.apiId);
        await refresh?.();
        return null;
      }
      const barn = findBarn(id);
      const farmApiId = barn ? findFarm(barn.id.split("-").slice(0, -1).join("-"))?.apiId : null;
      if (barn?.apiId && farmApiId) {
        await reopenBarn(farmApiId, barn.apiId);
        await refresh?.();
        return null;
      }
      return records.restore(id);
    },
    [onServer, records, refresh, findFarm, findBarn],
  );

  return {
    ...records,
    onServer,
    addFarm, updateFarm, removeFarm,
    addBarn, updateBarn, removeBarn,
    restore,
  };
}
