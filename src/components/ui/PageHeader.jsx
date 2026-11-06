import "./ui.css";

/**
 * หัวหน้าแต่ละเพจ — ใช้ทุกหน้าเพื่อให้หน้าตาสม่ำเสมอ
 *
 * @param {string} title
 * @param {string} [subtitle]
 * @param {ReactNode} [action] ปุ่มระดับหน้า วางชิดขวาบรรทัดเดียวกับชื่อหน้า
 *                             (ใช้กับสิ่งที่ "เปลี่ยนทั้งหน้า" เช่นปุ่มเลือกฟาร์ม/โรงเรือน
 *                             ไม่ใช่ปุ่มที่ทำงานกับการ์ดใดการ์ดหนึ่ง — อันนั้นให้อยู่ในการ์ด)
 */
export default function PageHeader({ title, subtitle, action }) {
  return (
    <div className={"page-header" + (action ? " has-action" : "")}>
      <div className="page-header-text">
        <h1>{title}</h1>
        {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
