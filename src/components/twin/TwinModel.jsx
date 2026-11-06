/**
 * กล่อง "แบบจำลองที่คิดได้" — แบบจำลองความร้อนของเล้าเทียบกับของจริง (T1.261)
 *
 * เรียงตามคำถามที่คนดูถามจริง:
 *   1. ตอนนี้เล้าเป็นอย่างที่ควรเป็นไหม  → ของจริง vs แบบจำลองคาด + ป้ายส่วนต่าง
 *   2. ที่ผ่านมาแบบจำลองคาดถูกแค่ไหน       → กราฟสองเส้น
 *   3. เล้านี้มีบุคลิกยังไง              → ค่าจากแบบจำลอง เขียนเป็นภาษาคน
 *   4. เชื่อได้แค่ไหน                   → ความแม่นจากช่วงที่ไม่เคยเห็น + ที่มาของข้อมูล
 *
 * **ค่าที่แบบจำลองคาดไม่ใช่ค่าวัด** และตัวขับมาจาก Open-Meteo ซึ่งเป็นแบบจำลองอากาศ
 * ต้องเขียนกำกับไว้บนการ์ดเสมอ (กติกาห้ามปนค่าพยากรณ์กับค่าวัดใน CLAUDE.md)
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import StatusBadge from "../ui/StatusBadge.jsx";
import ChartLegend from "../ui/ChartLegend.jsx";
import Icon from "../ui/Icon.jsx";
import { useT } from "../../lib/i18n/useT.js";
import { formatNumber, formatNumber1, formatTime } from "../../lib/format.js";
import {
  axisProps,
  evenTicks,
  gridProps,
  hourTicks,
  paddedDomain,
  tooltipStyle,
  TWIN_COLORS,
} from "../../lib/chartTheme.js";
import "./twin.css";

const CHART_H = 220;
const iso = (sec) => new Date(sec * 1000).toISOString();

/** ประโยคบนป้ายส่วนต่าง — บอกทิศทางเสมอ (ร้อนกว่า/เย็นกว่า) ไม่ใช่แค่ตัวเลขติดลบ */
function residualLabel(t, live) {
  const size = formatNumber1(Math.abs(live.residual));
  if (live.tone === "good") return t("ตรงตามที่แบบจำลองคาด (ต่าง {n} °C)", { n: size });
  return live.residual > 0
    ? t("ร้อนกว่าที่แบบจำลองคาด {n} °C", { n: size })
    : t("เย็นกว่าที่แบบจำลองคาด {n} °C", { n: size });
}

function LiveState({ live, horizonMin }) {
  const t = useT();
  if (live.status === "ok") {
    return (
      <div className="tm-now">
        <div className="tm-now-cell">
          <span>{t("ในเล้าวัดได้ตอนนี้")}</span>
          <b>{`${formatNumber1(live.actual)} °C`}</b>
        </div>
        <div className="tm-now-cell">
          <span>{t("แบบจำลองคาดไว้เมื่อ {n} ชั่วโมงก่อน", { n: formatNumber(horizonMin / 60) })}</span>
          <b>{`${formatNumber1(live.expected)} °C`}</b>
        </div>
        <div className="tm-now-badge">
          <StatusBadge tone={live.tone}>{residualLabel(t, live)}</StatusBadge>
          {live.tone !== "good" && (
            <p className="tm-hint">
              {live.residual > 0
                ? t("ต่างเกินกว่าที่แบบจำลองเคยพลาด — ลองตรวจพัดลม ระบบทำความเย็น และประตูที่อาจเปิดค้าง")
                : t("ต่างเกินกว่าที่แบบจำลองเคยพลาด — อาจเปิดระบบทำความเย็นมากกว่าปกติ ฝนตก หรือเซนเซอร์ในเล้าผิดปกติ")}
            </p>
          )}
        </div>
      </div>
    );
  }
  const text =
    live.status === "warming"
      ? t("ข้อมูลในเล้าเพิ่งกลับมา — อีกราว {n} นาทีแบบจำลองจึงมีจุดเริ่มพอจะเทียบได้", {
        n: formatNumber(live.readyInMin),
      })
      : live.status === "stale"
        ? t("ค่าในเล้าล่าสุดเก่า {n} นาทีแล้ว — ยังไม่เทียบกับแบบจำลอง", { n: formatNumber(live.ageMin) })
        : t("ยังไม่มีค่าในเล้าให้เทียบกับแบบจำลอง");
  return (
    <p className="tm-waiting">
      <Icon name="clock" size={16} aria-hidden="true" />
      {text}
    </p>
  );
}

function TwinChart({ series }) {
  const t = useT();
  const data = series.map((p, i) => ({ i, label: formatTime(iso(p.t)), actual: p.actual, twin: p.twin }));
  const values = data.flatMap((d) => [d.actual, d.twin]);
  /* ขีดต้องห่างเท่ากันทั้งสองแกน — ดู evenTicks / hourTicks ใน chartTheme.js */
  const yAxis = evenTicks(paddedDomain(values, 0.6));
  const xTicks = hourTicks(series.map((p) => p.t));
  const names = { actual: t("ในเล้าวัดได้จริง"), twin: t("แบบจำลองคาดล่วงหน้า 3 ชม.") };
  return (
    <>
      <ResponsiveContainer width="100%" height={CHART_H}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
          <CartesianGrid {...gridProps} />
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
          <YAxis
            domain={yAxis.domain}
            ticks={yAxis.ticks}
            interval={0}
            tickFormatter={(v) => formatNumber1(v)}
            {...axisProps}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(i) => data[i]?.label ?? ""}
            formatter={(v, key) => [v == null ? t("ไม่มีค่า") : `${formatNumber1(v)} °C`, names[key]]}
          />
          <Line type="monotone" dataKey="actual" name="actual" stroke={TWIN_COLORS.actual} strokeWidth={2.5} dot={false} />
          <Line
            type="monotone"
            dataKey="twin"
            name="twin"
            stroke={TWIN_COLORS.twin}
            strokeWidth={2.5}
            strokeDasharray="6 5"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <ChartLegend
        items={[
          { label: names.actual, color: TWIN_COLORS.actual },
          { label: names.twin, color: TWIN_COLORS.twin },
        ]}
      />
    </>
  );
}

/** @param {object} data ผลของ GET /api/barns/:id/twin ที่มี model แล้ว */
export default function TwinModel({ data }) {
  const t = useT();
  const { model, accuracy, live, horizonMin } = data;

  return (
    <div className="tm">
      <LiveState live={live} horizonMin={horizonMin} />

      {live.status === "ok" && live.series?.length > 1 && <TwinChart series={live.series} />}

      <ul className="tm-traits">
        <li>
          <span>{t("อุณหภูมิประจำที่เล้าดึงกลับหา")}</span>
          <b>{`${formatNumber1(model.setpoint)} °C`}</b>
        </li>
        <li>
          <span>{t("ความเร็วในการดึงกลับ (ค่าคงที่เวลา)")}</span>
          <b>{t("ราว {n} นาที", { n: formatNumber(Math.round(model.tauMin)) })}</b>
        </li>
        <li>
          <span>{t("แดดเต็มที่ทำให้ในเล้าร้อนขึ้น")}</span>
          <b>{`+${formatNumber1(model.sunEffect)} °C`}</b>
        </li>
        <li>
          <span>{t("ผลเพิ่มจากอุณหภูมิอากาศข้างนอก")}</span>
          {model.atBound?.gainLow ? (
            <b className="tm-muted">{t("ตรวจไม่พบ")}</b>
          ) : (
            <b>{t("{n} °C ต่อ 1 °C", { n: formatNumber1(model.gainOut) })}</b>
          )}
        </li>
      </ul>
      {model.atBound?.gainLow && (
        <p className="tm-note">
          {t("เมื่อคิดผลของแดดแล้ว ข้อมูลไม่แสดงว่าอากาศข้างนอกร้อนขึ้นทำให้ในเล้าร้อนขึ้นอีก — สอดคล้องกับเล้าที่มีระบบทำความเย็นและร้อนผ่านหลังคาเป็นหลัก")}
        </p>
      )}

      <div className="tm-trust">
        <p>
          <Icon name="check" size={16} aria-hidden="true" />
          {t("ทำนาย 3 ชั่วโมงข้างหน้าคลาดเคลื่อน ±{rmse} °C · ดีกว่าเดาว่าอุณหภูมิคงที่ {skill}% · วัดจาก {hours} ชั่วโมงที่แบบจำลองไม่เคยเห็น", {
            rmse: formatNumber1(accuracy.h3.rmse),
            skill: formatNumber(Math.round(accuracy.h3.skill * 100)),
            hours: formatNumber(Math.round(accuracy.testHours)),
          })}
        </p>
        <p>
          <Icon name="cloud" size={16} aria-hidden="true" />
          {t("แดดและอากาศนอกมาจาก Open-Meteo — เป็นแบบจำลองอากาศรายชั่วโมง ไม่ใช่ค่าที่วัดที่ฟาร์ม · เซนเซอร์นอกเล้าจะใช้แทนเมื่อซ่อมแล้ว")}
        </p>
        <p>
          <Icon name="clock" size={16} aria-hidden="true" />
          {t("สอนใหม่ทุกชั่วโมงจากข้อมูลในเล้าจริง {hours} ชั่วโมง · ส่วนใหญ่เป็นช่วงกลางวัน ตอนกลางคืนจึงยังเชื่อได้น้อยกว่า", {
            hours: formatNumber(Math.round(model.hoursUsed)),
          })}
        </p>
      </div>
    </div>
  );
}
