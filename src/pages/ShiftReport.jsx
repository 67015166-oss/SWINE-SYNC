/**
 * รายงานส่งเวร (T1.268) — สรุปหนึ่งกะของโรงเรือนหนึ่งหลังในหน้าเดียว พิมพ์หรือบันทึกเป็น PDF ได้
 *
 * ปัญหาที่แก้: การส่งเวรพึ่งความจำ กะดึกเจออะไรตอนเช้าก็บอกต่อไม่ครบ และไม่มีใครเห็น "งานที่ยังไม่จบ"
 * หน้านี้เรียงตามสิ่งที่กะถัดไปต้องรู้: ตัวเลขสรุป → **งานค้าง** → สภาพแวดล้อม → เหตุในกะ → ไฟ → รับเวร
 *
 * v1 ข้อมูลเครื่อง (18 ก.ย. 2569) · v2 + บันทึกของคนจากหน้าโรงเรือน (T1.269)
 * กล่อง "รายงานนี้ยังไม่มีอะไร" ต้องอยู่ในหน้าเสมอ รวมถึงตอนพิมพ์ — บันทึกที่ค้างในเครื่องใครสักคนยังไม่เข้ารายงาน
 *
 * กะที่ดูเก็บใน URL (?barn=&shift=) ส่งลิงก์ให้กันแล้วเปิดเจอกะเดียวกัน
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader.jsx";
import PageBoard, { Block } from "../components/board/PageBoard.jsx";
import Card from "../components/ui/Card.jsx";
import StatTile from "../components/ui/StatTile.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import AdminNote from "../components/ui/AdminNote.jsx";
import Icon from "../components/ui/Icon.jsx";
import ReportChart from "../components/report/ReportChart.jsx";
import { useReportBarns, useShiftReport, receiveShift } from "../lib/api/useShiftReport.js";
import {
  hasEnded,
  lastEndedShift,
  nextShift,
  previousShift,
  shiftAt,
  shiftFromKey,
  shiftKey,
} from "../lib/report/shifts.js";
import { alertText, alertTitle } from "../lib/api/alertText.js";
import { LOG_TYPES } from "../lib/barnLogTypes.js";
import { useAuth } from "../lib/auth/useAuth.js";
import { formatDateShort, formatDateTime, formatNumber, formatNumber1, formatTime } from "../lib/format.js";
import { useT } from "../lib/i18n/useT.js";
import { durationText } from "../lib/duration.js";
import "./ShiftReport.css";

const BOARD_ID = "shift";

/** ชื่อค่าที่วัด + หน่วย — ลำดับตามที่หลังบ้านเรียงมา */
const METRIC = {
  temp_c: { name: "อุณหภูมิ", unit: "°C", digits: 1 },
  humidity: { name: "ความชื้น", unit: "%", digits: 0 },
  nh3: { name: "แอมโมเนีย", unit: "ppm", digits: 1 },
  wind_ms: { name: "ความเร็วลม", unit: "m/s", digits: 1 },
};

const fmtValue = (metric, v) =>
  v == null ? "—" : (METRIC[metric]?.digits === 0 ? formatNumber(Math.round(v)) : formatNumber1(v));

const iso = (ms) => new Date(ms).toISOString();


/** "กะดึก · 17 ก.ย. 19:00 น. – 18 ก.ย. 07:00 น." */
function shiftLabel(t, shift) {
  return t("{shift} · {from} – {to}", {
    shift: t(shift.label),
    from: `${formatDateShort(iso(shift.from))} ${formatTime(iso(shift.from))}`,
    to: `${formatDateShort(iso(shift.to))} ${formatTime(iso(shift.to))}`,
  });
}

/** ความครบของข้อมูล → โทนป้าย — ข้อมูลน้อยแปลว่า "ไม่รู้" จึงเป็นเทา ไม่ใช่แดง (DESIGN.md) */
const coverageTone = (ratio) => (ratio >= 0.9 ? "good" : ratio >= 0.5 ? "warning" : "offline");

const levelTone = (level) => (level === "warning" ? "warning" : level);

/** นาฬิกาที่เดินทุกนาที — กะที่กำลังเดินต้องรู้ว่าตอนนี้กี่โมงโดยไม่เรียก Date.now() ระหว่าง render */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export default function ShiftReport() {
  const t = useT();
  const { can } = useAuth();
  const now = useMinuteClock();
  const [params, setParams] = useSearchParams();
  const barnsState = useReportBarns();

  const shift = useMemo(
    () => shiftFromKey(params.get("shift"), now) ?? lastEndedShift(now),
    [params, now],
  );
  const ended = hasEnded(shift, now);
  const barn = barnsState.barns.find((b) => b.id === params.get("barn")) ?? barnsState.barns[0] ?? null;
  const report = useShiftReport(barn?.id, shift, !ended);
  const data = report.data;

  const [chartMetric, setChartMetric] = useState("temp_c");

  const go = (next) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next.shift) p.set("shift", shiftKey(next.shift));
        if (next.barn) p.set("barn", next.barn);
        return p;
      },
      { replace: true },
    );

  const later = nextShift(shift);
  const canGoLater = later.from <= now;
  const current = shiftAt(now);
  const latest = lastEndedShift(now);

  const header = (
    <PageHeader
      title={t("รายงานส่งเวร")}
      subtitle={t("สรุปหนึ่งกะในหน้าเดียว — สภาพแวดล้อม เหตุที่เกิด งานค้าง และการรับเวร")}
      action={
        <button type="button" className="sr-btn sr-print" onClick={() => window.print()} disabled={!data}>
          <Icon name="list" size={18} aria-hidden="true" />
          {t("พิมพ์ / บันทึกเป็น PDF")}
        </button>
      }
    />
  );

  /* ---------- ยังต่อข้อมูลไม่ได้ ---------- */
  if (!barn) {
    const message =
      barnsState.status === "loading"
        ? t("กำลังต่อกับหลังบ้าน…")
        : barnsState.status === "unauthorized"
          ? t("ต้องเข้าสู่ระบบก่อนจึงจะดูรายงานได้")
          : barnsState.status === "error"
            ? t("ต่อกับหลังบ้านไม่ได้ — {reason}", { reason: barnsState.error ?? "" })
            : t("ยังไม่มีโรงเรือนที่ส่งค่าเข้ามา");
    return (
      <>
        {header}
        <PageBoard boardId={BOARD_ID}>
          <Block id="pick" label={t("เลือกกะ")}>
            <Card title={t("ยังไม่มีรายงานให้ดู")} icon="clock">
              <p className="sr-empty">{message}</p>
            </Card>
          </Block>
        </PageBoard>
      </>
    );
  }

  const temp = data?.metrics.find((m) => m.metric === "temp_c") ?? null;
  const tempOut = temp?.outside ? temp.outside.high + temp.outside.low : null;
  const during = data?.alerts.during ?? [];
  const pending = data?.alerts.pending ?? [];
  const coverage = data?.coverage ?? null;
  const until = Math.min(shift.to, now);
  const charted = data?.metrics.find((m) => m.metric === chartMetric) ?? data?.metrics[0] ?? null;

  return (
    <>
      {header}

      {/* หัวรายงานสำหรับตอนพิมพ์ — บนจอมีหัวหน้าและตัวเลือกกะบอกอยู่แล้ว */}
      <div className="sr-print-head" aria-hidden="true">
        <b>{t("รายงานส่งเวร")} · {t(barn.name)} · {t(barn.farmName)}</b>
        <span>{shiftLabel(t, shift)}</span>
        {data && <span>{t("ออกรายงานเมื่อ {at}", { at: formatDateTime(data.generatedAt) })}</span>}
      </div>

      <PageBoard boardId={BOARD_ID}>
        {/* ---------- เลือกกะ ---------- */}
        <Block id="pick" label={t("เลือกกะ")}>
          <Card title={shiftLabel(t, shift)} subtitle={`${t(barn.name)} · ${t(barn.farmName)}`} icon="clock">
            <div className="sr-pick">
              <div className="sr-nav" role="group" aria-label={t("เลือกกะ")}>
                <button type="button" className="sr-btn" onClick={() => go({ shift: previousShift(shift) })}>
                  <Icon name="chevrons-left" size={18} aria-hidden="true" />
                  {t("กะก่อนหน้า")}
                </button>
                <button
                  type="button"
                  className={"sr-btn" + (shift.from === latest.from ? " is-on" : "")}
                  onClick={() => go({ shift: latest })}
                >
                  {t("กะที่เพิ่งจบ")}
                </button>
                <button
                  type="button"
                  className={"sr-btn" + (shift.from === current.from ? " is-on" : "")}
                  onClick={() => go({ shift: current })}
                >
                  {t("กะนี้ (ยังไม่จบ)")}
                </button>
                <button
                  type="button"
                  className="sr-btn"
                  onClick={() => go({ shift: later })}
                  disabled={!canGoLater}
                >
                  {t("กะถัดไป")}
                  <Icon name="chevrons-right" size={18} aria-hidden="true" />
                </button>
              </div>

              {barnsState.barns.length > 1 && (
                <div className="sr-nav" role="group" aria-label={t("เลือกโรงเรือน")}>
                  {barnsState.barns.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className={"sr-btn" + (b.id === barn.id ? " is-on" : "")}
                      onClick={() => go({ barn: b.id })}
                    >
                      {t(b.name)}
                    </button>
                  ))}
                </div>
              )}

              <div className="sr-state">
                {!ended && <StatusBadge tone="warning">{t("กะนี้ยังไม่จบ — ตัวเลขนับถึงตอนนี้")}</StatusBadge>}
                {coverage && (
                  <StatusBadge tone={coverageTone(coverage.ratio)}>
                    {t("ข้อมูลครบ {pct}% ของกะ", { pct: formatNumber(Math.round(coverage.ratio * 100)) })}
                  </StatusBadge>
                )}
                {report.status === "loading" && <span className="sr-muted">{t("กำลังโหลดรายงาน…")}</span>}
                {report.status === "unauthorized" && (
                  <span className="sr-muted">{t("ต้องเข้าสู่ระบบก่อนจึงจะดูรายงานได้")}</span>
                )}
                {report.status === "error" && (
                  <span className="sr-muted">{t("โหลดรายงานไม่สำเร็จ — {reason}", { reason: report.error ?? "" })}</span>
                )}
              </div>
            </div>
          </Card>
        </Block>

        {/* ---------- ตัวเลขสรุป ---------- */}
        <Block id="peak" label={t("อุณหภูมิในเล้าสูงสุด")}>
          <StatTile
            variant="row"
            label={t("อุณหภูมิในเล้าสูงสุด")}
            value={temp ? formatNumber1(temp.max) : "—"}
            unit="°C"
            foot={temp ? { icon: "clock", text: t("เมื่อ {time}", { time: formatTime(temp.maxAt) }) } : undefined}
          />
        </Block>
        <Block id="outside" label={t("อุณหภูมินอกเกณฑ์")}>
          <StatTile
            variant="row"
            label={t("อุณหภูมินอกเกณฑ์")}
            value={tempOut == null ? "—" : formatNumber(tempOut)}
            unit={t("นาที")}
            foot={
              temp?.limits
                ? {
                    icon: "thermometer",
                    text: t("เกณฑ์ {min}–{max} °C", {
                      min: formatNumber1(temp.limits.min),
                      max: formatNumber1(temp.limits.max),
                    }),
                    tone: tempOut > 0 ? "critical" : undefined,
                  }
                : undefined
            }
          />
        </Block>
        <Block id="events" label={t("เหตุที่เกิดในกะ")}>
          <StatTile
            variant="row"
            label={t("เหตุที่เกิดในกะ")}
            value={data ? formatNumber(during.length) : "—"}
            unit={t("เรื่อง")}
          />
        </Block>
        <Block id="pendingCount" label={t("งานค้างส่งต่อ")}>
          <StatTile
            variant="row"
            label={t("งานค้างส่งต่อ")}
            value={data ? formatNumber(pending.length) : "—"}
            unit={t("เรื่อง")}
            foot={pending.length > 0 ? { icon: "warn", text: t("ต้องมีคนรับต่อ"), tone: "critical" } : undefined}
          />
        </Block>

        {/* ---------- งานค้าง — ส่วนที่สำคัญที่สุด ---------- */}
        <Block id="pending" label={t("งานค้างส่งต่อกะถัดไป")}>
          <Card
            title={t("งานค้างส่งต่อกะถัดไป")}
            subtitle={
              ended
                ? t("เหตุที่ยังไม่ปิดตอนจบกะ — รวมเรื่องที่ค้างมาจากกะก่อน ๆ")
                : t("เหตุที่ยังไม่ปิดตอนนี้ — รวมเรื่องที่ค้างมาจากกะก่อน ๆ")
            }
            icon="warn"
          >
            {!data ? (
              <p className="sr-empty">{t("กำลังโหลดรายงาน…")}</p>
            ) : pending.length === 0 ? (
              <p className="sr-empty">{t("ไม่มีงานค้าง — ทุกเหตุปิดแล้วก่อนจบกะ")}</p>
            ) : (
              <ul className="sr-list">
                {pending.map((a) => (
                  <AlertRow key={a.id} alert={a} until={until} pending />
                ))}
              </ul>
            )}
          </Card>
        </Block>

        {/* ---------- สภาพแวดล้อม ---------- */}
        <Block id="climate" label={t("สภาพแวดล้อมในเล้าตลอดกะ")}>
          <Card
            title={t("สภาพแวดล้อมในเล้าตลอดกะ")}
            subtitle={t("ค่าสูงสุด/ต่ำสุดจากค่าดิบ · เวลานอกเกณฑ์นับจากค่าเฉลี่ยทุก 5 นาที")}
            icon="thermometer"
          >
            {!data ? (
              <p className="sr-empty">{t("กำลังโหลดรายงาน…")}</p>
            ) : data.metrics.length === 0 ? (
              <p className="sr-empty">{t("กะนี้ไม่มีข้อมูลจากเซนเซอร์ในเล้าเลย")}</p>
            ) : (
              <>
                <div className="sr-table-wrap">
                  <table className="sr-table">
                    <thead>
                      <tr>
                        <th scope="col">{t("ค่าที่วัด")}</th>
                        <th scope="col">{t("ต่ำสุด")}</th>
                        <th scope="col">{t("สูงสุด")}</th>
                        <th scope="col">{t("เฉลี่ย")}</th>
                        <th scope="col">{t("เกณฑ์")}</th>
                        <th scope="col">{t("นอกเกณฑ์")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.metrics.map((m) => {
                        const info = METRIC[m.metric] ?? { name: m.metric, unit: "" };
                        const out = m.outside ? m.outside.high + m.outside.low : null;
                        return (
                          <tr key={m.metric}>
                            <th scope="row">
                              {t(info.name)} <span className="sr-muted">({info.unit})</span>
                            </th>
                            <td className="num">
                              {fmtValue(m.metric, m.min)}
                              <span className="sr-at">{formatTime(m.minAt)}</span>
                            </td>
                            <td className="num">
                              {fmtValue(m.metric, m.max)}
                              <span className="sr-at">{formatTime(m.maxAt)}</span>
                            </td>
                            <td className="num">{fmtValue(m.metric, m.avg)}</td>
                            <td className="num">
                              {m.limits
                                ? m.limits.min != null
                                  ? `${fmtValue(m.metric, m.limits.min)}–${fmtValue(m.metric, m.limits.max)}`
                                  : `≤ ${fmtValue(m.metric, m.limits.max)}`
                                : t("ไม่มีเกณฑ์")}
                            </td>
                            <td>
                              {out == null ? (
                                <span className="sr-muted">—</span>
                              ) : out === 0 ? (
                                <StatusBadge tone="good">{t("อยู่ในเกณฑ์")}</StatusBadge>
                              ) : (
                                <StatusBadge tone="serious">{durationText(t, out)}</StatusBadge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="sr-chart-head">
                  <div className="sr-nav" role="group" aria-label={t("เลือกค่าที่จะดูในกราฟ")}>
                    {data.metrics.map((m) => (
                      <button
                        key={m.metric}
                        type="button"
                        className={"sr-btn is-sm" + (charted?.metric === m.metric ? " is-on" : "")}
                        onClick={() => setChartMetric(m.metric)}
                      >
                        {t(METRIC[m.metric]?.name ?? m.metric)}
                      </button>
                    ))}
                  </div>
                </div>
                {charted && (
                  <ReportChart metric={charted} from={shift.from} until={until} bucketMin={data.bucketMin} />
                )}

                {coverage && coverage.gaps.length > 0 && (
                  <div className="sr-gaps">
                    <p className="sr-gaps-title">
                      <Icon name="wifi" size={18} aria-hidden="true" />
                      {t("ข้อมูลขาด {n} ช่วง รวม {time} — ช่วงนี้ไม่รู้ว่าในเล้าเป็นอย่างไร", {
                        n: formatNumber(coverage.gaps.length),
                        time: durationText(t, coverage.missingMinutes),
                      })}
                    </p>
                    <ul className="sr-gap-list">
                      {coverage.gaps.map((g) => (
                        <li key={g.from} className="num">
                          {formatTime(g.from)} – {formatTime(g.to)} · {durationText(t, g.minutes)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </Card>
        </Block>

        {/* ---------- เหตุในกะ ---------- */}
        <Block id="log" label={t("เหตุที่เกิดในกะ")}>
          <Card
            title={t("เหตุที่เกิดในกะ")}
            subtitle={t("เรียงตามเวลาที่เกิด · ใครรับทราบ ปิดเมื่อไหร่ ปิดเองหรือคนปิด")}
            icon="bell"
          >
            {!data ? (
              <p className="sr-empty">{t("กำลังโหลดรายงาน…")}</p>
            ) : during.length === 0 ? (
              <p className="sr-empty">{t("ไม่มีเหตุใหม่เกิดขึ้นในกะนี้")}</p>
            ) : (
              <ul className="sr-list">
                {during.map((a) => (
                  <AlertRow key={a.id} alert={a} until={until} />
                ))}
              </ul>
            )}
          </Card>
        </Block>

        {/* ---------- บันทึกของคน (T1.269) ---------- */}
        <Block id="records" label={t("บันทึกของคนในกะ")}>
          <Card
            title={t("บันทึกของคนในกะ")}
            subtitle={t("หมูตาย · ป่วย · ย้าย · ให้อาหาร · ให้ยา — จากบันทึกในหน้าโรงเรือน")}
            icon="pencil"
            action={
              data?.barn.farmCode
                ? {
                    to: `/dashboard/farms/${data.barn.farmCode}/barns/${data.barn.farmCode}-${data.barn.code}#log`,
                    label: t("ไปบันทึกที่หน้าโรงเรือน"),
                    icon: "pencil",
                  }
                : undefined
            }
          >
            {data ? <RecordsBody records={data.records} /> : <p className="sr-empty">{t("กำลังโหลดรายงาน…")}</p>}
          </Card>
        </Block>

        {/* ---------- ไฟฟ้า ---------- */}
        <Block id="energy" label={t("ไฟฟ้าที่ใช้ในกะ")}>
          <Card title={t("ไฟฟ้าที่ใช้ในกะ")} subtitle={t("จากเลขสะสมของมิเตอร์โรงเรือน")} icon="bolt">
            {data ? <EnergyBody energy={data.energy} /> : <p className="sr-empty">{t("กำลังโหลดรายงาน…")}</p>}
          </Card>
        </Block>

        {/* ---------- รับเวร ---------- */}
        <Block id="handover" label={t("รับเวร")}>
          <Card title={t("รับเวร")} subtitle={t("กะถัดไปยืนยันว่าอ่านรายงานและรับงานค้างแล้ว")} icon="check">
            <Handover
              key={`${barn.id}:${shift.from}`}
              barnId={barn.id}
              shift={shift}
              ended={ended}
              handover={data?.handover ?? null}
              loaded={Boolean(data)}
              allowed={can("record.write")}
              onDone={report.reload}
            />
          </Card>
        </Block>

        {/* ---------- ข้อจำกัด ---------- */}
        <Block id="limits" label={t("รายงานนี้ยังไม่มีอะไร")}>
          <Card title={t("รายงานนี้ยังไม่มีอะไร")} icon="eye">
            <ul className="sr-limits">
              <li>
                {t(
                  "บันทึกที่ยังค้างอยู่ในเครื่องของใครสักคน (ยังไม่กด “ย้ายขึ้นระบบกลาง” ในหน้าโรงเรือน) ไม่อยู่ในรายงาน",
                )}
              </li>
              <li>{t("ค่านอกเล้าไม่อยู่ในรายงาน — เซนเซอร์นอกเล้าส่งค่าค้างมาหลายวัน ยังเชื่อไม่ได้")}</li>
              <li>
                {t(
                  "ช่วงที่ข้อมูลขาดส่วนใหญ่เป็นกลางคืน เพราะเครื่องที่รันระบบหลับ — ค่าที่หายไปดึงย้อนหลังไม่ได้",
                )}
              </li>
            </ul>
          </Card>
        </Block>
      </PageBoard>
    </>
  );
}

/** แจ้งเตือนหนึ่งแถว — ชื่อเหตุ + เวลาเกิด/ปิด + ใครรับทราบ */
function AlertRow({ alert, until, pending = false }) {
  const t = useT();
  const text = alertText(alert);
  const opened = new Date(alert.opened_at).getTime();
  const detail = text.detailKey ? t(text.detailKey, text.detailVars) : t(text.detail ?? "");

  let closed;
  if (pending) {
    closed = t("เปิดค้างมา {time}", { time: durationText(t, (until - opened) / 60000) });
  } else if (alert.resolved_at) {
    const lasted = durationText(t, (new Date(alert.resolved_at).getTime() - opened) / 60000);
    closed = alert.auto_resolved
      ? t("ปิดเองเมื่อ {at} (นาน {time})", { at: formatTime(alert.resolved_at), time: lasted })
      : t("{who} ปิดเมื่อ {at} (นาน {time})", {
          who: alert.resolved_by_name ?? t("ไม่ทราบชื่อ"),
          at: formatTime(alert.resolved_at),
          time: lasted,
        });
  } else {
    closed = t("ยังไม่ปิด");
  }

  return (
    <li className="sr-item">
      <div className="sr-item-top">
        <StatusBadge tone={levelTone(alert.level)}>{alertTitle(t, text)}</StatusBadge>
        <span className="sr-muted num">{t("เกิด {at}", { at: formatDateTime(alert.opened_at) })}</span>
      </div>
      <p className="sr-item-detail">{detail}</p>
      <p className="sr-item-meta">
        {closed}
        {" · "}
        {alert.acked_at
          ? t("{who} รับทราบเมื่อ {at}", {
              who: alert.acked_by_name ?? t("ไม่ทราบชื่อ"),
              at: formatTime(alert.acked_at),
            })
          : t("ยังไม่มีใครรับทราบ")}
      </p>
    </li>
  );
}

/**
 * บันทึกของคนในกะ — ยอดรวมต่อประเภทก่อน (อ่านจบในบรรทัดเดียว) แล้วตามด้วยรายการเต็ม
 * `records === null` = จับคู่โรงเรือนกับบันทึกไม่ได้ ต้องบอกว่า "ไม่รู้" ไม่ใช่ "ไม่มีใครบันทึก"
 */
function RecordsBody({ records }) {
  const t = useT();
  if (records == null) {
    return <p className="sr-empty">{t("จับคู่โรงเรือนนี้กับบันทึกในหน้าโรงเรือนไม่ได้ — ไม่รู้ว่ากะนี้มีใครบันทึกอะไรบ้าง")}</p>;
  }
  if (records.length === 0) {
    return (
      <p className="sr-empty">
        {t("ไม่มีใครบันทึกในกะนี้ — ถ้ามีงานเกิดขึ้นจริงแต่ไม่ได้กรอก รายงานจะไม่รู้")}
      </p>
    );
  }
  const label = (type) => t(LOG_TYPES.find((k) => k.value === type)?.label ?? type);
  /* รวมยอดต่อ (ประเภท, หน่วย) — ประเภทเดียวกันแต่หน่วยต่างกันบวกกันไม่ได้ */
  const totals = new Map();
  for (const r of records) {
    const key = `${r.type}|${r.unit}`;
    totals.set(key, { type: r.type, unit: r.unit, sum: (totals.get(key)?.sum ?? 0) + r.amount });
  }
  return (
    <>
      <p className="sr-totals">
        {[...totals.values()].map((x, i) => (
          <span key={`${x.type}|${x.unit}`}>
            {i > 0 && " · "}
            <b>{label(x.type)}</b> <span className="num">{formatNumber(x.sum)}</span> {t(x.unit)}
          </span>
        ))}
      </p>
      <ul className="sr-list">
        {records.map((r) => (
          <li key={r.id} className="sr-item">
            <div className="sr-item-top">
              <b>{label(r.type)}</b>
              <span className="num">
                {formatNumber(r.amount)} {t(r.unit)}
              </span>
              <span className="sr-muted num">{formatDateTime(r.at)}</span>
            </div>
            {r.note && <p className="sr-item-detail">{r.note}</p>}
            {r.by && <p className="sr-item-meta">{t("บันทึกโดย {who}", { who: r.by })}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * ไฟที่ใช้ — **บอกช่วงที่มิเตอร์มีค่าจริงเสมอ** และเทียบกับเมื่อวานเฉพาะเมื่อช่วงยาวใกล้กัน
 * (ตัวอย่างจริง: คืนนี้มีค่า 8.7 ชม. เมื่อวาน 11.1 ชม. — เทียบตรง ๆ จะดูเหมือนประหยัดไฟ 30% ทั้งที่ไม่ใช่)
 */
function EnergyBody({ energy }) {
  const t = useT();
  const span = (e) =>
    e.fromAt && e.toAt ? (new Date(e.toAt).getTime() - new Date(e.fromAt).getTime()) / 60000 : 0;
  if (energy.kwh == null) {
    return <p className="sr-empty">{t("มิเตอร์ไม่มีเลขสะสมพอให้คิดไฟที่ใช้ในกะนี้")}</p>;
  }
  const now = span(energy);
  const before = span(energy.yesterday);
  const comparable = energy.yesterday.kwh != null && before > 0 && Math.abs(now - before) / before <= 0.1;
  const change = comparable ? ((energy.kwh - energy.yesterday.kwh) / energy.yesterday.kwh) * 100 : null;

  return (
    <div className="sr-energy">
      <p className="sr-energy-value">
        <b className="num">{formatNumber1(energy.kwh)}</b>
        <span>{t("หน่วย (kWh)")}</span>
      </p>
      <p className="sr-muted">
        {t("นับจากค่ามิเตอร์ {from} – {to} ({time})", {
          from: formatTime(energy.fromAt),
          to: formatTime(energy.toAt),
          time: durationText(t, now),
        })}
      </p>
      {energy.yesterday.kwh == null ? (
        <p className="sr-muted">{t("ไม่มีข้อมูลกะเดียวกันเมื่อวานให้เทียบ")}</p>
      ) : comparable ? (
        <p>
          {t("กะเดียวกันเมื่อวาน {kwh} หน่วย", { kwh: formatNumber1(energy.yesterday.kwh) })}
          {" · "}
          <b className="num">
            {change >= 0 ? "+" : "−"}
            {formatNumber1(Math.abs(change))}%
          </b>
        </p>
      ) : (
        <p className="sr-muted">
          {t("กะเดียวกันเมื่อวาน {kwh} หน่วย แต่มิเตอร์มีค่า {time} — ช่วงยาวไม่เท่ากัน จึงไม่เทียบเป็นเปอร์เซ็นต์", {
            kwh: formatNumber1(energy.yesterday.kwh),
            time: durationText(t, before),
          })}
        </p>
      )}
    </div>
  );
}

/** ปุ่ม "รับเวรแล้ว" + หมายเหตุ — เขียนข้อมูล จึงต้องผ่าน can("record.write") และบอกเหตุผลเมื่อกดไม่ได้ */
function Handover({ barnId, shift, ended, handover, loaded, allowed, onDone }) {
  const t = useT();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!loaded) return <p className="sr-empty">{t("กำลังโหลดรายงาน…")}</p>;

  if (handover) {
    return (
      <div className="sr-handover">
        <StatusBadge tone="good">
          {t("{who} รับเวรแล้วเมื่อ {at}", {
            who: handover.received_by_name,
            at: formatDateTime(handover.received_at),
          })}
        </StatusBadge>
        {handover.note && <p className="sr-handover-note">{handover.note}</p>}
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await receiveShift(barnId, shift, note);
      onDone();
    } catch (err) {
      setError(err.status === 409 ? t("กะนี้มีคนรับเวรไปแล้ว") : t("บันทึกไม่สำเร็จ — {reason}", { reason: err.message }));
      if (err.status === 409) onDone();
    } finally {
      setBusy(false);
    }
  };

  const disabled = !allowed || !ended || busy;
  return (
    <form className="sr-handover" onSubmit={submit}>
      {!ended && <StatusBadge tone="offline">{t("กะนี้ยังไม่จบ — รับเวรได้หลังจบกะ")}</StatusBadge>}
      <label className="sr-field" htmlFor="sr-note">
        <span>{t("หมายเหตุถึงกะก่อน (ไม่บังคับ)")}</span>
        <textarea
          id="sr-note"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={disabled}
          placeholder={t("เช่น รับทราบเรื่องความชื้นสูงแล้ว จะเช็กรางน้ำ")}
        />
      </label>
      {!allowed && <AdminNote action="record.write">{t("ผู้ชมอ่านรายงานได้ แต่กดรับเวรไม่ได้")}</AdminNote>}
      {error && (
        <p className="sr-error" role="alert">
          <Icon name="warn" size={18} aria-hidden="true" />
          {error}
        </p>
      )}
      <button type="submit" className="sr-receive" disabled={disabled}>
        <Icon name="check" size={18} aria-hidden="true" />
        {busy ? t("กำลังบันทึก…") : t("รับเวรแล้ว")}
      </button>
    </form>
  );
}
