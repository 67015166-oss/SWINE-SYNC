/**
 * หน้า "ระบบควบคุมสภาพแวดล้อม" (/dashboard/environment)
 * ปลายทางของกล่องสรุป "โรงเรือนที่ต้องดูแล" ในหน้าภาพรวม
 *
 * เดิมหน้านี้มี 9 กล่อง และค่าเดียวกันถูกแสดงซ้ำสองที่ (แผง "ภายใน" กับแถบ "ค่าเทียบเกณฑ์")
 * รอบนี้ยุบให้เหลือ 6 กล่อง โดยรวมของที่เป็นเรื่องเดียวกันเข้าด้วยกัน:
 *
 *   1. ตอนนี้   ภายนอก + ภายใน + ค่าเทียบเกณฑ์ + THI  →  การ์ดเดียว
 *              ค่าภายในหนึ่งค่า = แผ่นเดียวที่มีครบ ตัวเลข · สถานะ · หลอดเทียบเกณฑ์ · ค่าภายนอก
 *              (ไม่ต้องกวาดตาไปอ่านสองที่แล้วเทียบเอง)
 *   2. ย้อนหลัง กราฟอุณหภูมิ/ความชื้น + กราฟก๊าซ  →  การ์ดเดียว สลับด้วยแท็บ ช่วงเวลาใช้ร่วมกัน
 *   3. แจ้งเตือน แยกออกมาเป็นกล่องของตัวเอง (เดิมพ่วงท้ายกล่อง THI จนหาไม่เจอ)
 *   4-6. อุปกรณ์ · ระบบไฟฟ้า · ผังเซนเซอร์ (คงเดิม)
 *
 * ความลึกมาจาก "พื้นจม + แผ่นนูน" (--shadow-well / --shadow-3d) บวกแสงเรืองอ่อน ๆ ตามสีสถานะ
 * แผ่นที่ปกติเรืองจาง แผ่นที่ผิดเกณฑ์เรืองเข้มขึ้น — กวาดตาแล้วเจอปัญหาก่อนอ่านตัวหนังสือ
 * (สถานะจริงยังอ่านจากป้ายไอคอน+ข้อความเสมอ ไม่ได้สื่อด้วยสีอย่างเดียว)
 *
 * กราฟยังเป็นเส้นแบนและ **หนึ่งกราฟมีแกน Y เดียว** ตามกติกาใน docs/DESIGN.md
 * สีผูกกับตัวชี้วัดถาวร: อุณหภูมิ = ส้ม · ความชื้น = น้ำเงิน · NH₃ = ม่วง · CO₂ = เขียว · H₂S = แดง
 */
import { useMemo, useState } from "react";
import { updatedText } from "../lib/duration.js";
import { Link, useSearchParams } from "react-router-dom";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceArea,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import PageHeader from "../components/ui/PageHeader.jsx";
import PageBoard, { Block } from "../components/board/PageBoard.jsx";
import Card from "../components/ui/Card.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import NotesToggle from "../components/ui/NotesToggle.jsx";
import DataSourceBadge from "../components/ui/DataSourceBadge.jsx";
import ChartLegend from "../components/ui/ChartLegend.jsx";
import Icon from "../components/ui/Icon.jsx";
import { useBarnHistory } from "../lib/api/useBarnHistory.js";
import { useBarnControl } from "../lib/api/useBarnControl.js";
import ClimatePicker from "../components/climate/ClimatePicker.jsx";
import EquipmentPanel from "../components/climate/EquipmentPanel.jsx";
import ElectricalPanel from "../components/climate/ElectricalPanel.jsx";
import SensorMap from "../components/climate/SensorMap.jsx";
import { useAllFarms } from "../lib/records/useAllFarms.js";
import {
  getOutdoor,
  getEquipment,
  getElectrical,
  getSensorMap,
} from "../data/mock/barnSystems.js";
import {
  getBarnTrend,
  getBarnDaily,
  readingStatus,
  climateStats,
  thiOf,
  thiLevel,
} from "../data/mock/climate.js";
import { gasesFor, AIR_LIMITS, airStatus } from "../data/mock/airQuality.js";
import { allAlerts, ALERT_LEVELS, adviceFor } from "../data/mock/alerts.js";
import {
  SERIES,
  GAS_COLORS,
  gridProps,
  axisProps,
  tooltipStyle,
  comfortBandProps,
  paddedDomain,
} from "../lib/chartTheme.js";
import { toggleFan, togglePump } from "../lib/equipment.js";
import {
  controlReady,
  fanCommand,
  pumpCommand,
  useEquipmentCommand,
} from "../lib/api/control.js";
/* เกณฑ์อากาศข้างนอกย้ายไปอยู่ไฟล์กลาง เพราะหน้าสภาพอากาศใช้ชุดเดียวกัน
   (ถ้าต่างคนต่างถือ วันหนึ่งค่าเดียวกันจะขึ้นคนละสถานะในสองหน้า) */
import { outdoorStatus, outdoorPct } from "../lib/outdoor.js";
import { useSettings } from "../lib/settings/useSettings.js";
import { useAuth } from "../lib/auth/useAuth.js";
import {
  formatNumber,
  formatNumber1,
  formatDateTime,
  formatTime,
} from "../lib/format.js";
import "./Environment.css";
import { useT } from "../lib/i18n/useT.js";
import { alertTitle } from "../lib/api/alertText.js";
import { heldDisplay } from "../lib/heldReading.js";
import MetricTiles from "../components/metrics/MetricTiles.jsx";

/** รหัสกระดานของหน้านี้ — คีย์ที่ใช้เก็บชุดเลย์เอาต์ (ดู lib/layout/presets.js) */
const BOARD_ID = "environment";

/** จำนวนแจ้งเตือนที่แสดงในหน้านี้ — ที่เหลือกดไปดูต่อในหน้าการแจ้งเตือน
    (ตรึงไว้เพื่อให้กล่องสูงเท่ากันทุกฟาร์ม ฟาร์มที่มีแจ้งเตือนเยอะจะไม่ดันกล่องจนล้น) */
const ALERT_LIMIT = 5;

/** ช่วงเวลาของกราฟย้อนหลัง — 24 ชม. เป็นราย 1 ชม. · 7/30 วัน เป็นค่าเฉลี่ยรายวัน
    ใช้ร่วมกันทั้งสองแท็บ เลือกครั้งเดียวแล้วกราฟทุกใบเปลี่ยนตาม */
const RANGES = [
  { id: "24h", label: "24 ชม.", days: 0 },
  { id: "7d", label: "7 วัน", days: 7 },
  { id: "30d", label: "30 วัน", days: 30 },
];

/** แท็บของการ์ดกราฟ — สองชุดค่าที่คนละหน่วยกันโดยสิ้นเชิง จึงสลับดูทีละชุด */
const TRENDS = [
  { id: "climate", label: "อุณหภูมิ & ความชื้น", icon: "thermometer" },
  { id: "gas", label: "ก๊าซในอากาศ", icon: "cloud" },
];

/** ความสูงของกราฟย่อยที่ซ้อนกันสองใบในแท็บอุณหภูมิ/ความชื้น */
const MINI_CHART_HEIGHT = 175;
/** ความสูงของกราฟก๊าซซึ่งมีใบเดียวในแท็บ (เท่ากับสองใบซ้อนกันพอดี การ์ดจึงไม่กระตุกตอนสลับ) */
const GAS_CHART_HEIGHT = 396;

/** สีผูกกับตัวชี้วัดถาวร (ชุดเดียวกับหน้า "ภายในโรงเรือน" ห้ามสลับ) */
const TEMP_COLOR = SERIES[7];
const HUMID_COLOR = SERIES[0];

const levelLabel = (id) => ALERT_LEVELS.find((l) => l.id === id)?.label ?? id;

/** ค่าที่ยังไม่มีสัญญาณให้แสดงขีดกลาง ไม่ใช่เลข 0 (0 แปลว่า "วัดได้ 0" ซึ่งคนละความหมาย) */
const dash = (value, format = formatNumber) => (value == null ? "—" : format(value));


/** สัดส่วนของค่าบนหลอด (0–100) — ต่ำกว่าขอบล่างหรือเกินขอบบนถูกตัดให้อยู่ในหลอดเสมอ */
const barPct = (value, floor, ceil) =>
  value == null ? 0 : Math.min(100, Math.max(0, ((value - floor) / (ceil - floor)) * 100));

/**
 * แผ่นค่าหนึ่งค่าที่วัดได้ในโรงเรือน — รวมของเดิมสามชิ้นไว้ในแผ่นเดียว
 * ตัวเลข · ป้ายสถานะ · หลอดเทียบเกณฑ์ · บรรทัดค่าภายนอก
 *
 * สีของแผ่นมาจากสถานะ: ปกติเรืองจางมาก ผิดเกณฑ์เรืองเข้มขึ้น
 * (เป็นตัวช่วยกวาดตาเท่านั้น ความหมายจริงอยู่ที่ป้ายซึ่งมีทั้งไอคอนและข้อความ)
 */
function Metric({ icon, label, value, unit, status, pct, range, isHeld }) {
  const t = useT();

  return (
    <li className={`ev-m is-${status.tone}` + (isHeld ? " is-held" : "")}>
      <span className="ev-m-head">
        <span className="ev-m-chip" aria-hidden="true">
          <Icon name={icon} size={18} />
        </span>
        {label}
      </span>

      <span className="ev-m-value">
        <b className="num">{value}</b>
        <em>{unit}</em>
      </span>

      <span className="ev-m-meta">
        <StatusBadge tone={status.tone}>{t(status.label)}</StatusBadge>
        <span className="ev-m-range">{range}</span>
      </span>

      {/* หลอดเป็นตัวช่วยกะระยะเท่านั้น สถานะจริงอ่านจากป้ายด้านบน — จึงซ่อนจากโปรแกรมอ่านหน้าจอ */}
      <span className="ev-m-track" aria-hidden="true">
        <span className={`ev-m-fill is-${status.tone}`} style={{ width: `${pct}%` }} />
      </span>
    </li>
  );
}

/** ปุ่มเลือกช่วงเวลาของกราฟ (24 ชม. / 7 วัน / 30 วัน) */
function RangeTabs({ value, onChange, options }) {
  const t = useT();

  return (
    <span className="ev-range" role="tablist" aria-label={t("ช่วงเวลาของกราฟ")}>
      {options.map((range) => (
        <button
          key={range.id}
          type="button"
          role="tab"
          aria-selected={range.id === value}
          className={"ev-range-btn" + (range.id === value ? " is-active" : "")}
          onClick={() => onChange(range.id)}
        >
          {t(range.label)}
        </button>
      ))}
    </span>
  );
}

export default function Environment() {
  const t = useT();
  /* ช่วงที่ถือว่าเหมาะสมและค่าไฟปรับได้ในหน้าตั้งค่า — ทั้งหน้าขยับตามทันที */
  const { settings, comfort } = useSettings();
  const canControlEquipment = useAuth().can("equipment.control");
  /* ค่าตั้งต้นเป็นฟาร์มแรกของข้อมูลระบบ — ประกาศก่อนจะได้ไม่ชนกับ farms ที่มาจาก hook ด้านล่าง
     (เป็นแค่ "ฟาร์มที่ผู้ใช้เลือกไว้" เท่านั้น ฟาร์มจริงที่หน้านี้ใช้คือ `farm` ด้านล่าง
      เพราะฟาร์มที่เลือกไว้อาจถูกลบไปแล้ว) */
  /**
   * โรงเรือนที่กำลังดูอยู่ **เก็บไว้ใน URL** (`?farm=…&barn=…`) ไม่ใช่ใน state อย่างเดียว
   *
   * ถ้าเก็บใน state เฉย ๆ รีเฟรชทีจะเด้งกลับไปโรงเรือนแรกของฟาร์มแรกทุกครั้ง
   * ทั้งที่ URL ไม่เปลี่ยน — คนใช้จะงงว่าทำไมหน้าเดิมกลายเป็นของโรงเรือนอื่น
   * อยู่ใน URL แล้วยังก๊อบลิงก์ส่งให้คนอื่นเปิดโรงเรือนเดียวกันได้ด้วย
   *
   * รหัสที่ไม่มีอยู่จริง (ฟาร์มถูกลบ / แก้ URL มั่ว) ตกไปที่ค่าตั้งต้นเองด้านล่าง
   */
  const [params, setParams] = useSearchParams();
  /* ไม่ตั้งค่าเริ่มต้นเป็นฟาร์มตัวอย่างฟาร์มแรกอีกแล้ว — ปล่อยว่างไว้แล้วให้ตกไปที่ farms[0]
     ซึ่ง useAllFarms เรียงฟาร์มที่ต่อเซนเซอร์จริงไว้บนสุด
     (เดิมเปิดหน้านี้แล้วเจอฟาร์มตัวอย่างก่อนเสมอ คนดูเลยนึกว่าค่าจริงไม่ขึ้น) */
  const [pickedFarmId, setPickedFarmId] = useState(() => params.get("farm") || null);
  const [barnId, setBarnId] = useState(() => params.get("barn") || null);
  const [pickerOpen, setPickerOpen] = useState(false);
  /* คำแนะนำใต้ตัวเลข THI ซ่อนไว้ก่อน กดที่กล่องถึงจะกาง — หัวหน้าจึงไม่ยาวเป็นสองบรรทัดตลอดเวลา
     ทั้งที่คนอ่านซ้ำทุกครั้งไม่ได้ต้องการ (ตัวเลขกับระดับที่โชว์อยู่บอกได้เกือบหมดแล้ว) */
  const [thiOpen, setThiOpen] = useState(false);
  /* การแจ้งเตือนข้อที่กางคำแนะนำอยู่ (null = ยังไม่กางข้อไหน) — กางทีละข้อ
     กติกาเดียวกับหน้าโรงเรือน (BarnDetail.jsx) สองที่นี้ต้องกดแล้วได้เหมือนกัน */
  const [openAlert, setOpenAlert] = useState(null);
  /* คำอธิบายใต้ค่าทุกตัว (เกณฑ์ · ส่วนต่างเทียบข้างนอก) และคำโปรยใต้หัวกลุ่ม — ซ่อนไว้ก่อน
     ค่าที่วัดได้กับป้ายสถานะบอกเรื่องหลักครบแล้ว ส่วนที่ซ่อนคือ "ทำไมถึงตัดสินแบบนั้น"
     ซึ่งคนดูซ้ำทุกวันไม่ได้อ่านทุกครั้ง — กดปุ่มเดียวกางพร้อมกันทั้งการ์ด */
  const [showNotes, setShowNotes] = useState(false);
  /* การ์ดกราฟใบเดียว: เลือกว่าจะดูชุดไหน และดูย้อนหลังกี่วัน */
  const [trend, setTrend] = useState("climate");
  const [rangeId, setRangeId] = useState("24h");
  /* คำสั่งที่ผู้ใช้กดเอง เก็บแยกรายโรงเรือน (คีย์ = ฟาร์ม/โรงเรือน) */
  const [commands, setCommands] = useState({});

  /* รวมฟาร์ม/โรงเรือนที่ผู้ใช้เพิ่มเองด้วย — เลือกจากป๊อบอัพได้แล้วหน้านี้ต้องเปิดได้ด้วย */
  const { farms, barnsOf, liveAlerts } = useAllFarms();
  /**
   * ฟาร์มที่หน้านี้ใช้จริง — ฟาร์มที่เลือกไว้ถูกลบไปแล้วก็ถอยไปฟาร์มแรกที่ยังเหลือ
   *
   * และ **ทุกอย่างข้างล่างต้องอ่านจาก `farmId` ตัวนี้ ไม่ใช่จากตัวที่ผู้ใช้เลือกไว้** —
   * เดิมหัวหน้าถอยไปฟาร์มอื่นให้แล้ว แต่รายชื่อโรงเรือน/เซนเซอร์/แจ้งเตือนยังดึงด้วยรหัสเดิม
   * ผลคือหัวหน้าเขียนชื่อฟาร์มหนึ่ง แต่ข้อมูลทั้งหน้าเป็นของอีกฟาร์มที่ถูกลบไปแล้ว
   *
   * ลบจนไม่เหลือสักฟาร์มก็เป็น null ได้ (หน้านี้รับมือ "ไม่มีโรงเรือน" อยู่แล้วทุกจุด)
   */
  const farm = farms.find((f) => f.id === pickedFarmId) ?? farms[0] ?? null;
  const farmId = farm?.id ?? "";
  const barnList = useMemo(() => (farmId ? barnsOf(farmId) : []), [farmId, barnsOf]);
  /* โรงเรือนที่เลือกต้องอยู่ในฟาร์มที่เลือกเสมอ */
  const barn = barnList.find((b) => b.id === barnId) ?? barnList[0] ?? null;

  /* โรงเรือนอื่นในฟาร์มเดียวกันที่ยังส่งค่า — ใช้ในการ์ด "เทียบกับโรงเรือนอื่น"
     (โรงเรือนที่เซนเซอร์เงียบไม่มีตัวเลขให้เทียบ ใส่เข้ามาก็เป็นแถบว่าง) */
  const siblings = useMemo(
    () => barnList.filter((b) => b.status !== "offline" && b.tempC != null),
    [barnList]
  );
  /* หลังที่ร้อนที่สุดในฟาร์ม — คำตอบที่คนเปิดการ์ดเทียบมาหาบ่อยที่สุด
     เขียนไว้ในคำโปรยของการ์ดเลย จะได้ไม่ต้องกดเข้าหน้าเทียบเพื่อดูบรรทัดเดียว */
  const hottest = useMemo(
    () => [...siblings].sort((a, b) => b.tempC - a.tempC)[0] ?? null,
    [siblings]
  );

  const tempRange = comfort.tempC;
  const humidityRange = comfort.humidity;
  const nh3Limit = settings.comfort.nh3Limit;

  /* "ไม่มีค่าให้อ่าน" ครอบสองกรณี — เซนเซอร์หลุด (offline) และโรงเรือนที่เพิ่งเพิ่มเองซึ่งยังไม่มีเซนเซอร์
     ถ้าเช็กแค่ status จะขึ้นป้าย LIVE ทั้งที่ทุกค่าเป็นขีดกลาง */
  const offline = !barn || barn.status === "offline" || barn.tempC == null;
  /* โรงเรือนตัวอย่างห้ามขึ้นป้าย LIVE / "อ่านค่าตามเวลาจริง" — ค่าพวกนี้เป็นตัวเลขสมมติ
     คนดูจะเอาไปตัดสินใจเหมือนค่าสด (T1.241) · barn.dataSource ติดมาจาก useAllFarms ทุกหลัง */
  const isDemo = barn?.dataSource !== "live";
  /* ค่านอกอาคาร — **ของจริงมาก่อน** ฟาร์มที่ต่อเซนเซอร์จริงมีเสาอากาศของตัวเอง
     (ก่อนหน้านี้เรียก getOutdoor() ตรง ๆ ซึ่งหาจากรายชื่อฟาร์มตัวอย่างอย่างเดียว
      ฟาร์มจริงจึงได้ null แล้วขึ้น "นอก —" ทั้งที่เสาอากาศส่งค่าอยู่)
     ค่าที่เสาไม่ได้วัด (UV · ความกดอากาศ) ปล่อยเป็นขีดกลาง ไม่เอาของตัวอย่างมาปน
     ไม่งั้นจะกลายเป็นครึ่งจริงครึ่งสมมติโดยไม่มีอะไรบอกคนดู */
  const outdoor = barn
    ? (barn.apiId ? barn.outdoor ?? null : getOutdoor(farmId, barn.id))
    : null;
  const gases = gasesFor(barn);

  /* ค่าค้างเมื่อเซนเซอร์เงียบ — ส่งค่าที่ตรรกะใช้ (null เมื่อเก่า) คู่กับค่าที่ค้างไว้
     กติกาอยู่ที่ lib/heldReading.js ที่เดียว ห้ามเขียนเงื่อนไขเองตรงนี้ */
  const shownValue = (liveValue, heldKey, format = formatNumber) =>
    heldDisplay({
      live: liveValue ?? null,
      held: barn?.held?.[heldKey] ?? null,
      at: barn?.held?.at ?? null,
      format,
      t,
    });
  const thi = offline ? null : thiOf(barn.tempC, barn.humidity);
  const level = thi == null ? null : thiLevel(thi);

  /* ---------- อุปกรณ์ · ระบบไฟฟ้า · ผังเซนเซอร์ ของหลังที่เลือก ---------- */
  const commandKey = `${farmId}/${barn?.id}`;
  /* ═══ อุปกรณ์ของโรงเรือนจริงอ่านจากกล่อง ไม่ใช่ชุดตัวอย่าง (T1.336) ═══
     เดิมเรียก `getEquipment()` กับทุกโรงเรือน · โรงเรือนจริงไม่มีในไฟล์ตัวอย่าง
     จึงตกไปได้ชุด "ไม่มีสัญญาณ" แล้ว **สวิตช์ถูกล็อกทั้งการ์ด** ทั้งที่กล่องรับคำสั่งได้จริง
     กล่องตอบไม่ได้ก็ยังถอยไปชุดตัวอย่างเหมือนเดิม (ดีกว่าการ์ดว่างเปล่า) */
  const boxControl = useBarnControl(barn?.apiId ? barn.id : null);
  const autoEquipment = useMemo(
    () => boxControl.equipment ?? (barn ? getEquipment(farmId, barn.id) : null),
    [boxControl.equipment, farmId, barn]
  );
  /* ★ ชุดที่มาจากกล่องห้ามถูกทับด้วยผลการกดในเครื่อง — คำสั่งยังค้างในคิว ไม่ได้ถึงพัดลม
     ทับเมื่อไรจอจะเขียนว่า "ทำงาน 50 Hz" ให้พัดลมที่ไม่มีใครรู้ว่าหมุนอยู่หรือเปล่า */
  const fromBox = boxControl.equipment != null;
  const equipment = fromBox ? autoEquipment : (commands[commandKey] ?? autoEquipment);
  /* โรงเรือนที่มีมิเตอร์ไฟจริงใช้ค่าจากมิเตอร์ ไม่ใช่ค่าที่คำนวณจากอุปกรณ์สมมติ
     (ค่าจริงติดมากับโรงเรือนแล้ว — ดู barn.electrical ใน lib/api/LiveFarmsProvider.jsx)
     ค่าไฟต่อหน่วยยังมาจากการตั้งค่าเหมือนเดิม เพราะเป็นค่าที่แอดมินตั้ง ไม่ใช่ค่าที่มิเตอร์วัด */
  const electrical = useMemo(() => {
    if (!barn) return null;
    if (barn.electrical) return { ...barn.electrical, rate: settings.bahtPerKwh };
    return getElectrical(farmId, barn.id, equipment, settings.bahtPerKwh);
  }, [farmId, barn, equipment, settings.bahtPerKwh]);
  /* โรงเรือนที่ต่อเซนเซอร์จริงมี `apiId` — ดึงข้อมูลย้อนหลังและผังเซนเซอร์ของจริงจากหลังบ้าน
     ฟาร์มตัวอย่างไม่มี `apiId` จึงตกไปใช้ mock เหมือนเดิมทุกประการ
     **ต้องประกาศเหนือทุกจุดที่ใช้ `live`** ไม่งั้นชน temporal dead zone ตอน render */
  const live = useBarnHistory(barn?.apiId ?? null, rangeId);

  const sensorMap = useMemo(
    () => live.sensorMap ?? (barn && !barn.apiId ? getSensorMap(farmId, barn.id) : null),
    [live.sensorMap, farmId, barn]
  );
  /* กันซ้ำที่ตัวสั่ง ไม่ใช่แค่ที่ปุ่ม — ปุ่มถูกปิดอยู่แล้ว แต่ถ้าวันหนึ่งมีทางอื่นเรียก command
     (ผู้ช่วย AI · ปุ่มลัด) คนที่ไม่มีสิทธิ์ต้องสั่งไม่ได้เหมือนกัน · ด่านจริงอยู่หลังบ้าน (requireEquipmentControl) */
  /**
   * ส่งคำสั่งอุปกรณ์ (T1.284)
   *
   * `next` = หน้าตาอุปกรณ์หลังกด (คำนวณฝั่งหน้าเว็บด้วย lib/equipment.js)
   * `request` = คำสั่งที่จะส่งให้หลังบ้านตรวจและบันทึก
   *
   * **เปลี่ยนหน้าจอเฉพาะเมื่อหลังบ้านรับคำสั่งแล้ว** — เดิมกดแล้วจอเปลี่ยนทันที
   * ซึ่งพอมีด่านความปลอดภัยจริงจะกลายเป็นคำโกหก: จอบอกว่าพัดลมปิดแล้ว
   * แต่คำสั่งถูกปฏิเสธเพราะอากาศร้อน
   */
  const control = useEquipmentCommand(barn?.id ?? "");
  const command = async (next, request) => {
    if (!canControlEquipment) return;
    /* สำเนาที่วางบนโฮสต์คนอื่น (build:host) ไม่มีหลังบ้าน — ทำตัวเหมือนเดิมคือเปลี่ยนแค่ในเครื่อง
       หน้าจอมีป้าย "ข้อมูลตัวอย่าง" อยู่แล้ว จึงไม่ได้ทำให้ใครเข้าใจผิดว่าสั่งของจริง */
    if (!controlReady || !request) {
      setCommands((all) => ({ ...all, [commandKey]: next }));
      return;
    }
    const r = await control.send(request);
    if (!r.ok) return;
    /* ของจริงจากกล่อง: ดึงทะเบียน+ประวัติใหม่ แล้วบรรทัด "สั่งล่าสุด" จะอัปเดตเอง
       ชุดตัวอย่าง: ไม่มีอะไรให้ดึง จึงเปลี่ยนในเครื่องเหมือนเดิม */
    if (fromBox) boxControl.reload();
    else setCommands((all) => ({ ...all, [commandKey]: next }));
  };

  /* ---------- ข้อมูลย้อนหลัง (ชุดเดียว ใช้ทั้งสองแท็บ) ---------- */
  /* 24 ชม. = ราย 1 ชม. (getBarnTrend) · 7/30 วัน = ค่าเฉลี่ยรายวัน (getBarnDaily)
     สองชุดคืนฟิลด์เหมือนกันหมด โค้ดกราฟจึงใช้ชุดเดียวไม่ต้องแยกเคส */
  const barnKey = barn?.id ?? "";


  const mockData = useMemo(() => {
    if (!barnKey) return [];
    const range = RANGES.find((r) => r.id === rangeId) ?? RANGES[0];
    return range.days === 0
      ? getBarnTrend(farmId, barnKey, 24)
      : getBarnDaily(farmId, barnKey, range.days);
  }, [farmId, barnKey, rangeId]);

  /* ของจริงมาก่อนเสมอ — หลังบ้านล่มหรือยังโหลดไม่เสร็จค่อยตกไปใช้ mock
     **ห้ามเอา mock มาต่อท้ายของจริง** เส้นกราฟจะกลายเป็นครึ่งจริงครึ่งสมมติ
     โดยไม่มีอะไรบอกคนดูว่าตรงไหนคือของจริง */
  const climateData = useMemo(
    () => live.series ?? (barn?.apiId ? [] : mockData),
    [live.series, barn?.apiId, mockData],
  );

  /* สรุปสูงสุด/ต่ำสุด/เฉลี่ยของช่วงที่กำลังดู — ย้ายมาจากหน้า /dashboard/climate ที่ถูกยุบ (T1.140)
     ตัวเลขพวกนี้ไม่มีที่ไหนในหน้านี้มาก่อน กราฟบอกรูปร่างได้ แต่ไม่ได้บอกว่าพีคเท่าไร

     **ฟาร์มที่ต่อเซนเซอร์จริงต้องใช้ `live.stats` ก่อนเสมอ ห้ามคิดจากเส้นกราฟ** (T1.225)
     เส้นกราฟที่ PlotNexus ส่งมาเป็นค่าเฉลี่ยรายช่วง ~12 นาทีแล้ว ยอดแหลมจริงถูกกลืนไป
     คิดจากมันจะได้ "สูงสุด 27.7 °C" ขณะที่ค่าปัจจุบันบนหน้าเดียวกันเขียน 28.4 °C
     คนอ่านเห็นสองเลขนี้ติดกันแล้วเชื่อทั้งหน้าไม่ได้อีกเลย (ยอดจริงคือ 25.3–29.9 °C)
     ฟาร์มตัวอย่างไม่มี `stats` จึงยังคิดจากเส้นเหมือนเดิม — ของ mock เป็นค่าดิบรายชั่วโมงอยู่แล้ว */
  const climateSummary = useMemo(
    () => (trend === "climate" ? (live.stats ?? climateStats(climateData)) : null),
    [trend, live.stats, climateData]
  );

  /* ก๊าซย้อนหลัง — **เฉพาะฟาร์มตัวอย่าง**: ข้อมูลโรงเรือนเก็บแค่ NH₃
     ส่วน CO₂/H₂S คำนวณจากอุณหภูมิ/ความชื้นของจุดนั้นด้วยสูตรเดียวกับค่าปัจจุบัน (gasesFor)
     เส้นกราฟจึงลงท้ายที่ค่าล่าสุดพอดี
     ฟาร์มที่ต่อเซนเซอร์จริง `gasesFor` จะคืน null ให้ทุกก๊าซที่ไม่มีเซนเซอร์วัด
     กราฟจึงว่างแทนที่จะวาดเส้นที่คิดขึ้นเอง (ดูเหตุผลเต็มในหัว gasesFor)
     สามก๊าซคนละสเกลกันมาก จึงย่อ CO₂ และขยาย H₂S ให้อยู่แกนเดียวกัน แล้วบอกตัวคูณไว้ในชื่อเส้น
     (ห้ามแก้ด้วยการเพิ่มแกน Y ที่สอง — กติกาข้อ "กราฟ" ใน docs/DESIGN.md) */
  const gasData = useMemo(
    () =>
      climateData.map((point) => {
        /* ★ ต้องส่ง `co2` ของจุดนั้นเข้าไปด้วย ไม่ใช่ปล่อยให้ `gasesFor` อ่าน `barn.co2`
           ฟาร์มจริงเดินทาง `dataSource === "live"` ซึ่งคืน `barn.co2` ตรง ๆ
           ผลคือทุกจุดในกราฟได้ค่า CO₂ **ของตอนนี้** เท่ากันหมด = เส้นแบนที่ไม่ใช่ของจริง
           (วันนี้กำแพงเพชรยังไม่มีเซนเซอร์ CO₂ จึงเป็น null ทั้งเส้น ยังไม่เห็นอาการ
            แต่วันที่อีกทีมต่อเซนเซอร์สำเร็จ กราฟจะโกหกทันทีโดยไม่มีใครแก้) */
        const g = gasesFor({
          ...barn,
          id: `${barn?.id}-${point.t}`,
          tempC: point.tempC,
          humidity: point.humidity,
          nh3: point.nh3,
          co2: point.co2,
        });
        return {
          t: point.t,
          hour: point.hour,
          nh3: g.nh3,
          /* **ต้องเช็ก null ก่อนคูณ/หารเสมอ** — `Math.round(null / 10)` ได้ 0 ไม่ใช่ null
             ซึ่งทำให้กราฟลากเส้นแบนติดพื้นที่ค่า 0 ให้ก๊าซที่ไม่มีใครวัด
             (CO₂ ในอากาศกลางแจ้งยัง ~420 ppm ค่า 0 จึงเป็นไปไม่ได้ทางกายภาพ)
             แย่กว่ากรอบกราฟเปล่าอีก เพราะดูเหมือนวัดได้จริงแล้วได้ศูนย์ */
          co2: g.co2 == null ? null : Math.round(g.co2 / 10),
          h2s: g.h2s == null ? null : Math.round(g.h2s * 10),
        };
      }),
    [climateData, barn]
  );

  /* มีค่าก๊าซให้วาดจริงไหม — โรงเรือนที่ไม่มีเซนเซอร์ก๊าซจะเป็น null ทั้งชุด
     (กำแพงเพชร: NH₃/CO₂ อุปกรณ์ส่ง 0 มาตลอดจนถูกกรองทิ้ง ส่วน H₂S ไม่มีเซนเซอร์เลย) */
  const hasGas = gasData.some((p) => p.nh3 != null || p.co2 != null || p.h2s != null);

  const GAS_LINES = [
    { key: "nh3", name: "NH₃ (ppm)", scale: 1, color: GAS_COLORS.nh3 },
    { key: "co2", name: "CO₂ ÷10", scale: 0.1, color: GAS_COLORS.co2 },
    { key: "h2s", name: "H₂S ×10", scale: 10, color: GAS_COLORS.h2s },
  ];

  /** ป้ายแกนเวลาแสดงราว 4 จุด ไม่ว่าจะเลือกช่วงกี่วัน */
  const tickStep = (data) => Math.max(0, Math.floor(data.length / 4) - 1);

  /* ---------- ข้อความเทียบข้างนอกกับข้างใน ----------
     ใช้ในชิปกลุ่ม "ภายนอกโรงเรือน" — บอกส่วนต่างเป็นคำที่อ่านรู้เรื่องทันที
     ("ร้อนกว่าข้างใน 4.2 °C") ไม่ใช่ลูกศรกับเครื่องหมายบวกลบที่ต้องตีความเอง
     ส่วนต่างมีความหมายต่างกันตามค่าที่วัด จึงรับคำมาเป็นคู่ ไม่ใช้คำกลาง ๆ คำเดียว */
  const gapNote = (out, inside, format, unit, more, less) => {
    if (out == null || inside == null) return null;
    /* "%" เขียนติดตัวเลขเสมอ หน่วยอื่นเว้นวรรคตามการเขียนภาษาไทย */
    const gap = unit.startsWith("%") ? "" : " ";
    const d = Number((out - inside).toFixed(2));
    if (d === 0) return t("เท่ากับข้างใน");
    return t(d > 0 ? more : less, { value: `${format(Math.abs(d))}${gap}${unit}` });
  };

  /* ═══ ค่าที่เซนเซอร์ "ส่งมาแต่ไม่ได้วัด" — ขีดกลางต้องบอกสาเหตุ (T1.315) ═══
     ชั้นข้อมูลล้างค่าพวกนี้เป็น null มาแล้ว ถ้าไม่เขียนกำกับ ช่องนั้นจะอ่านว่า
     "ไม่มีเซนเซอร์" ซึ่งคนละเรื่องกับ "มีแต่เชื่อค่าไม่ได้" และต้องไปตามคนละคน
     (ติดตั้งเพิ่ม กับ ไปซ่อมของที่มีอยู่) — แบบเดียวกับป้ายก๊าซน่าสงสัยข้างบน */
  const stuckSet = new Set(barn?.stuckValues ?? []);
  const stuckNote = (metric, place) =>
    stuckSet.has(`${metric}|${place}`) ? t("เซนเซอร์ส่งค่าเดิมซ้ำ — ไม่ได้วัดจริง") : null;

  /* ---------- หกค่าที่วัดได้ในโรงเรือน (ตัวเลข + สถานะ + เกณฑ์ อยู่ในแผ่นเดียวกัน) ---------- */
  const tempShown = shownValue(barn?.tempC, "tempC", formatNumber1);
  const humidShown = shownValue(barn?.humidity, "humidity");
  const windShown = shownValue(barn?.windSpeed, "windSpeed", formatNumber1);

  const metrics = [
    {
      key: "tempC",
      icon: "thermometer",
      label: t("อุณหภูมิ"),
      value: tempShown.text,
      isHeld: tempShown.isHeld,
      unit: "°C",
      status: readingStatus("tempC", barn?.tempC ?? null, comfort),
      pct: barPct(barn?.tempC, tempRange.floor, tempRange.ceil),
      /* ค่าค้างกินบรรทัดเกณฑ์ทิ้ง — เขียนเกณฑ์คู่ค่าเก่า คนอ่านแล้วตัดสินว่าค่าตอนนี้อยู่ในเกณฑ์ */
      range:
        tempShown.note ??
        stuckNote("temp_c", "in") ??
        t("เกณฑ์ {min}–{max} °C", {
          min: formatNumber(tempRange.min),
          max: formatNumber(tempRange.max),
        }),
    },
    {
      key: "humidity",
      icon: "drop",
      label: t("ความชื้น"),
      value: humidShown.text,
      isHeld: humidShown.isHeld,
      unit: "%RH",
      status: readingStatus("humidity", barn?.humidity ?? null, comfort),
      pct: barPct(barn?.humidity, humidityRange.floor, humidityRange.ceil),
      range:
        humidShown.note ??
        stuckNote("humidity", "in") ??
        t("เกณฑ์ {min}–{max}%", {
          min: formatNumber(humidityRange.min),
          max: formatNumber(humidityRange.max),
        }),
    },
    {
      key: "wind",
      icon: "fan",
      /* ชื่อเดียวกับฝั่งนอก — หัวกลุ่มบอกอยู่แล้วว่าอันไหนในอันไหนนอก
         (ผู้ใช้ทักว่าสองฝั่งควรเหมือนกัน ต่างแค่ในกับนอก 3 ก.ย. 2569) */
      label: t("ลม"),
      value: windShown.text,
      isHeld: windShown.isHeld,
      unit: "m/s",
      status: airStatus("wind", barn?.windSpeed ?? null),
      pct: barPct(barn?.windSpeed, 0, AIR_LIMITS.wind.scaleMax),
      range:
        windShown.note ??
        stuckNote("wind_ms", "in") ??
        t("เกณฑ์ {min}–{max} ม./วิ", {
          min: formatNumber1(AIR_LIMITS.wind.min),
          max: formatNumber(AIR_LIMITS.wind.max),
        }),
    },
    /* เหลือเฉพาะ CO₂ — ผู้ใช้สั่งเอา NH₃ กับ H₂S ออกจากแผ่นค่า (28 ต.ค. 2569)
       ทั้งสองตัวยังอยู่ในกราฟ "ก๊าซในอากาศ" และยังคิดแจ้งเตือนเหมือนเดิม */
    ...["co2"].map((key) => {
      const limit = AIR_LIMITS[key];
      const max = key === "nh3" ? nh3Limit : limit.max;
      /* เซนเซอร์ NH₃/CO₂ ของหลังนี้ส่งค่าที่เชื่อไม่ได้อยู่ (ดู lib/sensorHealth.js)
         H₂S ไม่เข้าข่าย เพราะไม่มีเซนเซอร์ตัวนั้นตั้งแต่ต้น — คนละอาการ ต้องขึ้นคนละป้าย */
      const suspect = key !== "h2s" && barn?.gasSuspect === true;
      const status = airStatus(key, gases[key], max, suspect);
      /* H₂S ไม่มีเซนเซอร์ตั้งแต่ต้น จึงไม่มีค่าค้างให้ค้าง — `held.h2s` เป็น undefined แล้วตกเป็นขีดกลางเอง */
      const shown = shownValue(gases[key], key, key === "h2s" ? formatNumber1 : formatNumber);
      return {
        key,
        icon: limit.icon,
        /* ชื่อเต็มยาวเกินหัวแผ่น ใช้สูตรย่อท้ายชื่อ (NH₃ · CO₂ · H₂S) ซึ่งคนในฟาร์มเรียกกันอยู่แล้ว */
        label: limit.label.split(" ").at(-1),
        value: shown.text,
        isHeld: shown.isHeld,
        unit: limit.unit,
        /* ตัดสินด้วยเพดานตัวเดียวกับที่เขียนอยู่ในบรรทัด "ไม่เกิน …" ข้างล่าง */
        status,
        pct: barPct(gases[key], 0, limit.scaleMax),
        /* บรรทัดใต้ป้าย: ปกติบอกเกณฑ์ แต่ตอนน่าสงสัยต้องบอก "ทำไม" ไม่งั้นคนอ่านเห็นแค่
           ขีดกลางกับป้ายเหลืองแล้วไม่รู้ว่าต้องไปทำอะไรต่อ */
        range: shown.note
          ? shown.note
          : suspect
          ? t("อุปกรณ์ส่งค่า 0 ตลอด — ต้องตรวจเซนเซอร์")
          : t("ไม่เกิน {max} {unit}", { max: formatNumber(max), unit: limit.unit }),
      };
    }),
  ];

  /* ---------- กลุ่ม "ภายนอกโรงเรือน" ----------
     ใช้แผ่นค่าหน้าตาเดียวกับภายในเป๊ะ (ไอคอน + ตัวเลข + ป้ายสถานะ + คำอธิบาย + หลอด)
     ต่างกันแค่สีวงไอคอนเป็นทอง เพื่อให้กวาดตาแล้วรู้ทันทีว่ากำลังดูฝั่งไหน
     เกณฑ์ตัดสินอยู่ที่ `lib/outdoor.js` ใช้ร่วมกับหน้าสภาพอากาศ */
  const outsideMetrics = [
    {
      key: "outTemp",
      icon: "thermometer",
      label: t("อุณหภูมิ"),
      value: dash(outdoor?.tempC, formatNumber1),
      unit: "°C",
      status: outdoorStatus("tempC", outdoor?.tempC ?? null),
      pct: outdoorPct("tempC", outdoor?.tempC),
      range:
        stuckNote("temp_c", "out") ??
        gapNote(
          outdoor?.tempC,
          barn?.tempC,
          formatNumber1,
          "°C",
          "ร้อนกว่าข้างใน {value}",
          "เย็นกว่าข้างใน {value}",
        ) ?? t("ไม่มีค่าในโรงเรือนให้เทียบ"),
    },
    {
      key: "outHumidity",
      icon: "drop",
      label: t("ความชื้น"),
      value: dash(outdoor?.humidity),
      unit: "%RH",
      status: outdoorStatus("humidity", outdoor?.humidity ?? null),
      pct: outdoorPct("humidity", outdoor?.humidity),
      range:
        stuckNote("humidity", "out") ??
        gapNote(
          outdoor?.humidity,
          barn?.humidity,
          formatNumber,
          "%",
          "ชื้นกว่าข้างใน {value}",
          "แห้งกว่าข้างใน {value}",
        ) ?? t("ไม่มีค่าในโรงเรือนให้เทียบ"),
    },
    {
      key: "outWind",
      icon: "fan",
      label: t("ลม"),
      value: dash(outdoor?.wind, formatNumber1),
      unit: "m/s",
      status: outdoorStatus("wind", outdoor?.wind ?? null),
      pct: outdoorPct("wind", outdoor?.wind),
      range:
        stuckNote("wind_ms", "out") ??
        gapNote(
          outdoor?.wind,
          barn?.windSpeed,
          formatNumber1,
          "m/s",
          "แรงกว่าข้างใน {value}",
          "เบากว่าข้างใน {value}",
        ) ?? t("ไม่มีค่าในโรงเรือนให้เทียบ"),
    },
    /* ═══ แถวล่างฝั่งนอก = ก๊าซชุดเดียวกับฝั่งใน (ผู้ใช้สั่ง 3 ก.ย. 2569) ═══
       สองฝั่งจึงเป็นตารางรูปเดียวกันเป๊ะ ต่างกันแค่ "วัดที่ไหน" อย่างเดียว

       **เสาอากาศไม่มีเซนเซอร์ก๊าซ ทั้งสามใบจึงขึ้น "ไม่มีสัญญาณ"** ซึ่งเป็นคำตอบที่ตรง
       กับความจริง: อากาศข้างนอกไม่มีใครวัดก๊าซให้ ไม่ใช่ว่าวัดแล้วได้ศูนย์
       (ห้ามเอาค่าก๊าซของข้างในมาโชว์ซ้ำตรงนี้เด็ดขาด จะกลายเป็นบอกว่าวัดข้างนอกได้) */
    ...["co2"].map((key) => {
      const limit = AIR_LIMITS[key];
      return {
        key: `out-${key}`,
        icon: limit.icon,
        label: limit.label.split(" ").at(-1),
        value: dash(null),
        unit: limit.unit,
        status: { tone: "offline", label: "ไม่มีสัญญาณ" },
        pct: 0,
        range: t("เสาอากาศไม่มีเซนเซอร์ก๊าซ"),
      };
    }),
  ];

  /* ต้องส่งเกณฑ์ของผู้ใช้เข้าไปด้วย เพราะข้อความและระดับของแจ้งเตือนคำนวณจากเกณฑ์
     (ถ้าปล่อยว่างจะได้เกณฑ์มาตรฐาน แล้วเรื่องเดียวกันจะขึ้นคนละตัวเลขกับหน้าศูนย์การแจ้งเตือน) */
  const farmAlerts = useMemo(() => {
    const limits = {
      tempMin: settings.comfort.tempMin,
      tempMax: settings.comfort.tempMax,
      humidityMax: settings.comfort.humidityMax,
      nh3Limit: settings.comfort.nh3Limit,
    };
    /* ฟาร์มจริงไม่ได้อยู่ในตัวคิดแจ้งเตือนฝั่งหน้าเว็บ (allAlerts วนเฉพาะฟาร์มตัวอย่าง)
       ของจริงมาจากเครื่องคิดแจ้งเตือนที่หลังบ้าน จึงต้องรวมสองแหล่งตรงนี้
       เรียงใหม่→เก่าเหมือนกัน หน้าจอจึงไม่ต้องรู้ว่ารายการไหนมาจากไหน */
    return [...liveAlerts, ...allAlerts(limits)]
      .filter((a) => a.farmId === farmId)
      .sort((a, b) => new Date(b.time) - new Date(a.time));
  }, [farmId, liveAlerts, settings.comfort]);

  return (
    <>
      <PageHeader
        title={t("ระบบควบคุมสภาพแวดล้อม")}
        subtitle={t("ENV Sensor · {barn} · อัปเดตล่าสุด {time}", {
          barn: barn ? t(barn.name) : "—",
          time: formatDateTime(farm?.updatedAt),
        })}
        action={
          <div className="ev-head-actions">
            {/* THI ย่อเป็นกล่องเล็กข้างปุ่มเลือกโรงเรือน — เดิมเป็นกล่องเต็มความกว้างบนกระดาน
                ซึ่งกินที่ทั้งแถบทั้งที่มีเลขตัวเดียวกับข้อความสองบรรทัด
                อยู่ในหัวหน้าแล้วเห็นตลอดเวลาโดยไม่ต้องเลื่อน และไม่แย่งที่ของค่าที่วัดได้ */}
            <button
              type="button"
              className={
                "ev-thi-chip is-" + (level?.tone ?? "offline") + (thiOpen ? " is-open" : "")
              }
              onClick={() => setThiOpen((v) => !v)}
              aria-expanded={thiOpen}
            >
              <span className="ev-thi-chip-top">
                <b className="num">{dash(thi, formatNumber)}</b>
                <em>THI</em>
                <StatusBadge tone={level?.tone ?? "offline"}>
                  {t(level?.label ?? "ไม่มีสัญญาณ")}
                </StatusBadge>
                {/* ลูกศรบอกว่ากดได้ — ไม่งั้นกล่องดูเหมือนป้ายเฉย ๆ ไม่มีใครรู้ว่ามีคำแนะนำซ่อนอยู่ */}
                <Icon
                  name="chevron"
                  size={16}
                  className="ev-thi-chip-arrow"
                  aria-hidden="true"
                />
              </span>
              {thiOpen && (
                <span className="ev-thi-chip-note">
                  {t(level?.text ?? "ยังคำนวณไม่ได้เพราะไม่มีค่าจากเซนเซอร์")}
                </span>
              )}
            </button>

          {/* ปุ่มเดียวของหน้า อยู่นอกการ์ดทั้งหมด เพราะกดแล้วเปลี่ยนทั้งหน้า */}
          <button
            type="button"
            className="ev-scope-btn"
            onClick={() => setPickerOpen(true)}
            aria-haspopup="dialog"
          >
            <span className="ev-scope-icon" aria-hidden="true">
              <Icon name="home" size={20} />
            </span>
            <span className="ev-scope-text">
              <span>{t("กำลังดู")}</span>
              <b>
                {t("{farm} · {barn}", {
                  farm: farm ? t(farm.name) : t("ยังไม่มีฟาร์ม"),
                  barn: barn ? t(barn.name) : t("เลือกโรงเรือน"),
                })}
              </b>
            </span>
            {/* **ป้าย "ข้อมูลจริง / ข้อมูลตัวอย่าง" ถูกเอาออกจากปุ่มนี้** (ผู้ใช้สั่ง 1 ก.ย. 2569
                เพื่อให้กล่องเล็กลง) — ป้ายเดิมกว้าง 97px คิดเป็นหนึ่งในสี่ของปุ่มทั้งใบ

                **สิ่งที่หายไปพร้อมกัน**: หน้านี้ไม่มีที่ไหนบอกแล้วว่าตัวเลขที่เห็นมาจาก
                เซนเซอร์จริงหรือเป็นค่าจำลอง (ป้าย "อ่านค่าตามเวลาจริง" ข้างการ์ดบอกแค่ว่า
                เซนเซอร์ยังส่งค่าอยู่ ไม่ได้บอกว่าเป็นของจริงหรือของสมมติ — คนละเรื่องกัน)
                หน้าฟาร์มและหน้ารายละเอียดโรงเรือนยังติดป้ายนี้อยู่ ถ้าอยากได้กลับมาแบบไม่กินที่
                ย้ายไปต่อท้ายคำโปรยใต้ชื่อหน้าได้ ตรงนั้นมีที่เหลือ */}
            <span className="ev-scope-change">
              {t("เปลี่ยน")}
              <Icon name="chevron" size={18} className="ev-scope-arrow" aria-hidden="true" />
            </span>
          </button>
          </div>
        }
      />

      <ClimatePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        farmId={farmId}
        barnId={barn?.id}
        subtitle={t("เลือกได้ทั้งฟาร์มและโรงเรือน แล้วทั้งหน้าจะเปลี่ยนตามหลังที่เลือก")}
        confirmLabel={t("ดูโรงเรือนนี้")}
        onConfirm={({ farmId: nextFarm, barnId: nextBarn }) => {
          setPickedFarmId(nextFarm);
          setBarnId(nextBarn);
          /* replace ไม่ใช่ push — การเลือกโรงเรือนไม่ควรกองอยู่ในประวัติจนกดย้อนกลับ
             ต้องกดหลายทีกว่าจะออกจากหน้านี้ */
          setParams({ farm: nextFarm, barn: nextBarn }, { replace: true });
        }}
      />

      <PageBoard boardId={BOARD_ID}>
        {/* ============ 1. ตอนนี้ — ภายในโรงเรือน (ซ้าย) | ภายนอกโรงเรือน (ขวา) ============ */}
        <Block id="now" label={t("สภาพแวดล้อมตอนนี้")}>
          <Card className="ev-now">
            <header className="ev-panel-head">
              <span className="icon-chip is-sm" aria-hidden="true">
                <Icon name="pulse" size={18} />
              </span>
              <h3>
                {t("สภาพแวดล้อมตอนนี้")}{" "}
                <span className="ev-panel-en">{barn ? t(barn.name) : "—"}</span>
              </h3>
              {/* ปุ่มเดียวกางคำอธิบายของทั้งการ์ด — ไม่ใช่ปุ่มละกลุ่ม
                  เพราะคนที่อยากอ่านเกณฑ์ มักอยากอ่านทั้งสองฝั่งพร้อมกันเพื่อเทียบ */}
              <NotesToggle on={showNotes} onToggle={() => setShowNotes((v) => !v)} />
              {!offline && isDemo ? (
                <span className="ev-source">
                  <DataSourceBadge source="demo" />
                </span>
              ) : (
                <span className={"ev-live" + (offline ? " is-off" : "")}>
                  <span className="ev-live-dot" aria-hidden="true" />
                  {offline ? t("ไม่มีสัญญาณ") : "LIVE"}
                </span>
              )}
            </header>

            <div className={"ev-now-body" + (showNotes ? "" : " is-plain")}>
              {/* ---- ซ้าย: ภายในโรงเรือน — ค่าที่มีเกณฑ์ตัดสินและคุมได้ ---- */}
              <section className="ev-group is-in">
                <p className="ev-group-head">
                  <Icon name="home" size={17} aria-hidden="true" />
                  {t("ภายในโรงเรือน")}
                  <span>{t("เทียบกับเกณฑ์ที่ตั้งไว้ในหน้าตั้งค่า")}</span>
                </p>
                <ul className="ev-metrics">
                  {metrics.map(({ key, ...item }) => (
                    <Metric key={key} {...item} />
                  ))}
                </ul>
              </section>

              {/* ---- ขวา: ภายนอกโรงเรือน — ไม่มีเกณฑ์ตัดสิน เพราะคุมอากาศข้างนอกไม่ได้
                     มีไว้เทียบว่าที่ข้างในร้อน/ชื้น เป็นเพราะข้างนอกหรือเพราะระบบในโรงเรือน ---- */}
              <section className="ev-group is-out">
                <p className="ev-group-head">
                  <Icon name="cloud" size={17} aria-hidden="true" />
                  {t("ภายนอกโรงเรือน")}
                  <span>
                    {updatedText(t, outdoor)}
                  </span>
                </p>
                <ul className="ev-metrics">
                  {outsideMetrics.map(({ key, ...item }) => (
                    <Metric key={key} {...item} />
                  ))}
                </ul>
              </section>
            </div>

            {/* ═══ ค่าที่เซนเซอร์ส่งมาแต่ยังไม่มีในทะเบียน (T1.346) ═══
                เดิมค่าพวกนี้ถูกข้ามเงียบ ๆ ตั้งแต่ `bagOf` — เซนเซอร์ชนิดใหม่จึงไม่ขึ้นบนจอ
                โดยไม่มีอะไรบอก ตรงนี้จึงขึ้นให้เห็นว่ามีอะไรไหลเข้ามาแต่ยังไม่ได้ตั้งเกณฑ์
                ★ ไม่มีค่า = ซ่อนทั้งก้อน ไม่ขึ้นหัวข้อว่างให้คนสงสัยว่าพังหรือเปล่า */}
            <MetricTiles
              items={[...(barn?.extras?.inside ?? []), ...(barn?.extras?.outdoor ?? [])]}
              title="ค่าอื่นที่เซนเซอร์ส่งมา"
            />
          </Card>
        </Block>

        {/* ============ 2. ย้อนหลัง — กราฟทั้งหมดอยู่การ์ดเดียว สลับด้วยแท็บ ============ */}
        <Block id="trend" label={t("ข้อมูลย้อนหลัง")}>
          <Card className="ev-chart-card">
            <header className="ev-panel-head">
              <span className="icon-chip is-sm" aria-hidden="true">
                <Icon name="chart" size={18} />
              </span>
              {/* บอกให้ชัดว่า "ย้อนหลังอะไร ของโรงเรือนไหน ย้อนไปเท่าไร"
                  ลำพังคำว่า "ย้อนหลัง" ไม่พอ — บนหน้ามีทั้งค่าอากาศ ค่าก๊าซ อุปกรณ์ และไฟฟ้า */}
              <h3>
                {t("ย้อนหลัง {range}", {
                  range: t(RANGES.find((r) => r.id === rangeId)?.label ?? ""),
                })}{" "}
                <span className="ev-panel-en">
                  {t("{series} · {barn}", {
                    series: t(TRENDS.find((item) => item.id === trend)?.label ?? ""),
                    barn: barn ? t(barn.name) : "—",
                  })}
                </span>
              </h3>
              <RangeTabs value={rangeId} onChange={setRangeId} options={RANGES} />
            </header>

            <div className="ev-tabs" role="tablist" aria-label={t("ชุดข้อมูลที่ดูย้อนหลัง")}>
              {TRENDS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={trend === item.id}
                  className={"ev-tab" + (trend === item.id ? " is-on" : "")}
                  onClick={() => setTrend(item.id)}
                >
                  <Icon name={item.icon} size={18} aria-hidden="true" />
                  {t(item.label)}
                </button>
              ))}
            </div>

            {/* ★ เส้นที่เซนเซอร์ค้างถูกตัดออกจากกราฟแล้ว — **ต้องบอกว่าตัดอะไรไปและทำไม** (T1.304)
                ถ้าหายไปเฉย ๆ คนอ่านจะนึกว่าเซนเซอร์ตัวนั้นไม่มี ซึ่งคนละเรื่องกับ "มีแต่เชื่อไม่ได้" */}
            {live.stuck?.length > 0 && (
              <p className="ev-stuck">
                <StatusBadge tone="offline">{t("ค่าค้าง")}</StatusBadge>
                {t("ไม่ได้วาดเส้น {list} เพราะส่งค่าเดิมซ้ำตลอดช่วง — เซนเซอร์ยังส่งข้อมูลอยู่แต่ไม่ได้วัดจริง", {
                  list: live.stuck.map((name) => t(name)).join(" · "),
                })}
              </p>
            )}

            {/* กราฟบอก "รูปร่าง" ของช่วงนั้น แต่ไม่ได้บอกว่าพีคไปเท่าไรและอยู่นอกเกณฑ์นานแค่ไหน
                แถบนี้ตอบสามคำถามนั้นในบรรทัดเดียว (ย้ายมาจากหน้า /dashboard/climate ที่ถูกยุบ) */}
            {climateSummary && (
              <ul className="ev-stats">
                <li>
                  <span>{t("อุณหภูมิ สูงสุด · ต่ำสุด")}</span>
                  <b className="num">
                    {formatNumber1(climateSummary.tempMax)} · {formatNumber1(climateSummary.tempMin)} °C
                  </b>
                </li>
                <li>
                  <span>{t("อุณหภูมิเฉลี่ย")}</span>
                  <b className="num">{formatNumber1(climateSummary.tempAvg)} °C</b>
                </li>
                <li>
                  <span>{t("ความชื้น สูงสุด · ต่ำสุด")}</span>
                  <b className="num">
                    {formatNumber(climateSummary.humidityMax)} · {formatNumber(climateSummary.humidityMin)}%
                  </b>
                </li>
                <li>
                  <span>{t("ความชื้นเฉลี่ย")}</span>
                  <b className="num">{formatNumber(climateSummary.humidityAvg)}%</b>
                </li>
              </ul>
            )}

            {climateData.length === 0 ? (
              <p className="fx-empty">
                {t("เซนเซอร์ของโรงเรือนนี้ไม่ส่งค่า — ยังไม่มีข้อมูลย้อนหลัง")}
              </p>
            ) : trend === "climate" ? (
              <>
                {/* สองค่าคนละหน่วย จึงเป็นกราฟคนละใบซ้อนกัน ใบละแกน Y เดียว (ห้าม dual-axis) */}
                <div className="ev-mini">
                  <p className="ev-mini-head">
                    {t("อุณหภูมิ (°C)")}
                    <span className="num">
                      {t("ใน")} {dash(barn?.tempC, formatNumber1)} · {t("นอก")}{" "}
                      {dash(outdoor?.tempC, formatNumber1)}
                    </span>
                  </p>
                  <ResponsiveContainer width="100%" height={MINI_CHART_HEIGHT}>
                    <LineChart data={climateData} margin={{ top: 4, right: 10, bottom: 0, left: -14 }}>
                      <CartesianGrid {...gridProps} />
                      <ReferenceArea y1={tempRange.min} y2={tempRange.max} {...comfortBandProps} />
                      <XAxis
                        dataKey="t"
                        {...axisProps}
                        interval={tickStep(climateData)}
                        minTickGap={8}
                        tickFormatter={(i) => climateData[i]?.hour ?? ""}
                      />
                      <YAxis
                        {...axisProps}
                        width={38}
                        tickCount={4}
                        domain={paddedDomain(
                          climateData.flatMap((p) => [p.tempC, p.tempOut]),
                          1.5,
                          { band: tempRange }
                        )}
                      />
                      <Tooltip
                        {...tooltipStyle}
                        formatter={(value, name) => [`${formatNumber1(value)} °C`, name]}
                        labelFormatter={(i) => climateData[i]?.hour ?? ""}
                      />
                      <Line
                        type="monotone"
                        dataKey="tempC"
                        name={t("ในโรงเรือน")}
                        stroke={TEMP_COLOR}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="tempOut"
                        name={t("ภายนอก")}
                        stroke={TEMP_COLOR}
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="ev-mini">
                  <p className="ev-mini-head">
                    {t("ความชื้น (%RH)")}
                    <span className="num">
                      {t("ใน")} {dash(barn?.humidity)} · {t("นอก")} {dash(outdoor?.humidity)}
                    </span>
                  </p>
                  <ResponsiveContainer width="100%" height={MINI_CHART_HEIGHT}>
                    <LineChart data={climateData} margin={{ top: 4, right: 10, bottom: 0, left: -14 }}>
                      <CartesianGrid {...gridProps} />
                      <ReferenceArea
                        y1={humidityRange.min}
                        y2={humidityRange.max}
                        {...comfortBandProps}
                      />
                      <XAxis
                        dataKey="t"
                        {...axisProps}
                        interval={tickStep(climateData)}
                        minTickGap={8}
                        tickFormatter={(i) => climateData[i]?.hour ?? ""}
                      />
                      <YAxis
                        {...axisProps}
                        width={38}
                        tickCount={4}
                        domain={paddedDomain(
                          climateData.flatMap((p) => [p.humidity, p.humidityOut]),
                          5,
                          { floor: 0, ceil: 100, band: humidityRange }
                        )}
                      />
                      <Tooltip
                        {...tooltipStyle}
                        formatter={(value, name) => [`${formatNumber(value)}%`, name]}
                        labelFormatter={(i) => climateData[i]?.hour ?? ""}
                      />
                      <Line
                        type="monotone"
                        dataKey="humidity"
                        name={t("ในโรงเรือน")}
                        stroke={HUMID_COLOR}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="humidityOut"
                        name={t("ภายนอก")}
                        stroke={HUMID_COLOR}
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <ChartLegend
                  items={[
                    { label: t("อุณหภูมิในโรงเรือน"), color: TEMP_COLOR },
                    { label: t("ความชื้นในโรงเรือน"), color: HUMID_COLOR },
                    { label: t("เส้นประ = ภายนอก"), color: "var(--ink-muted)" },
                  ]}
                />
              </>
            ) : (
              <>
                {/* ห่อเป็นแผงเดียวกับกราฟฝั่งอุณหภูมิ/ความชื้น ทั้งสองแท็บจึงหน้าตาเดียวกัน */}
                <div className="ev-mini">
                  <p className="ev-mini-head">
                    {t("ก๊าซในอากาศ (ppm)")}
                    <span className="num">
                      NH₃ {dash(gases.nh3)} · CO₂ {dash(gases.co2)} · H₂S{" "}
                      {dash(gases.h2s, formatNumber1)}
                    </span>
                  </p>
                  {/* **ไม่มีค่าแล้วห้ามวาดกรอบกราฟเปล่าทิ้งไว้** — กรอบที่มีแกนเวลาครบ
                      แต่ไม่มีเส้น อ่านได้เป็น "วัดแล้วได้ศูนย์" ทั้งที่ความจริงคือไม่มีเซนเซอร์วัด
                      (กติกาเดียวกับกราฟในหน้ารายละเอียดโรงเรือน — T1.167) */}
                  {!hasGas ? (
                    <p className="ev-gas-empty">
                      <Icon name="power" size={16} aria-hidden="true" />
                      {t("โรงเรือนนี้ยังไม่มีเซนเซอร์ที่วัดก๊าซได้ — จึงยังไม่มีกราฟย้อนหลังให้แสดง")}
                    </p>
                  ) : (
                  <ResponsiveContainer width="100%" height={GAS_CHART_HEIGHT}>
                    <LineChart data={gasData} margin={{ top: 4, right: 10, bottom: 0, left: -14 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis
                        dataKey="t"
                        {...axisProps}
                        interval={tickStep(gasData)}
                        minTickGap={8}
                        tickFormatter={(i) => gasData[i]?.hour ?? ""}
                      />
                      {/* ปล่อยขอบบนให้คำนวณเอง ไม่งั้นเส้น CO₂ ที่สูงกว่าค่าที่ตรึงไว้จะโดนตัดหัว */}
                      <YAxis {...axisProps} width={38} domain={[0, "auto"]} />
                      <Tooltip
                        {...tooltipStyle}
                        formatter={(value, name, item) => {
                          /* กล่องข้อมูลบอกค่าจริง ไม่ใช่ค่าที่ย่อ/ขยายไว้เพื่อวาดกราฟ */
                          const line = GAS_LINES.find(
                            (l) => l.name === name || l.key === item?.dataKey
                          );
                          const real = line ? value / line.scale : value;
                          return [
                            `${line?.key === "h2s" ? formatNumber1(real) : formatNumber(real)} ppm`,
                            name,
                          ];
                        }}
                        labelFormatter={(i) => gasData[i]?.hour ?? ""}
                      />
                      {GAS_LINES.map((line) => (
                        <Line
                          key={line.key}
                          type="monotone"
                          dataKey={line.key}
                          name={line.name}
                          stroke={line.color}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                  )}

                  {/* legend มีเฉพาะตอนมีเส้นให้อ่าน — ไม่มีเส้นแล้วยังโชว์คำอธิบายสี
                      จะกลายเป็นบอกว่า "มีสามเส้นนะ" ทั้งที่ไม่มีสักเส้น */}
                  {hasGas && (
                    <ChartLegend
                      items={GAS_LINES.map((line) => ({ label: line.name, color: line.color }))}
                    />
                  )}
                </div>
              </>
            )}
          </Card>
        </Block>

        {/* ============ 3. การแจ้งเตือนของฟาร์ม ============ */}
        <Block id="alerts" label={t("การแจ้งเตือนของฟาร์ม")}>
          <Card
            className="ev-alert-card"
            icon="bell"
            title={t("การแจ้งเตือน ({n})", { n: formatNumber(farmAlerts.length) })}
            subtitle={
              farm
                ? t("เรื่องที่ค้างอยู่ใน {farm}", { farm: t(farm.name) })
                : t("ยังไม่มีฟาร์มให้ติดตาม")
            }
            action={{
              to: "/dashboard/alerts",
              label: t("ดูการแจ้งเตือนทั้งหมด"),
              icon: "list",
            }}
          >
            {farmAlerts.length === 0 ? (
              <p className="fx-empty">{t("ไม่มีการแจ้งเตือนค้างอยู่ในฟาร์มนี้")}</p>
            ) : (
              /* กดที่แถวไหนก็กางคำแนะนำของข้อนั้น กดซ้ำเพื่อพับ
                 ชื่อโรงเรือนยังเป็นลิงก์แยกอยู่ข้างใน จึงกันไม่ให้การกดลิงก์ไปโดนปุ่มกางด้วย */
              <ul className="ev-alerts">
                {farmAlerts.slice(0, ALERT_LIMIT).map((alert) => {
                  const open = openAlert === alert.id;
                  return (
                    <li
                      key={alert.id}
                      className={
                        `ev-alert is-${alert.level}` +
                        (alert.barnId === barn?.id ? " is-picked" : "") +
                        (open ? " is-open" : "")
                      }
                    >
                      <button
                        type="button"
                        className="ev-alert-row"
                        onClick={() => setOpenAlert(open ? null : alert.id)}
                        aria-expanded={open}
                        aria-controls={`ev-advice-${alert.id}`}
                      >
                        <span className="ev-alert-text">
                          <b>{alertTitle(t, alert)}</b>
                          <span className="ev-alert-meta">
                            {t("{barn} · {time}", {
                              barn: t(alert.barnName),
                              time: formatTime(alert.time),
                            })}
                          </span>
                        </span>
                        <StatusBadge tone={alert.level}>{t(levelLabel(alert.level))}</StatusBadge>
                        {/* บอกว่ากดได้และตอนนี้กางอยู่หรือยัง — มีทั้งไอคอนและข้อความ */}
                        <span className="ev-alert-more">
                          <Icon name="spark" size={15} aria-hidden="true" />
                          {open ? t("ซ่อน") : t("คำแนะนำ AI")}
                        </span>
                      </button>

                      {open && (
                        <div className="ev-advice" id={`ev-advice-${alert.id}`}>
                          <p className="ev-advice-head">
                            <Icon name="spark" size={16} aria-hidden="true" />
                            {t("คำแนะนำจาก AI · {barn}", { barn: t(alert.barnName) })}
                          </p>
                          <ol className="ev-advice-list">
                            {adviceFor(alert).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                          {/* ลิงก์ไปหน้าโรงเรือนนั้นย้ายลงมาอยู่ในคำแนะนำ — เดิมชื่อโรงเรือน
                              เป็นลิงก์อยู่ในแถว ซึ่งกดชนกับปุ่มกางคำแนะนำ */}
                          <Link
                            className="ev-advice-link"
                            to={`/dashboard/climate/${alert.farmId}/${alert.barnId}`}
                          >
                            <Icon name="home" size={15} aria-hidden="true" />
                            {t("เปิดหน้า{barn}", { barn: t(alert.barnName) })}
                          </Link>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </Block>

        {/* ============ เทียบกับโรงเรือนอื่นในฟาร์มเดียวกัน ============
            ย้ายมาจากมุมมอง "เปรียบเทียบ" ของหน้า /dashboard/climate ที่ถูกยุบ (T1.140)
            เป็นของชิ้นเดียวที่หน้านั้นมีแล้วหน้านี้ไม่มี */}
        <Block id="siblings" label={t("เทียบกับโรงเรือนอื่น")}>
          <Card
            className="ev-compare-card"
            icon="list"
            /* ชื่อฟาร์มไม่อยู่ในหัวข้อ — การ์ดนี้กว้างแค่ 4 ช่อง หัวข้อยาว 36 ตัวอักษร
               ตัดเป็นสองบรรทัดตั้งแต่จอ 1440 และสี่บรรทัดที่จอ 1050
               ย้ายไปอยู่คำโปรยบรรทัดล่างซึ่งเป็นตัวเล็กและมีที่ให้ไหลมากกว่า
               (หัวหน้าบอกอยู่แล้วว่ากำลังดูฟาร์มไหน จึงไม่ได้หายไปไหน) */
            title={t("เทียบกับโรงเรือนอื่น")}
            /* คำโปรยบอกคำตอบที่คนอยากรู้ที่สุดไว้เลย ("หลังไหนร้อนสุด") โดยไม่กินความสูงเพิ่ม
               การ์ดนี้อยู่คอลัมน์ขวาที่แคบ ใส่รายการเต็มไม่ได้ — รายการเต็มอยู่ในหน้าเทียบแล้ว */
            subtitle={
              hottest
                ? t("{farm} · {n} หลังที่ส่งค่าอยู่ · ร้อนที่สุดคือ {barn} {temp} °C", {
                    farm: farm ? t(farm.name) : t("ฟาร์มนี้"),
                    n: formatNumber(siblings.length),
                    barn: t(hottest.name),
                    temp: formatNumber1(hottest.tempC),
                  })
                : t("{farm} ยังไม่มีโรงเรือนที่ส่งค่าเซนเซอร์", {
                    farm: farm ? t(farm.name) : t("ฟาร์มนี้"),
                  })
            }
            /* กดแล้ว **ไปหน้าเทียบโรงเรือนโดยเฉพาะ** ไม่ใช่กางในการ์ดเหมือนเดิม
               (ผู้ใช้สั่ง 1 ก.ย. 2569) — การ์ดกว้าง 4 ช่องกางได้แค่แถบอุณหภูมิอย่างเดียว
               ส่วนหน้าเต็มเทียบได้ทั้งอุณหภูมิ ความชื้น แอมโมเนีย และ THI พร้อมกราฟกับตาราง
               พารหัสฟาร์มกับโรงเรือนที่กำลังดูไปด้วย หน้าปลายทางจะได้เปิดถูกฟาร์ม
               และไฮไลต์ให้ว่ามาจากหลังไหน */
            action={{
              to: `/dashboard/environment/compare?farm=${encodeURIComponent(farmId)}${
                barn ? `&barn=${encodeURIComponent(barn.id)}` : ""
              }`,
              label: t("ดูการเปรียบเทียบ"),
              icon: "chart",
            }}
          />
        </Block>

        {/* ============ 4-6. อุปกรณ์ · ไฟฟ้า · ผังเซนเซอร์ ============ */}
        <Block id="equipment" label={t("ควบคุมพัดลมและปั๊มน้ำ")}>
          {equipment && (
            <EquipmentPanel
              title={t("ควบคุมอุปกรณ์ · {barn}", { barn: barn ? t(barn.name) : "" })}
              equipment={equipment}
              onToggleFan={(i) => command(toggleFan(equipment, i), fanCommand(equipment, i))}
              onTogglePump={(i) => command(togglePump(equipment, i), pumpCommand(equipment, i))}
              control={controlReady ? control : null}
            />
          )}
        </Block>

        <Block id="electrical" label={t("ระบบไฟฟ้าของโรงเรือน")}>
          <ElectricalPanel electrical={electrical} demo={isDemo} />
        </Block>

        <Block id="sensorMap" label={t("ผังเซนเซอร์ในโรงเรือน")}>
          <SensorMap
            map={sensorMap}
            equipment={equipment}
            barnName={barn?.name ?? "—"}
            demo={isDemo}
            comfort={comfort}
            nh3Limit={nh3Limit}
          />
        </Block>
      </PageBoard>
    </>
  );
}
