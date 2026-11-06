/**
 * ตัวห่อกระดานจัดเลย์เอาต์สำหรับ "หนึ่งหน้า" — ใช้แทนการต่อ LayoutToolbar + LayoutBoard เอง
 *
 * ทำไมต้องมีตัวนี้: ทุกหน้าต้องทำสามอย่างเหมือนกันเป๊ะ (อ่านเลย์เอาต์ของหน้าตัวเอง,
 * ต่อ onChange กลับเข้า setBlock, วางแถบเครื่องมือไว้บนสุด) ถ้าปล่อยให้แต่ละหน้าเขียนเอง
 * จะมีโค้ดชุดเดียวกันซ้ำ 11 รอบ และพลาดข้อใดข้อหนึ่งเมื่อไรหน้านั้นจะจัดเลย์เอาต์ไม่ได้เงียบ ๆ
 *
 * วิธีใช้:
 *   <PageBoard boardId="herd">
 *     <Block id="total" label="สุกรทั้งหมด"><StatTile … /></Block>
 *     <Block id="barns" label="ประชากรตามโรงเรือน"><Card …>…</Card></Block>
 *   </PageBoard>
 *
 * รายชื่อกล่องอ่านจากลูกที่เขียนไว้จริง ไม่ต้องประกาศซ้ำอีกที่ — กล่องที่ถูกซ่อนตามเงื่อนไข
 * (เช่น `{cond && <Block …/>}`) จึงหายไปจากกริดเองโดยไม่ต้องแก้อะไรเพิ่ม
 */
import { Children, isValidElement, useEffect } from "react";
import LayoutBoard, { LayoutBlock } from "./LayoutBoard.jsx";
import { useLayout } from "../../lib/layout/useLayout.js";

/**
 * ตัวคั่นบอกขอบเขตของ "หนึ่งกล่องบนกระดาน" — ไม่ได้ render อะไรด้วยตัวเอง
 * PageBoard จะอ่าน props ของมันแล้วสร้าง LayoutBlock ให้แทน
 *
 * @param {string} id    รหัสกล่อง (ต้องตรงกับคีย์ใน DEFAULT_LAYOUTS ของหน้านั้น)
 * @param {string} label ชื่อที่ผู้ใช้เห็นบนแถบจับย้าย และที่โปรแกรมอ่านหน้าจออ่าน
 */
export function Block({ children }) {
  return children;
}

export default function PageBoard({ boardId, children }) {
  const { editing, layoutOf, setBlock, registerBoard } = useLayout();

  /* toArray ตัด null/false/undefined ทิ้งให้แล้ว และแปะ key ให้เอง */
  const items = Children.toArray(children).filter(
    (child) => isValidElement(child) && child.props?.id
  );
  const blockIds = items.map((item) => item.props.id);
  const layout = layoutOf(boardId, blockIds);

  /* บอกป๊อบอัพตั้งค่าว่าตอนนี้กำลังดูกระดานไหนอยู่ (เครื่องมือจัดเลย์เอาต์ย้ายไปอยู่ในนั้น)
     ผูก dependency กับรายชื่อกล่องแบบ string ไม่ใช่ตัว array เพราะ array สร้างใหม่ทุก render */
  const blockKey = blockIds.join(",");
  useEffect(() => {
    registerBoard({ boardId, blockIds: blockKey.split(",") });
    return () => registerBoard(null);
  }, [boardId, blockKey, registerBoard]);

  return (
    <>
      <LayoutBoard
        boardId={boardId}
        layout={layout}
        editing={editing}
        onChange={(id, block, origin) => setBlock(boardId, id, block, blockIds, origin)}
      >
        {items.map((item) => (
          <LayoutBlock
            key={item.props.id}
            id={item.props.id}
            block={layout[item.props.id]}
            label={item.props.label}
          >
            {item.props.children}
          </LayoutBlock>
        ))}
      </LayoutBoard>
    </>
  );
}
