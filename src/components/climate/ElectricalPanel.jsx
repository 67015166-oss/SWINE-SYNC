/**
 * การ์ด "ระบบไฟฟ้า" — ค่าหลัก · กระแสแยกตามวงจร · หน่วยและค่าไฟ
 *
 * **ไม่มีช่อง "ตัวประกอบกำลัง" (cos φ) แล้ว — อย่าเอากลับมาถ้ามิเตอร์ยังไม่วัด**
 * มิเตอร์ตัวจริงส่ง `power_factor` มาทุก 30 วินาที แต่เป็น 0 ทุกจุด (9,618 จุดใน 3 วัน)
 * = ช่องที่ไม่ได้วัด ไม่ใช่ค่าที่วัดได้เป็นศูนย์ ส่วนค่าจำลองก็เป็นเลขสุ่ม 0.88–0.95
 * ทั้งสองทางจึงไม่มีอะไรจริงให้แสดง (ดู docs/RUNBOOK.md หัวข้อ "ตัวประกอบกำลัง")
 *
 * ทุกตัวเลขคำนวณจากอุปกรณ์ที่กำลังเดินอยู่จริง (ดู data/mock/barnSystems.js)
 * สั่งปิดพัดลมในการ์ดข้าง ๆ แล้วกระแสรวมกับกำลังไฟที่นี่จะลดลงทันที
 *
 * แถบกระแสรายวงจรเป็น "ปริมาณมาก-น้อย" ไม่ใช่การแยกประเภท จึงใช้สีไล่ระดับ --seq-*
 * สีเดียวทั้งชุดตามกติกาใน docs/DESIGN.md (ห้ามใช้รุ้งกับข้อมูลไล่ระดับ)
 */
import { useState } from "react";
import Card from "../ui/Card.jsx";
import Icon from "../ui/Icon.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";
import NotesToggle from "../ui/NotesToggle.jsx";
import DataSourceBadge from "../ui/DataSourceBadge.jsx";
import { VOLTAGE_OK } from "../../data/mock/barnSystems.js";
import {
  formatNumber,
  formatNumber1,
  formatNumber2,
  formatBaht,
  formatTime,
  formatDateShort,
} from "../../lib/format.js";
import { useT } from "../../lib/i18n/useT.js";
import "./systems.css";

/**
 * @param {boolean} [demo] ค่าจากข้อมูลตัวอย่าง — แสดงป้าย "ข้อมูลตัวอย่าง" แทน "อ่านค่าตามเวลาจริง"
 */
export default function ElectricalPanel({ electrical, demo = false }) {
  const t = useT();
  /* บรรทัดอธิบายใต้ค่าแต่ละตัว (สูตร · ที่มา) ซ่อนไว้ก่อน กดปุ่มถึงกาง —
     ตัวเลขกับป้ายสถานะยังอยู่เสมอ กติกาเดียวกับการ์ด "สภาพแวดล้อมตอนนี้" */
  const [showNotes, setShowNotes] = useState(false);

  if (!electrical?.online) {
    return (
      <Card className="el-card">
        <header className="el-head">
          <span className="icon-chip is-sm" aria-hidden="true">
            <Icon name="bolt" size={18} />
          </span>
          <h3>
            {t("ระบบไฟฟ้า")} <span className="el-head-en">ELECTRICAL</span>
          </h3>
        </header>
        <p className="el-empty">
          <Icon name="power" size={18} aria-hidden="true" />
          {t("ตู้ควบคุมไม่ส่งค่ามิเตอร์ในขณะนี้ — ตรวจไฟและสัญญาณที่ตู้ท้ายโรงเรือน")}
        </p>
      </Card>
    );
  }

  const {
    voltage, totalCurrent, currentPerPhase, circuitKind, activePower, circuits,
    todayKwh, monthKwh, cost, rate,
    /* partial = มิเตอร์จริงส่งมาไม่ครบทุกค่า (ดู lib/api/LiveFarmsProvider.jsx)
       ต้องบอกให้คนดูรู้ว่าขีดกลางแปลว่า "มิเตอร์ไม่ได้วัด" ไม่ใช่ "ระบบพัง" */
    /* missing = รายชื่อค่าที่มิเตอร์ไม่ได้วัด (ดู lib/api/LiveFarmsProvider.jsx)
       ต้องบอกให้คนดูรู้ว่าขีดกลางแปลว่า "มิเตอร์ไม่ได้วัด" ไม่ใช่ "ระบบพัง"
       todayFrom = หน่วยที่นับได้เริ่มจากเวลาไหน ไม่ใช่เที่ยงคืนเสมอไป */
    missing, frequency, todayFrom, monthFrom,
  } = electrical;
  const voltageOk = voltage >= VOLTAGE_OK.min && voltage <= VOLTAGE_OK.max;
  /* มิเตอร์จริงส่งกระแส "รายเฟส" ส่วนค่าจำลองแยกเป็น "วงจรย่อย" — สรุปคนละวิธีกัน
     เฟส: เอามาบวกกันไม่ได้ (ต่างเฟส 120°) ค่าที่มีความหมายคือค่าเฉลี่ยต่อเฟส
     วงจรย่อย: เป็นโหลดขนานกัน บวกกันได้ตรง ๆ (ดู lib/api/LiveFarmsProvider.jsx) */
  const byPhase = circuitKind === "phase";
  /* หน่วยที่นับได้เริ่มหลังเที่ยงคืนเกิน 5 นาที = ยังไม่ครอบคลุมทั้งวัน */
  const startedLate =
    todayFrom != null && new Date(todayFrom).getHours() * 60 + new Date(todayFrom).getMinutes() > 5;
  /* เดือนนี้ก็เหมือนกัน — เริ่มเก็บหลังวันที่ 1 = ตัวเลขไม่ได้ครอบคลุมทั้งเดือน */
  const monthStartedLate = monthFrom != null && new Date(monthFrom).getDate() > 1;
  /* แถบยาวเทียบกับวงจรที่กินกระแสมากที่สุด ไม่ใช่เทียบกระแสรวม จะได้เห็นสัดส่วนชัด */
  const peak = Math.max(...circuits.map((c) => c.amp), 1);

  return (
    <Card className="el-card">
      <header className="el-head">
        <span className="icon-chip is-sm" aria-hidden="true">
          <Icon name="bolt" size={18} />
        </span>
        <h3>
          {t("ระบบไฟฟ้า")} <span className="el-head-en">ELECTRICAL</span>
        </h3>
        <NotesToggle on={showNotes} onToggle={() => setShowNotes((v) => !v)} />
        {demo ? (
          <DataSourceBadge source="demo" />
        ) : (
          <span className="ec-live">
            <span className="ec-live-dot" aria-hidden="true" />
            {t("อ่านค่าตามเวลาจริง")}
          </span>
        )}
      </header>

      <ul className={"el-stats" + (showNotes ? "" : " is-plain")}>
        <li className="el-stat">
          <span className="el-stat-label">{t("แรงดันไฟ")}</span>
          <span className="el-stat-value">
            <b className="num">{formatNumber(voltage)}</b>
            <em>V</em>
          </span>
          {/* ป้ายสถานะต้องเห็นเสมอ (กติกา DESIGN.md) แต่ "ช่วง 210–235 V" ในป้ายคือคำอธิบาย
              จึงตัดออกตอนปิดคำอธิบาย เหลือแค่คำว่า "ปกติ" — สถานะยังอ่านได้ครบ
              ส่วนตอนผิดปกติไม่ตัดอะไร เพราะข้อความนั้นคือสถานะล้วน ๆ อยู่แล้ว */}
          <StatusBadge tone={voltageOk ? "good" : "warning"}>
            {!voltageOk
              ? t("หลุดช่วงที่ปลอดภัย")
              : showNotes
                ? t("ปกติ {min}–{max} V", { min: VOLTAGE_OK.min, max: VOLTAGE_OK.max })
                : t("ปกติ")}
          </StatusBadge>
        </li>

        <li className="el-stat">
          <span className="el-stat-label">
            {byPhase ? t("กระแสเฉลี่ยต่อเฟส") : t("กระแสรวม")}
          </span>
          <span className="el-stat-value">
            <b className="num">{formatNumber1(byPhase ? currentPerPhase : totalCurrent)}</b>
            <em>A</em>
          </span>
          <span className="el-stat-note">
            {byPhase
              ? t("เฉลี่ยจากสามเฟสด้านล่าง — กระแสสามเฟสเอามาบวกกันไม่ได้")
              : t("ผลรวมของทุกวงจรด้านล่าง")}
          </span>
        </li>

        <li className="el-stat">
          <span className="el-stat-label">{t("กำลังไฟ")}</span>
          <span className="el-stat-value">
            <b className="num">{formatNumber2(activePower)}</b>
            <em>kW</em>
          </span>
          <span className="el-stat-note">{t("กำลังที่ใช้อยู่จริง ไม่ใช่แรงดัน × กระแส")}</span>
        </li>

        {/* ความถี่มีเฉพาะโรงเรือนที่อ่านจากมิเตอร์จริง — ค่าจำลองไม่มีช่องนี้ */}
        {frequency != null && (
          <li className="el-stat">
            <span className="el-stat-label">{t("ความถี่")}</span>
            <span className="el-stat-value">
              <b className="num">{formatNumber2(frequency)}</b>
              <em>Hz</em>
            </span>
            <span className="el-stat-note">{t("ไฟบ้านไทยอยู่ที่ 50 Hz")}</span>
          </li>
        )}
      </ul>

      {missing?.length > 0 && (
        <p className="el-partial">
          <Icon name="warn" size={16} aria-hidden="true" />
          {t("มิเตอร์ตัวนี้ไม่ได้วัด{list} — ช่องนั้นจึงเป็นขีดกลาง ไม่ใช่ระบบอ่านค่าไม่ได้", {
            list: missing.map((m) => t(m)).join(" · "),
          })}
        </p>
      )}

      {/* ---------- กระแสแยกตามวงจร ---------- */}
      <p className="el-section">{byPhase ? t("กระแสแยกตามเฟส") : t("กระแสแยกตามวงจร")}</p>
      <ul className="el-circuits">
        {circuits.map((circuit) => (
          <li key={circuit.id} className="el-circuit">
            <span className="el-circuit-name">{t(circuit.label)}</span>
            <span className="el-circuit-track" aria-hidden="true">
              <span
                className="el-circuit-fill"
                style={{ width: `${Math.max(4, (circuit.amp / peak) * 100)}%` }}
              />
            </span>
            <span className="el-circuit-amp num">{formatNumber1(circuit.amp)} A</span>
          </li>
        ))}
      </ul>

      {/* ---------- หน่วยและค่าไฟ ---------- */}
      <ul className="el-totals">
        <li>
          {/* ระบบเพิ่งเริ่มเก็บค่ากลางวันได้ ตัวเลขจึงไม่ใช่ทั้งวัน — ต้องบอกให้ชัด
              ไม่งั้นคนอ่านจะนึกว่าฟาร์มใช้ไฟแค่นี้จริง ๆ ทั้งวัน */}
          {/* formatTime เติมคำว่า "น." ให้เองแล้ว — ห้ามเติมซ้ำในคีย์แปล */}
          <span>{startedLate ? t("ใช้ไปตั้งแต่ {time}", { time: formatTime(todayFrom) }) : t("ใช้ไปวันนี้")}</span>
          <b className="num">{formatNumber1(todayKwh)}</b>
          <em>kWh</em>
        </li>
        <li>
          {/* เดือนนี้ก็เหมือนกัน — ระบบเพิ่งเริ่มเก็บกลางเดือนก็บอกไปตรง ๆ */}
          <span>
            {monthStartedLate
              ? t("ใช้ไปตั้งแต่ {date}", { date: formatDateShort(monthFrom) })
              : t("ใช้ไปเดือนนี้")}
          </span>
          <b className="num">{formatNumber1(monthKwh)}</b>
          <em>kWh</em>
        </li>
        <li>
          <span>{t("ค่าไฟฟ้าเดือนนี้")}</span>
          <b className="num">{formatBaht(cost)}</b>
          <em>{t("ที่ {rate} บาท/หน่วย", { rate: formatNumber1(rate) })}</em>
        </li>
      </ul>
    </Card>
  );
}
