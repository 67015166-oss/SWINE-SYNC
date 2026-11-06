/**
 * หน้า "สภาพอากาศ" (/dashboard/weather) — ค่าจาก **เสาอากาศนอกโรงเรือน**
 *
 * ผู้ใช้สั่งให้ทำแยกออกมา (9 ก.ย. 2569) เพราะหน้าสภาพแวดล้อมเป็นเรื่อง "ในเล้า"
 * แล้วค่าจากเสาอากาศถูกยัดไว้เป็นแค่ครึ่งหนึ่งของการ์ดเดียว ทั้งที่เสาวัดได้ตั้งแปดค่า
 * (ฝน · แสง · ทิศลม ไม่มีที่ให้แสดงเลยในหน้านั้น)
 *
 * ═══ เส้นแบ่งของสองหน้านี้ ═══
 *   หน้านี้            = อากาศ **ข้างนอก** ทั้งฟาร์ม — เสาอากาศต้นเดียวใช้ร่วมกันทุกโรงเรือน
 *   หน้าสภาพแวดล้อม   = อากาศ **ในเล้า** รายโรงเรือน — มีเกณฑ์ที่ตั้งได้ มีอุปกรณ์ให้สั่ง
 * ปุ่ม "สภาพอากาศในเล้า" ที่หัวหน้าพาข้ามไปอีกหน้าโดยตรง (ผู้ใช้สั่งให้มีปุ่มนี้)
 *
 * **ค่าที่เสาไม่ได้วัด ปล่อยเป็นขีดกลาง ห้ามเดา** — UV กับความกดอากาศไม่มีเซนเซอร์
 * จึงไม่มีในหน้านี้เลย ดีกว่าใส่ช่องว่างที่ดูเหมือนเซนเซอร์เสีย
 *
 * เกณฑ์ตัดสิน "ปกติ/เฝ้าระวัง" มาจาก `lib/outdoor.js` ชุดเดียวกับหน้าสภาพแวดล้อม
 * ค่าเดียวกันจึงขึ้นสถานะตรงกันทั้งสองหน้าเสมอ
 */
import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceDot,
} from "recharts";
import PageHeader from "../components/ui/PageHeader.jsx";
import PageBoard, { Block } from "../components/board/PageBoard.jsx";
import Card from "../components/ui/Card.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import DataSourceBadge from "../components/ui/DataSourceBadge.jsx";
import ChartLegend from "../components/ui/ChartLegend.jsx";
import Icon from "../components/ui/Icon.jsx";
import { useAllFarms } from "../lib/records/useAllFarms.js";
import { useWeatherHistory } from "../lib/api/useWeatherHistory.js";
import { useForecast } from "../lib/api/useForecast.js";
import { useModelForecast } from "../lib/api/useModelForecast.js";
import { modelAge, horizonOf } from "../lib/api/modelAge.js";
import { skyOf } from "../lib/api/openMeteo.js";
import { FARM_MAP } from "../lib/api/plotnexusFarms.js";
import { outdoorStatus, outdoorPct, windDirectionName } from "../lib/outdoor.js";
import {
  SERIES,
  WEATHER_COLORS,
  gridProps,
  axisProps,
  tooltipStyle,
  paddedDomain,
} from "../lib/chartTheme.js";
import {
  formatNumber,
  formatNumber1,
  formatDateTime,
  formatDateShort,
} from "../lib/format.js";
import { Link } from "react-router-dom";
import "./Weather.css";
import { useT } from "../lib/i18n/useT.js";

/** รหัสกระดานของหน้านี้ — คีย์ที่ใช้เก็บชุดเลย์เอาต์ (ดู lib/layout/presets.js) */
const BOARD_ID = "weather";

/** ช่วงเวลาของกราฟย้อนหลัง — ชุดเดียวกับหน้าสภาพแวดล้อม จะได้ไม่ต้องจำคนละแบบ */
const RANGES = [
  { id: "24h", label: "24 ชม." },
  { id: "7d", label: "7 วัน" },
  { id: "30d", label: "30 วัน" },
];

/**
 * แท็บของการ์ดกราฟ — จับคู่ค่าที่ "ดูด้วยกันแล้วได้ความหมาย" ไว้ในแท็บเดียว
 *
 * **หนึ่งกราฟมีแกน Y เดียวเสมอ** (กติกาใน docs/DESIGN.md) ค่าที่คนละหน่วยกัน
 * จึงเป็นกราฟย่อยซ้อนกันสองใบ ไม่ใช่สองเส้นในกราฟเดียว
 */
const TABS = [
  { id: "climate", label: "อุณหภูมิ & ความชื้น", icon: "thermometer" },
  { id: "windRain", label: "ลม & ฝน", icon: "wind" },
  { id: "light", label: "แสงแดด", icon: "sun" },
];

/** แท็บของกราฟพยากรณ์ — ชุดเดียวกับที่แอปพยากรณ์อากาศทั่วไปใช้ (อุณหภูมิ · ฝน · ลม) */
const FORECAST_TABS = [
  { id: "tempC", label: "อุณหภูมิ", icon: "thermometer", unit: "°C" },
  { id: "rainChance", label: "โอกาสฝน", icon: "cloud-rain", unit: "%" },
  { id: "wind", label: "ลม", icon: "wind", unit: "m/s" },
];

/** ความสูงของกราฟพยากรณ์รายชั่วโมง */
const FORECAST_H = 190;

/** ความสูงกราฟของโมเดลที่เราเทรนเอง — สูงกว่าใบอื่นเพราะต้องอ่านสามเส้นพร้อมกัน */
const MODEL_H = 236;

/* ═══ สามเส้นในกราฟของโมเดล — สีผูกกับ "ที่มาของตัวเลข" ไม่ใช่กับค่าที่วัด ═══
   ทั้งสามเส้นเป็นอุณหภูมิเหมือนกันหมด ถ้าใช้สีของอุณหภูมิทั้งสามจะแยกไม่ออก
   จึงให้สีบอกว่าใครพูด: ของจริง · โมเดลเรา · แบบจำลองโลก */
const MODEL_LINES = {
  observed: SERIES[7],
  model: SERIES[3],
  openmeteo: SERIES[0],
};

/** ระยะล่วงหน้าที่เอาขึ้นตารางคะแนน — ครบทุกระยะจะยาวเกินไป เอาที่คนถามจริง */
const SCORE_HORIZONS = [1, 6, 12, 24];

/**
 * แท็บของการ์ดโมเดล — หนึ่งแท็บคือหนึ่งโมเดลที่เทรนแยกกัน คนละไฟล์ผลลัพธ์
 *
 * ชุดค่าเดียวกับแท็บของการ์ดพยากรณ์ข้างบนโดยตั้งใจ (อุณหภูมิ · ฝน/ความชื้น · ลม)
 * คนจะได้เทียบสองการ์ดในเรื่องเดียวกันได้โดยไม่ต้องแปลงหน่วยในหัว
 * **ฝนต่างกันตรงนี้**: การ์ดข้างบนบอก "โอกาสฝน %" ซึ่งเป็นของแบบจำลอง
 * เสาไม่ได้วัดโอกาส มันวัดความชื้น โมเดลของเราจึงทำนายความชื้นแทน ไม่ใช่โอกาสฝน
 */
const MODEL_TABS = [
  { id: "mast_temp_c", label: "อุณหภูมิ", icon: "thermometer" },
  { id: "mast_rh", label: "ความชื้น", icon: "drop" },
  { id: "mast_wind_ms", label: "ลม", icon: "wind" },
];

/** "09:00" จากเวลาเต็มรูปแบบ ISO — ใบเวลาในแถบของการ์ดโมเดลมีที่แค่นี้ */
const clockOf = (iso) => {
  const at = new Date(iso);
  return `${String(at.getHours()).padStart(2, "0")}:00`;
};

/** ชื่อวันแบบสั้น — ป้ายแกนของกราฟโมเดลกินเวลาสามวัน ต้องบอกวันไม่ใช่บอกแต่เวลา */
const DAY_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

/** ความสูงกราฟย่อยตอนซ้อนสองใบ / ตอนมีใบเดียว — รวมแล้วเท่ากัน การ์ดจึงไม่กระตุกตอนสลับแท็บ */
const MINI_H = 175;
const SOLO_H = 396;

/** ค่าที่ยังไม่มีสัญญาณให้แสดงขีดกลาง ไม่ใช่เลข 0 (0 แปลว่า "วัดได้ 0" ซึ่งคนละความหมาย) */
const dash = (value, format = formatNumber) => (value == null ? "—" : format(value));

/**
 * แผ่นค่าหนึ่งค่าที่เสาวัดได้ — หน้าตาชุดเดียวกับแผ่นค่าในหน้าสภาพแวดล้อม
 * ตัวเลข · ป้ายสถานะ · คำอธิบาย · หลอดเทียบสเกล
 */
function Reading({ icon, label, value, unit, status, pct, note, bar = true, word = false, index = 0 }) {
  const t = useT();

  return (
    /* `--i` = ลำดับของแผ่น ใช้ไล่จังหวะให้โผล่ทีละใบ (ดู Weather.css)
       ตัวแปร CSS ตัวเดียว ไม่ต้องเขียนกติกา nth-child แปดอัน และเพิ่มค่าใหม่แล้วไล่ต่อให้เอง */
    <li className={`wx-m is-${status.tone}`} style={{ "--i": index }}>
      <span className="wx-m-head">
        <span className="wx-m-chip" aria-hidden="true">
          <Icon name={icon} size={18} />
        </span>
        {label}
      </span>

      <span className="wx-m-value">
        {/* `is-word` = ค่าเป็นคำไม่ใช่ตัวเลข (ทิศทางลม) — ตัวเล็กลงไม่ให้กินสามบรรทัด */}
        <b className={"num" + (word ? " is-word" : "")}>{value}</b>
        {unit && <em>{unit}</em>}
      </span>

      <span className="wx-m-meta">
        <StatusBadge tone={status.tone}>{t(status.label)}</StatusBadge>
        <span className="wx-m-note">{note}</span>
      </span>

      {/* หลอดเป็นตัวช่วยกะระยะเท่านั้น สถานะจริงอ่านจากป้ายด้านบน — ซ่อนจากโปรแกรมอ่านหน้าจอ
          ค่าที่ไม่มีสเกล (ทิศลม) ไม่มีหลอด — หลอดว่างอ่านเหมือน "ค่าต่ำสุด" ซึ่งไม่จริง
          แต่ยังกันที่ไว้เท่าเดิม ทุกแผ่นในแถวจึงสูงเท่ากัน */}
      {bar ? (
        <span className="wx-m-track" aria-hidden="true">
          <span className={`wx-m-fill is-${status.tone}`} style={{ width: `${pct}%` }} />
        </span>
      ) : (
        <span className="wx-m-track is-empty" aria-hidden="true" />
      )}
    </li>
  );
}

/** ปุ่มเลือกช่วงเวลา / แท็บของกราฟ — ใช้โครงเดียวกับหน้าสภาพแวดล้อม */
function Tabs({ value, onChange, options, label, withIcon = false }) {
  const t = useT();

  return (
    <span className="wx-tabs" role="tablist" aria-label={label}>
      {options.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          className={"wx-tab" + (item.id === value ? " is-active" : "")}
          onClick={() => onChange(item.id)}
        >
          {withIcon && item.icon && <Icon name={item.icon} size={16} aria-hidden="true" />}
          {t(item.label)}
        </button>
      ))}
    </span>
  );
}

/** กล่องแทนกราฟตอนไม่มีข้อมูล — สูงเท่ากราฟจริง การ์ดจึงไม่ยุบตอนข้อมูลขาด */
function NoChart({ height, text }) {
  return (
    <p className="wx-nochart" style={{ height }}>
      <Icon name="cloud" size={22} aria-hidden="true" />
      {text}
    </p>
  );
}

/** กราฟเส้นเดียวหนึ่งใบ — ทุกใบในหน้านี้ใช้ตัวนี้ จะได้แกน/กริด/tooltip เหมือนกันหมด */
function MiniChart({ data, dataKey, color, unit, name, height, pad = 1, floor = null }) {
  const t = useT();
  const values = data.map((row) => row[dataKey]).filter((v) => v != null);
  if (values.length === 0) {
    return <NoChart height={height} text={t("ไม่มีค่า{name}ในช่วงนี้", { name })} />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="t" tickFormatter={(i) => data[i]?.hour ?? ""} {...axisProps} />
        <YAxis domain={paddedDomain(values, pad, { floor })} {...axisProps} />
        <Tooltip
          {...tooltipStyle}
          labelFormatter={(i) => data[i]?.hour ?? ""}
          formatter={(v) => [`${formatNumber1(v)} ${unit}`, name]}
        />
        <Line
          type="monotone"
          dataKey={dataKey}
          name={name}
          stroke={color}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function Weather() {
  const t = useT();
  const { farms, barnsOf, liveStatus, liveErrorKind } = useAllFarms();
  const [tab, setTab] = useState("climate");
  const [rangeId, setRangeId] = useState("24h");

  /**
   * เสาอากาศทั้งหมดที่ส่งค่าอยู่ — หนึ่งต้นต่อหนึ่งชุดข้อมูลใน FARM_MAP
   *
   * อ่านจาก `FARM_MAP` ไม่ใช่ไล่หาจากโรงเรือนทุกหลัง เพราะไฟล์นั้นเป็นที่เดียว
   * ที่รู้ว่าจุดติดตั้งไหนคือ "นอกอาคาร" — เพิ่มฟาร์มใหม่ที่นั่นแล้วหน้านี้ขึ้นเอง
   */
  const stations = useMemo(
    () =>
      Object.entries(FARM_MAP)
        .map(([source, map]) => {
          const farm = farms.find((f) => f.id === map.farm.id);
          if (!farm) return null;
          /* ทุกโรงเรือนในฟาร์มถือค่าเสาอากาศต้นเดียวกัน หยิบใบไหนที่มีค่าก็ได้ */
          const barns = barnsOf(farm.id);
          const outdoor = barns.map((b) => b.outdoor).find((o) => o?.at);
          if (!outdoor) return null;
          /* ★ `apiId` ของโรงเรือนที่ถือค่าเสาอากาศ — ใช้ขอประวัติจากหลังบ้านของเรา (T1.312)
             ไม่มี = ฟาร์มตัวอย่าง จึงยังใช้ทางเดิม */
          const holder = barns.find((b) => b.outdoor?.at) ?? barns[0] ?? null;
          return { source, farm, outdoor, barn: barns[0] ?? null, apiId: holder?.apiId ?? null };
        })
        .filter(Boolean),
    [farms, barnsOf],
  );

  const [pickedSource, setPickedSource] = useState(null);
  const station = stations.find((s) => s.source === pickedSource) ?? stations[0] ?? null;

  const { series, stuck: stuckLines, status: histStatus } = useWeatherHistory(
    station?.source,
    rangeId,
    station?.apiId ?? null,
  );
  const rows = series ?? [];

  /* พยากรณ์อากาศของพิกัดฟาร์ม — คนละแหล่งกับเสาอากาศโดยสิ้นเชิง (ดู lib/api/openMeteo.js) */
  const [fcTab, setFcTab] = useState("tempC");
  const forecast = useForecast(
    station?.farm ? { lat: station.farm.lat, lng: station.farm.lng } : null,
  );
  const fcMeta = FORECAST_TABS.find((x) => x.id === fcTab) ?? FORECAST_TABS[0];

  /**
   * วันที่เลือกอยู่ในแถบ 8 วัน — `null` = วันนี้ (ผู้ใช้สั่งให้กดใบวันแล้วกราฟตามไปด้วย)
   *
   * เก็บเป็น "วันที่" ไม่ใช่ "ลำดับที่" เพราะพอข้ามเที่ยงคืน ใบที่ลำดับ 1 จะกลายเป็นวันอื่น
   * ทั้งที่คนยังไม่ได้แตะอะไร กราฟจะเปลี่ยนเองเงียบ ๆ ส่วนวันที่ผูกกับวันจริงเสมอ
   */
  const [pickedDate, setPickedDate] = useState(null);

  /**
   * ชั่วโมงที่จะวาดในกราฟ — ขึ้นกับว่าเลือกวันไหนอยู่
   *
   * **วันนี้ = อีก 24 ชั่วโมงข้างหน้า ไม่ใช่ 00:00–23:00 ของวันนี้** เพราะถ้าเปิดดูตอนสี่ทุ่ม
   * จะเหลือให้ดูแค่สองจุด ทั้งที่สิ่งที่คนอยากรู้ตอนนั้นคือคืนนี้กับพรุ่งนี้เช้า
   * ส่วนวันอื่นเอาทั้งวันของวันนั้น เพราะไม่มี "ตอนนี้" ให้ยึด
   */
  const fcHours = useMemo(() => {
    const all = forecast.hours ?? [];
    const rows = pickedDate ? all.filter((row) => row.date === pickedDate) : all.slice(0, 24);
    /* ใส่ลำดับใหม่หลังกรอง — แกน X อ้างลำดับในชุดที่วาดจริง ไม่ใช่ลำดับในชุดเต็ม */
    return rows.map((row, i) => ({ ...row, t: i }));
  }, [forecast.hours, pickedDate]);

  /** ป้ายบอกว่ากราฟกำลังแสดงช่วงไหน — ต้องมี ไม่งั้นกดวันแล้วไม่รู้ว่าดูวันไหนอยู่ */
  const fcRangeLabel = useMemo(() => {
    if (!pickedDate) return t("อีก 24 ชั่วโมงข้างหน้า");
    const day = forecast.days?.find((d) => d.date === pickedDate);
    return t("ทั้งวัน {day}{date}", {
      day: day ? `${t(day.dayName)} ` : "",
      date: formatDateShort(pickedDate),
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [pickedDate, forecast.days]);

  /* คำทำนายจากโมเดลที่เราเทรนเองบนค่าของเสาต้นนี้ (ดู weather/lab/predict.py)
     คนละแหล่งกับ Open-Meteo ข้างบน และนั่นคือประเด็นทั้งหมด — การ์ดวางสองอย่างนี้
     ไว้บนกราฟเดียวกันเพื่อให้เห็นว่าต่างกันแค่ไหนที่จุดนี้ */
  const [modelTab, setModelTab] = useState("mast_temp_c");
  const model = useModelForecast(modelTab);
  /* ★ "ไฟล์เก่าแค่ไหน" เป็นคนละคำถามกับ `stale` ในไฟล์ (ดูหัวไฟล์ `modelAge.js`)
     หลังบ้านส่ง `ageMinutes` มาให้ตั้งแต่แรก แต่หน้านี้ไม่เคยหยิบไปใช้ (T1.343) */
  const age = modelAge(model.data?.ageMinutes, horizonOf(model.data));

  /** ใบเวลาที่กดค้างไว้ในแถบของการ์ดโมเดล — `null` = ยังไม่ได้กดใบไหน */
  const [pickedH, setPickedH] = useState(null);
  const pickedHorizon = model.data?.horizons?.find((r) => r.horizon_h === pickedH) ?? null;

  /**
   * รวมอดีตกับอนาคตเป็นตารางเดียว โดยใช้ **จำนวนชั่วโมงห่างจากค่าล่าสุด** เป็นแกน X
   *
   * ใช้ลำดับที่ (0, 1, 2, …) เป็นแกนไม่ได้ เพราะระยะที่ทำนายไม่ได้ห่างเท่ากัน
   * (1·2·3·4·6·8·12·18·24) ถ้าวางเรียงตามลำดับ ช่วง 18→24 ชั่วโมงจะกว้างเท่ากับ 1→2
   * กราฟจะโกหกเรื่องเวลาโดยที่ตัวเลขทุกตัวถูกหมด
   */
  const modelChart = useMemo(() => {
    const d = model.data;
    if (!d?.latest || !d.horizons?.length) return null;

    const base = new Date(d.latest.at).getTime();
    const hourOff = (iso) => Math.round((new Date(iso).getTime() - base) / 3_600_000);

    const rows = (d.history ?? []).map((h) => ({ x: hourOff(h.at), observed: h.value }));
    for (const r of d.horizons) {
      rows.push({
        x: r.horizon_h,
        model: r.pred,
        openmeteo: r.openmeteo_pred ?? null,
      });
    }

    /* ให้เส้นของโมเดลออกเดินทางจากค่าที่วัดได้จริงล่าสุด ไม่ใช่ลอยขึ้นมากลางอากาศ
       (จุดนี้เป็นค่าที่วัดได้ ไม่ใช่คำทำนาย จึงไม่ได้แต่งตัวเลขอะไรเพิ่ม)
       ส่วนเส้นของ Open-Meteo ไม่ต่อ เพราะที่เวลานั้นมันไม่ได้พูดค่าเดียวกับเสา */
    const junction = rows.find((r) => r.x === 0);
    if (junction) junction.model = d.latest.value;

    rows.sort((a, b) => a.x - b.x);
    return { rows, base, from: rows[0]?.x ?? 0 };
  }, [model.data]);

  /**
   * ป้ายแกน X ของกราฟโมเดล — แปลงชั่วโมงห่างกลับเป็นเวลานาฬิกาไทย
   *
   * กราฟใบนี้กินเวลาสามวัน (ย้อนหลังสองวัน + ทำนายหนึ่งวัน) ต่างจากใบอื่นในหน้านี้
   * ที่อยู่ในวันเดียว **ถ้าใส่แค่เวลา ป้ายจะอ่านเหมือนเวลาเดินถอยหลัง** (11:00 → 07:00)
   * เพราะข้ามเที่ยงคืนไปแล้ว จึงต้องมีชื่อวันนำหน้าด้วย
   */
  const modelHourLabel = useMemo(() => {
    const base = modelChart?.base;
    if (!base) return () => "";
    return (x) => {
      const at = new Date(base + x * 3_600_000);
      const hh = `${String(at.getHours()).padStart(2, "0")}:00`;
      return `${t(DAY_SHORT[at.getDay()])} ${hh}`;
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [modelChart]);

  const out = station?.outdoor ?? null;
  const barn = station?.barn ?? null;

  /* ปลายทางของปุ่ม "สภาพอากาศในเล้า" — พาไปโรงเรือนหลังแรกของฟาร์มเดียวกัน
     ส่งฟาร์ม/โรงเรือนไปทาง query ด้วย หน้าปลายทางจะได้เปิดตรงหลังที่กำลังพูดถึง
     ไม่ใช่เด้งไปหลังแรกของฟาร์มแรกในระบบ (หน้านั้นอ่าน ?farm= กับ ?barn= อยู่แล้ว) */
  const indoorLink = station
    ? `/dashboard/environment?farm=${encodeURIComponent(station.farm.id)}` +
      (barn ? `&barn=${encodeURIComponent(barn.id)}` : "")
    : "/dashboard/environment";

  /** ส่วนต่างระหว่างข้างนอกกับในเล้า — คำตอบที่คนเปิดหน้านี้มาหาบ่อยที่สุด */
  const gap = (outside, inside) =>
    outside == null || inside == null ? null : Number((outside - inside).toFixed(1));

  const tempGap = gap(out?.tempC, barn?.tempC);
  const humidGap = gap(out?.humidity, barn?.humidity);

  /* ═══ ค่าที่เสาอากาศ "ส่งมาแต่ไม่ได้วัด" — ไทล์ต้องบอกสาเหตุของขีดกลาง (T1.315) ═══
     กราฟข้างล่างตัดเส้นพวกนี้ทิ้งพร้อมคำอธิบายอยู่แล้วตั้งแต่ T1.312
     แต่ไทล์ค่าปัจจุบันข้างบนยังโชว์เลขเป็นค่าสด — **หน้าเดียวกันบอกคนละอย่าง**
     ตอนนี้ชั้นข้อมูลล้างค่าให้แล้ว เหลือแค่บอกว่าทำไมถึงเป็นขีดกลาง */
  const outStuck = new Set(barn?.stuckValues ?? []);
  const stuckNote = (...metrics) =>
    metrics.some((m) => outStuck.has(`${m}|out`))
      ? t("เซนเซอร์ส่งค่าเดิมซ้ำ — ไม่ได้วัดจริง")
      : null;

  const readings = out
    ? [
        {
          key: "tempC",
          icon: "thermometer",
          label: t("อุณหภูมิ"),
          value: dash(out.tempC, formatNumber1),
          unit: "°C",
          kind: "tempC",
          raw: out.tempC,
          note: stuckNote("temp_c") ?? t("เกิน 35 °C ลมเปล่าระบายความร้อนไม่ไหว"),
        },
        {
          key: "humidity",
          icon: "drop",
          label: t("ความชื้น"),
          value: dash(out.humidity),
          unit: "%RH",
          kind: "humidity",
          raw: out.humidity,
          note: stuckNote("humidity") ?? t("เกิน 80% ม่านน้ำลดอุณหภูมิได้น้อยลง"),
        },
        {
          key: "dewPoint",
          icon: "drop",
          label: t("จุดน้ำค้าง"),
          value: dash(out.dewPoint, formatNumber1),
          unit: "°C",
          kind: "dewPoint",
          raw: out.dewPoint,
          note: stuckNote("temp_c", "humidity") ?? t("ยิ่งใกล้อุณหภูมิยิ่งอบอ้าว"),
        },
        {
          key: "wind",
          icon: "wind",
          label: t("ความเร็วลม"),
          value: dash(out.wind, formatNumber1),
          unit: "m/s",
          kind: "wind",
          raw: out.wind,
          note: t("เกิน 8 m/s พัดฝนเข้าโรงเรือน"),
        },
        {
          key: "windDirection",
          icon: "compass",
          label: t("ทิศทางลม"),
          /* องศาดิบอ่านแล้วนึกภาพไม่ออก — โชว์ชื่อทิศเป็นตัวหลัก แล้วเก็บองศาไว้ในคำอธิบาย */
          value: out.windDirection == null ? "—" : t(windDirectionName(out.windDirection) ?? "—"),
          unit: "",
          kind: null,
          raw: out.windDirection,
          note:
            out.windDirection == null
              ? t("เสาไม่ได้ส่งค่าทิศลม")
              : t("{deg}° — ทิศที่ลมพัดมา", { deg: formatNumber(out.windDirection) }),
        },
        {
          key: "rainfall",
          icon: "cloud",
          label: t("ฝนตอนนี้"),
          value: dash(out.rainfall, formatNumber1),
          unit: t("มม."),
          kind: "rainfall",
          raw: out.rainfall,
          note: out.rainfall ? t("กำลังมีฝน") : t("ยังไม่มีฝนในช่วงล่าสุด"),
        },
        {
          key: "rainfall24h",
          icon: "cloud",
          label: t("ฝนสะสม 24 ชม."),
          value: dash(out.rainfall24h, formatNumber1),
          unit: t("มม."),
          kind: "rainfall24h",
          raw: out.rainfall24h,
          note: t("เกิน 35 มม./วัน = ฝนหนัก ทางเข้าฟาร์มเป็นโคลน"),
        },
        {
          key: "light",
          icon: "sun",
          label: t("ความสว่าง"),
          value: dash(out.light, formatNumber),
          unit: "lux",
          kind: "light",
          raw: out.light,
          note:
            out.light == null
              ? "—"
              : out.light >= 60000
                ? t("แดดเปรี้ยง — เลี่ยงย้ายสุกรกลางแจ้ง")
                : out.light >= 10000
                  ? t("แดดปกติกลางแจ้ง")
                  : t("ฟ้าปิดหรือใกล้ค่ำ"),
        },
      ]
    : [];

  /* ---------- ไม่มีเสาอากาศให้แสดง ---------- */
  if (!station) {
    return (
      <>
        <PageHeader
          title={t("สภาพอากาศ")}
          subtitle={t("ค่าจากเสาอากาศนอกโรงเรือน")}
          action={
            <Link className="wx-indoor-btn" to={indoorLink}>
              <span className="wx-indoor-icon" aria-hidden="true">
                <Icon name="wind" size={20} />
              </span>
              <span className="wx-indoor-text">
                <span>{t("อยากดูอากาศในเล้า")}</span>
                <b>{t("สภาพอากาศในเล้า")}</b>
              </span>
              <Icon name="chevron" size={18} aria-hidden="true" />
            </Link>
          }
        />
        <Card title={t("ยังไม่มีเสาอากาศที่ส่งค่า")} icon="cloud">
          <p className="wx-empty">
            {/* กุญแจโดนปฏิเสธ ≠ เสาอากาศไม่ส่งค่า — บอกสาเหตุจริง ไม่งั้นคนจะไปตรวจเสาที่ฟาร์ม */}
            {liveStatus === "loading"
              ? t("กำลังต่อกับเสาอากาศ…")
              : liveErrorKind === "needlogin"
                ? t("ยังไม่ได้เข้าสู่ระบบ — หน้านี้แสดงเฉพาะค่าจริงจากเสาอากาศ ต้องเข้าสู่ระบบก่อนจึงจะเห็น")
                : liveErrorKind === "noserver"
                  ? t("สำเนานี้ไม่ได้ต่อกับระบบกลาง จึงอ่านค่าจากเสาอากาศไม่ได้")
                  : liveErrorKind === "denied"
                    ? t("ระบบไม่อนุญาตให้ดึงข้อมูลด้วยสิทธิ์ของบัญชีนี้ — หน้านี้แสดงเฉพาะค่าจริง จึงยังไม่มีอะไรให้ดู")
                    : t(
                      "ตอนนี้ยังไม่มีฟาร์มไหนที่เสาอากาศส่งค่าเข้ามา — ค่าในหน้านี้มาจากเซนเซอร์จริงเท่านั้น ไม่มีข้อมูลตัวอย่างให้แสดงแทน",
                    )}
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("สภาพอากาศ")}
        subtitle={t("{farm} · เสาอากาศนอกโรงเรือน · อัปเดตล่าสุด {time}", {
          farm: t(station.farm.name),
          time: formatDateTime(out?.at),
        })}
        action={
          /* ปุ่มที่ผู้ใช้สั่งให้มี — กดแล้วข้ามไปหน้าอากาศในเล้าของฟาร์มเดียวกัน */
          <Link className="wx-indoor-btn" to={indoorLink}>
            <span className="wx-indoor-icon" aria-hidden="true">
              <Icon name="wind" size={20} />
            </span>
            <span className="wx-indoor-text">
              <span>{t("อยากดูอากาศในเล้า")}</span>
              <b>{t("สภาพอากาศในเล้า")}</b>
            </span>
            <Icon name="chevron" size={18} aria-hidden="true" />
          </Link>
        }
      />

      {/* มีเสามากกว่าหนึ่งต้นเมื่อไรค่อยขึ้นปุ่มเลือก — ต้นเดียวไม่ต้องให้เลือกอะไร */}
      {stations.length > 1 && (
        <Tabs
          value={station.source}
          onChange={setPickedSource}
          options={stations.map((s) => ({ id: s.source, label: s.farm.name }))}
          label={t("เลือกเสาอากาศ")}
        />
      )}

      <PageBoard boardId={BOARD_ID}>
        {/* ---------- ค่าล่าสุดจากเสา ---------- */}
        <Block id="now" label={t("ค่าล่าสุดจากเสาอากาศ")}>
          <Card
            className="wx-now-card"
            icon="sun"
            title={t("ตอนนี้ที่เสาอากาศ")}
            subtitle={t("ค่าทั้งหมดวัดนอกโรงเรือน ใช้ร่วมกันทุกหลังในฟาร์มนี้")}
          >
            <p className="wx-source">
              <DataSourceBadge source="live" />
              <span>{t("อัปเดตล่าสุด {time}", { time: formatDateTime(out?.at) })}</span>
            </p>

            <ul className="wx-metrics">
              {readings.map((r, i) => (
                <Reading
                  key={r.key}
                  index={i}
                  icon={r.icon}
                  label={t(r.label)}
                  value={r.value}
                  unit={r.unit}
                  note={r.note}
                  /* ทิศลมไม่มีเกณฑ์ "ดี/ไม่ดี" — ลมมาจากทิศไหนก็ไม่ได้แปลว่าอันตราย
                     จึงบอกแค่ว่ามีค่าหรือไม่มี ไม่ตัดสินเป็นเฝ้าระวัง */
                  status={
                    r.kind
                      ? outdoorStatus(r.kind, r.raw)
                      : r.raw == null
                        ? { tone: "offline", label: t("ไม่มีสัญญาณ") }
                        : { tone: "good", label: t("วัดได้") }
                  }
                  pct={r.kind ? outdoorPct(r.kind, r.raw) : 0}
                  bar={Boolean(r.kind)}
                  word={r.key === "windDirection"}
                />
              ))}
            </ul>
          </Card>
        </Block>

        {/* ---------- พยากรณ์อากาศล่วงหน้า ---------- */}
        <Block id="forecast" label={t("พยากรณ์อากาศ")}>
          <Card
            className="wx-fc-card"
            icon="cloud-sun"
            title={t("พยากรณ์อากาศ")}
            subtitle={t("ล่วงหน้า 24 ชั่วโมง และ 8 วัน · แตะแท็บเพื่อสลับดูอุณหภูมิ ฝน หรือลม")}
          >
            {/* ═══ ป้ายนี้สำคัญกว่าที่คิด ═══
                ตัวเลขในการ์ดนี้มาจากแบบจำลอง ไม่ใช่จากเสาที่ตั้งอยู่ในฟาร์ม
                วัดจริงตอนทำ: เสาอ่าน 35.0 °C แบบจำลองบอก 27.6 °C — ต่างกัน 7 องศา
                โดยที่ทั้งคู่ไม่ได้พัง ถ้าไม่บอกไว้ คนจะคิดว่าเซนเซอร์เสียหรือแอปคำนวณผิด */}
            <p className="wx-fc-source">
              <Icon name="globe" size={17} aria-hidden="true" />
              <span>
                <b>{t("ค่าทำนาย ไม่ใช่ค่าที่วัดได้")}</b>{" "}
                {t("— มาจากแบบจำลองอากาศของพื้นที่ (Open-Meteo) จึงไม่ตรงกับเสาอากาศในฟาร์มเป๊ะ ๆ")}
              </span>
            </p>

            {forecast.status === "error" ? (
              <NoChart
                height={FORECAST_H}
                text={t("ดึงพยากรณ์ไม่สำเร็จ: {error}", { error: forecast.error })}
              />
            ) : forecast.hours.length === 0 ? (
              <NoChart height={FORECAST_H} text={t("กำลังโหลดพยากรณ์อากาศ…")} />
            ) : (
              <>
                <div className="wx-fc-bar">
                  <Tabs
                    value={fcTab}
                    onChange={setFcTab}
                    options={FORECAST_TABS}
                    label={t("ค่าที่จะดูในกราฟพยากรณ์")}
                    withIcon
                  />
                  {/* บอกตรง ๆ ว่ากราฟกำลังแสดงช่วงไหน — ขาดบรรทัดนี้ พอกดใบวันแล้ว
                      กราฟเปลี่ยนโดยไม่มีอะไรยืนยันว่าเปลี่ยนไปเป็นวันไหน */}
                  <span className="wx-fc-range">
                    <Icon name="clock" size={15} aria-hidden="true" />
                    {fcRangeLabel}
                    {pickedDate && (
                      <button
                        type="button"
                        className="wx-fc-back"
                        onClick={() => setPickedDate(null)}
                      >
                        กลับไปวันนี้
                      </button>
                    )}
                  </span>
                </div>

                {/* กราฟรายชั่วโมงเป็นพื้นที่ระบายสี ไม่ใช่เส้นเปล่า — อ่านเป็น "ช่วงของวัน"
                    ได้ง่ายกว่า และเป็นภาษาภาพเดียวกับแอปพยากรณ์อากาศที่คนคุ้นอยู่แล้ว */}
                <ResponsiveContainer width="100%" height={FORECAST_H}>
                  <AreaChart
                    data={fcHours}
                    margin={{ top: 18, right: 12, bottom: 0, left: -14 }}
                  >
                    <CartesianGrid {...gridProps} />
                    <XAxis
                      dataKey="t"
                      tickFormatter={(i) => fcHours[i]?.hour ?? ""}
                      interval={2}
                      {...axisProps}
                    />
                    <YAxis
                      domain={
                        /* ฝนเป็นเปอร์เซ็นต์ ต้องเห็นสเกลเต็ม 0–100 เสมอ
                           ไม่งั้นวันที่โอกาสฝนนิ่งอยู่ที่ 90–95% จะดูเหมือนแกว่งทั้งวัน */
                        fcTab === "rainChance"
                          ? [0, 100]
                          : paddedDomain(
                              fcHours.map((h) => h[fcTab]).filter((v) => v != null),
                              1,
                              { floor: fcTab === "wind" ? 0 : null },
                            )
                      }
                      {...axisProps}
                    />
                    <Tooltip
                      {...tooltipStyle}
                      labelFormatter={(i) => fcHours[i]?.hour ?? ""}
                      formatter={(v) => [`${formatNumber1(v)} ${fcMeta.unit}`, t(fcMeta.label)]}
                    />
                    {/* ไล่เฉดใต้เส้นแทนความทึบค่าเดียว — เข้มตรงเส้นแล้วจางลงจนหายไปที่พื้น
                        อ่านเป็น "ปริมาตร" ไม่ใช่แผ่นสีแบน ๆ ทับกริด (คุมด้วย token เหมือนเดิม) */}
                    <defs>
                      <linearGradient id="wxFcFill" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor={WEATHER_COLORS[fcTab === "rainChance" ? "rainfall" : fcTab]}
                          stopOpacity={0.38}
                        />
                        <stop
                          offset="100%"
                          stopColor={WEATHER_COLORS[fcTab === "rainChance" ? "rainfall" : fcTab]}
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey={fcTab}
                      name={t(fcMeta.label)}
                      stroke={WEATHER_COLORS[fcTab === "rainChance" ? "rainfall" : fcTab]}
                      fill="url(#wxFcFill)"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 2 }}
                      connectNulls
                    />
                  </AreaChart>
                </ResponsiveContainer>

                {/* ═══ แถบพยากรณ์รายวัน ═══ */}
                {/* ═══ ใบวันกดได้ กดแล้วกราฟข้างบนเปลี่ยนไปเป็นวันนั้น ═══
                    ผู้ใช้สั่ง 9 ก.ย. 2569 ว่า "ต้องกดวันอื่น ๆ ได้ด้วยสิ"
                    เป็น <button> จริง ไม่ใช่ <li onClick> — คีย์บอร์ดจึงแท็บถึงและกด Enter ได้
                    และโปรแกรมอ่านหน้าจอประกาศว่าเป็นปุ่ม ไม่ใช่ข้อความเฉย ๆ */}
                <ul className="wx-days">
                  {forecast.days.map((day, i) => {
                    const sky = skyOf(day.code);
                    /* วันนี้ = ตอนที่ยังไม่ได้เลือกวันไหน (pickedDate เป็น null) */
                    const picked = pickedDate ? day.date === pickedDate : day.isToday;
                    return (
                      <li key={day.date} style={{ "--i": i }}>
                      <button
                        type="button"
                        className={
                          "wx-day" +
                          (day.isToday ? " is-today" : "") +
                          (picked ? " is-picked" : "")
                        }
                        aria-pressed={picked}
                        onClick={() => setPickedDate(day.isToday ? null : day.date)}
                      >
                        <span className="wx-day-name">
                          {day.isToday ? t("วันนี้") : t(day.dayName)}
                        </span>
                        {/* ไอคอนเป็นตัวช่วยกวาดตา สภาพจริงอ่านจากข้อความใต้ไอคอน
                            ไม่ได้สื่อด้วยรูปอย่างเดียว (กติกาเดียวกับ StatusBadge) */}
                        <span className="wx-day-icon" aria-hidden="true">
                          <Icon name={sky.icon} size={26} />
                        </span>
                        <span className="wx-day-sky">{t(sky.label)}</span>

                        {/* ═══ ตัวเลขเด่นของแต่ละวันเปลี่ยนตามแท็บที่เลือก ═══
                            ผู้ใช้ถามว่า "กดแท็บแล้วพยากรณ์ไม่เปลี่ยนตาม" (9 ก.ย. 2569)
                            ของเดิมแท็บคุมแค่กราฟรายชั่วโมง ส่วนแถบ 8 วันโชว์อุณหภูมิเสมอ
                            ซึ่งเป็นส่วนที่ตาไปหยุดก่อน จึงดูเหมือนกดแล้วไม่มีอะไรเกิดขึ้น
                            หน่วยติดอยู่กับตัวเลขทุกแบบ (° · % · m/s) คนจึงรู้ว่ากำลังดูอะไร
                            โดยไม่ต้องเงยไปดูว่าแท็บไหนสว่างอยู่ */}
                        <span className="wx-day-temp">
                          {fcTab === "rainChance" ? (
                            <b className="num">{dash(day.rainChance, formatNumber)}%</b>
                          ) : fcTab === "wind" ? (
                            <>
                              <b className="num">{dash(day.windMax, formatNumber1)}</b>
                              <em>m/s</em>
                            </>
                          ) : (
                            <>
                              <b className="num">{dash(day.max, formatNumber)}°</b>
                              <em className="num">{dash(day.min, formatNumber)}°</em>
                            </>
                          )}
                        </span>

                        {/* บรรทัดรองบอกสิ่งที่บรรทัดบนไม่ได้บอก — อุณหภูมิเป็นค่าตั้งต้น
                            เพราะเป็นตัวที่คนใช้ยึดที่สุด ยกเว้นตอนที่บรรทัดบนเป็นอุณหภูมิอยู่แล้ว */}
                        <span className="wx-day-rain">
                          {fcTab === "tempC" ? (
                            <>
                              <Icon name="drop" size={14} aria-hidden="true" />
                              {dash(day.rainChance, formatNumber)}%
                            </>
                          ) : (
                            /* ไม่มีไอคอนนำหน้าเหมือนบรรทัดฝน — องศาบอกตัวเองอยู่แล้ว
                               และที่จอ 420px ใบวันกว้างแค่ 95px ใส่ไอคอนเพิ่มแล้วตัวเลข
                               ตกบรรทัดที่สอง ใบวันสูงขึ้น 21px ตอนสลับแท็บ */
                            <span className="wx-day-pair num">
                              {dash(day.max, formatNumber)}° / {dash(day.min, formatNumber)}°
                            </span>
                          )}
                        </span>
                      </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Card>
        </Block>

        {/* ---------- โมเดลที่เราเทรนเองจากค่าของเสาต้นนี้ ---------- */}
        <Block id="model" label={t("โมเดลของเรา")}>
          <Card
            className="wx-model-card"
            icon="chart"
            title={t("โมเดลที่เราเทรนเอง")}
            subtitle={t("เรียนจากค่าที่เสาต้นนี้วัดได้จริง จึงรู้จักนิสัยของจุดนี้ที่พยากรณ์ทั่วไปไม่รู้")}
          >
            {/* ═══ การ์ดนี้จัดหน้าแบบเดียวกับการ์ดพยากรณ์ข้างบน (ผู้ใช้สั่ง 10 ก.ย. 2569) ═══
                แท็บค่า → กราฟ → แถบใบที่กดได้ เป็นลำดับเดียวกัน ใช้คลาสชุดเดียวกัน
                สองการ์ดพูดเรื่องเดียวกันคืออนาคต ต่างกันแค่ใครเป็นคนทำนาย
                จึงไม่ควรมีสองภาษาภาพให้คนต้องเรียนใหม่ */}
            <div className="wx-fc-bar">
              <Tabs
                value={modelTab}
                onChange={setModelTab}
                options={MODEL_TABS}
                label={t("ค่าที่จะให้โมเดลทำนาย")}
                withIcon
              />
              <span className="wx-fc-range">
                <Icon name="pulse" size={15} aria-hidden="true" />
                {t("ทำนายเองจากค่าที่เสาวัดได้ ไม่ใช่พยากรณ์ทั่วไป")}
              </span>
            </div>

            {model.status === "none" ? (
              /* "ยังไม่ได้เทรน" ไม่ใช่ความผิดพลาด — บอกวิธีสั่งเทรนไปเลย
                 ดีกว่าปล่อยการ์ดว่างให้คนเดาว่าอะไรพัง */
              <NoChart
                height={MODEL_H}
                text={t("ยังไม่เคยเทรนโมเดลของค่านี้ — สั่งเทรนได้จากโฟลเดอร์ weather (ดู README ข้อ 4.5)")}
              />
            ) : model.status === "error" ? (
              <NoChart
                height={MODEL_H}
                text={t("อ่านผลของโมเดลไม่ได้: {error}", { error: model.error })}
              />
            ) : !model.data ? (
              /* ยังไม่ได้คำตอบจากหลังบ้าน — เช็ก data ไม่ใช่เช็ก status
                 เพราะรอบแรกสุด status ยังเป็น "idle" อยู่ (เจอจริงตอนทดสอบ: หน้าพังทั้งหน้า) */
              <NoChart height={MODEL_H} text={t("กำลังโหลดคำทำนายของโมเดล…")} />
            ) : (
              <>
                {/* ที่มาของตัวเลขทุกตัวในการ์ดนี้ */}
                <p className="wx-fc-source">
                  <Icon name="pulse" size={17} aria-hidden="true" />
                  <span>
                    {t("เทรนจากค่าที่เสาต้นนี้วัดได้")}{" "}
                    <b className="num">{formatNumber(model.data.coverage.hours_with_target)}</b>{" "}
                    {t("ชั่วโมง (ดึงผ่าน API ของ PlotNexus เก็บลงคลังของเราเอง) · คำนวณล่าสุดเมื่อ {time}", {
                      time: formatDateTime(model.data.generated_at),
                    })}
                    {/* ═══ บนหน้าเดียวกันมีกราฟสองใบที่ตอบสนองไม่เหมือนกัน ═══
                        การ์ดพยากรณ์ข้างบนมีข้อมูลครบ 8 วัน กดใบวันไหนก็เปลี่ยนตาม
                        ส่วนโมเดลของเราทำนายไกลสุด 24 ชั่วโมง จึงยืนอยู่กับที่
                        ถ้าไม่บอกไว้ คนจะนึกว่าการ์ดนี้พังหรือกดไม่ติด */}
                    {pickedDate && (
                      <>
                        {" · "}
                        <b>{t("การ์ดนี้ไม่ตามวันที่เลือกข้างบน")}</b>{" "}
                        {t("โมเดลทำนายได้ไกลสุด 24 ชั่วโมง จึงแสดงช่วง 24 ชั่วโมงข้างหน้าเสมอ")}
                      </>
                    )}
                  </span>
                </p>

                {/* ★ เก่าเกินช่วงที่ทำนาย = ตัวเลขทั้งการ์ดพูดถึงเวลาที่ผ่านไปแล้ว
                    เตือนก่อนป้าย `stale` เพราะถ้าภาพนิ่งหมดอายุ เรื่องอื่นในนั้นก็หมดอายุตาม */}
                {age.level === "expired" && (
                  <p className="wx-model-warn">
                    <Icon name="warn" size={17} aria-hidden="true" />
                    <span>
                      {t("ภาพนิ่งนี้คำนวณไว้ {n} ชั่วโมงแล้ว ซึ่งนานกว่าช่วงที่โมเดลทำนาย ({h} ชั่วโมง) — เวลาที่ตัวเลขพวกนี้พูดถึงผ่านไปหมดแล้ว ต้องสั่งเทรนใหม่ก่อนถึงจะใช้ได้", {
                        n: formatNumber(Math.round(age.hours)),
                        h: formatNumber(age.horizonH),
                      })}
                    </span>
                  </p>
                )}

                {age.level === "old" && (
                  <p className="wx-model-warn">
                    <Icon name="warn" size={17} aria-hidden="true" />
                    <span>
                      {t("ภาพนิ่งนี้คำนวณไว้ {n} ชั่วโมงแล้ว — ยังอยู่ในช่วงที่ทำนายได้ แต่ยิ่งเก่ายิ่งคลาด", {
                        n: formatNumber(Math.round(age.hours)),
                      })}
                    </span>
                  </p>
                )}

                {model.data.stale && (
                  <p className="wx-model-warn">
                    <Icon name="warn" size={17} aria-hidden="true" />
                    <span>
                      ค่าล่าสุดที่โมเดลเห็นเก่าเกินไป จึงยังไม่ออกคำทำนายรอบนี้ —
                      ทำนายจากค่าที่หยุดอัปเดตแล้วได้ตัวเลขที่ดูปกติแต่ผิด
                    </span>
                  </p>
                )}

                {!modelChart ? (
                  <NoChart height={MODEL_H} text={t("รอบนี้ยังไม่มีคำทำนาย")} />
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={MODEL_H}>
                      <AreaChart
                        data={modelChart.rows}
                        margin={{ top: 14, right: 12, bottom: 0, left: -14 }}
                      >
                        <CartesianGrid {...gridProps} />
                        {/* แกนเป็นตัวเลขชั่วโมง ไม่ใช่ลำดับที่ — ระยะบนกราฟจึงตรงกับเวลาจริง */}
                        <XAxis
                          dataKey="x"
                          type="number"
                          domain={[modelChart.from, 24]}
                          tickFormatter={modelHourLabel}
                          {...axisProps}
                        />
                        <YAxis
                          domain={paddedDomain(
                            modelChart.rows
                              .flatMap((r) => [r.observed, r.model, r.openmeteo])
                              .filter((v) => v != null),
                            1,
                            { floor: model.data.unit === "m/s" ? 0 : null },
                          )}
                          {...axisProps}
                        />
                        <Tooltip
                          {...tooltipStyle}
                          labelFormatter={(x) =>
                            x <= 0
                              ? modelHourLabel(x)
                              : t("{label} (อีก {n} ชม.)", { label: modelHourLabel(x), n: x })
                          }
                          formatter={(v, name) => [
                            `${formatNumber1(v)} ${model.data.unit}`,
                            name,
                          ]}
                        />
                        {/* ไล่เฉดใต้เส้นคำทำนาย — ภาษาภาพเดียวกับการ์ดพยากรณ์ข้างบน */}
                        <defs>
                          <linearGradient id="wxMdFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={MODEL_LINES.model} stopOpacity={0.34} />
                            <stop offset="100%" stopColor={MODEL_LINES.model} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone"
                          dataKey="model"
                          name={t("โมเดลของเรา")}
                          stroke={MODEL_LINES.model}
                          fill="url(#wxMdFill)"
                          strokeWidth={2.5}
                          dot={{ r: 2.5 }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="observed"
                          name={t("เสาวัดได้จริง")}
                          stroke={MODEL_LINES.observed}
                          strokeWidth={2}
                          dot={false}
                        />
                        {/* เส้นประ = ยังไม่เกิดขึ้นจริง ไม่ได้บอกด้วยสีอย่างเดียว */}
                        <Line
                          type="monotone"
                          dataKey="openmeteo"
                          name={t("พยากรณ์ทั่วไป")}
                          stroke={MODEL_LINES.openmeteo}
                          strokeWidth={2}
                          strokeDasharray="5 4"
                          dot={false}
                          connectNulls
                        />
                        {/* จุดวงกลมบอกว่ากำลังเลือกใบไหนอยู่ — ใบที่กดกับจุดบนกราฟ
                            ต้องชี้ที่เดียวกัน ไม่งั้นกดแล้วไม่รู้ว่าไปโผล่ตรงไหน */}
                        {pickedHorizon && (
                          <ReferenceDot
                            x={pickedHorizon.horizon_h}
                            y={pickedHorizon.pred}
                            r={7}
                            fill={MODEL_LINES.model}
                            stroke="var(--bg-surface)"
                            strokeWidth={3}
                            isFront
                          />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>

                    <ChartLegend
                      items={[
                        { label: t("เสาวัดได้จริง"), color: MODEL_LINES.observed },
                        { label: t("โมเดลของเรา (ทำนาย)"), color: MODEL_LINES.model },
                        { label: t("พยากรณ์ทั่วไป (ทำนาย)"), color: MODEL_LINES.openmeteo },
                      ]}
                    />

                    {/* แถบใบเวลาข้างหน้า — โครงเดียวกับแถบ 8 วันของการ์ดพยากรณ์
                        ต่างกันที่ใบละ "อีกกี่ชั่วโมง" ไม่ใช่ใบละวัน เพราะโมเดลไปได้ 24 ชม. */}
                    <ul className="wx-days">
                      {model.data.horizons.map((r, i) => {
                        const picked = pickedH === r.horizon_h;
                        return (
                          <li key={r.horizon_h} style={{ "--i": i }}>
                            <button
                              type="button"
                              className={"wx-day is-lean" + (picked ? " is-picked" : "")}
                              aria-pressed={picked}
                              onClick={() => setPickedH(picked ? null : r.horizon_h)}
                            >
                              <span className="wx-day-name">
                                {t("อีก {n} ชม.", { n: r.horizon_h })}
                              </span>
                              <span className="wx-day-sky">{clockOf(r.valid_at)}</span>
                              <span className="wx-day-temp">
                                <b className="num">{formatNumber1(r.pred)}</b>
                                <em>{model.data.unit}</em>
                              </span>
                              {/* ทุกใบพกค่าความคลาดเคลื่อนของตัวเองมาด้วยเสมอ
                                  ตัวเลขทำนายที่ไม่มี ± กำกับคือตัวเลขลอย ๆ */}
                              <span className="wx-day-rain">
                                ± <span className="num">{formatNumber1(r.mae_model)}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>

                    {/* ═══ ตารางนี้คือเหตุผลที่การ์ดนี้เชื่อได้ ═══
                        ทุกช่องคือ "พลาดเฉลี่ยเท่าไร" วัดบนช่วงเวลาที่โมเดลไม่เคยเห็น
                        คอลัมน์ "ค่าเฉลี่ยชั่วโมงนั้น" เพิ่มมาทีหลัง (T1.236) เพราะเป็นตัวเดียว
                        ที่บอกได้ว่าโมเดลกำลังทำนายอากาศจริง หรือแค่ท่องรอบวันได้ */}
                    <div className="wx-score-wrap">
                      <table className="wx-score">
                        <caption>
                          {t("พลาดเฉลี่ยเท่าไร ({unit}) — วัดกับของจริงในช่วงที่โมเดลไม่เคยเห็น ยิ่งน้อยยิ่งดี ·", {
                            unit: model.data.unit,
                          })}{" "}
                          <b>{t("ค่าเฉลี่ยชั่วโมงนั้น")}</b>{" "}
                          {t("คือทายด้วยค่าเฉลี่ยของชั่วโมงเดียวกันในอดีตเฉย ๆ ถ้าโมเดลชนะช่องนั้นไม่ขาด แปลว่ายังแค่ท่องรอบวัน ไม่ได้รู้เรื่องอากาศ")}
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">{t("ล่วงหน้า")}</th>
                            <th scope="col">{t("โมเดลของเรา")}</th>
                            <th scope="col">{t("ทายว่าเท่าเดิม")}</th>
                            <th scope="col">{t("ค่าเฉลี่ยชั่วโมงนั้น")}</th>
                            <th scope="col">{t("พยากรณ์ทั่วไป")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {model.data.horizons
                            .filter((r) => SCORE_HORIZONS.includes(r.horizon_h))
                            .map((r) => (
                              <tr key={r.horizon_h}>
                                <th scope="row">{t("{n} ชม.", { n: r.horizon_h })}</th>
                                <td className="is-ours">
                                  <b className="num">{formatNumber1(r.mae_model)}</b>
                                </td>
                                <td>
                                  <span className="num">{formatNumber1(r.mae_persistence)}</span>
                                </td>
                                <td>
                                  {r.mae_climatology == null ? (
                                    "—"
                                  ) : (
                                    <span className="num">
                                      {formatNumber1(r.mae_climatology)}
                                    </span>
                                  )}
                                </td>
                                <td>
                                  {r.mae_openmeteo == null ? (
                                    "—"
                                  ) : (
                                    <span className="num">{formatNumber1(r.mae_openmeteo)}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </Card>
        </Block>

        {/* ---------- กราฟย้อนหลัง ---------- */}
        <Block id="trend" label={t("ย้อนหลัง")}>
          <Card
            className="wx-trend-card"
            icon="chart"
            title={t("ย้อนหลัง")}
            subtitle={t("ค่าจากเสาอากาศต้นเดียวกัน · หนึ่งกราฟมีแกนเดียว ค่าคนละหน่วยจึงแยกใบกัน")}
          >
            <div className="wx-trend-bar">
              <Tabs
                value={tab}
                onChange={setTab}
                options={TABS}
                label={t("ชุดค่าที่จะดู")}
                withIcon
              />
              <Tabs
                value={rangeId}
                onChange={setRangeId}
                options={RANGES}
                label={t("ช่วงเวลาของกราฟ")}
              />
            </div>

            {/* ★ เส้นที่เสาอากาศส่งค่าเดิมซ้ำถูกตัดออกแล้ว — ต้องบอกว่าตัดอะไรไป (T1.312)
                ถ้าหายไปเฉย ๆ คนอ่านจะนึกว่าไม่มีเซนเซอร์ตัวนั้น ซึ่งคนละเรื่องกับ
                "มีแต่เชื่อค่าไม่ได้" · ใช้ข้อความชุดเดียวกับหน้าสภาพแวดล้อม */}
            {stuckLines?.length > 0 && (
              <p className="wx-stuck">
                <StatusBadge tone="offline">{t("ค่าค้าง")}</StatusBadge>
                {t("ไม่ได้วาดเส้น {list} เพราะส่งค่าเดิมซ้ำตลอดช่วง — เซนเซอร์ยังส่งข้อมูลอยู่แต่ไม่ได้วัดจริง", {
                  list: stuckLines.map((name) => t(name)).join(" · "),
                })}
              </p>
            )}

            {histStatus === "loading" && rows.length === 0 ? (
              <NoChart height={SOLO_H} text={t("กำลังโหลดข้อมูลย้อนหลัง…")} />
            ) : histStatus === "error" ? (
              <NoChart height={SOLO_H} text={t("ดึงข้อมูลย้อนหลังไม่สำเร็จ ลองใหม่อีกครั้ง")} />
            ) : tab === "climate" ? (
              <>
                <MiniChart
                  data={rows}
                  dataKey="tempC"
                  color={WEATHER_COLORS.tempC}
                  unit="°C"
                  name={t("อุณหภูมิ")}
                  height={MINI_H}
                />
                <MiniChart
                  data={rows}
                  dataKey="humidity"
                  color={WEATHER_COLORS.humidity}
                  unit="%RH"
                  name={t("ความชื้น")}
                  height={MINI_H}
                  pad={2}
                />
                <ChartLegend
                  items={[
                    { label: t("อุณหภูมิ (°C)"), color: WEATHER_COLORS.tempC },
                    { label: t("ความชื้น (%RH)"), color: WEATHER_COLORS.humidity },
                  ]}
                />
              </>
            ) : tab === "windRain" ? (
              <>
                <MiniChart
                  data={rows}
                  dataKey="wind"
                  color={WEATHER_COLORS.wind}
                  unit="m/s"
                  name={t("ความเร็วลม")}
                  height={MINI_H}
                  pad={0.5}
                  floor={0}
                />
                {/* ฝนวาดเป็นพื้นที่ระบาย ไม่ใช่เส้น — ฝนคือ "ปริมาณที่ตกลงมา" ซึ่งอ่านเป็นก้อน
                    ได้ง่ายกว่าเส้นที่แบนติดศูนย์เกือบตลอดเวลา */}
                {rows.some((row) => row.rainfall != null) ? (
                  <ResponsiveContainer width="100%" height={MINI_H}>
                    <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis
                        dataKey="t"
                        tickFormatter={(i) => rows[i]?.hour ?? ""}
                        {...axisProps}
                      />
                      <YAxis
                        domain={paddedDomain(
                          rows.map((row) => row.rainfall).filter((v) => v != null),
                          1,
                          { floor: 0 },
                        )}
                        {...axisProps}
                      />
                      <Tooltip
                        {...tooltipStyle}
                        labelFormatter={(i) => rows[i]?.hour ?? ""}
                        formatter={(v) => [t("{n} มม.", { n: formatNumber1(v) }), t("ฝน")]}
                      />
                      <defs>
                        <linearGradient id="wxRainFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={WEATHER_COLORS.rainfall} stopOpacity={0.4} />
                          <stop offset="100%" stopColor={WEATHER_COLORS.rainfall} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="rainfall"
                        name={t("ฝน")}
                        stroke={WEATHER_COLORS.rainfall}
                        fill="url(#wxRainFill)"
                        strokeWidth={2}
                        activeDot={{ r: 5, strokeWidth: 2 }}
                        connectNulls
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <NoChart height={MINI_H} text={t("ไม่มีค่าฝนในช่วงนี้")} />
                )}
                <ChartLegend
                  items={[
                    { label: t("ความเร็วลม (m/s)"), color: WEATHER_COLORS.wind },
                    { label: t("ฝน (มม.)"), color: WEATHER_COLORS.rainfall },
                  ]}
                />
              </>
            ) : (
              <>
                <MiniChart
                  data={rows}
                  dataKey="light"
                  color={WEATHER_COLORS.light}
                  unit="lux"
                  name={t("ความสว่าง")}
                  height={SOLO_H}
                  pad={500}
                  floor={0}
                />
                <ChartLegend
                  items={[{ label: t("ความสว่าง (lux)"), color: WEATHER_COLORS.light }]}
                />
              </>
            )}
          </Card>
        </Block>

        {/* ---------- เทียบกับในเล้า ---------- */}
        <Block id="indoor" label={t("เทียบกับในเล้า")}>
          <Card
            className="wx-indoor-card"
            icon="wind"
            title={t("เทียบกับในเล้า")}
            subtitle={
              barn
                ? t("{barn} · {farm}", { barn: t(barn.name), farm: t(station.farm.name) })
                : t(station.farm.name)
            }
            action={{
              to: indoorLink,
              label: t("เปิดหน้าระบบควบคุมสภาพแวดล้อม"),
              icon: "chevron",
            }}
          >
            {barn && barn.tempC != null ? (
              <ul className="wx-gaps">
                <li className="wx-gap">
                  <span className="wx-gap-label">{t("อุณหภูมิ")}</span>
                  <span className="wx-gap-row">
                    <span className="wx-gap-side">
                      <em>{t("นอกเล้า")}</em>
                      <b className="num">{dash(out?.tempC, formatNumber1)} °C</b>
                    </span>
                    <Icon name="chevron" size={16} aria-hidden="true" />
                    <span className="wx-gap-side">
                      <em>{t("ในเล้า")}</em>
                      <b className="num">{dash(barn.tempC, formatNumber1)} °C</b>
                    </span>
                  </span>
                  <span className="wx-gap-note">
                    {tempGap == null
                      ? t("ไม่มีค่าให้เทียบ")
                      : tempGap === 0
                        ? t("ข้างนอกกับในเล้าเท่ากัน")
                        : t(
                            tempGap > 0
                              ? "ข้างนอกร้อนกว่า {n} °C"
                              : "ข้างนอกเย็นกว่า {n} °C",
                            { n: formatNumber1(Math.abs(tempGap)) },
                          )}
                  </span>
                </li>

                <li className="wx-gap">
                  <span className="wx-gap-label">{t("ความชื้น")}</span>
                  <span className="wx-gap-row">
                    <span className="wx-gap-side">
                      <em>{t("นอกเล้า")}</em>
                      <b className="num">{dash(out?.humidity)} %</b>
                    </span>
                    <Icon name="chevron" size={16} aria-hidden="true" />
                    <span className="wx-gap-side">
                      <em>{t("ในเล้า")}</em>
                      <b className="num">{dash(barn.humidity)} %</b>
                    </span>
                  </span>
                  <span className="wx-gap-note">
                    {humidGap == null
                      ? t("ไม่มีค่าให้เทียบ")
                      : humidGap === 0
                        ? t("ข้างนอกกับในเล้าเท่ากัน")
                        : t(
                            humidGap > 0
                              ? "ข้างนอกชื้นกว่า {n}%"
                              : "ข้างนอกแห้งกว่า {n}%",
                            { n: formatNumber(Math.abs(humidGap)) },
                          )}
                  </span>
                </li>
              </ul>
            ) : (
              /* เสาอากาศกับเซนเซอร์ในเล้าเป็นคนละอุปกรณ์ ตายคนละเวลากันได้
                 (ตอนเขียนหน้านี้เจอของจริง: เสาส่งค่าเมื่อ 2 นาทีที่แล้ว แต่ในเล้าเงียบมา 25 ชม.)
                 บอกเวลาที่ส่งครั้งสุดท้ายไปเลย จะได้รู้ว่า "เพิ่งหลุด" หรือ "ตายมานานแล้ว" */
              <p className="wx-empty">
                {t("{barn} ไม่ส่งค่าเข้ามา จึงยังเทียบกับข้างนอกไม่ได้", {
                  barn: barn ? t(barn.name) : t("โรงเรือนในฟาร์มนี้"),
                })}
                {barn?.updatedAt
                  ? t(" · ส่งค่าครั้งสุดท้าย {time}", {
                      time: formatDateTime(barn.updatedAt),
                    })
                  : ""}
                {t(" — เสาอากาศยังส่งค่าปกติ สองอย่างนี้เป็นคนละอุปกรณ์กัน")}
              </p>
            )}
          </Card>
        </Block>
      </PageBoard>
    </>
  );
}
