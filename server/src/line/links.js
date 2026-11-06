/**
 * ลิงก์ไปหน้าต่าง ๆ ของเว็บแดชบอร์ด (T1.277) — ฟังก์ชันล้วน ไม่ import อะไรเลย
 *
 * **เว็บที่โฮสต์ไว้ใช้ HashRouter** (build ด้วย `npm run build:host`) เส้นทางจึงต้องมี `#` คั่นเสมอ
 *   https://lab.plotnexuslab.com/p/mew/dashboard/#/dashboard/alerts
 * ถ้าลืม `#` จะได้หน้า 404 ของโฮสต์ ไม่ใช่หน้าเรา — เคยพลาดมาแล้วตอน T1.221
 *
 * ไม่ได้ตั้ง `DASHBOARD_URL` = คืน null แล้วให้การ์ดไม่ต้องมีปุ่ม
 * (ปุ่มที่กดแล้วไปไหนไม่ได้แย่กว่าการไม่มีปุ่ม)
 */

/** หน้าที่ลิงก์ถึงได้ — ชื่อสั้น ๆ ไว้ให้ที่อื่นเรียกใช้ จะได้ไม่ต้องจำเส้นทางเต็ม */
export const PAGES = {
  home: "/dashboard",
  alerts: "/dashboard/alerts",
  environment: "/dashboard/environment",
  pigs: "/dashboard/pigs",
  barns: "/dashboard/barns",
  report: "/dashboard/shift-report",
};

/**
 * @param {string} page เส้นทางในแอป เช่น "/dashboard/alerts" (หรือชื่อย่อใน PAGES)
 * @param {string} [base] ค่าจาก DASHBOARD_URL
 * @returns {string|null}
 */
export function dashLink(page, base = process.env.DASHBOARD_URL) {
  const root = String(base ?? "").trim();
  if (!root) return null;
  const path = PAGES[page] ?? page;
  const clean = path.startsWith("/") ? path : `/${path}`;

  /* ตั้งค่ามาเป็นแบบมี # อยู่แล้ว (เช่นชี้ไปหน้าใดหน้าหนึ่งไว้) — เอาเฉพาะส่วนหน้า # มาใช้ */
  const [origin] = root.split("#");
  return `${origin.replace(/\/+$/, "")}/#${clean}`;
}
