/**
 * กราฟเส้นที่วาดจาก "ทะเบียนชนิดค่า" — ใช้ได้กับค่าชนิดใดก็ได้ (T1.346)
 *
 * ═══ ทำไมต้องมี ═══
 * กราฟเดิมเขียนไว้ทีละค่า พร้อมหน่วย เกณฑ์ และสีของตัวมันเอง เพิ่มเซนเซอร์ชนิดใหม่
 * จึงต้องเขียนกราฟใหม่ทุกครั้ง กราฟตัวนี้รับ `spec` แล้วจัดการให้เอง
 *
 * ═══ ★ สิ่งที่ยังต้องรอ ═══
 * หลังบ้านส่งค่าย้อนหลังได้ตามชนิดที่ขอผ่าน `?metrics=` อยู่แล้ว แต่มีรายชื่อที่อนุญาต
 * ของตัวเองใน `server/src/modules/readings/route.js` ค่าชนิดใหม่จาก Easy Pairing
 * จะดึงย้อนหลังได้ **ต่อเมื่อเพิ่มชื่อเข้ารายการนั้นด้วย** — มีเทสต์เตือนเรื่องนี้ไว้แล้ว
 */
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { formatNumber, formatNumber1, formatNumber2 } from "../../lib/format.js";
import { axisProps, comfortBandProps, gridProps, paddedDomain, tooltipStyle, SERIES } from "../../lib/chartTheme.js";
import { useT } from "../../lib/i18n/useT.js";
import "./metrics.css";

const formatterFor = (decimals) =>
  decimals >= 2 ? formatNumber2 : decimals === 1 ? formatNumber1 : formatNumber;

/** ความสูงของกราฟย่อย — ตรงกับกราฟคู่ในหน้าสภาพแวดล้อม เพื่อให้วางเรียงกันแล้วไม่เหลื่อม */
const HEIGHT = 190;

/**
 * @param {object} props
 * @param {import("../../lib/metrics/registry.js").MetricSpec} props.spec
 * @param {Array<{t: number, label: string, value: number|null}>} props.points
 * @param {number} [props.colorIndex] ลำดับสีใน SERIES — สีผูกกับสิ่งของถาวร ห้ามสุ่ม
 * @param {{min?: number, max?: number}} [props.override] เกณฑ์ที่ผู้ใช้ตั้งเอง
 */
export default function MetricChart({ spec, points, colorIndex = 0, override = null }) {
  const t = useT();
  const data = points ?? [];
  const format = formatterFor(spec.decimals);
  const range = override ?? spec.range;
  const color = SERIES[colorIndex % SERIES.length];

  /* ไม่มีจุดให้วาด = บอกตรง ๆ ไม่ใช่วาดกราฟเปล่าที่ดูเหมือนค่าเป็นศูนย์ตลอดช่วง */
  if (data.length === 0) {
    return (
      <div className="mc-wrap">
        <p className="mc-head">
          {t(spec.label)}
          {spec.unit && <span className="mc-unit">{spec.unit}</span>}
        </p>
        <p className="mc-empty">{t("ยังไม่มีข้อมูลย้อนหลังของค่านี้")}</p>
      </div>
    );
  }

  const last = [...data].reverse().find((p) => p.value != null)?.value ?? null;

  return (
    <div className="mc-wrap">
      <p className="mc-head">
        {t(spec.label)}
        {spec.unit && <span className="mc-unit">{spec.unit}</span>}
        <span className="num mc-last">{last == null ? "—" : format(last)}</span>
      </p>

      <ResponsiveContainer width="100%" height={HEIGHT}>
        <LineChart data={data} margin={{ top: 4, right: 10, bottom: 0, left: -14 }}>
          <CartesianGrid {...gridProps} />
          {/* แถบเกณฑ์วาดเฉพาะค่าที่มีเกณฑ์ทั้งสองฝั่ง — มีด้านเดียวแถบจะกินทั้งกราฟ */}
          {range?.min != null && range?.max != null && (
            <ReferenceArea y1={range.min} y2={range.max} {...comfortBandProps} />
          )}
          <XAxis
            dataKey="t"
            {...axisProps}
            minTickGap={8}
            tickFormatter={(i) => data[i]?.label ?? ""}
          />
          {/* แกน Y เดียวเสมอ ตามกติกาใน CLAUDE.md */}
          <YAxis
            {...axisProps}
            width={38}
            tickCount={4}
            domain={paddedDomain(
              data.map((p) => p.value),
              1.5,
              {
                floor: spec.scale?.floor ?? null,
                ceil: spec.scale?.ceil ?? null,
                band: range?.min != null && range?.max != null ? range : null,
              },
            )}
          />
          <Tooltip
            {...tooltipStyle}
            formatter={(value) => [`${format(value)}${spec.unit ? ` ${spec.unit}` : ""}`, t(spec.label)]}
            labelFormatter={(i) => data[i]?.label ?? ""}
          />
          <Line
            type="monotone"
            dataKey="value"
            name={t(spec.label)}
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
