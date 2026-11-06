/**
 * การ์ด "ดัชนีความเครียดความร้อน (THI)"
 *
 * ใช้ร่วมกันสองหน้า: หน้าสภาพแวดล้อมรวมทุกโรงเรือน (/dashboard/environment)
 * และหน้าระบบควบคุมสภาพแวดล้อมรายโรงเรือน (/dashboard/climate/:farmId/:barnId)
 * เดิมเขียนไว้ในหน้า Climate ตรง ๆ — ย้ายออกมาเพราะสองหน้าต้องอ่านค่าเดียวกัน
 * ถ้าแยกกันเขียน เกณฑ์ระดับความเครียดจะเพี้ยนกันเองในวันที่แก้ที่เดียว
 *
 * THI รวมอุณหภูมิกับความชื้นเป็นค่าเดียว ตัวเลขลอย ๆ จึงไม่มีความหมายถ้าไม่มีแถบระดับกำกับ
 * แถบระดับบอกด้วยสี + ข้อความ + ตำแหน่งหมุด ไม่ได้สื่อด้วยสีอย่างเดียว
 */
import Card from "../ui/Card.jsx";
import Icon from "../ui/Icon.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";
import { thiLevel } from "../../data/mock/climate.js";
import { formatNumber1 } from "../../lib/format.js";
import "./systems.css";
import { useT } from "../../lib/i18n/useT.js";

/** ช่วงของดัชนีความร้อน — ใช้ทำแถบระดับใต้ตัวเลข */
const THI_BANDS = [
  { tone: "good", label: "สบายตัว", upTo: 74 },
  { tone: "warning", label: "เริ่มเครียด", upTo: 79 },
  { tone: "serious", label: "ปานกลาง", upTo: 84 },
  { tone: "critical", label: "รุนแรง", upTo: 90 },
];
const THI_FLOOR = 64;
const THI_CEIL = 90;

const pct = (value) =>
  ((Math.min(Math.max(value, THI_FLOOR), THI_CEIL) - THI_FLOOR) / (THI_CEIL - THI_FLOOR)) * 100;

/**
 * ตัวเลข + แถบระดับ + คำอธิบาย โดยไม่มีกรอบการ์ด
 *
 * แยกออกมาให้หน้าที่วางเนื้อหานี้ไว้ใน "แผง" ของตัวเอง (เช่นถาดสามมิติในหน้าสภาพแวดล้อม)
 * ใช้ซ้ำได้โดยไม่ได้การ์ดซ้อนการ์ด — เกณฑ์ระดับความเครียดยังอยู่ที่เดียวเหมือนเดิม
 *
 * @param {number|null} thi ค่าดัชนี (null = ไม่มีค่าจากเซนเซอร์)
 */
export function ThiScale({ thi }) {
  const t = useT();
  const level = thi == null ? null : thiLevel(thi);

  return (
    <>
      <p className="thi-value">
        <b className="num">{thi == null ? "—" : formatNumber1(thi)}</b>
        {level && <StatusBadge tone={level.tone}>{t(level.label)}</StatusBadge>}
      </p>

      <div className="thi-scale">
        <div className="thi-bar" aria-hidden="true">
          {THI_BANDS.map((band, i) => (
            <span
              key={band.tone}
              className={`thi-seg is-${band.tone}`}
              style={{
                width: `${pct(band.upTo) - pct(i === 0 ? THI_FLOOR : THI_BANDS[i - 1].upTo)}%`,
              }}
            />
          ))}
          {thi != null && <span className="thi-mark" style={{ left: `${pct(thi)}%` }} />}
        </div>

        <ul className="thi-legend">
          {THI_BANDS.map((band, i) => (
            <li key={band.tone} className={level?.tone === band.tone ? "is-current" : ""}>
              <span className={`thi-dot is-${band.tone}`} aria-hidden="true" />
              <span className="thi-name">{t(band.label)}</span>
              <span className="num thi-range">
                {i === 0
                  ? t("ต่ำกว่า {n}", { n: band.upTo })
                  : i === THI_BANDS.length - 1
                    ? t("{n} ขึ้นไป", { n: THI_BANDS[i - 1].upTo })
                    : `${THI_BANDS[i - 1].upTo}–${band.upTo - 1}`}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="thi-text">
        {level ? t(level.text) : t("ยังคำนวณไม่ได้เพราะไม่มีค่าจากเซนเซอร์")}
      </p>
    </>
  );
}

/**
 * @param {number|null} thi ค่าดัชนี (null = ไม่มีค่าจากเซนเซอร์)
 * @param {string} [subtitle] คำอธิบายใต้หัวการ์ด
 * @param {Array<{icon:string,label:string,value:string}>} [facts] แถวข้อมูลปิดท้ายการ์ด
 */
export default function ThiCard({ thi, subtitle, facts = [] }) {
  const t = useT();

  return (
    <Card
      title={t("ดัชนีความเครียดความร้อน (THI)")}
      subtitle={subtitle ?? t("รวมผลของอุณหภูมิและความชื้นเป็นค่าเดียว")}
      icon="spark"
    >
      <ThiScale thi={thi} />

      {facts.length > 0 && (
        <ul className="thi-facts">
          {facts.map((fact) => (
            <li key={fact.label}>
              <Icon name={fact.icon} size={17} aria-hidden="true" />
              <span>{t(fact.label)}</span>
              <b className="num">{fact.value}</b>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
