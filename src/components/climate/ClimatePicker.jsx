/**
 * ป๊อบอัพ "เลือกฟาร์มและโรงเรือน" ก่อนเข้าหน้าอุณหภูมิ / ความชื้น
 *
 * ใช้ที่กล่อง "อุณหภูมิ / ความชื้น" ในหน้าภาพรวม · ปุ่ม "เปลี่ยนโรงเรือน" ในหน้า Climate
 * และปุ่มเลือกโรงเรือนในหน้าสภาพแวดล้อม
 * เลือกเป็น 2 ขั้นเรียงซ้าย→ขวา: ฟาร์ม → โรงเรือน (เปลี่ยนฟาร์มแล้วโรงเรือนจะถูกล้าง)
 * แต่ละขั้นเป็น dropdown + การ์ดตัวอย่างของสิ่งที่เลือก
 *
 * ค่าเริ่มต้นกดยืนยันแล้วไปที่ /dashboard/climate/:farmId/:barnId — ถ้าหน้าไหนอยากรับค่า
 * มาใช้ในหน้าตัวเองแทนการเปลี่ยนหน้า ให้ส่ง onConfirm เข้ามา (จะไม่ navigate)
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useT } from "../../lib/i18n/useT.js";
import Modal from "../ui/Modal.jsx";
import Icon from "../ui/Icon.jsx";
import FarmArt from "../ui/FarmArt.jsx";
import BarnArt from "../ui/BarnArt.jsx";
import PickerArt from "../ui/PickerArt.jsx";
import PickerSearch from "../ui/PickerSearch.jsx";
import { useAllFarms } from "../../lib/records/useAllFarms.js";
import { formatNumber } from "../../lib/format.js";
import "../ui/picker.css";

/**
 * @param {function} [onConfirm]   ({farmId, barnId}) => void — ส่งมาแล้วจะไม่เปลี่ยนหน้า
 * @param {string}   [confirmLabel] ข้อความบนปุ่มยืนยัน
 * @param {string}   [subtitle]    คำอธิบายใต้หัวป๊อบอัพ
 */
export default function ClimatePicker({
  open,
  onClose,
  farmId: initialFarmId,
  barnId: initialBarnId,
  onConfirm,
  confirmLabel,
  subtitle,
}) {
  const t = useT();
  const navigate = useNavigate();
  const [farmId, setFarmId] = useState(initialFarmId ?? "");
  const [barnId, setBarnId] = useState(initialBarnId ?? "");
  /* เปิดกล่องใหม่ทุกครั้ง = เริ่มจากค่าที่ส่งเข้ามา (ไม่ค้างค่าเก่าของครั้งก่อน) */
  useEffect(() => {
    if (!open) return;
    setFarmId(initialFarmId ?? "");
    setBarnId(initialBarnId ?? "");
  }, [open, initialFarmId, initialBarnId]);

  /* รวมของที่ผู้ใช้เพิ่มเองด้วย (ดู lib/records/useAllFarms.js) */
  const { farms, barnsOf } = useAllFarms();
  const farmIndex = farms.findIndex((f) => f.id === farmId);
  const farm = farmIndex < 0 ? null : farms[farmIndex];
  const barns = farm ? barnsOf(farm.id) : [];
  const barnIndex = barns.findIndex((b) => b.id === barnId);
  const barn = barnIndex < 0 ? null : barns[barnIndex];

  const confirm = () => {
    if (!farm || !barn) return;
    onClose();
    /* หน้าที่รับค่าไปใช้เองไม่ต้องเปลี่ยนหน้า (เช่นหน้าสภาพแวดล้อมที่สลับโรงเรือนอยู่กับที่) */
    if (onConfirm) {
      onConfirm({ farmId: farm.id, barnId: barn.id });
      return;
    }
    navigate(`/dashboard/climate/${farm.id}/${barn.id}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      align="center"
      size="sm"
      title={t("เลือกฟาร์มและโรงเรือน")}
      subtitle={subtitle ?? t("กรุณาเลือกฟาร์มและโรงเรือนเพื่อดูข้อมูลอุณหภูมิ / ความชื้น")}
      art={<PickerArt />}
      footer={
        <div className="cp-actions">
          <button type="button" className="modal-btn" onClick={onClose}>
            {t("ยกเลิก")}
          </button>
          <button
            type="button"
            className="modal-btn is-primary"
            onClick={confirm}
            disabled={!farm || !barn}
          >
            <Icon name="chart" size={20} />
            {confirmLabel ?? t("ดูข้อมูลอุณหภูมิ / ความชื้น")}
          </button>
        </div>
      }
    >
      {/* ค้นหาแล้วกดผลลัพธ์ = เติมทั้งฟาร์มและโรงเรือนให้เลย ไม่ต้องไล่เลือกทีละขั้น */}
      <PickerSearch
        onPick={({ farmId: pickedFarm, barnId: pickedBarn }) => {
          setFarmId(pickedFarm);
          setBarnId(pickedBarn);
        }}
      />

      <div className="cp-cols">
        {/* ---------- ขั้นที่ 1: ฟาร์ม ---------- */}
        <h3 className="cp-step cp-a1">
          <span className="cp-step-num" aria-hidden="true">
            1
          </span>
          {t("เลือกฟาร์ม")}
          <Icon name="home" size={20} className="cp-step-icon" />
        </h3>

        <label className="cp-select cp-a2">
          <span className="sr-only">{t("เลือกฟาร์ม")}</span>
          <select
            value={farmId}
            onChange={(e) => {
              setFarmId(e.target.value);
              setBarnId("");
            }}
          >
            <option value="">{t("— เลือกฟาร์ม —")}</option>
            {farms.map((f) => (
              <option key={f.id} value={f.id}>
                {t(f.name)}
              </option>
            ))}
          </select>
          <Icon name="chevron" size={20} className="cp-select-arrow" />
        </label>

        <div className="cp-card cp-a3">
          {farm ? (
            <>
              <span className="cp-thumb" aria-hidden="true">
                <FarmArt className="cp-thumb-art" crop={farmIndex} />
              </span>
              <span className="cp-card-text">
                <b>{t(farm.name)}</b>
                <span className="cp-card-meta">
                  <Icon name="pin" size={16} />
                  {t("จังหวัด{province}", { province: t(farm.province) })}
                </span>
                <span className="cp-pill">
                  {t("{n} โรงเรือน", { n: formatNumber(farm.barnCount) })}
                </span>
              </span>
            </>
          ) : (
            <span className="cp-card-empty">{t("ยังไม่ได้เลือกฟาร์ม")}</span>
          )}
        </div>

        {/* ---------- เส้นคั่นกลาง + ลูกศร ---------- */}
        <span className="cp-line" aria-hidden="true" />
        <span className="cp-chev cp-c2" aria-hidden="true">
          <Icon name="chevron" size={18} />
        </span>
        <span className="cp-chev cp-c3" aria-hidden="true">
          <Icon name="chevron" size={18} />
        </span>

        {/* ---------- ขั้นที่ 2: โรงเรือน ---------- */}
        <h3 className="cp-step cp-b1">
          <span className="cp-step-num" aria-hidden="true">
            2
          </span>
          {t("เลือกโรงเรือน")}
          <Icon name="home" size={20} className="cp-step-icon" />
        </h3>

        <label className="cp-select cp-b2">
          <span className="sr-only">{t("เลือกโรงเรือน")}</span>
          <select
            value={barnId}
            onChange={(e) => setBarnId(e.target.value)}
            disabled={!farm}
          >
            <option value="">
              {farm ? t("— เลือกโรงเรือน —") : t("เลือกฟาร์มก่อน")}
            </option>
            {barns.map((b) => (
              <option key={b.id} value={b.id}>
                {t(b.name)}
              </option>
            ))}
          </select>
          <Icon name="chevron" size={20} className="cp-select-arrow" />
        </label>

        <div className="cp-card cp-b3">
          {barn ? (
            <>
              <span className="cp-thumb" aria-hidden="true">
                <BarnArt className="cp-thumb-art" variant={barnIndex} />
              </span>
              <span className="cp-card-text">
                <b>{t(barn.name)}</b>
                <span className="cp-card-meta">
                  <Icon name="pin" size={16} />
                  {t("อาคารเลี้ยงสุกร")}
                </span>
                <span className="cp-pill">{t("โซน {zone}", { zone: barn.zone })}</span>
              </span>
            </>
          ) : (
            <span className="cp-card-empty">{t("ยังไม่ได้เลือกโรงเรือน")}</span>
          )}
        </div>
      </div>
    </Modal>
  );
}
