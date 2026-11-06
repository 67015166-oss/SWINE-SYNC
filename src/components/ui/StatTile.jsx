import { Link } from "react-router-dom";
import { useT } from "../../lib/i18n/useT.js";
import Card from "./Card.jsx";
import Icon from "./Icon.jsx";
import DataSourceBadge from "./DataSourceBadge.jsx";
import "./ui.css";

/**
 * ตัวเลขเด่นพร้อมป้ายกำกับ ใช้เรียงแถวบนสุดของหน้า (วางเป็นกล่องหนึ่งใบบนกระดานจัดเลย์เอาต์)
 *
 * ถ้าส่ง onClick มาด้วย ไทล์จะกลายเป็นปุ่ม (ตัวกรอง) — หน้าตาเหมือนเดิมทุกอย่าง
 * แต่กดได้ นูนขึ้นตอน hover และมีขอบทองตอน active
 *
 * @param {string} label   ชื่อตัวชี้วัด เช่น "สุกรทั้งหมด"
 * @param {string} [value] ค่าที่ format แล้ว เช่น "3,918" — ไม่ส่งมาก็ได้ (ไทล์จะไม่มีบรรทัดตัวเลข)
 * @param {string} [unit]  หน่วย เช่น "ตัว"
 * @param {string} [hint]  ข้อความแทนตัวเลข (ไทล์ที่เป็นทางเข้าอย่างเดียว เช่น "กดเพื่อเลือกฟาร์ม")
 * @param {object} [delta] การเปลี่ยนแปลง { text: "+2.1% จากเดือนก่อน", tone: "good" | "bad" | "neutral" }
 * @param {function} [onClick] ทำให้ไทล์กดได้ (เช่น ใช้เป็นตัวกรองรายการ)
 * @param {string}   [to]      ทำให้ไทล์เป็นลิงก์ไปอีกหน้า (ใช้แทน onClick)
 * @param {"stack"|"row"} [variant] "row" = ป้าย+ตัวเลขเรียงกันเป็นแถว
 * @param {boolean}  [active]  ไทล์นี้ถูกเลือกอยู่ (ใช้คู่กับ onClick)
 * @param {boolean}  [haspopup] ไทล์นี้เปิดป๊อบอัพ ไม่ใช่ปุ่มสลับ (บอก screen reader ให้ถูก)
 * @param {object}   [pick]    ปุ่มรองในไทล์เดียวกัน { label, onClick, tone } — ใช้คู่กับ `to`
 *                             วางเป็นแถบท้ายไทล์แทน `foot` (กล่องหนึ่งใบใช้ได้อย่างใดอย่างหนึ่ง)
 *                             กดที่ตัวไทล์ = ไปหน้าปลายทาง · กดแถบนี้ = เปิดป๊อบอัพเลือกฟาร์ม
 * @param {"live"|"mixed"|"demo"} [source] ที่มาของตัวเลขในใบนี้ — ติดป้ายไว้ข้างชื่อกล่อง
 *                             **กล่องที่โชว์ตัวเลขต้องส่งค่านี้มาเสมอ** ไม่งั้นคนอ่านจะแยกไม่ออกว่า
 *                             เลขไหนมาจากเซนเซอร์จริงและเลขไหนเป็นข้อมูลตัวอย่าง (เคยเป็นปัญหาจริง
 *                             ในหน้าภาพรวม: "กำไรเดือนล่าสุด" เป็นเลขสมมติแต่ไม่มีอะไรบอก)
 * @param {string}   [tone]    สีประจำหมวดที่ทาทั้งใบ: "blue" | "critical" | "climate" | "gold"
 * @param {object}   [foot]    แถบสรุปท้ายไทล์ { icon, text, link, tone } — ตัวเลขย่อยหนึ่งค่า
 *                             ทางซ้าย และข้อความ "ดูรายละเอียด ›" ทางขวา (ทั้งไทล์เป็นลิงก์อยู่แล้ว
 *                             ข้อความนี้จึงเป็นป้ายบอกทาง ไม่ใช่ลิงก์ซ้อนลิงก์)
 */
export default function StatTile({
  label,
  value,
  unit,
  hint,
  delta,
  onClick,
  to,
  pick,
  tone,
  source,
  foot,
  active = false,
  haspopup = false,
  variant = "stack",
}) {
  const t = useT();
  const isRow = variant === "row";

  /* ไทล์บางใบเป็นทางเข้าอย่างเดียว ไม่ต้องโชว์ตัวเลข (เช่น อุณหภูมิ/ความชื้นในหน้าภาพรวม) */
  const hasValue = value !== undefined && value !== null && value !== "";

  /* แถวกลางของไทล์: ตัวเลข หรือข้อความชวนกด (ใบไหนไม่มีทั้งคู่ก็ยังจองความสูงไว้) */
  const middle = hasValue ? (
    <span className="stat-tile-value">
      {value}
      {unit && <span className="stat-tile-unit">{unit}</span>}
    </span>
  ) : hint ? (
    <span className="stat-tile-hint">{hint}</span>
  ) : null;

  const deltaLine = delta && (
    <span className={`stat-tile-delta is-${delta.tone ?? "neutral"}`}>{delta.text}</span>
  );

  /* แถบสรุปท้ายไทล์ — ตัวเลขย่อยหนึ่งค่าทางซ้าย ป้ายบอกทางทางขวา */
  const footStrip = foot && (
    <span className={"stat-tile-foot" + (foot.tone ? ` is-${foot.tone}` : "")}>
      <span className="stat-tile-foot-stat">
        {foot.icon && <Icon name={foot.icon} size={16} aria-hidden="true" />}
        {foot.text}
      </span>
      {foot.link && (
        <span className="stat-tile-foot-link">
          {/* คำว่า "ดูรายละเอียด" ซ่อนได้ตอนกล่องแคบ (CSS) เหลือแต่ลูกศร —
              ทั้งกล่องเป็นลิงก์อยู่แล้ว ลูกศรจึงบอกทางได้ครบโดยไม่เบียดตัวเลขย่อย */}
          <span className="stat-tile-foot-word">{foot.link}</span>
          <Icon name="chevron" size={15} aria-hidden="true" />
        </span>
      )}
    </span>
  );

  /* กล่องสรุปไม่มีไอคอนแล้ว (ผู้ใช้สั่งเอาออก) — เหลือ ป้าย → ตัวเลข → คำอธิบาย → แถบท้าย
     ให้หัวข้อกับตัวเลขเด่นเต็มที่ **อย่าใส่ไอคอนกลับเข้ามาอีก**
     แถวกลางจองความสูงไว้เสมอ ทุกใบจึงอยู่ระดับเดียวกันแม้ใบที่ไม่มีตัวเลข */
  /* ปุ่มรองอยู่ท้ายไทล์ ที่เดียวกับแถบสรุป — กดที่อื่นของกล่อง = ไปหน้ารวมของกล่องนั้น
     กดแถบนี้ = เปิดป๊อบอัพเลือกฟาร์ม (ปุ่มลอยอยู่เหนือแผ่นลิงก์ด้วย z-index) */
  const pickStrip = pick && (
    <button
      type="button"
      className={"stat-tile-foot stat-tile-pick" + (pick.tone ? ` is-${pick.tone}` : "")}
      onClick={pick.onClick}
      aria-haspopup="dialog"
    >
      <span className="stat-tile-foot-stat">
        <Icon name="pin" size={16} aria-hidden="true" />
        {pick.label}
      </span>
      <span className="stat-tile-foot-link" aria-hidden="true">
        <Icon name="chevron" size={15} />
      </span>
    </button>
  );

  const bottom = pickStrip ?? footStrip;

  /* ชื่อกล่อง + ป้ายบอกที่มาของตัวเลข — ป้ายอยู่ติดชื่อ ไม่ใช่ลอยมุมกล่อง
     เพราะคนอ่านชื่อกล่องก่อนอ่านตัวเลขเสมอ ป้ายจึงต้องอยู่ในสายตาเดียวกัน

     **ห่อด้วย span ใบใหม่ ไม่ได้ยัดป้ายเข้าไปใน .stat-tile-label**
     คลาสนั้นมีหลายหน้ากำหนดขนาดตัวอักษรทับไว้ (หน้าภาพรวมใช้ text-xl, หน้ากล้องใช้อีกค่า)
     ถ้าเปลี่ยนมันเป็น flex ป้ายจะรับ font-weight 800 มาด้วยและกระทบทุกหน้าที่ใช้ไทล์ */
  const labelLine = source ? (
    <span className="stat-tile-labels">
      <span className="stat-tile-label">{label}</span>
      <DataSourceBadge source={source} />
    </span>
  ) : (
    <span className="stat-tile-label">{label}</span>
  );

  const body = isRow ? (
    <>
      <span className="stat-tile-head">
        <span className="stat-tile-body">
          {labelLine}
          {middle}
        </span>
      </span>
      {deltaLine}
      {bottom}
    </>
  ) : (
    <>
      <span className="stat-tile-top">{labelLine}</span>
      {middle}
      {deltaLine}
      {bottom}
    </>
  );

  const rowClass = isRow ? " is-row" : "";
  /* สีประจำหมวดทาทั้งใบ — พื้นไล่สีอ่อน ๆ + ขอบสีเดียวกัน + เงาเรืองใต้กล่อง */
  const toneClass = tone ? ` is-tint is-tint-${tone}` : "";

  /* ไทล์ที่มีทั้งทางลัดไปอีกหน้าและปุ่มรองในใบเดียวกัน
     ลิงก์เป็นแผ่นใสคลุมทั้งใบ (ไม่ได้ห่อเนื้อหา) ปุ่มรองจึงลอยอยู่เหนือมันได้
     — ปุ่มซ้อนอยู่ในลิงก์เป็น HTML ที่ไม่ถูกต้อง กดพลาดง่าย และโปรแกรมอ่านหน้าจออ่านสับสน */
  if (to && (pick || foot)) {
    return (
      <Card
        className={"stat-tile stat-tile-button has-cover" + rowClass + toneClass}
      >
        <Link to={to} className="stat-tile-cover">
          {/* ชื่อของลิงก์สำหรับโปรแกรมอ่านหน้าจอ — บอกปลายทาง ไม่ใช่อ่านชื่อกล่องซ้ำ */}
          <span className="sr-only">{t("เปิดหน้า{label} ของทุกฟาร์ม", { label })}</span>
        </Link>
        {body}
      </Card>
    );
  }

  /* ไทล์ที่เป็นทางลัดไปอีกหน้า — หน้าตาเหมือนไทล์ที่กดได้ทุกอย่าง */
  if (to) {
    return (
      <Link to={to} className={"card stat-tile stat-tile-button" + rowClass + toneClass}>
        {body}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        className={
          "card stat-tile stat-tile-button" +
          rowClass +
          toneClass +
          (active ? " is-active" : "")
        }
        onClick={onClick}
        aria-pressed={haspopup ? undefined : active}
        aria-haspopup={haspopup ? "dialog" : undefined}
      >
        {body}
      </button>
    );
  }

  return <Card className={"stat-tile" + rowClass + toneClass}>{body}</Card>;
}
