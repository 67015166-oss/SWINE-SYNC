/**
 * ป๊อบอัพ "ปรับจำนวน" — ใช้ได้กับทุกตัวเลขที่ผู้ใช้ต้องเพิ่ม/ลดเอง
 * ตอนนี้ใช้กับจำนวนสุกรรายโรงเรือน (หน้าโรงเรือนในฟาร์ม · หน้าฝูงสุกร)
 *
 * โครงตามลำดับที่คนหน้าฟาร์มคิดจริง ๆ:
 *   1. เพิ่ม หรือ ลด          ← เลือกทิศทางก่อน จะได้ไม่ต้องคิดเรื่องเครื่องหมายลบ
 *   2. เพราะอะไร              ← เหตุผลเปลี่ยนตามทิศทางที่เลือก (ย้ายออก/ขาย/ตาย ไม่มีทางเป็นบวก)
 *   3. กี่ตัว                 ← ปุ่ม −/+ กับปุ่มลัด ไม่ต้องพิมพ์ก็ได้
 *   4. เห็นผลลัพธ์ก่อนกดยืนยัน ← "1,024 → 1,050 (+26)" อยู่ตรงหน้าตลอด
 *
 * ทำไมแยกทิศทางออกจากจำนวน แทนที่จะให้กรอกเลขติดลบ:
 * คนกรอกงานหน้าฟาร์มพิมพ์ผิดเครื่องหมายง่ายมาก และ "−26" กับ "26" หน้าตาต่างกันนิดเดียว
 * แต่ผลต่างกัน 52 ตัว — บังคับเลือกทิศทางเป็นปุ่มใหญ่แยกกันจึงพลาดยากกว่า
 *
 * ทุกครั้งที่ปรับจะถูกบันทึกเป็นรายการพร้อมเหตุผลและเวลา ถอนคืนได้ทีละรายการ
 *
 * ═══ ★ ส่วนต่างทั้งหมดอยู่ใน localStorage ของเครื่องนี้ ไม่เคยถึงระบบกลาง ═══
 * ตั้งใจให้เป็นอย่างนั้นตั้งแต่ต้น เพราะชั้นนี้มีไว้ทับข้อมูล**ตัวอย่าง**
 * แต่ปุ่มเดียวกันนี้โผล่ที่โรงเรือนจริงด้วย และตอนกดยืนยันมันปิดป๊อบอัพเงียบ ๆ
 * เหมือนบันทึกเข้าระบบสำเร็จทุกประการ — ผู้ใช้จึงกรอกแล้วไม่เห็นเลขขึ้นที่ไหนเลย
 * และฝั่งเซิร์ฟเวอร์ก็ไม่มีร่องรอยอะไรให้ไล่ เพราะไม่เคยมีคำขอส่งไปถึง (T1.339)
 * ➜ โรงเรือนที่อยู่ในระบบกลางต้องขึ้นคำเตือนก่อนกด ไม่ใช่รู้ตัวตอนไปเปิดฐานดู
 */
import { useEffect, useState } from "react";
import Modal from "../ui/Modal.jsx";
import Icon from "../ui/Icon.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";
import AdminNote from "../ui/AdminNote.jsx";
import { useAdjust } from "../../lib/adjust/useAdjust.js";
import { QUICK, REASONS, REASON_LABEL } from "./reasons.js";
import { formatNumber, formatDateTime } from "../../lib/format.js";
import "./adjust.css";
import { useT } from "../../lib/i18n/useT.js";

/**
 * @param {boolean}  open
 * @param {function} onClose
 * @param {string}   target  คีย์จาก targetKey() เช่น "barn:F-CNX-A1:pigs"
 * @param {string}   title   ชื่อสิ่งที่กำลังปรับ เช่น "โรงเรือน A1"
 * @param {string}   [subtitle]
 * @param {number}   base    ค่าตั้งต้นจากข้อมูลระบบ (ยังไม่รวมส่วนต่างที่ผู้ใช้ปรับ)
 * @param {string}   [unit]  หน่วย เช่น "ตัว"
 * @param {number}   [max]   เพดาน เช่น ความจุโรงเรือน — เกินแล้วเตือน แต่ยังบันทึกได้
 * @param {boolean}  [inSystem] สิ่งที่กำลังปรับมีอยู่ในระบบกลาง (โรงเรือนจริง)
 *                   — ส่วนต่างจะไม่ถึงระบบ ต้องบอกก่อนกด
 */
export default function AdjustModal({
  open,
  onClose,
  target,
  title,
  subtitle,
  base,
  unit = "ตัว",
  max = null,
  inSystem = false,
}) {
  const t = useT();
  const { valueOf, netOf, historyOf, apply, undo, canWrite } = useAdjust();
  const [dir, setDir] = useState("up");
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState(REASONS.up[0].id);
  const [note, setNote] = useState("");

  /* เปิดใหม่ทุกครั้ง = เริ่มจากค่าตั้งต้น ไม่ค้างค่าของโรงเรือนก่อนหน้า */
  useEffect(() => {
    if (!open) return;
    setDir("up");
    setAmount(1);
    setReason(REASONS.up[0].id);
    setNote("");
  }, [open, target]);

  /* เล้าที่มีบันทึกในฐานแล้ว = ปรับในเครื่องไม่มีผล (ดู `barnCount` ใน lib/herdCount.js) */
  const blocked = inSystem;
  const current = valueOf(target, base);
  const net = netOf(target);
  const step = dir === "up" ? amount : -amount;
  const next = Math.max(0, current + step);
  /* ลดเกินกว่าที่มีอยู่ = ตัดให้เหลือ 0 ต้องบอกให้เห็น ไม่ใช่เงียบ ๆ แล้วบันทึกไปคนละจำนวน */
  const clamped = current + step < 0;
  const over = max != null && next > max;
  const history = historyOf(target);

  const confirm = () => {
    /* ★ เล้าที่นับจากบันทึกในฐานได้แล้ว กดบันทึกไม่ได้ (T1.340)
       ไม่ใช่เพราะสิทธิ์ แต่เพราะ `barnCount` ให้บันทึกในฐานชนะค่าในเครื่องเสมอ
       ส่วนต่างที่ปรับตรงนี้จึง **ไม่มีวันถูกแสดงที่ไหนเลย** — ปุ่มที่กดแล้วไม่เกิดอะไรขึ้น
       แย่กว่าปุ่มที่ปิดอยู่ เพราะผู้ใช้ไม่รู้ว่าต้องไปทำอย่างอื่นแทน */
    if (!canWrite || blocked || amount <= 0) return;
    /* บันทึก "ส่วนต่างจริงที่เกิดขึ้น" ไม่ใช่ตัวเลขที่พิมพ์ — ยอดสะสมจึงตรงกับที่เห็นบนจอเสมอ */
    apply({ target, delta: next - current, reason, note: note.trim() });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      align="center"
      size="sm"
      icon="pig"
      title={t("ปรับจำนวนสุกร · {name}", { name: t(title) })}
      subtitle={subtitle}
      footer={
        <div className="aj-actions">
          <button type="button" className="modal-btn" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="modal-btn is-primary"
            onClick={confirm}
            disabled={!canWrite || blocked || amount <= 0 || next === current}
          >
            <Icon name={canWrite ? "check" : "lock"} size={20} />
            บันทึกเป็น {formatNumber(next)} {unit}
          </button>
        </div>
      }
    >
      {/* ปุ่มบันทึกถูกปิดไว้ ต้องบอกเหตุผลเสมอ ห้ามปิดเงียบ ๆ (กติกาใน CLAUDE.md)
          ตัวเลขกับประวัติยังดูได้ครบ — ที่ปิดคือ "การเขียน" อย่างเดียว */}
      {!canWrite && (
        <AdminNote action="record.write">
          {t("ดูจำนวนและประวัติได้ทั้งหมด แต่บันทึกการปรับไม่ได้")}
        </AdminNote>
      )}

      {/* ★ ต้องอยู่**ก่อน**ตัวเลขและปุ่ม ไม่ใช่ท้ายป๊อบอัพ — คนอ่านถึงตัวเลขแล้วกดเลย
          คำเตือนที่อยู่ใต้ปุ่มเท่ากับไม่มี (บทเรียนเดียวกับ T1.335) */}
      {blocked && (
        <p className="aj-local" role="note">
          <Icon name="warn" size={18} aria-hidden="true" />
          <span>
            {t(
              "โรงเรือนนี้อยู่ในระบบกลาง — ยอดของมันนับจากบันทึกในระบบ การปรับตรงนี้เก็บได้แค่ในเครื่องนี้แล้วจะถูกทับ จึงไม่มีผลกับตัวเลขที่เห็น",
            )}{" "}
            <b>
              {t("ให้บันทึกเป็นเหตุการณ์ (ย้ายเข้า/ย้ายออก/ตาย) ที่หน้าโรงเรือนแทน แล้วยอดจะขยับตามทุกหน้า")}
            </b>
          </span>
        </p>
      )}

      {/* ---------- ผลลัพธ์ที่จะได้ อยู่บนสุดและเปลี่ยนตามที่กดทันที ---------- */}
      <div className={"aj-preview is-" + dir}>
        <span className="aj-preview-side">
          <em>{t("ตอนนี้")}</em>
          <b className="num">{formatNumber(current)}</b>
        </span>
        <Icon name="chevron" size={22} className="aj-preview-arrow" aria-hidden="true" />
        <span className="aj-preview-side is-next">
          <em>{t("หลังบันทึก")}</em>
          <b className="num">{formatNumber(next)}</b>
        </span>
        <span className="aj-preview-delta num">
          {step > 0 ? "+" : step < 0 ? "−" : ""}
          {formatNumber(Math.abs(next - current))} {unit}
        </span>
      </div>

      {clamped && (
        <p className="aj-warn">
          <Icon name="warn" size={17} aria-hidden="true" />
          {t("มีอยู่ {n} {unit} ลดได้มากสุดเท่าที่มี — จะบันทึกเป็น 0", {
            n: formatNumber(current),
            unit: t(unit),
          })}
        </p>
      )}
      {over && (
        <p className="aj-warn">
          <Icon name="warn" size={17} aria-hidden="true" />
          {t("เกินความจุ {max} {unit} อยู่ {over} {unit}", {
            max: formatNumber(max),
            over: formatNumber(next - max),
            unit: t(unit),
          })}
        </p>
      )}

      {/* ---------- 1. ทิศทาง ---------- */}
      <div className="aj-dirs" role="radiogroup" aria-label={t("เพิ่มหรือลด")}>
        {[
          { id: "up", label: "เพิ่มจำนวน", icon: "plus" },
          { id: "down", label: "ลดจำนวน", icon: "minus" },
        ].map((d) => (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={dir === d.id}
            className={"aj-dir is-" + d.id + (dir === d.id ? " is-on" : "")}
            onClick={() => {
              setDir(d.id);
              setReason(REASONS[d.id][0].id);
            }}
          >
            <Icon name={d.icon} size={20} />
            {t(d.label)}
          </button>
        ))}
      </div>

      {/* ---------- 2. เหตุผล ---------- */}
      <fieldset className="aj-reasons">
        <legend>{t("เพราะอะไร")}</legend>
        <div className="aj-reason-list">
          {REASONS[dir].map((r) => (
            <label
              key={r.id}
              className={"aj-reason" + (reason === r.id ? " is-on" : "")}
            >
              <input
                type="radio"
                className="sr-only"
                name="aj-reason"
                checked={reason === r.id}
                onChange={() => setReason(r.id)}
              />
              {t(r.label)}
            </label>
          ))}
        </div>
      </fieldset>

      {/* ---------- 3. จำนวน ---------- */}
      <div className="aj-amount">
        <span className="aj-amount-head">{t("จำนวน ({unit})", { unit: t(unit) })}</span>
        <div className="aj-amount-row">
          <button
            type="button"
            className="aj-step"
            onClick={() => setAmount((n) => Math.max(1, n - 1))}
            disabled={amount <= 1}
            aria-label={t("ลดทีละหนึ่ง")}
          >
            <Icon name="minus" size={20} />
          </button>

          <input
            type="number"
            className="aj-input num"
            min="1"
            value={amount}
            onChange={(e) => {
              /* ลบทิ้งทั้งช่องแล้วพิมพ์ใหม่ต้องทำได้ — ระหว่างนั้นถือเป็น 0 (ปุ่มบันทึกจะปิดเอง) */
              const n = Number(e.target.value);
              setAmount(Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
            }}
            aria-label={t("จำนวน ({unit})", { unit: t(unit) })}
          />

          <button
            type="button"
            className="aj-step"
            onClick={() => setAmount((n) => n + 1)}
            aria-label={t("เพิ่มทีละหนึ่ง")}
          >
            <Icon name="plus" size={20} />
          </button>
        </div>

        <div className="aj-quick">
          {QUICK.map((n) => (
            <button
              key={n}
              type="button"
              className={"aj-quick-btn" + (amount === n ? " is-on" : "")}
              onClick={() => setAmount(n)}
            >
              {dir === "up" ? "+" : "−"}
              {formatNumber(n)}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- 4. หมายเหตุ ---------- */}
      <label className="aj-note">
        <span>{t("หมายเหตุ (ไม่บังคับ)")}</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("เช่น ย้ายมาจากโรงเรือน B2")}
        />
      </label>

      {/* ---------- ประวัติการปรับ ---------- */}
      {history.length > 0 && (
        <div className="aj-history">
          <p className="aj-history-head">
            {t("ประวัติการปรับ")}
            <StatusBadge tone={net === 0 ? "good" : "warning"}>
              {net > 0 ? "+" : net < 0 ? "−" : "±"}
              {t("{n} {unit} จากค่าตั้งต้น", { n: formatNumber(Math.abs(net)), unit: t(unit) })}
            </StatusBadge>
          </p>
          <ul className="aj-history-list">
            {history.slice(0, 5).map((e) => (
              <li key={e.id}>
                <b className={"num" + (e.delta >= 0 ? " is-up" : " is-down")}>
                  {e.delta >= 0 ? "+" : "−"}
                  {formatNumber(Math.abs(e.delta))}
                </b>
                <span className="aj-history-text">
                  {t(REASON_LABEL[e.reason] ?? e.reason)}
                  {e.note && ` · ${e.note}`}
                  <em>{formatDateTime(e.at)}</em>
                </span>
                {/* ถอนรายการก็คือการเขียนเหมือนกัน ต้องปิดตามสิทธิ์ด้วย */}
                <button
                  type="button"
                  className="aj-undo"
                  onClick={() => undo(e.id)}
                  disabled={!canWrite}
                  title={
                    canWrite ? t("ถอนรายการนี้") : t("ต้องมีสิทธิ์บันทึกข้อมูลจึงจะถอนรายการได้")
                  }
                  aria-label={t("ถอนรายการ {reason}", {
                    reason: t(REASON_LABEL[e.reason] ?? e.reason),
                  })}
                >
                  <Icon name="cross" size={15} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="aj-foot">
        {t("บันทึกไว้ในเครื่องนี้เท่านั้น ยังไม่ได้ส่งขึ้นระบบกลาง — เปลี่ยนเครื่องแล้วตัวเลขจะกลับเป็นค่าตั้งต้น")}
      </p>
    </Modal>
  );
}
