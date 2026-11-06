/**
 * หน้า "ภาพรวมทุกฟาร์ม" — หน้าแรกของแดชบอร์ด (/dashboard)
 * โครง: ฮีโร่ชื่อแบรนด์ → กล่องสรุป 4 กล่อง → การ์ดแผนที่ (ค้นหา/กรอง/รายชื่อฟาร์ม)
 *
 * เมนูและเมนูย่อยทั้งหมดอยู่ที่แถบเมนูบน (components/layout/AppLayout.jsx)
 * หน้านี้จึงเหลือแค่แผนที่กับกล่องสรุป
 *
 * กล่องสรุป 4 ใบไม่ตายตัว — ธีมบทบาทที่เลือกไว้เป็นตัวบอกว่าเอาใบไหนและเรียงยังไง
 * (ดู TILES ด้านล่าง แล้วดูว่าแต่ละบทบาทเลือกอะไรที่ src/lib/theme/themes.js)
 */
import { useMemo, useState } from "react";
import Icon from "../components/ui/Icon.jsx";
import StatTile from "../components/ui/StatTile.jsx";
import DataSourceNote from "../components/ui/DataSourceNote.jsx";
import FarmExplorer from "../components/map/FarmExplorer.jsx";
import { useFarmFilters } from "../components/map/useFarmFilters.js";
import PageBoard, { Block } from "../components/board/PageBoard.jsx";
import ClimatePicker from "../components/climate/ClimatePicker.jsx";
import AlertPicker from "../components/alerts/AlertPicker.jsx";
import FarmPicker from "../components/farms/FarmPicker.jsx";
import { useT } from "../lib/i18n/useT.js";
import { useSettings } from "../lib/settings/useSettings.js";
import { useAllFarms } from "../lib/records/useAllFarms.js";
import { useBarnCounts } from "../lib/records/useBarnCounts.js";
import { blendSource } from "../lib/records/dataSource.js";
import { useTheme } from "../lib/theme/useTheme.js";
import { summarizeFarms } from "../data/mock/farms.js";
import { feedDaily, feedStock } from "../data/mock/feed.js";
import { financeSummary } from "../data/mock/finance.js";
import { mortalityRate } from "../data/mock/herd.js";
import { sensorNow } from "../data/mock/environment.js";
import { readingStatus } from "../data/mock/climate.js";
import { allAlerts } from "../data/mock/alerts.js";
import { formatNumber, formatNumber1, formatDateTime } from "../lib/format.js";
import { updatedText } from "../lib/duration.js";
import "./Overview.css";
import { asset } from "../lib/asset.js";

/** รหัสกระดานของหน้านี้ — ใช้เป็นคีย์เก็บชุดเลย์เอาต์ (ดู lib/layout/presets.js) */
const BOARD_ID = "overview";

/* ตัวเลขของกล่องสรุปที่ไม่ได้มาจาก summarizeFarms — คำนวณครั้งเดียวตอนโหลดไฟล์ */
const lastFeed = feedDaily.at(-1);
const feedToday = Object.entries(lastFeed)
  .filter(([key]) => key !== "date")
  .reduce((sum, [, kg]) => sum + kg, 0);
const feedDaysLeft = Math.min(...feedStock.map((s) => s.daysLeft));
const lastMortality = mortalityRate.at(-1);
const barnsToWatch = sensorNow.filter((s) => s.status !== "good").length;

/**
 * ตัวเลขรวมของ "ฟาร์มที่มีอยู่จริงตอนนี้" — รวมฟาร์มที่ผู้ใช้เพิ่มเอง และไม่นับที่ลบไปแล้ว
 *
 * เดิมคำนวณครั้งเดียวตอนโหลดไฟล์จากข้อมูลตัวอย่าง ซึ่งขัดกับแผนที่บนหน้าเดียวกัน:
 * แผนที่กับรายชื่อฟาร์มอ่านรายการที่ผู้ใช้แก้แล้ว แต่กล่องสรุปยังเป็นตัวเลขชุดเดิม
 * เพิ่มฟาร์มแล้วหมุดขึ้นบนแผนที่ทันทีแต่กล่อง "ฟาร์มทั้งหมด" ยังนับเท่าเดิม (และลบก็เช่นกัน)
 */
const scopeStats = (farmList, barnsOf) => {
  const allBarns = farmList.flatMap((farm) => barnsOf(farm.id) ?? []);
  const liveBarns = allBarns.filter((barn) => barn.status !== "offline");

  /* กล้องของทุกฟาร์ม — โรงเรือนที่ออฟไลน์ไม่มีรายการกล้องเลย (cameras = [])
     "มีภาพ" จึงต้องนับจากจำนวนกล้องที่มีจริง ไม่ใช่จากสถานะอย่างเดียว */
  const camerasWithView = allBarns.filter(
    (barn) => barn.status !== "offline" && barn.cameras.length > 0
  );

  /* ค่าเฉลี่ยอุณหภูมิ/ความชื้นของ "ทุกโรงเรือนในทุกฟาร์ม" — กล่องสรุปโชว์ค่าจริงได้เลย
     ไม่ต้องให้ผู้ใช้เลือกฟาร์มก่อน (หน้าปลายทาง /dashboard/climate ใช้ชุดข้อมูลเดียวกัน)
     ไม่มีโรงเรือนเลยให้เป็น null — format คืนขีดกลางแทนที่จะเป็น NaN */
  const avg = (pick) =>
    liveBarns.length === 0
      ? null
      : liveBarns.reduce((sum, b) => sum + pick(b), 0) / liveBarns.length;
  const tempC = avg((b) => b.tempC);
  const humidity = avg((b) => b.humidity);

  /* ═══ ทุกหลังเงียพร้อมกัน → ค้างค่าเฉลี่ยล่าสุดไว้ (T1.345) ═══
     กล่องสรุปหน้านี้เคยขึ้นขีดกลางทั้งใบ บอกแค่ว่า "ไม่รู้" โดยไม่บอกว่าเมื่อกี้ยังรู้อยู่
     เฉลี่ยจากหลังที่ "เคยวัดได้" เท่านั้น — หลังที่ไม่มีเซนเซอร์เลยต้องไม่ถูกนับเข้าค่าเฉลี่ย */
  const heldAvg = (key) => {
    const vals = allBarns.map((b) => b.held?.[key]).filter((v) => v != null);
    return vals.length === 0 ? null : vals.reduce((sum, v) => sum + v, 0) / vals.length;
  };
  const heldAt = allBarns.map((b) => b.held?.at).filter(Boolean).sort().at(-1) ?? null;
  const climateHeld = tempC == null && heldAvg("tempC") != null;

  /* ═══ ที่มาของตัวเลขแต่ละกล่อง — คิดจากของที่มีจริงตอนนั้น ไม่เขียนตายตัว ═══
     กล่องสรุปหน้านี้เป็นตัวเลข**รวมทุกฟาร์ม** ซึ่งตอนนี้มีฟาร์มที่ต่อเซนเซอร์จริงอยู่ฟาร์มเดียว
     ก่อนหน้านี้ไม่มีอะไรบอกเลย คนจึงเห็น "กำไรเดือนล่าสุด" แล้วเข้าใจว่าเป็นเลขของฟาร์มตัวเอง
     คิดสด ๆ แบบนี้เพื่อให้วันที่ต่อเซนเซอร์ฟาร์มที่สอง หรือลบฟาร์มตัวอย่างออก ป้ายเปลี่ยนเอง */
  const realFarms = farmList.filter((f) => f.dataSource === "live");
  const sampleFarms = farmList.filter((f) => f.dataSource !== "live");
  const barnsOfFarms = (list) => list.flatMap((f) => barnsOf(f.id) ?? []);
  const realBarns = barnsOfFarms(realFarms);
  const sampleBarns = barnsOfFarms(sampleFarms);
  const online = (barns) => barns.filter((b) => b.status !== "offline");
  const camCount = (barns) => barns.reduce((n, b) => n + b.cameras.length, 0);
  const some = (list, pick) => list.some((x) => pick(x) != null && pick(x) !== 0);

  return {
    summary: summarizeFarms(farmList),
    allBarns,
    liveBarns,
    cameras: {
      total: allBarns.reduce((sum, barn) => sum + barn.cameras.length, 0),
      live: camerasWithView.length,
      noSignal: allBarns.length - camerasWithView.length,
    },
    climateAvg: {
      tempC: tempC ?? heldAvg("tempC"),
      humidity: (() => {
        const v = humidity ?? heldAvg("humidity");
        return v == null ? null : Math.round(v);
      })(),
      /* หน้าจออ่านสองค่านี้เพื่อติดป้ายอายุ — ห้ามโชว์ค่าค้างเงียบ ๆ */
      held: climateHeld,
      heldAt,
    },
    sources: {
      /* จำนวนฟาร์ม/โรงเรือน: นับของที่มีอยู่ในระบบจริง ๆ ทั้งสองแบบจึงปนกัน */
      farms: blendSource(realFarms.length > 0, sampleFarms.length > 0),
      /* จำนวนสุกร: ใช้เฉพาะตอนที่ยังนับจากบันทึกไม่ได้สักเล้า (T1.338)
         ปกติกล่องนี้ติดป้ายตามแหล่งของเลขที่นับได้จริง — ดู `PIG_SOURCE` ข้างล่าง
         `f.pigs` ของฟาร์มจริงเป็น null เสมอ ทางนี้จึงได้ "demo" แทบตลอด ซึ่งถูกแล้ว */
      pigs: blendSource(some(realFarms, (f) => f.pigs), some(sampleFarms, (f) => f.pigs)),
      climate: blendSource(online(realBarns).length > 0, online(sampleBarns).length > 0),
      cameras: blendSource(camCount(realBarns) > 0, camCount(sampleBarns) > 0),
      /* แจ้งเตือน: ทั้งยอดรวมและจำนวนวิกฤตนับจากทุกฟาร์มแล้ว (T1.283 แก้ให้มาจากแหล่งเดียวกัน) */
      alerts: blendSource(some(realFarms, (f) => f.alerts), some(sampleFarms, (f) => f.alerts)),
    },
  };
};

/**
 * แหล่งที่ `barnCountTotal` รายงาน → ป้ายบอกที่มาบนกล่องสรุป (T1.338)
 *
 * ★ `local` ไม่ยุบไปเป็น `live` หรือ `demo` — เลขที่กรอกไว้ในเครื่องนี้ไม่ใช่ข้อมูลสมมติ
 *   (คนกรอกเองจริง) แต่ก็ไม่ใช่ข้อมูลของระบบ (เครื่องอื่นไม่เห็น) ยุบแล้วผิดทั้งสองทาง
 */
const PIG_SOURCE = { records: "live", local: "local", demo: "demo" };

/** ปลายทางของป๊อบอัพเลือกฟาร์มในกล่อง "กล้อง AI" — เลือกโรงเรือน = เข้าการ์ดกล้องของหลังนั้น
    เลือกแค่ฟาร์ม = ผนังกล้องที่กรองไว้เฉพาะฟาร์มนั้น */
const cameraTarget = (farm, barn) =>
  barn
    ? `/dashboard/farms/${farm.id}/barns/${barn.id}#camera`
    : `/dashboard/cameras?farm=${farm.id}`;

/**
 * กล่องสรุปทั้งหมดที่มี — key ตรงกับ SECTIONS ใน lib/theme/themes.js
 *
 * กดที่ตัวกล่อง = ไปหน้าที่แสดง "ค่าของทุกฟาร์ม" ทันที ไม่ต้องเลือกฟาร์มก่อน
 * กดแถบท้ายกล่อง = เปิดป๊อบอัพเลือกฟาร์ม (ทุกใบมีแถบนี้)
 *   - ส่วนใหญ่ใช้ FarmPicker: เลือกฟาร์ม → เลือกโรงเรือนของฟาร์มนั้น (หรือกดดูทั้งฟาร์มก็ได้)
 *   - อุณหภูมิ/ความชื้น กับ การแจ้งเตือน ใช้ป๊อบอัพของตัวเอง เพราะเจาะถึงระดับโรงเรือน
 *
 * @param {object} openPicker ตัวเปิดป๊อบอัพของแต่ละกล่อง { farm, climate, alerts }
 * @param {object} live ตัวเลขที่ตัดสินด้วย "เกณฑ์ของผู้ใช้" จึงคำนวณในคอมโพเนนต์แล้วส่งเข้ามา
 *                      { outOfRange, criticalCount } — ถ้าคำนวณตรงนี้จะได้เกณฑ์มาตรฐานเสมอ
 *                      แล้วตัวเลขจะไม่ตรงกับหน้าอุณหภูมิ/หน้าแจ้งเตือนที่ใช้เกณฑ์ของผู้ใช้
 * @param {object} scope ตัวเลขของฟาร์มที่มีอยู่จริงตอนนี้ (ดู scopeStats) — ผู้ใช้เพิ่ม/ลบฟาร์มได้
 *                       จึงคำนวณในคอมโพเนนต์แล้วส่งเข้ามาเช่นกัน
 */
const TILES = (t, openPicker, live, scope) => {
  const { summary, cameras: cameraStats, climateAvg, sources } = scope;
  return {
  farms: {
    label: t("ฟาร์มทั้งหมด"),
    tone: "blue",
    source: sources.farms,
    value: formatNumber(summary.total),
    unit: t("ฟาร์ม"),
    delta: {
      text: t("ปกติ {good} · เฝ้าระวัง {warning} · ออฟไลน์ {offline}", {
        good: summary.good,
        warning: summary.warning,
        offline: summary.offline,
      }),
      tone: summary.warning + summary.offline > 0 ? "neutral" : "good",
    },
    to: "/dashboard/farms",
    pick: { label: t("เลือกฟาร์ม"), onClick: () => openPicker.farm(t("ฟาร์มทั้งหมด")), tone: "blue" },
  },
  pigs: {
    label: t("จำนวนสุกรทั้งหมด"),
    tone: "blue",
    /* ★ ป้ายต้องตามเลขที่โชว์จริง ไม่ใช่ตามว่า "มีฟาร์มจริงอยู่ในระบบไหม"
       `barnCountTotal` รายงานแหล่งที่**อ่อนที่สุด**ในก้อนอยู่แล้ว เอามาใช้ตรง ๆ ได้เลย
       นับไม่ได้สักเล้า (`count == null`) จึงถอยไปใช้ยอดตัวอย่างพร้อมป้ายเดิม */
    source: live.pigCount.count == null ? sources.pigs : PIG_SOURCE[live.pigCount.from],
    value: formatNumber(live.pigCount.count ?? summary.pigs),
    unit: t("ตัว"),
    delta: {
      /* ★ นับไม่ครบต้องบอกเสมอ ไม่งั้นยอดที่ขาดจะดูเหมือนยอดเต็ม (กติกาเดียวกับหน้าจำนวนสุกร) */
      text:
        live.pigCount.count == null
          ? t("กระจายใน {n} โรงเรือน", { n: formatNumber(summary.barns) })
          : live.pigCount.unknownBarns > 0
            ? t("นับจาก {n} โรงเรือน · ยังไม่รู้อีก {u} โรงเรือน", {
                n: formatNumber(live.pigCount.knownBarns),
                u: formatNumber(live.pigCount.unknownBarns),
              })
            : t("นับจาก {n} โรงเรือน", { n: formatNumber(live.pigCount.knownBarns) }),
      tone: "neutral",
    },
    to: "/dashboard/pigs",
    pick: { label: t("เลือกฟาร์ม"), onClick: () => openPicker.farm(t("จำนวนสุกรทั้งหมด")), tone: "blue" },
  },
  climate: {
    label: t("อุณหภูมิ / ความชื้น"),
    tone: "blue",
    source: sources.climate,
    value: formatNumber1(climateAvg.tempC),
    unit: "°C",
    delta: {
      /* ทุกหลังเงียบ: บอกอายุของค่าแทนการนับหลังที่หลุดเกณฑ์
         เพราะการนับจากค่าเก่าไม่มีความหมาย — ไม่รู้ว่าตอนนี้หลังไหนหลุดเกณฑ์ */
      text: climateAvg.held
        ? `${t("ค่าค้างไว้")} · ${updatedText(t, { at: climateAvg.heldAt })}`
        : t("ความชื้น {humidity}% · หลุดเกณฑ์ {n} หลัง", {
        humidity: formatNumber(climateAvg.humidity),
        n: formatNumber(live.outOfRange),
      }),
      tone: live.outOfRange > 0 ? "bad" : "good",
    },
    to: "/dashboard/climate",
    /* กล่องนี้เจาะถึงระดับโรงเรือน ป๊อบอัพจึงมีสองขั้น (ฟาร์ม → โรงเรือน) */
    pick: { label: t("เลือกฟาร์ม"), onClick: openPicker.climate, tone: "blue" },
  },
  cameras: {
    label: t("กล้อง AI"),
    tone: "blue",
    source: sources.cameras,
    value: formatNumber(cameraStats.total),
    unit: t("กล้อง"),
    delta: {
      text: t("มีภาพ {live} หลัง · ไม่มีสัญญาณ {off}", {
        live: formatNumber(cameraStats.live),
        off: formatNumber(cameraStats.noSignal),
      }),
      tone: cameraStats.noSignal > 0 ? "neutral" : "good",
    },
    to: "/dashboard/cameras",
    /* กล่องนี้มีปลายทางของตัวเอง — เลือกโรงเรือน = การ์ดกล้องของหลังนั้น
       เลือกแค่ฟาร์ม = ผนังกล้องที่กรองฟาร์มนั้นไว้ (ไม่ใช่หน้ารายชื่อโรงเรือน) */
    pick: {
      label: t("เลือกฟาร์ม"),
      onClick: () => openPicker.cameras(t("กล้อง AI")),
      tone: "blue",
    },
  },
  alerts: {
    label: t("การแจ้งเตือน"),
    tone: "critical",
    source: sources.alerts,
    value: formatNumber(summary.alerts),
    unit: t("รายการ"),
    delta: {
      text: t("ค้างอยู่ในทุกฟาร์ม · วิกฤต {n} รายการ", {
        n: formatNumber(live.criticalCount),
      }),
      tone: "bad",
    },
    to: "/dashboard/alerts",
    /* เช่นเดียวกับกล่องอุณหภูมิ — เลือกได้ถึงระดับโรงเรือน */
    pick: { label: t("เลือกฟาร์ม"), onClick: openPicker.alerts, tone: "critical" },
  },
  feed: {
    label: t("อาหารที่ให้วันนี้"),
    tone: "blue",
    source: "demo",
    value: formatNumber(feedToday),
    unit: t("กก."),
    delta: {
      text: t("สต็อกสูตรที่เหลือน้อยสุดใช้ได้อีก {n} วัน", { n: formatNumber(feedDaysLeft) }),
      tone: feedDaysLeft <= 10 ? "bad" : "neutral",
    },
    to: "/dashboard/feed",
    pick: { label: t("เลือกฟาร์ม"), onClick: () => openPicker.farm(t("อาหารที่ให้วันนี้")), tone: "blue" },
  },
  herd: {
    label: t("อัตราการสูญเสีย"),
    tone: "blue",
    source: "demo",
    value: formatNumber1(lastMortality.rate),
    unit: "%",
    delta: {
      text: t("เป้าหมายไม่เกิน {n}% ต่อเดือน", { n: formatNumber1(lastMortality.target) }),
      tone: lastMortality.rate <= lastMortality.target ? "good" : "bad",
    },
    to: "/dashboard/herd",
    pick: { label: t("เลือกฟาร์ม"), onClick: () => openPicker.farm(t("อัตราการสูญเสีย")), tone: "blue" },
  },
  env: {
    label: t("โรงเรือนที่ต้องดูแล"),
    tone: "blue",
    source: "demo",
    value: formatNumber(barnsToWatch),
    unit: t("โรงเรือน|หน่วยนับ"),
    delta: {
      text: t("จากโรงเรือนที่มีเซนเซอร์ {n} หลัง", { n: formatNumber(sensorNow.length) }),
      tone: barnsToWatch > 0 ? "bad" : "good",
    },
    to: "/dashboard/environment",
    pick: { label: t("เลือกฟาร์ม"), onClick: () => openPicker.farm(t("โรงเรือนที่ต้องดูแล")), tone: "blue" },
  },
  finance: {
    label: t("กำไรเดือนล่าสุด"),
    tone: "blue",
    source: "demo",
    value: formatNumber(financeSummary.profit),
    unit: t("บาท"),
    delta: {
      text: t("รายรับ {revenue} · ต้นทุน {cost} บาท", {
        revenue: formatNumber(financeSummary.totalRevenue),
        cost: formatNumber(financeSummary.totalCost),
      }),
      tone: financeSummary.profit > 0 ? "good" : "bad",
    },
    to: "/dashboard/finance",
    pick: { label: t("เลือกฟาร์ม"), onClick: () => openPicker.farm(t("กำไรเดือนล่าสุด")), tone: "blue" },
  },
  };
};

export default function Overview() {
  /* แผนที่ รายชื่อฟาร์ม **และกล่องสรุป** ต้องเห็นฟาร์มที่ผู้ใช้เพิ่มเองด้วย
     (เดิมแผนที่อ่านรายการที่แก้แล้ว แต่กล่องสรุปยังนับจากข้อมูลตัวอย่างชุดเดิม) */
  const { farms: allFarms, barnsOf, liveAlerts } = useAllFarms();
  const scope = useMemo(() => scopeStats(allFarms, barnsOf), [allFarms, barnsOf]);
  const fx = useFarmFilters(allFarms);
  /* ธีมบทบาทบอกว่าจะเอากล่องสรุปใบไหนบ้างและเรียงยังไง
     (ตำแหน่งและขนาดบนกระดาน PageBoard จัดการให้เอง — ผู้ใช้ลากจัดและบันทึกเป็นชุดได้) */
  const { tileKeys } = useTheme();
  const t = useT();
  /* ภาพพื้นหลังของฮีโร่ — ไม่มีไฟล์ก็ยังใช้หน้าได้ (การ์ดกลับไปเป็นพื้นขาวธรรมดา) */
  const [heroPhoto, setHeroPhoto] = useState(true);
  /* ภาพพื้นหลังของทั้งหน้า (ชั้นล่างสุด) — เช็กว่าโหลดได้ก่อนค่อยแสดง */
  const [pageBg, setPageBg] = useState(false);
  /* ป๊อบอัพเลือกฟาร์มของสองกล่องที่เจาะรายฟาร์มได้ */
  const [climateOpen, setClimateOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  /* ป๊อบอัพเจาะฟาร์ม/โรงเรือนของกล่องทั่วไป — เก็บ "ชื่อกล่องที่กดมา" ไว้ด้วย
     เพราะหัวข้อและปุ่มหลักในป๊อบอัพต้องเป็นของกล่องนั้น ๆ (null = ปิดอยู่)
     บางกล่องมีปลายทางของตัวเอง (เช่นกล้อง AI) จึงเก็บ `to` มาด้วยได้ */
  const [farmPicker, setFarmPicker] = useState(null);

  /* ตัวเลขที่ "ตัดสินด้วยเกณฑ์" ต้องใช้เกณฑ์ของผู้ใช้ ไม่ใช่ค่ามาตรฐานของระบบ —
     ไม่งั้นกล่องสรุปหน้านี้จะบอกคนละเลขกับหน้าอุณหภูมิและหน้าแจ้งเตือนทันทีที่มีคนไปแก้เกณฑ์ */
  const { settings, comfort } = useSettings();

  /* ═══ จำนวนสุกร: อ่านจากบันทึกจริง ไม่ใช่ยอดของข้อมูลตัวอย่าง (T1.338) ═══
     เดิมบรรทัดนี้รับไว้เองว่า "หลังบ้านยังไม่ส่งค่านี้มา" แล้วปล่อยให้กล่องโชว์ 11,200
     ซึ่งเป็นยอดของฟาร์มตัวอย่างล้วน — **ฟาร์มจริงมี `pigs` เป็น null เสมอ**
     หลังบ้านไม่เคยส่งยอดรวมมาให้จริง ๆ (และไม่ควรส่ง) เพราะยอดต้องคิดจากบันทึกเหตุการณ์
     ด้วยกติกาที่แยก "ยังไม่รู้" ออกจาก "ศูนย์" ซึ่ง SQL ตอบแทนไม่ได้ (ดู lib/herdCount.js)
     ➜ ใช้ตัวนับตัวเดียวกับหน้าจำนวนสุกร ไม่คิดเลขเองซ้ำ */
  const { total: pigCount } = useBarnCounts("all");

  const live = useMemo(() => {
    const outOfRange = scope.liveBarns.filter(
      (b) => readingStatus("tempC", b.tempC, comfort).tone !== "good"
    ).length;
    const limits = {
      tempMin: settings.comfort.tempMin,
      tempMax: settings.comfort.tempMax,
      humidityMax: settings.comfort.humidityMax,
      nh3Limit: settings.comfort.nh3Limit,
    };
    return {
      outOfRange,
      /* **ต้องนับเหตุของฟาร์มจริงด้วย** ไม่ใช่เฉพาะชุดตัวอย่าง (T1.283)
         ยอดรวมของกล่องนี้ (`summary.alerts`) นับทุกฟาร์มอยู่แล้ว แต่บรรทัด "วิกฤต N รายการ"
         เคยนับจาก allAlerts ของ data/mock อย่างเดียว กล่องเดียวกันจึงบอกเลขจากคนละแหล่ง */
      criticalCount: [...liveAlerts, ...allAlerts(limits)].filter((a) => a.level === "critical").length,
      pigCount,
    };
  }, [comfort, settings.comfort, scope.liveBarns, liveAlerts, pigCount]);

  const tiles = TILES(
    t,
    {
      climate: () => setClimateOpen(true),
      alerts: () => setAlertsOpen(true),
      farm: (label) => setFarmPicker({ label }),
      /* กล่องกล้องใช้ป๊อบอัพใบเดียวกัน แค่เปลี่ยนปลายทางกับข้อความบนปุ่ม */
      cameras: (label) =>
        setFarmPicker({
          label,
          to: cameraTarget,
          pickLabel: (farm, barn) =>
            barn
              ? t("ดูกล้องของ{name}", { name: t(barn.name) })
              : t("ดูกล้องทั้งหมดของ{name}", { name: t(farm.name) }),
        }),
    },
    live,
    scope
  );

  return (
    <>
      {/* พื้นหลังหลักของหน้า — ชั้นล่างสุด ตรึงอยู่กับที่ตอนเลื่อนหน้า */}
      <img
        className="sr-only"
        src={asset("/overview-bg.jpg")}
        alt=""
        aria-hidden="true"
        onLoad={() => setPageBg(true)}
        onError={() => setPageBg(false)}
      />
      {pageBg && <div className="ov-page-bg" aria-hidden="true" />}

      <section className={"ov-hero" + (heroPhoto ? " has-photo" : "")}>
        {heroPhoto && (
          <img
            className="ov-hero-photo"
            src={asset("/hero-swine-sync.jpg")}
            alt=""
            aria-hidden="true"
            onError={() => setHeroPhoto(false)}
          />
        )}
        <span className="ov-hero-veil" aria-hidden="true" />

        <span className="ov-eyebrow">
          <Icon name="spark" size={18} />
          {t("ระบบจัดการฟาร์มสุกรอัจฉริยะ")}
        </span>
        <h1 className="ov-title">SWINE SYNC</h1>
        {/* เหลือแต่ข้อมูลจริง (เวลาที่อัปเดต) — คำโปรยอธิบายหน้าเอาออกตามที่ผู้ใช้สั่ง */}
        <p className="ov-subtitle">
          {t("อัปเดตล่าสุด {time}", { time: formatDateTime(scope.summary.updatedAt) })}
        </p>
      </section>

      {/* ★ คำอธิบายป้ายบอกที่มาของข้อมูล — วางก่อนกล่องสรุป ไม่ใช่ท้ายหน้า
          กล่องพวกนี้เป็นตัวเลขรวมทุกฟาร์ม แต่มีฟาร์มที่ต่อเซนเซอร์จริงอยู่ฟาร์มเดียว
          เดิมไม่มีอะไรบอกเลย คนจึงอ่าน "กำไรเดือนล่าสุด" เป็นเลขของฟาร์มตัวเอง
          ต้องอ่านเจอ**ก่อน**เห็นตัวเลข ไม่ใช่มารู้ทีหลังว่าที่อ่านไปเป็นของสมมติ */}
      <DataSourceNote source="mixed" />

      {/* กล่องสรุป 4 กล่องอยู่บนสุด แล้วค่อยเป็นการ์ดแผนที่ */}
      <div className="ov-board stack-block">
        <PageBoard boardId={BOARD_ID}>
          {tileKeys.map((key) => {
            const tile = tiles[key];
            if (!tile) return null;
            /* กล่องที่เลือกฟาร์มได้: ปุ่มเลือกอยู่ "ในกล่องเดียวกัน" (ดู StatTile prop `pick`)
               กดที่กล่อง = ไปดูของทุกฟาร์ม · กดปุ่มในกล่อง = เปิดป๊อบอัพเลือกฟาร์ม */
            return (
              <Block key={key} id={key} label={tile.label}>
                <StatTile variant="row" {...tile} />
              </Block>
            );
          })}

          <Block id="map" label={t("แผนที่ฟาร์ม")}>
            <FarmExplorer
              fx={fx}
              cta={{ to: "/dashboard/pigs", label: t("ดูจำนวนสุกรทั้งหมด") }}
            />
          </Block>

          {/* กล่อง "ส่วนอื่นของระบบ" ถูกถอดออกจากกระดาน (1 ก.ย. 2569)
              ทางเข้า Voice AI ย้ายไปเป็นปุ่มบนแถบลอยล่างจอ (16 ก.ย. 2569)
              ดู components/dock/AppDock.jsx — ระบบเดียวที่มีอยู่ตอนนี้จึงไม่เหลือ
              อะไรให้กล่องนี้แสดง ปล่อยไว้จะเป็นการ์ดเปล่ากินที่ท้ายหน้า */}
        </PageBoard>
      </div>

      {/* ป๊อบอัพของแถบล่างในกล่องอุณหภูมิ/ความชื้น และกล่องการแจ้งเตือน */}
      <ClimatePicker open={climateOpen} onClose={() => setClimateOpen(false)} />
      <AlertPicker open={alertsOpen} onClose={() => setAlertsOpen(false)} />
      {/* กล่องที่เหลือใช้ตัวนี้ — หัวข้อและปุ่มหลักเป็นชื่อของกล่องที่กดมา */}
      <FarmPicker
        open={farmPicker !== null}
        label={farmPicker?.label ?? ""}
        to={farmPicker?.to}
        pickLabel={farmPicker?.pickLabel}
        onClose={() => setFarmPicker(null)}
      />
    </>
  );
}
