/**
 * ภาพนิ่งจากกล้อง AI ที่ผู้ใช้กด "บันทึกภาพ" ไว้ — รายโรงเรือน
 *
 * **ยังไม่มี backend** จึงเก็บใน localStorage ของเครื่องนี้เท่านั้น (หน้าจอต้องเขียนกำกับไว้)
 * เก็บแยกคีย์จาก `swine-sync:records` เพราะคนละเรื่องกัน — อันนั้นคือฟาร์ม/โรงเรือนที่ผู้ใช้แก้เอง
 *
 * โครงหนึ่งภาพ: { id, at (ISO), cameraId, cameraName, detected, flagIndex }
 * ภาพกล้องยังเป็นฉากจำลอง (SVG) จึงเก็บแค่ "ค่าที่เห็นตอนนั้น" แล้ววาดใหม่ ไม่ได้เก็บไฟล์ภาพ
 * เมื่อต่อกล้องจริง: เพิ่มฟิลด์ src (URL ของภาพที่เซิร์ฟเวอร์เก็บ) แล้วให้หน้าจอเลือกวาดจาก src
 * ถ้ามี ส่วนที่เหลือของโครงนี้ใช้ต่อได้เลย
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth/useAuth.js";

const KEY = "swine-sync:snapshots";

/** เก็บได้กี่ภาพต่อโรงเรือน — เกินแล้วตัดภาพเก่าสุดทิ้ง กัน localStorage เต็ม */
export const SNAPSHOT_LIMIT = 12;

const readAll = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    /* ของที่บันทึกไว้ก่อนหน้าอาจมีรูปแบบอื่น — คัดเฉพาะที่ครบช่องที่หน้าจอต้องใช้ */
    const clean = {};
    for (const [barnId, list] of Object.entries(raw)) {
      if (!Array.isArray(list)) continue;
      clean[barnId] = list.filter((s) => s?.id && s?.at).slice(0, SNAPSHOT_LIMIT);
    }
    return clean;
  } catch {
    return {};
  }
};

const write = (all) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* เต็มหรือถูกปิดไว้ — ใช้ต่อได้ในรอบนี้ แค่ไม่ถูกจำไว้รอบหน้า */
  }
};

/**
 * รายการภาพที่บันทึกไว้ของโรงเรือนหนึ่ง พร้อมคำสั่งเพิ่ม/ลบ
 *
 * @param {string} barnId รหัสโรงเรือน
 * @returns {{list: Array, add: function, remove: function}} ใหม่สุดอยู่บนสุดเสมอ
 */
export function useSnapshots(barnId) {
  const [all, setAll] = useState(readAll);
  /* ด่านชั้นที่สอง — หน้าจอปิดปุ่มไว้แล้ว แต่กันซ้ำที่นี่ด้วย เพราะปุ่มที่ถูกปิด
     ไม่ใช่ด่าน ใครเรียกฮุกนี้จากที่อื่นหรือแก้ DOM ก็ต้องไม่ผ่าน (กติกาใน CLAUDE.md) */
  const { can } = useAuth();
  const allowed = can("record.write");

  useEffect(() => {
    write(all);
  }, [all]);

  const add = useCallback(
    (data) => {
      if (!allowed) return null;
      const shot = {
        id: `S-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        at: new Date().toISOString(),
        cameraId: "",
        cameraName: "",
        detected: 0,
        flagIndex: -1,
        ...data,
      };
      setAll((s) => ({
        ...s,
        [barnId]: [shot, ...(s[barnId] ?? [])].slice(0, SNAPSHOT_LIMIT),
      }));
      return shot;
    },
    [barnId, allowed]
  );

  const remove = useCallback(
    (id) => {
      if (!allowed) return;
      setAll((s) => ({ ...s, [barnId]: (s[barnId] ?? []).filter((x) => x.id !== id) }));
    },
    [barnId, allowed]
  );

  return { list: all[barnId] ?? [], add, remove, canWrite: allowed };
}
