/**
 * หน้า "การเงิน" (/dashboard/finance) — ปลายทางของกล่องสรุป "กำไรเดือนล่าสุด"
 *
 * โครง: StatTile 4 ใบ → ต้นทุนรายเดือนแยกหมวด (แท่งซ้อน) →
 *       รายรับ vs ต้นทุน (แท่งคู่) → ราคาหน้าฟาร์มเทียบราคาคุ้มทุน
 *
 * ทุกกราฟมีแกน Y เดียว หน่วยบาท (กราฟราคาหน่วยบาท/กก. จึงต้องแยกการ์ด)
 * สีหมวดต้นทุนผูกถาวรผ่าน COST_COLORS — กรองข้อมูลแล้วสีต้องไม่ขยับ
 */
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import PageHeader from "../components/ui/PageHeader.jsx";
import PageBoard, { Block } from "../components/board/PageBoard.jsx";
import Card from "../components/ui/Card.jsx";
import StatTile from "../components/ui/StatTile.jsx";
import DataSourceNote from "../components/ui/DataSourceNote.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import ChartLegend from "../components/ui/ChartLegend.jsx";
import {
  monthlyCost,
  monthlyRevenue,
  farmGatePrice,
  financeSummary,
} from "../data/mock/finance.js";
import {
  SERIES,
  COST_COLORS,
  gridProps,
  axisProps,
  tooltipStyle,
  CHART_HEIGHT,
} from "../lib/chartTheme.js";
import { formatNumber, formatNumber1, formatBaht, formatMonth } from "../lib/format.js";
import { useT } from "../lib/i18n/useT.js";
import "./Finance.css";

/** ชื่อไทยของหมวดต้นทุน — คีย์ต้องตรงกับ COST_COLORS และข้อมูลใน monthlyCost */
const COST_LABEL = {
  feed: "ค่าอาหาร",
  medicine: "ยา / วัคซีน",
  labor: "แรงงาน",
  utility: "น้ำ / ไฟ",
  other: "อื่น ๆ",
};
const COST_KEYS = Object.keys(COST_LABEL);

/** รายรับ = เขียว · ต้นทุน = แดง — ผูกกับความหมายถาวรทั้งหน้า */
const REVENUE_COLOR = SERIES[3];
const COST_COLOR = SERIES[5];

/* รวมรายรับกับต้นทุนของเดือนเดียวกันให้อยู่แถวเดียว เพื่อวาดแท่งคู่ได้ในกราฟเดียว */
const compare = monthlyRevenue.map((row) => {
  const cost = monthlyCost.find((c) => c.month === row.month);
  const totalCost = cost
    ? COST_KEYS.reduce((sum, key) => sum + cost[key], 0)
    : 0;
  return { month: row.month, revenue: row.amount, cost: totalCost };
});

const lastPrice = farmGatePrice.at(-1);
const margin = (financeSummary.profit / financeSummary.totalRevenue) * 100;

/**
 * ย่อเลขบาทบนแกน Y — 1,802,000 บาทเขียนเต็มจะยาวจนแกนกินพื้นที่กราฟ
 *
 * รับ `t` เข้ามาเพราะคำย่อของ "ล้าน" ต่างกันทุกภาษา (ล. · M · 百万)
 * เคยเขียนตายตัวเป็น "ล." แล้วแกน Y เป็นภาษาไทยอยู่คนเดียวทั้งที่หน้าเป็นอังกฤษหมดแล้ว
 */
const axisBaht = (t) => (value) => t("{n} ล.", { n: formatNumber1(value / 1_000_000) });

/** รหัสกระดานของหน้านี้ — คีย์ที่ใช้เก็บชุดเลย์เอาต์ (ดู lib/layout/presets.js) */
const BOARD_ID = "finance";

export default function Finance() {
  const t = useT();

  return (
    <>
      <PageHeader
        title={t("การเงิน")}
        subtitle={t("เดือน {month}", { month: formatMonth(financeSummary.month) })}
      />

      {/* ทั้งหน้านี้ยังเป็นข้อมูลตัวอย่าง — ต้องบอกก่อนที่คนจะอ่านตัวเลข

          ไม่งั้นตัวเลขอย่าง "กำไรเดือนล่าสุด" จะถูกเอาไปใช้จริง (T1.283) */}

      <DataSourceNote source="demo" />


      <PageBoard boardId={BOARD_ID}>
        <Block id="revenue" label={t("รายรับเดือนล่าสุด")}>
          <StatTile
            source="demo"
            label={t("รายรับเดือนล่าสุด")}
            value={formatBaht(financeSummary.totalRevenue)}
            delta={{
              text: t("ขายสุกร {n} ตัว", { n: formatNumber(monthlyRevenue.at(-1).pigsSold) }),
              tone: "neutral",
            }}
          />
        </Block>

        <Block id="cost" label={t("ต้นทุนเดือนล่าสุด")}>
          <StatTile
            source="demo"
            label={t("ต้นทุนเดือนล่าสุด")}
            value={formatBaht(financeSummary.totalCost)}
            delta={{
              text: t("ต้นทุนต่อตัวที่ขาย {baht}", { baht: formatBaht(financeSummary.costPerPigSold) }),
              tone: "neutral",
            }}
          />
        </Block>

        <Block id="profit" label={t("กำไร")}>
          <StatTile
            source="demo"
            label={t("กำไร")}
            value={formatBaht(financeSummary.profit)}
            delta={{
              text: t("อัตรากำไร {pct}% ของรายรับ", { pct: formatNumber1(margin) }),
              tone: financeSummary.profit > 0 ? "good" : "bad",
            }}
          />
        </Block>

        <Block id="margin" label={t("ราคาคุ้มทุน")}>
          <StatTile
            source="demo"
            label={t("ราคาคุ้มทุน")}
            value={formatNumber1(financeSummary.breakEvenPriceKg)}
            unit={t("บาท/กก.")}
            delta={{
              text: t("ราคาขายล่าสุด {n} บาท/กก.", { n: formatNumber1(lastPrice.price) }),
              tone: lastPrice.price >= financeSummary.breakEvenPriceKg ? "good" : "bad",
            }}
          />
        </Block>

        <Block id="costByType" label={t("ต้นทุนรายเดือนแยกหมวด")}>
          {/* ---------- ต้นทุนรายเดือนแยกหมวด ---------- */}
          <Card
            title={t("ต้นทุนรายเดือนแยกหมวด")}
            subtitle={t("แท่งซ้อน 5 หมวด · แกน Y หน่วยล้านบาท")}
            icon="feed"
          >
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart data={monthlyCost} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="month" {...axisProps} tickFormatter={formatMonth} />
                <YAxis {...axisProps} width={56} tickFormatter={axisBaht(t)} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value, name) => [formatBaht(value), name]}
                  labelFormatter={formatMonth}
                />
                {COST_KEYS.map((key, i) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    name={t(COST_LABEL[key])}
                    stackId="cost"
                    fill={COST_COLORS[key]}
                    /* ชั้นบนสุดเท่านั้นที่มุมโค้ง ไม่งั้นแต่ละชั้นจะดูเหมือนแท่งแยกกัน */
                    radius={i === COST_KEYS.length - 1 ? [4, 4, 0, 0] : 0}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>

            <ChartLegend
              items={COST_KEYS.map((key) => ({
                label: t(COST_LABEL[key]),
                color: COST_COLORS[key],
              }))}
            />
          </Card>
        </Block>

        <Block id="revVsCost" label={t("รายรับเทียบต้นทุน")}>
          {/* ---------- รายรับ vs ต้นทุน ---------- */}
          <Card
            title={t("รายรับเทียบต้นทุน")}
            subtitle={t("แท่งคู่ต่อเดือน · แกน Y หน่วยล้านบาท")}
            icon="wallet"
          >
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart data={compare} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="month" {...axisProps} tickFormatter={formatMonth} />
                <YAxis {...axisProps} width={56} tickFormatter={axisBaht(t)} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value, name) => [formatBaht(value), name]}
                  labelFormatter={formatMonth}
                />
                <Bar dataKey="revenue" name={t("รายรับ")} fill={REVENUE_COLOR} radius={[4, 4, 0, 0]} />
                <Bar dataKey="cost" name={t("ต้นทุน")} fill={COST_COLOR} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            <ChartLegend
              items={[
                { label: t("รายรับ"), color: REVENUE_COLOR },
                { label: t("ต้นทุน"), color: COST_COLOR },
              ]}
            />
          </Card>
        </Block>

        <Block id="price" label={t("ราคาขายหน้าฟาร์ม")}>
          {/* ---------- ราคาหน้าฟาร์ม ---------- */}
          <Card
            title={t("ราคาขายหน้าฟาร์ม")}
            subtitle={t("เส้นประคือราคาคุ้มทุน — ต่ำกว่าเส้นนี้คือขายแล้วขาดทุน")}
            icon="chart"
          >
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={farmGatePrice} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="month" {...axisProps} tickFormatter={formatMonth} />
                <YAxis {...axisProps} width={52} domain={[58, 78]} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value) => [
                    t("{n} บาท/กก.", { n: formatNumber1(value) }),
                    t("ราคาขาย"),
                  ]}
                  labelFormatter={formatMonth}
                />
                <ReferenceLine
                  y={financeSummary.breakEvenPriceKg}
                  stroke="var(--ink-muted)"
                  strokeDasharray="5 5"
                  label={{
                    value: t("คุ้มทุน {n} บาท/กก.", {
                      n: formatNumber1(financeSummary.breakEvenPriceKg),
                    }),
                    position: "insideBottomRight",
                    fill: "var(--ink-muted)",
                    fontSize: 13,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  name={t("ราคาขาย")}
                  stroke={SERIES[2]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>

            <p className="fn-note">
              <StatusBadge
                tone={lastPrice.price >= financeSummary.breakEvenPriceKg ? "good" : "critical"}
              >
                {lastPrice.price >= financeSummary.breakEvenPriceKg
                  ? t("สูงกว่าราคาคุ้มทุน")
                  : t("ต่ำกว่าราคาคุ้มทุน")}
              </StatusBadge>
              {t("เดือน {month} ขายได้ {price} บาท/กก.", {
                month: formatMonth(lastPrice.month),
                price: formatNumber1(lastPrice.price),
              })}
            </p>
          </Card>
        </Block>
      </PageBoard>
    </>
  );
}
