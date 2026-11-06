/**
 * ป๊อบอัพเลือกฟาร์ม/โรงเรือนของ "แถบท้ายกล่องสรุป" ในหน้าภาพรวม
 *
 * โครงหน้าตาเดียวกับป๊อบอัพการแจ้งเตือนและอุณหภูมิเป๊ะ ๆ (components/alerts/AlertPicker.jsx)
 * — ช่องค้นหา แล้วสองคอลัมน์ซ้าย→ขวา: ฟาร์ม → โรงเรือน แต่ละขั้นเป็น dropdown + การ์ดตัวอย่าง
 *   และปุ่มหลักที่เปลี่ยนข้อความตามสิ่งที่เลือก
 *
 * ต่างกันตรงที่ **หัวป๊อบอัพเป็นชื่อของกล่องที่กดมา** (prop `label`) — กดจากกล่อง "ฟาร์มทั้งหมด"
 * ก็ขึ้นหัวว่า "ฟาร์มทั้งหมด" กดจากกล่อง "อาหารที่ให้วันนี้" ก็ขึ้นชื่อของกล่องนั้น
 * ผู้ใช้จึงรู้ตลอดว่ากำลังเจาะข้อมูลของกล่องไหนอยู่
 *
 * ปลายทาง: เลือกโรงเรือน → หน้ารายละเอียดโรงเรือน · เลือกแค่ฟาร์ม → หน้าโรงเรือนทั้งหมดของฟาร์มนั้น
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
import { FARM_STATUS_LABEL } from "../../data/mock/farms.js";
import { BARN_STATUS_LABEL } from "../../data/mock/barnsByFarm.js";
import { useAllFarms } from "../../lib/records/useAllFarms.js";
import { formatNumber } from "../../lib/format.js";
import "../ui/picker.css";

/**
 * @param {boolean}  open
 * @param {function} onClose
 * @param {string}   label ชื่อกล่องที่กดปุ่มมา — ใช้เป็นหัวข้อและอยู่ในปุ่มหลัก
 * @param {function} [to]  ปลายทางของกล่องที่กดมา `(farm, barn|null) => path`
 *   ไม่ส่งมา = ไปหน้าโรงเรือน/รายละเอียดโรงเรือนตามปกติ
 *   (กล่อง "กล้อง AI" ส่งมา เพราะต้องพาไปที่ผนังกล้องและการ์ดกล้องของโรงเรือน ไม่ใช่หน้ารวม)
 * @param {function} [pickLabel] ข้อความบนปุ่มหลัก `(farm, barn|null) => string`
 *   ส่งมาคู่กับ `to` เสมอ — ปุ่มต้องบอกปลายทางจริง ไม่งั้นเขียนว่า "ดูโรงเรือนทั้งหมด"
 *   ทั้งที่กดแล้วไปหน้ากล้อง
 */
export default function FarmPicker({ open, onClose, label = "", to, pickLabel }) {
  const t = useT();
  const navigate = useNavigate();
  const [farmId, setFarmId] = useState("");
  const [barnId, setBarnId] = useState("");

  /* เปิดใหม่ทุกครั้ง = เริ่มจากยังไม่เลือกอะไร ไม่ค้างค่าของครั้งก่อน */
  useEffect(() => {
    if (!open) return;
    setFarmId("");
    setBarnId("");
  }, [open]);

  /* รวมฟาร์ม/โรงเรือนที่ผู้ใช้เพิ่มเองด้วย — เพิ่มแล้วต้องเลือกได้จากป๊อบอัพนี้ทันที */
  const { farms, barnsOf } = useAllFarms();
  const farmIndex = farms.findIndex((f) => f.id === farmId);
  const farm = farmIndex < 0 ? null : farms[farmIndex];
  const barns = farm ? barnsOf(farm.id) : [];
  const barnIndex = barns.findIndex((b) => b.id === barnId);
  const barn = barnIndex < 0 ? null : barns[barnIndex];

  const confirm = () => {
    if (!farm) return;
    onClose();
    navigate(
      to
        ? to(farm, barn)
        : barn
          ? `/dashboard/farms/${farm.id}/barns/${barn.id}`
          : `/dashboard/farms/${farm.id}`
    );
  };

  /* ชื่อกล่องอยู่บนหัวป๊อบอัพแล้ว ปุ่มจึงบอก "ปลายทาง" อย่างเดียว — อ่านเป็นประโยคไทยได้จริง
     (ถ้าเอาชื่อกล่องมาต่อด้วยจะได้ประโยคประหลาดอย่าง "ดูฟาร์มทั้งหมด ของโรงเรือน A1") */
  const buttonLabel = !farm
    ? t("เลือกฟาร์มก่อน")
    : pickLabel
      ? pickLabel(farm, barn)
      : barn
        ? t("เข้าดู{name}", { name: t(barn.name) })
        : t("ดูโรงเรือนทั้งหมดของ{name}", { name: t(farm.name) });

  return (
    <Modal
      open={open}
      onClose={onClose}
      align="center"
      size="sm"
      title={label}
      subtitle={t("เลือกฟาร์มหรือโรงเรือนที่ต้องการเจาะดู — เลือกแค่ฟาร์มก็ได้")}
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
            disabled={!farm}
          >
            <Icon name="chart" size={20} />
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
                <StatusBadge tone={farm.status}>
                  {t(FARM_STATUS_LABEL[farm.status])}
                </StatusBadge>
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

        {/* ---------- ขั้นที่ 2: โรงเรือน (ข้ามได้) ---------- */}
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
                {t("{name} ({n} ตัว)", { name: t(b.name), n: formatNumber(b.pigs) })}
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
                  {t("โซน {zone} · {n} ตัว", { zone: barn.zone, n: formatNumber(barn.pigs) })}
                </span>
                <StatusBadge tone={barn.status}>
                  {t(BARN_STATUS_LABEL[barn.status])}
                </StatusBadge>
              </span>
            </>
          ) : (
            <span className="cp-card-empty">
              {farm
                ? t("ทุกโรงเรือนในฟาร์มนี้ · {n} หลัง", { n: formatNumber(farm.barnCount) })
                : t("ยังไม่ได้เลือกฟาร์ม")}
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}
