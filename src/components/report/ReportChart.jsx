/**
 * กราฟค่าในเล้าตลอดกะ — ใช้ในหน้ารายงานส่งเวร (T1.268)
 *
 * **ช่วงที่ไม่มีข้อมูลต้องเป็นรอยขาดบนเส้น** (connectNulls = false) ไม่ใช่ลากเส้นตรงข้ามไป
 * เส้นที่ลากข้ามช่วงขาด 5 ชั่วโมงดูเหมือนค่าคงที่ทั้งคืน ซึ่งเป็นภาพที่ไม่จริง
 * จึงเติมช่องว่างเป็น null ให้ครบทุก 5 นาทีก่อนวาด
 *
 * series เดียวต่อกราฟ (หน่วยต่างกัน = กราฟต่างกัน ตาม DESIGN.md) จึงไม่มี legend
 */
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useT } from "../../lib/i18n/useT.js";
import { formatNumber, formatNumber1, formatTime } from "../../lib/format.js";
import {
  axisProps,
  comfortBandProps,
  evenTicks,
  gridProps,
  hourTicks,
  paddedDomain,
  tooltipStyle,
  WEATHER_COLORS,
} from "../../lib/chartTheme.js";

const CHART_H = 240;

/** สีผูกกับค่าที่วัดถาวร — อุณหภูมิส้ม ความชื้นน้ำเงิน ทุกกราฟในแอป */
const COLOR = { temp_c: WEATHER_COLORS.tempC, humidity: WEATHER_COLORS.humidity, wind_ms: WEATHER_COLORS.wind };
const UNIT = { temp_c: "°C", humidity: "%", wind_ms: "m/s", nh3: "ppm" };
const fmt = (metric, v) => (metric === "humidity" ? formatNumber(v) : formatNumber1(v));

/**
 * @param {object} metric  หนึ่งรายการจาก report.metrics (มี series [{t, v}] เวลาเป็น ms)
 * @param {number} from    ต้นกะ (ms)
 * @param {number} until   ท้ายกะ หรือ "ตอนนี้" ถ้ากะยังไม่จบ (ms)
 * @param {number} bucketMin ความละเอียดของช่อง (นาที)
 */
export default function ReportChart({ metric, from, until, bucketMin }) {
  const t = useT();
  const step = bucketMin * 60_000;
  const byTime = new Map(metric.series.map((p) => [p.t, p.v]));
  const data = [];
  for (let at = Math.floor(from / step) * step, i = 0; at < until; at += step, i += 1) {
    const v = byTime.get(at);
    data.push({ i, t: at, label: formatTime(new Date(at).toISOString()), v: Number.isFinite(v) ? v : null });
  }

  const band =
    Number.isFinite(metric.limits?.min) && Number.isFinite(metric.limits?.max)
      ? { min: metric.limits.min, max: metric.limits.max }
      : null;
  const yAxis = evenTicks(
    paddedDomain(
      data.map((d) => d.v),
      metric.metric === "humidity" ? 3 : 0.6,
      { band, ...(metric.metric === "humidity" ? { floor: 0, ceil: 100 } : {}) },
    ),
  );
  const xTicks = hourTicks(data.map((d) => d.t / 1000));
  const color = COLOR[metric.metric] ?? WEATHER_COLORS.tempC;
  /* ค่าที่ไม่มีเพื่อนบ้านทั้งสองข้าง (ข้อมูลขาดก่อนและหลัง) ลากเป็นเส้นไม่ได้ — ถ้าไม่วาดเป็นจุด
     มันจะหายไปจากกราฟเลย (เจอจริง: กะดึก 17→18 ก.ย. มี 5 ค่า กราฟดูว่างเปล่าทั้งใบ) */
  const isolated = (i) =>
    data[i]?.v != null && data[i - 1]?.v == null && data[i + 1]?.v == null;
  const dot = ({ cx, cy, index }) =>
    isolated(index) && Number.isFinite(cx) && Number.isFinite(cy) ? (
      <circle key={index} cx={cx} cy={cy} r={3.5} fill={color} stroke={color} />
    ) : (
      <g key={index} />
    );
  const unit = UNIT[metric.metric] ?? "";

  return (
    <ResponsiveContainer width="100%" height={CHART_H}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
        <CartesianGrid {...gridProps} />
        {band && <ReferenceArea y1={band.min} y2={band.max} {...comfortBandProps} />}
        <XAxis
          dataKey="i"
          type="number"
          domain={[0, Math.max(data.length - 1, 0)]}
          ticks={xTicks}
          interval="equidistantPreserveStart"
          tickFormatter={(i) => data[i]?.label ?? ""}
          minTickGap={28}
          {...axisProps}
        />
        <YAxis domain={yAxis.domain} ticks={yAxis.ticks} interval={0} tickFormatter={(v) => fmt(metric.metric, v)} {...axisProps} />
        <Tooltip
          {...tooltipStyle}
          labelFormatter={(i) => data[i]?.label ?? ""}
          formatter={(v) => [v == null ? t("ไม่มีข้อมูล") : `${fmt(metric.metric, v)} ${unit}`, t("เฉลี่ย 5 นาที")]}
        />
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2}
          dot={dot}
          activeDot={{ r: 4 }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
