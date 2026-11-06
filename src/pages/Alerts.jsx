/**
 * หน้า "ศูนย์การแจ้งเตือน" — เส้นทาง /dashboard/alerts
 *
 * เข้ามาจากป๊อบอัพการแจ้งเตือน (กล่องในหน้าภาพรวม) · กระดิ่งบนแถบเมนู · เมนูย่อยของภาพรวม
 * รองรับ query: ?farm=<รหัสฟาร์ม> · ?barn=<รหัสโรงเรือน> · ?level=<critical|serious|open>
 * ตัวกรองเก็บใน URL จึงส่งลิงก์ต่อได้และกดย้อนกลับแล้วยังอยู่ที่เดิม
 *
 * โครงหน้า (จัดสัดส่วนใหม่ 1 ก.ย. 2569 — เหตุผลเต็มอยู่ที่ DEFAULT_LAYOUTS.alerts):
 *   หัวเรื่อง → ไทล์สรุป 4 ช่อง
 *   → ตารางรายการแจ้งเตือนล่าสุด + ชิปตัวกรอง (เต็มแถว ตารางกว้าง 857px จะได้ไม่ต้องเลื่อน)
 *   → คำแนะนำจาก AI (เต็มแถว — เป็นข้อความล้วน ยิ่งแคบยิ่งสูงพรวด)
 *   → แนวโน้ม 24 ชม. คู่กับโดนัทประเภทการแจ้งเตือน (สูงเท่ากันด้วย --al-chart-h)
 *   → โรงเรือนที่ต้องติดตาม
 *
 * ข้อมูลจาก data/mock/alerts.js — ยอด "ต้องดำเนินการ" ตรงกับ farms[].alerts เสมอ
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import Card from "../components/ui/Card.jsx";
import PageBoard, { Block } from "../components/board/PageBoard.jsx";
import Icon from "../components/ui/Icon.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import { farms as systemFarms, summarizeFarms } from "../data/mock/farms.js";
import { useAllFarms } from "../lib/records/useAllFarms.js";
import { useActivity } from "../lib/api/activity.js";
import {
  alertFeed,
  summarizeAlerts,
  hourlyTrend,
  watchBarns,
  aiAdvice,
  offlineBarnCount,
  ADVICE_PRIORITY,
  ALERT_LEVELS,
  ALERT_CATEGORIES,
} from "../data/mock/alerts.js";
import {
  SERIES,
  gridProps,
  axisProps,
  tooltipStyle,
} from "../lib/chartTheme.js";
import { useSettings } from "../lib/settings/useSettings.js";
import { formatDateTime, formatNumber, formatNumber1, formatWhen } from "../lib/format.js";
import "./Alerts.css";
import { useT } from "../lib/i18n/useT.js";
import { alertTitle } from "../lib/api/alertText.js";

const summary = summarizeFarms(systemFarms);
const OFFLINE_BARNS = offlineBarnCount();

/** สีประจำประเภทปัญหา — ผูกถาวร (อุณหภูมิ/ความชื้นใช้สีเดียวกับหน้าอุณหภูมิ) */
const CATEGORY_COLOR = {
  temp: SERIES[7],
  humidity: SERIES[0],
  nh3: SERIES[4],
  feed: SERIES[2],
  water: SERIES[1],
  pig: SERIES[5],
  sensor: SERIES[3],
};

const levelLabel = (id) =>
  id === "good" ? "ปกติ|ระดับแจ้งเตือน" : (ALERT_LEVELS.find((l) => l.id === id)?.label ?? id);
const categoryOf = (id) => ALERT_CATEGORIES.find((c) => c.id === id);

/** รหัสกระดานของหน้านี้ — คีย์ที่ใช้เก็บชุดเลย์เอาต์ (ดู lib/layout/presets.js) */
const BOARD_ID = "alerts";

/** จำนวนรายการที่โชว์ก่อนกด "แสดงทั้งหมด" — ทั้งตารางแจ้งเตือนและคำแนะนำ AI ใช้ค่าเดียวกัน */
const PREVIEW_COUNT = 3;

export default function Alerts() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  /* เกณฑ์และตัวกรองจากหน้าตั้งค่า — เกณฑ์มีผลตั้งแต่ตอน "สร้าง" รายการแจ้งเตือน
     (ข้อความในแจ้งเตือนจึงอ้างเกณฑ์ชุดเดียวกับที่ผู้ใช้ตั้งไว้) ส่วนตัวกรองมาทีหลัง */
  const { settings, passesLevel, openSettings } = useSettings();
  /* ต้องประกาศก่อน FEED ด้านล่าง — FEED อ้างถึง liveAlerts
     (ประกาศทีหลังแล้วจะพังทั้งหน้าด้วย "Cannot access before initialization") */
  const { farms, barnsOf, liveAlerts } = useAllFarms();

  const limits = useMemo(
    () => ({
      tempMin: settings.comfort.tempMin,
      tempMax: settings.comfort.tempMax,
      humidityMax: settings.comfort.humidityMax,
      nh3Limit: settings.comfort.nh3Limit,
    }),
    [settings.comfort],
  );
  /* รวมแจ้งเตือนจริงจากหลังบ้านเข้ากับของฟาร์มตัวอย่าง — ของจริงมาก่อนตอนเวลาเท่ากัน
     (ทั้งสองชุดมีรูปเดียวกันแล้ว ดู lib/api/alertText.js) */
  const FEED = useMemo(
    () =>
      [...liveAlerts, ...alertFeed(limits)].sort(
        (a, b) => new Date(b.time) - new Date(a.time),
      ),
    [liveAlerts, limits],
  );
  const OPEN = useMemo(() => FEED.filter((a) => a.status === "open"), [FEED]);
  const DONE = useMemo(() => FEED.filter((a) => a.status === "done"), [FEED]);

  const farmParam = params.get("farm");
  /* ตัวกรองต้องมีฟาร์ม/โรงเรือนที่ผู้ใช้เพิ่มเองด้วย (แม้ยังไม่มีแจ้งเตือนของตัวเอง) */
  const farmId = farms.some((f) => f.id === farmParam) ? farmParam : "all";
  const barns = farmId === "all" ? [] : barnsOf(farmId);
  const barnParam = params.get("barn");
  const barnId = barns.some((b) => b.id === barnParam) ? barnParam : "all";
  const viewParam = params.get("level");
  const view = ["critical", "serious", "open"].includes(viewParam)
    ? viewParam
    : "all";

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    if (key === "farm") next.delete("barn");
    setParams(next, { replace: true });
  };

  /* กรองตามที่ผู้ใช้ตั้งไว้ในหน้าตั้งค่าก่อน (ระดับต่ำสุด + หมวดที่ปิดไว้)
     แล้วค่อยกรองตามฟาร์ม/โรงเรือน และชิปใต้ตาราง */
  const scoped = useMemo(
    () =>
      FEED.filter(
        (a) =>
          passesLevel(a.level, a.category) &&
          (farmId === "all" || a.farmId === farmId) &&
          (barnId === "all" || a.barnId === barnId),
      ),
    [FEED, farmId, barnId, passesLevel],
  );
  /* จำนวนที่ถูกซ่อนจากการตั้งค่า — ต้องบอกผู้ใช้ ไม่งั้นจะนึกว่าระบบไม่เจออะไรเลย */
  const hiddenBySettings =
    FEED.length - FEED.filter((a) => passesLevel(a.level, a.category)).length;

  const list = useMemo(
    () =>
      scoped.filter((a) =>
        view === "all"
          ? true
          : view === "open"
            ? a.status === "open"
            : a.level === view,
      ),
    [scoped, view],
  );

  const openScoped = useMemo(
    () => scoped.filter((a) => a.status === "open"),
    [scoped],
  );
  const doneScoped = scoped.length - openScoped.length;
  /* ★ ใบที่ "ตรวจซ้ำไม่ได้" — โรงเรือนไม่มีค่าใหม่มาให้ตรวจแล้ว (T1.309)
     ตารางแยกให้เห็นแล้วตั้งแต่ T1.307 แต่ยอดรวมยังนับปนอยู่
     คนที่ดูแค่ไทล์สรุปจะเข้าใจว่าทุกใบคือสถานะตอนนี้ ทั้งที่บางใบไม่ได้ถูกตรวจมาหลายวัน */
  const unverifiedCount = useMemo(
    () => openScoped.filter((a) => a.unverified).length,
    [openScoped],
  );
  const stats = useMemo(() => summarizeAlerts(openScoped), [openScoped]);
  const trend = useMemo(() => hourlyTrend(scoped), [scoped]);
  const watch = useMemo(() => watchBarns(scoped), [scoped]);
  const advice = useMemo(() => aiAdvice(scoped), [scoped]);

  /* สองการ์ดนี้ยาวจนดันกล่องอื่นตกจอ ทั้งที่คนอ่านจริง ๆ แค่ไม่กี่รายการบนสุด
     → โชว์ล่าสุด 3 รายการก่อน ที่เหลือซ่อนไว้หลังปุ่ม (ไม่ได้ตัดข้อมูลทิ้ง กดดูได้ครบ) */
  const [feedAll, setFeedAll] = useState(false);
  const [adviceAll, setAdviceAll] = useState(false);

  /* ตัวกรองยุบอยู่ในปุ่มเดียว — เปิดค้างไว้ไม่ได้ ต้องปิดเมื่อกดที่อื่นหรือกด Esc
     เหมือนเมนูทั่วไป ไม่งั้นแผงจะบังตารางค้างอยู่จนกว่าจะนึกได้ว่าต้องกดปุ่มซ้ำ */
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);
  const activeFilters =
    (view === "all" ? 0 : 1) +
    (farmId === "all" ? 0 : 1) +
    (barnId === "all" ? 0 : 1);

  useEffect(() => {
    if (!filterOpen) return undefined;
    const onDown = (e) => {
      if (!filterRef.current?.contains(e.target)) setFilterOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setFilterOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [filterOpen]);
  const feedShown = feedAll ? list : list.slice(0, PREVIEW_COUNT);
  const adviceShown = adviceAll ? advice : advice.slice(0, PREVIEW_COUNT);

  const donut = stats.byCategory.map((c) => ({
    ...c,
    color: CATEGORY_COLOR[c.id],
  }));
  const donutTotal = donut.reduce((sum, c) => sum + c.count, 0);
  const levelCount = (id) => stats.byLevel.find((l) => l.id === id)?.count ?? 0;
  const isFiltered = farmId !== "all" || barnId !== "all" || view !== "all";
  const scopeName =
    barnId !== "all"
      ? `${barns.find((b) => b.id === barnId)?.name} · ${farms.find((f) => f.id === farmId)?.name}`
      : farmId !== "all"
        ? farms.find((f) => f.id === farmId)?.name
        : t("ทุกฟาร์มในเครือ");

  const CHIPS = [
    { id: "all", label: t("ทั้งหมด"), count: scoped.length, tone: "accent" },
    {
      id: "critical",
      label: t("วิกฤต"),
      count: levelCount("critical"),
      tone: "critical",
    },
    {
      id: "serious",
      label: t("ต้องจัดการ"),
      count: levelCount("serious"),
      tone: "serious",
    },
    {
      id: "open",
      label: t("ยังไม่ดำเนินการ"),
      count: openScoped.length,
      tone: "muted",
    },
  ];

  return (
    <div className="al-page">
      {/* ---------- หัวเรื่อง ---------- */}
      <section className="al-head">
        <span className="al-head-icon" aria-hidden="true">
          <Icon name="bell" size={30} />
        </span>
        <div>
          <h1 className="al-title">{t("ศูนย์การแจ้งเตือน")}</h1>
          {/* เหลือแต่ข้อมูลจริง (ขอบเขตที่ดูอยู่ + เวลาอัปเดต) — คำโปรยอธิบายหน้าเอาออก */}
          <p className="al-subtitle">
            {t("{scope} · อัปเดตล่าสุด {time}", {
              scope: scopeName,
              time: formatWhen(summary.updatedAt),
            })}
          </p>
        </div>
      </section>

      {hiddenBySettings > 0 && (
        <p className="al-hidden" role="status">
          <Icon name="gear" size={17} aria-hidden="true" />
          {t("ซ่อนอยู่ {n} รายการตามที่ตั้งไว้ —", { n: formatNumber(hiddenBySettings) })}
          <button
            type="button"
            className="al-hidden-btn"
            onClick={openSettings}
          >
            {t("ปรับระดับหรือหมวดที่ต้องการให้เตือน")}
          </button>
        </p>
      )}

      <PageBoard boardId={BOARD_ID}>
        {/* ---------- ไทล์สรุป 5 ช่อง ---------- */}
        <Block id="kpis" label={t("ไทล์สรุปการแจ้งเตือน")}>
          <div className="al-kpis">
            <article className="al-kpi is-critical">
              <span className="al-kpi-label">{t("แจ้งเตือนทั้งหมด")}</span>
              <p className="al-kpi-value">
                <b className="num">{formatNumber(openScoped.length)}</b>
                <em>{t("รายการ")}</em>
              </p>
              <span className="al-kpi-foot">
                {/* ★ เดิมเขียนว่า "วันนี้" ซึ่งไม่จริง — ใบที่ยังไม่ปิดค้างมาได้เป็นสัปดาห์
                    (ของจริง: ใบความชื้นเปิดค้างตั้งแต่ 18 ก.ย.) ตระกูลเดียวกับ T1.305 */}
                {t("ที่ยังไม่ปิด · จาก {n} โรงเรือน", { n: formatNumber(stats.barns) })}
                {unverifiedCount > 0 && (
                  <>
                    {" · "}
                    <b>{t("ตรวจซ้ำไม่ได้ {n}", { n: formatNumber(unverifiedCount) })}</b>
                  </>
                )}
              </span>
              <span className="al-kpi-icon" aria-hidden="true">
                <Icon name="bell" size={30} />
              </span>
            </article>

            <article className="al-kpi is-critical">
              <span className="al-kpi-label">{t("ระดับวิกฤต")}</span>
              <p className="al-kpi-value">
                <b className="num">{formatNumber(levelCount("critical"))}</b>
                <em>{t("รายการ")}</em>
              </p>
              <span className="al-kpi-foot">{t("ต้องแก้ไขทันที")}</span>
              <span className="al-kpi-icon" aria-hidden="true">
                <Icon name="warn" size={30} />
              </span>
            </article>

            {/* ไทล์ "ต้องจัดการ" ถูกเอาออกตามที่ผู้ใช้สั่ง (1 ก.ย. 2569)
                **ตัวเลขไม่ได้หายไปจากหน้า** — ยังอ่านได้จากชิปตัวกรอง "ต้องจัดการ"
                เหนือตาราง และจากแท่งสีในกราฟแนวโน้ม 24 ชม. จึงไม่ต้องแตะ levelCount() */}

            <article className="al-kpi is-good">
              <span className="al-kpi-label">{t("ดำเนินการแล้ว")}</span>
              <p className="al-kpi-value">
                <b className="num">{formatNumber(doneScoped)}</b>
                <em>{t("รายการ")}</em>
              </p>
              <span className="al-kpi-foot">{t("ปิดเรื่องแล้ววันนี้")}</span>
              <span className="al-kpi-icon" aria-hidden="true">
                <Icon name="check" size={30} />
              </span>
            </article>

            <article className="al-kpi is-offline">
              <span className="al-kpi-label">{t("อุปกรณ์ออฟไลน์")}</span>
              <p className="al-kpi-value">
                <b className="num">{formatNumber(OFFLINE_BARNS)}</b>
                <em>{t("โรงเรือน|หน่วยนับ")}</em>
              </p>
              <span className="al-kpi-foot">{t("ไม่ส่งข้อมูลเซนเซอร์")}</span>
              <span className="al-kpi-icon" aria-hidden="true">
                <Icon name="power" size={30} />
              </span>
            </article>
          </div>
        </Block>

        {/* ซ้าย: ตารางรายการ + ชิปตัวกรอง */}
        <Block id="feed" label={t("รายการแจ้งเตือนล่าสุด")}>
          <Card
            title={t("รายการแจ้งเตือนล่าสุด")}
            subtitle={
              feedAll || list.length <= PREVIEW_COUNT
                ? t("{n} รายการ · เรียงใหม่→เก่า", { n: formatNumber(list.length) })
                : t("แสดง {shown} จาก {total} รายการ · เรียงใหม่→เก่า", {
                    shown: formatNumber(feedShown.length),
                    total: formatNumber(list.length),
                  })
            }
            icon="list"
            className="al-feed-card"
          >
            {/* ตัวกรองทั้งหมดยุบไว้ในปุ่มเดียว — กดแล้วค่อยกางลงมา
                หัวการ์ดจะได้ไม่แน่นไปด้วยเครื่องมือที่ส่วนใหญ่ไม่ได้แตะ
                ตัวเลขบนปุ่มบอกว่ามีตัวกรองทำงานอยู่กี่ชั้น จะได้ไม่ลืมว่ากรองค้างไว้ */}
            <div className="al-filterwrap" ref={filterRef}>
              <div className="al-filterbar">
                <button
                  type="button"
                  className={"al-filter-btn" + (isFiltered ? " is-on" : "")}
                  onClick={() => setFilterOpen((v) => !v)}
                  aria-expanded={filterOpen}
                >
                  <Icon name="filter" size={17} />
                  {t("ตัวกรอง")}
                  {activeFilters > 0 && (
                    <b className="al-filter-count num">
                      {formatNumber(activeFilters)}
                    </b>
                  )}
                  <Icon
                    name="chevron"
                    size={16}
                    className={
                      "al-filter-caret" + (filterOpen ? " is-open" : "")
                    }
                  />
                </button>

                {isFiltered && (
                  <button
                    type="button"
                    className="al-clear"
                    onClick={() =>
                      setParams(new URLSearchParams(), { replace: true })
                    }
                  >
                    <Icon name="cross" size={16} />
                    {t("ล้างตัวกรอง")}
                  </button>
                )}
              </div>

              {/* ชิปตัวกรอง + เลือกฟาร์ม/โรงเรือน */}
              {filterOpen && (
                <div className="al-filters">
                  <div
                    className="al-chips"
                    role="group"
                    aria-label={t("ตัวกรองรายการ")}
                  >
                    {CHIPS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={
                          `al-chip is-${c.tone}` +
                          (view === c.id ? " is-active" : "")
                        }
                        onClick={() => setParam("level", c.id)}
                        aria-pressed={view === c.id}
                      >
                        <span className="al-chip-dot" aria-hidden="true" />
                        {c.label}
                        <b className="num">({formatNumber(c.count)})</b>
                      </button>
                    ))}
                  </div>

                  <div className="al-selects">
                    <label className="al-select">
                      <span className="sr-only">{t("เลือกฟาร์ม")}</span>
                      <Icon name="pin" size={17} />
                      <select
                        value={farmId}
                        onChange={(e) => setParam("farm", e.target.value)}
                      >
                        <option value="all">{t("ทุกฟาร์ม")}</option>
                        {farms.map((f) => (
                          <option key={f.id} value={f.id}>
                            {t(f.name)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="al-select">
                      <span className="sr-only">{t("เลือกโรงเรือน")}</span>
                      <Icon name="home" size={17} />
                      <select
                        value={barnId}
                        onChange={(e) => setParam("barn", e.target.value)}
                        disabled={farmId === "all"}
                      >
                        <option value="all">
                          {farmId === "all" ? t("เลือกฟาร์มก่อน") : t("ทุกโรงเรือน")}
                        </option>
                        {barns.map((b) => (
                          <option key={b.id} value={b.id}>
                            {t(b.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="table-scroll">
              <table className="al-table">
                <thead>
                  <tr>
                    <th>{t("เวลา")}</th>
                    <th>{t("ฟาร์ม / โรงเรือน")}</th>
                    <th>{t("ประเภทแจ้งเตือน")}</th>
                    <th>{t("ระดับ")}</th>
                    <th>{t("สถานะ")}</th>
                    <th className="al-th-action">{t("การดำเนินการ")}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="al-empty-cell">
                        {t("ไม่มีรายการที่ตรงกับตัวกรอง")}
                      </td>
                    </tr>
                  ) : (
                    feedShown.map((a) => (
                      <tr key={a.id}>
                        {/* ★ ต้องมีวันที่เมื่อไม่ใช่วันนี้ (T1.307) — ใบที่เปิดค้างมา 15 วัน
                            เคยขึ้นแค่ "12:33 น." ซึ่งอ่านว่าเพิ่งเกิดเมื่อเที่ยงนี้ */}
                        <td className="num">{formatWhen(a.time)}</td>
                        <td>
                          <span className="al-cell-place">
                            <b>{t(a.barnName)}</b>
                            <span>{t(a.farmName)}</span>
                          </span>
                        </td>
                        <td>
                          <span className="al-cell-type">
                            <span
                              className="al-type-icon"
                              style={{ color: CATEGORY_COLOR[a.category] }}
                              aria-hidden="true"
                            >
                              <Icon
                                name={categoryOf(a.category)?.icon ?? "bell"}
                                size={18}
                              />
                            </span>
                            <span className="al-cell-type-text">
                              {alertTitle(t, a)}
                              {/* ★ ใบที่ตรวจซ้ำไม่ได้ ต้องดูออกจากในตารางเลย (T1.307)
                                  ถ้าแสดงปนกับใบที่เพิ่งตรวจมา คนอ่านจะเข้าใจว่าทุกใบคือสถานะตอนนี้ */}
                              {a.unverified && (
                                <span className="al-unverified" title={t("โรงเรือนนี้ไม่มีค่าใหม่เข้ามาแล้ว จึงยังตรวจซ้ำไม่ได้ว่าหายหรือยัง")}>
                                  {t("ตรวจซ้ำไม่ได้")}
                                </span>
                              )}
                            </span>
                          </span>
                        </td>
                        <td>
                          <StatusBadge
                            tone={a.level === "good" ? "good" : a.level}
                          >
                            {t(levelLabel(a.level))}
                          </StatusBadge>
                        </td>
                        <td>
                          <span
                            className={
                              "al-status" +
                              (a.status === "done" ? " is-done" : " is-open")
                            }
                          >
                            {a.status === "done"
                              ? t("ดำเนินการแล้ว")
                              : t("ยังไม่ดำเนินการ")}
                          </span>
                        </td>
                        <td className="al-td-action">
                          <Link
                            to={`/dashboard/farms/${a.farmId}/barns/${a.barnId}#alerts`}
                            className="al-row-btn"
                          >
                            {t("รายละเอียด")}
                            <Icon name="chevron" size={15} />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* ปุ่มขยาย/ย่อ — ขึ้นเฉพาะตอนมีของซ่อนอยู่จริง จะได้ไม่มีปุ่มที่กดแล้วไม่เกิดอะไร */}
            {list.length > PREVIEW_COUNT && (
              <button
                type="button"
                className="al-more"
                onClick={() => setFeedAll((v) => !v)}
                aria-expanded={feedAll}
              >
                <Icon
                  name="chevron"
                  size={17}
                  className={feedAll ? "al-more-up" : ""}
                />
                {feedAll
                  ? t("ย่อกลับ")
                  : t("แสดงทั้งหมด (อีก {n} รายการ)", {
                      n: formatNumber(list.length - PREVIEW_COUNT),
                    })}
              </button>
            )}
          </Card>
        </Block>

        {/* ขวา: คำแนะนำ AI + กราฟ */}
        <Block id="ai" label={t("คำแนะนำจาก AI")}>
          <Card
            title={t("คำแนะนำจาก AI")}
            subtitle={
              adviceAll || advice.length <= PREVIEW_COUNT
                ? t("สรุปสิ่งที่ควรทำก่อน · อัปเดต {time}", {
                    time: formatWhen(summary.updatedAt),
                  })
                : t("แสดง {shown} จาก {total} ข้อ · อัปเดต {time}", {
                    shown: formatNumber(adviceShown.length),
                    total: formatNumber(advice.length),
                    time: formatWhen(summary.updatedAt),
                  })
            }
            icon="spark"
            className="al-ai-card"
          >
            {advice.length === 0 ? (
              <p className="al-empty">{t("ตอนนี้ไม่มีเรื่องที่ต้องลงมือทำ")}</p>
            ) : (
              <ul className="al-ai">
                {adviceShown.map((a) => (
                  <li key={a.id}>
                    <span
                      className="al-ai-icon"
                      style={{ color: CATEGORY_COLOR[a.category] }}
                      aria-hidden="true"
                    >
                      <Icon
                        name={categoryOf(a.category)?.icon ?? "bell"}
                        size={22}
                      />
                    </span>
                    <span className="al-ai-text">
                      <b>{alertTitle(t, a)}</b>
                      <span>
                        {t("{barn} · {detail}", {
                          barn: t(a.barnName),
                          detail: a.detailKey ? t(a.detailKey, a.detailVars) : t(a.detail),
                        })}
                      </span>
                    </span>
                    <StatusBadge
                      tone={ADVICE_PRIORITY[a.level]?.tone ?? "warning"}
                    >
                      {t(ADVICE_PRIORITY[a.level]?.label ?? "แนะนำ")}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}

            {advice.length > PREVIEW_COUNT && (
              <button
                type="button"
                className="al-more"
                onClick={() => setAdviceAll((v) => !v)}
                aria-expanded={adviceAll}
              >
                <Icon
                  name="chevron"
                  size={17}
                  className={adviceAll ? "al-more-up" : ""}
                />
                {adviceAll
                  ? t("ย่อกลับ")
                  : t("แสดงทั้งหมด (อีก {n} ข้อ)", {
                      n: formatNumber(advice.length - PREVIEW_COUNT),
                    })}
              </button>
            )}
          </Card>
        </Block>

        <Block id="trend" label={t("แนวโน้มการแจ้งเตือน 24 ชม.")}>
          <Card
            title={t("แนวโน้มการแจ้งเตือน 24 ชม.")}
            icon="chart"
            className="al-trend-card"
          >
            <div className="al-trend-box">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={trend}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="hour" interval={3} {...axisProps} />
                  <YAxis allowDecimals={false} width={28} {...axisProps} />
                  <Tooltip
                    {...tooltipStyle}
                    labelFormatter={(h) => t("เวลา {h} น.", { h })}
                    formatter={(value, name) => [
                      t("{n} รายการ", { n: formatNumber(value) }),
                      name,
                    ]}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
                  <Bar
                    dataKey="critical"
                    name={t("วิกฤต")}
                    stackId="a"
                    fill="var(--status-critical)"
                  />
                  <Bar
                    dataKey="serious"
                    name={t("ต้องจัดการ")}
                    stackId="a"
                    fill="var(--status-serious)"
                  />
                  <Bar
                    dataKey="done"
                    name={t("ดำเนินการแล้ว")}
                    stackId="a"
                    fill="var(--status-good)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Block>

        <Block id="donut" label={t("ประเภทการแจ้งเตือน")}>
          <Card
            title={t("ประเภทการแจ้งเตือน")}
            icon="list"
            className="al-donut-card"
          >
            {donutTotal === 0 ? (
              <p className="al-empty">{t("ไม่มีข้อมูลในขอบเขตที่เลือก")}</p>
            ) : (
              <div className="al-donut">
                <div className="al-donut-chart">
                  {/* ความสูงมาจาก CSS (.al-donut-chart) ไม่ใช่ค่าตรงนี้ —
                      จะได้ตั้งให้เท่ากราฟแท่งที่วางคู่กันได้จากที่เดียว */}
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donut}
                        dataKey="count"
                        nameKey="label"
                        innerRadius="64%"
                        outerRadius="92%"
                        paddingAngle={2}
                        stroke="var(--bg-surface)"
                        strokeWidth={2}
                      >
                        {donut.map((c) => (
                          <Cell key={c.id} fill={c.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        {...tooltipStyle}
                        formatter={(value, name) => [
                          t("{n} รายการ", { n: formatNumber(value) }),
                          t(name),
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <span className="al-donut-center">
                    <b className="num">{formatNumber(donutTotal)}</b>
                    <em>{t("รายการ")}</em>
                  </span>
                </div>

                <ul className="al-donut-legend">
                  {donut.map((c) => (
                    <li key={c.id}>
                      <span
                        className="al-dot"
                        style={{ background: c.color }}
                        aria-hidden="true"
                      />
                      <span className="al-legend-name">{t(c.label)}</span>
                      <b className="num">{formatNumber(c.count)}</b>
                      <span className="num al-legend-pct">
                        {formatNumber1((c.count / donutTotal) * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </Block>

        {/* ---------- โรงเรือนที่ต้องติดตาม ---------- */}
        <Block id="watch" label={t("โรงเรือนที่ต้องติดตาม")}>
          <Card
            title={t("โรงเรือนที่ต้องติดตาม")}
            subtitle={t("เรียงตามความรุนแรงและจำนวนเรื่องที่ยังค้าง")}
            icon="home"
            className="al-watch-card"
          >
            {watch.length === 0 ? (
              <p className="al-empty">
                {t("ไม่มีโรงเรือนที่ต้องติดตามในขอบเขตที่เลือก")}
              </p>
            ) : (
              <ul className="al-watch">
                {watch.map((w) => (
                  <li key={w.barnId} className={`is-${w.worst.level}`}>
                    <Link
                      to={`/dashboard/farms/${w.farmId}/barns/${w.barnId}#alerts`}
                      className="al-watch-link"
                    >
                      <span className="al-watch-icon" aria-hidden="true">
                        <Icon name="home" size={24} />
                      </span>
                      <span className="al-watch-text">
                        <span className="al-watch-top">
                          <b>{t(w.barnName)}</b>
                          <StatusBadge tone={w.worst.level}>
                            {t(levelLabel(w.worst.level))} {formatNumber(w.count)}
                          </StatusBadge>
                        </span>
                        <span className="al-watch-detail">{alertTitle(t, w.worst)}</span>
                        <span className="al-watch-meta">
                          {t("{farm} · {time}", {
                            farm: t(w.farmName),
                            time: formatDateTime(w.worst.time),
                          })}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Block>

        {/* ═══ ใครทำอะไรในระบบ (T1.359) ═══
            ★ อยู่หน้านี้เพราะเป็น "ศูนย์แจ้งเตือน" — คนที่มาดูว่ามีอะไรผิดปกติ
              คือคนเดียวกับที่ต้องรู้ว่ามีใครไปแก้เกณฑ์หรือลบโรงเรือนไปเมื่อกี้
            ★ เห็นในแอปเสมอ ไม่ขึ้นกับการตั้งค่า — ค่าที่ติ๊กคุมเฉพาะการส่งออกไลน์ */}
        <Block id="activity" label={t("ใครทำอะไรในระบบ")}>
          <Card
            title={t("ใครทำอะไรในระบบ")}
            subtitle={t("การแก้เกณฑ์ จัดการฟาร์ม บันทึกงาน และสั่งอุปกรณ์ล่าสุด")}
            icon="list"
          >
            <ActivityList />
          </Card>
        </Block>
      </PageBoard>

      <p className="al-foot">
        {t(
          "ข้อมูลตัวอย่างสำหรับการสาธิต · ยอด “ต้องดำเนินการ” ตรงกับกระดิ่งบนแถบเมนู ({open} รายการ) · เรื่องที่ปิดแล้ววันนี้ {done} รายการ",
          { open: formatNumber(OPEN.length), done: formatNumber(DONE.length) },
        )}
      </p>
    </div>
  );
}

/**
 * รายการกิจกรรมล่าสุด (T1.359)
 *
 * ★★ **ต่อไม่ได้ต้องบอกว่าต่อไม่ได้ ห้ามขึ้นรายการว่างเฉย ๆ**
 *   รายการว่างแปลว่า "ไม่มีใครทำอะไร" ซึ่งคนละเรื่องกับ "เราดึงข้อมูลไม่ได้"
 *   และสองอย่างนี้นำไปสู่การตัดสินใจคนละแบบ
 */
function ActivityList() {
  const t = useT();
  const { rows, status, error } = useActivity(30);

  if (status === "loading") return <p className="al-empty">{t("กำลังโหลด…")}</p>;
  if (status === "error") {
    return (
      <p className="al-empty">
        {t("ดูรายการไม่ได้ตอนนี้")} — {t(error ?? "ต่อไม่ได้")}
      </p>
    );
  }
  if (rows.length === 0) {
    return <p className="al-empty">{t("ยังไม่มีการเปลี่ยนแปลงในระบบ")}</p>;
  }

  return (
    <ul className="al-activity">
      {rows.map((row) => (
        <li key={row.id}>
          <span className="al-activity-when">{formatDateTime(row.at)}</span>
          <span className="al-activity-what">{row.summary}</span>
        </li>
      ))}
    </ul>
  );
}
