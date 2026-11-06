import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";

/**
 * เส้นทางหน้าเก็บไว้ที่ไหน — ปกติอยู่ในพาธ (`/dashboard/alerts`)
 * แต่ตอน build ไปวางบนโฮสต์คนอื่น ให้เก็บไว้หลัง `#` แทน (`#/dashboard/alerts`)
 *
 *   VITE_ROUTER=hash npm run build
 *
 * **ทำไมต้องมีโหมดนี้** (เจอของจริง 2 ก.ย. 2569 ตอนเอาขึ้น lab.plotnexuslab.com):
 *   1. โฮสต์วางแอปไว้ในโฟลเดอร์ย่อยที่เราไม่รู้ชื่อล่วงหน้า และเขาแก้พาธไฟล์ให้เอง
 *      เราจึงตั้ง base เป็นพาธเต็มไม่ได้ (ตัวอัปโหลดจะหาไฟล์ไม่เจอแล้วปฏิเสธ)
 *   2. เส้นทางที่อยู่หลัง `#` ไม่เคยถูกส่งไปถึงเซิร์ฟเวอร์ จึงกด F5 ที่หน้าลึกได้
 *      โดยโฮสต์ไม่ต้องตั้ง fallback ให้ — ซึ่งเป็นสิ่งที่เราสั่งโฮสต์คนอื่นไม่ได้อยู่แล้ว
 *
 * ที่รันในเครื่องยังเป็นแบบเดิม (พาธสวย ไม่มี `#`) เพราะไม่ได้ตั้งค่านี้
 */
const USE_HASH = import.meta.env.VITE_ROUTER === "hash";
const Router = USE_HASH ? HashRouter : BrowserRouter;

/* ตัดทับท้ายออก — react-router ต้องการ "/p/mew/dashboard" ไม่ใช่ "/p/mew/dashboard/"
   โหมด hash ไม่ต้องใช้ค่านี้ เพราะพาธของหน้าไม่เคยเปลี่ยน */
const ROUTER_BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "") || "/";
import "./styles/base.css";
import App from "./App.jsx";
import ErrorBoundary from "./components/ui/ErrorBoundary.jsx";
import { AuthProvider } from "./lib/auth/AuthProvider.jsx";
import { LangProvider } from "./lib/i18n/LangProvider.jsx";
import { ThemeProvider } from "./lib/theme/ThemeProvider.jsx";
import { SettingsProvider } from "./lib/settings/SettingsProvider.jsx";
import { LayoutProvider } from "./lib/layout/LayoutProvider.jsx";
import { AdjustProvider } from "./lib/adjust/AdjustProvider.jsx";
import { RecordsProvider } from "./lib/records/RecordsProvider.jsx";
import { LiveFarmsProvider } from "./lib/api/LiveFarmsProvider.jsx";
import { SidebarProvider } from "./lib/nav/SidebarProvider.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {/* ตาข่ายรับ error อยู่นอกสุดจริง ๆ — ครอบ Provider ทุกตัว จึงกันจอขาวได้แม้ Provider เองพัง */}
    <ErrorBoundary>
      {/* สิทธิ์การใช้งานอยู่นอกกว่าทุก Provider ที่เขียนข้อมูล — RecordsProvider กับ
          SettingsProvider ต้องอ่านสิทธิ์ได้เพื่อกันการเขียนที่ไม่ได้รับอนุญาต
          (ดู lib/auth/roles.js — คนละเรื่องกับ "ธีมบทบาท" ใน ThemeProvider) */}
      <AuthProvider>
        {/* ภาษาอยู่นอกสุดของฝั่งการแสดงผล — ทุกอย่างที่มีข้อความ (รวมทั้ง format ตัวเลข/วันที่) อ่านจากตัวนี้ */}
        <LangProvider>
          {/* ครอบนอกสุดทั้งคู่ — เมนู กล่องสรุป โหมดสี และการตั้งค่าอ่านค่าจากสองตัวนี้ */}
          <SettingsProvider>
            <ThemeProvider>
              {/* เลย์เอาต์ที่ผู้ใช้จัดเอง — เก็บคนละคีย์กับธีมและการตั้งค่า */}
              <LayoutProvider>
                {/* จำนวนที่ผู้ใช้ปรับเอง (เพิ่ม/ลดสุกร) — เก็บคนละคีย์กับอย่างอื่น */}
                <AdjustProvider>
                  {/* ฟาร์ม/โรงเรือนที่ผู้ใช้เพิ่มเอง — วางไว้ในสุดเพราะอ่านค่าจากตัวอื่นไม่ได้ */}
                  <RecordsProvider>
                    {/* ฟาร์มที่มีเซนเซอร์จริงต่ออยู่ — อยู่ในสุดเพราะ useAllFarms
                        ต้องอ่านทั้งของจริงและของที่ผู้ใช้เพิ่มเองพร้อมกัน
                        หลังบ้านล่มก็ยังใช้แอปต่อได้ ข้อมูลตัวอย่างไม่หายไปไหน */}
                    <LiveFarmsProvider>
                      {/* `basename` = โฟลเดอร์ที่แอปไปวางอยู่ อ่านจากค่าเดียวกับที่ตั้งตอน build
                          ไม่ตั้งค่านี้ ลิงก์ทุกอันจะชี้กลับรากโดเมน กดแล้วหลุดออกจากแอป
                          (ตอนรันปกติค่าเป็น "/" จึงไม่มีอะไรเปลี่ยน) */}
                      <Router basename={USE_HASH ? undefined : ROUTER_BASE}>
                        {/* แถบเมนูซ้ายเปิด/ปิด — ต้องอยู่ **ใน** BrowserRouter
                            เพราะแถบปิดตัวเองเมื่อเปลี่ยนหน้า ซึ่งต้องอ่าน useLocation ได้ */}
                        <SidebarProvider>
                          <App />
                        </SidebarProvider>
                      </Router>
                    </LiveFarmsProvider>
                  </RecordsProvider>
                </AdjustProvider>
              </LayoutProvider>
            </ThemeProvider>
          </SettingsProvider>
        </LangProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
