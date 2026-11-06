/**
 * การ์ด "ควบคุมอุปกรณ์" — พัดลม 5 ตัว และปั๊มน้ำ 3 ตัว พร้อมสวิตช์สั่งงาน
 *
 * สวิตช์ใช้ <button role="switch" aria-checked> ไม่ใช่ checkbox ที่ตกแต่ง
 * เพราะนี่คือ "สั่งเปิด/ปิดอุปกรณ์" ไม่ใช่ "ติ๊กเลือกในฟอร์ม" — โปรแกรมอ่านหน้าจอจะได้อ่านถูก
 *
 * สถานะ "หยุด" ของอุปกรณ์ไม่ใช่ความผิดปกติ จึงเป็นชิปกลาง ๆ ไม่ใช่ป้ายสถานะ
 * (ป้ายสถานะเก็บไว้ให้ "ทำงาน" "กระแสสูงผิดปกติ" และ "ไม่มีสัญญาณ" เท่านั้น)
 *
 * **คำสั่งวิ่งผ่านหลังบ้านแล้ว** (T1.284) — หน้าจอจะเปลี่ยนก็ต่อเมื่อหลังบ้านรับคำสั่ง
 * และหลังบ้านมีด่านความปลอดภัยที่ปฏิเสธ/ถามกลับได้ (ปิดพัดลมตอนอากาศถึงเพดานไม่ได้)
 * แต่ปลายทางสุดท้ายยัง **ไม่ถึงตู้จริง** เพราะยังไม่มีสิทธิ์เขียนเข้าระบบของอีกฝ่าย —
 * คำสั่งจึงค้างอยู่ในคิว และข้อความบนการ์ดต้องบอกตรง ๆ ห้ามเขียนแค่ "สำเร็จ"
 * (สำเนาที่วางบนโฮสต์คนอื่นไม่มีหลังบ้าน — โหมดนั้นยังเปลี่ยนเฉพาะในหน้าจอเหมือนเดิม)
 */
import Card from "../ui/Card.jsx";
import Icon from "../ui/Icon.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";
import AdminNote from "../ui/AdminNote.jsx";
import { useAuth } from "../../lib/auth/useAuth.js";
import { formatDateTime, formatNumber, formatNumber1 } from "../../lib/format.js";
import { statusShort, statusText } from "../../lib/api/control.js";
import "./systems.css";
import { useT } from "../../lib/i18n/useT.js";

const FAN_STATE = {
  on: { tone: "good", label: "ทำงาน" },
  warn: { tone: "warning", label: "กระแสสูง" },
  offline: { tone: "offline", label: "ไม่มีสัญญาณ" },
  /* ★ "ไม่ทราบสถานะ" ≠ "ไม่มีสัญญาณ" — อันแรกคือกล่องไม่ได้ส่งค่ากลับมาเลย
     อันหลังคืออุปกรณ์เงียบ ซึ่งเป็นการยืนยันว่ามีคนตามดูอยู่แล้วพบว่าเงียบ
     เขียนรวมกันเมื่อไร คนอ่านจะนึกว่าพัดลมเสีย ทั้งที่ไม่มีใครรู้ว่ามันเป็นอะไร (T1.336) */
  unknown: { tone: "offline", label: "ไม่ทราบสถานะ" },
};

/**
 * คำสั่งล่าสุดของอุปกรณ์ตัวหนึ่ง → ข้อความสั้นใต้สวิตช์ (null = ยังไม่เคยสั่ง)
 *
 * ใช้ `statusShort` ไม่ใช่ `statusText` — ฉบับเต็มยาวเกือบห้าสิบตัวอักษร
 * วางในช่องกว้าง ~94px แล้วดันการ์ดพัดลมสูงขึ้นเท่าตัว
 * (ย่อได้ แต่ยังต้องส่ง `transport` ไปด้วย ไม่งั้น `held` สองแบบจะอ่านเหมือนกัน)
 */
const lastLine = (t, last) => {
  if (!last?.action) return null;
  const when = last.at ? formatDateTime(last.at) : null;
  const what = last.action === "off" ? t("สั่งหยุด") : t("สั่งเดิน");
  const where = t(statusShort(last.status, last.transport));
  return when
    ? t("{what} {when} · {where}", { what, when, where })
    : t("{what} · {where}", { what, where });
};

/**
 * @param {object}   equipment ผลของ getEquipment() (หรือชุดที่ผู้ใช้แก้แล้ว)
 * @param {function} onToggleFan  (index) => void
 * @param {function} onTogglePump (index) => void
 * @param {ReactNode} [toolbar] แถบเลือกก่อนถึงรายการอุปกรณ์ — หน้าที่คุมหลายโรงเรือน
 *                              ใช้วางปุ่มเลือกว่ากำลังสั่งหลังไหนอยู่ (ไม่ส่ง = ไม่มีแถบนี้)
 * @param {string}   [title]   หัวการ์ด — เปลี่ยนได้เมื่อการ์ดนี้ทำหน้าที่มากกว่าสั่งอุปกรณ์
 * @param {object}   [control] ผลจาก useEquipmentCommand() — ส่งมาเมื่อคำสั่งวิ่งผ่านหลังบ้านจริง
 *                             ไม่ส่ง = โหมดเดิมที่เปลี่ยนแค่ในเครื่อง (สำเนาบนโฮสต์คนอื่น)
 */
export default function EquipmentPanel({
  equipment,
  onToggleFan,
  onTogglePump,
  toolbar,
  title,
  control,
}) {
  const t = useT();
  const { online, auto, fans, pumps } = equipment;
  /* ★ `known === false` = กล่องบอกได้ว่ามีอุปกรณ์อะไรให้สั่ง แต่ไม่ส่งค่ากลับว่าตัวไหนเดินอยู่
     การ์ดจึงห้ามนับ "กี่ตัวกำลังทำงาน" และห้ามเขียนโหมด AUTO/MANUAL (T1.336) */
  const known = equipment.known !== false;
  const fansRunning = fans.filter((f) => f.state === "on" || f.state === "warn").length;
  const pumpsRunning = pumps.filter((p) => p.running).length;
  /* หัวกลุ่มบอกจำนวนเท่าที่รู้จริง — ไม่รู้ก็บอกแค่ว่ามีกี่ตัว */
  /* อายุของค่าอุณหภูมิที่ด่านใช้ — เกินเพดานเมื่อไร ด่านจะห้ามคำสั่งที่ลดความเย็น
     (กติกาอยู่ที่ server/src/control/limits.js — ที่นี่แค่บอกคนกดว่ากำลังจะเจออะไร) */
  const stale = equipment.temp?.tempAgeMinutes == null
    ? null
    : Math.round(equipment.temp.tempAgeMinutes);
  const tempStale =
    stale != null &&
    equipment.temp?.staleAfterMinutes != null &&
    stale > equipment.temp.staleAfterMinutes;

  const groupCount = (running, total) =>
    known
      ? t("{running}/{total} กำลังทำงาน", {
          running: formatNumber(running),
          total: formatNumber(total),
        })
      : t("{total} ตัว · ไม่ทราบว่าเดินอยู่กี่ตัว", { total: formatNumber(total) });

  /**
   * สั่งอุปกรณ์ได้ตั้งแต่ระดับผู้ควบคุมอุปกรณ์ขึ้นไป (ดู lib/auth/roles.js · T1.251)
   *
   * เป็นการกระทำเดียวในแอปที่ "ออกไปถึงของจริง" — ปิดพัดลมผิดตัวคือสุกรร้อนจริง
   * และเปิดค้างคือค่าไฟจริง จึงเป็นเส้นแบ่งที่ชัดที่สุดระหว่างดูกับสั่ง
   * ตัวเลขและสถานะอุปกรณ์ทั้งหมดยังเห็นครบเท่ากันทั้งสองสิทธิ์ — ล็อกแค่ "สวิตช์"
   */
  const canControl = useAuth().can("equipment.control");
  /* ปิดสวิตช์ทั้งเมื่อตู้ควบคุมออฟไลน์ และเมื่อสิทธิ์ไม่ถึง — คนละเหตุผลแต่ผลเหมือนกัน
     บวกอีกข้อ: ระหว่างรอหลังบ้านตอบ ต้องกดซ้ำไม่ได้ ไม่งั้นคำสั่งตีกันเองและไปติดด่านสั่งถี่ */
  const locked = !online || !canControl || Boolean(control?.busy);

  return (
    <Card className="eq-card">
      <header className="eq-head">
        <span className="icon-chip is-sm" aria-hidden="true">
          <Icon name="monitor" size={18} />
        </span>
        <h3>{title ?? t("ควบคุมอุปกรณ์")}</h3>
        {/* ตู้ควบคุมออฟไลน์ไม่ได้แปลว่า "สั่งเอง" — ต้องบอกตรง ๆ ว่าสั่งอะไรไม่ได้เลย */}
        <span className={"eq-mode" + (online && auto ? "" : " is-off")}>
          {!online
            ? t("ตู้ควบคุมออฟไลน์")
            : auto == null
              ? t("ไม่ทราบโหมด")
              : auto
                ? t("โหมด AUTO")
                : t("โหมด MANUAL")}
        </span>
      </header>

      {toolbar && <div className="eq-toolbar">{toolbar}</div>}

      {/* ★ บอกตั้งแต่ต้นการ์ดว่า "รู้อะไร" กับ "ไม่รู้อะไร" — ไม่ใช่ปล่อยให้คนอ่าน
          เห็นป้าย "ไม่ทราบสถานะ" แปดใบแล้วเดาเอาเองว่าระบบพัง
          (บทเรียน T1.335 — ทางถอยที่เงียบคือทางถอยที่หลอกคน) */}
      {!known && (
        <p className="eq-note is-lead">
          <Icon name="monitor" size={16} aria-hidden="true" />
          {t(
            "กล่องบอกได้ว่าโรงเรือนนี้มีอุปกรณ์อะไรให้สั่ง แต่ไม่ได้ส่งค่ากลับว่าตัวไหนเดินอยู่ — รอบ (Hz) และกระแส (A) จึงเป็นขีดกลาง และยังสั่งงานได้ตามปกติ",
          )}
        </p>
      )}

      {/* ★ ค่าที่ด่านความปลอดภัยใช้ตัดสิน — กล่องส่งมาให้อยู่แล้วแต่เดิมไม่เคยเอามาแสดง
          คนกดจึงไม่รู้ว่าทำไมคำสั่งปิดพัดลมถึงถูกถามกลับ หรือทำไมถึงถูกห้าม
          ★★ อายุของค่าสำคัญเท่าตัวค่า — ค่าที่เก่าเกินเพดานทำให้ด่าน "ไม่รู้ ก็ไม่ให้ลด"
             ถ้าโชว์แต่ตัวเลขโดยไม่บอกว่าเก่าแค่ไหน คนอ่านจะนึกว่าเป็นค่าสด */}
      {equipment.temp?.tempC != null && (
        <p className="eq-gate-now">
          <Icon name="thermometer" size={16} aria-hidden="true" />
          {t("ด่านอุณหภูมิใช้ค่า {temp} °C", {
            temp: formatNumber1(equipment.temp.tempC),
          })}
          {equipment.tempMax != null &&
            " · " + t("เพดาน {max} °C", { max: formatNumber(equipment.tempMax) })}
          {stale != null && " · " + t("ค่าอายุ {n} นาที", { n: formatNumber(stale) })}
          {tempStale && " · " + t("เก่าเกินเกณฑ์ — คำสั่งที่ลดความเย็นจะถูกห้ามไว้ก่อน")}
        </p>
      )}

      {!canControl && (
        <AdminNote action="equipment.control">
          {t("ดูสถานะอุปกรณ์ได้ทั้งหมด แต่สั่งเปิด/ปิดไม่ได้ — ขอเปลี่ยนระดับได้จากผู้ดูแลระบบ")}
        </AdminNote>
      )}

      {/* ---------- ผลจากด่านความปลอดภัยของคำสั่ง (T1.284) ----------

          สามสถานะที่ต้องแยกให้คนกดเห็นชัด เพราะทำอะไรต่อไม่เหมือนกันเลย
            ถามกลับ  มีปุ่มยืนยัน — ตั้งใจแล้วก็ทำได้
            ห้าม     ไม่มีปุ่มยืนยัน — กดอีกกี่ครั้งก็ไม่ผ่าน ต้องไปทำอย่างอื่น
            รับแล้ว  บอกตรง ๆ ว่าคำสั่งไปถึงไหน ห้ามเขียนแค่ "สำเร็จ"
                     เพราะวันนี้มันยังไม่ถูกส่งออกไปที่ตู้จริง */}
      {control?.asking && (
        <div className="eq-gate is-ask" role="alertdialog" aria-live="polite">
          <Icon name="warn" size={18} aria-hidden="true" />
          <p>{control.asking.message}</p>
          <div className="eq-gate-actions">
            <button type="button" className="eq-gate-go" onClick={control.confirm} disabled={control.busy}>
              {t("ยืนยันคำสั่ง")}
            </button>
            <button type="button" className="eq-gate-no" onClick={control.cancel}>
              {t("ไม่สั่ง")}
            </button>
          </div>
        </div>
      )}

      {control?.error && (
        <div className="eq-gate is-stop" role="alert">
          <Icon name="warn" size={18} aria-hidden="true" />
          <p>{control.error.message}</p>
          <button type="button" className="eq-gate-no" onClick={control.clear}>
            {t("ปิดข้อความ")}
          </button>
        </div>
      )}

      {control?.result && (
        <div className="eq-gate is-done" role="status">
          <Icon name="check" size={18} aria-hidden="true" />
          <p>
            {t("รับคำสั่ง {device} แล้ว", { device: control.result.command.deviceId })}
            {" — "}
            {statusText(
              control.result.entry?.status ?? (control.result.held ? "held" : "sent"),
              control.result.entry?.transport,
            )}
          </p>
          <button type="button" className="eq-gate-no" onClick={control.clear}>
            {t("ปิดข้อความ")}
          </button>
        </div>
      )}

      {/* ---------- พัดลม ---------- */}
      <div className="eq-group">
        <p className="eq-group-head">
          <Icon name="fan" size={18} aria-hidden="true" />
          <b>{t("พัดลม · FANS")}</b>
          <span className="eq-group-count num">{groupCount(fansRunning, fans.length)}</span>
        </p>

        <ul className="eq-fans">
          {fans.map((fan, i) => {
            const running = fan.state === "on" || fan.state === "warn";
            const badge = FAN_STATE[fan.state];
            const note = lastLine(t, fan.last);
            /* แถวที่ปิดไว้ในทะเบียนของกล่องสั่งไม่ได้ — ล็อกตัวนั้น ไม่ใช่ล็อกทั้งการ์ด */
            const off = locked || fan.enabled === false;
            return (
              <li key={fan.id} className={`eq-fan is-${fan.state}`}>
                <span className="eq-fan-icon" aria-hidden="true">
                  <Icon name="fan" size={26} />
                </span>
                <b className="eq-fan-name">{fan.id}</b>
                <span className="eq-fan-read num">
                  {fan.hz == null ? "—" : formatNumber(fan.hz)} Hz
                </span>
                <span className="eq-fan-read num">
                  {fan.amp == null ? "—" : formatNumber1(fan.amp)} A
                </span>

                {badge ? (
                  <StatusBadge tone={badge.tone}>{t(badge.label)}</StatusBadge>
                ) : (
                  <span className="eq-chip">{t("หยุด")}</span>
                )}

                {/* คำสั่งล่าสุดคือสิ่งที่กล่อง**รู้จริง** ต่างจากสถานะการทำงานที่ไม่รู้
                    ★ ต้องอยู่**เหนือ**สวิตช์ — มีบางใบไม่มีบรรทัดนี้ ถ้าวางไว้ใต้สวิตช์
                      สวิตช์ของแต่ละใบจะอยู่คนละความสูงกัน (ปัญหาเดียวกับ .eq-pump-name) */}
                {note && <span className="eq-fan-last">{note}</span>}

                <button
                  type="button"
                  role="switch"
                  aria-checked={running}
                  aria-label={
                    canControl
                      ? t("{id} — {state}", {
                          id: fan.id,
                          state: running
                            ? t("กำลังทำงาน กดเพื่อหยุด")
                            : t("หยุดอยู่ กดเพื่อเริ่ม"),
                        })
                      : t("{id} — {state} · ต้องมีสิทธิ์ระดับผู้ควบคุมอุปกรณ์ขึ้นไป", {
                          id: fan.id,
                          state: running ? t("กำลังทำงาน") : t("หยุดอยู่"),
                        })
                  }
                  className={"eq-switch" + (canControl ? "" : " is-locked")}
                  disabled={off}
                  title={canControl ? undefined : t("ต้องมีสิทธิ์ระดับผู้ควบคุมอุปกรณ์ขึ้นไป")}
                  onClick={() => onToggleFan(i)}
                >
                  <span className="eq-switch-knob" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ---------- ปั๊มน้ำ ---------- */}
      <div className="eq-group">
        <p className="eq-group-head">
          <Icon name="drop" size={18} aria-hidden="true" />
          <b>{t("ปั๊มน้ำ · PUMPS")}</b>
          <span className="eq-group-count num">{groupCount(pumpsRunning, pumps.length)}</span>
        </p>

        <ul className="eq-pumps">
          {pumps.map((pump, i) => (
            <li key={pump.id} className={"eq-pump" + (pump.running ? " is-on" : "")}>
              <b className="eq-pump-name">
                {t("{name} · {duty}", { name: pump.name, duty: t(pump.duty) })}
              </b>

              {!online ? (
                <StatusBadge tone="offline">{t("ไม่มีสัญญาณ")}</StatusBadge>
              ) : pump.running == null ? (
                <StatusBadge tone="offline">{t("ไม่ทราบสถานะ")}</StatusBadge>
              ) : pump.running ? (
                <StatusBadge tone="good">{t("กำลังทำงาน")}</StatusBadge>
              ) : (
                <span className="eq-chip">{t("หยุดทำงาน")}</span>
              )}

              {/* ★ ขีดกลางที่ขนาดตัวเลขสถิติ (--text-stat) กลายเป็นแถบทึบยาว อ่านเหมือนถูกปิดทับ
                  ไม่ใช่เหมือน "ไม่มีค่า" — ย่อลงเท่าตัวหนังสือปกติเมื่อไม่มีค่า */}
              <span className="eq-pump-value">
                <b className={"num" + (pump.amp == null ? " is-dash" : "")}>
                  {pump.amp == null ? "—" : formatNumber1(pump.amp)}
                </b>
                <em>A</em>
              </span>
              <span className="eq-pump-meta num">
                {pump.watt == null ? "—" : formatNumber(pump.watt)} W · 220 V
              </span>

              {lastLine(t, pump.last) && (
                <span className="eq-pump-last">{lastLine(t, pump.last)}</span>
              )}

              <button
                type="button"
                className={"eq-pump-btn" + (canControl ? "" : " is-locked")}
                disabled={locked || pump.enabled === false}
                title={canControl ? undefined : t("ต้องมีสิทธิ์ระดับผู้ควบคุมอุปกรณ์ขึ้นไป")}
                onClick={() => onTogglePump(i)}
              >
                <Icon
                  name={canControl ? (pump.running ? "power" : "check") : "lock"}
                  size={17}
                />
                {pump.running ? t("สั่งหยุด") : t("สั่งเริ่ม")}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* ★ สองโหมดนี้ต่างกันมาก ห้ามเขียนข้อความเดียวคลุมทั้งคู่
          ชุดตัวอย่าง  กดแล้วเปลี่ยนแค่บนหน้าจอเครื่องนี้ ไม่มีใครรู้เรื่องด้วย
          ของจริงจากกล่อง  คำสั่งถูกตรวจและบันทึกลงฐานจริง แต่ยังไม่ถูกส่งออกไปที่ตู้
                          (`canSend: false`) — คนกดต้องรู้ว่าพัดลมยังไม่ได้ขยับ */}
      <p className="eq-note">
        <Icon name="clock" size={16} aria-hidden="true" />
        {equipment.from === "box"
          ? equipment.canSend
            ? t("คำสั่งถูกส่งออกไปที่ตู้ควบคุมจริง")
            : t(
                "คำสั่งถูกตรวจและบันทึกไว้ที่กล่องแล้ว แต่ยังส่งออกไปที่ตู้ควบคุมจริงไม่ได้ — พัดลมและปั๊มยังไม่ขยับตามที่กด",
              )
          : t(
              "ยังไม่ได้ต่อกับตู้ควบคุมจริง — กดแล้วเปลี่ยนเฉพาะบนหน้าจอ และตัวเลขระบบไฟฟ้าจะขยับตาม",
            )}
      </p>
    </Card>
  );
}
