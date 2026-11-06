/**
 * ตู้กลาง — จุดเริ่มของ **เว็บคนละตัว** กับแดชบอร์ดฟาร์ม (T1.347)
 *
 * ═══ ★ ทำไมถึงเป็นคนละแอป ไม่ใช่แค่คนละหน้า ═══
 * หัวหน้าสั่งให้แยก (27 ต.ค. 2569) และตอนทำเป็นแค่เส้นทางหนึ่งในแอปเดิม
 * ผู้ใช้ยัง "เจอแดชบอร์ด" อยู่ดี — ล็อกอินหน้าเดียวกัน เมนูเดียวกัน กดพลาดก็หลุดเข้าไป
 *
 * ไฟล์นี้จึงเป็น entry ที่สองของ Vite (`hub.html`) ได้ไฟล์ JS คนละก้อน
 * คนที่เปิดตู้กลางจะ **ไม่โหลดโค้ดของแดชบอร์ดเลยแม้แต่บรรทัดเดียว**
 *
 * ═══ Provider ที่ตัดออกและเหตุผล ═══
 *   LayoutProvider · AdjustProvider · RecordsProvider · LiveFarmsProvider · SidebarProvider
 *   ทั้งหมดเป็นเรื่องของฟาร์ม (กระดานจัดเลย์เอาต์ · จำนวนสุกร · ฟาร์มที่ผู้ใช้เพิ่มเอง · เมนูซ้าย)
 *   ตู้กลางไม่ได้ใช้สักตัว และ LiveFarmsProvider ยังยิง API หาข้อมูลฟาร์มทุกครั้งที่เปิดด้วย
 *
 * ═══ ที่ยังใช้ร่วมกัน ═══
 *   AuthProvider (บัญชีชุดเดียวกัน) · LangProvider · ThemeProvider (โหมดมืด/สว่าง)
 *   เพราะเป็นระบบเดียวกันและคนเดียวกันดูแล แยกแล้วจะต้องดูแลสองชุดโดยไม่ได้อะไรเพิ่ม
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "../styles/base.css";
import HubApp from "./HubApp.jsx";
import ErrorBoundary from "../components/ui/ErrorBoundary.jsx";
import { AuthProvider } from "../lib/auth/AuthProvider.jsx";
import { LangProvider } from "../lib/i18n/LangProvider.jsx";
import { ThemeProvider } from "../lib/theme/ThemeProvider.jsx";
import { SettingsProvider } from "../lib/settings/SettingsProvider.jsx";

/* แอปนี้ถูกเสิร์ฟที่ `/hub` — บอก router ไว้ ไม่งั้นลิงก์ภายในจะชี้กลับรากโดเมน */
const ROUTER_BASE = "/hub";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <LangProvider>
          {/* ThemeProvider อ่านค่าจาก SettingsProvider จึงต้องอยู่ข้างใน */}
          <SettingsProvider>
            <ThemeProvider>
              <BrowserRouter basename={ROUTER_BASE}>
                <HubApp />
              </BrowserRouter>
            </ThemeProvider>
          </SettingsProvider>
        </LangProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
