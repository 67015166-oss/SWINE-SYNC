/**
 * การ์ดคู่ "ภายนอก vs ภายใน" — บนสุดของหน้าระบบควบคุมสภาพแวดล้อม
 *
 * สองการ์ดต้องอ่านคู่กันเสมอ จึงอยู่ใน component เดียว: ส่วนต่างของแต่ละค่า
 * คำนวณที่เดียวแล้วเขียนสองมุมมอง (ข้างนอกมองเข้า / ข้างในมองออก) ตัวเลขจึงไม่มีทางขัดกัน
 *
 * ทิศของลูกศรบอกแค่ "มากกว่า/น้อยกว่า" ไม่ได้บอกว่าดีหรือแย่ — ตัวตัดสินว่าค่าปกติไหม
 * คือป้ายสถานะในการ์ดเกจด้านล่าง ไม่ใช่ที่นี่
 */
import Card from "../ui/Card.jsx";
import { heldDisplay } from "../../lib/heldReading.js";
import Icon from "../ui/Icon.jsx";
import { formatNumber, formatNumber1 } from "../../lib/format.js";
import "./systems.css";
import { useT } from "../../lib/i18n/useT.js";

/** แถวค่าหนึ่งค่าในการ์ด — ป้ายกำกับ · ตัวเลขใหญ่ · หน่วย · บรรทัดเทียบ */
function Metric({ label, value, unit, compare, heldNote }) {
  return (
    <li className={"ec-metric" + (heldNote ? " is-held" : "")}>
      <span className="ec-metric-label">{label}</span>
      <span className="ec-metric-value">
        <b className="num">{value ?? "—"}</b>
        <em>{unit}</em>
      </span>
      {/* ค่าค้างกินที่ของบรรทัดเทียบ — เทียบค่าเก่ากับค่าสดข้างนอกคือการเทียบคนละเวลา */}
      {heldNote ? (
        <span className="ec-metric-held">
          <Icon name="clock" size={14} className="ec-metric-arrow" aria-hidden="true" />
          {heldNote}
        </span>
      ) : (
        compare && (
          <span className={`ec-metric-diff is-${compare.dir}`}>
            <Icon name="chevron" size={14} className="ec-metric-arrow" aria-hidden="true" />
            {compare.text}
          </span>
        )
      )}
    </li>
  );
}

/**
 * @param {object} outdoor ผลของ getOutdoor()
 * @param {object} barn    โรงเรือนที่กำลังดู (ใช้ tempC / humidity / windSpeed)
 */
export default function EnvCompare({ outdoor, barn }) {
  const t = useT();
  const offline = barn.status === "offline";

  /* กติกาค่าค้างอยู่ที่ lib/heldReading.js ที่เดียว — ห้ามเขียนเงื่อนไขเองตรงนี้ */
  const shownValue = (liveValue, heldKey, format) =>
    heldDisplay({
      live: liveValue ?? null,
      held: barn.held?.[heldKey] ?? null,
      at: barn.held?.at ?? null,
      format,
      t,
    });

  const tempShown = shownValue(barn.tempC, "tempC", formatNumber1);
  const humidShown = shownValue(barn.humidity, "humidity", formatNumber);
  const windShown = shownValue(barn.windSpeed, "windSpeed", formatNumber1);

  /* ส่วนต่าง "ข้างนอกลบข้างใน" — คำนวณครั้งเดียวแล้วใช้ทั้งสองการ์ด */
  const diff = (out, inside) =>
    offline || out == null || inside == null ? null : out - inside;
  /* ═══ ★ "อัปเดตเมื่อสักครู่" ข้าง ๆ ขีดกลางทั้งใบ คือการโกหกที่ตรวจไม่ออก (T1.315) ═══
     เซนเซอร์ที่ค้างยังส่งข้อมูลมาทุกนาที **เวลาจึงสดจริง** แต่ไม่มีค่าไหนวัดได้เลย
     คนอ่านเห็นเวลาสด ๆ กับขีดกลาง จะสรุปว่า "เพิ่งเสีย" หรือ "ยังไม่มีเซนเซอร์"
     ทั้งที่ของจริงคือ "มีเซนเซอร์ · ยังส่งอยู่ · แต่ไม่ได้วัด" ซึ่งต้องไปตามคนละคน

     ★ ไม่เช็กว่า "ค้างครบทุกค่า" เพราะเสาอากาศของฟาร์มนี้ไม่มีเซนเซอร์ลมตั้งแต่ต้น
       คีย์ `wind_ms|out` จึงไม่เคยมีหลักฐานมา แล้วเงื่อนไข "ครบทุกค่า" จะไม่เป็นจริงเลย
       เช็กตามที่เห็นบนจอแทน: ไม่มีค่าไหนขึ้นเลย และรู้ว่าอย่างน้อยหนึ่งค่าค้าง */
  const outStuck = new Set(barn?.stuckValues ?? []);
  const stuckOnly =
    [outdoor?.tempC, outdoor?.humidity, outdoor?.wind].every((v) => v == null) &&
    ["temp_c|out", "humidity|out", "wind_ms|out"].some((k) => outStuck.has(k));

  const tempDiff = diff(outdoor?.tempC, barn.tempC);
  const humidDiff = diff(outdoor?.humidity, barn.humidity);
  const windDiff = diff(outdoor?.wind, barn.windSpeed);

  /** บรรทัดเทียบฝั่งภายนอก: "สูงกว่าภายใน 4.2 °C" */
  const outSide = (d, fmt, unit) =>
    d == null
      ? null
      : {
          dir: d >= 0 ? "up" : "down",
          text:
            d >= 0
              ? t("สูงกว่าภายใน {value} {unit}", { value: fmt(Math.abs(d)), unit })
              : t("ต่ำกว่าภายใน {value} {unit}", { value: fmt(Math.abs(d)), unit }),
        };

  /** บรรทัดเทียบฝั่งภายใน: กลับด้านของอันบน */
  const inSide = (d, fmt, unit, lowKey = "ต่ำกว่าภายนอก {value} {unit}", highKey = "สูงกว่าภายนอก {value} {unit}") =>
    d == null
      ? null
      : {
          dir: d >= 0 ? "down" : "up",
          text: t(d >= 0 ? lowKey : highKey, { value: fmt(Math.abs(d)), unit }),
        };

  return (
    <div className="ec-pair">
      <Card className="ec-card">
        <header className="ec-head">
          <span className="icon-chip is-sm" aria-hidden="true">
            <Icon name="spark" size={18} />
          </span>
          <h3>
            {t("ภายนอก")} <span className="ec-head-en">OUTDOOR</span>
          </h3>
          <span className="ec-head-note">
            {stuckOnly ? t("ค่าค้าง · ไม่ได้วัดจริง") : updatedText(t, outdoor)}
          </span>
        </header>

        <ul className="ec-metrics">
          <Metric
            label={t("อุณหภูมิ")}
            value={outdoor && formatNumber1(outdoor.tempC)}
            unit="°C"
            compare={outSide(tempDiff, formatNumber1, "°C")}
          />
          <Metric
            label={t("ความชื้น")}
            value={outdoor && formatNumber(outdoor.humidity)}
            unit="%RH"
            compare={outSide(humidDiff, formatNumber, "%")}
          />
          <Metric
            label={t("ความเร็วลม")}
            value={outdoor && formatNumber1(outdoor.wind)}
            unit="m/s"
            compare={outSide(windDiff, formatNumber1, "m/s")}
          />
        </ul>
      </Card>

      <Card className="ec-card">
        <header className="ec-head">
          <span className="icon-chip is-sm" aria-hidden="true">
            <Icon name="home" size={18} />
          </span>
          <h3>
            {t("ภายใน")} <span className="ec-head-en">{t(barn.name)}</span>
          </h3>
          <span className={"ec-live" + (offline ? " is-off" : "")}>
            <span className="ec-live-dot" aria-hidden="true" />
            {offline ? t("ไม่มีสัญญาณ") : t("กำลังส่งค่า")}
          </span>
        </header>

        <ul className="ec-metrics">
          <Metric
            label={t("อุณหภูมิ")}
            value={tempShown.text}
            heldNote={tempShown.note}
            unit="°C"
            compare={inSide(
              tempDiff,
              formatNumber1,
              "°C",
              "เย็นกว่าภายนอก {value} {unit}",
              "ร้อนกว่าภายนอก {value} {unit}",
            )}
          />
          <Metric
            label={t("ความชื้น")}
            value={humidShown.text}
            heldNote={humidShown.note}
            unit="%RH"
            compare={inSide(humidDiff, formatNumber, "%")}
          />
          <Metric
            label={t("ความเร็วลม")}
            value={windShown.text}
            heldNote={windShown.note}
            unit="m/s"
            compare={inSide(windDiff, formatNumber1, "m/s")}
          />
        </ul>
      </Card>
    </div>
  );
}
