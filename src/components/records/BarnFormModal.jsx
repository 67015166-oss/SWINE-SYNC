/**
 * ป๊อบอัพ "เพิ่มโรงเรือน" และ "แก้ไขโรงเรือน" — ใบเดียวทำสองหน้าที่
 * ส่ง prop `barn` มา = โหมดแก้ไข
 *
 * ชื่อโรงเรือนในระบบนี้เป็นรหัสโซน+อาคาร ("โรงเรือน A1") ไม่ใช่ชื่ออิสระ
 * ฟอร์มจึงให้เลือกโซนกับหมายเลข แล้วประกอบชื่อให้เอง — คนกรอกจะได้ไม่ตั้งชื่อหลุดรูปแบบ
 * แล้วไปโผล่ในตารางเป็นแถวที่เรียงลำดับไม่เข้าพวก
 *
 * เลขอาคารเริ่มต้นเป็น "เลขถัดไปที่ยังว่างในโซนนั้น" ให้เลย — กดเพิ่มรัว ๆ ก็ไม่ชนกันเอง
 */
import { useEffect, useMemo, useState } from "react";
import Modal from "../ui/Modal.jsx";
import Icon from "../ui/Icon.jsx";
import { useFarmEditor } from "../../lib/records/useFarmEditor.js";
import { ZONES } from "../../data/mock/barnSystems.js";
import "./records.css";
import { useT } from "../../lib/i18n/useT.js";
import { formatNumber } from "../../lib/format.js";
import { pigsField, pigsSeed } from "../../lib/herdCount.js";

/** ช่วงวัยที่เลี้ยงในโรงเรือน — ชุดเดียวกับที่ข้อมูลระบบใช้ */
/* ★ ต้องตรงกับ `STAGES` ใน `server/src/modules/farms/validate.js` เป๊ะ (T1.329)
   ฐานมี check constraint คุมค่าเหล่านี้อยู่ และหลังบ้านตรวจซ้ำอีกชั้น
   เคยเขียนไว้เป็น "คลอด/ลูกสุกร" ซึ่งไม่มีในรายการของหลังบ้าน → บันทึกโรงเรือน
   ด้วยขั้นนี้จะได้ 400 ทุกครั้ง และผู้ใช้เห็นแค่ว่าบันทึกไม่สำเร็จ
   `test/farmAdmin.test.js` เทียบสองฝั่งให้แล้ว แก้ที่เดียวแล้วอีกฝั่งต้องตามด้วย */
const STAGES = ["แม่พันธุ์", "ลูกสุกร", "อนุบาล", "ขุน"];

const num = (text, fallback = 0) => {
  const n = Number(String(text).trim());
  return Number.isFinite(n) ? n : fallback;
};

export default function BarnFormModal({
  open,
  onClose,
  farm,
  existing = [],
  barn = null,
  /**
   * ยอดที่ระบบนับได้ของโรงเรือนใบนี้ (T1.341)
   *
   * ★ จำเป็น เพราะ `barn.pigs` ของโรงเรือนจริงเป็น `null` เสมอ — ฐานไม่มีคอลัมน์จำนวน
   *   โดยเจตนา ยอดจริงนับจาก `barn_log` (ดูหัวไฟล์ `lib/herdCount.js`)
   *   ถ้าไม่ส่งค่านี้มา ช่องจำนวนจะเปิดมาว่างทั้งที่ระบบรู้ยอดอยู่ ซึ่งอ่านได้ว่า
   *   "ระบบไม่รู้" แล้วคนกรอกจะพิมพ์ทับหรือปล่อยว่างไว้ — ทั้งสองทางผลเพี้ยน
   */
  knownPigs = null,
  onAdded,
}) {
  const t = useT();
  const editing = barn != null;
  const { addBarn, updateBarn, onServer } = useFarmEditor();
  /* บันทึกไม่สำเร็จต้องไม่ปิดป๊อบอัพไปเงียบ ๆ เหมือนสำเร็จ */
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [zone, setZone] = useState(ZONES[0].id);
  const [building, setBuilding] = useState(1);
  const [stage, setStage] = useState(STAGES.at(-1));
  const [capacity, setCapacity] = useState("");
  const [pigs, setPigs] = useState("");

  /* เลขที่ยังว่างของโซนที่เลือก — ดูจากชื่อโรงเรือนที่มีอยู่จริงในฟาร์มนี้ */
  const nextNumber = useMemo(() => {
    const used = new Set(
      existing
        .filter((b) => b.id !== barn?.id)
        .map((b) => String(b.name ?? "").match(/([A-Z])\s*(\d+)/i))
        .filter((m) => m && m[1].toUpperCase() === zone)
        .map((m) => Number(m[2]))
    );
    let n = 1;
    while (used.has(n)) n += 1;
    return n;
  }, [existing, zone, barn?.id]);

  useEffect(() => {
    if (!open) return;
    setZone(barn?.zone ?? ZONES[0].id);
    setStage(barn?.stage ?? STAGES.at(-1));
    setCapacity(barn?.capacity != null ? String(barn.capacity) : "");
    setPigs(pigsSeed(knownPigs, barn?.pigs));
    setSaveError(null);
  }, [open, farm?.id, barn, knownPigs]);

  /* เปลี่ยนโซนแล้วเลขต้องขยับไปเลขว่างของโซนใหม่เอง ไม่ให้ค้างเลขของโซนเดิมจนชนกัน */
  useEffect(() => {
    /* แก้ไขโดยยังไม่เปลี่ยนโซน = คงเลขเดิมของตัวเอง ไม่ต้องกระโดดไปเลขว่างถัดไป */
    if (editing && zone === barn.zone) setBuilding(barn.building);
    else setBuilding(nextNumber);
  }, [nextNumber, editing, zone, barn]);

  const code = `${zone}${building}`;
  const name = `โรงเรือน ${code}`;
  const taken = existing.some((b) => b.name === name && b.id !== barn?.id);
  const capNum = Math.max(0, num(capacity));
  /* ★ ช่องว่างต้องเป็น `null` ไม่ใช่ 0 — เหตุผลเต็มอยู่ที่ `pigsField` (T1.341)
     ของเดิม `Math.max(0, num(pigs))` ทำให้ "ไม่ได้กรอก" กลายเป็น "เล้าว่างแล้ว"
     แก้แค่ความจุแล้วกดบันทึก ก็ได้บันทึกย้ายออกเท่ายอดทั้งเล้าไปเงียบ ๆ */
  const pigNum = pigsField(pigs);
  /* ใบนี้จะถูกบันทึกเข้าระบบกลางไหม — เงื่อนไขเดียวกับที่ `useFarmEditor` ใช้เลือกทาง
     (แก้ไข = ดูที่ตัวโรงเรือน · เพิ่มใหม่ = ดูที่ฟาร์มปลายทาง) */
  const inSystem = Boolean(onServer && (editing ? barn?.apiId : farm?.apiId));
  const overCap = capNum > 0 && pigNum != null && pigNum > capNum;

  const save = async () => {
    if (taken || building < 1 || saving) return;
    /* ★ ส่ง `code` ไปด้วย — ฐานใช้ช่องนี้เป็นรหัสโรงเรือน (unique ต่อฟาร์ม)
       และหน้าจอประกอบ id เป็น `<รหัสฟาร์ม>-<code>` จากมันอีกที */
    const data = { code, name, zone, building, stage, capacity: capNum, pigs: pigNum };
    setSaving(true);
    setSaveError(null);
    try {
      let saved;
      if (editing) {
        saved = await updateBarn(barn.id, data);
      } else {
        /* เหตุผลเดียวกับ FarmFormModal — ห้ามใส่การเรียกจริงไว้ในอาร์กิวเมนต์ของ optional call */
        const created = await addBarn(farm.id, data);
        saved = created;
        onAdded?.(created);
      }
      /* ★ เก็บลงเครื่องไม่เท่ากับเก็บลงระบบ — ต้องค้างป๊อบอัพไว้แล้วบอก ไม่ใช่ปิดเงียบ ๆ
         เดิมปิดทันทีทุกกรณี ผู้ใช้จึงเข้าใจว่าบันทึกเข้าระบบแล้ว ทั้งที่ค่าอยู่แค่ในเครื่องนี้
         แล้วหน้าอื่นที่อ่านจากระบบก็ไม่เห็นเลข (ผู้ใช้วนเจอสามรอบ 14–15 ต.ค. · T1.335) */
      if (saved?.savedTo === "local") {
        setSaveError(
          t(
            "เก็บไว้ในเครื่องนี้เท่านั้น ยังไม่เข้าระบบกลาง — เครื่องอื่นและหน้าที่อ่านจากระบบจะไม่เห็นเลขนี้ ให้ออกแล้วเข้าสู่ระบบใหม่ แล้วบันทึกอีกครั้ง",
          ),
        );
        return;
      }
      /* ★ "บันทึกสำเร็จ" กับ "จำนวนสุกรไม่ได้ขยับ" เป็นคนละเรื่อง (T1.339)
         ชื่อ/ขั้น/ความจุ เข้าระบบแล้วจริง แต่ถ้าเลขที่กรอกเท่ากับยอดที่ระบบนับได้อยู่แล้ว
         จะไม่มีบันทึกใหม่เกิดขึ้นเลย — เดิมปิดป๊อบอัพเงียบ ๆ ผู้ใช้จึงนึกว่าเลขเข้าไปแล้ว
         แล้วกลับมาถามว่า "ขึ้นไหม" ซึ่งเป็นคำถามที่แอปควรตอบได้เองตั้งแต่ตอนกด */
      if (saved?.count?.kind === "same" && saved.count.count != null) {
        setSaveError(
          t(
            "บันทึกโรงเรือนแล้ว แต่จำนวนสุกรไม่ได้เปลี่ยน — ระบบนับจากบันทึกได้ {n} ตัวอยู่แล้ว ซึ่งเท่ากับเลขที่กรอก จึงไม่มีรายการใหม่เกิดขึ้น",
            { n: formatNumber(saved.count.count) },
          ),
        );
        return;
      }
      /* ★ โรงเรือนใหม่ที่ยังไม่ได้ลงจำนวน — บอกไว้ดีกว่าปล่อยให้ไปเจอ "—" ทีหลัง (T1.341)
         ตอนแก้ไขไม่ต้องบอก เพราะช่องถูกตั้งต้นด้วยยอดที่ระบบนับได้อยู่แล้ว
         ปล่อยว่างตรงนั้นจึงแปลว่า "ไม่ได้ขอให้เปลี่ยน" ไม่ใช่ลืมกรอก */
      if (!editing && saved?.count?.kind === "skipped") {
        setSaveError(
          t(
            "สร้างโรงเรือนแล้ว แต่ยังไม่ได้ลงจำนวนสุกร — ทุกหน้าจะขึ้น \"—\" จนกว่าจะบันทึก \"ย้ายสุกรเข้า\" ที่หน้าโรงเรือนหนึ่งครั้ง",
          ),
        );
        return;
      }
      onClose();
    } catch (err) {
      setSaveError(err?.message ?? t("บันทึกไม่สำเร็จ ลองอีกครั้ง"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      align="center"
      size="sm"
      icon="home"
      title={editing ? t("แก้ไข{barn}", { barn: t(barn.name) }) : t("เพิ่มโรงเรือนใหม่")}
      subtitle={
        farm ? (editing ? t(farm.name) : t("เพิ่มเข้า{farm}", { farm: t(farm.name) })) : ""
      }
      footer={
        <div className="rc-actions">
          <button type="button" className="modal-btn" onClick={onClose}>
            {t("ยกเลิก")}
          </button>
          <button
            type="button"
            className="modal-btn is-primary"
            onClick={save}
            disabled={taken || building < 1 || saving}
          >
            <Icon name={editing ? "check" : "plus"} size={20} />
            {taken
              ? t("ชื่อนี้มีอยู่แล้ว")
              : editing
                ? t("บันทึกการแก้ไข")
                : t("เพิ่ม{name}", { name: t(name) })}
          </button>
        </div>
      }
    >
      {/* ชื่อที่จะได้ โชว์ตัวใหญ่ตลอด — คนกรอกจะได้เห็นผลของโซน+เลขทันทีโดยไม่ต้องเดา */}
      <div className="rc-preview">
        <em>{t("ชื่อที่จะได้")}</em>
        <b>{name}</b>
        {taken && (
          <span className="rc-taken">
            <Icon name="warn" size={16} aria-hidden="true" />
            {t("มีอยู่แล้วในฟาร์มนี้")}
          </span>
        )}
      </div>

      <div className="rc-form">
        {saveError && (
          <p className="rc-warn is-wide" role="alert">
            <Icon name="warn" size={18} />
            {saveError}
          </p>
        )}

        <label className="rc-field">
          <span>{t("โซน")}</span>
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            {ZONES.map((z) => (
              <option key={z.id} value={z.id}>
                {z.id} · {z.label}
              </option>
            ))}
          </select>
        </label>

        <label className="rc-field">
          <span>{t("หมายเลขอาคาร")}</span>
          <input
            type="number"
            className="num"
            min="1"
            value={building}
            onChange={(e) => setBuilding(Math.max(1, Math.floor(num(e.target.value, 1))))}
          />
        </label>

        <label className="rc-field is-wide">
          <span>{t("ช่วงวัยที่เลี้ยง")}</span>
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {t(s)}
              </option>
            ))}
          </select>
        </label>

        <label className="rc-field">
          <span>{t("ความจุ (ตัว)")}</span>
          <input
            type="number"
            className="num"
            min="0"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="0"
          />
        </label>

        <label className="rc-field">
          {/* ★ ตอนแก้ไขช่องนี้ถูกตั้งต้นด้วย "ยอดที่ระบบนับได้ตอนนี้" แล้ว (T1.341)
              ป้าย "เริ่มต้น" จึงผิดในโหมดแก้ไข — อ่านแล้วนึกว่าเป็นยอดตอนลงเล้าครั้งแรก
              แล้วจะไม่กล้าแก้ หรือแก้แล้วนึกว่ากำลังแก้ของเก่า */}
          <span>{t(editing ? "จำนวนสุกรตอนนี้ (ตัว)" : "จำนวนสุกรเริ่มต้น (ตัว)")}</span>
          <input
            type="number"
            className="num"
            min="0"
            value={pigs}
            onChange={(e) => setPigs(e.target.value)}
            placeholder="0"
          />
        </label>
      </div>

      {overCap && (
        <p className="rc-warn">
          <Icon name="warn" size={17} aria-hidden="true" />
          {t("จำนวนสุกรมากกว่าความจุอยู่ {n} ตัว — เพิ่มได้ แต่จะขึ้นว่าแน่นเกินไป", {
            n: pigNum - capNum,
          })}
        </p>
      )}

      {/* ★ บรรทัดนี้เคยเขียนว่า "เก็บในเครื่องนี้เท่านั้น" ไว้ตายตัว (T1.341)
          ซึ่งผิดสำหรับฟาร์มจริง — ของมันเข้าระบบกลางจริง ทุกเครื่องเห็นตาม
          เป็นคำโกหกคนละทางกับ T1.335: คราวนั้นบอกว่าเข้าระบบทั้งที่ไม่เข้า
          คราวนี้บอกว่าไม่เข้าทั้งที่เข้า — ทั้งสองทางทำให้คนกดเชื่อผิด
          จึงต้องถามสถานะจริงทุกครั้ง ไม่ใช่เขียนข้อความเดียวไว้เฉย ๆ */}
      <p className="rc-foot">
        {inSystem
          ? t("บันทึกเข้าระบบกลาง — ทุกเครื่องที่เข้าสู่ระบบจะเห็นตรงกัน")
          : t("บันทึกไว้ในเครื่องนี้เท่านั้น ยังไม่ได้ส่งขึ้นระบบกลาง")}
      </p>
    </Modal>
  );
}
