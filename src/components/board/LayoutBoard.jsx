/**
 * กระดานจัดเลย์เอาต์ — กริด 12 คอลัมน์ที่ลากย้ายและยืดกล่องได้ทั้ง 8 ทิศ
 *
 * เขียนเองด้วย Pointer Events ล้วน ไม่พึ่ง library ลากวาง เพราะกติกาโครงการห้ามเพิ่ม
 * dependency ใหม่ — และ Pointer Events ตัวเดียวครอบคลุมทั้งเมาส์ นิ้ว และปากกา
 *
 * ความลื่นมาจากสามอย่างที่ทำงานพร้อมกัน:
 *   1. กล่องที่กำลังลาก "ลอยตามเคอร์เซอร์เป็นพิกเซล" ด้วย transform ไม่ใช่กระโดดทีละช่อง
 *   2. กล่องที่เหลือ **ขยับให้ดูตั้งแต่ยังไม่ปล่อย** (คำนวณผลลัพธ์จริงด้วย arrange ทุกเฟรม)
 *   3. การขยับของกล่องที่เหลือใช้ FLIP — วัดตำแหน่งเก่า/ใหม่แล้วเล่นย้อนกลับ
 *      กริดจึงดูไหลลื่นทั้งที่ grid-row/column เป็น property ที่ animate ตรง ๆ ไม่ได้
 *
 * ตำแหน่งเก็บเป็น "ช่องกริด" ไม่ใช่พิกเซล กล่องจึงยังเรียงตรงกันเสมอและย่อตามจอได้
 * โหมดอ่าน (editing = false) กล่องเป็น CSS grid ธรรมดา ไม่มี listener ค้างไว้เลย
 */
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Icon from "../ui/Icon.jsx";
import { formatNumber } from "../../lib/format.js";
import { COLS, MAX_ROWS, MIN_H, MIN_W, ROW_H, arrange } from "../../lib/layout/presets.js";
import { isSkinned } from "../../lib/layout/skin.js";
import "./board.css";
import { useT } from "../../lib/i18n/useT.js";

const BoardContext = createContext(null);

/** ทิศของมือจับ: n = บน, s = ล่าง, e = ขวา, w = ซ้าย (ผสมกันได้เป็นมุม) */
const HANDLES = [
  { dir: "n", label: "ขอบบน" },
  { dir: "s", label: "ขอบล่าง" },
  { dir: "w", label: "ขอบซ้าย" },
  { dir: "e", label: "ขอบขวา" },
  { dir: "nw", label: "มุมซ้ายบน" },
  { dir: "ne", label: "มุมขวาบน" },
  { dir: "sw", label: "มุมซ้ายล่าง" },
  { dir: "se", label: "มุมขวาล่าง" },
];

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const same = (a, b) => a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** ผู้ใช้ปิดการเคลื่อนไหวไว้ในหน้าตั้งค่าหรือยัง — เคารพค่านั้นแทนที่จะบังคับ animate */
const motionOff = () =>
  document.documentElement.dataset.motion === "off" ||
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * @param {object}   layout   { [blockId]: {x,y,w,h} }
 * @param {boolean}  editing  อยู่ในโหมดจัดเลย์เอาต์หรือไม่
 * @param {function} onChange (blockId, block, origin) => void — เรียกตอนปล่อยเท่านั้น
 */
export default function LayoutBoard({ boardId, layout, editing, onChange, children }) {
  const t = useT();
  const ref = useRef(null);
  /* h = ความสูงจริงของหนึ่งแถว ณ ตอนนี้ — ปกติเท่า ROW_H แต่แถวยืดได้เมื่อเนื้อหาสูงกว่าที่จอง
     (ดู gridTemplateRows ด้านล่าง) ถ้าใช้ค่าคงที่ตอนนั้น ระยะที่ลากจะไม่ตรงกับช่องที่กล่องไป */
  const [cell, setCell] = useState({ w: 100, h: ROW_H, gap: 16 });
  /* สถานะการลาก: { id, dir, origin, target, dx, dy } — อยู่ที่กระดานไม่ใช่ที่กล่อง
     เพราะกล่องอื่นต้องรู้ด้วยว่ากำลังจะถูกดันไปไหน */
  const [drag, setDrag] = useState(null);

  const nodes = useRef(new Map());
  const rects = useRef(new Map());
  /* เงาช่องปลายทาง + ช่องข้อความบอกขนาดเป็นพิกเซลที่อยู่ข้างใน */
  const dropRef = useRef(null);
  const dropPxRef = useRef(null);
  /* ความกว้างของกระดานรอบก่อน — ใช้ดูว่ารอบนี้ "ทั้งกริดขยับ" หรือ "กล่องเดียวย้าย" */
  const lastWidth = useRef(0);
  const dragRef = useRef(null);
  dragRef.current = drag;
  /* ระยะพิกเซลของกล่องที่กำลังลาก — จงใจไม่เก็บใน state
     ถ้าเก็บ React จะวาดกระดานใหม่ทุกพิกเซลที่เมาส์ขยับ (รวมการ์ดแผนที่ทั้งใบ) แล้วหนืดทันที
     ที่นี่เขียน transform ลง DOM ตรง ๆ ต่อเฟรม ส่วน state ขยับเฉพาะตอน "ช่องปลายทางเปลี่ยน" */
  const offset = useRef({ x: 0, y: 0 });
  /* ตั้งทันทีตอน pointerdown (ไม่รอ render) — FLIP ต้องรู้ให้แน่ว่าห้ามแตะกล่องใบไหน
     ถ้าอ่านจาก state ที่ยังไม่ทันอัปเดต FLIP จะไปเล่นอนิเมชันทับ transform ของกล่องที่กำลังลาก */
  const movingId = useRef(null);

  /* วัดความกว้างของหนึ่งคอลัมน์จากกระดานจริง — ต้องวัดใหม่ทุกครั้งที่จอเปลี่ยน
     ไม่งั้นระยะที่ลากจะไม่ตรงกับช่องที่กล่องกระโดดไป */
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const style = getComputedStyle(el);
      const gap = parseFloat(style.columnGap) || 0;
      /* ความสูงเฉลี่ยของหนึ่งแถวจริง ๆ = ความสูงกระดาน ÷ จำนวนแถว (รวมช่องไฟ) */
      const rowCount = style.gridTemplateRows.split(" ").filter(Boolean).length || 1;
      const rowH = Math.max(
        ROW_H,
        (el.clientHeight - gap * (rowCount - 1)) / rowCount
      );
      setCell({ w: (el.clientWidth - gap * (COLS - 1)) / COLS, h: rowH, gap });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* ผลลัพธ์ที่จะได้ถ้าปล่อยตอนนี้ — คำนวณด้วยตัวเดียวกับที่ใช้ตอน commit
     สิ่งที่เห็นระหว่างลากจึงตรงกับสิ่งที่ได้จริง ไม่มีเซอร์ไพรส์ตอนปล่อย */
  const preview =
    drag && drag.target ? arrange(layout, drag.id, drag.target, drag.origin) : layout;

  /* FLIP: จำตำแหน่งก่อน render แล้วเล่นจากตำแหน่งเก่ากลับมาที่ใหม่
     (grid-row / grid-column เป็น discrete property จะ transition ตรง ๆ ไม่ได้) */
  useLayoutEffect(() => {
    const moving = movingId.current;
    const skip = motionOff();

    /* ความกว้างของกระดานเปลี่ยน = ทั้งกริดขยับพร้อมกัน (ย่อ/ขยายหน้าต่าง, สลับธีมบทบาท
       ที่ทำให้แถบเมนูกว้างไม่เท่าเดิม, เปิด/ปิดแผงข้าง) — ถ้า FLIP ทุกใบพร้อมกันในจังหวะนั้น
       จะเห็นกล่องทั้งหน้าวิ่งเข้ามาจากคนละทิศเหมือนหน้าแตก ➜ รอบนั้นให้จำตำแหน่งใหม่เฉย ๆ */
    const boardWidth = ref.current?.getBoundingClientRect().width ?? 0;
    const reflowed = Math.abs(boardWidth - lastWidth.current) > 1;
    lastWidth.current = boardWidth;

    /* React เขียน style ใหม่ทุกครั้งที่ re-render และล้าง transform ที่เราเขียนเอง
       (ตำแหน่งพิกเซลไม่ได้อยู่ใน state โดยตั้งใจ) — ต้องทาคืนหลัง render ทุกรอบ
       ไม่งั้นพอกล่องอื่นขยับที กล่องที่กำลังลากจะเด้งกลับไปที่ช่องเดิมทันที */
    if (moving) {
      const el = nodes.current.get(moving);
      if (el) {
        /* Web Animations ทับ inline style เสมอ — ถ้ามี FLIP ค้างอยู่บนใบที่กำลังลาก
           กล่องจะเด้งกลับไปที่เดิมทั้งที่ transform ถูกต้องแล้ว ต้องยกเลิกให้หมดก่อน */
        el.getAnimations().forEach((animation) => animation.cancel());
        const { x, y } = offset.current;
        /* ตอนยืด offset เป็นศูนย์เสมอ — เขียนเป็นค่าว่างแทน translate3d(0,0,0)
           จะได้ไม่สร้างเลเยอร์ compositing ทิ้งไว้บนการ์ดที่ไม่ได้ขยับ */
        el.style.transform = x || y ? `translate3d(${x}px, ${y}px, 0)` : "";
      }
    }

    nodes.current.forEach((el, id) => {
      const rect = el.getBoundingClientRect();
      const prev = rects.current.get(id);
      rects.current.set(id, rect);
      if (skip || reflowed || !prev || id === moving) return;
      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      /* เดลต้าที่ใหญ่กว่าหน้าจอทั้งจอแปลว่าตำแหน่งเก่าที่จำไว้ใช้ไม่ได้แล้ว (วัดตอนหน้าถูกซ่อน
         หรือตอนกริดยังไม่ได้ขนาดจริง) — เล่นต่อจะกลายเป็นกล่องพุ่งมาจากนอกจอ ให้วางเฉย ๆ */
      if (Math.abs(dx) > window.innerWidth || Math.abs(dy) > window.innerHeight) return;
      /* ยกเลิกตัวเก่าก่อนเสมอ — ระหว่างลาก ช่องปลายทางเปลี่ยนได้หลายรอบ
         ถ้าปล่อยให้ซ้อนกันจะมีอนิเมชันค้างเป็นสิบตัวแย่งกันคุม transform ของกล่องเดียว */
      el.getAnimations().forEach((animation) => animation.cancel());
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
        { duration: 190, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
      );
    });
  });

  /* ขนาดจริงเป็นพิกเซลของช่องปลายทาง — วัดจากเงาที่วางในกริดแล้ว ไม่ได้คำนวณจากขนาดคอลัมน์
     เพราะแถวยืดตามเนื้อหาได้ (gridTemplateRows เป็น minmax) ตัวเลขที่คูณเองจะเพี้ยน
     เขียนลง DOM ตรง ๆ ไม่ผ่าน state — ถ้าเก็บเป็น state การวัดจะสั่งวาดใหม่แล้ววัดอีกไม่จบ */
  useLayoutEffect(() => {
    const el = dropRef.current;
    const out = dropPxRef.current;
    if (!el || !out) return;
    const rect = el.getBoundingClientRect();
    out.textContent = `${formatNumber(Math.round(rect.width))} × ${formatNumber(
      Math.round(rect.height)
    )} px`;
  });

  /** เริ่มลาก — กระดานรับช่วงต่อจากกล่อง แล้วฟัง pointer ที่ window จนกว่าจะปล่อย */
  const begin = useCallback(
    (id, dir, event, block) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startY = event.clientY;
      const step = cell.w + cell.gap;
      /* "ลอยตามเคอร์เซอร์" ใช้กับการย้ายเท่านั้น — ตอนยืด กล่องต้องอยู่กับที่แล้วให้เงาปลายทาง
         เป็นตัวบอกขนาดใหม่ ถ้าเลื่อนตามด้วยจะกลายเป็นการ์ดวิ่งหนีมือทั้งที่กำลังยืดมุมอยู่ */
      const floating = dir === "move";

      movingId.current = id;
      setDrag({ id, dir, origin: block, target: block });

      /* เขียน transform ลง DOM ตรง ๆ ใน handler เลย ไม่ผ่าน requestAnimationFrame
         เบราว์เซอร์ยิง pointermove ไม่เกินเฟรมละครั้งอยู่แล้ว การหน่วงด้วย rAF จึงไม่ช่วยอะไร
         แถมพังตอนแท็บถูกซ่อน (rAF ถูกพัก) — กล่องจะค้างไม่ตามเมาส์ */
      const paint = () => {
        const el = nodes.current.get(id);
        const { x, y } = offset.current;
        if (el) el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      };

      const move = (e) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        /* วาดตำแหน่งกล่องที่ลากทันที โดยไม่ผ่าน React (เฉพาะตอนย้าย) */
        if (floating) {
          offset.current = { x: dx, y: dy };
          paint();
        }
        /* ปัดเป็นจำนวนช่องด้วยระยะ "คอลัมน์ + ช่องไฟ" ไม่ใช่ความกว้างคอลัมน์เปล่า
           ไม่งั้นลากไปไกล ๆ แล้วตำแหน่งจะเพี้ยนสะสมทีละช่องไฟ */
        const cx = Math.round(dx / step);
        const cy = Math.round(dy / (cell.h + cell.gap));
        let target;

        if (dir === "move") {
          target = {
            ...block,
            x: clamp(block.x + cx, 0, COLS - block.w),
            y: clamp(block.y + cy, 0, MAX_ROWS - block.h),
          };
        } else {
          let { x, y, w, h } = block;
          /* ยืดจากขอบซ้าย/บน = ขยับมุมซ้ายบนด้วย ขอบตรงข้ามจึงอยู่กับที่ */
          if (dir.includes("e")) w = clamp(block.w + cx, MIN_W, COLS - block.x);
          if (dir.includes("s")) h = clamp(block.h + cy, MIN_H, MAX_ROWS - block.y);
          if (dir.includes("w")) {
            const right = block.x + block.w;
            x = clamp(block.x + cx, 0, right - MIN_W);
            w = right - x;
          }
          if (dir.includes("n")) {
            const bottomEdge = block.y + block.h;
            y = clamp(block.y + cy, 0, bottomEdge - MIN_H);
            h = bottomEdge - y;
          }
          target = { x, y, w, h };
        }

        /* แตะ state เฉพาะตอนช่องปลายทางเปลี่ยนจริง — ทั้งการลากหนึ่งครั้งเกิดไม่กี่ครั้ง */
        setDrag((cur) => (cur && !same(cur.target, target) ? { ...cur, target } : cur));
      };

      const end = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        /* ล้าง transform ที่เขียนไว้เอง ไม่งั้นกล่องจะค้างเยื้องหลังปล่อย */
        movingId.current = null;
        offset.current = { x: 0, y: 0 };
        const el = nodes.current.get(id);
        if (el) el.style.transform = "";
        const cur = dragRef.current;
        setDrag(null);
        if (cur?.target && !same(cur.target, cur.origin)) {
          onChange?.(cur.id, cur.target, cur.origin);
        }
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [cell, onChange]
  );

  const register = useCallback((id, el) => {
    if (el) nodes.current.set(id, el);
    else {
      nodes.current.delete(id);
      rects.current.delete(id);
    }
  }, []);

  /* แถวของกระดาน = แถวล่างสุดของกล่องที่มี + เผื่อไว้ให้ลากลงต่อได้ตอนกำลังจัด
     (12 แถว = 240px — หนึ่งแถวสูงแค่ 4px จึงต้องเผื่อเป็นจำนวนแถวที่มากขึ้นตาม) */
  const bottom = Object.values(preview).reduce((max, b) => Math.max(max, b.y + b.h), 0);
  const rows = Math.min(MAX_ROWS, bottom + (editing ? 12 : 0));

  return (
    <BoardContext.Provider value={{ editing, drag, preview, begin, register, onChange }}>
      <div
        ref={ref}
        /* data-board ให้หน้าเพจเขียนกติกาการยุบของ "กระดานของตัวเอง" ได้ตอนจอแคบลง
           (บางหน้าเป็นแผงหลายคอลัมน์แน่น ๆ ซึ่งต้องยุบก่อนหน้าอื่น) */
        data-board={boardId}
        /* ★ ผิวกระจก-ฮอโลแกรมของหน้านั้น ๆ — รายชื่อหน้าอยู่ที่ lib/layout/skin.js ที่เดียว
           ติดเป็นคลาสไม่ใช่ให้ CSS ไล่เล็ง data-board ทีละหน้า (ดูเหตุผลในไฟล์นั้น) */
        className={
          "lb-board" +
          (isSkinned(boardId) ? " is-skinned" : "") +
          (editing ? " is-editing" : "") +
          (drag ? " is-dragging" : "")
        }
        /* แถวสูง ROW_H เป็น "อย่างน้อย" ไม่ใช่ "เป๊ะ ๆ" — ความสูงที่บันทึกไว้จึงยังเป็นตัวกำหนดหลัก
           แต่ถ้าเนื้อหาในกล่องสูงกว่าที่จองไว้ (จอแคบลง ตัวอักษรใหญ่ขึ้น ข้อความยาวกว่าเดิม)
           แถวจะยืดให้พอดีแทนที่จะตัดเนื้อหาทิ้ง — กันบั๊ก "การ์ดโดนตัดครึ่ง" ทั้งแอปในที่เดียว */
        style={{ gridTemplateRows: `repeat(${rows}, minmax(${ROW_H}px, auto))` }}
      >
        {/* ตารางจาง ๆ ให้เห็นว่าช่องอยู่ตรงไหน — โผล่เฉพาะตอนกำลังจัด
            วาดด้วยเส้นไล่ระดับ ไม่ใช่ <span> ทีละช่อง เพราะหนึ่งแถวสูงแค่ 4px
            หน้ายาว ๆ จะกลายเป็นหลายพัน element ทันทีที่กดเข้าโหมดจัด */}
        {editing && (
          <div
            className="lb-ghost"
            aria-hidden="true"
            style={{ "--lb-col": `${cell.w + cell.gap}px`, "--lb-row": `${cell.h + cell.gap}px` }}
          />
        )}

        {/* เงาบอกช่องปลายทาง — ใช้ผลจาก arrange ไม่ใช่ตำแหน่งดิบที่เมาส์เล็ง
            เพราะเวลาสลับที่ กล่องจะ "ดูดเข้าช่อง" ของใบที่ถูกทับ ไม่ได้ลงตรงที่ปล่อยเป๊ะ */}
        {drag && preview[drag.id] && (
          <div
            ref={dropRef}
            /* ตอนย้าย เงานี้คือ "ช่องว่างที่กล่องจะลง" จึงถมสีให้เห็นชัด
               ตอนยืด กล่องจริงเปลี่ยนขนาดตามมืออยู่แล้ว เงาทับพอดีกับตัวกล่อง —
               ถ้ายังถมสีอยู่จะกลายเป็นฟิล์มทองคลุมการ์ดจนอ่านไม่ออก
               ➜ ตอนยืดเหลือแค่กรอบประกับป้ายบอกขนาด ไม่ถมสี */
            className={"lb-drop" + (drag.dir === "move" ? "" : " is-resize")}
            aria-hidden="true"
            style={{
              gridColumn: `${preview[drag.id].x + 1} / span ${preview[drag.id].w}`,
              gridRow: `${preview[drag.id].y + 1} / span ${preview[drag.id].h}`,
            }}
          >
            {/* ตอนยืดต้องรู้ว่า "ปล่อยแล้วจะได้ประมาณเท่าไหร่" ทั้งเป็นช่องกริดและเป็นขนาดจริงบนจอ
                ตอนย้ายเฉย ๆ ขนาดไม่เปลี่ยน จึงไม่ต้องมีตัวเลขมาบังของที่กำลังดูอยู่ */}
            {drag.dir !== "move" && (
              <span className="lb-drop-size">
                <b className="num">
                  {preview[drag.id].w} × {preview[drag.id].h}
                </b>
                <em>{t("ช่องกริด")}</em>
                <span className="lb-drop-px num" ref={dropPxRef} />
              </span>
            )}
          </div>
        )}

        {children}
      </div>
    </BoardContext.Provider>
  );
}

/**
 * กล่องหนึ่งใบบนกระดาน
 * @param {string} id    รหัสกล่อง (ต้องตรงกับคีย์ใน layout)
 * @param {object} block ตำแหน่งจริงที่บันทึกไว้ — ระหว่างลากจะใช้ตำแหน่งพรีวิวแทน
 * @param {string} label ชื่อกล่องสำหรับผู้ใช้/โปรแกรมอ่านหน้าจอ
 */
function Block({ id, block, label, children }) {
  const t = useT();
  const { editing, drag, preview, begin, register, onChange } = useContext(BoardContext);
  /* ref callback ต้องเป็นฟังก์ชันเดิมทุก render — ถ้าสร้างใหม่ทุกครั้ง React จะถอด node
     ออกแล้วใส่กลับ ซึ่งทำให้ transform ที่เขียนเองระหว่างลากหลุดกลางคัน */
  const setNode = useCallback((el) => register(id, el), [id, register]);
  const moving = drag?.id === id;
  /* **ย้าย** กับ **ยืด** ใช้คนละวิธี:
     · ย้าย — กล่องอยู่ที่ช่องเดิมแล้วลอยตามเคอร์เซอร์ด้วย transform
       (ถ้าย้ายช่องจริงทุกเฟรม การเคลื่อนที่จะกระตุกเป็นขั้น ๆ ตามกริด)
     · ยืด — **กล่องเปลี่ยนขนาดจริงตามมือทันที** ไม่ใช่อยู่นิ่งแล้วดูเงาเอา
       (ผู้ใช้สั่ง: อยากเห็นเลยว่ายืดแล้วจะได้ประมาณไหน) transform ไม่ช่วยตรงนี้
       เพราะการยืดคือการเปลี่ยน grid-column/row จริง ๆ ซึ่งเปลี่ยนได้ทุกเฟรมอยู่แล้ว
       และไม่กระตุกเพราะขนาดขยับทีละช่องเต็ม ๆ ตามที่จะได้จริงตอนปล่อย */
  const view = moving && drag.dir === "move" ? drag.origin : preview[id] ?? block;
  /* ตัวเลขบนแถบจับต้องเป็น "ขนาดที่จะได้ถ้าปล่อยตอนนี้" ไม่ใช่ขนาดตอนเริ่มลาก —
     ระหว่างยืด กล่องยังคาที่เดิม (view = origin) ถ้าโชว์ตามนั้นตัวเลขจะนิ่งสนิททั้งที่กำลังยืดอยู่ */
  const size = moving ? preview[id] ?? drag.target ?? view : view;

  const onKeyDown = (event) => {
    if (!editing) return;
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
      event.key
    ];
    if (!step) return;
    event.preventDefault();
    const [dx, dy] = step;
    /* ส่งเป็นฟังก์ชันของค่าปัจจุบัน กดรัว ๆ จึงนับครบทุกครั้ง
       (คำนวณจาก block ที่อ่านตอน render จะทับกันเองเมื่อกดเร็วกว่าที่ React จะ re-render) */
    onChange?.(id, (cur) =>
      event.shiftKey
        ? {
            ...cur,
            w: clamp(cur.w + dx, MIN_W, COLS - cur.x),
            h: clamp(cur.h + dy, MIN_H, MAX_ROWS - cur.y),
          }
        : {
            ...cur,
            x: clamp(cur.x + dx, 0, COLS - cur.w),
            y: clamp(cur.y + dy, 0, MAX_ROWS - cur.h),
          }
    );
  };

  return (
    <div
      ref={setNode}
      className={"lb-block" + (moving ? " is-moving" : "")}
      style={{
        gridColumn: `${view.x + 1} / span ${view.w}`,
        gridRow: `${view.y + 1} / span ${view.h}`,
      }}
    >
      {editing && (
        <>
          {/* แถบจับย้าย — จับทั้งใบไม่ได้ เพราะข้างในมีปุ่มและลิงก์ที่ต้องกดได้ตามปกติ */}
          <button
            type="button"
            className="lb-move"
            onPointerDown={(e) => e.button === 0 && begin(id, "move", e, block)}
            onKeyDown={onKeyDown}
            aria-label={t("ย้าย {label} ขนาด {w}×{h} ช่อง — ลากได้ หรือใช้ปุ่มลูกศร กด Shift ค้างเพื่อปรับขนาด", {
              label: t(label),
              w: size.w,
              h: size.h,
            })}
          >
            <Icon name="grid" size={16} />
            <span className="lb-move-text">{label}</span>
            <span className={"lb-size num" + (moving ? " is-live" : "")}>
              {size.w}×{size.h}
            </span>
          </button>

          {HANDLES.map((handle) => (
            <span
              key={handle.dir}
              role="presentation"
              className={`lb-handle is-${handle.dir}`}
              title={t("ยืด {edge}", { edge: t(handle.label) })}
              onPointerDown={(e) => e.button === 0 && begin(id, handle.dir, e, block)}
            />
          ))}
        </>
      )}

      <div className="lb-body">{children}</div>
    </div>
  );
}

/* ห่อด้วย memo — ระหว่างลาก กระดานวาดใหม่เมื่อช่องปลายทางเปลี่ยน
   กล่องที่ตำแหน่งไม่ขยับ (เช่นการ์ดแผนที่ใบใหญ่) จึงไม่ต้องวาดเนื้อหาข้างในใหม่ตาม */
export const LayoutBlock = memo(Block);
