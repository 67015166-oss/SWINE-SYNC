/**
 * คู่มือ "ทำความสะอาด & ฆ่าเชื้อ" — /dashboard/guide/cleaning (T1.292)
 *
 * เนื้อหาจากทีม Farmy (`src/data/farmy/biosecurity.js`) เรียบเรียงจากข้อกำหนด
 * มกษ. ฟาร์มสุกร (กรมปศุสัตว์ · มกอช.) — หน้าจอเป็นของเรา ข้อมูลเป็นของเขา
 *
 * ★ **หลักของทั้งหน้าอยู่กล่องบนสุด: ล้างให้สะอาดก่อน แล้วค่อยฆ่าเชื้อ**
 *   ถ้าคนอ่านจับได้แค่ประโยคเดียวจากหน้านี้ ต้องเป็นประโยคนั้น เพราะความผิดที่แพงที่สุด
 *   ไม่ใช่เลือกน้ำยาผิด แต่คือพ่นน้ำยาลงบนคราบมูลแล้วเชื่อว่าฆ่าเชื้อแล้ว
 *   ➜ จึงวางเป็นกล่องแรกและมี `SOURCE_NOTE` ติดอยู่ที่นั้น (กล่องที่คนเห็นก่อนเลื่อน)
 *
 * ★ **ขั้นตอนใช้ "เลข" เป็นเครื่องหมายหลัก ไม่ใช่ไอคอน** — สองรายการนี้เป็นลำดับงาน
 *   ข้ามขั้นแล้วขั้นหลังไม่ได้ผล (เช่นพ่นน้ำยาตอนพื้นยังเปียก = น้ำยาเจือจางกว่าฉลาก)
 *   ไอคอนสวยแต่ไม่บอกลำดับ ส่วนเลขบอก และชุดไอคอนเราไม่มีตัวตรงตัวพอ
 *   (พลั่ว · ท่อ · โฟม) ยัดเข้าไปจะได้ไอคอนซ้ำกันสามขั้นซึ่งอ่านยากกว่าไม่ใส่
 *
 * ★ **`why` ของทุกขั้นห้ามตัดทิ้ง** — เหตุผลคือสิ่งที่ทำให้คนไม่ข้ามขั้นตอนที่ดูเสียเวลา
 *   (แช่น้ำ 2-4 ชม. · พักคอก 5-7 วัน) รายการที่บอกแค่ว่าต้องทำอะไรจะถูกลัดทุกครั้งที่งานรีบ
 */
import PageHeader from "../../components/ui/PageHeader.jsx";
import PageBoard, { Block } from "../../components/board/PageBoard.jsx";
import Card from "../../components/ui/Card.jsx";
import Icon from "../../components/ui/Icon.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import {
  BARN_STEPS,
  COMPONENTS,
  DISINFECTANTS,
  GOLDEN_RULE,
  MIX_RULES,
  ROUTINE,
  SOURCE_NOTE,
  VEHICLE_RISK,
  VEHICLE_STEPS,
} from "../../data/farmy/biosecurity.js";
import { iconFor } from "../../data/farmy/icons.js";
import { formatNumber } from "../../lib/format.js";
import { useT } from "../../lib/i18n/useT.js";
import "./guide.css";

/**
 * ระดับความเสี่ยงของรถ (คำไทยของทีม Farmy) → โทนป้ายสถานะของเรา
 *
 * ไม่มีระดับไหนเป็น `good` โดยตั้งใจ — รถทุกคันที่เข้าฟาร์มมีความเสี่ยงทั้งหมด
 * ป้ายเขียวว่า "ปกติ" ข้างรถส่วนตัวจะอ่านได้ว่าไม่ต้องล้าง ซึ่งตรงข้ามกับเนื้อหา
 */
const RISK_TONE = {
  สูงมาก: "critical",
  สูง: "serious",
  ปานกลาง: "warning",
};

/** ขั้นตอนหนึ่งขั้น — ใช้ร่วมกันทั้งรายการล้างโรงเรือนและรายการล้างรถ */
function Step({ step, t }) {
  return (
    <li className="gd-step">
      <span className="gd-step-n" aria-hidden="true">
        {formatNumber(step.n)}
      </span>
      <div className="gd-step-body">
        <h4>{t(step.title)}</h4>
        {/* เวลาที่ต้องใช้ — มีเฉพาะรายการล้างโรงเรือน เพราะบางขั้นกินเป็นวัน
            และคนวางแผนพักคอกต้องเห็นตัวเลขนี้ก่อนตกลงวันลงหมูรุ่นใหม่ */}
        {step.time && (
          <p className="gd-step-time">
            <Icon name="clock" size={14} aria-hidden="true" />
            {t(step.time)}
          </p>
        )}
        <p className="gd-step-why">{t(step.why)}</p>
        {step.dos?.length > 0 && (
          <ul className="gd-step-dos">
            {step.dos.map((line) => (
              <li key={line}>
                <Icon name="check" size={14} aria-hidden="true" />
                <span>{t(line)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export default function Cleaning() {
  const t = useT();

  return (
    <>
      <PageHeader
        title={t("ทำความสะอาด & ฆ่าเชื้อ")}
        subtitle={t("ล้างโรงเรือน {b} ขั้น · ล้างรถ {v} ขั้น · น้ำยาฆ่าเชื้อ {d} กลุ่ม", {
          b: formatNumber(BARN_STEPS.length),
          v: formatNumber(VEHICLE_STEPS.length),
          d: formatNumber(DISINFECTANTS.length),
        })}
      />

      <PageBoard boardId="guideCleaning">
        <Block id="rule" label={t("หลักสำคัญ")}>
          <Card title={t("หลักที่ใช้ทั้งหน้า")} icon="spark">
            <p className="gd-rule">
              <Icon name="spark" size={20} aria-hidden="true" />
              <span>
                <b>{t(GOLDEN_RULE.title)}</b>
                {t(GOLDEN_RULE.body)}
              </span>
            </p>
            {/* ★ ที่มาต้องอยู่บนจอเสมอ (ข้อกำหนดของทีม Farmy) — วางในกล่องบนสุด
                ซึ่งเป็นกล่องเดียวที่คนเห็นแน่นอนก่อนเลื่อนหน้า */}
            <p className="gd-source">
              <Icon name="info" size={14} aria-hidden="true" />
              {t(SOURCE_NOTE)}
            </p>
          </Card>
        </Block>

        <Block id="barn" label={t("ล้างโรงเรือน")}>
          <Card
            title={t("ล้างโรงเรือนหลังย้ายหมูออก")}
            subtitle={t("เรียงตามลำดับ — ข้ามขั้นไหนไป ขั้นที่เหลือก็ไม่ได้ผลตามไปด้วย")}
            icon="home"
          >
            <ol className="gd-steps">
              {BARN_STEPS.map((s) => (
                <Step key={s.id} step={s} t={t} />
              ))}
            </ol>
          </Card>
        </Block>

        <Block id="vehicle" label={t("ล้างยานพาหนะ")}>
          <Card
            title={t("ล้างและฆ่าเชื้อยานพาหนะ")}
            subtitle={t("บ่อจุ่มล้อคือด่านสุดท้าย ไม่ใช่ด่านเดียว")}
            icon="send"
          >
            <ol className="gd-steps">
              {VEHICLE_STEPS.map((s) => (
                <Step key={s.id} step={s} t={t} />
              ))}
            </ol>
          </Card>
        </Block>

        <Block id="risk" label={t("รถคันไหนเสี่ยงแค่ไหน")}>
          <Card
            title={t("รถคันไหนเสี่ยงแค่ไหน")}
            subtitle={t("ไม่มีคันไหนปลอดภัยเอง ต่างกันแค่ว่าต้องกันแน่นแค่ไหน")}
            icon="warn"
          >
            <ul className="gd-rows">
              {VEHICLE_RISK.map((r) => (
                <li key={r.label} className="gd-row">
                  <span className="gd-row-main">
                    <b>{t(r.label)}</b>
                    <span className="gd-row-sub">{t(r.note)}</span>
                  </span>
                  <span className="gd-row-side">
                    <StatusBadge tone={RISK_TONE[r.level] ?? "warning"}>
                      {t("เสี่ยง{level}", { level: t(r.level) })}
                    </StatusBadge>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Block>

        <Block id="chem" label={t("น้ำยาฆ่าเชื้อ")}>
          <Card
            title={t("น้ำยาฆ่าเชื้อ — เลือกให้ถูกงาน")}
            subtitle={t("ทุกกลุ่มมีข้อจำกัด ไม่มีกลุ่มไหนใช้ได้กับทุกงาน")}
            icon="drop"
          >
            <ul className="gd-chems">
              {DISINFECTANTS.map((d) => (
                <li key={d.name} className="gd-chem">
                  <h4>{t(d.name)}</h4>
                  <p className="gd-chem-use">
                    <Icon name="pin" size={14} aria-hidden="true" />
                    {t(d.use)}
                  </p>
                  <p className="gd-chem-good">
                    <Icon name="check" size={14} aria-hidden="true" />
                    {t(d.good)}
                  </p>
                  {/* ★ ข้อควรระวังอยู่ในกล่องเน้น ไม่ใช่บรรทัดธรรมดา — ของในนี้กัดผิวหนัง
                      กัดโลหะ และเสื่อมฤทธิ์เงียบ ๆ อ่านข้ามแล้วเสียของหรือเจ็บตัว */}
                  <p className="gd-chem-care">
                    <Icon name="warn" size={14} aria-hidden="true" />
                    {t(d.care)}
                  </p>
                </li>
              ))}
            </ul>

            <h4 className="gd-head">{t("กติกาการผสมและการใช้")}</h4>
            <ul className="gd-rules">
              {MIX_RULES.map((line) => (
                <li key={line}>
                  <Icon name="check" size={15} aria-hidden="true" />
                  <span>{t(line)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Block>

        <Block id="components" label={t("ระบบความปลอดภัยทางชีวภาพ")}>
          <Card
            title={t("ระบบความปลอดภัยทางชีวภาพ {n} ด้าน", { n: formatNumber(COMPONENTS.length) })}
            subtitle={t("ล้างโรงเรือนอย่างเดียวไม่พอ ถ้าทางเข้าของเชื้อยังเปิดอยู่")}
            icon="shield"
          >
            <div className="gd-comps">
              {COMPONENTS.map((c) => (
                <section key={c.id} className="gd-comp">
                  <h4>
                    <Icon name={iconFor(c.icon)} size={18} aria-hidden="true" />
                    {t(c.title)}
                  </h4>
                  <p className="gd-comp-lead">{t(c.lead)}</p>
                  <ul>
                    {c.items.map((line) => (
                      <li key={line}>{t(line)}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </Card>
        </Block>

        <Block id="routine" label={t("งานประจำ")}>
          <Card
            title={t("งานประจำ")}
            subtitle={t("ของที่ต้องทำซ้ำ ๆ — ดูรายการตรวจเต็มได้ที่หน้าเช็กลิสต์ฟาร์ม")}
            icon="clock"
            action={{ to: "/dashboard/guide/checklist", label: t("ไปหน้าเช็กลิสต์ฟาร์ม"), icon: "list" }}
          >
            <div className="gd-routine">
              {ROUTINE.map((r) => (
                <section key={r.when} className="gd-when">
                  <h4>
                    <Icon name={iconFor(r.icon)} size={18} aria-hidden="true" />
                    {t(r.when)}
                  </h4>
                  <ul>
                    {r.items.map((line) => (
                      <li key={line}>{t(line)}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </Card>
        </Block>
      </PageBoard>
    </>
  );
}
