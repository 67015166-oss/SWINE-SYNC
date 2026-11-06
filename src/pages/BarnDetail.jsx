/**
 * หน้า "ภายในโรงเรือน" — เส้นทาง /dashboard/farms/:farmId/barns/:barnId
 *
 * หน้านี้มีเลย์เอาต์ของตัวเอง (แถบเมนูซ้ายเต็มความสูง + แถบบนของหน้า) จึงไม่ได้อยู่ใน AppLayout
 * โครงตามแบบที่ผู้ใช้กำหนด (ไล่จากบนลงล่าง):
 *   1. สรุปจำนวนสุกรวันนี้ 5 กล่อง — ทั้งหมด / AI นับได้ / ขาดหาย / ป่วย / ตาย
 *   2. A กล้อง AI (ภาพ + ปุ่มขยาย/บันทึกภาพ + ปุ่มเลือกกล้อง + ภาพที่บันทึกไว้
 *      + ค่าสภาพแวดล้อมปัจจุบัน 4 ค่า)
 *      B แนวโน้มสภาพแวดล้อม (กราฟย้อนหลัง 4 ใบ เลือกช่วงเวลาได้)
 *   3. การแจ้งเตือนของโรงเรือน + แผงคำแนะนำจาก AI
 *   4. ฟอร์มบันทึกข้อมูล + ตารางรายการ (เพิ่ม แก้ไข ลบ) พร้อมแบ่งหน้า
 *
 * กราฟทุกใบมีค่าเดียวจึงมีแกน Y เดียวและไม่ต้องมี legend
 * สีผูกกับตัวชี้วัดถาวร: อุณหภูมิ = ส้ม · ความชื้น = น้ำเงิน · ลม = เขียว · NH₃ = ม่วง
 * (อุณหภูมิ/ความชื้นใช้สีเดียวกับหน้า /dashboard/climate ห้ามสลับ)
 *
 * บันทึกของผู้ใช้เก็บใน state ของหน้านี้เท่านั้น (ยังไม่มี backend) — รีเฟรชแล้วกลับค่าตั้งต้น
 * เมื่อต่อ API จริง ให้แทนที่ตัวจัดการ submit/remove ด้วยการเรียก API แล้วโครงหน้าไม่ต้องแก้
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { asset } from "../lib/asset.js";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import Card from "../components/ui/Card.jsx";
import PageBoard, { Block } from "../components/board/PageBoard.jsx";
import Icon from "../components/ui/Icon.jsx";
import CameraView from "../components/ui/CameraView.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import BackButton from "../components/ui/BackButton.jsx";
import HomeButton from "../components/ui/HomeButton.jsx";
import SettingsButton from "../components/ui/SettingsButton.jsx";
import BarnArt from "../components/ui/BarnArt.jsx";
import AppSidebar from "../components/layout/AppSidebar.jsx";
import AppBrand from "../components/layout/AppBrand.jsx";
import { useSettings } from "../lib/settings/useSettings.js";
import { useAuth } from "../lib/auth/useAuth.js";
import AdminNote from "../components/ui/AdminNote.jsx";
import { getBarnInsights, BARN_STATUS_LABEL } from "../data/mock/barnsByFarm.js";
import { shiftDate } from "../data/mock/asOf.js";
import { useAllFarms } from "../lib/records/useAllFarms.js";
import { getBarnTrend, TREND_RANGES } from "../data/mock/climate.js";
import { useBarnHistory } from "../lib/api/useBarnHistory.js";
import {
  SERIES,
  gridProps,
  axisProps,
  tooltipStyle,
  paddedDomain,
} from "../lib/chartTheme.js";
import { formatDateShort, formatNumber, formatNumber1, formatTime, formatWhen } from "../lib/format.js";
import { heldDisplay } from "../lib/heldReading.js";
import { useSnapshots, SNAPSHOT_LIMIT } from "../lib/snapshots.js";
import { useBarnLog } from "../lib/barnLog.js";
import { HERD_REASON, herdFromLogs } from "../lib/herdCount.js";
import { LOG_TYPES, UNITS } from "../lib/barnLogTypes.js";
import "./BarnDetail.css";
import { useT } from "../lib/i18n/useT.js";

/** ความสูงของกราฟย่อยในการ์ด B — เตี้ยกว่ากราฟเต็มใบ (CHART_HEIGHT) เพราะมีสี่ใบในการ์ดเดียว */
const MINI_CHART_HEIGHT = 116;


/* ประเภท/หน่วยของบันทึกย้ายไปไว้ที่ lib/barnLogTypes.js — หน้ารายงานส่งเวรใช้ชุดเดียวกัน (T1.269) */
const PAGE_SIZES = [10, 20, 50];

const typeOf = (value) => LOG_TYPES.find((kind) => kind.value === value);
const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * กราฟแนวโน้มหนึ่งค่า (การ์ด B) — หัวกราฟ: ไอคอน + ชื่อค่า + ค่าล่าสุด แล้วตามด้วยเส้น
 * หนึ่งใบมีค่าเดียวจึงมีแกน Y เดียวและไม่ต้องมี legend ตามกติกาใน DESIGN.md
 */
function TrendChart({ metric, data }) {
  const t = useT();
  const values = data.map((p) => p[metric.dataKey]);
  /* ป้ายแกนเวลาแสดงราว 4 จุด ไม่ว่าจะเลือกช่วงกี่ชั่วโมง */
  const interval = Math.max(0, Math.floor(data.length / 4) - 1);
  /* ค่านี้มีข้อมูลให้วาดจริงไหม — โรงเรือนหนึ่งอาจมีเซนเซอร์บางตัวเท่านั้น
     (กำแพงเพชรวัดได้แค่อุณหภูมิ/ความชื้น/ลม ส่วน NH₃ ไม่มีเซนเซอร์ที่อ่านค่าได้) */
  const hasData = values.some((v) => v != null);

  return (
    <div className="bl-trend">
      <p className="bl-trend-head">
        <span className={`bl-trend-icon is-${metric.accent}`} aria-hidden="true">
          <Icon name={metric.icon} size={18} />
        </span>
        {/* **หน่วยอยู่ในป้ายค่าล่าสุดข้าง ๆ อยู่แล้ว** (เช่น "0.6 ม./วิ" · "— ppm")
            เขียนซ้ำในหัวกราฟทำให้ "ความเร็วลม (ม./วิ)" ยาวจนตกบรรทัดที่ความกว้างนี้
            หัวสูงขึ้น 20px แล้วกราฟใบนั้นกับใบข้าง ๆ ในแถวเดียวกันสูงไม่เท่ากันทันที */}
        <b>{t(metric.label)}</b>
        <span className="bl-trend-now">{metric.now}</span>
      </p>

      {/* **ไม่มีข้อมูลแล้วห้ามวาดกรอบกราฟเปล่าทิ้งไว้** — กรอบที่มีแกนเวลาครบ
          แต่ไม่มีเส้น อ่านได้เป็น "วัดแล้วได้ศูนย์" หรือ "กราฟพัง" ทั้งที่ความจริงคือ
          ไม่มีเซนเซอร์ตัวนั้นอ่านค่าได้เลย — บอกไปตรง ๆ ดีกว่า
          (กติกาเดียวกับแผ่นค่าปัจจุบันที่ขึ้น "ไม่มีค่าให้อ่าน" — T1.156) */}
      {!hasData ? (
        <p className="bl-trend-empty">
          <Icon name="power" size={16} aria-hidden="true" />
          ไม่มีค่าในช่วงนี้ — เซนเซอร์ตัวนี้ยังไม่ส่งค่า
        </p>
      ) : (
      <div className="bl-trend-chart">
        <ResponsiveContainer width="100%" height="100%" minHeight={MINI_CHART_HEIGHT}>
          <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
            <defs>
              <linearGradient id={`bl-fill-${metric.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={metric.color} stopOpacity={0.26} />
                <stop offset="100%" stopColor={metric.color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            {/* แกน X เป็นลำดับจุด แล้วค่อยแปลงเป็นเวลาตอนแสดงป้าย (ดูเหตุผลใน climate.js) */}
            <XAxis
              dataKey="t"
              {...axisProps}
              interval={interval}
              minTickGap={8}
              tickFormatter={(i) => data[i]?.hour ?? ""}
            />
            <YAxis
              {...axisProps}
              width={44}
              tickCount={4}
              domain={paddedDomain(values, metric.pad, {
                floor: metric.floor ?? null,
                ceil: metric.ceil ?? null,
              })}
            />
            <Tooltip
              {...tooltipStyle}
              formatter={(value) => [`${value} ${metric.unit}`, metric.label]}
              labelFormatter={(i) => t("เวลา {h} น.", { h: data[i]?.hour ?? "" })}
            />
            <Area
              type="monotone"
              dataKey={metric.dataKey}
              name={t(metric.label)}
              stroke={metric.color}
              strokeWidth={2}
              fill={`url(#bl-fill-${metric.dataKey})`}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
}

/** ผู้ใช้ที่เข้าสู่ระบบอยู่ตอนสร้างรายการตัวอย่าง (ยังไม่มี auth จริง)
    รายการที่ผู้ใช้บันทึกเองจะใช้ชื่อที่ตั้งไว้ในหน้าตั้งค่าแทน */
const SEED_USER = "สมชาย ฟาร์มสุข";

/** รายการตั้งต้นในตาราง — มีหลายรายการเพื่อให้เห็นการแบ่งหน้าจริง */
/* วันที่เลื่อนตามวันปัจจุบันเหมือนข้อมูลตัวอย่างชุดอื่น — ดู data/mock/asOf.js
   ไม่งั้นสมุดบันทึกจะค้างอยู่ต้นเดือน ส.ค. ทั้งที่หน้าอื่นเลื่อนไปแล้ว */
const SEED_ENTRIES = [
  { type: "dead", amount: 2, unit: "ตัว", note: "ตายเฉียบพลัน ไม่ทราบสาเหตุ", at: "2026-08-03T09:30:00" },
  { type: "moveIn", amount: 25, unit: "ตัว", note: "ย้ายจากโรงเรือน B2", at: "2026-08-03T08:15:00" },
  { type: "feed", amount: 80, unit: "กิโลกรัม", note: "อาหารสำเร็จรูป สูตร 16% โปรตีน", at: "2026-08-03T07:45:00" },
  { type: "sick", amount: 3, unit: "ตัว", note: "คอก 3 ซึม กินน้อย แยกออกมาสังเกตอาการ", at: "2026-08-02T16:20:00" },
  { type: "medicine", amount: 12, unit: "โดส", note: "วัคซีนป้องกันโรคปากและเท้าเปื่อย", at: "2026-08-02T14:05:00" },
  { type: "feed", amount: 78, unit: "กิโลกรัม", note: "รอบบ่าย", at: "2026-08-02T13:30:00" },
  { type: "missing", amount: 1, unit: "ตัว", note: "นับไม่ครบตอนเย็น ตรวจซ้ำแล้วยังขาด", at: "2026-08-02T18:10:00" },
  { type: "moveOut", amount: 40, unit: "ตัว", note: "ส่งเข้าโรงชำแหละตามแผน", at: "2026-08-01T09:00:00" },
  { type: "feed", amount: 82, unit: "กิโลกรัม", note: "รอบเช้า", at: "2026-08-01T07:40:00" },
  { type: "sick", amount: 1, unit: "ตัว", note: "ขาหลังเจ็บ แยกไปคอกพยาบาล", at: "2026-07-31T15:50:00" },
  { type: "feed", amount: 79, unit: "กิโลกรัม", note: "รอบเช้า", at: "2026-07-31T07:35:00" },
  { type: "dead", amount: 1, unit: "ตัว", note: "ลูกสุกรถูกแม่ทับ", at: "2026-07-30T22:15:00" },
].map((e, i) => ({ id: i + 1, by: SEED_USER, ...e, at: shiftDate(e.at) }));

/** รหัสกระดานของหน้านี้ — คีย์ที่ใช้เก็บชุดเลย์เอาต์ (ดู lib/layout/presets.js) */
const BOARD_ID = "barn";

export default function BarnDetail() {
  const t = useT();
  const { farmId, barnId } = useParams();
  const { hash } = useLocation();
  /* รวมของที่ผู้ใช้เพิ่มเองด้วย (ดู lib/records/useAllFarms.js) */
  const { farms, barnsOf } = useAllFarms();
  const farm = farms.find((f) => f.id === farmId);
  const barn = useMemo(
    () => barnsOf(farmId).find((b) => b.id === barnId) ?? null,
    [farmId, barnId, barnsOf]
  );

  /* หน้าศูนย์การแจ้งเตือนลิงก์เข้ามาที่ ".../barns/xxx#alerts" — ต้องเลื่อนไปที่การ์ดนั้นเอง
     เบราว์เซอร์เลื่อนให้ไม่ได้เพราะตอนมันอ่าน #hash หน้ายังไม่ถูก render
     และ react-router ก็ไม่เลื่อนตาม hash ให้ตอนเปลี่ยนหน้าฝั่ง client
     ➜ ไม่มีตัวนี้ ผู้ใช้จะกด "ดูรายละเอียด" แล้วไปโผล่หัวหน้าเสมอ ต้องเลื่อนหาเอง */
  useEffect(() => {
    if (!hash) return undefined;
    const targetId = hash.slice(1);
    let timer;
    let left = 6;
    let lastTop = null;
    /* เลื่อนซ้ำจนตำแหน่งนิ่ง — กราฟกับกระดานด้านบนจัดตำแหน่งเสร็จช้ากว่า effect แรก
       ถ้าเลื่อนครั้งเดียวจะพลาดเป้า (และถ้าใช้ behavior:"smooth" การ reflow ระหว่างทาง
       จะยกเลิกการเลื่อนกลางคัน จนกลับไปค้างอยู่หัวหน้าเหมือนไม่ได้กด) */
    const settle = () => {
      const el = document.getElementById(targetId);
      if (el) {
        const top = Math.round(el.getBoundingClientRect().top);
        if (top === lastTop) return;
        lastTop = top;
        el.scrollIntoView({ block: "start" });
      }
      left -= 1;
      if (left > 0) timer = setTimeout(settle, 110);
    };
    settle();
    return () => clearTimeout(timer);
  }, [hash, barnId]);

  const [camera, setCamera] = useState(0);
  /* บทบาทผู้ใช้มาจากธีมกลาง — ปุ่มนี้เปิดป๊อบอัพเดียวกับหน้าอื่นทั้งแอป */
  /* ชื่อที่จะถูกบันทึกลงตาราง — ตั้งได้ในป๊อบอัพตั้งค่า */
  const { settings, openSettings } = useSettings();
  const { role: account, signOut, can } = useAuth();
  /* ฟอร์มบันทึกท้ายหน้าเป็นการ "เขียนข้อมูล" — ต้องผ่านสิทธิ์เหมือนปุ่มปรับจำนวน (T1.129)
     ไม่มีสิทธิ์ = ดูรายการได้ครบ แต่เพิ่ม/แก้/ลบไม่ได้ */
  const canWrite = can("record.write");
  /* ช่วงเวลาของกราฟแนวโน้มในการ์ด B */
  const [trendHours, setTrendHours] = useState(24);

  /* เก็บลงเครื่อง แยกตามโรงเรือน — เดิมเป็น useState เฉย ๆ กรอกเพิ่มแล้วรีเฟรชหายหมด
     และทุกโรงเรือนใช้รายการชุดเดียวกัน (แก้ที่ A1 แล้ว A2 เปลี่ยนตาม) */
  const {
    list: entries,
    add: addEntry,
    update: updateEntry,
    remove: removeEntry,
    mode: logMode,
    status: logStatus,
    error: logError,
    pendingLocal,
    importLocal,
    busy: logBusy,
  } = useBarnLog(barnId, SEED_ENTRIES);
  /* ผลของการกด "ย้ายขึ้นระบบ" ล่าสุด — บอกให้รู้ว่าย้ายไปกี่รายการ */
  const [imported, setImported] = useState(null);

  /* ═══ บันทึกด่วน: เลือกชนิด → กดจำนวน จบในสองแตะ (T1.320) ═══
     คนหน้าฟาร์มถือมือถือยืนอยู่ในเล้า ไม่ได้นั่งหน้าคอม ฟอร์มเต็มมีหกช่อง
     (วันที่ · ชนิด · จำนวน · หน่วย · หมายเหตุ · ปุ่ม) ซึ่งกรอกกลางเล้าไม่ไหว
     ผลคือ **ตาราง barn_log ว่างเปล่า 0 แถว** ทั้งที่ API กับฟอร์มเสร็จมาตั้งนาน
     — ท่อสร้างไว้แล้วแต่น้ำไม่ไหล เพราะด่านอยู่ที่แรงกดของคน ไม่ใช่ที่ระบบ

     ★ ฟอร์มเต็มยังอยู่ครบ ไม่ได้แทนที่ — ใช้เวลาต้องใส่หมายเหตุหรือย้อนวันที่ */
  const [quickType, setQuickType] = useState(null);
  const [quickDone, setQuickDone] = useState(null);
  const [form, setForm] = useState({
    date: todayISO(),
    type: "dead",
    amount: "",
    unit: "ตัว",
    note: "",
  });
  const [editingId, setEditingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  /* การแจ้งเตือนข้อที่กางคำแนะนำอยู่ (null = ยังไม่กางข้อไหน) — กางได้ทีละข้อ
     ถ้ากางค้างไว้ได้หลายข้อพร้อมกัน การ์ดจะยาวจนต้องเลื่อนหาว่าข้อไหนเป็นของใคร */
  const [openAlert, setOpenAlert] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  /* รายการบันทึกซ่อนไว้ก่อน — เปิดเมื่อกดปุ่มดูรายการหรือพิมพ์ค้นหา */
  const [listOpen, setListOpen] = useState(false);
  const [query, setQuery] = useState("");

  /* ---------- กล้อง AI: ขยายภาพ + บันทึกภาพนิ่ง ----------
     viewer = null คือปิดอยู่ · { shotId: null } คือดูภาพสด · { shotId } คือดูภาพที่บันทึกไว้ */
  const { list: shots, add: addShot, remove: removeShot } = useSnapshots(barnId);
  const [viewer, setViewer] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [confirmShotId, setConfirmShotId] = useState(null);

  /* ป้าย "บันทึกแล้ว" โผล่บนภาพสองวินาทีแล้วหายเอง */
  useEffect(() => {
    if (!savedId) return undefined;
    const timer = setTimeout(() => setSavedId(null), 2000);
    return () => clearTimeout(timer);
  }, [savedId]);

  /* ---------- ภาพเต็มจอ ----------
     กดขยาย = เปิดแผงเต็มหน้าจอเว็บ แล้วขอโหมดเต็มจอจริงของเบราว์เซอร์ต่อให้อีกชั้น
     (ขอไม่ผ่านก็ไม่เป็นไร แผงยังเต็มหน้าจออยู่ดี — บาง iframe/เบราว์เซอร์ไม่ให้สั่ง) */
  const viewerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const closeViewer = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    setViewer(null);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else viewerRef.current?.requestFullscreen?.().catch(() => {});
  };

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  /* เปิดแผงแล้ว: ล็อกไม่ให้หน้าข้างหลังเลื่อน · Esc ปิด · โฟกัสเข้าไปในแผง
     (ไม่ได้ใช้ Modal จึงต้องทำเองสามอย่างนี้ ไม่งั้นเลื่อนหน้าหลังทะลุและกด Esc ไม่ออก) */
  useEffect(() => {
    if (!viewer) return undefined;
    const opener = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    viewerRef.current?.querySelector("button")?.focus();

    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      closeViewer();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [viewer, closeViewer]);

  const q = query.trim().toLowerCase();
  const matched = q
    ? entries.filter((e) =>
        [typeOf(e.type)?.label, e.note, e.by, e.unit, String(e.amount), e.at]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
    : entries;
  const totalPages = Math.max(1, Math.ceil(matched.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleEntries = matched.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  /* **ต้องเรียกเหนือ `if (!farm || !barn) return` เสมอ** — React ห้ามเรียก hook
     แบบมีเงื่อนไข ลำดับ hook ต้องเท่ากันทุกรอบ render
     โรงเรือนที่ต่อเซนเซอร์จริงมี `apiId` จึงดึงย้อนหลังของจริงจากหลังบ้าน
     (ไม่ขอผังเซนเซอร์ หน้านี้ไม่ได้ใช้) ฟาร์มตัวอย่างตกไปใช้ค่าจำลองเหมือนเดิม
     ช่วงเวลา 12/24/48 ชม. ส่งเป็น "12h"/"24h"/"48h" ให้ API ตรง ๆ */
  const liveTrend = useBarnHistory(barn?.apiId ?? null, `${trendHours}h`, { map: false });
  const trend = liveTrend.series ?? (barn?.apiId ? [] : getBarnTrend(farmId, barnId, trendHours));

  if (!farm || !barn) {
    return (
      <div className="bl-missing">
        <Card title={t("ไม่พบโรงเรือนนี้")} icon="warn">
          <p className="fx-empty">
            ไม่พบโรงเรือน “{barnId}” —{" "}
            <Link to={`/dashboard/farms/${farmId}`}>{t("กลับไปเลือกจากรายการโรงเรือน")}</Link>
          </p>
        </Card>
      </div>
    );
  }

  const offline = barn.status === "offline";
  const insights = getBarnInsights(barn);


  /* ยอดวันนี้ = ค่าจากระบบ + รายการที่บันทึก "ในวันเดียวกัน" เท่านั้น
     (รายการย้อนหลังของวันก่อนไม่ควรมาบวกกับยอดของวันนี้) */
  const dayKey = barn.updatedAt.slice(0, 10);
  const manual = entries.reduce(
    (acc, e) => {
      const key = typeOf(e.type)?.affects;
      if (key && e.at.slice(0, 10) === dayKey) acc[key] += Number(e.amount) || 0;
      return acc;
    },
    { dead: 0, sick: 0, missing: 0, in: 0, out: 0 }
  );

  /* ═══ จำนวนสุกรของเล้านี้ (T1.334) ═══
     โรงเรือนจริงไม่มี `today.expected` เลย (`plotnexusFarms.js:213` ตั้งเป็น null ทุกหลัง)
     ของเดิมจึงคืน null แล้วขึ้น "—" **ต่อให้ในฐานมีบันทึกย้ายเข้าอยู่กี่ตัวก็ตาม**
     ผู้ใช้แจ้งว่าเล้าที่มีบันทึก 1,198 ตัวยังขึ้นขีดกลาง (15 ต.ค. 2569)

     ★ สองทางนี้ห้ามบวกกัน — `manual` นับเฉพาะรายการ**ของวันนี้** เพื่อบวกทับยอดตั้งต้น
       ส่วน `herdFromLogs` นับ**ทุกรายการ**อยู่แล้ว เอามารวมกันจะนับของวันนี้ซ้ำสองรอบ */
  /* เรียกตรง ๆ ไม่ห่อ useMemo — จุดนี้อยู่หลังทางออกก่อนกำหนดของคอมโพเนนต์
     ห่อแล้วลำดับ hook จะไม่เท่ากันทุกรอบ (oxlint จับได้) และงานนี้เบามาก
     แค่วนรายการบันทึกไม่เกิน LOG_LIMIT รายการ */
  const fromLogs = herdFromLogs(entries);
  const total =
    barn.today.expected != null
      ? barn.today.expected + manual.in - manual.out
      : /* ยังสรุปจากบันทึกไม่ได้ก็ต้องเป็น null ไม่ใช่ 0 — 0 อ่านว่า "เล้าว่าง" ซึ่งคนละเรื่อง */
        fromLogs.confident
        ? fromLogs.count
        : null;
  const missing = barn.today.missing + manual.missing;
  const sick = barn.today.sick + manual.sick;
  const dead = barn.today.dead + manual.dead;
  /* AI นับได้ = ตัวที่ยังอยู่ในโรงเรือนและกล้องเห็น (หักที่หายและที่ตายออก) */
  const aiCount = offline || total == null ? null : Math.max(0, total - missing - dead);

  const dash = (value, format = formatNumber) =>
    value === null || value === undefined ? "—" : format(value);

  const pct = (n) => (total > 0 ? `${((n / total) * 100).toFixed(2)}%` : "—");

  /* ---------- กล้องที่กำลังดูอยู่ ----------
     โรงเรือนที่ผู้ใช้เพิ่มเองยังไม่มีกล้อง (cameras = []) จึงต้องเผื่อค่าว่างทุกที่ที่อ่าน */
  const cam = barn.cameras[camera] ?? null;
  /* ตัวที่ AI ทำเครื่องหมาย "เฝ้าดู" ในเฟรม — มีเมื่อโรงเรือนมีสุกรป่วย */
  const flagIndex = barn.today.sick > 0 ? 3 : -1;
  /* ภาพที่บันทึกไว้ที่กำลังเปิดดู (null = กำลังดูภาพสด) */
  const viewingShot = viewer?.shotId ? shots.find((s) => s.id === viewer.shotId) ?? null : null;

  /** เก็บภาพนิ่งของกล้องที่กำลังดูอยู่ พร้อมค่าที่ AI อ่านได้ ณ ตอนนั้น */
  const capture = () => {
    /* บันทึกภาพคือการ "เขียนข้อมูล" จึงต้องผ่านสิทธิ์เหมือนฟอร์มบันทึกด้านล่าง
       (record.write ใน lib/auth/roles.js ระบุไว้ตรง ๆ ว่าครอบคลุม "บันทึก/ลบภาพจากกล้อง") */
    if (!cam || !canWrite) return;
    const shot = addShot({
      cameraId: cam.id,
      cameraName: cam.name,
      detected: cam.detected,
      flagIndex,
    });
    if (shot) setSavedId(shot.id);
  };

  const counts = [
    {
      key: "total",
      label: t("จำนวนสุกรทั้งหมด"),
      icon: "user",
      value: total,
      note:
        barn.today.expected != null
          ? t("จากสต็อก {n} ตัว", { n: formatNumber(barn.today.expected) })
          : fromLogs.confident
            ? t("นับจากบันทึก {n} รายการ", { n: formatNumber(fromLogs.entries) })
            : t(HERD_REASON[fromLogs.reason] ?? "ยังสรุปจำนวนไม่ได้"),
      tone: "",
    },
    {
      key: "ai",
      label: t("AI นับได้"),
      icon: "monitor",
      value: aiCount,
      note:
        aiCount === null
          ? t("ไม่มีข้อมูลจากกล้อง")
          : t("ความแม่นยำ {pct}%", { pct: ((aiCount / total) * 100).toFixed(1) }),
      tone: "is-ai",
    },
    { key: "missing", label: t("ขาดหาย"), icon: "search", value: missing, note: pct(missing), tone: "is-missing" },
    { key: "sick", label: t("ป่วย"), icon: "pulse", value: sick, note: pct(sick), tone: "is-sick" },
    { key: "dead", label: t("ตาย"), icon: "warn", value: dead, note: pct(dead), tone: "is-dead" },
  ];

  /* ค่าสภาพแวดล้อม — ใช้ทั้งกล่องค่าปัจจุบัน (การ์ด A) และกราฟย้อนหลัง (การ์ด B)
     accent = สีประจำตัวชี้วัด ผูกถาวรกับตัวชี้วัด ไม่ใช่สีสถานะ
     pad/floor/ceil = ระยะเผื่อของแกน Y ในกราฟ

     **ทุก `warn` ต้องขึ้นต้นด้วย `known(...)`** — ใน JS `null < 26` เป็นจริง
     โรงเรือนที่เซนเซอร์เงียบจึงเคยขึ้น "นอกเกณฑ์ 26–30" ทั้งที่ค่าเป็นขีดกลาง
     และ `noData` มีไว้เพราะ "ไม่มีค่า" ไม่ใช่ "เหมาะสม" — ห้ามบอกว่าค่าปกติทั้งที่ไม่ได้วัด */
  const known = (v) => v != null;

  /* ค่าค้างเมื่อเซนเซอร์เงียบ (T1.345) — กติกาเดียวกันกับทุกหน้า (lib/heldReading.js)
     `warn` / `noData` ยังคิดจากค่าสดเหมือนเดิม — ห้ามเอาค่าค้างมาตัดสินว่าหลุดเกณฑ์หรือเหมาะสม */
  const shownValue = (liveValue, heldKey, format = formatNumber) =>
    heldDisplay({
      live: liveValue ?? null,
      held: barn.held?.[heldKey] ?? null,
      at: barn.held?.at ?? null,
      format,
      t,
    });
  const envShown = {
    tempC: shownValue(barn.tempC, "tempC", formatNumber1),
    humidity: shownValue(barn.humidity, "humidity"),
    windSpeed: shownValue(barn.windSpeed, "windSpeed", formatNumber1),
    nh3: shownValue(barn.nh3, "nh3"),
  };
  const ENV_METRICS = [
    {
      label: t("อุณหภูมิ"),
      value: envShown.tempC.text,
      heldNote: envShown.tempC.note,
      unit: "°C",
      accent: "temp",
      icon: "thermometer",
      range: "26–30",
      warn: known(barn.tempC) && (barn.tempC > 30 || barn.tempC < 26),
      noData: !known(barn.tempC),
      warnText: t("นอกเกณฑ์ 26–30"),
      dataKey: "tempC",
      color: SERIES[7],
      now: `${dash(barn.tempC, formatNumber1)} °C`,
      pad: 2,
    },
    {
      label: t("ความชื้น"),
      value: envShown.humidity.text,
      heldNote: envShown.humidity.note,
      unit: "%",
      accent: "humid",
      icon: "drop",
      range: "60–75",
      warn: known(barn.humidity) && (barn.humidity > 75 || barn.humidity < 60),
      noData: !known(barn.humidity),
      warnText: t("นอกเกณฑ์ 60–75"),
      dataKey: "humidity",
      color: SERIES[0],
      now: `${dash(barn.humidity)} %`,
      pad: 10,
      floor: 0,
      ceil: 100,
    },
    {
      label: t("ความเร็วลม"),
      value: envShown.windSpeed.text,
      heldNote: envShown.windSpeed.note,
      unit: t("ม./วิ"),
      accent: "wind",
      icon: "wind",
      range: "0.5–2.5",
      warn: known(barn.windSpeed) && (barn.windSpeed < 0.5 || barn.windSpeed > 2.5),
      noData: !known(barn.windSpeed),
      warnText: t("นอกเกณฑ์ 0.5–2.5"),
      dataKey: "wind",
      color: SERIES[3],
      now: t("{n} ม./วิ", { n: dash(barn.windSpeed, formatNumber1) }),
      pad: 1,
      floor: 0,
    },
    {
      label: "NH₃",
      value: envShown.nh3.text,
      heldNote: envShown.nh3.note,
      unit: "ppm",
      accent: "gas",
      icon: "cloud",
      range: t("ไม่เกิน 15"),
      warn: known(barn.nh3) && barn.nh3 > 15,
      noData: !known(barn.nh3),
      warnText: t("สูงกว่าเกณฑ์ 15"),
      dataKey: "nh3",
      color: SERIES[4],
      now: `${dash(barn.nh3)} ppm`,
      pad: 4,
      floor: 0,
    },
  ];

  const envWarnings = ENV_METRICS.filter((m) => m.warn).length;
  /* กี่ค่าที่ "ไม่ได้วัด" — ต้องนับแยกจาก `warn` เพราะไม่มีค่าเลยแล้วบอกว่า
     "ค่าทุกตัวปกติ" คือการรับประกันสิ่งที่ไม่ได้ตรวจ */
  const envUnknown = ENV_METRICS.filter((m) => m.noData).length;

  /* การแจ้งเตือนของโรงเรือน — หัวข้อ + รายละเอียดสิ่งที่ตรวจพบ
     ทุกเงื่อนไขต้องเช็ก null ก่อนเทียบเกณฑ์ — ใน JS `null < 85` และ `null <= 15`
     เป็นจริงทั้งคู่ โรงเรือนที่ยังไม่มีเซนเซอร์ตัวนั้นจึงจะถูกเตือนทั้งที่ไม่มีข้อมูล */
  const has = (value) => value != null;
  /* `advice` = สิ่งที่จะโผล่ตอนกดการแจ้งเตือนข้อนั้น — เรียงตามลำดับที่ควรทำจริง
     ข้อแรกคือสิ่งที่ทำได้ทันทีเสมอ ข้อสุดท้ายคือ "ถ้ายังไม่ดีขึ้นให้ทำอะไรต่อ"
     ทุกข้ออิงค่าที่วัดได้ของโรงเรือนนี้ ไม่ใช่ข้อความกลาง ๆ ที่ใช้ได้กับทุกที่ */
  const alerts = [
    barn.tempC > 30 && {
      id: "temp",
      tone: "critical",
      text: t("อุณหภูมิสูงเกินเกณฑ์"),
      detail: t("ตรวจพบ {n} °C สูงกว่าค่าที่แนะนำ", { n: formatNumber1(barn.tempC) }),
      at: barn.updatedAt,
      advice: [
        t("ต้องลดลงอีก {n} °C จึงจะเข้าเกณฑ์ (ไม่เกิน 28 °C)", {
          n: formatNumber1(barn.tempC - 28),
        }),
        t("เร่งรอบพัดลมให้สุดก่อน แล้วค่อยเปิดสเปรย์น้ำ — สั่งได้ที่การ์ดควบคุมอุปกรณ์"),
        t("งดย้ายสุกรและเลื่อนมื้อหนักออกจากช่วงแดดจัด"),
        t("ถ้า 30 นาทีแล้วยังไม่ลง ให้ไล่ดูว่าพัดลมตัวไหนไม่หมุนหรือกระแสผิดปกติ"),
      ],
    },
    barn.humidity > 75 && {
      id: "humidity",
      tone: "serious",
      text: t("ความชื้นสูงเกินเกณฑ์"),
      detail: t("ตรวจพบ {n}% สูงกว่าช่วง 60–75%", { n: barn.humidity }),
      at: barn.updatedAt,
      advice: [
        t("สูงกว่าเพดาน 75% อยู่ {n}%", { n: barn.humidity - 75 }),
        t("เพิ่มการระบายอากาศก่อน — อย่าเพิ่งเปิดสเปรย์น้ำซ้ำ จะยิ่งชื้น"),
        t("ตรวจน้ำรั่วที่รางน้ำและหัวนิปเปิล ซึ่งเป็นต้นเหตุที่เจอบ่อยที่สุด"),
        barn.tempC > 28
          ? t("ตอนนี้ชื้นสูงพร้อมกับร้อนสูง — เสี่ยงโรคทางเดินหายใจมากกว่าปกติ ให้เฝ้าดูการหายใจถี่")
          : t("ถ้าชื้นสูงต่อเนื่องหลายวัน ให้เฝ้าดูอาการไอและการหายใจถี่"),
      ],
    },
    barn.today.sick > 0 && {
      id: "sick",
      tone: "serious",
      text: t("สุกรไม่เคลื่อนไหว {n} ตัว", { n: barn.today.sick }),
      detail: t("บริเวณคอก 3 — AI เห็นการนอนซึมนานผิดปกติ"),
      at: barn.updatedAt,
      advice: [
        t("แยกตัวที่ซึมออกมาคอกพยาบาลก่อน แล้วดูว่ายังกินน้ำเองไหม"),
        t("วัดอุณหภูมิตัวสัตว์ — เกิน 40 °C ให้แจ้งสัตวแพทย์ในรอบเดียวกัน"),
        t('บันทึกเป็น "หมูป่วย" ในตารางท้ายหน้า เพื่อให้ยอดวันนี้ตรงกับของจริง'),
        barn.tempC > 30
          ? t("โรงเรือนนี้ร้อนเกินเกณฑ์อยู่ด้วย — อาการซึมอาจมาจากความร้อน ไม่ใช่โรค ให้แก้เรื่องอุณหภูมิควบคู่กัน")
          : t("ถ้าเพิ่มจำนวนขึ้นในวันถัดไป ให้ตรวจทั้งคอกไม่ใช่เฉพาะตัวที่ AI ชี้"),
      ],
    },
    has(barn.feedPct) && barn.feedPct < 85 && {
      id: "feed",
      tone: "warning",
      text: t("ปริมาณการกินอาหารลดลง"),
      detail: t("อาหารในไซโลเหลือ {n}% ต่ำกว่าค่าเฉลี่ย", { n: barn.feedPct }),
      at: barn.updatedAt,
      advice: [
        barn.feedPct < 50
          ? t("เหลือไม่ถึงครึ่งไซโล — สั่งเติมวันนี้ อย่ารอรอบปกติ")
          : t("สั่งเติมอาหารภายใน 2 วัน เพื่อไม่ให้กระทบรอบเช้า"),
        t("ตรวจรางอาหารอุดตันและหัวนิปเปิลน้ำ — กินน้อยเพราะน้ำไม่ไหลเจอบ่อยพอ ๆ กับอาหารหมด"),
        barn.tempC > 30
          ? t("โรงเรือนร้อนเกินเกณฑ์อยู่ด้วย สุกรจะกินลดลงเองตามธรรมชาติ — แก้ความร้อนก่อนแล้วดูซ้ำ")
          : t("ถ้าอาหารเต็มแต่ยังกินน้อย ให้ดูอาการป่วยควบคู่ไปด้วย"),
      ],
    },
    has(barn.nh3) && barn.nh3 <= 15 && {
      id: "nh3",
      tone: "good",
      text: t("ค่าก๊าซแอมโมเนียปกติ"),
      detail: t("ตรวจพบ {n} ppm อยู่ในเกณฑ์", { n: barn.nh3 }),
      at: barn.updatedAt,
      advice: [
        t("ยังไม่ต้องทำอะไร — รักษารอบระบายอากาศและรอบตักมูลเดิมไว้"),
        t("เพดานที่ต้องเริ่มแก้คือ 15 ppm ตอนนี้ห่างอยู่ {n} ppm", {
          n: formatNumber1(15 - barn.nh3),
        }),
      ],
    },
  ].filter(Boolean);

  /**
   * จำนวนที่ให้กดได้ แยกตามหน่วย — เลือกจากค่าที่ใช้จริงในเล้า ไม่ใช่ 1/2/3 ทุกหน่วย
   * อาหารนับเป็นกระสอบ ๆ ละ 50 กก. จึงไม่มีประโยชน์ที่จะให้กด "1 กิโลกรัม"
   */
  const QUICK_AMOUNTS = {
    ตัว: [1, 2, 5],
    กิโลกรัม: [50, 100, 200],
    โดส: [1, 5, 10],
    ลิตร: [10, 20, 50],
  };

  /**
   * บันทึกด่วนหนึ่งรายการ — ใช้ทางเดียวกับฟอร์มเต็มเป๊ะ (`addEntry`)
   * จึงขึ้นหลังบ้าน ติดร่องรอยว่าใครบันทึก และโผล่ในรายงานส่งเวรเหมือนกัน
   */
  const quickSave = async (kind, amount) => {
    /* ด่านจริงอยู่ตรงนี้ ไม่ใช่แค่ที่ปุ่ม · `logBusy` กันกดรัว ๆ ซ้ำ
       ★ สำคัญกว่าที่คิด — แตะ "หมูตาย" สองทีด้วยนิ้วเปื้อนกลางเล้า
         จะกลายเป็นหมูตายสองตัวในบันทึกจริง */
    if (!canWrite || logBusy) return;
    const today = todayISO();
    try {
      const saved = await addEntry({
        date: today,
        type: kind.value,
        amount,
        unit: kind.unit,
        note: "",
        by: `${settings.userName} · ${account.name}`,
        at: `${today}T${new Date().toTimeString().slice(0, 8)}`,
      });
      setQuickType(null);
      setQuickDone({ id: saved?.id ?? null, label: kind.label, amount, unit: kind.unit });
      setPage(1);
    } catch {
      /* ข้อความผิดพลาดขึ้นจาก logError อยู่แล้ว · ไม่ล้างชนิดที่เลือกไว้ กดใหม่ได้ทันที */
    }
  };

  /**
   * ★ เลิกทำรายการที่เพิ่งกด — สิ่งที่ทำให้ปุ่มสองแตะปลอดภัยพอจะมีได้
   * ไม่มีฟอร์มให้ทบทวนก่อนส่ง ความผิดพลาดจึงถูกบันทึกทันทีที่นิ้วแตะ
   * ถ้าไม่มีทางถอน คนจะไม่กล้าใช้ แล้วก็กลับไปไม่บันทึกอะไรเหมือนเดิม
   */
  const quickUndo = async () => {
    if (!canWrite || logBusy || !quickDone?.id) return;
    try {
      await removeEntry(quickDone.id);
      setQuickDone(null);
    } catch {
      /* ข้อความผิดพลาดขึ้นจาก logError แล้ว */
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    /* ด่านจริงอยู่ตรงนี้ ไม่ใช่แค่ที่ปุ่ม — ฟอร์มกด Enter ส่งได้โดยไม่ผ่านปุ่ม */
    if (!canWrite || logBusy) return;
    const amount = Math.max(1, Number(form.amount) || 1);
    /* บันทึกขึ้นหลังบ้านไม่สำเร็จ → คงฟอร์มไว้ให้กดใหม่ได้ ห้ามล้างทิ้ง (ข้อความขึ้นจาก logError) */
    try {
      if (editingId) {
        await updateEntry(editingId, (item) => ({
          ...form,
          amount,
          at: `${form.date}T${item.at.slice(11)}`,
        }));
        setEditingId(null);
      } else {
        const now = new Date();
        await addEntry(
          {
            ...form,
            amount,
            /* `account` คือ **สิทธิ์การใช้งาน** (ผู้ดูแลระบบ / ผู้ใช้งาน) จาก useAuth()
               ไม่ใช่ "ธีมบทบาท" — บรรทัดนี้ทำหน้าที่เป็นร่องรอยว่าใครบันทึก จึงต้องเป็นสิทธิ์จริง
               (ของเดิมเขียน `role.name` ซึ่งไม่มีตัวแปรชื่อนั้นในหน้านี้เลย → กดเพิ่มแล้วหน้าพังทั้งหน้า)
               เป็นอ็อบเจ็กต์ ไม่ใช่สตริง — ต้องหยิบ .name ไม่งั้นได้ "[object Object]" */
            by: `${settings.userName} · ${account.name}`,
            at: `${form.date}T${now.toTimeString().slice(0, 8)}`,
          }
        );
        setPage(1);
      }
      setForm({ date: todayISO(), type: form.type, amount: "", unit: form.unit, note: "" });
    } catch {
      /* ข้อความผิดพลาดอยู่ใน logError แล้ว */
    }
  };

  const startEdit = (entry) => {
    if (!canWrite) return;
    setListOpen(true);
    setEditingId(entry.id);
    setConfirmId(null);
    setForm({
      date: entry.at.slice(0, 10),
      type: entry.type,
      amount: entry.amount,
      unit: entry.unit,
      note: entry.note,
    });
    document.querySelector("#log")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const remove = async (id) => {
    if (!canWrite || logBusy) return;
    try {
      await removeEntry(id);
    } catch {
      return; /* ข้อความผิดพลาดอยู่ใน logError แล้ว — คงปุ่มยืนยันไว้ให้ลองใหม่ */
    }
    setConfirmId(null);
    if (editingId === id) {
      setEditingId(null);
      setForm({ date: todayISO(), type: "dead", amount: "", unit: "ตัว", note: "" });
    }
  };

  return (
    <div className="bl" id="top">
      {/* ================= แถบเมนูซ้าย ================= */}
      {/* ใช้ตัวเดียวกับทุกหน้าแล้ว (components/layout/AppSidebar.jsx)
          เดิมหน้านี้เขียนแถบซ้ายของตัวเอง เมนูจึงไม่ตรงกับหน้าอื่นและกว้างไม่เท่ากัน
          ส่วนที่เป็นของหน้านี้จริง ๆ คือการ์ดฟาร์มท้ายแถบ จึงส่งเข้าไปทาง `footer` */}
      <AppSidebar
        footer={
          <Link to={`/dashboard/farms/${farmId}`} className="bl-farm-card">
            <span className="bl-farm-art" aria-hidden="true">
              <BarnArt className="bl-side-scene" variant={1} />
            </span>
            <b>{t(farm.name)}</b>
            <span>{farm.province}</span>
            <StatusBadge tone={barn.status === "offline" ? "offline" : "good"}>
              {barn.status === "offline" ? t(BARN_STATUS_LABEL.offline) : t("ออนไลน์")}
            </StatusBadge>
          </Link>
        }
      />

      {/* ================= เนื้อหา ================= */}
      <div className="bl-body">
        <header className="bl-top">
          {/* ขีดสามขีด + โลโก้ — ต้องมีทุกโครงหน้า ไม่งั้นเดินเข้ามาหน้านี้แล้วเปิดเมนูไม่ได้ */}
          <AppBrand compact />
          {/* ปุ่มย้อนกลับ — ไม่มีประวัติก็กลับไปรายการโรงเรือนของฟาร์มนี้ */}
          <BackButton fallback={`/dashboard/farms/${farmId}`} />
          <HomeButton />
          <span className="bl-top-headings">
            <h1 className="bl-title">{t(barn.name)}</h1>
            <nav className="crumbs" aria-label={t("เส้นทางหน้า")}>
              <Link to="/dashboard/farms">{t(farm.name)}</Link>
              <Icon name="chevron" size={15} />
              <Link to={`/dashboard/farms/${farmId}`}>{t("โรงเรือน")}</Link>
              <Icon name="chevron" size={15} />
              <span aria-current="page">{t(barn.name)}</span>
            </nav>
          </span>

          <span className="bl-top-right">
            <span className="bl-updated">
              <Icon name="clock" size={18} />
              อัปเดตล่าสุด {formatWhen(barn.updatedAt)}
            </span>
            {/* ปุ่ม Voice AI ย้ายไปอยู่บนแถบลอยล่างจอแล้ว (16 ก.ย. 2569 · components/dock/AppDock.jsx) */}

            {/* ชิปสิทธิ์ — ใช้คลาสร่วมกับแถบเมนูบน ทุกโครงหน้าบอกสิทธิ์เหมือนกันหมด */}
            <button
              type="button"
              className={"app-account is-" + account.id}
              onClick={() => openSettings("account")}
              title={account.tagline}
            >
              <Icon name={account.icon} size={17} />
              <span className="app-account-text">{account.name}</span>
            </button>
            <SettingsButton />
            <Link to="/" className="bl-logout" onClick={signOut}>
              <Icon name="login" size={19} />
              {t("ออกจากระบบ")}
            </Link>
          </span>
        </header>

        <main className="bl-main">
          <PageBoard boardId={BOARD_ID}>
            {/* ---------- แถวบนสุด: สรุปจำนวนสุกรวันนี้ ---------- */}
            <Block id="count" label={t("สรุปจำนวนสุกรวันนี้")}>
              <Card id="count" className="bl-card">
                <div className="bl-card-head">
                  <h2>{t("สรุปจำนวนสุกรวันนี้")}</h2>
                  <span className="bl-head-note">
                    {t("อัปเดต {time}", { time: formatWhen(barn.updatedAt) })}
                  </span>
                </div>

                <ul className="bl-counts">
                  {counts.map((c) => (
                    <li key={c.key} className={`bl-count ${c.tone}`}>
                      <span className="bl-count-icon" aria-hidden="true">
                        <Icon name={c.icon} size={24} />
                      </span>
                      <span className="bl-count-body">
                        <span className="bl-count-label">{t(c.label)}</span>
                        <span className="bl-count-value">
                          <b className="num">{dash(c.value)}</b>
                          <em>{t("ตัว")}</em>
                        </span>
                        <span className="bl-count-note">{c.note}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>

            </Block>

            {/* A — กล้อง AI */}
            <Block id="camera" label={t("กล้อง AI")}>
              <Card id="camera" className="bl-card is-paired">
                <div className="bl-card-head">
                  <span className="bl-tag" aria-hidden="true">A</span>
                  <h2>{t("กล้อง AI ภายในโรงเรือน")}</h2>
                  <span className={"bl-live" + (offline ? " is-off" : "")}>
                    <span className="bl-live-dot" aria-hidden="true" />
                    {offline ? t("ออฟไลน์") : t("ออนไลน์")}
                  </span>
                </div>

                {/* โรงเรือนที่ผู้ใช้เพิ่มเองยังไม่มีกล้องติดตั้ง — ต้องเช็กจำนวนกล้องด้วย
                    ไม่ใช่เช็กแค่ offline ไม่งั้นอ่าน cameras[0] ของอาร์เรย์ว่างแล้วจอขาว */}
                {offline || barn.cameras.length === 0 ? (
                  <p className="fx-empty">
                    {offline
                      ? t("กล้องไม่ได้เชื่อมต่อ — ตรวจไฟและสัญญาณที่ตู้ควบคุมท้ายโรงเรือน")
                      : t("โรงเรือนนี้ยังไม่ได้ติดตั้งกล้อง AI")}
                  </p>
                ) : (
                  <>
                    <div className="bl-cam">
                      {/* มีกล้องจริงเมื่อไหร่ cam.stream จะเป็น URL แล้วภาพนี้กลายเป็นสตรีมสดเอง */}
                      <CameraView
                        className="bl-cam-view"
                        flagIndex={flagIndex}
                        stream={cam.stream}
                      />

                      {/* เครื่องมือของภาพ — วางทับมุมขวาบนเพื่อไม่บังกรอบตรวจจับตรงกลาง */}
                      <div className="bl-cam-tools">
                        <button
                          type="button"
                          className="bl-cam-tool"
                          onClick={() => setViewer({ shotId: null })}
                        >
                          <Icon name="expand" size={18} />
                          {t("ขยาย")}
                        </button>
                        <button
                          type="button"
                          className="bl-cam-tool"
                          onClick={capture}
                          disabled={!canWrite}
                          title={canWrite ? undefined : t("ต้องมีสิทธิ์ระดับผู้บันทึกขึ้นไป")}
                        >
                          <Icon name="camera" size={18} />
                          {t("บันทึกภาพ")}
                        </button>
                      </div>

                      {savedId && (
                        <span className="bl-cam-flash" role="status">
                          <Icon name="check" size={17} />
                          {t("บันทึกภาพแล้ว")}
                        </span>
                      )}

                      <span className="bl-cam-bar">
                        {t("AI ตรวจนับสุกร")}
                        <b className="num">{formatNumber(cam.detected)}</b>
                        <em>{t("ตัว")}</em>
                      </span>
                    </div>

                    <div className="bl-cam-tabs" role="tablist" aria-label={t("เลือกกล้อง")}>
                      {barn.cameras.map((item, i) => (
                        <button
                          key={item.id}
                          type="button"
                          role="tab"
                          aria-selected={camera === i}
                          className={"bl-cam-tab" + (camera === i ? " is-active" : "")}
                          onClick={() => setCamera(i)}
                        >
                          <Icon name="camera" size={17} />
                          {t(`${item.name}|ชื่อสั้น`)}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* ปิดปุ่มแล้วต้องบอกเหตุผลให้เห็น ไม่ใช่บอกแค่ใน tooltip
                    — จอสัมผัสไม่มี hover จึงไม่มีวันเห็น title (กติกาใน CLAUDE.md) */}
                {!canWrite && (
                  <AdminNote action="record.write">
                    {t("ดูภาพจากกล้องและภาพที่บันทึกไว้ได้ทั้งหมด แต่บันทึกภาพใหม่และลบภาพไม่ได้")}
                  </AdminNote>
                )}

                {/* ภาพที่บันทึกไว้ — แสดงต่อแม้กล้องออฟไลน์ เพราะเป็นของที่บันทึกไปแล้ว */}
                {shots.length > 0 && (
                  <div className="bl-shots">
                    <div className="bl-shots-head">
                      <h3>
                        ภาพที่บันทึกไว้
                        <span className="bl-shots-count">
                          {formatNumber(shots.length)}/{formatNumber(SNAPSHOT_LIMIT)}
                        </span>
                      </h3>
                      <span className="bl-shots-note">{t("เก็บในเครื่องนี้เท่านั้น")}</span>
                    </div>

                    <ul className="bl-shots-list">
                      {shots.map((shot) => (
                        <li key={shot.id} className="bl-shot">
                          <button
                            type="button"
                            className="bl-shot-open"
                            onClick={() => setViewer({ shotId: shot.id })}
                          >
                            <span className="bl-shot-thumb">
                              <CameraView className="bl-cam-view" flagIndex={shot.flagIndex} />
                            </span>
                            <span className="bl-shot-body">
                              <b>{formatTime(shot.at)}</b>
                              <span className="bl-shot-meta">
                                {shot.cameraName} · นับได้ {formatNumber(shot.detected)} ตัว
                              </span>
                            </span>
                          </button>

                          {confirmShotId === shot.id ? (
                            <span className="bl-shot-confirm">
                              <button
                                type="button"
                                className="bl-shot-del is-yes"
                                disabled={!canWrite}
                                onClick={() => {
                                  removeShot(shot.id);
                                  setConfirmShotId(null);
                                }}
                              >
                                <Icon name="check" size={16} />
                                ลบเลย
                              </button>
                              <button
                                type="button"
                                className="bl-shot-del"
                                onClick={() => setConfirmShotId(null)}
                              >
                                <Icon name="cross" size={16} />
                                ไม่ลบ
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="bl-shot-del"
                              disabled={!canWrite}
                              title={canWrite ? undefined : t("ต้องมีสิทธิ์ระดับผู้บันทึกขึ้นไป")}
                              onClick={() => setConfirmShotId(shot.id)}
                            >
                              <Icon name="trash" size={16} />
                              <span className="sr-only">
                                ลบภาพที่บันทึกเมื่อ {formatTime(shot.at)}
                              </span>
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* ค่าสภาพแวดล้อมปัจจุบัน — อยู่ใต้ภาพกล้องเพราะเป็นค่าของโรงเรือนเดียวกัน */}
                <ul className="bl-env">
                  {ENV_METRICS.map((m) => (
                    <li
                      key={m.label}
                      className={
                        `bl-env-item is-${m.accent}` +
                        (m.warn ? " is-warn" : "") +
                        (m.noData ? " is-nodata" : "") +
                        (m.heldNote ? " is-held" : "")
                      }
                    >
                      <span className="bl-env-icon" aria-hidden="true">
                        <Icon name={m.icon} size={20} />
                      </span>
                      <span className="bl-env-body">
                        <span className="bl-env-label">{t(m.label)}</span>
                        <span className="bl-env-value">
                          <b className="num">{m.value}</b>
                          <em>{m.unit}</em>
                        </span>
                        <span className="bl-env-hint">
                          {/* ไม่มีค่า ≠ ค่าปกติ — ต้องมีไอคอนกำกับด้วย ห้ามสื่อด้วยสีอย่างเดียว */}
                          {(m.warn || m.noData || m.heldNote) && (
                            <Icon
                              name={m.heldNote ? "clock" : m.noData ? "power" : "warn"}
                              size={15}
                            />
                          )}
                          {/* ค่าค้างกินก่อนทุกอย่าง — บอกเกณฑ์คู่ค่าเก่าคือเชิญให้อ่านว่าค่าตอนนี้เหมาะสม */}
                          {m.heldNote
                            ? m.heldNote
                            : m.noData
                              ? t("ไม่มีค่าให้อ่าน")
                              : m.warn
                                ? m.warnText
                                : t("เหมาะสม {range}", { range: m.range })}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </Block>

            {/* B — แนวโน้มสภาพแวดล้อมย้อนหลัง (กราฟใบละหนึ่งค่า แกน Y เดียว) */}
            <Block id="environment" label={t("แนวโน้มสภาพแวดล้อม")}>
              <Card id="environment" className="bl-card is-paired">
                <div className="bl-card-head">
                  <span className="bl-tag" aria-hidden="true">B</span>
                  <h2>{t("แนวโน้มสภาพแวดล้อม")}</h2>
                  <label className="bl-range">
                    <span>{t("ช่วงเวลา")}</span>
                    <select
                      className="fx-select"
                      value={trendHours}
                      onChange={(e) => setTrendHours(Number(e.target.value))}
                    >
                      {TREND_RANGES.map((r) => (
                        <option key={r.hours} value={r.hours}>
                          {t(r.label)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {trend.length === 0 ? (
                  <p className="fx-empty">
                    {t("เซนเซอร์ไม่ส่งค่า — ยังไม่มีข้อมูลย้อนหลังให้แสดงในช่วงเวลานี้")}
                  </p>
                ) : (
                  <div className="bl-trends">
                    {ENV_METRICS.map((m) => (
                      <TrendChart key={m.dataKey} metric={m} data={trend} />
                    ))}
                  </div>
                )}
              </Card>
            </Block>

            {/* ---------- การแจ้งเตือน + แผงคำแนะนำจาก AI ---------- */}
            <Block id="alerts" label={t("การแจ้งเตือนและคำแนะนำ AI")}>
              <Card id="alerts" className="bl-card">
                <div className="bl-card-head">
                  <h2>{t("การแจ้งเตือนและคำแนะนำ AI")}</h2>
                  <span
                    className={
                      "bl-chip" +
                      (envWarnings > 0 ? " is-warn" : envUnknown === ENV_METRICS.length ? "" : " is-ok")
                    }
                  >
                    {envWarnings > 0
                      ? t("ต้องดู {n} ค่า", { n: envWarnings })
                      : envUnknown === ENV_METRICS.length
                        ? t("ยังไม่มีค่าให้ตรวจ")
                        : envUnknown > 0
                          ? t("ค่าที่วัดได้ปกติ · อีก {n} ค่าไม่มีสัญญาณ", { n: envUnknown })
                          : t("ค่าทุกตัวปกติ")}
                  </span>
                </div>

                {/* กดที่แถวไหนก็กางคำแนะนำของข้อนั้น — ไม่ใช่คำแนะนำรวมของทั้งโรงเรือน
                    กางทีละข้อ กดซ้ำที่ข้อเดิมเพื่อพับกลับ */}
                <ul className="bl-alerts">
                  {alerts.map((a) => {
                    const open = openAlert === a.id;
                    return (
                      <li key={a.id} className={`bl-alert is-${a.tone}` + (open ? " is-open" : "")}>
                        <button
                          type="button"
                          className="bl-alert-row"
                          onClick={() => setOpenAlert(open ? null : a.id)}
                          aria-expanded={open}
                          aria-controls={`bl-advice-${a.id}`}
                        >
                          <span className="bl-alert-dot" aria-hidden="true" />
                          <span className="bl-alert-text">
                            <b>{t(a.text)}</b>
                            <span>{a.detail}</span>
                          </span>
                          <time>{formatTime(a.at)}</time>
                          {/* บอกให้รู้ว่ากดได้และตอนนี้กางอยู่หรือยัง — มีทั้งไอคอนและข้อความ
                              ไม่ได้สื่อด้วยลูกศรอย่างเดียว (กติกา DESIGN.md) */}
                          <span className="bl-alert-more">
                            <Icon name="spark" size={16} aria-hidden="true" />
                            {open ? t("ซ่อนคำแนะนำ") : t("คำแนะนำ AI")}
                            <Icon
                              name="chevron"
                              size={15}
                              className={open ? "bl-alert-flip" : ""}
                              aria-hidden="true"
                            />
                          </span>
                          <span className="sr-only">
                            {a.tone === "good"
                              ? t("ปกติ")
                              : a.tone === "critical"
                                ? t("วิกฤต")
                                : t("ต้องเฝ้าระวัง")}
                          </span>
                        </button>

                        {open && (
                          <div className="bl-advice" id={`bl-advice-${a.id}`}>
                            <p className="bl-advice-head">
                              <Icon name="spark" size={17} aria-hidden="true" />
                              {t("คำแนะนำจาก AI · {text}", { text: t(a.text) })}
                            </p>
                            <ol className="bl-advice-list">
                              {a.advice.map((step) => (
                                <li key={step}>{step}</li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </Block>

            {/* แผงคำแนะนำ — เขียวอ่อนเต็มใบ พร้อมภาพประกอบมุมขวา */}
            <Block id="ai" label={t("แผงคำแนะนำจาก AI")}>
              <section className="bl-card bl-ai" aria-labelledby="bl-ai-head">
                <div className="bl-ai-body">
                  <h2 className="bl-ai-head" id="bl-ai-head">
                    <Icon name="spark" size={20} />
                    {t("คำแนะนำจาก AI")}
                  </h2>
                  <ul>
                    {insights.slice(0, 3).map((it) => (
                      <li key={it.title}>
                        <Icon name="check" size={18} />
                        {t(it.text)}
                      </li>
                    ))}
                  </ul>
                </div>
                <img className="bl-ai-art" src={asset("/picker-hero.png")} alt="" aria-hidden="true" />
              </section>
            </Block>

            {/* ---------- แถวล่าง: บันทึกข้อมูล ---------- */}
            <Block id="log" label={t("บันทึกข้อมูลผู้ใช้งาน")}>
              <Card id="log" className="bl-card">
                <div className="bl-card-head">
                  <h2>{t("บันทึกข้อมูลผู้ใช้งาน")}</h2>
                  {editingId ? (
                    <span className="bl-editing">{t("กำลังแก้ไขรายการ")}</span>
                  ) : (
                    <span className="bl-head-note">
                      {canWrite ? t("เพิ่ม แก้ไข หรือลบรายการได้") : t("ดูรายการได้อย่างเดียว")}
                    </span>
                  )}
                </div>

                {/* บอกเสมอว่าบันทึกไปอยู่ที่ไหน (T1.269) — ก่อนหน้านี้คนกรอกนึกว่าทุกเครื่องเห็น ทั้งที่อยู่แค่ในเครื่องตัวเอง */}
                <p className="bl-store">
                  <Icon name={logMode === "server" ? "wifi" : "lock"} size={16} aria-hidden="true" />
                  {logMode === "server"
                    ? t("บันทึกขึ้นระบบกลาง — ทุกเครื่องเห็นตรงกัน และขึ้นในรายงานส่งเวร")
                    : t("เก็บในเครื่องนี้เท่านั้น — เครื่องอื่นไม่เห็น")}
                </p>
                {logMode === "server" && logStatus === "loading" && (
                  <p className="bl-store">{t("กำลังโหลดรายการบันทึก…")}</p>
                )}
                {logMode === "server" && logStatus === "unauthorized" && (
                  <p className="bl-store">{t("ต้องเข้าสู่ระบบก่อนจึงจะเห็นรายการบันทึก")}</p>
                )}
                {logError && (
                  <p className="bl-error" role="alert">
                    <Icon name="warn" size={17} aria-hidden="true" />
                    {t("บันทึกไม่สำเร็จ — {reason}", { reason: logError })}
                  </p>
                )}
                {pendingLocal > 0 && (
                  <div className="bl-import">
                    <p>
                      {t("เครื่องนี้มีบันทึกเก่าที่ยังไม่อยู่ในระบบกลาง {n} รายการ — เครื่องอื่นและรายงานส่งเวรยังไม่เห็น", {
                        n: formatNumber(pendingLocal),
                      })}
                    </p>
                    <button
                      type="button"
                      className="fx-btn"
                      disabled={!canWrite || logBusy}
                      onClick={async () => {
                        try {
                          setImported(await importLocal());
                        } catch {
                          /* ข้อความผิดพลาดอยู่ใน logError แล้ว */
                        }
                      }}
                    >
                      <Icon name="send" size={17} aria-hidden="true" />
                      {t("ย้ายขึ้นระบบกลาง")}
                    </button>
                  </div>
                )}
                {imported && (
                  <p className="bl-store" role="status">
                    {t("ย้ายขึ้นระบบแล้ว {added} รายการ · มีอยู่แล้ว {already} · ข้ามเพราะข้อมูลไม่ครบ {skipped}", {
                      added: formatNumber(imported.added),
                      already: formatNumber(imported.already),
                      skipped: formatNumber(imported.skipped),
                    })}
                  </p>
                )}

                {/* ปิดฟอร์มแล้วต้องบอกเหตุผลเสมอ ห้ามปิดเงียบ ๆ (กติกาใน CLAUDE.md) */}
                {!canWrite && (
                  <AdminNote action="record.write">
                    {t("ดูรายการบันทึกได้ทั้งหมด แต่เพิ่ม แก้ไข และลบไม่ได้")}
                  </AdminNote>
                )}

                {/* ═══ บันทึกด่วน — อยู่เหนือฟอร์มเต็มเสมอ (T1.320) ═══
                    วางไว้ก่อนเพราะเป็นทางที่คนใช้จริงเกือบทุกครั้ง
                    ฟอร์มเต็มข้างล่างไว้สำหรับกรณีที่ต้องใส่หมายเหตุหรือย้อนวันที่ */}
                <div className="bl-quick">
                  <p className="bl-quick-head">
                    {quickType
                      ? t("{kind} — กดจำนวน", { kind: t(quickType.label) })
                      : t("บันทึกด่วน · วันนี้")}
                  </p>

                  {quickType ? (
                    <div className="bl-quick-row">
                      {(QUICK_AMOUNTS[quickType.unit] ?? [1, 2, 5]).map((n) => (
                        <button
                          key={n}
                          type="button"
                          className="bl-quick-amount"
                          disabled={!canWrite || logBusy}
                          onClick={() => quickSave(quickType, n)}
                        >
                          {formatNumber(n)} {t(quickType.unit)}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="bl-quick-cancel"
                        onClick={() => setQuickType(null)}
                      >
                        {t("ยกเลิก")}
                      </button>
                    </div>
                  ) : (
                    <div className="bl-quick-row">
                      {LOG_TYPES.map((kind) => (
                        <button
                          key={kind.value}
                          type="button"
                          className={`bl-quick-kind is-${kind.tone}`}
                          disabled={!canWrite || logBusy}
                          onClick={() => {
                            setQuickDone(null);
                            setQuickType(kind);
                          }}
                        >
                          {t(kind.label)}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* ★ บันทึกแล้วต้องเห็นว่าบันทึกอะไรไป และถอนได้
                      ไม่มีฟอร์มให้ทบทวนก่อนส่ง ความผิดพลาดจึงลงบันทึกทันทีที่นิ้วแตะ */}
                  {quickDone && (
                    <p className="bl-quick-done" role="status">
                      <Icon name="check" size={17} aria-hidden="true" />
                      {t("บันทึกแล้ว · {kind} {amount} {unit}", {
                        kind: t(quickDone.label),
                        amount: formatNumber(quickDone.amount),
                        unit: t(quickDone.unit),
                      })}
                      {quickDone.id && (
                        <button
                          type="button"
                          className="bl-quick-undo"
                          disabled={logBusy}
                          onClick={quickUndo}
                        >
                          {t("เลิกทำ")}
                        </button>
                      )}
                    </p>
                  )}
                </div>

                <form className="bl-form" onSubmit={submit}>
                  <label className="bl-field">
                    <span className="bl-label">{t("วันที่")}</span>
                    <input
                      type="date"
                      className="fx-input"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                      required
                    />
                  </label>

                  <label className="bl-field is-wide">
                    <span className="bl-label">{t("ประเภทข้อมูล")}</span>
                    <select
                      className="fx-select"
                      value={form.type}
                      onChange={(e) => {
                        const kind = typeOf(e.target.value);
                        setForm({
                          ...form,
                          type: e.target.value,
                          unit: kind?.unit ?? form.unit,
                        });
                      }}
                    >
                      {LOG_TYPES.map((kind) => (
                        <option key={kind.value} value={kind.value}>
                          {t(kind.label)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="bl-field is-narrow">
                    <span className="bl-label">{t("จำนวน")}</span>
                    <input
                      type="number"
                      min="1"
                      className="fx-input"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      placeholder={t("ระบุจำนวน")}
                      required
                    />
                  </label>

                  <label className="bl-field is-narrow">
                    <span className="bl-label">{t("หน่วย")}</span>
                    <select
                      className="fx-select"
                      value={form.unit}
                      onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    >
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {t(u)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="bl-field is-wide">
                    <span className="bl-label">{t("หมายเหตุ")}</span>
                    <input
                      type="text"
                      className="fx-input"
                      value={form.note}
                      onChange={(e) => setForm({ ...form, note: e.target.value })}
                      placeholder={t("หมายเหตุ เช่น พบในคอก 3 ช่วงเช้า")}
                    />
                  </label>

                  <span className="bl-form-actions">
                    <button type="submit" className="bl-add" disabled={!canWrite || logBusy}>
                      <Icon
                        name={canWrite ? (editingId ? "check" : "plus") : "lock"}
                        size={19}
                      />
                      {editingId ? t("บันทึกการแก้ไข") : t("เพิ่มข้อมูล")}
                    </button>
                    {editingId && (
                      <button
                        type="button"
                        className="fx-btn"
                        onClick={() => {
                          setEditingId(null);
                          setForm({ date: todayISO(), type: "dead", amount: "", unit: "ตัว", note: "" });
                        }}
                      >
                        <Icon name="cross" size={17} />
                        ยกเลิก
                      </button>
                    )}
                  </span>
                </form>

                <div className="bl-list-bar">
                  <span className="fx-search bl-search">
                    <Icon name="search" size={19} className="fx-search-icon" />
                    <input
                      type="search"
                      className="fx-input"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPage(1);
                        if (e.target.value.trim()) setListOpen(true);
                      }}
                      placeholder={t("ค้นหาในรายการบันทึก (ประเภท / หมายเหตุ / ผู้บันทึก)")}
                      aria-label={t("ค้นหาในรายการบันทึก")}
                    />
                  </span>

                  <button
                    type="button"
                    className="fx-btn"
                    onClick={() => setListOpen((open) => !open)}
                    aria-expanded={listOpen}
                  >
                    <Icon name="list" size={17} />
                    {listOpen
                      ? t("ซ่อนรายการ")
                      : t("ดูรายการบันทึก ({n} รายการ)", { n: formatNumber(entries.length) })}
                  </button>
                </div>

                {!listOpen ? (
                  <p className="bl-list-hint">
                    <Icon name="list" size={17} />
                    {t("รายการบันทึกถูกซ่อนไว้ — กด “ดูรายการบันทึก” หรือพิมพ์คำค้นด้านบนเพื่อแสดง")}
                  </p>
                ) : matched.length === 0 ? (
                  <p className="fx-empty">{t("ไม่พบรายการที่ตรงกับ “{query}”", { query })}</p>
                ) : (
                  <>
                <div className="table-scroll">
                  <table className="bl-table">
                    <thead>
                      <tr>
                        <th>{t("วันที่ / เวลา")}</th>
                        <th>{t("ประเภทข้อมูล")}</th>
                        <th className="num">{t("จำนวน")}</th>
                        <th>{t("หน่วย")}</th>
                        <th>{t("หมายเหตุ")}</th>
                        <th>{t("ผู้บันทึก")}</th>
                        <th>{t("จัดการ")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleEntries.map((e) => (
                        <tr key={e.id} className={editingId === e.id ? "is-editing" : ""}>
                          <td className="bl-when">
                            {formatDateShort(e.at.slice(0, 10))} {formatTime(e.at)}
                          </td>
                          <td>
                            <span className={`bl-type is-${typeOf(e.type)?.tone}`}>
                              {t(typeOf(e.type)?.label ?? "")}
                            </span>
                          </td>
                          <td className="num">{formatNumber(e.amount)}</td>
                          <td>{t(e.unit)}</td>
                          <td className="bl-note">{e.note ? t(e.note) : "—"}</td>
                          <td>{t(e.by)}</td>
                          <td>
                            <span className="bl-row-actions">
                              <button
                                type="button"
                                className="bl-icon-btn"
                                onClick={() => startEdit(e)}
                                disabled={!canWrite}
                                title={canWrite ? "" : t("ต้องมีสิทธิ์ระดับผู้บันทึกขึ้นไปจึงจะแก้ไขได้")}
                              >
                                <Icon name="pencil" size={17} />
                                <span className="sr-only">{t("แก้ไขรายการ")}</span>
                              </button>
                              {confirmId === e.id ? (
                                <>
                                  <button
                                    type="button"
                                    className="bl-icon-btn is-danger is-text"
                                    onClick={() => remove(e.id)}
                                  >
                                    <Icon name="check" size={17} />
                                    ยืนยันลบ
                                  </button>
                                  <button
                                    type="button"
                                    className="bl-icon-btn is-text"
                                    onClick={() => setConfirmId(null)}
                                  >
                                    ไม่ลบ
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className="bl-icon-btn is-danger"
                                  onClick={() => setConfirmId(e.id)}
                                  disabled={!canWrite}
                                  title={canWrite ? "" : t("ต้องมีสิทธิ์ระดับผู้บันทึกขึ้นไปจึงจะลบได้")}
                                >
                                  <Icon name="trash" size={17} />
                                  <span className="sr-only">{t("ลบรายการ")}</span>
                                </button>
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ---- แบ่งหน้า ---- */}
                <div className="bl-pager">
                  <span className="bl-pager-info">
                    {q
                      ? t("พบ {found} จาก {total} รายการ", {
                          found: formatNumber(matched.length),
                          total: formatNumber(entries.length),
                        })
                      : t("ทั้งหมด {n} รายการ", { n: formatNumber(entries.length) })}
                  </span>

                  <span className="bl-pager-btns">
                    <button
                      type="button"
                      className="bl-page-btn"
                      onClick={() => setPage(1)}
                      disabled={currentPage === 1}
                      aria-label={t("หน้าแรก|หน้าตาราง")}
                    >
                      <Icon name="chevrons-left" size={17} />
                    </button>
                    <button
                      type="button"
                      className="bl-page-btn"
                      onClick={() => setPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      aria-label={t("หน้าก่อนหน้า")}
                    >
                      <Icon name="chevron" size={17} className="bl-flip" />
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={"bl-page-btn" + (n === currentPage ? " is-active" : "")}
                        onClick={() => setPage(n)}
                        aria-current={n === currentPage ? "page" : undefined}
                      >
                        {n}
                      </button>
                    ))}

                    <button
                      type="button"
                      className="bl-page-btn"
                      onClick={() => setPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      aria-label={t("หน้าถัดไป")}
                    >
                      <Icon name="chevron" size={17} />
                    </button>
                    <button
                      type="button"
                      className="bl-page-btn"
                      onClick={() => setPage(totalPages)}
                      disabled={currentPage === totalPages}
                      aria-label={t("หน้าสุดท้าย")}
                    >
                      <Icon name="chevrons-right" size={17} />
                    </button>
                  </span>

                  <label className="bl-pager-size">
                    {t("แสดง")}
                    <select
                      className="fx-select"
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(1);
                      }}
                      aria-label={t("จำนวนรายการต่อหน้า")}
                    >
                      {PAGE_SIZES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    {t("รายการ")}
                  </label>
                </div>

                <p className="bl-note-hint">
                  <Icon name="clock" size={16} />
                  {t("ยังไม่ได้ต่อฐานข้อมูล — รายการที่บันทึกจะอยู่จนกว่าจะรีเฟรชหน้า")}
                </p>
                  </>
                )}
              </Card>
            </Block>
          </PageBoard>
        </main>
      </div>

      {/* ---------- ภาพกล้องเต็มจอ (ทั้งภาพสดและภาพที่บันทึกไว้) ----------
          ไม่ใช้ Modal เพราะ Modal เป็นกล่องกลางจอที่มีขอบ — อันนี้ต้องกินพื้นที่ทั้งจอ
          ภาพใช้ object-fit: contain จะได้เห็นเต็มเฟรม ไม่โดนครอปเหมือนตอนอยู่ในการ์ด */}
      {viewer && (
        <div
          className="bl-viewer"
          ref={viewerRef}
          role="dialog"
          aria-modal="true"
          aria-label={viewingShot ? t("ภาพที่บันทึกไว้") : t("ภาพจากกล้อง AI เต็มจอ")}
        >
          <header className="bl-viewer-bar is-top">
            <span className="bl-viewer-title">
              <Icon name="camera" size={20} />
              <b>
                {viewingShot
                  ? t("ภาพที่บันทึกไว้")
                  : t("กล้อง AI · {name}", {
                      name: cam ? t(`${cam.name}|ชื่อสั้น`) : t(barn.name),
                    })}
              </b>
              <span>
                {viewingShot
                  ? t("{cam} · บันทึกเมื่อ {date} {time}", {
                      cam: t(viewingShot.cameraName),
                      date: formatDateShort(viewingShot.at),
                      time: formatTime(viewingShot.at),
                    })
                  : t("{barn} · อัปเดตล่าสุด {time}", {
                      barn: t(barn.name),
                      time: formatWhen(barn.updatedAt),
                    })}
              </span>
            </span>

            <span className="bl-viewer-acts">
              {/* เต็มจอจริงของเบราว์เซอร์ (ซ่อนแถบเมนูเบราว์เซอร์ด้วย) — บางที่สั่งไม่ได้ก็ยังเต็มหน้าจอเว็บอยู่ดี */}
              <button type="button" className="bl-viewer-btn" onClick={toggleFullscreen}>
                <Icon name={isFullscreen ? "minus" : "expand"} size={18} />
                {isFullscreen ? t("ออกจากเต็มจอ") : t("เต็มจอทั้งเครื่อง")}
              </button>
              <button type="button" className="bl-viewer-btn" onClick={closeViewer}>
                <Icon name="cross" size={18} />
                ปิด
              </button>
            </span>
          </header>

          <div className="bl-viewer-stage">
            {/* ภาพที่บันทึกไว้เป็นภาพนิ่ง จึงไม่ส่ง stream เข้าไป (ไม่งั้นกลายเป็นภาพสดของวันนี้) */}
            <CameraView
              className="bl-viewer-img"
              flagIndex={viewingShot ? viewingShot.flagIndex : flagIndex}
              stream={viewingShot ? null : cam?.stream}
            />

            {savedId && (
              <span className="bl-cam-flash" role="status">
                <Icon name="check" size={17} />
                {t("บันทึกภาพแล้ว")}
              </span>
            )}
          </div>

          <footer className="bl-viewer-bar is-bottom">
            <span className="bl-viewer-count">
              {t("AI ตรวจนับสุกร")}
              <b className="num">{formatNumber(viewingShot?.detected ?? cam?.detected ?? 0)}</b>
              <em>{t("ตัว")}</em>
            </span>

            {/* ภาพสดสลับกล้องได้ทั้งที่ยังเต็มจอ ไม่ต้องปิดออกไปกด */}
            {!viewingShot && barn.cameras.length > 0 && (
              <span className="bl-viewer-tabs" role="tablist" aria-label={t("เลือกกล้อง")}>
                {barn.cameras.map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={camera === i}
                    className={"bl-viewer-btn" + (camera === i ? " is-on" : "")}
                    onClick={() => setCamera(i)}
                  >
                    <Icon name="camera" size={17} />
                    {t(`${item.name}|ชื่อสั้น`)}
                  </button>
                ))}
              </span>
            )}

            {viewingShot ? (
              <button
                type="button"
                className="bl-viewer-btn"
                disabled={!canWrite}
                title={canWrite ? undefined : t("ต้องมีสิทธิ์ระดับผู้บันทึกขึ้นไป")}
                onClick={() => {
                  removeShot(viewingShot.id);
                  closeViewer();
                }}
              >
                <Icon name="trash" size={17} />
                ลบภาพนี้
              </button>
            ) : (
              cam && (
                <button
                  type="button"
                  className="bl-viewer-btn is-primary"
                  onClick={capture}
                  disabled={!canWrite}
                  title={canWrite ? undefined : t("ต้องมีสิทธิ์ระดับผู้บันทึกขึ้นไป")}
                >
                  <Icon name="camera" size={18} />
                  {t("บันทึกภาพนี้")}
                </button>
              )
            )}
          </footer>
        </div>
      )}
    </div>
  );
}
