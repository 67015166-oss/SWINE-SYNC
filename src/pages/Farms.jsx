/**
 * หน้า "ฟาร์มของฉัน" — ภาพรวมฟาร์มทั้งหมดแบบการ์ด (เส้นทาง /dashboard/farms)
 *
 * เข้ามาได้จากเมนู "ฟาร์มของฉัน" หรือกดกล่อง "ฟาร์มทั้งหมด" ในหน้าภาพรวม
 * โครง: หัวเรื่อง + แถบสรุป → แถบค้นหา/กรอง/เรียง → การ์ดฟาร์มเรียงเป็นกริด
 *
 * หมายเหตุเรื่องข้อมูล: "คะแนนสุขภาพ" ไม่ใช่ฟิลด์ใน mock data (ห้ามแก้โครงข้อมูล)
 * แต่คำนวณจากสิ่งที่มีอยู่จริง — FCR, อุณหภูมิ, ความชื้น และจำนวนแจ้งเตือน
 * ดูสูตรที่ healthScore() ด้านล่าง · ฟาร์มออฟไลน์ไม่มีคะแนน (ข้อมูลไม่อัปเดต)
 */
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Card from "../components/ui/Card.jsx";
import PageBoard, { Block } from "../components/board/PageBoard.jsx";
import Icon from "../components/ui/Icon.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import DataSourceBadge from "../components/ui/DataSourceBadge.jsx";
import FarmArt from "../components/ui/FarmArt.jsx";
import {
  REGIONS,
  regionOf,
  STATUS_OPTIONS,
  matchesStatus,
  PIG_TYPES,
  matchesPigType,
} from "../components/map/useFarmFilters.js";
import FarmFormModal from "../components/records/FarmFormModal.jsx";
import ConfirmModal from "../components/ui/ConfirmModal.jsx";
import { FARM_STATUS_LABEL, summarizeFarms } from "../data/mock/farms.js";
import { isUserRecord } from "../lib/records/useRecords.js";
import { useFarmEditor } from "../lib/records/useFarmEditor.js";
import { useAllFarms } from "../lib/records/useAllFarms.js";
import { useAuth } from "../lib/auth/useAuth.js";
import { useT } from "../lib/i18n/useT.js";
import { formatDateTime, formatNumber, formatWhen } from "../lib/format.js";
import "./Farms.css";

const SORTS = [
  { value: "alerts", label: "แจ้งเตือนมากสุด" },
  { value: "pigs", label: "สุกรมากสุด" },
  { value: "health", label: "คะแนนสุขภาพสูงสุด" },
  { value: "name", label: "ชื่อฟาร์ม ก–ฮ" },
];

/**
 * คะแนนสุขภาพฟาร์ม 0–100 (ค่าคำนวณ ไม่ใช่ข้อมูลจากเซนเซอร์)
 * เริ่มที่ 100 แล้วหักตามสิ่งที่เบี่ยงจากเกณฑ์: FCR สูงกว่า 2.4 · อุณหภูมิเกิน 22–28 °C
 * · ความชื้นเกิน 75% · แจ้งเตือนที่ยังค้าง
 */
function healthScore(farm) {
  if (farm.status === "offline") return null;
  const fcrPenalty = Math.max(0, farm.fcr - 2.4) * 40;
  const tempPenalty = Math.max(0, farm.tempC - 28, 22 - farm.tempC) * 4;
  const humidityPenalty = Math.max(0, farm.humidity - 75) * 1.2;
  const alertPenalty = farm.alerts * 2.5;
  const score = 100 - fcrPenalty - tempPenalty - humidityPenalty - alertPenalty;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** รหัสกระดานของหน้านี้ — คีย์ที่ใช้เก็บชุดเลย์เอาต์ (ดู lib/layout/presets.js) */
const BOARD_ID = "farms";

export default function Farms() {
  /* คำค้นจากช่องค้นหาบนแถบเมนู (/dashboard/farms?q=...) — ใช้เป็นค่าตั้งต้นของช่องค้นหาในหน้า */
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [region, setRegion] = useState("all");
  const [status, setStatus] = useState("all");
  const [pigType, setPigType] = useState("all");
  const [sort, setSort] = useState("alerts");
  const [addOpen, setAddOpen] = useState(false);
  /* ฟาร์มที่กำลังแก้ไขอยู่ (null = ไม่ได้แก้) — ใช้ป๊อบอัพใบเดียวกับตอนเพิ่ม */
  const [editing, setEditing] = useState(null);
  /* โหมดแก้ไข — ปิดไว้ก่อนเสมอ ดินสอ/ถังขยะบนการ์ดจะโผล่ต่อเมื่อกดเปิดโหมดนี้
     กันกดลบพลาดตอนไล่ดูฟาร์ม และหน้ารายการสะอาดกว่าเดิมเวลาแค่มาดูเฉย ๆ */
  const [editMode, setEditMode] = useState(false);
  /* ฟาร์มที่กำลังจะลบ — ถามยืนยันก่อนเสมอ เพราะลบฟาร์มพาโรงเรือนหายไปด้วยทั้งชุด */
  const [removing, setRemoving] = useState(null);
  /* รายการฟาร์ม = ของระบบ + ที่ผู้ใช้เพิ่มเอง — ตัวเลขสรุปหัวหน้าต้องนับรวมด้วย
     ไม่งั้นเพิ่มฟาร์มแล้วหัวหน้ายังบอกจำนวนเดิม ขัดกับรายการที่อยู่ข้างล่าง */
  const { removeFarm, restore, removedIds } = useFarmEditor();
  /* เพิ่ม/แก้/ลบ/กู้คืนฟาร์ม เป็นการแก้โครงสร้างที่ทุกคนในเครือเห็นตาม — เฉพาะผู้ดูแลระบบ
     ผู้ใช้งานทั่วไป "ไม่เห็นปุ่มเลย" ตามที่ผู้ใช้สั่ง (ไม่ใช่เห็นแล้วกดไม่ได้)
     หน้านี้กับ FarmBarns.jsx เป็นข้อยกเว้นของกติกา "ห้ามซ่อนปุ่ม" ใน CLAUDE.md
     เพราะเป็นงานจัดโครงสร้างที่ผู้ใช้งานไม่มีวันได้ทำ — โชว์ไว้ก็รกเปล่า ๆ
     ด่านจริงยังอยู่ที่ RecordsProvider เหมือนเดิม ซ่อนปุ่มไม่ใช่การกัน */
  const canManage = useAuth().can("farm.manage");
  const t = useT();
  /* ใช้ useAllFarms เพื่อให้ได้ทั้งฟาร์มที่มีเซนเซอร์จริงและข้อมูลตัวอย่างชุดเดียวกับหน้าอื่น
     (เดิมหน้านี้ merge เองจึงไม่เห็นฟาร์มจากหลังบ้าน) */
  const { farms, liveStatus, liveErrorKind, liveCachedAt } = useAllFarms();
  const summary = useMemo(() => summarizeFarms(farms), [farms]);

  const visibleFarms = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = farms.filter((f) => {
      const matchQuery =
        !q ||
        /* กรองค่าว่างทิ้งก่อน — ฟาร์มจากหลังบ้านยังไม่มีอำเภอ
           เรียก .toLowerCase() กับ null แล้วหน้าจะพังทั้งหน้าตอนพิมพ์ค้นหา */
        [f.name, f.province, f.district, f.id].filter(Boolean).some((v) =>
          v.toLowerCase().includes(q),
        );
      const matchRegion = region === "all" || regionOf(f) === region;
      return (
        matchQuery &&
        matchRegion &&
        matchesStatus(f, status) &&
        matchesPigType(f, pigType)
      );
    });

    const by = {
      alerts: (a, b) => b.alerts - a.alerts,
      pigs: (a, b) => b.pigs - a.pigs,
      health: (a, b) => (healthScore(b) ?? -1) - (healthScore(a) ?? -1),
      name: (a, b) => a.name.localeCompare(b.name, "th"),
    };
    return [...list].sort(by[sort]);
  }, [farms, query, region, status, pigType, sort]);

  const isFiltered =
    query.trim() !== "" ||
    region !== "all" ||
    status !== "all" ||
    pigType !== "all";

  return (
    <>
      {/* แถบนำทางชุดเดียวกับหน้าโรงเรือน — ต้องมีทั้งสองหน้า ไม่งั้นหัวเรื่องอยู่คนละระดับ
          (หน้าที่ไม่มีแถบนี้ หัวเรื่องจะขยับขึ้นไป 24px แล้วปุ่มกระโดดตอนสลับหน้า) */}
      <nav className="crumbs" aria-label={t("เส้นทางหน้า")}>
        <Link to="/dashboard">{t("ภาพรวม")}</Link>
        <Icon name="chevron" size={15} />
        <span aria-current="page">{t("ฟาร์มทั้งหมด|ตัวเลือก")}</span>
      </nav>

      <section className="farms-head">
        <div className="farms-head-main">
          <span className="icon-chip" aria-hidden="true">
            <Icon name="home" size={24} />
          </span>
          <div>
            <h1 className="farms-title">{t("ภาพรวมฟาร์มทั้งหมด")}</h1>
            {/* เหลือแต่ข้อมูลจริง — คำโปรยอธิบายหน้าเอาออกตามที่ผู้ใช้สั่ง (เหมือนหน้าภาพรวม) */}
            <p className="farms-subtitle">
              {t("อัปเดตล่าสุด {time}", { time: formatDateTime(summary.updatedAt) })}
            </p>
          </div>
        </div>
        {/* ตัวเลขสรุปอยู่ในหัวหน้าเลย ไม่ใช่การ์ดใบใหญ่ใต้หัว — อ่านจบในบรรทัดเดียวกับชื่อหน้า
            และไม่กินพื้นที่ที่ควรเป็นของรายการฟาร์ม */}
        {canManage && (
          <span className="rc-head-btns">
            {/* "เพิ่มฟาร์ม" มาก่อนตามที่ผู้ใช้สั่ง — เป็นงานหลักของหน้า
                สวิตช์โหมดแก้ไขเป็นปุ่มรอง อยู่ถัดไป */}
            <button
              type="button"
              className="rc-add farms-add"
              onClick={() => setAddOpen(true)}
              aria-haspopup="dialog"
            >
              <Icon name="plus" size={20} />
              {t("เพิ่มฟาร์ม")}
            </button>
            {/* สวิตช์โหมดแก้ไข — aria-pressed บอกสถานะให้โปรแกรมอ่านหน้าจอรู้ด้วย
                ไม่ได้สื่อด้วยสีปุ่มอย่างเดียว ข้อความบนปุ่มเปลี่ยนตามสถานะ */}
            <button
              type="button"
              className={"rc-editmode" + (editMode ? " is-on" : "")}
              onClick={() => setEditMode((v) => !v)}
              aria-pressed={editMode}
            >
              <Icon name={editMode ? "check" : "pencil"} size={19} />
              {editMode ? t("เสร็จสิ้น") : t("แก้ไขฟาร์ม")}
            </button>
          </span>
        )}

        <dl className="head-stats">
          <div className="head-stat">
            <dt>
              <Icon name="pin" size={16} aria-hidden="true" />
              {t("ฟาร์มทั้งหมด|ตัวเลือก")}
            </dt>
            <dd>
              <b className="num">{formatNumber(summary.total)}</b> {t("ฟาร์ม")}
            </dd>
          </div>
          <div className="head-stat">
            <dt>
              <StatusBadge tone="good">{t("ออนไลน์")}</StatusBadge>
            </dt>
            <dd>
              <b className="num">
                {formatNumber(summary.total - summary.offline)}
              </b>{" "}
              {t("ฟาร์ม")}
            </dd>
          </div>
          <div className="head-stat">
            <dt>
              <StatusBadge tone="warning">{t("เฝ้าระวัง")}</StatusBadge>
            </dt>
            <dd>
              <b className="num">{formatNumber(summary.warning)}</b> {t("ฟาร์ม")}
            </dd>
          </div>
          <div className="head-stat">
            <dt>
              <Icon name="bell" size={16} aria-hidden="true" />
              {t("การแจ้งเตือน")}
            </dt>
            <dd>
              <b className="num">{formatNumber(summary.alerts)}</b> {t("รายการ")}
            </dd>
          </div>
        </dl>
      </section>

      {/* แถบ "ซ่อนไว้ N รายการ" เป็นเรื่องของคนที่ลบ — ผู้ใช้งานกู้คืนไม่ได้อยู่แล้ว
          จึงไม่ต้องบอกว่ามีของถูกซ่อน (สำหรับเขา ฟาร์มนั้นก็แค่ไม่มีอยู่) */}
      {/* ดึงข้อมูลเซนเซอร์ไม่ได้ = ฟาร์มที่ต่อเซนเซอร์จริงหายไปจากรายการ ต้องบอกให้รู้
          ไม่งั้นคนดูจะนึกว่าฟาร์มถูกลบ ทั้งที่แค่ต่อไม่ติด
          **ต้องบอกสาเหตุให้ตรง** — แหล่งข้อมูลคือ PlotNexus ไม่ใช่หลังบ้านในเครื่อง
          (ป้ายเดิมเขียนว่า "ต่อหลังบ้านไม่ได้" ตอนกุญแจโดนปฏิเสธ 11 ก.ย. 2569 ทั้งที่หลังบ้านปกติดี) */}
      {/* ★ ต่อไม่ได้แต่มีของที่จำไว้ — ฟาร์มจริงยังอยู่บนหน้าจอ ต้องบอกให้ชัดว่าทำไมตัวเลขไม่ขึ้น (T1.314) */}
      {liveStatus === "error" && liveCachedAt && (
        <p className="live-offline-note" role="status">
          <Icon name="warn" size={17} aria-hidden="true" />
          {t("ติดต่อเซิร์ฟเวอร์ไม่ได้ — ฟาร์มจริงยังแสดงอยู่แต่ตัวเลขไม่ใช่ของตอนนี้ (ข้อมูลล่าสุดที่ได้คือ {time})", {
            time: formatWhen(liveCachedAt),
          })}
        </p>
      )}

      {liveStatus === "error" && !liveCachedAt && (
        <p className="live-offline-note" role="status">
          <Icon name="warn" size={17} aria-hidden="true" />
          {/* ★ สาเหตุที่พบบ่อยที่สุดคือ "ยังไม่ได้เข้าสู่ระบบ" ซึ่งแก้ได้ในสองวินาที
              เดิมข้อความทุกแบบพูดถึง "ระบบเซนเซอร์ PlotNexus ต่อไม่ได้" ซึ่งชวนให้
              ไปตรวจเซนเซอร์ที่ฟาร์ม ทั้งที่เซนเซอร์ปกติดีและของจริงรออยู่ในระบบแล้ว (T1.342) */}
          {liveErrorKind === "needlogin"
            ? t("ยังไม่ได้เข้าสู่ระบบ — ข้อมูลฟาร์มจริงอยู่ในระบบกลาง เข้าสู่ระบบแล้วจะเห็นทันที · ตอนนี้แสดงเฉพาะข้อมูลตัวอย่าง")
            : liveErrorKind === "noserver"
              ? t("สำเนานี้ไม่ได้ต่อกับระบบกลาง จึงไม่มีข้อมูลจริงให้แสดง — แสดงเฉพาะข้อมูลตัวอย่าง")
              : liveErrorKind === "denied"
                ? t("ระบบไม่อนุญาตให้ดึงข้อมูลด้วยสิทธิ์ของบัญชีนี้ — แสดงเฉพาะข้อมูลตัวอย่าง")
                : t("ติดต่อระบบกลางไม่ได้ — แสดงเฉพาะข้อมูลตัวอย่าง")}
        </p>
      )}

      {canManage && removedIds.length > 0 && (
        <p className="rc-restore" role="status">
          <Icon name="trash" size={17} aria-hidden="true" />
          {t("ซ่อนฟาร์ม/โรงเรือนของระบบไว้ {n} รายการ", { n: formatNumber(removedIds.length) })}
          <button
            type="button"
            className="rc-restore-btn"
            onClick={() => restore()}
          >
            {t("กู้คืนทั้งหมด")}
          </button>
        </p>
      )}

      <PageBoard boardId={BOARD_ID}>
        <Block id="list" label={t("รายการฟาร์ม")}>
          <Card className="farms-board">
            <div className="fx-toolbar">
              <span className="fx-search">
                <Icon name="search" size={19} className="fx-search-icon" />
                <input
                  type="search"
                  className="fx-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("ค้นหาฟาร์ม / จังหวัด")}
                  aria-label={t("ค้นหาฟาร์ม")}
                />
              </span>
              <select
                className="fx-select"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                aria-label={t("กรองตามภาค")}
              >
                <option value="all">{t("ทุกภาค")}</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {t(r)}
                  </option>
                ))}
              </select>
              <select
                className="fx-select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                aria-label={t("กรองตามสถานะ")}
              >
                <option value="all">{t("ทุกสถานะ")}</option>
                {STATUS_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {t(label)}
                  </option>
                ))}
              </select>
              <select
                className="fx-select"
                value={pigType}
                onChange={(e) => setPigType(e.target.value)}
                aria-label={t("กรองตามประเภทสุกร")}
              >
                <option value="all">{t("ทุกประเภทสุกร")}</option>
                {/* ตัวแปรวนชื่อว่า `kind` ไม่ใช่ `t` — `t` คือตัวแปลข้อความของทั้งหน้า
                    (เขียนเป็น `t` แล้วบังตัวแปล ตัวเลือกจึงไม่ยอมแปลตามภาษา) */}
                {PIG_TYPES.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(kind)}
                  </option>
                ))}
              </select>
              <select
                className="fx-select"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                aria-label={t("เรียงตาม")}
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {t("เรียงตาม: {label}", { label: t(s.label) })}
                  </option>
                ))}
              </select>
              {isFiltered && (
                <button
                  type="button"
                  className="fx-btn"
                  onClick={() => {
                    setQuery("");
                    setRegion("all");
                    setStatus("all");
                    setPigType("all");
                  }}
                >
                  <Icon name="cross" size={17} />
                  ล้างตัวกรอง
                </button>
              )}
            </div>

            {visibleFarms.length === 0 ? (
              <p className="fx-empty">
                ไม่พบฟาร์มที่ตรงกับเงื่อนไข — ลองแก้คำค้นหรือกด “ล้างตัวกรอง”
              </p>
            ) : (
              <ul className="farm-card-grid">
                {visibleFarms.map((f, i) => {
                  return (
                    <li
                      key={f.id}
                      className={
                        "farm-card" +
                        (f.status === "offline" ? " is-offline" : "")
                      }
                    >
                      <div className="farm-card-top">
                        {/* ซ้อนสองแถว: ป้ายสถานะบรรทัดบน · ดินสอ/ถังขยะบรรทัดล่าง
                            แยกบรรทัดกันตามที่ผู้ใช้สั่ง ปุ่มจะได้ไม่เบียดป้ายสถานะ */}
                        <span className="farm-card-tools">
                          <span className="farm-card-badges">
                          <StatusBadge tone={f.status}>
                            {t(FARM_STATUS_LABEL[f.status])}
                          </StatusBadge>
                          {/* ที่มาของข้อมูล — ตอนนี้มีเซนเซอร์จริงอยู่ฟาร์มเดียว
                              ที่เหลือเป็นตัวเลขสมมติ ต้องบอกให้คนดูแยกออก */}
                          <DataSourceBadge source={f.dataSource} />
                          {/* ไม่ติดป้าย "เพิ่มเอง"/"แก้ไขแล้ว" — ฟาร์มทุกใบหน้าตาเหมือนกันหมด
                              (ที่มาของข้อมูลยังแยกได้จากรหัส U- ในเบื้องหลัง แค่ไม่แสดงให้ผู้ใช้เห็น) */}
                          </span>

                          {/* ทุกฟาร์มแก้ไข/ลบได้ ไม่ใช่เฉพาะที่เพิ่มเอง —
                            ของระบบที่ลบไปจะถูก "ซ่อน" ไว้ กู้คืนได้จากแถบด้านบน
                            ดินสอกับถังขยะห่อไว้ด้วยกันใน .rc-btns เพื่อ **ห้ามแยกคนละบรรทัด**
                            ผู้ใช้งานทั่วไปไม่เห็นทั้งก้อน — ผู้ดูแลระบบก็เห็นเฉพาะตอนเปิดโหมดแก้ไข */}
                          {canManage && editMode && (
                            <span className="rc-btns">
                              <button
                                type="button"
                                className="rc-del rc-edit"
                                onClick={() => setEditing(f)}
                                title={t("แก้ไข{farm}", { farm: t(f.name) })}
                                aria-label={t("แก้ไข{farm}", { farm: t(f.name) })}
                              >
                                <Icon name="pencil" size={15} />
                              </button>
                              <button
                                type="button"
                                className="rc-del"
                                onClick={() => setRemoving(f)}
                                title={t("ลบ{farm}", { farm: t(f.name) })}
                                aria-label={t("ลบ{farm}", { farm: t(f.name) })}
                              >
                                <Icon name="trash" size={15} />
                              </button>
                            </span>
                          )}
                        </span>
                        <span className="farm-card-name">
                          {/* ชื่ออยู่ใน span ของตัวเอง เพื่อจำกัดความสูงได้สูงสุด 2 บรรทัด
                              — หัวการ์ดทุกใบจะได้สูงเท่ากันเป๊ะ ไม่ว่าชื่อจะยาวแค่ไหน */}
                          <span className="farm-card-title">{t(f.name)}</span>
                          <span className="farm-card-place">
                            <Icon name="pin" size={16} />
                            {/* ข้อความอยู่ใน span แยก เพื่อให้ตัดท้ายด้วย … ได้เวลาการ์ดแคบ */}
                            {/* ฟาร์มจริงจากหลังบ้านยังไม่มีอำเภอ — กรองค่าว่างทิ้ง
                                ไม่งั้นจะขึ้นเป็น " · กำแพงเพชร" ที่มีจุดคั่นลอย ๆ */}
                            <span>
                              {[f.district, f.province]
                                .filter(Boolean)
                                .map((word) => t(word))
                                .join(" · ")}
                            </span>
                          </span>
                        </span>
                      </div>

                      <div className="farm-card-photo" aria-hidden="true">
                        <span className="farm-float">
                          <FarmArt className="farm-card-scene" crop={i} />
                        </span>
                        <span className="farm-float-shadow" />
                      </div>

                      {/* ประเภทสุกรที่เลี้ยงในฟาร์มนี้ — ให้เห็นผลของตัวกรอง "ประเภทสุกร" ได้ทันที */}
                      <ul className="farm-card-tags">
                        {/* ตัวแปรวนชื่อว่า `kind` ไม่ใช่ `t` — `t` คือตัวแปลข้อความของทั้งหน้า */}
                        {f.pigTypes.map((kind) => (
                          <li
                            key={kind}
                            className={
                              "farm-card-tag" +
                              (pigType === kind ? " is-active" : "")
                            }
                          >
                            {t(kind)}
                          </li>
                        ))}
                      </ul>

                      <dl className="farm-card-figures">
                        <div>
                          <dt>
                            <Icon name="home" size={17} />
                            {t("โรงเรือน (หลัง)")}
                          </dt>
                          <dd>
                            <b className="num">{formatNumber(f.barnCount)}</b>
                          </dd>
                        </div>
                        <div>
                          <dt>
                            <Icon name="pig" size={17} />
                            {t("จำนวนสุกร (ตัว)")}
                          </dt>
                          <dd>
                            <b className="num">{formatNumber(f.pigs)}</b>
                          </dd>
                        </div>
                        {/* ถอด "คะแนนสุขภาพ (%)" ออกจากการ์ดแล้ว (T1.92)
                            สูตร healthScore() ยังอยู่ เพราะตัวเลือกเรียง "คะแนนสุขภาพสูงสุด" ยังใช้ */}
                        <div>
                          <dt>
                            <Icon name="bell" size={17} />
                            {t("แจ้งเตือน (รายการ)")}
                          </dt>
                          <dd>
                            <b className="num">{formatNumber(f.alerts)}</b>
                          </dd>
                        </div>
                      </dl>

                      <Link
                        to={`/dashboard/farms/${f.id}`}
                        className="farm-card-link"
                      >
                        {t("ดูรายละเอียดโรงเรือน")}
                        <Icon name="chevron" size={16} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </Block>
      </PageBoard>

      <ConfirmModal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removeFarm(removing.id)}
        title={t("ลบ{farm}?", { farm: removing ? t(removing.name) : "" })}
        /* barnCount มาจาก useAllFarms ซึ่งนับถูกทั้งฟาร์มจริง ฟาร์มตัวอย่าง และที่เพิ่มเอง */
        message={
          removing
            ? t("{farm} และโรงเรือน {n} หลังของฟาร์มนี้ จะหายไปจากทุกหน้า", {
                farm: t(removing.name),
                n: formatNumber(removing.barnCount ?? 0),
              })
            : ""
        }
        confirmLabel={t("ลบ{farm}", { farm: removing ? t(removing.name) : "" })}
        note={
          removing && !isUserRecord(removing.id)
            ? t("ฟาร์มของระบบจะถูกซ่อนไว้เฉย ๆ กดกู้คืนจากแถบด้านบนหน้ารายการได้ตลอด")
            : undefined
        }
      />

      <FarmFormModal open={addOpen} onClose={() => setAddOpen(false)} />
      <FarmFormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        farm={editing}
      />
    </>
  );
}
