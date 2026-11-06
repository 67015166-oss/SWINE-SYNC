/**
 * ปลายทางของเมนู "โรงเรือน" (`BARNS_HOME`) — ไม่ใช่หน้าจริง แต่เป็นตัวเลือกฟาร์มให้
 *
 * เมนูนี้ต้องพาไปหน้ารายการโรงเรือนของ "ฟาร์มสักฟาร์ม" แต่ฟาร์มไหนบอกล่วงหน้าไม่ได้
 * เพราะผู้ใช้เพิ่ม/ลบฟาร์มเองได้ตลอด — เดิมผูกไว้กับฟาร์มแรกของข้อมูลตัวอย่างตายตัว
 * พอผู้ใช้ลบฟาร์มนั้น เมนู "โรงเรือน" ที่อยู่ทุกหน้าก็พาไปหน้า "ไม่พบฟาร์มนี้"
 *
 * ที่นี่จึงอ่านรายการฟาร์มที่มีอยู่จริงตอนนั้นแล้วส่งต่อไปฟาร์มแรกของรายการ
 * (`replace` เพราะไม่ควรค้างใน history — กดย้อนกลับแล้วจะวนกลับมาที่นี่ไม่จบ)
 */
import { Link, Navigate } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader.jsx";
import Card from "../components/ui/Card.jsx";
import { useAllFarms } from "../lib/records/useAllFarms.js";
import { useT } from "../lib/i18n/useT.js";

export default function BarnsHome() {
  const t = useT();
  const { farms } = useAllFarms();
  const first = farms[0];

  if (first) return <Navigate to={`/dashboard/farms/${first.id}`} replace />;

  /* ลบฟาร์มไปจนไม่เหลือสักฟาร์ม — ไม่มีอะไรให้ส่งต่อ บอกตรง ๆ พร้อมทางไปเพิ่มฟาร์ม */
  return (
    <>
      <PageHeader title={t("โรงเรือน")} subtitle={t("ยังไม่มีฟาร์มในระบบ")} />
      <Card title={t("ยังไม่มีฟาร์มให้ดูโรงเรือน")} icon="home">
        <p className="fx-empty">
          {t("โรงเรือนทุกหลังอยู่ภายใต้ฟาร์ม —")}{" "}
          <Link to="/dashboard/farms">{t("เพิ่มฟาร์มก่อน")}</Link>{" "}
          {t("แล้วค่อยกลับมาที่เมนูนี้")}
        </p>
      </Card>
    </>
  );
}
