/**
 * หน้า "โรงเรือนทั้งหมดในฟาร์ม X" — เส้นทาง /dashboard/farms/:farmId
 *
 * เข้ามาจากปุ่ม "ดูรายละเอียด" บนการ์ดฟาร์มในหน้า /dashboard/farms
 * โครง: เส้นทางนำทาง (breadcrumb) → หัวเรื่อง + แถบสรุป 5 ช่อง
 *       → ค้นหา/โซน/อาคาร/สถานะ/เรียงตาม + สลับมุมมองการ์ด-ตาราง
 *       → การ์ดโรงเรือน (หรือแถวตาราง)
 *
 * ข้อมูลโรงเรือนมาจาก data/mock/barnsByFarm.js (สร้างจากข้อมูลระดับฟาร์มแบบคงที่)
 * โรงเรือนออฟไลน์ไม่มีค่าเซนเซอร์ — แสดง “—” ทุกช่อง ไม่ใช่เลข 0
 */
import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Card from "../components/ui/Card.jsx";
import PageBoard, { Block } from "../components/board/PageBoard.jsx";
import Icon from "../components/ui/Icon.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import DataSourceBadge from "../components/ui/DataSourceBadge.jsx";
import BarnArt from "../components/ui/BarnArt.jsx";
import BarnSpark from "../components/climate/BarnSpark.jsx";
import { summarizeBarns, BARN_STATUS_LABEL } from "../data/mock/barnsByFarm.js";
import AdjustModal from "../components/adjust/AdjustModal.jsx";
import BarnFormModal from "../components/records/BarnFormModal.jsx";
import ConfirmModal from "../components/ui/ConfirmModal.jsx";
import { isUserRecord } from "../lib/records/useRecords.js";
import { useFarmEditor } from "../lib/records/useFarmEditor.js";
import { useAllFarms } from "../lib/records/useAllFarms.js";
import { useBarnCounts } from "../lib/records/useBarnCounts.js";
import { useAuth } from "../lib/auth/useAuth.js";
import { useAdjust, targetKey } from "../lib/adjust/useAdjust.js";
import { formatNumber, formatNumber1, formatDateTime } from "../lib/format.js";
import { heldDisplay } from "../lib/heldReading.js";
import "./FarmBarns.css";
import { useT } from "../lib/i18n/useT.js";

const SORTS = [
  { value: "name", label: "ชื่อโรงเรือน A–Z" },
  { value: "alerts", label: "แจ้งเตือนมากสุด" },
  { value: "pigs", label: "สุกรมากสุด" },
  { value: "health", label: "คะแนนสุขภาพสูงสุด" },
];

/** ตัวเลขที่อาจไม่มีค่า (โรงเรือนออฟไลน์) — ต้องขึ้น “—” ไม่ใช่ 0 */
const orDash = (value, format = formatNumber) =>
  value === null || value === undefined ? "—" : format(value);

/* ค่าค้างเมื่อเซนเซอร์เงียบ (T1.345) — กติกาอยู่ที่ lib/heldReading.js ที่เดียว */
const shownOf = (barn, liveValue, heldKey, format, t) =>
  heldDisplay({
    live: liveValue ?? null,
    held: barn?.held?.[heldKey] ?? null,
    at: barn?.held?.at ?? null,
    format,
    t,
  });

/** รหัสกระดานของหน้านี้ — คีย์ที่ใช้เก็บชุดเลย์เอาต์ (ดู lib/layout/presets.js) */
const BOARD_ID = "farmBarns";

export default function FarmBarns() {
  const t = useT();
  const { farmId } = useParams();
  /* ฟาร์มและโรงเรือน = ของระบบ + ที่ผู้ใช้เพิ่มเอง (ตัวเลขสรุปหัวหน้านับรวมด้วย) */
  const { removeBarn, restore, removedIds } = useFarmEditor();
  /* ใช้ useAllFarms เพื่อให้เห็นทั้งฟาร์มจริงจากหลังบ้านและฟาร์มตัวอย่าง
     (เดิมหน้านี้อ่าน mock ตรง ๆ พอเข้าฟาร์มจริงจึงขึ้นว่า "ไม่พบฟาร์มนี้") */
  const { findFarm, barnsOf } = useAllFarms();
  /* เพิ่ม/แก้/ลบ/กู้คืนโรงเรือน เป็นการแก้โครงสร้าง — เฉพาะผู้ดูแลระบบ และผู้ใช้งานทั่วไป
     "ไม่เห็นปุ่มเลย" (เหมือนหน้า Farms.jsx — เหตุผลอยู่ในคอมเมนต์ที่นั่น)
     ส่วนปุ่ม "ปรับจำนวน" เป็นงานบันทึกประจำวัน จงใจไม่ล็อกและไม่ซ่อน ผู้ใช้งานต้องทำได้
     (ดูกติกาการแบ่งที่ lib/auth/roles.js) */
  const canManage = useAuth().can("farm.manage");
  /* ต้องหาในรายการที่รวมฟาร์มที่ผู้ใช้เพิ่มเองด้วย ไม่งั้นเปิดฟาร์มที่เพิ่งเพิ่มแล้วขึ้น "ไม่พบฟาร์ม" */
  const farm = findFarm(farmId);
  const allBarns = useMemo(() => barnsOf(farmId), [farmId, barnsOf]);

  const [query, setQuery] = useState("");
  const [zone, setZone] = useState("all");
  const [building, setBuilding] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("name");
  const [view, setView] = useState("grid");
  /* โรงเรือนที่กำลังเปิดป๊อบอัพปรับจำนวนอยู่ (null = ปิด) */
  const [adjusting, setAdjusting] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  /* โรงเรือนที่กำลังแก้ไขอยู่ (null = ไม่ได้แก้) */
  const [editingBarn, setEditingBarn] = useState(null);
  /* โหมดแก้ไข — ปิดไว้ก่อนเสมอ ดินสอ/ถังขยะบนการ์ดจะโผล่ต่อเมื่อกดเปิดโหมดนี้
     กติกาเดียวกับหน้าฟาร์มทั้งหมด (Farms.jsx) สองหน้านี้ต้องใช้งานเหมือนกัน */
  const [editMode, setEditMode] = useState(false);
  /* โรงเรือนที่กำลังจะลบ — ถามยืนยันก่อนเสมอ */
  const [removingBarn, setRemovingBarn] = useState(null);
  const { netOf, canWrite } = useAdjust();
  /* จำนวนสุกรรายเล้า — **กติกาชุดเดียวกับหน้าภาพรวมและหน้าจำนวนสุกร** (T1.341)
     เดิมหน้านี้อ่าน `b.pigs` ตรง ๆ ซึ่งโรงเรือนจริงเป็น `null` เสมอ (ฐานไม่มีคอลัมน์นี้
     โดยเจตนา — ยอดจริงนับจาก `barn_log`) ทุกเล้าของฟาร์มจริงจึงขึ้น "—" ทั้งหน้า
     ทั้งที่ระบบนับได้ 1,198 ตัวและหน้าภาพรวมก็โชว์เลขนั้นอยู่
     — คนละเลขในสองหน้าเรื่องเดียวกัน แย่กว่าแอปพัง เพราะไม่รู้ว่าต้องเชื่อหน้าไหน */
  const { rows: countRows } = useBarnCounts(farmId);
  const countById = useMemo(
    () => new Map(countRows.map((r) => [r.barn.id, r])),
    [countRows],
  );
  /* useCallback เพราะตัวเรียงรายการใช้ค่านี้อยู่ใน useMemo ด้วย */
  const pigsOf = useCallback((b) => countById.get(b.id)?.count ?? null, [countById]);
  /* `null` = ยังสรุปจำนวนไม่ได้ ต้องขึ้น "—" ไม่ใช่ 0 (0 คือคำตอบที่ผิด ไม่ใช่ "ยังไม่รู้") */
  const hasPigs = (b) => pigsOf(b) != null;

  const zones = [...new Set(allBarns.map((b) => b.zone))];
  const buildings = [...new Set(allBarns.map((b) => b.building))].sort();

  const visibleBarns = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = allBarns.filter((b) => {
      const matchQuery =
        !q ||
        /* กรองค่าว่างทิ้ง — โรงเรือนจากหลังบ้านยังไม่รู้ช่วงวัย (stage)
           ไม่งั้น String(null) กลายเป็น "null" แล้วพิมพ์คำนั้นจะค้นเจอโรงเรือนพวกนี้ */
        [b.name, b.zone, b.stage].filter(Boolean).some((v) =>
          String(v).toLowerCase().includes(q),
        );
      return (
        matchQuery &&
        (zone === "all" || b.zone === zone) &&
        (building === "all" || String(b.building) === building) &&
        (status === "all" || b.status === status)
      );
    });

    const by = {
      name: (a, b) => a.name.localeCompare(b.name, "th"),
      alerts: (a, b) => b.alerts - a.alerts,
      /* ★ เล้าที่ยังไม่รู้จำนวนไปอยู่ท้ายรายการ — เทียบด้วย `b.pigs` ตรง ๆ จะได้ NaN
         ทุกคู่ที่มีเล้าของฟาร์มจริงอยู่ด้วย แล้วลำดับทั้งหน้าจะเพี้ยนเงียบ ๆ */
      pigs: (a, b) => (pigsOf(b) ?? -1) - (pigsOf(a) ?? -1),
      health: (a, b) => (b.health ?? -1) - (a.health ?? -1),
    };
    return [...list].sort(by[sort]);
  }, [allBarns, query, zone, building, status, sort, pigsOf]);

  const isFiltered =
    query.trim() !== "" ||
    zone !== "all" ||
    building !== "all" ||
    status !== "all";

  if (!farm) {
    return (
      <Card title={t("ไม่พบฟาร์มนี้")} icon="warn">
        <p className="fx-empty">
          ไม่พบฟาร์มรหัส “{farmId}” — กลับไปเลือกจาก{" "}
          <Link to="/dashboard/farms">{t("รายการฟาร์มทั้งหมด")}</Link>
        </p>
      </Card>
    );
  }

  const summary = summarizeBarns(allBarns);

  return (
    <>
      <nav className="crumbs" aria-label={t("เส้นทางหน้า")}>
        <Link to="/dashboard">{t("ภาพรวม")}</Link>
        <Icon name="chevron" size={15} />
        <Link to="/dashboard/farms">{t("ฟาร์มทั้งหมด|ตัวเลือก")}</Link>
        <Icon name="chevron" size={15} />
        <span aria-current="page">{t(farm.name)}</span>
      </nav>

      <section className="barns-head stack-block">
        <div className="barns-head-main">
          <span className="icon-chip" aria-hidden="true">
            <Icon name="home" size={24} />
          </span>
          {/* min-width: 0 ต้องมี ไม่งั้นชื่อหน้ายาว ๆ จะดันกล่องนี้ให้กว้างเกินส่วนแบ่งของตัวเอง
              แล้ว … ท้ายบรรทัดจะไม่ทำงาน (กติกาของ flex item) */}
          <div className="barns-head-text">
            {/* ชื่อหน้าถูกบังคับให้อยู่บรรทัดเดียวเสมอ ยาวเกินก็ตัดด้วย … (ชื่อเต็มอยู่ใน title)
                **ห้ามปล่อยให้ตกบรรทัด** ไม่งั้นหัวหน้าจะสูงกว่าหน้าฟาร์มทั้งหมด
                แล้วปุ่ม/แถบสรุปจะไม่อยู่ตำแหน่งเดียวกันเวลาสลับสองหน้านี้ไปมา */}
            <h1 className="barns-title" title={t("โรงเรือนใน{farm}", { farm: t(farm.name) })}>
              {t("โรงเรือนใน{farm}", { farm: t(farm.name) })}
            </h1>
            {/* เหลือแต่ข้อมูลจริง (ที่มาข้อมูล + ที่ตั้ง + เวลาอัปเดต) — บรรทัดเดียวเหมือนหน้าฟาร์ม
                ป้ายที่มาข้อมูลย้ายลงมาจากชื่อหน้า เพราะอยู่ในชื่อหน้าแล้วดันชื่อตกบรรทัด */}
            <p className="barns-subtitle">
              <DataSourceBadge source={farm.dataSource} />
              {/* กรองค่าว่างทิ้ง — ฟาร์มจากหลังบ้านยังไม่มีอำเภอ */}
              <span>
                {t("{place} · อัปเดตล่าสุด {time}", {
                  place: [farm.district, farm.province]
                    .filter(Boolean)
                    .map((word) => t(word))
                    .join(" · "),
                  time: formatDateTime(farm.updatedAt),
                })}
              </span>
            </p>
          </div>
        </div>
        {/* ตัวเลขสรุปอยู่ในหัวหน้าเลย เหมือนหน้าฟาร์มทั้งหมด (ดู Farms.jsx) */}
        {canManage && (
          <span className="rc-head-btns">
            {/* "เพิ่มโรงเรือน" มาก่อน เป็นงานหลักของหน้า · สวิตช์โหมดแก้ไขเป็นปุ่มรอง
                เรียงเหมือนหัวหน้าฟาร์มทั้งหมดเป๊ะ ๆ จะได้ไม่ต้องกวาดตาหาปุ่มใหม่ตอนสลับหน้า */}
            <button
              type="button"
              className="rc-add"
              onClick={() => setAddOpen(true)}
              aria-haspopup="dialog"
            >
              <Icon name="plus" size={20} />
              {t("เพิ่มโรงเรือน")}
            </button>
            <button
              type="button"
              className={"rc-editmode" + (editMode ? " is-on" : "")}
              onClick={() => setEditMode((v) => !v)}
              aria-pressed={editMode}
            >
              <Icon name={editMode ? "check" : "pencil"} size={19} />
              {editMode ? t("เสร็จสิ้น") : t("แก้ไขโรงเรือน")}
            </button>
          </span>
        )}

        <dl className="head-stats">
          <div className="head-stat">
            <dt>
              <Icon name="home" size={16} aria-hidden="true" />
              {t("โรงเรือนทั้งหมด")}
            </dt>
            <dd>
              <b className="num">{formatNumber(summary.total)}</b> {t("หลัง")}
            </dd>
          </div>
          <div className="head-stat">
            <dt>
              <StatusBadge tone="good">{t("ออนไลน์")}</StatusBadge>
            </dt>
            <dd>
              <b className="num">{formatNumber(summary.online)}</b> {t("หลัง")}
            </dd>
          </div>
          <div className="head-stat">
            <dt>
              {/* ใช้คำเดียวกับหน้าฟาร์มทั้งหมด — สั้นกว่าและพอดีกล่องสรุปที่แคบลงแล้ว */}
              <StatusBadge tone="warning">{t("เฝ้าระวัง")}</StatusBadge>
            </dt>
            <dd>
              <b className="num">{formatNumber(summary.warning)}</b> {t("หลัง")}
            </dd>
          </div>
          {/* หัวหน้านี้ต้องมีสี่กล่องชุดเดียวกับหน้าฟาร์มทั้งหมด (ทั้งหมด · ออนไลน์ · เฝ้าระวัง · แจ้งเตือน)
              กล่อง "ออฟไลน์" ถูกถอดออกให้เท่ากัน — จำนวนออฟไลน์ยังดูได้จากตัวกรองสถานะด้านล่าง
              และการ์ดของโรงเรือนออฟไลน์ยังมีป้ายกำกับของตัวเองเสมอ */}
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

      {/* ผู้ใช้งานกู้คืนไม่ได้ จึงไม่ต้องบอกว่ามีของถูกซ่อนไว้ (เหมือนหน้า Farms.jsx) */}
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
        <Block id="list" label={t("รายการโรงเรือน")}>
          <Card className="barns-board">
            <div className="fx-toolbar">
              <span className="fx-search">
                <Icon name="search" size={19} className="fx-search-icon" />
                <input
                  type="search"
                  className="fx-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("ค้นหาโรงเรือน")}
                  aria-label={t("ค้นหาโรงเรือน")}
                />
              </span>
              <select
                className="fx-select"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                aria-label={t("กรองตามโซน")}
              >
                <option value="all">{t("ทุกโซน")}</option>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {t("โซน {zone}", { zone: z })}
                  </option>
                ))}
              </select>
              <select
                className="fx-select"
                value={building}
                onChange={(e) => setBuilding(e.target.value)}
                aria-label={t("กรองตามอาคาร")}
              >
                <option value="all">{t("ทุกอาคาร")}</option>
                {buildings.map((b) => (
                  <option key={b} value={String(b)}>
                    {t("อาคาร {n}", { n: b })}
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
                {Object.entries(BARN_STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {t(label)}
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
                    setZone("all");
                    setBuilding("all");
                    setStatus("all");
                  }}
                >
                  <Icon name="cross" size={17} />
                  {t("ล้างตัวกรอง")}
                </button>
              )}

              <div
                className="view-switch"
                role="group"
                aria-label={t("รูปแบบการแสดงผล")}
              >
                <button
                  type="button"
                  className={
                    "view-switch-btn" + (view === "grid" ? " is-active" : "")
                  }
                  onClick={() => setView("grid")}
                  aria-pressed={view === "grid"}
                >
                  <Icon name="grid" size={18} />
                  {t("การ์ด")}
                </button>
                <button
                  type="button"
                  className={
                    "view-switch-btn" + (view === "list" ? " is-active" : "")
                  }
                  onClick={() => setView("list")}
                  aria-pressed={view === "list"}
                >
                  <Icon name="list" size={18} />
                  {t("ตาราง")}
                </button>
              </div>
            </div>

            {visibleBarns.length === 0 ? (
              <p className="fx-empty">
                ไม่พบโรงเรือนที่ตรงกับเงื่อนไข — ลองแก้คำค้นหรือกด “ล้างตัวกรอง”
              </p>
            ) : view === "grid" ? (
              <ul className="barn-card-grid">
                {visibleBarns.map((b, i) => (
                  <li
                    key={b.id}
                    className={
                      "barn-card" +
                      (b.status === "offline" ? " is-offline" : "")
                    }
                  >
                    <div className="barn-card-top">
                      {/* เรียงเหมือนการ์ดฟาร์มเป๊ะ ๆ: แถวบนเป็นสถานะ + ดินสอ + ถังขยะ
                          แถวล่างเป็นชื่อโรงเรือนกับที่ตั้ง ชิดซ้ายเต็มความกว้าง
                          สองหน้านี้การ์ดหน้าตาเดียวกัน ปุ่มจึงต้องอยู่ตำแหน่งเดียวกันด้วย
                          ไม่งั้นสลับหน้าทีต้องกวาดตาหาปุ่มใหม่ทุกที */}
                      <span className="barn-card-status">
                        <StatusBadge tone={b.status}>
                          {t(BARN_STATUS_LABEL[b.status])}
                        </StatusBadge>

                        {/* ทุกโรงเรือนแก้ไข/ลบได้ — ของระบบที่ลบจะถูกซ่อนไว้ กู้คืนได้
                            ดินสอกับถังขยะห่อไว้ด้วยกันใน .rc-btns เพื่อ **ห้ามแยกคนละบรรทัด**
                            อยู่บรรทัดล่างถัดจากป้ายสถานะ (.barn-card-status เรียงเป็นคอลัมน์)
                            ผู้ใช้งานทั่วไปไม่เห็นทั้งก้อน — ผู้ดูแลระบบก็เห็นเฉพาะตอนเปิดโหมดแก้ไข */}
                        {canManage && editMode && (
                          <span className="rc-btns">
                            <button
                              type="button"
                              className="rc-del rc-edit"
                              onClick={() => setEditingBarn(b)}
                              title={t("แก้ไข{barn}", { barn: t(b.name) })}
                              aria-label={t("แก้ไข{barn}", { barn: t(b.name) })}
                            >
                              <Icon name="pencil" size={15} />
                            </button>
                            <button
                              type="button"
                              className="rc-del"
                              onClick={() => setRemovingBarn(b)}
                              title={t("ลบ{barn}", { barn: t(b.name) })}
                              aria-label={t("ลบ{barn}", { barn: t(b.name) })}
                            >
                              <Icon name="trash" size={15} />
                            </button>
                          </span>
                        )}
                      </span>
                      <span className="barn-card-name">
                        {/* ชื่ออยู่ใน span ของตัวเอง เพื่อจำกัดความสูงได้สูงสุด 2 บรรทัด
                            — หัวการ์ดทุกใบจะได้สูงเท่ากันเป๊ะ (เหมือนการ์ดฟาร์ม) */}
                        <span className="barn-card-title">{t(b.name)}</span>
                        <span className="barn-card-place">
                          {/* ช่วงวัยยังว่างได้ (โรงเรือนจริงยังไม่ได้ระบุ) — กรองทิ้งก่อนต่อจุดคั่น
                              ไม่งั้นจะเหลือ "·" ลอยอยู่ท้ายบรรทัด */}
                          {[t("โซน {zone}", { zone: b.zone }), t("อาคาร {n}", { n: b.building }), t(b.stage)]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </div>

                    <div className="barn-card-body">
                      <div className="barn-card-photo" aria-hidden="true">
                        <span className="barn-float">
                          <BarnArt className="barn-card-scene" variant={i} />
                        </span>
                        <span className="barn-float-shadow" />
                      </div>

                      <div className="barn-card-data">
                        <p className="barn-kpi">
                          <span>{t("จำนวนสุกร")}</span>
                          {/* ยังไม่มีข้อมูลฝูงสุกรของโรงเรือนจริง — ขึ้นขีดกลาง ไม่ใช่ 0
                              เพราะ "0 ตัว" คือคำตอบที่ผิด ส่วน "—" แปลว่ายังไม่รู้
                              แต่พอผู้ใช้กรอกเองแล้ว ต้องโชว์ตัวเลข ไม่ใช่ค้าง "—" ตลอดไป */}
                          <b className="num">
                            {hasPigs(b) ? formatNumber(pigsOf(b)) : orDash(null)}
                          </b>
                          <em>{t("ตัว")}</em>
                          {netOf(targetKey("barn", b.id)) !== 0 && (
                            <span className="aj-net num">
                              {netOf(targetKey("barn", b.id)) > 0 ? "+" : "−"}
                              {formatNumber(
                                Math.abs(netOf(targetKey("barn", b.id))),
                              )}
                            </span>
                          )}
                        </p>

                        {/* ปุ่มปรับจำนวนอยู่ในการ์ด ไม่ใช่ในลิงก์ — กดแล้วต้องเปิดป๊อบอัพ ไม่ใช่เปลี่ยนหน้า */}
                        <span className="barn-card-tools">
                          <button
                            type="button"
                            className="aj-open"
                            onClick={() => setAdjusting(b)}
                            aria-haspopup="dialog"
                          >
                            <Icon name={canWrite ? "plus" : "lock"} size={16} />
                            {/* ไม่มีสิทธิ์บันทึก = ยังกดเข้าไปดูจำนวนกับประวัติได้ แต่บอกให้ตรงว่ากดแล้วได้อะไร
                                (ไม่ซ่อนปุ่มทิ้ง ตามกติกาใน CLAUDE.md — ซ่อนแล้วจะนึกว่าแอปทำไม่ได้) */}
                            {canWrite ? t("ปรับจำนวน") : t("ดูประวัติ")}
                          </button>
                          {/* ปุ่มแก้ไข/ลบ ย้ายไปอยู่ข้างป้ายสถานะที่หัวการ์ดแล้ว */}
                        </span>

                        <dl className="barn-facts">
                          {(() => {
                            const shown = shownOf(b, b.tempC, "tempC", formatNumber1, t);
                            return (
                              <div
                                className={
                                  (b.tempC > 28 ? "is-warn" : "") + (shown.isHeld ? " is-held" : "")
                                }
                              >
                                <dt>{t("อุณหภูมิ")}</dt>
                                <dd>
                                  <b className="num">{shown.text}</b> °C
                                  {shown.note && <small className="barn-held">{shown.note}</small>}
                                </dd>
                              </div>
                            );
                          })()}
                          {(() => {
                            const shown = shownOf(b, b.humidity, "humidity", formatNumber, t);
                            return (
                              <div
                                className={
                                  (b.humidity > 75 ? "is-warn" : "") + (shown.isHeld ? " is-held" : "")
                                }
                              >
                                <dt>{t("ความชื้น")}</dt>
                                <dd>
                                  <b className="num">{shown.text}</b> %
                                  {shown.note && <small className="barn-held">{shown.note}</small>}
                                </dd>
                              </div>
                            );
                          })()}
                        </dl>

                        {/* แนวโน้ม 24 ชม. — ตัวเลขปัจจุบันบอกว่า "ตอนนี้เท่าไร"
                            แต่ไม่บอกว่ากำลังขึ้นหรือลง ซึ่งเป็นสิ่งที่ต้องรู้ก่อนตัดสินใจ */}
                        <BarnSpark barn={b} farmId={farmId} />
                      </div>
                    </div>

                    <Link
                      to={`/dashboard/farms/${farmId}/barns/${b.id}`}
                      className="barn-card-link"
                    >
                      {t("ดูรายละเอียดโรงเรือน")}
                      <Icon name="chevron" size={16} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("โรงเรือน|หัวตาราง")}</th>
                      <th>{t("โซน / อาคาร")}</th>
                      <th>{t("ช่วงวัย")}</th>
                      <th>{t("สถานะ")}</th>
                      <th className="num">{t("สุกร (ตัว)")}</th>
                      <th className="num">{t("อุณหภูมิ (°C)")}</th>
                      <th className="num">{t("ความชื้น (%)")}</th>
                      <th className="num">NH₃ (ppm)</th>
                      <th className="num">{t("คะแนนสุขภาพ")}</th>
                      <th className="num">{t("แจ้งเตือน")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleBarns.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <Link to={`/dashboard/farms/${farmId}/barns/${b.id}`}>
                            {t(b.name)}
                          </Link>
                        </td>
                        <td>
                          โซน {b.zone} · อาคาร {b.building}
                        </td>
                        <td>{t(b.stage)}</td>
                        <td>
                          <StatusBadge tone={b.status}>
                            {t(BARN_STATUS_LABEL[b.status])}
                          </StatusBadge>
                        </td>
                        {/* กติกาเดียวกับการ์ด: ยังไม่รู้จำนวน = "—" ไม่ใช่ 0 */}
                        <td className="num">
                          {hasPigs(b) ? formatNumber(pigsOf(b)) : orDash(null)}
                        </td>
                        {/* ตารางแคบกว่าการ์ด ใส่บรรทัดอายุทุกช่องแล้วอ่านไม่รู้เรื่อง
                            ค่าค้างจึงหรี่เอาแล้วบอกอายุใน title — สถานะ offline มีป้ายพร้อมไอคอนอยู่คนละคอลัมน์แล้ว */}
                        {[
                          { v: b.tempC, k: "tempC", f: formatNumber1 },
                          { v: b.humidity, k: "humidity", f: formatNumber },
                          { v: b.nh3, k: "nh3", f: formatNumber },
                        ].map(({ v, k, f }) => {
                          const shown = shownOf(b, v, k, f, t);
                          return (
                            <td
                              key={k}
                              className={"num" + (shown.isHeld ? " is-held" : "")}
                              title={shown.note ?? undefined}
                            >
                              {shown.text}
                            </td>
                          );
                        })}
                        <td className="num">{orDash(b.health)}</td>
                        <td className="num">{formatNumber(b.alerts)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </Block>
      </PageBoard>

      {/* ป๊อบอัพปรับจำนวนสุกรของโรงเรือนที่กดมา — ตัวเดียวใช้ร่วมทุกใบในหน้า */}
      <ConfirmModal
        open={removingBarn !== null}
        onClose={() => setRemovingBarn(null)}
        onConfirm={() => removeBarn(removingBarn.id)}
        title={t("ลบ{barn}?", { barn: removingBarn ? t(removingBarn.name) : "" })}
        message={
          /* ★ ยังไม่รู้จำนวน = เขียนว่าไม่รู้ ห้ามเติม "0 ตัว" ลงในข้อความที่คนใช้ตัดสินใจลบ
             และต้องเป็นสองประโยคคนละใบ ไม่ใช่ยัดคำว่า "ยังไม่ทราบ" ลงช่องตัวเลข
             ไม่งั้นได้ประโยคอ่านไม่ออกว่า "(สุกร ยังไม่ทราบจำนวน ตัว)" */
          !removingBarn
            ? ""
            : hasPigs(removingBarn)
              ? t("{barn} (สุกร {n} ตัว) จะหายไปจากทุกหน้า", {
                  barn: t(removingBarn.name),
                  n: formatNumber(pigsOf(removingBarn)),
                })
              : t("{barn} จะหายไปจากทุกหน้า — ระบบยังสรุปจำนวนสุกรของเล้านี้ไม่ได้", {
                  barn: t(removingBarn.name),
                })
        }
        confirmLabel={t("ลบ{barn}", { barn: removingBarn ? t(removingBarn.name) : "" })}
        note={
          removingBarn && !isUserRecord(removingBarn.id)
            ? t("โรงเรือนของระบบจะถูกซ่อนไว้เฉย ๆ กดกู้คืนจากแถบด้านบนได้ตลอด")
            : undefined
        }
      />

      <BarnFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        farm={farm}
        existing={allBarns}
      />

      <BarnFormModal
        open={editingBarn !== null}
        onClose={() => setEditingBarn(null)}
        farm={farm}
        existing={allBarns}
        barn={editingBarn}
        knownPigs={editingBarn ? pigsOf(editingBarn) : null}
      />

      <AdjustModal
        open={adjusting !== null}
        onClose={() => setAdjusting(null)}
        target={adjusting ? targetKey("barn", adjusting.id) : ""}
        title={adjusting?.name ?? ""}
        subtitle={`${farm?.name ?? ""} · ${adjusting?.stage ?? ""}`}
        base={(adjusting ? pigsOf(adjusting) : null) ?? 0}
        /* โรงเรือนจริงมี `apiId` — ส่วนต่างที่ปรับตรงนี้จะไม่ขึ้นระบบ ต้องบอกก่อนกด (T1.339) */
        inSystem={Boolean(adjusting?.apiId)}
      />
    </>
  );
}
