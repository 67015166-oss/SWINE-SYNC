/**
 * กล่อง "แบบจำลองที่ทดลองได้" — ชั้นที่ 3 (T1.262)
 *
 * สองโหมด:
 *   · 24 ชม. ข้างหน้า   เริ่มจากค่าในเล้าล่าสุด ขับด้วยแดด/อากาศที่ Open-Meteo พยากรณ์
 *   · วันที่ร้อนที่สุด   เล่นซ้ำวันที่ในเล้าร้อนสุดในข้อมูล เทียบของจริงกับที่แบบจำลองคาด
 * แล้วลองปรับตัวเลื่อนดูว่าผลเปลี่ยนยังไง — คำนวณในเบราว์เซอร์ทันทีที่ลาก (lib/twin/simulate.js)
 *
 * **มีตัวเลื่อนเฉพาะสิ่งที่แบบจำลองเรียนจากข้อมูลจริงแล้ว** (แดด · อุณหภูมิประจำของเล้า)
 * ไม่ทำตัวเลื่อนพัดลม จำนวนสุกร หรืออากาศนอก — ทำได้ง่าย แต่ตัวเลขที่ออกมาจะเป็นการแต่งขึ้น
 * การ์ดเขียนบอกข้อจำกัดนี้ไว้ตรง ๆ
 */
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import StatusBadge from "../ui/StatusBadge.jsx";
import ChartLegend from "../ui/ChartLegend.jsx";
import Icon from "../ui/Icon.jsx";
import { useT } from "../../lib/i18n/useT.js";
import { formatDateShort, formatNumber, formatNumber1, formatTime } from "../../lib/format.js";
import {
  axisProps,
  comfortBandProps,
  evenTicks,
  gridProps,
  hourTicks,
  paddedDomain,
  tooltipStyle,
  TWIN_COLORS,
} from "../../lib/chartTheme.js";
import { simulateTwin, summarize } from "../../lib/twin/simulate.js";
import "./twin.css";

const CHART_H = 240;
const iso = (sec) => new Date(sec * 1000).toISOString();

function durationText(t, minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return t("{m} นาที", { m: formatNumber(m) });
  if (m === 0) return t("{h} ชม.", { h: formatNumber(h) });
  return t("{h} ชม. {m} นาที", { h: formatNumber(h), m: formatNumber(m) });
}

/** หนึ่งบรรทัดสรุปของหนึ่งเส้น — สูงสุดเมื่อไหร่ · เกินเพดานนานแค่ไหน */
function SummaryRow({ name, color, dashed, summary, limit, uncertainty }) {
  const t = useT();
  const over = summary.overMinutes > 0;
  /* ยอดห่างเพดานไม่เกินความคลาดเคลื่อน = บอกไม่ได้จริงว่าเกินหรือไม่เกิน ต้องพูดตรง ๆ
     (เส้นค่าจริงไม่ต้อง เพราะวัดมาแล้ว ไม่ใช่ค่าคาด) */
  const tooClose = uncertainty != null && Math.abs(summary.peak - limit) <= uncertainty;
  return (
    <li className="tl-sum">
      <span className={"tl-sum-key" + (dashed ? " is-dashed" : "")} style={{ "--line": color }} aria-hidden="true" />
      <span className="tl-sum-name">{name}</span>
      <span className="tl-sum-peak">
        {t("สูงสุด {v} °C ตอน {time}", {
          v: formatNumber1(summary.peak),
          time: formatTime(iso(summary.peakAt)),
        })}
      </span>
      <StatusBadge tone={over ? "warning" : "good"}>
        {over
          ? t("เกินเพดาน {limit} °C รวม {dur} เริ่ม {time}", {
            limit: formatNumber1(limit),
            dur: durationText(t, summary.overMinutes),
            time: formatTime(iso(summary.firstOver)),
          })
          : t("ไม่เกินเพดาน {limit} °C", { limit: formatNumber1(limit) })}
      </StatusBadge>
      {tooClose && (
        <span className="tl-sum-close">
          {t("ยอดห่างเพดานไม่เกินความคลาดเคลื่อน ±{n} °C — อาจเกินหรือไม่เกินก็ได้", {
            n: formatNumber1(uncertainty),
          })}
        </span>
      )}
    </li>
  );
}

/**
 * @param {object} data    ผลของ GET /api/barns/:id/twin/scenario
 * @param {object} comfort ช่วงที่เหมาะสมจากหน้าตั้งค่า (comfort.tempC.min/max)
 */
export default function TwinLab({ data, comfort }) {
  const t = useT();
  const [mode, setMode] = useState(data.start ? "forecast" : "hottest");
  const [sunPct, setSunPct] = useState(100);
  const [shift, setShift] = useState(0);
  const { model, stepMin } = data;
  const stepSec = stepMin * 60;
  const limit = comfort.tempC.max;
  const changed = sunPct !== 100 || shift !== 0;

  const run = useMemo(() => {
    const hottest = mode === "hottest";
    const rows = hottest ? (data.hottest?.series ?? []) : data.forecast;
    const start = hottest ? rows[0]?.actual : data.start?.actual;
    if (!rows.length || !Number.isFinite(start)) return null;
    const drivers = rows.map((r) => ({ tout: r.tout, rad: r.rad, actual: r.actual }));
    const times = rows.map((r) => r.t);
    const base = simulateTwin(model, start, drivers);
    const scen = changed
      ? simulateTwin(model, start, drivers, { sunScale: sunPct / 100, setpointShift: shift })
      : null;
    const actual = hottest ? rows.map((r) => r.actual) : null;
    return {
      hottest,
      times,
      base,
      scen,
      actual,
      chart: rows.map((r, i) => ({
        i,
        label: formatTime(iso(r.t)),
        actual: actual?.[i] ?? null,
        base: base[i],
        scen: scen?.[i] ?? null,
      })),
      sum: {
        base: summarize(base, times, limit, stepSec),
        scen: scen ? summarize(scen, times, limit, stepSec) : null,
        actual: actual ? summarize(actual, times, limit, stepSec) : null,
      },
    };
  }, [mode, data, model, changed, sunPct, shift, limit, stepSec]);

  /* ขีดต้องห่างเท่ากันทั้งสองแกน — ดู evenTicks / hourTicks ใน chartTheme.js */
  const yAxis = run
    ? evenTicks(
        paddedDomain(run.chart.flatMap((d) => [d.actual, d.base, d.scen]), 0.6, { band: comfort.tempC }),
      )
    : null;
  const xTicks = run ? hourTicks(run.times) : undefined;

  const names = {
    actual: t("วัดได้จริงวันนั้น"),
    base: mode === "hottest" ? t("แบบจำลองคาด (ไม่ปรับอะไร)") : t("แบบจำลองคาดตามพยากรณ์อากาศ"),
    scen: t("ตามที่ปรับตัวเลื่อน"),
  };

  return (
    <div className="tl">
      <div className="tl-modes" role="group" aria-label={t("เลือกสถานการณ์")}>
        <button
          type="button"
          className={"tl-mode" + (mode === "forecast" ? " is-on" : "")}
          aria-pressed={mode === "forecast"}
          disabled={!data.start}
          onClick={() => setMode("forecast")}
        >
          <Icon name="clock" size={16} aria-hidden="true" />
          {t("24 ชม. ข้างหน้า")}
        </button>
        {data.hottest && (
          <button
            type="button"
            className={"tl-mode" + (mode === "hottest" ? " is-on" : "")}
            aria-pressed={mode === "hottest"}
            onClick={() => setMode("hottest")}
          >
            <Icon name="sun" size={16} aria-hidden="true" />
            {t("เล่นซ้ำวันที่ร้อนที่สุด ({date})", { date: formatDateShort(iso(data.hottest.series[0].t)) })}
          </button>
        )}
      </div>

      {mode === "forecast" && data.start?.ageMin > 60 && (
        <p className="tw-stuck">
          <Icon name="warn" size={16} aria-hidden="true" />
          {t("จุดเริ่มคือค่าในเล้าเมื่อ {n} นาทีก่อน — ช่วงต้นของเส้นอาจไม่ตรงกับตอนนี้", {
            n: formatNumber(data.start.ageMin),
          })}
        </p>
      )}

      <div className="tl-controls">
        <label className="tl-slider" htmlFor="tw-lab-sun">
          <span className="tl-slider-head">
            <span>{mode === "hottest" ? t("แดดเทียบกับวันนั้น") : t("แดดเทียบกับที่พยากรณ์")}</span>
            <b>{`${formatNumber(sunPct)}%`}</b>
          </span>
          <input
            id="tw-lab-sun"
            type="range"
            min="0"
            max="150"
            step="10"
            value={sunPct}
            onChange={(e) => setSunPct(Number(e.target.value))}
          />
          <span className="tl-slider-scale">
            <span>{t("มืดครึ้มทั้งวัน")}</span>
            <span>{t("แดดจัดขึ้นครึ่งหนึ่ง")}</span>
          </span>
        </label>

        <label className="tl-slider" htmlFor="tw-lab-base">
          <span className="tl-slider-head">
            <span>{t("อุณหภูมิประจำที่เล้าดึงกลับหา")}</span>
            <b>{`${formatNumber1(model.setpoint + shift)} °C`}</b>
          </span>
          <input
            id="tw-lab-base"
            type="range"
            min="-3"
            max="3"
            step="0.5"
            value={shift}
            onChange={(e) => setShift(Number(e.target.value))}
          />
          <span className="tl-slider-scale">
            <span>{t("ทำความเย็นแรงขึ้น")}</span>
            <span>{t("ทำความเย็นเบาลง")}</span>
          </span>
        </label>

        <button
          type="button"
          className="tl-reset"
          disabled={!changed}
          onClick={() => {
            setSunPct(100);
            setShift(0);
          }}
        >
          {t("กลับค่าเดิม")}
        </button>
      </div>

      {!run ? (
        <p className="tw-empty">{t("ยังไม่มีข้อมูลพอให้จำลองสถานการณ์นี้")}</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={CHART_H}>
            <LineChart data={run.chart} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
              <CartesianGrid {...gridProps} />
              <ReferenceArea y1={comfort.tempC.min} y2={comfort.tempC.max} {...comfortBandProps} />
              <XAxis
                dataKey="i"
                type="number"
                domain={[0, Math.max(run.chart.length - 1, 0)]}
                ticks={xTicks}
                interval="equidistantPreserveStart"
                tickFormatter={(i) => run.chart[i]?.label ?? ""}
                minTickGap={36}
                {...axisProps}
              />
              <YAxis
                domain={yAxis.domain}
                ticks={yAxis.ticks}
                interval={0}
                tickFormatter={(v) => formatNumber1(v)}
                {...axisProps}
              />
              <Tooltip
                {...tooltipStyle}
                labelFormatter={(i) => run.chart[i]?.label ?? ""}
                formatter={(v, key) => [v == null ? t("ไม่มีค่า") : `${formatNumber1(v)} °C`, names[key]]}
              />
              {run.hottest && (
                <Line type="monotone" dataKey="actual" name="actual" stroke={TWIN_COLORS.actual} strokeWidth={2.5} dot={false} />
              )}
              <Line
                type="monotone"
                dataKey="base"
                name="base"
                stroke={TWIN_COLORS.twin}
                strokeWidth={2.5}
                strokeDasharray="6 5"
                dot={false}
              />
              {run.scen && (
                <Line type="monotone" dataKey="scen" name="scen" stroke={TWIN_COLORS.scenario} strokeWidth={2.5} dot={false} />
              )}
            </LineChart>
          </ResponsiveContainer>
          <ChartLegend
            items={[
              ...(run.hottest ? [{ label: names.actual, color: TWIN_COLORS.actual }] : []),
              { label: names.base, color: TWIN_COLORS.twin },
              ...(run.scen ? [{ label: names.scen, color: TWIN_COLORS.scenario }] : []),
              { label: t("ช่วงที่เหมาะสม"), color: "var(--status-good)" },
            ]}
          />

          <ul className="tl-sums">
            {run.sum.actual && (
              <SummaryRow name={names.actual} color={TWIN_COLORS.actual} summary={run.sum.actual} limit={limit} />
            )}
            <SummaryRow
              name={names.base}
              color={TWIN_COLORS.twin}
              dashed
              summary={run.sum.base}
              limit={limit}
              uncertainty={data.accuracy.all}
            />
            {run.sum.scen && (
              <SummaryRow
                name={names.scen}
                color={TWIN_COLORS.scenario}
                summary={run.sum.scen}
                limit={limit}
                uncertainty={data.accuracy.all}
              />
            )}
          </ul>

          {run.hottest && run.sum.actual.peak - run.sum.base.peak > 2 * data.accuracy.h3 && (
            <p className="tm-note">
              {t("วันนั้นของจริงร้อนสุดสูงกว่าที่แบบจำลองคาดไว้ {n} °C ซึ่งเกินกว่าที่แบบจำลองเคยพลาดมาก — แปลว่าวันนั้นมีบางอย่างที่แบบจำลองไม่รู้ เช่นระบบทำความเย็นทำงานไม่เต็มที่ หรือมีภาระความร้อนอื่น ควรย้อนดูบันทึกของวันนั้น", {
                n: formatNumber1(run.sum.actual.peak - run.sum.base.peak),
              })}
            </p>
          )}
        </>
      )}

      <div className="tm-trust">
        <p>
          <Icon name="warn" size={16} aria-hidden="true" />
          {t("ทดลองได้เฉพาะสิ่งที่แบบจำลองเรียนจากข้อมูลจริงแล้ว คือแดดกับอุณหภูมิประจำของเล้า · ยังจำลองพัดลมเสีย จำนวนสุกร และอากาศนอกร้อนขึ้นไม่ได้ เพราะข้อมูลยังไม่พอให้เรียน")}
        </p>
        <p>
          <Icon name="check" size={16} aria-hidden="true" />
          {t("ความคลาดเคลื่อนที่วัดได้ ±{h3} °C ในช่วง 3 ชม. แรก และราว ±{all} °C ตลอดช่วงยาว · เกินกว่านั้นยังไม่ได้วัดอย่างเป็นทางการ", {
            h3: formatNumber1(data.accuracy.h3),
            all: formatNumber1(data.accuracy.all),
          })}
        </p>
        <p>
          <Icon name="cloud" size={16} aria-hidden="true" />
          {t("\"อุณหภูมิประจำ\" คือจุดที่เล้าดึงกลับหา ไม่ใช่ค่าที่ตั้งบนตู้ควบคุม — ยังไม่รู้ว่าต้องปรับอะไรจริงถึงจะได้ค่านั้น")}
        </p>
      </div>
    </div>
  );
}
