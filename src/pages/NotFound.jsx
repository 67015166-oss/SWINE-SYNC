/**
 * หน้าที่โผล่เมื่อ URL ไม่ตรงกับเส้นทางไหนเลย
 *
 * ก่อนหน้านี้ไม่มีหน้านี้ — react-router ไม่เจอเส้นทางก็ไม่ render อะไรเลย
 * ผู้ใช้ที่พิมพ์ URL ผิดหรือกดลิงก์เก่าจึงเจอ **จอขาวเปล่า ๆ** ไม่มีเมนูให้กดกลับ
 * (เจอจริงตอนไล่เส้นทาง: /dashboard/nope ได้หน้าเปล่าและ warning ใน console เท่านั้น)
 *
 * ใช้ทั้งในและนอก AppLayout — ในแดชบอร์ดมีเมนูข้างบนให้อยู่แล้วและเนื้อหาถูกจัดขอบให้
 * ส่วนนอกแดชบอร์ด (เช่น /อะไรก็ไม่รู้) ไม่มีทั้งเมนูและขอบ จึงต้องส่ง `bare` มาเพื่อ
 * ให้ห่อกรอบขอบให้เอง ไม่งั้นการ์ดจะแปะติดขอบจอทั้งสองข้าง
 */
import { Link, useLocation } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader.jsx";
import Card from "../components/ui/Card.jsx";
import Icon from "../components/ui/Icon.jsx";
import { OVERVIEW_PATH } from "../lib/theme/themes.js";
import "./NotFound.css";
import { useT } from "../lib/i18n/useT.js";

/** @param {{ bare?: boolean }} props `bare` = ไม่ได้อยู่ใน AppLayout ต้องจัดขอบเอง */
export default function NotFound({ bare = false }) {
  const t = useT();
  const { pathname } = useLocation();

  const body = (
    <>
      <PageHeader title={t("ไม่พบหน้านี้")} subtitle={t("ที่อยู่ที่เรียกมาไม่ตรงกับหน้าไหนในระบบ")} />

      <Card title={t("ที่อยู่ไม่ถูกต้อง")} icon="warn">
        <p className="fx-empty">
          {t("ไม่มีหน้าที่ที่อยู่ “{path}” — ลิงก์อาจเก่าไปแล้วหรือพิมพ์ตกไปบางตัว", { path: pathname })}
        </p>
        <p className="fx-empty">
          <Link to={OVERVIEW_PATH}>
            <Icon name="home" size={18} aria-hidden="true" /> {t("กลับไปหน้าภาพรวม")}
          </Link>
        </p>
      </Card>
    </>
  );

  return bare ? <div className="nf-bare">{body}</div> : body;
}
