/**
 * เก็บ "ชุดเลย์เอาต์" ที่ผู้ใช้จัดเอง แยกตามหน้า
 *
 * โครงที่เก็บ (localStorage คีย์ `swine-sync:layouts`):
 *   { [boardId]: { activeId, presets: [{ id, name, blocks }] } }
 *
 * `activeId = "default"` คือใช้เลย์เอาต์ตั้งต้นของระบบ ซึ่งแก้ไม่ได้และลบไม่ได้ —
 * พอผู้ใช้เริ่มลากทั้งที่ยังใช้ค่าตั้งต้นอยู่ ระบบจะ **แตกชุดใหม่ให้อัตโนมัติ**
 * ค่าตั้งต้นจึงเป็นจุดกลับบ้านที่ปลอดภัยเสมอ ไม่มีทางถูกเขียนทับโดยไม่ตั้งใจ
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutContext } from "./useLayout.js";
import {
  defaultLayout,
  ROW_SCALE,
  arrange,
  clampBlock,
  newPresetId,
  reconcile,
} from "./presets.js";

const STORE_KEY = "swine-sync:layouts";
const DEFAULT_ID = "default";
/**
 * รุ่นของหน่วยที่ใช้เก็บตำแหน่ง — เพิ่มเลขนี้เมื่อ ROW_H เปลี่ยน
 * หรือเมื่อ "ค่าตั้งต้นของกระดานหน้าใดหน้าหนึ่ง" เปลี่ยนจนของที่บันทึกไว้ขัดกับของใหม่
 *
 * 1 = แถวสูง 44px (ขั้นละ 60px)
 * 2 = แถวสูง 4px (ขั้นละ 20px)
 * 3 = หน้าสภาพแวดล้อมจัดแถวล่างใหม่ (ควบคุม | ไฟฟ้า แล้วผังเซนเซอร์เต็มความกว้างล่างสุด)
 * 4 = หน้าสภาพแวดล้อมถอดกล่อง THI ออกจากกระดาน (ย่อไปอยู่ในหัวหน้า) แล้วเลื่อนทุกกล่องขึ้น
 * 5 = หน้าการแจ้งเตือนบีบความสูงให้พอดีเนื้อหา (ของเดิมเหลือที่ว่างตายในการ์ดพันกว่าพิกเซล)
 * 6 = หน้าสภาพแวดล้อมได้กล่อง "เทียบกับโรงเรือนอื่น" เพิ่ม (ยุบหน้า /dashboard/climate เข้ามา)
 * 7 = แก้กล่องเทียบโรงเรือนที่ตั้งความสูงต่ำกว่า MIN_H จนถูกดันขึ้นไปทับผังเซนเซอร์
 * 8 = หน้าการแจ้งเตือนจัดสัดส่วนใหม่ (ตารางกับคำแนะนำ AI เต็มแถว เหลือกราฟสองใบที่แบ่งซ้าย-ขวา)
 * 9 = กู้เลย์เอาต์ที่ถูกยืดสามเท่าตอนขึ้นเป็นรุ่น 8 (บั๊กใน migrate — ดู rowScaleFrom)
 * 10 = หน้าสภาพแวดล้อมย้าย "เทียบกับโรงเรือนอื่น" ขึ้นมาอยู่ใต้การแจ้งเตือน (คอลัมน์ขวา)
 * 11 = หน้าสภาพแวดล้อมทำให้กราฟย้อนหลังจบบรรทัดล่างตรงกับคอลัมน์ขวา (23 + 18 = 41 แถว)
 * 12 = หน้าภาพรวมจัดเป็นคอลัมน์ (แผนที่ซ้าย 8 ช่อง · กล่องสรุปเรียงลงขวา 4 ช่อง)
 * 13 = หน้าการแจ้งเตือนได้กล่อง "ใครทำอะไรในระบบ" เพิ่มล่างสุด (T1.359)
 * 14 = หน้าการแจ้งเตือนจัดเป็นคอลัมน์ (กราฟ|คำแนะนำ · ติดตาม|โดนัท) — T1.361
 * 15 = หน้าจัดการผู้ใช้ได้กล่อง "ผูกบัญชีไลน์กับผู้ใช้" แทรกใต้รายชื่อบัญชี (T1.363)
 */
const STORE_VERSION = 15;

/**
 * กระดานที่ค่าตั้งต้นเปลี่ยนไปจนต้องล้างของที่ผู้ใช้บันทึกไว้ทิ้ง
 *
 * **ทำไมต้องล้าง**: `reconcile()` ยึดตำแหน่งที่บันทึกไว้ก่อนเสมอ เปลี่ยนค่าตั้งต้นใน
 * presets.js อย่างเดียวจึงไม่มีผลกับเครื่องที่เคยลากจัดเอง — คนที่เคยจัดจะไม่มีวันเห็นของใหม่
 * ล้างเฉพาะกระดานที่เปลี่ยนจริง กระดานหน้าอื่นที่ผู้ใช้จัดไว้ยังอยู่ครบ
 */
const RESET_BOARDS = ["environment", "alerts", "overview", "users"];

/**
 * รุ่นที่ "ขึ้นมาเพื่อกู้ข้อมูลเท่านั้น" — ก้าวจากรุ่นนี้ไปห้ามล้างกระดานของใครทิ้ง
 *
 * `RESET_BOARDS` มีไว้ล้างของที่ขัดกับค่าตั้งต้นใหม่ แต่ 8 → 9 ไม่ได้เปลี่ยนค่าตั้งต้นเลย
 * มันแค่หาร 3 คืนให้ของที่รุ่น 8 ยืดไปโดยไม่ตั้งใจ — ล้างซ้ำจะทำให้คนที่เพิ่งจัด
 * หน้าสภาพแวดล้อม/หน้าแจ้งเตือนหลังอัปเดตรอบก่อนเสียของไปฟรี ๆ
 *
 * **ผูกกับ "รุ่นที่จากมา" ไม่ใช่ "รุ่นปลายทาง"** — คนที่ค้างอยู่รุ่น 6 แล้วข้ามมา 9 รวดเดียว
 * ยังต้องโดนล้างตามปกติ เพราะเขายังไม่เคยเห็นค่าตั้งต้นใหม่ของสองหน้านั้น
 */
const REPAIR_ONLY_FROM = new Set([8]);
/** ชื่อชุดที่ระบบตั้งให้ตอนแตกออกจากค่าตั้งต้นเพราะผู้ใช้เริ่มลาก */
const AUTO_NAME = "เลย์เอาต์ของฉัน";

/**
 * ความกว้างแถบเมนูซ้าย — ผู้ใช้ลากปรับได้ตอนอยู่ในโหมดจัดเลย์เอาต์ (ผู้ใช้สั่ง 1 ก.ย. 2569)
 *
 * เก็บไว้ในคลังเดียวกับเลย์เอาต์ของกระดาน เพราะเป็น "การจัดหน้าจอ" เรื่องเดียวกัน
 * แต่เก็บนอกกระดาน (คีย์ `__sideW`) เพราะแถบเมนูมีตัวเดียวใช้ร่วมกันทุกหน้า
 * ไม่ได้แยกตามหน้าเหมือนกระดาน
 *
 * ขอบเขต: แคบกว่า 220px ข้อความเมนูจะตัดคำ · กว้างกว่า 420px เนื้อหาเหลือที่น้อยเกินไป
 */
const SIDE_W_KEY = "__sideW";
export const SIDE_W_DEFAULT = 284;
export const SIDE_W_MIN = 220;
export const SIDE_W_MAX = 420;

const clampSideW = (n) => {
  const value = Math.round(Number(n));
  if (!Number.isFinite(value)) return SIDE_W_DEFAULT;
  return Math.min(SIDE_W_MAX, Math.max(SIDE_W_MIN, value));
};

/**
 * ตัวคูณแถวที่ต้องใช้ตอนย้ายของเก่า — คิดจาก "รุ่นที่เก็บไว้" ไม่ใช่ "มีการขึ้นเวอร์ชันหรือเปล่า"
 *
 * - **รุ่น 1** เก็บด้วยแถวสูง 44px (ขั้นละ 60px) ส่วนรุ่น 2 ขึ้นไปใช้แถว 4px (ขั้นละ 20px)
 *   60 / 20 = 3 พอดี ➜ คูณ y กับ h ด้วย 3 แล้วได้ตำแหน่งเป็นพิกเซลเท่าเดิมเป๊ะ
 *   (ถ้าไม่ย้าย กล่องที่บันทึกไว้จะเตี้ยลงเหลือหนึ่งในสามทันทีที่เปิดหน้า)
 * - **รุ่น 8** คือรุ่นที่ปล่อยออกไปพร้อมบั๊ก: เงื่อนไขเดิมเขียนว่า `store.__v === 2`
 *   จึงคูณ 3 ให้ **ทุกรุ่นที่ไม่ใช่ 2** — ขึ้นเวอร์ชันทีไรเลย์เอาต์ที่ผู้ใช้บันทึกไว้
 *   ก็ถูกยืดสามเท่าทุกที (ผู้ใช้แจ้ง 1 ก.ย. 2569 ว่าหน้าภาพรวมเปลี่ยนไปเอง)
 *   ➜ รุ่น 8 ต้องหาร 3 คืนหนึ่งครั้งเพื่อกู้ของที่ถูกยืดไปแล้ว
 *   ค่าที่ถูกคูณ 3 มาหารกลับได้ลงตัวเสมอ จึงกู้คืนได้ตรงเป๊ะ
 * - **รุ่นอื่น** หน่วยเหมือนกันหมด ห้ามแตะตัวเลข
 */
const rowScaleFrom = (version) => {
  const from = Number(version) || 1;
  if (from <= 1) return ROW_SCALE;
  if (from === 8) return 1 / ROW_SCALE;
  return 1;
};

const migrate = (store) => {
  if (!store || typeof store !== "object") return {};
  if (store.__v === STORE_VERSION) return store;

  const scale = rowScaleFrom(store.__v);
  const repairOnly = REPAIR_ONLY_FROM.has(Number(store.__v));
  const next = { __v: STORE_VERSION };
  /* ความกว้างแถบเมนูไม่ใช่กระดาน — ต้องหยิบข้ามมาเอง ไม่งั้นหายทุกครั้งที่ขึ้นเวอร์ชัน
     (ลูปข้างล่างข้ามค่าที่ไม่ใช่ object ทิ้งหมด) */
  if (store[SIDE_W_KEY] != null) next[SIDE_W_KEY] = clampSideW(store[SIDE_W_KEY]);
  Object.entries(store).forEach(([boardId, board]) => {
    if (boardId === "__v" || boardId === SIDE_W_KEY) return;
    if (!board || typeof board !== "object") return;
    /* กระดานที่ค่าตั้งต้นเปลี่ยน — ทิ้งของเก่าไปเลย แล้วปล่อยให้ตกกลับไปใช้ค่าตั้งต้นใหม่ */
    if (!repairOnly && RESET_BOARDS.includes(boardId)) return;
    next[boardId] = {
      ...board,
      presets: (Array.isArray(board.presets) ? board.presets : []).map((preset) => ({
        ...preset,
        blocks: Object.fromEntries(
          Object.entries(preset?.blocks ?? {}).map(([id, b]) => [
            id,
            scale === 1
              ? { ...b }
              : {
                  ...b,
                  y: Math.round((b?.y ?? 0) * scale),
                  h: Math.round((b?.h ?? 1) * scale),
                },
          ])
        ),
      })),
    };
  });
  return next;
};

const readStore = () => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return migrate(parsed);
  } catch {
    return { __v: STORE_VERSION };
  }
};

/** ดัดข้อมูลของหนึ่งหน้าให้อยู่ในรูปที่ใช้ได้เสมอ แม้ไฟล์เก่าจะเพี้ยน */
const boardOf = (store, boardId) => {
  const board = store[boardId];
  const presets = Array.isArray(board?.presets)
    ? board.presets
        .filter((p) => p && typeof p.id === "string" && p.id !== DEFAULT_ID)
        .map((p) => ({
          id: p.id,
          name: String(p.name ?? "ไม่มีชื่อ").slice(0, 40),
          blocks: p.blocks && typeof p.blocks === "object" ? p.blocks : {},
        }))
    : [];
  const activeId = presets.some((p) => p.id === board?.activeId)
    ? board.activeId
    : DEFAULT_ID;
  return { activeId, presets };
};

export function LayoutProvider({ children }) {
  const [store, setStore] = useState(readStore);
  /* โหมดจัดเลย์เอาต์ — เก็บนอก localStorage โดยตั้งใจ เปิดหน้าใหม่ควรกลับมาโหมดอ่านเสมอ */
  const [editing, setEditing] = useState(false);
  /**
   * กระดานของหน้าที่เปิดอยู่ตอนนี้ — { boardId, blockIds }
   * มีไว้เพื่อให้ป๊อบอัพตั้งค่า (ซึ่งอยู่นอกตาราง route) รู้ว่าต้องสั่งงานกระดานไหน
   * PageBoard เป็นคนลงทะเบียนให้ตอน mount และถอนตอน unmount
   */
  const [activeBoard, setActiveBoard] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch {
      /* เขียนไม่ได้ก็ยังใช้งานได้จนกว่าจะปิดแท็บ */
    }
  }, [store]);

  /**
   * ความกว้างแถบเมนูซ้าย — ทาลง `:root` ไม่ใช่ที่ element ใดใด
   *
   * เพราะมีสามโครงหน้าที่อ่าน `--side-w` (AppLayout · SideLayout · หน้ารายละเอียดโรงเรือน)
   * ทาที่รากทีเดียวจึงครบทุกโครงโดยไม่ต้องส่ง prop ไล่ทีละที่
   * ค่าตั้งต้นอยู่ใน tokens.css อยู่แล้ว — ตรงนี้ทาทับเฉพาะตอนผู้ใช้ปรับเอง
   */
  const sideW = clampSideW(store[SIDE_W_KEY] ?? SIDE_W_DEFAULT);
  useEffect(() => {
    document.documentElement.style.setProperty("--side-w", `${sideW}px`);
  }, [sideW]);

  const update = useCallback((boardId, fn) => {
    setStore((cur) => {
      const board = boardOf(cur, boardId);
      return { ...cur, [boardId]: fn(board) };
    });
  }, []);

  const value = useMemo(() => {
    /** ชุดที่ใช้อยู่ของหน้านี้ (null = ค่าตั้งต้นของระบบ) */
    const activePreset = (boardId) => {
      const board = boardOf(store, boardId);
      return board.presets.find((p) => p.id === board.activeId) ?? null;
    };

    return {
      editing,
      setEditing,
      DEFAULT_ID,

      /* ---------- ความกว้างแถบเมนูซ้าย (ปรับได้ตอนจัดเลย์เอาต์) ---------- */
      sideW,
      sideWDefault: SIDE_W_DEFAULT,
      sideWMin: SIDE_W_MIN,
      sideWMax: SIDE_W_MAX,
      /** ตั้งค่าใหม่ (บันทึกลง localStorage ให้เอง) — ส่งฟังก์ชันเข้ามาได้เหมือน setState */
      setSideW: (next) =>
        setStore((cur) => {
          const base = clampSideW(cur[SIDE_W_KEY] ?? SIDE_W_DEFAULT);
          const value = clampSideW(typeof next === "function" ? next(base) : next);
          return value === base ? cur : { ...cur, [SIDE_W_KEY]: value };
        }),
      /** คืนความกว้างแถบเมนูกลับเป็นค่าตั้งต้น */
      resetSideW: () =>
        setStore((cur) => {
          if (cur[SIDE_W_KEY] == null) return cur;
          const next = { ...cur };
          delete next[SIDE_W_KEY];
          return next;
        }),

      /* กระดานของหน้าที่เปิดอยู่ + ตัวลงทะเบียน (ดู PageBoard.jsx) */
      activeBoard,
      registerBoard: setActiveBoard,
      /* เลย์เอาต์ที่เห็นอยู่จริงของหน้าปัจจุบัน — ป๊อบอัพตั้งค่าใช้ตอน "บันทึกเป็นชุดใหม่" */
      activeLayout: () =>
        activeBoard
          ? reconcile(
              activePreset(activeBoard.boardId)?.blocks ??
                defaultLayout(activeBoard.boardId, activeBoard.blockIds),
              activeBoard.blockIds,
              defaultLayout(activeBoard.boardId, activeBoard.blockIds)
            )
          : {},

      presetsOf: (boardId) => boardOf(store, boardId).presets,
      activeIdOf: (boardId) => boardOf(store, boardId).activeId,
      activeNameOf: (boardId) => activePreset(boardId)?.name ?? "ค่าเริ่มต้นของระบบ",
      isDefaultActive: (boardId) => boardOf(store, boardId).activeId === DEFAULT_ID,

      /** เลย์เอาต์พร้อมใช้ของหน้านี้ — เติมกล่องใหม่ ตัดกล่องที่หายไป และเก็บแถวว่างให้ */
      layoutOf: (boardId, blockIds) =>
        reconcile(
          activePreset(boardId)?.blocks ?? defaultLayout(boardId, blockIds),
          blockIds,
          defaultLayout(boardId, blockIds)
        ),

      /**
       * ย้าย/ปรับขนาดกล่องหนึ่ง แล้วบันทึกลงชุดที่ใช้อยู่
       * ถ้ายังใช้ค่าตั้งต้นอยู่จะแตกชุดใหม่ให้ก่อน ค่าตั้งต้นจึงไม่ถูกแตะ
       *
       * `block` ส่งเป็นฟังก์ชัน (ค่าปัจจุบัน) => ค่าใหม่ ได้ด้วย — จำเป็นสำหรับปุ่มลูกศร
       * ที่ผู้ใช้กดรัว ๆ ได้: ถ้าคำนวณจากค่าที่อ่านตอน render การกดหลายครั้งติดกัน
       * จะทับกันเองจนขยับแค่ครั้งเดียว
       *
       * `origin` = ตำแหน่งตอนเริ่มลาก ใช้เป็น "ที่ว่างที่ยกให้ใบที่ถูกทับ" — มีค่านี้เมื่อไร
       * การลากไปทับใบเดียวจะกลายเป็นการสลับที่กันแบบวิดเจ็ตบนไอโฟน
       */
      setBlock: (boardId, blockId, block, blockIds, origin) =>
        update(boardId, (board) => {
          const current = board.presets.find((p) => p.id === board.activeId);
          const base = reconcile(
            current?.blocks ?? defaultLayout(boardId, blockIds),
            blockIds,
            defaultLayout(boardId, blockIds)
          );
          const next = typeof block === "function" ? block(base[blockId]) : block;
          const blocks = arrange(base, blockId, clampBlock(next), origin ?? base[blockId]);

          if (board.activeId !== DEFAULT_ID) {
            return {
              ...board,
              presets: board.presets.map((p) =>
                p.id === board.activeId ? { ...p, blocks } : p
              ),
            };
          }
          /* แตกชุดใหม่จากค่าตั้งต้น แล้วสลับไปใช้ชุดนั้นทันที */
          const preset = { id: newPresetId(), name: AUTO_NAME, blocks };
          return { activeId: preset.id, presets: [...board.presets, preset] };
        }),

      /** บันทึกเลย์เอาต์ที่เห็นอยู่เป็นชุดใหม่ */
      addPreset: (boardId, name, blocks) =>
        update(boardId, (board) => {
          const preset = {
            id: newPresetId(),
            name: String(name || "").trim().slice(0, 40) || AUTO_NAME,
            blocks,
          };
          return { activeId: preset.id, presets: [...board.presets, preset] };
        }),

      renamePreset: (boardId, presetId, name) =>
        update(boardId, (board) => ({
          ...board,
          presets: board.presets.map((p) =>
            p.id === presetId
              ? { ...p, name: String(name || "").trim().slice(0, 40) || p.name }
              : p
          ),
        })),

      deletePreset: (boardId, presetId) =>
        update(boardId, (board) => {
          const presets = board.presets.filter((p) => p.id !== presetId);
          return {
            /* ลบชุดที่ใช้อยู่ = กลับไปค่าตั้งต้น ไม่ใช่กระโดดไปชุดอื่นแบบเดาใจ */
            activeId: board.activeId === presetId ? DEFAULT_ID : board.activeId,
            presets,
          };
        }),

      selectPreset: (boardId, presetId) =>
        update(boardId, (board) => ({ ...board, activeId: presetId })),

      /**
       * คืนชุดที่ใช้อยู่กลับเป็นค่าตั้งต้นของระบบ (ชุดอื่นไม่ถูกแตะ)
       *
       * **คืนความกว้างแถบเมนูซ้ายด้วย** — ผู้ใช้แจ้ง 1 ก.ย. 2569 ว่ากดคืนค่าแล้ว
       * "ไม่คืนให้ตรงการปรับเลย์เอาต์" เพราะแถบเมนูยังกว้างเท่าที่ลากไว้
       * ในสายตาคนใช้ ความกว้างแถบเมนูก็คือส่วนหนึ่งของการจัดเลย์เอาต์ (ปรับในโหมดเดียวกัน)
       * ปุ่มเดียวจึงต้องคืนให้ครบทุกอย่างที่โหมดจัดเลย์เอาต์เปลี่ยนได้
       */
      resetActive: (boardId) =>
        setStore((cur) => {
          const board = boardOf(cur, boardId);
          /* ความกว้างแถบเมนูคืนค่าเสมอ แม้กระดานจะยังอยู่ที่ค่าตั้งต้น
             (ผู้ใช้อาจลากแค่แถบเมนูอย่างเดียวโดยไม่ได้แตะกล่องเลย) */
          const next = { ...cur };
          delete next[SIDE_W_KEY];

          if (board.activeId === DEFAULT_ID) return next;
          return {
            ...next,
            [boardId]: {
              ...board,
              presets: board.presets.map((p) =>
                p.id === board.activeId
                  ? {
                      ...p,
                      /* ปุ่ม "คืนค่า" ใช้กับกระดานที่เปิดอยู่เสมอ จึงรู้รายชื่อกล่องจริงจาก activeBoard
                         (จำเป็นสำหรับหน้าที่ค่าตั้งต้นคำนวณจากรายชื่อกล่อง เช่นหน้าภาพรวม) */
                      blocks: defaultLayout(
                        boardId,
                        activeBoard?.boardId === boardId ? activeBoard.blockIds : []
                      ),
                    }
                  : p
              ),
            },
          };
        }),
    };
  }, [store, editing, activeBoard, update, sideW]);

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}
