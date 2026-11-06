/**
 * ทางเปลี่ยนเส้นทางของหน้าเก่า `/dashboard/climate/:farmId/:barnId`
 *
 * หน้านั้นชื่อ "ระบบควบคุมสภาพแวดล้อม" เหมือนกับ `/dashboard/environment` เป๊ะ ๆ
 * และมีการ์ดชุดเดียวกันเกือบทั้งหน้า (ควบคุมอุปกรณ์ · ระบบไฟฟ้า · ผังเซนเซอร์ · แจ้งเตือน)
 * ผู้ใช้จึงงงว่าทำไมมีสองหน้า — จึงยุบเหลือหน้าเดียว (ดู docs/TASKS.md T1.140)
 * ของที่หน้าเก่ามีอยู่หน้าเดียว (เทียบโรงเรือน · สรุปสูงสุด/ต่ำสุด/เฉลี่ย) ย้ายไปหน้าใหม่แล้ว
 *
 * **ทำไมต้องเปลี่ยนเส้นทาง ไม่ลบ route ทิ้งเฉย ๆ**: มีลิงก์ชี้มาที่นี่อยู่ 6 จุดในระบบ
 * (การ์ดแจ้งเตือน · ตารางหน้าอุณหภูมิรวม · ป๊อบอัพเลือกโรงเรือน · ผู้ช่วย · ช่องค้นหา)
 * และผู้ใช้อาจบุ๊กมาร์กไว้ ลบทิ้งเลยจะกลายเป็นหน้า 404 โดยไม่มีเหตุผลให้เข้าใจ
 *
 * `replace` เพื่อไม่ให้ค้างอยู่ในประวัติ — กดย้อนกลับแล้วจะได้ไม่วนกลับมาเปลี่ยนเส้นทางซ้ำ
 */
import { Navigate, useParams } from "react-router-dom";

export default function ClimateRedirect() {
  const { farmId, barnId } = useParams();
  const query = new URLSearchParams();
  if (farmId) query.set("farm", farmId);
  if (barnId) query.set("barn", barnId);

  return <Navigate to={`/dashboard/environment?${query}`} replace />;
}
