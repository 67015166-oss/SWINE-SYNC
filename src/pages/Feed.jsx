/**
 * หน้า "อาหาร & น้ำหนัก" (/dashboard/feed) — ปลายทางของกล่องสรุป "อาหารที่ให้วันนี้"
 *
 * โครง: StatTile 4 ใบ → อาหารรายวันแยกโรงเรือน → น้ำหนักเฉลี่ยราย batch → สต็อกอาหาร
 *
 * สองกราฟแยกการ์ดกันเด็ดขาด เพราะหน่วยคนละอย่าง (กก./วัน กับ กก./ตัว)
 * — กติกา "หนึ่งกราฟมีแกน Y เดียว" ใน docs/DESIGN.md
 * สีเส้นผูกกับโรงเรือนถาวรผ่าน BARN_COLORS (B4 น้ำเงิน · B5 เขียวน้ำทะเล · B6 เหลือง)
 */
import {
  ResponsiveContainer,
  LineChart,
  Line,
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
import Icon from "../components/ui/Icon.jsx";
import { batches, feedDaily, weightWeekly, feedStock } from "../data/mock/feed.js";
import { barns } from "../data/mock/herd.js";
import {
  SERIES,
  BARN_COLORS,
  gridProps,
  axisProps,
  tooltipStyle,
  CHART_HEIGHT,
} from "../lib/chartTheme.js";
import {
  formatNumber,
  formatNumber1,
  formatNumber2,
  formatDateShort,
} from "../lib/format.js";
import { useT } from "../lib/i18n/useT.js";
import "./Feed.css";

const barnName = (id) => barns.find((b) => b.id === id)?.name ?? id;

/** โรงเรือนที่มีข้อมูลอาหารรายวัน — อ่านจากคีย์ของข้อมูลจริง ไม่เขียนตายตัว */
const FEED_BARNS = Object.keys(feedDaily.at(-1)).filter((k) => k !== "date");

/** batch ที่มีข้อมูลน้ำหนัก — อ่านจากคีย์ของข้อมูลจริงเช่นกัน */
const WEIGHT_BATCHES = Object.keys(weightWeekly[0]).filter((k) => k !== "week");

const lastFeed = feedDaily.at(-1);
const feedToday = FEED_BARNS.reduce((sum, key) => sum + lastFeed[key], 0);

/* ค่าเฉลี่ยถ่วงน้ำหนักด้วยจำนวนสุกร — ค่าเฉลี่ยธรรมดาจะให้ batch เล็กมีน้ำหนักเท่า batch ใหญ่ */
const totalPigs = batches.reduce((sum, b) => sum + b.pigCount, 0);
const avgFcr = batches.reduce((sum, b) => sum + b.fcr * b.pigCount, 0) / totalPigs;
const avgAdg = batches.reduce((sum, b) => sum + b.adgGram * b.pigCount, 0) / totalPigs;

/** เป้าหมายจากคำอธิบายใน data/mock/feed.js — FCR ยิ่งต่ำยิ่งดี · ADG ยิ่งสูงยิ่งดี */
const FCR_TARGET = 2.6;
const ADG_TARGET = 800;

/** สต็อกเหลือน้อยกว่า 10 วัน = ต้องสั่งเพิ่มแล้ว */
const LOW_STOCK_DAYS = 10;

/** รหัสกระดานของหน้านี้ — คีย์ที่ใช้เก็บชุดเลย์เอาต์ (ดู lib/layout/presets.js) */
const BOARD_ID = "feed";

export default function Feed() {
  const t = useT();
  const lowStock = feedStock.filter((s) => s.daysLeft < LOW_STOCK_DAYS);

  return (
    <>
      <PageHeader
        title={t("อาหาร & น้ำหนัก")}
        subtitle={t("ข้อมูลล่าสุด {date}", { date: formatDateShort(lastFeed.date) })}
      />

      {/* ทั้งหน้านี้ยังเป็นข้อมูลตัวอย่าง — ต้องบอกก่อนที่คนจะอ่านตัวเลข

          ไม่งั้นตัวเลขอย่าง "กำไรเดือนล่าสุด" จะถูกเอาไปใช้จริง (T1.283) */}

      <DataSourceNote source="demo" />


      <PageBoard boardId={BOARD_ID}>
        <Block id="fcr" label={t("FCR เฉลี่ย")}>
          <StatTile
            source="demo"
            label={t("FCR เฉลี่ย")}
            value={formatNumber2(avgFcr)}
            unit={t("กก./กก.")}
            delta={{
              text: t("เป้าหมายไม่เกิน {n} — ยิ่งต่ำยิ่งดี", { n: formatNumber2(FCR_TARGET) }),
              tone: avgFcr <= FCR_TARGET ? "good" : "bad",
            }}
          />
        </Block>

        <Block id="adg" label={t("ADG เฉลี่ย")}>
          <StatTile
            source="demo"
            label={t("ADG เฉลี่ย")}
            value={formatNumber(Math.round(avgAdg))}
            unit={t("กรัม/วัน")}
            delta={{
              text: t("เป้าหมายอย่างน้อย {n} กรัม/วัน", { n: formatNumber(ADG_TARGET) }),
              tone: avgAdg >= ADG_TARGET ? "good" : "bad",
            }}
          />
        </Block>

        <Block id="today" label={t("อาหารวันล่าสุด")}>
          <StatTile
            source="demo"
            label={t("อาหารวันล่าสุด")}
            value={formatNumber(feedToday)}
            unit={t("กก.")}
            delta={{
              text: t("จาก {n} โรงเรือนขุน", { n: formatNumber(FEED_BARNS.length) }),
              tone: "neutral",
            }}
          />
        </Block>

        <Block id="lowStock" label={t("สูตรที่ใกล้หมด")}>
          <StatTile
            source="demo"
            label={t("สูตรที่ใกล้หมด")}
            value={formatNumber(lowStock.length)}
            unit={t("สูตร")}
            delta={{
              text: t("จากทั้งหมด {n} สูตร", { n: formatNumber(feedStock.length) }),
              tone: lowStock.length > 0 ? "bad" : "good",
            }}
          />
        </Block>

        <Block id="daily" label={t("อาหารรายวันแยกโรงเรือน")}>
          {/* ---------- อาหารรายวันแยกโรงเรือน ---------- */}
          <Card
            title={t("อาหารรายวันแยกโรงเรือน")}
            subtitle={t("14 วันล่าสุด · หน่วยกิโลกรัมต่อวัน")}
            icon="feed"
          >
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={feedDaily} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} tickFormatter={formatDateShort} minTickGap={16} />
                <YAxis {...axisProps} width={56} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value, name) => [t("{n} กก.", { n: formatNumber(value) }), name]}
                  labelFormatter={formatDateShort}
                />
                {FEED_BARNS.map((key) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={t(barnName(key))}
                    stroke={BARN_COLORS[key]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>

            <ChartLegend
              items={FEED_BARNS.map((key) => ({
                label: t(barnName(key)),
                color: BARN_COLORS[key],
              }))}
            />
          </Card>
        </Block>

        <Block id="weight" label={t("น้ำหนักเฉลี่ยราย batch")}>
          {/* ---------- น้ำหนักเฉลี่ยราย batch ---------- */}
          <Card
            title={t("น้ำหนักเฉลี่ยราย batch")}
            subtitle={t(
              "หน่วยกิโลกรัมต่อตัว · เส้นที่สั้นกว่าคือชุดที่เพิ่งเข้าเลี้ยง ยังไม่มีข้อมูลสัปดาห์หลัง",
            )}
            icon="chart"
          >
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={weightWeekly} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="week" {...axisProps} tickFormatter={(w) => t(w)} />
                <YAxis {...axisProps} width={48} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value, name) => [t("{n} กก.", { n: formatNumber1(value) }), name]}
                />
                {WEIGHT_BATCHES.map((id, i) => (
                  <Line
                    key={id}
                    type="monotone"
                    dataKey={id}
                    name={t(`ชุด ${id}`)}
                    stroke={SERIES[i]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    /* ค่า null คือ "ยังไม่ถึงสัปดาห์นั้น" ไม่ใช่ 0 — ห้ามลากเส้นข้ามไป */
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>

            <ChartLegend
              items={WEIGHT_BATCHES.map((id, i) => ({
                label: t(`ชุด ${id}`),
                color: SERIES[i],
              }))}
            />
          </Card>
        </Block>

        <Block id="stock" label={t("สต็อกอาหารคงเหลือ")}>
          {/* ---------- สต็อกอาหาร ---------- */}
          <Card
            title={t("สต็อกอาหารคงเหลือ")}
            subtitle={t("สูตรที่ใช้ได้อีกไม่ถึง {n} วัน จะถูกทำเครื่องหมายว่าใกล้หมด", {
              n: LOW_STOCK_DAYS,
            })}
            icon="list"
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("สูตรอาหาร")}</th>
                    <th className="num">{t("คงเหลือ (กก.)")}</th>
                    <th className="num">{t("ใช้ได้อีก (วัน)")}</th>
                    <th>{t("สถานะ")}</th>
                  </tr>
                </thead>
                <tbody>
                  {feedStock.map((stock) => (
                    <tr key={stock.formula}>
                      <td>{t(stock.formula)}</td>
                      <td className="num">{formatNumber(stock.remainingKg)}</td>
                      <td className="num">{formatNumber(stock.daysLeft)}</td>
                      <td>
                        {stock.daysLeft < LOW_STOCK_DAYS ? (
                          <StatusBadge tone="warning">{t("ใกล้หมด")}</StatusBadge>
                        ) : (
                          <StatusBadge tone="good">{t("เพียงพอ")}</StatusBadge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="fd-batches">
              {batches.map((batch) => (
                <li key={batch.id} className="fd-batch">
                  <span className="icon-chip is-sm" aria-hidden="true">
                    <Icon name="pig" size={18} />
                  </span>
                  <span className="fd-batch-text">
                    <b>
                      {t("{batch} · {barn}", {
                        batch: t(`ชุด ${batch.id}`),
                        barn: t(barnName(batch.barnId)),
                      })}
                    </b>
                    <span>
                      {t("{pigs} ตัว · น้ำหนักเฉลี่ย {weight} กก. · FCR {fcr} · ADG {adg} กรัม/วัน", {
                        pigs: formatNumber(batch.pigCount),
                        weight: formatNumber1(batch.avgWeightKg),
                        fcr: formatNumber2(batch.fcr),
                        adg: formatNumber(batch.adgGram),
                      })}
                    </span>
                  </span>
                  <StatusBadge tone={batch.fcr <= FCR_TARGET ? "good" : "warning"}>
                    {batch.fcr <= FCR_TARGET ? t("FCR ตามเป้า") : t("FCR เกินเป้า")}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          </Card>
        </Block>
      </PageBoard>
    </>
  );
}
