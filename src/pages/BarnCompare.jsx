/**
 * หน้า "เทียบโรงเรือนในฟาร์ม" — /dashboard/environment/compare?farm=&barn=&metric=&sort=
 *
 * ปลายทางของปุ่ม "ดูการเปรียบเทียบ" ในการ์ด "เทียบกับโรงเรือนอื่น" ของหน้าระบบควบคุมสภาพแวดล้อม
 * เดิมปุ่มนั้นกางรายการอยู่ในการ์ดแคบ ๆ กว้าง 4 ช่อง ซึ่งใส่ได้แค่แถบเทียบอุณหภูมิอย่างเดียว
 * ผู้ใช้สั่งให้แยกเป็นหน้าของตัวเอง (1 ก.ย. 2569) จะได้เทียบได้ครบทุกค่า ไม่ใช่แค่อุณหภูมิ
 *
 * **หลักของหน้านี้: เลือกตัวชี้วัดหนึ่งตัว แล้วทั้งหน้าเปลี่ยนตาม**
 * ตัวเลขสรุปสี่ใบ · กราฟแท่ง · แถบจัดอันดับ — ทั้งหมดพูดถึงตัวชี้วัดเดียวกันเสมอ
 * ➜ ไม่ต้องมีกราฟสองแกน (ซึ่ง docs/DESIGN.md ห้ามไว้) และไม่ต้องเดาว่าเลขไหนคู่กับอะไร
 * ส่วนตารางล่างสุดแสดงครบทุกค่าในทีเดียว สำหรับคนที่อยากเห็นภาพรวม
 *
 * ทุกอย่างเก็บใน URL (ฟาร์ม · ตัวชี้วัด · การเรียง) จึงส่งลิงก์ต่อได้และรีเฟรชแล้วอยู่ที่เดิม
 * เกณฑ์ "อยู่ในช่วงเหมาะสม" มาจากหน้าตั้งค่าเหมือนทุกหน้าในแอป
 */
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  ReferenceArea,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import PageHeader from "../components/ui/PageHeader.jsx";
import PageBoard, { Block } from "../components/board/PageBoard.jsx";
import Card from "../components/ui/Card.jsx";
import StatTile from "../components/ui/StatTile.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import Icon from "../components/ui/Icon.jsx";
import { useAllFarms } from "../lib/records/useAllFarms.js";
import { BARN_STATUS_LABEL } from "../data/mock/barnsByFarm.js";
import { readingStatus, thiOf, thiLevel } from "../data/mock/climate.js";
import { airStatus } from "../data/mock/airQuality.js";
import {
  SERIES,
  GAS_COLORS,
  gridProps,
  axisProps,
  tooltipStyle,
  comfortBandProps,
} from "../lib/chartTheme.js";
import { useSettings } from "../lib/settings/useSettings.js";
import { formatNumber, formatNumber1, formatDateTime } from "../lib/format.js";
import "./BarnCompare.css";
import { useT } from "../lib/i18n/useT.js";

/** รหัสกระดานของหน้านี้ — คีย์ที่ใช้เก็บชุดเลย์เอาต์ (ดู lib/layout/presets.js) */
const BOARD_ID = "compare";

/** ความสูงกราฟแท่งของหน้านี้ */
const CHART_HEIGHT = 300;

const dash = (value, format = formatNumber1) => (value == null ? "—" : format(value));
const whole = (value) => formatNumber(Math.round(value));

/**
 * ตัวชี้วัดที่เทียบได้ — **สีผูกกับตัวชี้วัดถาวร ห้ามสลับ**
 * อุณหภูมิ/ความชื้นใช้สีเดียวกับกราฟเส้นเล็กในการ์ดโรงเรือนและกราฟย้อนหลัง
 * ส่วนแอมโมเนียใช้สีเดียวกับกราฟก๊าซ (GAS_COLORS) คนจึงจำสีข้ามหน้าได้
 *
 * `band` = ช่วงที่ถือว่าปกติ ใช้วาดแถบเขียวหลังแท่ง
 *
 * **ป้ายข้อความเขียนเต็มทีละตัว (avgLabel · chartTitle · statusHead) ห้ามต่อสตริงเอง**
 * เคยเขียน `${label}เฉลี่ยทั้งฟาร์ม` แล้วได้ "ดัชนีความร้อน THIเฉลี่ยทั้งฟาร์ม"
 * — ภาษาไทยไม่เว้นวรรค แต่คำที่ลงท้ายด้วยอักษรโรมันต้องเว้น กฎเดียวใช้ไม่ได้ทุกตัว
 */
const METRICS = [
  {
    id: "temp",
    label: "อุณหภูมิ",
    avgLabel: "อุณหภูมิเฉลี่ยทั้งฟาร์ม",
    chartTitle: "อุณหภูมิรายโรงเรือน",
    statusHead: "สถานะอุณหภูมิ",
    unit: "°C",
    icon: "thermometer",
    color: SERIES[7],
    read: (barn) => barn.tempC,
    format: formatNumber1,
    status: (value, comfort) => readingStatus("tempC", value, comfort),
    band: (comfort) => [comfort.tempC.min, comfort.tempC.max],
    bandText: () => "ช่วงที่เหมาะสม {min}–{max} °C",
  },
  {
    id: "humidity",
    label: "ความชื้น",
    avgLabel: "ความชื้นเฉลี่ยทั้งฟาร์ม",
    chartTitle: "ความชื้นรายโรงเรือน",
    statusHead: "สถานะความชื้น",
    unit: "%",
    icon: "drop",
    color: SERIES[0],
    read: (barn) => barn.humidity,
    format: whole,
    status: (value, comfort) => readingStatus("humidity", value, comfort),
    band: (comfort) => [comfort.humidity.min, comfort.humidity.max],
    bandText: () => "ช่วงที่เหมาะสม {min}–{max} %",
  },
  {
    id: "nh3",
    label: "แอมโมเนีย",
    avgLabel: "แอมโมเนียเฉลี่ยทั้งฟาร์ม",
    chartTitle: "แอมโมเนียรายโรงเรือน",
    statusHead: "สถานะแอมโมเนีย",
    unit: "ppm",
    icon: "wind",
    color: GAS_COLORS.nh3,
    read: (barn) => barn.nh3,
    format: formatNumber1,
    /* ก๊าซมีแต่เพดาน ไม่มีขอบล่าง — ต่ำยิ่งดี จึงส่ง nh3Limit จากหน้าตั้งค่าเป็น max */
    status: (value, _comfort, limits) => airStatus("nh3", value, limits.nh3Limit),
    band: (_comfort, limits) => [0, limits.nh3Limit],
    bandText: () => "ช่วงที่ยอมรับได้ ไม่เกิน {n} ppm",
  },
  {
    id: "thi",
    label: "ดัชนีความร้อน THI",
    avgLabel: "ค่า THI เฉลี่ยทั้งฟาร์ม",
    chartTitle: "ค่า THI รายโรงเรือน",
    statusHead: "สถานะ THI",
    unit: "",
    icon: "spark",
    color: SERIES[2],
    /* THI คำนวณจากอุณหภูมิ+ความชื้น ไม่ได้มากับเซนเซอร์ — ขาดตัวใดตัวหนึ่งก็คำนวณไม่ได้ */
    read: (barn) =>
      barn.tempC == null || barn.humidity == null ? null : thiOf(barn.tempC, barn.humidity),
    format: formatNumber1,
    status: (value) => (value == null ? { tone: "offline", label: "ไม่มีสัญญาณ" } : thiLevel(value)),
    /* ต่ำกว่า 74 คือ "สบายตัว" ตามเกณฑ์เดียวกับ thiLevel() */
    band: () => [0, 74],
    bandText: () => "ช่วงที่สุกรสบายตัว (ต่ำกว่า 74)",
  },
];

/** วิธีเรียง — เรียงตามค่าของตัวชี้วัดที่เลือกอยู่ หรือตามชื่อ */
const SORTS = [
  { id: "high", label: "ค่าสูงสุดก่อน" },
  { id: "low", label: "ค่าต่ำสุดก่อน" },
  { id: "name", label: "ชื่อโรงเรือน" },
];

const mean = (values) =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

export default function BarnCompare() {
  const t = useT();
  const { comfort, settings } = useSettings();
  const { farms, barnsOf } = useAllFarms();
  const [params, setParams] = useSearchParams();

  const limits = { nh3Limit: settings.comfort.nh3Limit };

  /* ฟาร์มที่เทียบ — ไม่มีใน URL หรือฟาร์มถูกลบไปแล้ว ให้ถอยไปฟาร์มแรกแทนที่จะได้หน้าเปล่า
     (ผู้ใช้ลบฟาร์มได้จนไม่เหลือสักฟาร์ม จึงต้องรับมือกรณี null ด้วย) */
  const rawFarmId = params.get("farm") ?? "";
  const farm = farms.find((f) => f.id === rawFarmId) ?? farms[0] ?? null;
  const farmId = farm?.id ?? "";
  /* โรงเรือนที่ผู้ใช้เดินทางมาจาก — ไฮไลต์ไว้ให้หาตัวเองเจอในรายการ */
  const fromBarnId = params.get("barn") ?? "";

  const rawMetric = params.get("metric") ?? "";
  const metric = METRICS.find((m) => m.id === rawMetric) ?? METRICS[0];
  const rawSort = params.get("sort") ?? "";
  const sort = SORTS.some((s) => s.id === rawSort) ? rawSort : "high";

  /* replace ไม่ใช่ push — สลับตัวชี้วัด/การเรียงหลายทีแล้วประวัติจะกองจนกดย้อนกลับไม่ออก
     ค่าตั้งต้นลบพารามิเตอร์ทิ้ง จะได้ไม่มี URL ยาว ๆ ที่ความหมายเท่ากับ URL สั้น */
  const patch = (next) => {
    const merged = new URLSearchParams(params);
    Object.entries(next).forEach(([key, value]) =>
      value ? merged.set(key, value) : merged.delete(key)
    );
    setParams(merged, { replace: true });
  };

  const barnList = useMemo(() => (farmId ? barnsOf(farmId) : []), [farmId, barnsOf]);

  /* หนึ่งแถวต่อหนึ่งโรงเรือน พร้อมค่าของตัวชี้วัดที่เลือกและสถานะของค่านั้น
     โรงเรือนที่ไม่ส่งค่ายังอยู่ในรายการ (ต้องรู้ว่ามีหลังที่เงียบอยู่) แต่ไปอยู่ท้ายเสมอ */
  const rows = useMemo(() => {
    const list = barnList.map((barn) => {
      const value = barn.status === "offline" ? null : metric.read(barn);
      return {
        ...barn,
        value,
        /* `status` ของโรงเรือน (online/offline) ถูกทับด้วย "สถานะของค่าที่กำลังเทียบ"
           จึงต้องเก็บของเดิมไว้ก่อน ไม่งั้นแยกไม่ออกว่าไม่มีค่าเพราะสายหลุดหรือเพราะยังไม่มีเซนเซอร์ */
        barnStatus: barn.status,
        status: metric.status(value, comfort, limits),
        thi:
          barn.tempC == null || barn.humidity == null
            ? null
            : thiOf(barn.tempC, barn.humidity),
      };
    });
    list.sort((a, b) => {
      if (a.value == null && b.value == null) return a.name.localeCompare(b.name, "th");
      if (a.value == null) return 1;
      if (b.value == null) return -1;
      if (sort === "name") return a.name.localeCompare(b.name, "th");
      if (sort === "low") return a.value - b.value;
      return b.value - a.value;
    });
    return list;
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- limits เป็น object ใหม่ทุกรอบ ใช้ค่าข้างในแทน */
  }, [barnList, metric, comfort, sort, settings.comfort.nh3Limit]);

  const reporting = rows.filter((r) => r.value != null);
  /**
   * **"ไม่มีค่า" มีสองสาเหตุที่ต้องแยกกันให้ชัด** ไม่งั้นหน้าจอโกหกคนอ่าน
   * - `offlineCount` = โรงเรือนที่สายหลุด/ไม่ส่งอะไรเลย  ➜ ต้องไปดูที่ตู้ควบคุม
   * - `noSensorCount` = โรงเรือนที่ยังส่งค่าอื่นอยู่ แต่**ไม่มีเซนเซอร์วัดค่าที่กำลังเทียบ**
   *   (เช่นฟาร์มจริงไม่มีหัววัดแอมโมเนีย) ➜ ไม่ใช่ของเสีย ไม่ต้องไปตรวจอะไร
   * ของเดิมนับรวมกันแล้วเขียนว่า "เงียบอยู่ 1 หลัง" ทั้งที่โรงเรือนนั้นส่งอุณหภูมิอยู่ปกติ
   */
  const offlineCount = rows.filter((r) => r.barnStatus === "offline").length;
  const noSensorCount = rows.length - reporting.length - offlineCount;
  const values = reporting.map((r) => r.value);
  const avg = mean(values);
  const max = values.length ? Math.max(...values) : null;
  const min = values.length ? Math.min(...values) : null;
  const spread = max == null ? null : max - min;
  const maxBarn = reporting.find((r) => r.value === max) ?? null;
  const minBarn = reporting.find((r) => r.value === min) ?? null;
  const outOfRange = reporting.filter((r) => r.status.tone !== "good").length;

  const [bandLow, bandHigh] = metric.band(comfort, limits);
  /* คีย์แปลของแถบเกณฑ์มีตัวแปรอยู่ข้างใน จึงส่งค่าทั้งสามชุดเข้าไปพร้อมกัน
     ตัวไหนไม่ได้ใช้ในคีย์นั้นก็ถูกมองข้ามเอง (translate แทนเฉพาะชื่อที่ตรงกัน) */
  const bandText = t(metric.bandText(comfort, limits), {
    min: formatNumber(metric.band(comfort, limits)[0]),
    max: formatNumber(metric.band(comfort, limits)[1]),
    n: formatNumber(limits.nh3Limit),
  });

  /**
   * ช่วงแกนตั้งของกราฟ — คลุมทั้งช่วงเกณฑ์และค่าจริงเสมอ เผื่อขอบข้างละ 2
   *
   * **ทำไมไม่เริ่มที่ 0 ทุกกรณี** อุณหภูมิ 27.8 กับ 30.4 ต่างกันจริง ๆ 2.6 องศา
   * ซึ่งเป็นความต่างที่มีความหมายมากในโรงเรือน แต่ถ้าลากแกนจาก 0 แท่งสองแท่งจะสูง
   * 87% กับ 95% ของกัน มองด้วยตาแล้วเหมือนเท่ากัน — กราฟเลยไม่ตอบคำถามที่คนเปิดหน้านี้มาถาม
   * (หน้าอุณหภูมิทุกฟาร์มใช้วิธีเดียวกันมาก่อนแล้ว — ตรึงไว้ที่ 20–34)
   *
   * ค่าที่ 0 มีความหมายจริง (แอมโมเนีย · THI) จะได้ขอบล่าง 0 เองอยู่แล้ว
   * เพราะช่วงเกณฑ์ของสองตัวนั้นเริ่มที่ 0 — ไม่ต้องแยกเคส
   * และเขียนกำกับใต้หัวการ์ดทุกครั้งที่แกนไม่ได้เริ่มที่ 0 เพื่อไม่ให้อ่านความยาวแท่งผิด
   */
  const axisLow = Math.max(0, Math.floor(Math.min(bandLow, min ?? bandLow) - 2));
  const axisHigh = Math.ceil(Math.max(bandHigh, max ?? bandHigh) + 2);

  /* กราฟรับเฉพาะหลังที่มีตัวเลข — แท่งสูงศูนย์ของหลังที่เงียบอ่านเหมือน "ค่าเป็น 0"
     ซึ่งคนละความหมายกับ "ไม่มีค่า" (หลังที่เงียบไปอยู่ในตารางล่างพร้อมป้ายบอกสถานะ) */
  const chartData = reporting.map((r) => ({
    name: r.name.replace("โรงเรือน", ""),
    full: r.name,
    value: Number(r.value.toFixed(1)),
  }));

  /* ฐานของแถบในรายการจัดอันดับ = ต่ำกว่าค่าน้อยสุดและขอบล่างของเกณฑ์อยู่หนึ่งขั้น
     เพื่อให้ความยาวแถบสื่อ "ห่างจากเกณฑ์แค่ไหน" ไม่ใช่ "ค่าเท่าไร" ซึ่งเทียบกันไม่ได้ */
  const trackBase = Math.min(bandLow, min ?? bandLow) - 1;
  const trackTop = Math.max(bandHigh, max ?? bandHigh) + 1;
  const trackWidth = (value) =>
    `${Math.min(100, Math.max(6, ((value - trackBase) / (trackTop - trackBase)) * 100))}%`;

  /* กลับไปหน้าที่มาจาก — พาโรงเรือนเดิมกลับไปด้วย ไม่งั้นเด้งไปหลังแรกของฟาร์ม */
  const backTo =
    `/dashboard/environment?farm=${encodeURIComponent(farmId)}` +
    (fromBarnId ? `&barn=${encodeURIComponent(fromBarnId)}` : "");

  /** ลิงก์เปิดหน้าสภาพแวดล้อมของโรงเรือนหลังนั้น */
  const barnLink = (barnId) =>
    `/dashboard/environment?farm=${encodeURIComponent(farmId)}&barn=${encodeURIComponent(barnId)}`;

  return (
    <>
      <PageHeader
        title={t("เทียบโรงเรือนในฟาร์ม")}
        subtitle={
          farm
            ? t("{farm} · {reporting} จาก {total} หลังที่ส่งค่า {metric} · อัปเดตล่าสุด {time}", {
                farm: t(farm.name),
                reporting: formatNumber(reporting.length),
                total: formatNumber(rows.length),
                metric: t(metric.label),
                time: formatDateTime(farm.updatedAt),
              })
            : t("ยังไม่มีฟาร์มในระบบ")
        }
        action={
          <Link className="bc-back" to={backTo}>
            <Icon name="chevron" size={18} className="bc-back-arrow" aria-hidden="true" />
            {t("กลับไปหน้าสภาพแวดล้อม")}
          </Link>
        }
      />

      {/* แถบเลือกฟาร์มและตัวชี้วัด — เปลี่ยนทั้งหน้า จึงอยู่เหนือกระดาน ไม่ใช่ในการ์ดใบใดใบหนึ่ง */}
      <div className="bc-bar">
        {farms.length > 1 && (
          <div className="bc-group" role="group" aria-label={t("เลือกฟาร์มที่จะเทียบ")}>
            <span className="bc-group-label">
              <Icon name="pin" size={16} aria-hidden="true" />
              {t("ฟาร์ม|หัวตาราง")}
            </span>
            {farms.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={f.id === farmId}
                className={"bc-pill" + (f.id === farmId ? " is-on" : "")}
                onClick={() => patch({ farm: f.id, barn: "" })}
              >
                {f.id === farmId && <Icon name="check" size={15} aria-hidden="true" />}
                {t(f.name)}
              </button>
            ))}
          </div>
        )}

        <div className="bc-group" role="group" aria-label={t("เลือกค่าที่จะเทียบ")}>
          <span className="bc-group-label">
            <Icon name="chart" size={16} aria-hidden="true" />
            {t("เทียบด้วย")}
          </span>
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={m.id === metric.id}
              className={"bc-pill" + (m.id === metric.id ? " is-on" : "")}
              onClick={() => patch({ metric: m.id === METRICS[0].id ? "" : m.id })}
            >
              <Icon name={m.id === metric.id ? "check" : m.icon} size={15} aria-hidden="true" />
              {t(m.label)}
            </button>
          ))}
        </div>
      </div>

      <PageBoard boardId={BOARD_ID}>
        <Block id="count" label={t("โรงเรือนที่ส่งค่า")}>
          <StatTile
            variant="row"
            tone="blue"
            label={t("หลังที่ส่งค่า {metric}", { metric: t(metric.label) })}
            value={formatNumber(reporting.length)}
            unit={t("หลัง")}
            delta={{
              text:
                rows.length === reporting.length
                  ? t("ส่งค่าครบทุกหลัง")
                  : [
                      offlineCount > 0 &&
                        t("เซนเซอร์เงียบ {n} หลัง", { n: formatNumber(offlineCount) }),
                      noSensorCount > 0 &&
                        t("ไม่มีหัววัดค่านี้ {n} หลัง", { n: formatNumber(noSensorCount) }),
                    ]
                      .filter(Boolean)
                      .join(" · "),
              /* ไม่มีหัววัดไม่ใช่ "เสีย" — ทาแดงเฉพาะตอนมีหลังที่เงียบจริง */
              tone: offlineCount > 0 ? "bad" : "neutral",
            }}
          />
        </Block>

        <Block id="avg" label={t("ค่าเฉลี่ยของฟาร์ม")}>
          <StatTile
            variant="row"
            label={t(metric.avgLabel)}
            value={dash(avg, metric.format)}
            unit={metric.unit}
            delta={{ text: bandText, tone: "neutral" }}
          />
        </Block>

        <Block id="spread" label={t("ช่วงห่างระหว่างหลัง")}>
          {/* น้อยกว่าสองหลังไม่มีอะไรให้เทียบ — เขียนว่า "ห่างกัน 0.0 · A1 สูงสุด · A1 ต่ำสุด"
              เป็นคำตอบที่ถูกแต่ไม่มีประโยชน์ และอ่านเหมือนระบบคำนวณพลาด
              **ต้องแยกเคส "ไม่มีสักหลัง" กับ "มีหลังเดียว" ด้วย** ไม่งั้นตอนไม่มีข้อมูลเลย
              จะขึ้นว่า "มีหลังที่ส่งค่าอยู่หลังเดียว" ซึ่งไม่จริง */}
          <StatTile
            variant="row"
            label={t("ห่างกันมากสุด")}
            value={reporting.length < 2 ? "—" : dash(spread, metric.format)}
            unit={reporting.length < 2 ? "" : metric.unit}
            delta={{
              text:
                reporting.length === 0
                  ? t("ยังไม่มีหลังไหนในฟาร์มนี้ส่งค่า {metric}", { metric: t(metric.label) })
                  : reporting.length === 1
                    ? t("มีหลังเดียวที่ส่งค่านี้ ยังไม่มีอะไรให้เทียบ")
                    : t("{max} สูงสุด · {min} ต่ำสุด", {
                        max: t(maxBarn.name),
                        min: t(minBarn.name),
                      }),
              tone: "neutral",
            }}
          />
        </Block>

        <Block id="outOfRange" label={t("หลังที่หลุดเกณฑ์")}>
          <StatTile
            variant="row"
            tone={outOfRange > 0 ? "critical" : undefined}
            label={t("หลุดเกณฑ์")}
            /* **ไม่มีค่าให้ตรวจ ห้ามขึ้น 0 แล้วบอกว่า "ทุกหลังอยู่ในเกณฑ์"**
               นั่นเป็นการสรุปจากข้อมูลที่ไม่มี — คนอ่านจะนึกว่าตรวจแล้วผ่าน */
            value={reporting.length === 0 ? "—" : formatNumber(outOfRange)}
            unit={reporting.length === 0 ? "" : t("หลัง")}
            delta={{
              text:
                reporting.length === 0
                  ? t("ยังไม่มีค่าให้ตรวจ")
                  : outOfRange > 0
                    ? t("ดูรายละเอียดในตารางด้านล่าง")
                    : t("ทุกหลังอยู่ในเกณฑ์"),
              tone: reporting.length === 0 ? "neutral" : outOfRange > 0 ? "bad" : "good",
            }}
          />
        </Block>

        {/* ---------- กราฟแท่งเทียบทีละค่า ---------- */}
        <Block id="chart" label={t("กราฟเทียบ {chart}", { chart: t(metric.chartTitle) })}>
          <Card
            title={t(metric.chartTitle)}
            subtitle={
              t("แถบเขียวคือ {band} · แสดงเฉพาะหลังที่ส่งค่าอยู่", { band: bandText }) +
              (axisLow > 0
                ? t(" · แกนตั้งเริ่มที่ {n} ไม่ใช่ 0 เพื่อให้เห็นส่วนต่างระหว่างหลัง", {
                    n: formatNumber(axisLow),
                  })
                : "")
            }
            icon="chart"
          >
            {chartData.length === 0 ? (
              <p className="bc-empty">
                <Icon name="power" size={17} aria-hidden="true" />
                ยังไม่มีโรงเรือนที่ส่งค่าให้เทียบในฟาร์มนี้
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                  <CartesianGrid {...gridProps} />
                  {/* แถบช่วงเหมาะสมอยู่หลังแท่งเสมอ (isFront: false อยู่ใน comfortBandProps) */}
                  <ReferenceArea y1={bandLow} y2={bandHigh} {...comfortBandProps} />
                  <XAxis dataKey="name" {...axisProps} />
                  <YAxis {...axisProps} width={46} domain={[axisLow, axisHigh]} />
                  <Tooltip
                    {...tooltipStyle}
                    cursor={{ fill: "var(--bg-tint)" }}
                    formatter={(value) => [
                      `${metric.format(value)} ${metric.unit}`.trim(),
                      t(metric.label),
                    ]}
                    labelFormatter={(name) => t(`โรงเรือน${name}`)}
                  />
                  {/* แท่งทุกแท่งสีเดียวกัน — นี่คือ "ปริมาณของค่าเดียวกัน" ไม่ใช่การแยกประเภท
                      หนึ่งชุดข้อมูลจึงไม่ต้องมี legend (กติกาใน docs/DESIGN.md) */}
                  <Bar
                    dataKey="value"
                    name={t(metric.label)}
                    fill={metric.color}
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Block>

        {/* ---------- จัดอันดับแบบแถบ (ของเดิมที่เคยอยู่ในการ์ดแคบ) ---------- */}
        <Block id="ranking" label={t("จัดอันดับรายโรงเรือน")}>
          <Card
            title={t("จัดอันดับ")}
            subtitle={t("ความยาวแถบคือระยะห่างจากขอบล่างของเกณฑ์ · กดที่หลังไหนเพื่อเปิดหน้าของหลังนั้น")}
            icon="list"
          >
            <div className="bc-sorts" role="group" aria-label={t("เรียงรายการ")}>
              <span className="bc-sorts-label">{t("เรียงตาม")}</span>
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={sort === s.id}
                  className={"bc-sort" + (sort === s.id ? " is-on" : "")}
                  onClick={() => patch({ sort: s.id === "high" ? "" : s.id })}
                >
                  {t(s.label)}
                </button>
              ))}
            </div>

            {rows.length === 0 ? (
              <p className="bc-empty">
                <Icon name="power" size={17} aria-hidden="true" />
                {t("ฟาร์มนี้ยังไม่มีโรงเรือน")}
              </p>
            ) : (
              <ul className="bc-rank">
                {rows.map((row) => (
                  <li key={row.id} className={row.id === fromBarnId ? "is-current" : ""}>
                    <Link className="bc-rank-link" to={barnLink(row.id)}>
                      <span className="bc-rank-name">
                        {t(row.name)}
                        {row.id === fromBarnId && (
                          <b className="bc-rank-now">{t("มาจากหลังนี้")}</b>
                        )}
                      </span>
                      {row.value == null ? (
                        <span className="bc-rank-none">{t("ไม่มีค่าให้เทียบ")}</span>
                      ) : (
                        <span className="bc-rank-track" aria-hidden="true">
                          <span
                            className={`bc-rank-fill is-${row.status.tone}`}
                            style={{ width: trackWidth(row.value) }}
                          />
                        </span>
                      )}
                      {/* แถบสีอย่างเดียวบอกสถานะไม่ได้ ทุกแถวต้องมีป้ายไอคอน + ข้อความกำกับ */}
                      <span className="bc-rank-foot">
                        <span className="num">
                          {dash(row.value, metric.format)} {metric.unit}
                        </span>
                        <StatusBadge tone={row.status.tone}>{t(row.status.label)}</StatusBadge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Block>

        {/* ---------- ตารางครบทุกค่าในทีเดียว ---------- */}
        <Block id="table" label={t("ตารางเทียบทุกค่า")}>
          <Card
            title={t("ตารางเทียบทุกค่า ({n} หลัง)", { n: formatNumber(rows.length) })}
            subtitle={t("ค่าล่าสุดของทุกโรงเรือนในฟาร์มนี้ · กดชื่อโรงเรือนเพื่อเปิดหน้าของหลังนั้น")}
            icon="grid"
          >
            <div className="table-scroll">
              <table className="bc-table">
                <thead>
                  <tr>
                    <th>{t("โรงเรือน|หัวตาราง")}</th>
                    <th className="num">{t("อุณหภูมิ")}</th>
                    <th className="num">{t("ความชื้น")}</th>
                    <th className="num">NH₃</th>
                    <th className="num">THI</th>
                    <th>{t(metric.statusHead)}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="bc-empty-cell">
                        {t("ฟาร์มนี้ยังไม่มีโรงเรือน")}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className={row.id === fromBarnId ? "is-current" : ""}>
                        <td>
                          <Link className="bc-link" to={barnLink(row.id)}>
                            {t(row.name)}
                            <Icon name="chevron" size={15} aria-hidden="true" />
                          </Link>
                          <span className="bc-stage">{t(row.stage)}</span>
                        </td>
                        <td className="num">{dash(row.tempC)} °C</td>
                        <td className="num">{dash(row.humidity, whole)}%</td>
                        <td className="num">{dash(row.nh3)} ppm</td>
                        <td className="num">{dash(row.thi)}</td>
                        <td>
                          {/* หลังที่หลุดการเชื่อมต่อ กับหลังที่เพิ่งเพิ่มแล้วยังไม่มีเซนเซอร์
                              เป็นคนละเรื่องกัน — ทั้งคู่ไม่มีค่า แต่สาเหตุต่างกันจึงเขียนต่างกัน */}
                          <StatusBadge tone={row.status.tone}>
                            {row.value == null && row.barnStatus === "offline"
                              ? t(BARN_STATUS_LABEL.offline)
                              : t(row.status.label)}
                          </StatusBadge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </Block>
      </PageBoard>
    </>
  );
}
