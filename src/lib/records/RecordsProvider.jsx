/**
 * ชั้นข้อมูลที่ "ผู้ใช้แก้เอง" ทับข้อมูลระบบใน data/mock/ — เก็บ 4 อย่าง
 *
 *   farms / barns  รายการที่ผู้ใช้เพิ่มเองทั้งใบ (id ขึ้นต้น U-)
 *   edits          ส่วนที่แก้ของ "รายการระบบ" เก็บเป็น patch รายฟิลด์ ไม่ทับทั้งก้อน
 *   removed        รายการระบบที่ผู้ใช้สั่งลบ — ซ่อนไว้เฉย ๆ กู้คืนได้เสมอ
 *
 * ทำไมไม่แก้ mock ตรง ๆ:
 *   1. mock ใช้ร่วมกันทุกหน้าและห้ามแก้โครงสร้าง (CLAUDE.md)
 *   2. ต้องแยกออกได้เสมอว่าอันไหนข้อมูลระบบ อันไหนคนแก้เอง และย้อนกลับได้
 *   3. **การลบต้องกู้คืนได้** — ข้อมูลระบบเป็นชุดตัวอย่างที่ใช้ทั้งแอป ถ้าลบจริงแล้วหายถาวร
 *      ผู้ใช้กดพลาดทีเดียวก็เหลือแดชบอร์ดเปล่า ๆ โดยไม่มีทางเอากลับ
 *   4. วันที่ต่อดาต้าเบสจริง (ดู docs/DATABASE.md) ชั้นนี้จะถูกแทนด้วย PATCH/DELETE /api/farms/:id
 *      โดยหน้าจอไม่ต้องแก้ เพราะอ่านผ่าน mergeFarms/mergeBarns อยู่แล้ว
 *
 * **ยังไม่มี backend** — เก็บใน localStorage ของเครื่องนี้เท่านั้น หน้าจอต้องเขียนกำกับไว้
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { RecordsContext, USER_PREFIX, isUserRecord } from "./useRecords.js";
import { useAuth } from "../auth/useAuth.js";

const KEY = "swine-sync:records";
const EMPTY = { farms: [], barns: [], edits: {}, removed: [] };

const read = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!raw || typeof raw !== "object") return EMPTY;
    return {
      farms: Array.isArray(raw.farms) ? raw.farms.filter((f) => f?.id && f?.name) : [],
      barns: Array.isArray(raw.barns)
        ? raw.barns.filter((b) => b?.id && b?.farmId).map(withBarnDefaults)
        : [],
      /* ของที่บันทึกไว้ก่อนมีสองคีย์นี้จะได้ไม่พัง */
      edits: raw.edits && typeof raw.edits === "object" ? raw.edits : {},
      removed: Array.isArray(raw.removed) ? raw.removed.filter((id) => typeof id === "string") : [],
    };
  } catch {
    return EMPTY;
  }
};

/**
 * เติมช่องที่หน้าอื่นคาดหวังให้ครบทุกโรงเรือนที่ผู้ใช้เพิ่ม
 *
 * หน้า "ภายในโรงเรือน" อ่าน barn.today.* และ barn.cameras ตรง ๆ โดยไม่เช็ก null
 * เพราะโรงเรือนของระบบมีครบเสมอ — โรงเรือนที่ผู้ใช้เพิ่มจึงต้องมีโครงเดียวกัน
 * ไม่งั้นเปิดหน้านั้นแล้วจอขาวทั้งหน้า (เคยพังมาแล้วตอนต่อ T1.77)
 *
 * ใช้ทั้งตอนสร้างใหม่และตอนอ่านของเก่าจากเครื่อง — ของที่บันทึกไว้ก่อนมีฟิลด์พวกนี้จะได้ไม่พัง
 */
const withBarnDefaults = (barn) => ({
  devices: { fan: "good", water: "good", feed: "good", camera: "good", sensor: "good" },
  cameras: [],
  ...barn,
  today: {
    expected: barn.pigs ?? 0,
    aiCount: null,
    missing: 0,
    sick: 0,
    dead: 0,
    countedAt: barn.updatedAt ?? new Date().toISOString(),
    ...(barn.today ?? {}),
  },
});

/** รหัสใหม่ที่ไม่ซ้ำของเดิม — ขึ้นต้น U- เพื่อให้แยกออกจากรหัสของระบบได้ทันที */
const newId = (kind) =>
  `${USER_PREFIX}${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();

export function RecordsProvider({ children }) {
  const [store, setStore] = useState(read);

  /**
   * ประตูชั้นที่สองของสิทธิ์ "แก้ฟาร์ม/โรงเรือน" (ดู lib/auth/roles.js)
   *
   * หน้าจอปิดปุ่มให้อยู่แล้ว แต่การกันไว้ตรงนี้ด้วยคือสิ่งที่ทำให้ข้อมูล "แก้ไม่ได้จริง" —
   * ไม่ใช่แค่ "กดไม่ได้" ลืมปิดปุ่มไปสักที่ หรือมีทางเรียกใหม่ที่ยังไม่ได้ปิด ข้อมูลก็ยังปลอดภัย
   * เขียน console.warn ไว้ให้ตามรอยได้ตอนพัฒนา ไม่ขึ้นอะไรบนจอเพราะปุ่มควรถูกปิดไปตั้งแต่ต้น
   */
  const canManage = useAuth().can("farm.manage");
  const guard = useCallback(
    (name, fn) =>
      (...args) => {
        if (!canManage) {
          console.warn(
            `[SWINE SYNC] ${name}(): สิทธิ์ปัจจุบันแก้ฟาร์ม/โรงเรือนไม่ได้ — ไม่มีอะไรถูกบันทึก`
          );
          return null;
        }
        return fn(...args);
      },
    [canManage]
  );

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      /* เต็มหรือถูกปิดไว้ — ใช้ต่อได้ในรอบนี้ แค่ไม่ถูกจำไว้รอบหน้า */
    }
  }, [store]);

  const addFarm = useCallback((data) => {
    /* เติมช่องที่หน้าอื่นต้องใช้ให้ครบตั้งแต่ตอนสร้าง — หน้าที่อ่านฟาร์มคาดหวังคีย์พวกนี้เสมอ
       ไม่งั้นการ์ดฟาร์มจะพังตรงที่อ่าน f.status หรือ f.alerts ของฟาร์มที่เพิ่งเพิ่ม */
    const farm = {
      id: newId("F"),
      name: "",
      province: "",
      district: "",
      lat: null,
      lng: null,
      status: "good",
      pigs: 0,
      barnCount: 0,
      alerts: 0,
      tempC: null,
      humidity: null,
      fcr: null,
      pigTypes: [],
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setStore((s) => ({ ...s, farms: [...s.farms, farm] }));
    return farm;
  }, []);

  const addBarn = useCallback((farmId, data) => {
    const barn = {
      id: newId("B"),
      farmId,
      name: "",
      zone: "A",
      building: 1,
      stage: "ขุน",
      capacity: 0,
      pigs: 0,
      status: "good",
      alerts: 0,
      tempC: null,
      humidity: null,
      nh3: null,
      feedPct: null,
      waterPct: null,
      windSpeed: null,
      health: null,
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const full = withBarnDefaults(barn);
    setStore((s) => ({ ...s, barns: [...s.barns, full] }));
    return full;
  }, []);

  /**
   * แก้ไขรายการหนึ่ง — แก้เฉพาะช่องที่ส่งมา ห้ามทับทั้งก้อน
   * ของผู้ใช้แก้ที่ตัวรายการ · ของระบบเก็บเป็น patch ใน edits (ข้อมูลต้นทางไม่ถูกแตะ)
   */
  const updateFarm = useCallback((id, patch) => {
    setStore((s) =>
      isUserRecord(id)
        ? {
            ...s,
            farms: s.farms.map((f) =>
              f.id === id ? { ...f, ...patch, updatedAt: new Date().toISOString() } : f
            ),
          }
        : {
            ...s,
            edits: {
              ...s.edits,
              [id]: { ...(s.edits[id] ?? {}), ...patch, updatedAt: new Date().toISOString() },
            },
          }
    );
  }, []);

  const updateBarn = useCallback((id, patch) => {
    setStore((s) =>
      isUserRecord(id)
        ? {
            ...s,
            barns: s.barns.map((b) =>
              b.id === id
                ? withBarnDefaults({ ...b, ...patch, updatedAt: new Date().toISOString() })
                : b
            ),
          }
        : {
            ...s,
            edits: {
              ...s.edits,
              [id]: { ...(s.edits[id] ?? {}), ...patch, updatedAt: new Date().toISOString() },
            },
          }
    );
  }, []);

  /**
   * ลบรายการหนึ่ง
   * ของผู้ใช้ = ลบจริง (เจ้าของสร้างเองก็ลบเองได้) · ของระบบ = ซ่อนไว้ กู้คืนได้เสมอ
   * ลบฟาร์มต้องเก็บโรงเรือนของฟาร์มนั้นไปด้วย ไม่งั้นเหลือโรงเรือนลอยที่ไม่มีฟาร์มแม่
   */
  const removeFarm = useCallback((id) => {
    setStore((s) =>
      isUserRecord(id)
        ? {
            ...s,
            farms: s.farms.filter((f) => f.id !== id),
            barns: s.barns.filter((b) => b.farmId !== id),
          }
        : { ...s, removed: [...new Set([...s.removed, id])] }
    );
  }, []);

  const removeBarn = useCallback((id) => {
    setStore((s) =>
      isUserRecord(id)
        ? { ...s, barns: s.barns.filter((b) => b.id !== id) }
        : { ...s, removed: [...new Set([...s.removed, id])] }
    );
  }, []);

  /** กู้คืนรายการระบบที่ลบไว้ — ไม่ส่ง id มาคือกู้คืนทั้งหมด */
  const restore = useCallback((id = null) => {
    setStore((s) => ({
      ...s,
      removed: id == null ? [] : s.removed.filter((x) => x !== id),
    }));
  }, []);

  /** ล้างการแก้ไขของรายการระบบ ให้กลับเป็นค่าตั้งต้น — ไม่ส่ง id มาคือล้างทั้งหมด */
  const resetEdits = useCallback((id = null) => {
    setStore((s) => {
      if (id == null) return { ...s, edits: {} };
      const next = { ...s.edits };
      delete next[id];
      return { ...s, edits: next };
    });
  }, []);

  /**
   * ประกอบรายการที่หน้าจอควรเห็น = ข้อมูลระบบ (ตัดของที่ลบ + ทับด้วยส่วนที่แก้) + ของที่เพิ่มเอง
   * ของที่เพิ่มเองต่อท้ายเสมอ — ลำดับของข้อมูลระบบไม่ควรขยับเพราะคนไปเพิ่มรายการใหม่
   */
  const applyEdits = useCallback(
    (list) =>
      list
        .filter((item) => !store.removed.includes(item.id))
        .map((item) => (store.edits[item.id] ? { ...item, ...store.edits[item.id] } : item)),
    [store.edits, store.removed]
  );

  /* barnCount ต้องนับจากโรงเรือนจริงของฟาร์มนั้น ไม่ใช่ค่าที่กรอกไว้ตอนสร้าง
     (ไม่งั้นเพิ่ม/ลบโรงเรือนแล้วการ์ดฟาร์มยังบอกเลขเดิม และผู้ช่วย AI ก็นับไม่ตรง) */
  const mergeFarms = useCallback(
    (base) => [
      ...applyEdits(base),
      ...store.farms.map((f) => ({
        ...f,
        barnCount: store.barns.filter((b) => b.farmId === f.id).length,
      })),
    ],
    [applyEdits, store.farms, store.barns]
  );

  const mergeBarns = useCallback(
    (farmId, base) => [
      ...applyEdits(base),
      ...store.barns.filter((b) => b.farmId === farmId),
    ],
    [applyEdits, store.barns]
  );

  const isMine = useCallback(
    (id) => store.farms.some((f) => f.id === id) || store.barns.some((b) => b.id === id),
    [store]
  );

  /** รายการระบบใบนี้ถูกแก้ไปแล้วหรือยัง — หน้าจอเอาไปติดป้ายให้ผู้ใช้รู้ */
  const isEdited = useCallback((id) => Boolean(store.edits[id]), [store.edits]);

  const value = useMemo(
    () => ({
      farms: store.farms,
      barns: store.barns,
      /* ทุกตัวที่เขียนข้อมูลผ่าน guard หมด — ตัวที่อ่านอย่างเดียวไม่ต้องกัน ทั้งสองสิทธิ์ดูได้เท่ากัน */
      addFarm: guard("addFarm", addFarm),
      addBarn: guard("addBarn", addBarn),
      updateFarm: guard("updateFarm", updateFarm),
      updateBarn: guard("updateBarn", updateBarn),
      removeFarm: guard("removeFarm", removeFarm),
      removeBarn: guard("removeBarn", removeBarn),
      restore: guard("restore", restore),
      resetEdits: guard("resetEdits", resetEdits),
      mergeFarms,
      mergeBarns,
      isMine,
      isEdited,
      removedIds: store.removed,
    }),
    [
      store,
      guard,
      addFarm,
      addBarn,
      updateFarm,
      updateBarn,
      removeFarm,
      removeBarn,
      restore,
      resetEdits,
      mergeFarms,
      mergeBarns,
      isMine,
      isEdited,
    ]
  );

  return <RecordsContext.Provider value={value}>{children}</RecordsContext.Provider>;
}
