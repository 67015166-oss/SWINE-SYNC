import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout.jsx";
import TopNavLayout from "./components/layout/TopNavLayout.jsx";
import Login from "./pages/Login.jsx";
import Overview from "./pages/Overview.jsx";
import ClimateRedirect from "./pages/ClimateRedirect.jsx";
import NotFound from "./pages/NotFound.jsx";
import SettingsModal from "./components/settings/SettingsModal.jsx";
import RoleNotice from "./components/ui/RoleNotice.jsx";
import EditingBar from "./components/board/EditingBar.jsx";
import AppDock from "./components/dock/AppDock.jsx";
import { useT } from "./lib/i18n/useT.js";

/**
 * แบ่งไฟล์ตามหน้า — โหลดหน้าไหนค่อยดาวน์โหลดโค้ดของหน้านั้น
 *
 * ของเดิมรวมเป็นก้อนเดียว 1.19 MB (332 KB gzip) ทั้งที่คนเปิดมาเห็นแค่หน้าเข้าสู่ระบบ
 * recharts กับอีก 15 หน้าถูกดาวน์โหลดทิ้งไว้ตั้งแต่วินาทีแรกโดยไม่ได้ใช้
 *
 * **ยกเว้นหน้าเข้าสู่ระบบกับหน้าภาพรวม** — สองหน้านี้คือสิ่งแรกที่คนเห็นเสมอ
 * แยกไฟล์แล้วกลายเป็นต้องรออีกหนึ่งรอบเน็ตก่อนเห็นอะไร ซึ่งช้ากว่าเดิม
 */
const Farms = lazy(() => import("./pages/Farms.jsx"));
const PigTypes = lazy(() => import("./pages/PigTypes.jsx"));
const PigTypeDetail = lazy(() => import("./pages/PigTypeDetail.jsx"));
const ClimateAll = lazy(() => import("./pages/ClimateAll.jsx"));
const Cameras = lazy(() => import("./pages/Cameras.jsx"));
const Alerts = lazy(() => import("./pages/Alerts.jsx"));
const FarmBarns = lazy(() => import("./pages/FarmBarns.jsx"));
const BarnsHome = lazy(() => import("./pages/BarnsHome.jsx"));
const BarnDetail = lazy(() => import("./pages/BarnDetail.jsx"));
const Herd = lazy(() => import("./pages/Herd.jsx"));
const Feed = lazy(() => import("./pages/Feed.jsx"));
const Environment = lazy(() => import("./pages/Environment.jsx"));
const Weather = lazy(() => import("./pages/Weather.jsx"));
const Finance = lazy(() => import("./pages/Finance.jsx"));
const BarnCompare = lazy(() => import("./pages/BarnCompare.jsx"));
const Users = lazy(() => import("./pages/Users.jsx"));
const Twin = lazy(() => import("./pages/Twin.jsx"));
const ShiftReport = lazy(() => import("./pages/ShiftReport.jsx"));
const Voice = lazy(() => import("./pages/Voice.jsx"));
const GuideDiseases = lazy(() => import("./pages/guide/Diseases.jsx"));
const GuideFarmy = lazy(() => import("./pages/guide/FarmyData.jsx"));
const GuideChecklist = lazy(() => import("./pages/guide/Checklist.jsx"));
const GuideCleaning = lazy(() => import("./pages/guide/Cleaning.jsx"));
const GuideBreeding = lazy(() => import("./pages/guide/Breeding.jsx"));
const GuideFeedMix = lazy(() => import("./pages/guide/FeedMix.jsx"));

/**
 * "/" และ "/login" = หน้าเข้าสู่ระบบ (หน้าแรกของระบบ ไม่มี sidebar)
 * "/dashboard/*" = แดชบอร์ดหลังเข้าสู่ระบบ ทุกหน้าอยู่ใน AppLayout
 *
 * การตั้งค่าไม่ใช่หน้า แต่เป็นป๊อบอัพที่อยู่นอกตาราง route — เปิดทับหน้าไหนก็ได้
 * ผู้ใช้จึงไม่เสียที่ที่ดูอยู่ไปตอนไปปรับค่า
 */
/** ข้อความระหว่างดาวน์โหลดไฟล์ของหน้า — แยกเป็น component เพราะต้องใช้ hook แปลภาษา (T2.1) */
function PageLoading() {
  const t = useT();
  return <p className="app-loading">{t("กำลังโหลดหน้า…")}</p>;
}

export default function App() {
  return (
    <>
      {/* กันจอขาวระหว่างดาวน์โหลดไฟล์ของหน้าที่แบ่งออกไป — ต้องมีคู่กับ lazy() เสมอ
          ข้อความสั้น ๆ พอ เพราะปกติเห็นไม่ถึงเสี้ยววินาที (ไฟล์เล็กและอยู่เครื่องเดียวกัน) */}
      <Suspense fallback={<PageLoading />}>
      <Routes>
        {/* หน้าแรกของระบบคือหน้าเข้าสู่ระบบ (คงเส้นทาง /login ไว้ด้วยกันลิงก์เก่าพัง) */}
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />


        {/* ★ ตู้กลางไม่ได้อยู่ในแอปนี้แล้ว — เป็นเว็บคนละตัวที่ `/hub` (T1.347)
            มี entry ของตัวเองที่ `hub.html` + `src/hub/main.jsx`
            อย่าเพิ่มเส้นทาง /hub กลับมาที่นี่ จะทำให้คนที่เปิดตู้กลางหลุดมาเจอแดชบอร์ด */}

        {/* หน้าภายในโรงเรือนมีแถบเมนูด้านซ้ายเป็นของตัวเอง จึงไม่ได้อยู่ใน AppLayout */}
        <Route path="/dashboard/farms/:farmId/barns/:barnId" element={<BarnDetail />} />
        {/* หน้ารายละเอียดสุกรรายประเภทยังใช้แถบเมนูซ้ายของตัวเอง (SideLayout) */}
        <Route path="/dashboard/pigs/:typeId" element={<PigTypeDetail />} />
        {/* เส้นทางเก่าของหน้าติดตามสภาพแวดล้อมรายโรงเรือน — ยุบไปรวมกับหน้า environment
            แล้ว (T1.140) เหลือ route นี้ไว้เปลี่ยนเส้นทาง ลิงก์เก่าจะได้ไม่พัง */}
        <Route path="/dashboard/climate/:farmId/:barnId" element={<ClimateRedirect />} />
        {/* หน้าภาพรวมใช้โครง "แถบเมนูบน" แยกจากหน้าอื่น — ผู้ใช้ขอให้เป็นแบบเดิม
            (31 ส.ค. 2569) เพราะเป็นหน้าแรกของระบบและออกแบบมาให้กว้างเต็มจอ
            ต้องประกาศ **ก่อน** กลุ่ม AppLayout ด้านล่าง ไม่งั้น index ของกลุ่มนั้นจะชนะ */}
        <Route path="/dashboard" element={<TopNavLayout />}>
          <Route index element={<Overview />} />
        </Route>

        {/* หน้าที่เหลือใช้แถบเมนูซ้ายร่วมกันทั้งหมด (T1.171) */}
        <Route path="/dashboard" element={<AppLayout />}>
          <Route path="farms" element={<Farms />} />
          <Route path="farms/:farmId" element={<FarmBarns />} />
          {/* เมนู "โรงเรือน" ชี้มาที่นี่ แล้วส่งต่อไปฟาร์มแรกที่ยังมีอยู่จริง (ดู BARNS_HOME) */}
          <Route path="barns" element={<BarnsHome />} />
          {/* หน้าจำนวนสุกรทั้งหมดใช้แถบเมนูบนเหมือนหน้าอื่นในกลุ่มนี้ */}
          <Route path="pigs" element={<PigTypes />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="herd" element={<Herd />} />
          <Route path="feed" element={<Feed />} />
          <Route path="climate" element={<ClimateAll />} />
          {/* ผนังกล้องของทุกฟาร์ม — ปลายทางของกล่องสรุป "กล้อง AI" ในหน้าภาพรวม */}
          <Route path="cameras" element={<Cameras />} />
          {/* กล้องทุกตัวของโรงเรือนหลังเดียว — ปลายทางของการกดใบใดใบหนึ่งบนผนังกล้อง
              (ใช้คอมโพเนนต์เดียวกัน ต่างกันแค่ขอบเขตข้อมูล) */}
          <Route path="cameras/:farmId/:barnId" element={<Cameras />} />
          <Route path="environment" element={<Environment />} />
          {/* สภาพอากาศจากเสาอากาศนอกโรงเรือน — คู่กับหน้า environment ที่เป็นอากาศในเล้า
              (ผู้ใช้สั่งให้แยกเป็นคนละหน้า 9 ก.ย. 2569) */}
          <Route path="weather" element={<Weather />} />
          {/* เทียบโรงเรือนทุกหลังในฟาร์มเดียวกัน — ปลายทางของปุ่ม "ดูการเปรียบเทียบ"
              ในการ์ด "เทียบกับโรงเรือนอื่น" ของหน้าสภาพแวดล้อม
              อยู่ใต้ /dashboard/environment โดยตั้งใจ เมนูซ้ายจะได้ยังสว่างที่หน้าเดิม
              (NavLink จับเส้นทางลูกให้อยู่แล้ว) — คนจะได้รู้ว่ายังอยู่ในเรื่องเดียวกัน */}
          <Route path="environment/compare" element={<BarnCompare />} />
          <Route path="finance" element={<Finance />} />
          {/* จัดการผู้ใช้ — ผู้ดูแลระบบเท่านั้น (หน้าเช็คสิทธิ์เอง แล้วขึ้นเหตุผลถ้าไม่มีสิทธิ์
              ไม่ใช่ 404 ตามกติกา "ห้ามซ่อนความสามารถทิ้งเฉย ๆ" ใน CLAUDE.md)
              ด่านจริงอยู่ที่หลังบ้าน — /api/users/* ปฏิเสธ token ที่ไม่ใช่แอดมิน */}
          <Route path="users" element={<Users />} />

          {/* แบบจำลองโรงเรือน — ชั้นที่ 1 "เห็นสถานะจริง" (T1.260)
              อ่านจากหลังบ้านของเราเอง ไม่ใช่ PlotNexus ที่ถูกถอนสิทธิ์ */}
          <Route path="twin" element={<Twin />} />
          <Route path="shift-report" element={<ShiftReport />} />
          {/* Voice AI ของอีกทีม ฝังไว้ในแดชบอร์ด — ปลายทางของปุ่มไมค์บนแถบบนและในแชท
              (เดิมเปิดแท็บใหม่ ผู้ใช้สั่งให้อยู่ในแดชบอร์ด 14 ก.ย. 2569) */}
          <Route path="voice" element={<Voice />} />
          <Route path="guide/diseases" element={<GuideDiseases />} />
          <Route path="guide/farmy" element={<GuideFarmy />} />
          <Route path="guide/checklist" element={<GuideChecklist />} />
          <Route path="guide/cleaning" element={<GuideCleaning />} />
          <Route path="guide/breeding" element={<GuideBreeding />} />
          <Route path="guide/feed-mix" element={<GuideFeedMix />} />
          {/* ที่อยู่ในแดชบอร์ดที่ไม่ตรงหน้าไหน — ยังอยู่ใน AppLayout จึงมีเมนูให้กดกลับ */}
          <Route path="*" element={<NotFound />} />
        </Route>
        {/* ที่อยู่นอกแดชบอร์ดที่ไม่ตรงหน้าไหน — ไม่งั้นได้จอขาวเปล่าที่ไม่มีทางออก
            (ไม่มี AppLayout มาจัดขอบให้ จึงต้องบอกให้หน้านั้นจัดขอบเอง) */}
        <Route path="*" element={<NotFound bare />} />
      </Routes>
      </Suspense>

      {/* ป๊อบอัพตั้งค่า — มีตัวเดียวทั้งแอป เปิดจากปุ่มเฟืองของทุกโครงหน้า
          (state อยู่ที่ SettingsProvider เพราะมีปุ่มเรียกจากหลายที่) */}
      <SettingsModal />

      {/* ประกาศ "ผู้ดูแลระบบเปลี่ยนสิทธิ์ของคุณแล้ว" — AuthProvider ถามเซิร์ฟเวอร์ซ้ำระหว่างใช้งาน (T1.257)
          อยู่นอก <Routes> จึงเห็นได้ทุกหน้า รวมหน้าเข้าสู่ระบบตอนถูกออกจากระบบ */}
      <RoleNotice />

      {/* แถบลอย "กำลังจัดเลย์เอาต์" — โผล่เฉพาะตอนจัด เป็นทางออกจากโหมดจัด
          เพราะปุ่มเปิดโหมดอยู่ในป๊อบอัพตั้งค่าซึ่งปิดตัวเองไปตอนเริ่มจัด */}
      <EditingBar />

      {/* แถบลอยล่างจอ: ผู้ช่วย AI (แชท) + Voice AI (สั่งงานด้วยเสียง) — ผู้ใช้สั่งให้รวมไว้ที่เดียว
          อยู่นอก <Routes> เพราะต้องติดอยู่ทุกหน้าเหมือนกันหมด และห้องแชทต้องไม่ถูกถอด
          ตอนเปลี่ยนหน้า (ประวัติการคุยจะหาย) — ตัวมันเองเป็นคนตัดสินว่าไม่โผล่ที่หน้าเข้าสู่ระบบ */}
      <AppDock />
    </>
  );
}
