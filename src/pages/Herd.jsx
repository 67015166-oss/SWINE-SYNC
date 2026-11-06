/**
 * หน้า "ฝูงสุกร" (/dashboard/herd) — ปลายทางของกล่องสรุป "อัตราการสูญเสีย"
 *
 * โครง: StatTile 4 ใบ → ประชากรตามโรงเรือน → เหตุการณ์สูญเสีย → อัตราตายรายเดือน
 * ข้อมูลทั้งหมดมาจาก data/mock/herd.js (ชื่อโรงเรือนก็เอามาจากที่นั่น ไม่ hardcode)
 *
 * กราฟอัตราตายมีค่าเดียว (rate) เทียบเส้นเป้าหมาย จึงมีแกน Y เดียวและไม่ต้องมี legend
 */
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { useState } from "react";
import PageHeader from "../components/ui/PageHeader.jsx";
import { useAllFarms } from "../lib/records/useAllFarms.js";
import { useHerdCounts } from "../lib/api/useHerdCounts.js";
import { HERD_REASON } from "../lib/herdCount.js";
import PageBoard, { Block } from "../components/board/PageBoard.jsx";
import Card from "../components/ui/Card.jsx";
import StatTile from "../components/ui/StatTile.jsx";
import DataSourceNote from "../components/ui/DataSourceNote.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import Icon from "../components/ui/Icon.jsx";
import {
  barns,
  herdSummary,
  mortalityEvents,
  mortalityRate,
} from "../data/mock/herd.js";
import {
  SERIES,
  gridProps,
  axisProps,
  tooltipStyle,
  CHART_HEIGHT,
} from "../lib/chartTheme.js";
import AdjustModal from "../components/adjust/AdjustModal.jsx";
import { useAdjust, targetKey } from "../lib/adjust/useAdjust.js";
import { formatNumber, formatNumber1, formatDateShort, formatMonth } from "../lib/format.js";
import { useT } from "../lib/i18n/useT.js";
import "./Herd.css";

const barnName = (id) => barns.find((b) => b.id === id)?.name ?? id;

/** ความหนาแน่นเกิน 95% ของความจุ = แน่นเกินไป ต้องเตือน (ต่ำกว่านั้นไม่ใช่ "สถานะ" อะไร) */
const CROWDED_PCT = 95;

const lastRate = mortalityRate.at(-1);

/** รหัสกระดานของหน้านี้ — คีย์ที่ใช้เก็บชุดเลย์เอาต์ (ดู lib/layout/presets.js) */
const BOARD_ID = "herd";

export default function Herd() {
  const t = useT();
  /* ฟาร์มที่มีแถวอยู่ในฐาน (มี apiId) — ฟาร์มตัวอย่างไม่มีบันทึกให้นับ */
  const { farms: allFarms } = useAllFarms();
  const realHerd = useHerdCounts(allFarms.filter((f) => f.apiId));
  /* โรงเรือนที่กำลังเปิดป๊อบอัพปรับจำนวน (null = ปิด) */
  const [adjusting, setAdjusting] = useState(null);
  /* จำนวนที่แสดง = ค่าตั้งต้น + ส่วนต่างที่ผู้ใช้ปรับ (ชุดเดียวกับหน้าโรงเรือนในฟาร์ม) */
  const { valueOf, netOf, canWrite } = useAdjust();
  const countOf = (barn) => valueOf(targetKey("barn", barn.id), barn.count);
  /* ยอดรวมต้องมาจากโรงเรือนที่โชว์อยู่ข้างล่างนี้เอง ไม่ใช่เลขนิ่ง ๆ ใน mock —
     ไม่งั้นปรับจำนวนโรงเรือนแล้วกล่องบนสุดยังบอกเลขเดิม ขัดกันเองในหน้าเดียว */
  const totalPigs = barns.reduce((sum, b) => sum + countOf(b), 0);
  const totalNet = totalPigs - herdSummary.total;

  return (
    <>
      <PageHeader
        title={t("ฝูงสุกร")}
        subtitle={t("ข้อมูล ณ {date}", { date: formatDateShort(herdSummary.updatedAt) })}
      />

      {/* ทั้งหน้านี้ยังเป็นข้อมูลตัวอย่าง — ต้องบอกก่อนที่คนจะอ่านตัวเลข

          ไม่งั้นตัวเลขอย่าง "กำไรเดือนล่าสุด" จะถูกเอาไปใช้จริง (T1.283) */}

      <DataSourceNote source="demo" />


      <PageBoard boardId={BOARD_ID}>
        {/* ═══ จำนวนจริงจากบันทึกของคนหน้าฟาร์ม (T1.321) ═══
            อยู่บนสุดเพราะเป็นของจริงชิ้นเดียวในหน้านี้ ที่เหลือเป็นข้อมูลตัวอย่าง */}
        <Block id="real" label={t("จำนวนสุกรจริงจากบันทึก")}>
          <Card>
            <h3 className="hd-real-title">
              {t("จำนวนสุกรจริงจากบันทึก")}
              <StatusBadge tone={realHerd.total?.complete ? "good" : "offline"}>
                {t("ข้อมูลจริง")}
              </StatusBadge>
            </h3>

            {realHerd.status === "loading" && <p className="hd-real-note">{t("กำลังโหลด…")}</p>}

            {realHerd.status === "error" && (
              <p className="hd-real-note">{t("ดึงข้อมูลไม่สำเร็จ — {why}", { why: realHerd.error })}</p>
            )}

            {realHerd.status === "idle" && (
              <p className="hd-real-note">
                {t("ต้องเข้าสู่ระบบก่อนจึงจะเห็นจำนวนจริงของฟาร์มที่มีอยู่ในระบบ")}
              </p>
            )}

            {realHerd.status === "ready" && (
              <>
                {realHerd.farms.map(({ farm, byBarn, count, unknownBarns }) => (
                  <div className="hd-real-farm" key={farm.id}>
                    <p className="hd-real-farm-name">{t(farm.name)}</p>
                    <ul className="hd-real-list">
                      {Object.entries(byBarn).map(([code, r]) => (
                        <li key={code}>
                          <b>{t("โรงเรือน {code}", { code })}</b>
                          {r.confident ? (
                            <span className="num">
                              {formatNumber(r.count)} {t("ตัว")}
                            </span>
                          ) : (
                            /* ★ ขีดกลางเฉย ๆ อ่านว่า "ไม่มีเล้านี้" จึงต้องบอกเหตุและทางแก้
                               และห้ามขึ้น 0 เพราะ 0 อ่านว่า "เล้าว่าง" ซึ่งไม่จริง */
                            <span className="hd-real-why">{t(HERD_REASON[r.reason] ?? "ยังสรุปไม่ได้")}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="hd-real-sum">
                      {unknownBarns > 0
                        ? t("รวมที่นับได้ {count} ตัว · ยังไม่รู้อีก {n} โรงเรือน", {
                            count: formatNumber(count),
                            n: formatNumber(unknownBarns),
                          })
                        : t("รวม {count} ตัว", { count: formatNumber(count) })}
                    </p>
                  </div>
                ))}

                {realHerd.farms.length === 0 && (
                  <p className="hd-real-note">{t("ยังไม่มีฟาร์มที่มีข้อมูลจริงในระบบ")}</p>
                )}
              </>
            )}

            <p className="hd-real-foot">
              {t("นับจาก ย้ายเข้า − ย้ายออก − ตาย − ขาดหาย ของบันทึกในโรงเรือน — บันทึกเพิ่มได้ที่หน้าโรงเรือน")}
            </p>
          </Card>
        </Block>

        <Block id="total" label={t("สุกรทั้งหมด")}>
          <StatTile
            source="demo"
            label={t("สุกรทั้งหมด")}
            value={formatNumber(totalPigs)}
            unit={t("ตัว")}
            delta={{
              text:
                totalNet === 0
                  ? t("กระจายใน {n} โรงเรือน", { n: barns.length })
                  : t("กระจายใน {n} โรงเรือน · ปรับเอง {delta} ตัว", {
                      n: barns.length,
                      delta: `${totalNet > 0 ? "+" : "−"}${formatNumber(Math.abs(totalNet))}`,
                    }),
              tone: "neutral",
            }}
          />
        </Block>

        <Block id="sows" label={t("แม่พันธุ์")}>
          <StatTile
            source="demo"
            label={t("แม่พันธุ์")}
            value={formatNumber(herdSummary.sows)}
            unit={t("ตัว")}
            delta={{
              text: t("พ่อพันธุ์อีก {n} ตัว", { n: formatNumber(herdSummary.boars) }),
              tone: "neutral",
            }}
          />
        </Block>

        <Block id="nursery" label={t("อนุบาล")}>
          <StatTile
            source="demo"
            label={t("อนุบาล")}
            value={formatNumber(herdSummary.nursery)}
            unit={t("ตัว")}
            delta={{
              text: t("ลูกสุกรดูดนม {n} ตัว", { n: formatNumber(herdSummary.piglets) }),
              tone: "neutral",
            }}
          />
        </Block>

        <Block id="fatteners" label={t("สุกรขุน")}>
          <StatTile
            source="demo"
            label={t("สุกรขุน")}
            value={formatNumber(herdSummary.fatteners)}
            unit={t("ตัว")}
            delta={{
              text: t("คิดเป็น {pct}% ของฝูง", {
                pct: formatNumber1((herdSummary.fatteners / herdSummary.total) * 100),
              }),
              tone: "neutral",
            }}
          />
        </Block>

        {/* ---------- ประชากรตามโรงเรือน ---------- */}
        <Block id="barns" label={t("ประชากรตามโรงเรือน")}>
          <Card
            title={t("ประชากรตามโรงเรือน")}
            subtitle={t("แท่งจางคือความจุ แท่งเข้มคือจำนวนจริง — ตัวเลขท้ายแถวคือความหนาแน่น")}
            icon="home"
          >
            <ul className="hd-bars">
              {barns.map((barn) => {
                const count = countOf(barn);
                const pct = (count / barn.capacity) * 100;
                return (
                  <li key={barn.id} className="hd-bar">
                    <span className="hd-bar-name">
                      <b>{t(barn.name)}</b>
                      <span>{t(barn.stage)}</span>
                    </span>

                    <span className="hd-bar-track">
                      <span
                        className="hd-bar-fill"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                      <span className="hd-bar-value num">
                        {t("{count} / {capacity} ตัว", {
                          count: formatNumber(count),
                          capacity: formatNumber(barn.capacity),
                        })}
                      </span>
                    </span>

                    {/* ตัวเลขความหนาแน่นไม่ใช่ "สถานะ" จึงเป็นชิปธรรมดา
                        ป้ายสถานะจะโผล่เฉพาะตอนแน่นเกินเกณฑ์เท่านั้น */}
                    <span className="hd-bar-pct">
                      {pct >= CROWDED_PCT ? (
                        <StatusBadge tone="warning">{t("แน่นเกินไป")}</StatusBadge>
                      ) : (
                        <span className="hd-bar-chip num">{formatNumber1(pct)}%</span>
                      )}
                      {netOf(targetKey("barn", barn.id)) !== 0 && (
                        <span className="aj-net num">
                          {netOf(targetKey("barn", barn.id)) > 0 ? "+" : "−"}
                          {formatNumber(Math.abs(netOf(targetKey("barn", barn.id))))}
                        </span>
                      )}
                      <button
                        type="button"
                        className="aj-open"
                        onClick={() => setAdjusting(barn)}
                        aria-haspopup="dialog"
                      >
                        <Icon name={canWrite ? "plus" : "lock"} size={16} />
                        {canWrite ? t("ปรับจำนวน") : t("ดูประวัติ")}
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </Block>

        {/* ---------- เหตุการณ์สูญเสียล่าสุด ---------- */}
        <Block id="events" label={t("เหตุการณ์สูญเสียล่าสุด")}>
          <Card
            title={t("เหตุการณ์สูญเสียล่าสุด")}
            subtitle={t("เรียงจากใหม่ไปเก่า")}
            icon="warn"
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("วันที่")}</th>
                    <th>{t("โรงเรือน|หัวตาราง")}</th>
                    <th className="num">{t("จำนวน")}</th>
                    <th>{t("สาเหตุ")}</th>
                  </tr>
                </thead>
                <tbody>
                  {mortalityEvents.map((event) => (
                    <tr key={event.date + event.barnId}>
                      <td>{formatDateShort(event.date)}</td>
                      <td>{t(barnName(event.barnId))}</td>
                      <td className="num">{formatNumber(event.count)}</td>
                      <td>{t(event.cause)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="hd-note">
              <Icon name="clock" size={16} />
              {t("รวม {pigs} ตัว จาก {events} เหตุการณ์", {
                pigs: formatNumber(mortalityEvents.reduce((sum, e) => sum + e.count, 0)),
                events: formatNumber(mortalityEvents.length),
              })}
            </p>
          </Card>
        </Block>

        {/* ---------- อัตราตายรายเดือน ---------- */}
        <Block id="mortality" label={t("อัตราตายรายเดือน")}>
          <Card
            title={t("อัตราตายรายเดือน")}
            subtitle={t("เดือนล่าสุด {rate}% · เป้าหมายไม่เกิน {target}%", {
              rate: formatNumber1(lastRate.rate),
              target: formatNumber1(lastRate.target),
            })}
            icon="pulse"
          >
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart data={mortalityRate} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="month" {...axisProps} tickFormatter={formatMonth} />
                <YAxis {...axisProps} width={48} unit="%" />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value) => [`${formatNumber1(value)}%`, t("อัตราตาย")]}
                  labelFormatter={formatMonth}
                />
                {/* เส้นเป้าหมายเป็นเส้นประสีหมึกจาง ไม่ใช่สีสถานะ — สถานะบอกด้วยป้ายด้านล่างแทน */}
                <ReferenceLine
                  y={lastRate.target}
                  stroke="var(--ink-muted)"
                  strokeDasharray="5 5"
                  label={{
                    value: t("เป้า {n}%", { n: formatNumber1(lastRate.target) }),
                    position: "insideTopRight",
                    fill: "var(--ink-muted)",
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="rate" name={t("อัตราตาย")} fill={SERIES[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            <p className="hd-note">
              <StatusBadge tone={lastRate.rate <= lastRate.target ? "good" : "warning"}>
                {lastRate.rate <= lastRate.target ? t("อยู่ในเป้าหมาย") : t("เกินเป้าหมาย")}
              </StatusBadge>
              {t("เดือน {month}", { month: formatMonth(lastRate.month) })}
            </p>
          </Card>
        </Block>
      </PageBoard>

      {/* ป๊อบอัพปรับจำนวนสุกรของโรงเรือนที่กดมา (ใบเดียวใช้ร่วมทุกแถว) */}
      <AdjustModal
        open={adjusting !== null}
        onClose={() => setAdjusting(null)}
        target={adjusting ? targetKey("barn", adjusting.id) : ""}
        title={adjusting ? t(adjusting.name) : ""}
        subtitle={adjusting ? t(adjusting.stage) : ""}
        base={adjusting?.count ?? 0}
        max={adjusting?.capacity ?? null}
        inSystem={Boolean(adjusting?.apiId)}
      />
    </>
  );
}
