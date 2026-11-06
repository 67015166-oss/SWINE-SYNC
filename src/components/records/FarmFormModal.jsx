/**
 * ป๊อบอัพ "เพิ่มฟาร์ม" และ "แก้ไขฟาร์ม" — ใบเดียวทำสองหน้าที่
 * ส่ง prop `farm` มา = โหมดแก้ไข (เติมค่าเดิมให้ครบและปุ่มเปลี่ยนเป็นบันทึกการแก้ไข)
 *
 * ช่องพิกัดเป็น **ช่องเดียว** รับรูปแบบที่ก๊อปจาก Google Maps มาวางได้ตรง ๆ
 * ("16.393474911536202, 99.64013993919211") — เดิมแยกเป็นสองช่องซึ่งต้องตัดเลขเองทีละครึ่ง
 * เสี่ยงสลับ lat/lng กันด้วย (ในไทย lat ~5–21 · lng ~97–106 สลับกันแล้วหมุดหลุดไปกลางมหาสมุทร)
 * ตัวแยกค่ารับได้ทั้งคอมมา เว้นวรรค และวงเล็บ แล้วโชว์ผลที่แยกได้ให้ตรวจก่อนบันทึก
 */
import { useEffect, useState } from "react";
import Modal from "../ui/Modal.jsx";
import Icon from "../ui/Icon.jsx";
import { useFarmEditor } from "../../lib/records/useFarmEditor.js";
import { suggestFarmCode } from "../../lib/api/farmAdmin.js";
import { parseLatLng } from "./latlng.js";
import FarmMap from "../map/FarmMap.jsx";
import { hasPin } from "../../lib/geo.js";
import { formatNumber } from "../../lib/format.js";
import "./records.css";
import { useT } from "../../lib/i18n/useT.js";

const num = (text, fallback = 0) => {
  const n = Number(String(text).trim());
  return Number.isFinite(n) ? n : fallback;
};

/* ใช้กติกาเดียวกับแผนที่ (lib/geo.js) — ฟาร์มที่พิกัดเสียต้องเปิดมาเป็นช่องว่าง
   ให้กรอกใหม่ ไม่ใช่โชว์ ", " หรือ "NaN, NaN" ค้างไว้ในช่อง */
const toText = (farm) => (hasPin(farm) ? `${farm.lat}, ${farm.lng}` : "");

export default function FarmFormModal({ open, onClose, farm = null, onSaved }) {
  const t = useT();
  const { addFarm, updateFarm, onServer } = useFarmEditor();
  /* ★ ขึ้นข้อความจากหลังบ้านตรง ๆ เช่น "มีฟาร์มรหัส F-KPP อยู่แล้ว"
     เดิมถ้าบันทึกไม่สำเร็จป๊อบอัพจะปิดไปเงียบ ๆ เหมือนสำเร็จ */
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);
  const editing = farm != null;
  const [form, setForm] = useState({ name: "", province: "", district: "", pigs: "", pin: "" });

  /* เปิดใหม่ทุกครั้ง = โหลดค่าของรายการที่กำลังแก้ (หรือฟอร์มเปล่าถ้าเป็นการเพิ่ม) */
  useEffect(() => {
    if (!open) return;
    setForm({
      name: farm?.name ?? "",
      province: farm?.province ?? "",
      district: farm?.district ?? "",
      pigs: farm?.pigs != null ? String(farm.pigs) : "",
      pin: toText(farm),
      /* รหัสแก้ได้แค่ตอนสร้าง — เปลี่ยนทีหลังทำให้เลย์เอาต์กระดานกับบันทึกที่ผูกรหัสไว้หลุด */
      code: farm?.id ?? suggestFarmCode(),
    });
    setSaveError(null);
  }, [open, farm]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const name = form.name.trim();
  const province = form.province.trim();
  const pin = parseLatLng(form.pin);
  const pinBad = pin === "error";
  const ready = name !== "" && province !== "" && !pinBad;

  const save = async () => {
    if (!ready || saving) return;
    const data = {
      ...(editing ? {} : { code: form.code.trim().toUpperCase() }),
      name,
      province,
      district: form.district.trim(),
      pigs: Math.max(0, num(form.pigs)),
      /* ไม่ได้ปักหมุด = null ไม่ใช่ 0 (0,0 คือกลางมหาสมุทรแอตแลนติก หมุดจะไปโผล่ผิดที่) */
      lat: pin ? pin.lat : null,
      lng: pin ? pin.lng : null,
    };
    setSaving(true);
    setSaveError(null);
    try {
      if (editing) {
        await updateFarm(farm.id, data);
      } else {
        /* ต้องเรียก addFarm ก่อนเสมอ ห้ามเขียนเป็น onSaved?.(addFarm(data)) —
           optional call จะ "ข้ามการคำนวณอาร์กิวเมนต์" ทั้งหมดเมื่อ onSaved เป็น undefined
           (หน้าที่ไม่ได้ส่ง onSaved มาจะกดเพิ่มแล้วเงียบ ไม่มีอะไรถูกบันทึกเลย) */
        const created = await addFarm(data);
        onSaved?.(created);
      }
      onClose();
    } catch (err) {
      /* ★ ไม่ปิดป๊อบอัพ — ค่าที่กรอกไว้ต้องยังอยู่ให้แก้ต่อได้ */
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
      icon="pin"
      title={editing ? t("แก้ไข{farm}", { farm: t(farm.name) }) : t("เพิ่มฟาร์มใหม่")}
      subtitle={editing ? undefined : t("กรอกชื่อกับจังหวัดก็เพิ่มได้แล้ว ที่เหลือเติมทีหลังได้")}
      footer={
        <div className="rc-actions">
          <button type="button" className="modal-btn" onClick={onClose}>
            {t("ยกเลิก")}
          </button>
          <button
            type="button"
            className="modal-btn is-primary"
            onClick={save}
            disabled={!ready || saving}
          >
            <Icon name={editing ? "check" : "plus"} size={20} />
            {saving
              ? t("กำลังบันทึก…")
              : pinBad
              ? t("พิกัดยังอ่านไม่ออก")
              : !ready
                ? t("กรอกชื่อและจังหวัดก่อน")
                : editing
                  ? t("บันทึกการแก้ไข")
                  : t("เพิ่ม{name}", { name })}
          </button>
        </div>
      }
    >
      <div className="rc-form">
        {saveError && (
          <p className="rc-warn is-wide" role="alert">
            <Icon name="warn" size={18} />
            {saveError}
          </p>
        )}

        {!editing && onServer && (
          <label className="rc-field is-wide">
            <span>{t("รหัสฟาร์ม")}</span>
            <input
              type="text"
              value={form.code}
              onChange={set("code")}
              placeholder="F-KPP"
            />
            <small>{t("ใช้ในลิงก์และผูกกับเลย์เอาต์ที่บันทึกไว้ — ตั้งได้แค่ตอนสร้าง")}</small>
          </label>
        )}

        <label className="rc-field is-wide">
          <span>
            {t("ชื่อฟาร์ม")} <b className="rc-req">{t("ต้องกรอก")}</b>
          </span>
          <input
            type="text"
            value={form.name}
            onChange={set("name")}
            placeholder={t("เช่น ฟาร์มบ้านโป่ง")}
            autoFocus
          />
        </label>

        <label className="rc-field">
          <span>
            {t("จังหวัด")} <b className="rc-req">{t("ต้องกรอก")}</b>
          </span>
          <input
            type="text"
            value={form.province}
            onChange={set("province")}
            placeholder={t("เช่น ราชบุรี")}
          />
        </label>

        <label className="rc-field">
          <span>{t("อำเภอ")}</span>
          <input
            type="text"
            value={form.district}
            onChange={set("district")}
            placeholder={t("เช่น บ้านโป่ง")}
          />
        </label>

        {/* ★ ฟาร์มที่อยู่ในระบบกลาง: จำนวนสุกรมาจากบันทึกของแต่ละโรงเรือน ไม่ได้กรอกตรงนี้ (T1.328)

            เดิมช่องนี้เปิดให้กรอกทุกกรณี แต่ตอนบันทึก `farmBody()` ตัดค่าทิ้งก่อนส่งขึ้นฐาน
            (ฐานไม่มีคอลัมน์นี้ และตามเจตนาของ `herdCount.js` ก็ไม่ควรมี) ผู้ใช้จึงกรอกแล้ว
            เลขหายเงียบ ๆ โดยฟอร์มหน้าตาเหมือนเดิมทุกอย่าง

            ระดับ "ฟาร์ม" ไม่สามารถแปลงเป็นบันทึกย้ายเข้าได้เหมือนระดับโรงเรือน
            เพราะไม่รู้ว่าสุกรอยู่เล้าไหน — เดาให้ไม่ได้ จึงปิดช่องแล้วบอกทางที่ถูกแทน
            **ไม่ซ่อนช่องทิ้ง** เพราะผู้ใช้ที่เคยเห็นจะนึกว่าระบบทำไม่ได้แล้ว */}
        <label className="rc-field is-wide">
          <span>{t("จำนวนสุกร (ตัว)")}</span>
          <input
            type="number"
            className="num"
            min="0"
            value={onServer ? "" : form.pigs}
            onChange={set("pigs")}
            placeholder={onServer ? t("มาจากบันทึกของโรงเรือน") : "0"}
            disabled={onServer}
          />
          {onServer && (
            <small className="rc-hint">
              {t(
                "จำนวนสุกรของฟาร์มรวมมาจากบันทึกของแต่ละโรงเรือน — ตั้งจำนวนได้ที่ฟอร์มโรงเรือน หรือบันทึก “ย้ายสุกรเข้า” ที่หน้าโรงเรือน",
              )}
            </small>
          )}
        </label>

        {/* ช่องเดียวจบ — ก๊อปจาก Google Maps มาวางได้เลย หรือคลิกเอาบนแผนที่ข้างล่าง */}
        <label className="rc-field is-wide">
          <span>{t("พิกัดบนแผนที่")}</span>
          <input
            type="text"
            className={"rc-pin num" + (pinBad ? " is-bad" : "")}
            value={form.pin}
            onChange={set("pin")}
            placeholder="16.393474911536202, 99.64013993919211"
            inputMode="text"
          />
        </label>
      </div>

      {/* คลิกวางหมุดเอาได้เลย ไม่ต้องไปหาตัวเลขจากที่อื่นมาก่อน —
          คนส่วนใหญ่รู้ว่าฟาร์มอยู่ตรงไหนบนแผนที่ แต่ไม่รู้ว่าละติจูดเท่าไร
          (แผนที่นี้เปิดมาที่ประเทศไทยเสมอถ้ายังไม่มีหมุด — ดู lib/geo.js) */}
      <div className="rc-map">
        <FarmMap
          farms={
            pin && pin !== "error"
              ? [
                  {
                    id: "rc-new",
                    name: name || t("ฟาร์มใหม่"),
                    province: form.province.trim(),
                    status: "good",
                    lat: pin.lat,
                    lng: pin.lng,
                  },
                ]
              : []
          }
          selectedId={null}
          onSelect={() => {}}
          onPick={({ lat, lng }) =>
            setForm((f) => ({ ...f, pin: `${lat.toFixed(6)}, ${lng.toFixed(6)}` }))
          }
        />
      </div>

      {/* บอกผลที่แยกได้ทันที ไม่ต้องรอกดบันทึกแล้วค่อยรู้ว่าผิด */}
      {pinBad ? (
        <p className="rc-warn">
          <Icon name="warn" size={17} aria-hidden="true" />
          {t("อ่านพิกัดไม่ออก — ใส่เป็น “ละติจูด, ลองจิจูด” เช่น 16.3934, 99.6401 หรือวางลิงก์ Google Maps ที่มีตัวเลขพิกัดอยู่ใน URL (ลิงก์ย่อ maps.app.goo.gl ใช้ไม่ได้ — เปิดลิงก์นั้นก่อนแล้วค่อยก๊อป URL เต็ม)")}
        </p>
      ) : pin ? (
        <p className="rc-pin-ok">
          <Icon name="check" size={17} aria-hidden="true" />
          {t("ละติจูด {lat} · ลองจิจูด {lng} — จะขึ้นหมุดบนแผนที่หน้าภาพรวม", {
            lat: formatNumber(pin.lat),
            lng: formatNumber(pin.lng),
          })}
        </p>
      ) : (
        <p className="rc-hint">
          {t(
            "คลิกบนแผนที่ด้านบนเพื่อวางหมุด หรือก๊อปจาก Google Maps มาวางในช่องก็ได้ (ตัวเลขพิกัด, แบบมีองศา 18°16'52\"N 99°29'26\"E หรือลิงก์แผนที่) · ไม่ใส่ก็บันทึกได้ แต่ฟาร์มจะยังไม่ขึ้นหมุดบนแผนที่หน้าภาพรวม",
          )}
        </p>
      )}

      <p className="rc-foot">
        บันทึกไว้ในเครื่องนี้เท่านั้น ยังไม่ได้ส่งขึ้นระบบกลาง
      </p>
    </Modal>
  );
}
