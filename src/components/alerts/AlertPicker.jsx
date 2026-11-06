/**
 * ป๊อบอัพ "เลือกขอบเขตการแจ้งเตือน" — ใช้ที่กล่อง "การแจ้งเตือน" ในหน้าภาพรวม
 *
 * โครงเหมือนป๊อบอัพอุณหภูมิ/ความชื้น (components/climate/ClimatePicker.jsx)
 * ต่างกันที่เลือกได้ 3 ระดับ และปุ่มหลักเปลี่ยนข้อความตามสิ่งที่เลือก:
 *   ไม่เลือกอะไร → การแจ้งเตือนทั้งหมด  → /dashboard/alerts
 *   เลือกฟาร์ม   → ของฟาร์มนั้น          → /dashboard/alerts?farm=...
 *   เลือกโรงเรือน → ของโรงเรือนนั้น       → /dashboard/alerts?farm=...&barn=...
 *
 * ปุ่มหลักกดได้เสมอ (ไม่เลือกอะไรก็ไปดูทั้งหมดได้) ตามที่ผู้ใช้ขอ
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
import StatusBadge from "../ui/StatusBadge.jsx";
import { farms as systemFarms, summarizeFarms } from "../../data/mock/farms.js";
import { BARN_STATUS_LABEL } from "../../data/mock/barnsByFarm.js";
import { useAllFarms } from "../../lib/records/useAllFarms.js";
import { formatNumber } from "../../lib/format.js";
import "../ui/picker.css";

const summary = summarizeFarms(systemFarms);

/** จำนวนแจ้งเตือนเป็นตัวเลข → โทนของป้าย (0 รายการ = ปกติ) */
const alertTone = (n) => (n === 0 ? "good" : n >= 5 ? "critical" : "warning");

export default function AlertPicker({ open, onClose }) {
  const t = useT();
  const navigate = useNavigate();
  const [farmId, setFarmId] = useState("");
  const [barnId, setBarnId] = useState("");

  /* เปิดกล่องใหม่ทุกครั้ง = เริ่มจากยังไม่เลือกอะไร (คือ "ทั้งหมด") */
  useEffect(() => {
    if (!open) return;
    setFarmId("");
    setBarnId("");
  }, [open]);

  /* รวมของที่ผู้ใช้เพิ่มเองด้วย (ดู lib/records/useAllFarms.js) */
  const { farms, barnsOf } = useAllFarms();
  const farmIndex = farms.findIndex((f) => f.id === farmId);
  const farm = farmIndex < 0 ? null : farms[farmIndex];
  const barns = farm ? barnsOf(farm.id) : [];
  const barnIndex = barns.findIndex((b) => b.id === barnId);
  const barn = barnIndex < 0 ? null : barns[barnIndex];

  const target = barn
    ? `/dashboard/alerts?farm=${farm.id}&barn=${barn.id}`
    : farm
      ? `/dashboard/alerts?farm=${farm.id}`
      : "/dashboard/alerts";

  const buttonLabel = barn
    ? t("ดูการแจ้งเตือนของ{name}", { name: t(barn.name) })
    : farm
      ? t("ดูการแจ้งเตือนของ{name}", { name: t(farm.name) })
      : t("ดูการแจ้งเตือนทั้งหมด");

  const go = () => {
    onClose();
    navigate(target);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      align="center"
      size="sm"
      title={t("การแจ้งเตือน")}
      subtitle={t("เลือกฟาร์มหรือโรงเรือนที่ต้องการดู หรือกดดูทั้งหมด {n} รายการได้เลย", {
        n: formatNumber(summary.alerts),
      })}
      art={<PickerArt />}
      footer={
        <div className="cp-actions">
          <button type="button" className="modal-btn" onClick={onClose}>
            {t("ยกเลิก")}
          </button>
          <button type="button" className="modal-btn is-primary" onClick={go}>
            <Icon name="bell" size={20} />
            {buttonLabel}
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
            <option value="">{t("— ทุกฟาร์ม —")}</option>
            {farms.map((f) => (
              <option key={f.id} value={f.id}>
                {t("{name} ({n} รายการ)", { name: t(f.name), n: formatNumber(f.alerts) })}
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
                <StatusBadge tone={alertTone(farm.alerts)}>
                  {t("แจ้งเตือน {n} รายการ", { n: formatNumber(farm.alerts) })}
                </StatusBadge>
              </span>
            </>
          ) : (
            <span className="cp-card-empty">
              {t("ทุกฟาร์ม · {n} รายการ", { n: formatNumber(summary.alerts) })}
            </span>
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
              {farm ? t("— ทุกโรงเรือนในฟาร์มนี้ —") : t("เลือกฟาร์มก่อน")}
            </option>
            {barns.map((b) => (
              <option key={b.id} value={b.id}>
                {t("{name} ({n} รายการ)", { name: t(b.name), n: formatNumber(b.alerts) })}
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
                  {t("โซน {zone}", { zone: barn.zone })} · {t(BARN_STATUS_LABEL[barn.status])}
                </span>
                <StatusBadge tone={alertTone(barn.alerts)}>
                  {t("แจ้งเตือน {n} รายการ", { n: formatNumber(barn.alerts) })}
                </StatusBadge>
              </span>
            </>
          ) : (
            <span className="cp-card-empty">
              {farm ? t("ทุกโรงเรือนในฟาร์มนี้") : t("ยังไม่ได้เลือกฟาร์ม")}
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}
