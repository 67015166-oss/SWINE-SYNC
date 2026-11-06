/**
 * หน้า "จำนวนสุกรทั้งหมด" — เส้นทาง /dashboard/pigs
 *
 * เข้ามาจากกล่อง "จำนวนสุกรทั้งหมด" ในหน้าภาพรวม หรือเมนู "จำนวนสุกร" บนแถบเมนูบน
 * หน้านี้อยู่ใน AppLayout (ใช้แถบเมนูบนเหมือนหน้าอื่น ไม่มีแถบเมนูซ้ายแล้ว)
 *
 * โครง: แถบตัวกรอง (ฟาร์ม + ช่วงเวลา) → แบนเนอร์ยอดรวม → การ์ดประเภทสุกร 4 ใบ
 *       → โดนัทสัดส่วน + แถบสัดส่วน → ตารางแยกตามฟาร์ม
 *
 * ข้อมูลจาก data/mock/pigTypes.js — ผลรวมทุกประเภทเท่ากับผลรวม farms[].pigs เสมอ
 */
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import Card from "../components/ui/Card.jsx";
import PageBoard, { Block } from "../components/board/PageBoard.jsx";
import Icon from "../components/ui/Icon.jsx";
import { farms as systemFarms, summarizeFarms } from "../data/mock/farms.js";
import { useAllFarms } from "../lib/records/useAllFarms.js";
import { useBarnCounts } from "../lib/records/useBarnCounts.js";
import { countsByStage } from "../lib/herdCount.js";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import { useAdjust, targetKey } from "../lib/adjust/useAdjust.js";
import { PIG_TYPES, typeByFarm } from "../data/mock/pigTypes.js";
import { SERIES } from "../lib/chartTheme.js";
import { formatNumber, formatNumber1, formatDateTime } from "../lib/format.js";
import "./PigTypes.css";
import { asset } from "../lib/asset.js";
import { useT } from "../lib/i18n/useT.js";

/**
 * ช่วงเวลา — ยังไม่มีข้อมูลย้อนหลังรายวัน/รายเดือนจริง
 * จึงใช้ตัวคูณสาธิตเพื่อให้เห็นว่าตัวกรองทำงาน (เปลี่ยนเป็นข้อมูลจริงได้ที่เดียว)
 */
const RANGES = [
  { value: "today", label: "วันนี้", factor: 1 },
  { value: "month", label: "เดือนนี้", factor: 0.97 },
  { value: "year", label: "ปีนี้", factor: 0.9 },
];

const summary = summarizeFarms(systemFarms);
const rowsByType = typeByFarm();

/** รหัสกระดานของหน้านี้ — คีย์ที่ใช้เก็บชุดเลย์เอาต์ (ดู lib/layout/presets.js) */
const BOARD_ID = "pigs";

export default function PigTypes() {
  const t = useT();
  const [range, setRange] = useState("today");

  /* ฟาร์มที่เลือกเก็บไว้ใน URL (?farm=) เพื่อให้ส่งต่อไปหน้ารายละเอียด
     และกดย้อนกลับมาแล้วยังอยู่ที่ฟาร์มเดิม */
  const [params, setParams] = useSearchParams();
  const farmParam = params.get("farm");
  /* รหัสฟาร์มที่ไม่มีอยู่จริง (พิมพ์ URL เอง) ให้ถอยกลับเป็น "ทุกฟาร์ม" */
  /* ช่องเลือกฟาร์มต้องมีฟาร์มที่ผู้ใช้เพิ่มเองด้วย */
  const { farms } = useAllFarms();

  const farmId = farms.some((f) => f.id === farmParam) ? farmParam : "all";
  const setFarmId = (value) => {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete("farm");
    else next.set("farm", value);
    setParams(next, { replace: true });
  };

  const factor = RANGES.find((r) => r.value === range)?.factor ?? 1;

  /* จำนวนที่ผู้ใช้ปรับเองรายประเภท — ปรับได้เฉพาะยอดรวมทุกฟาร์ม
     เพราะยอดรายฟาร์มในข้อมูลชุดนี้เป็น "สัดส่วนที่กระจายมาจากยอดรวม" ไม่ใช่ตัวเลขที่เก็บแยก
     ถ้าให้ปรับตอนเลือกฟาร์มเดียว จะไม่รู้ว่าส่วนต่างควรไปลงที่ฟาร์มไหน */
  /* ตัวเลขต้องรวมส่วนต่างที่ผู้ใช้ปรับไว้ด้วย — ปุ่มปรับย้ายไปอยู่หน้ารายละเอียดของแต่ละประเภท
     (ผู้ใช้สั่ง: กดเข้าไปที่ประเภทก่อน แล้วค่อยมีปุ่มเพิ่ม) หน้านี้จึงเหลือแค่ "อ่านค่า" */
  const { valueOf } = useAdjust();

  /* ═══ ยอดสุกรจากทุกทางที่กรอกได้ รวมเป็นเลขเดียว (T1.332) ═══
     ★ ตรรกะย้ายไป `useBarnCounts` แล้ว (T1.338) เพราะหน้าภาพรวมต้องการเลขเดียวกันเป๊ะ
       คัดลอกไปเขียนซ้ำเมื่อไร สองหน้าจะตอบคำถามเดียวกันคนละเลขโดยไม่มีอะไรพังให้เห็น */
  const { rows: barnRows, total: barnsTotal } = useBarnCounts(farmId);
  const realByStage = useMemo(() => countsByStage(barnRows), [barnRows]);
  /** `null` = ยังไม่มีเล้าไหนสรุปจำนวนได้ → ถอยไปใช้ข้อมูลตัวอย่างและบอกให้ชัด */
  const realTotal = barnsTotal.count;

  /* จำนวนของแต่ละประเภทหลังกรองฟาร์มและช่วงเวลา */
  const types = useMemo(() => {
    return PIG_TYPES.map((type, i) => {
      const base =
        farmId === "all"
          ? valueOf(targetKey("pigtype", type.id), type.count)
          : (rowsByType[i].rows.find((r) => r.farmId === farmId)?.count ?? 0);
      return { ...type, value: Math.round((base * factor) / 10) * 10 };
    });
  }, [farmId, factor, valueOf]);

  const total = types.reduce((sum, type) => sum + type.value, 0);
  const shareOf = (type) => (total > 0 ? (type.value / total) * 100 : 0);
  const farmName =
    farmId === "all"
      ? t("ทุกฟาร์มในเครือ")
      : farms.find((f) => f.id === farmId)?.name;

  return (
    <div className="pt-page">
      {/* หัวหน้ากับแถบตัวกรองอยู่แถวเดียวกัน (เหมือนหน้าฟาร์มทั้งหมด)
          เดิมตัวกรองกินทั้งแถวของตัวเองทั้งที่ข้างขวาของหัวหน้าว่างอยู่
          หน้าจึงดูโปร่งเป็นช่วง ๆ และเลื่อนกว่าจะถึงเนื้อหาจริง */}
      <div className="pt-topbar">
        <section className="pt-head">
          <span className="icon-chip" aria-hidden="true">
            <Icon name="pig" size={24} />
          </span>
          <div>
            <h1 className="pt-title">{t("จำนวนสุกรทั้งหมด")}</h1>
            {/* เหลือแต่ข้อมูลจริง — คำโปรยอธิบายหน้าเอาออก */}
            <p className="pt-subtitle">
              {t("อัปเดตล่าสุด {time}", { time: formatDateTime(summary.updatedAt) })}
            </p>
          </div>
        </section>

        {/* ---------- แถบตัวกรอง ---------- */}
        <div className="pt-filters">
          <label className="pt-farm-select">
            <span className="sr-only">{t("เลือกฟาร์ม")}</span>
            <select value={farmId} onChange={(e) => setFarmId(e.target.value)}>
              <option value="all">{t("ฟาร์มทั้งหมด|ตัวเลือก")}</option>
              {farms.map((f) => (
                <option key={f.id} value={f.id}>
                  {t(f.name)}
                </option>
              ))}
            </select>
          </label>

          <div className="pt-range" role="group" aria-label={t("ช่วงเวลา")}>
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                className={
                  "pt-range-btn" + (range === r.value ? " is-active" : "")
                }
                onClick={() => setRange(r.value)}
                aria-pressed={range === r.value}
              >
                {t(r.label)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <PageBoard boardId={BOARD_ID}>
        {/* ---------- แบนเนอร์ยอดรวม ---------- */}
        <Block id="banner" label={t("ยอดรวมสุกร")}>
          <section className="pt-banner">
            {/* ═══ ยอดรวมเป็น "ของจริงจากบันทึก" เมื่อมี · ไม่แยกกล่องต่างหาก (T1.331) ═══

                เดิม T1.330 ทำเป็นกล่องแยก "จำนวนสุกรจริงจากบันทึก" ไว้บนสุด
                กลายเป็นหน้าเดียวมีเลขตอบคำถามเดียวกันสองที่ ผู้ใช้ต้องเดาเองว่าอันไหนใช่
                ➜ ยอดจริงมาเป็นตัวเลขหลักตรงนี้เลย แล้วเลขตัวอย่างถอยไปเป็นบรรทัดกำกับ

                ★ ไม่สลับเงียบ ๆ — ป้ายบนหัวบอกทุกครั้งว่ากำลังอ่านเลขชุดไหนอยู่ */}
            <div className="pt-banner-text">
              <p className="pt-banner-label">
                {t("จำนวนสุกรทั้งหมด")}
                {/* ★ บอกทุกครั้งว่ากำลังอ่านเลขชุดไหน — สามชุดนี้เชื่อถือได้ไม่เท่ากัน */}
                <StatusBadge tone={barnsTotal.from === "records" ? "good" : "offline"}>
                  {barnsTotal.from === "records"
                    ? t("ข้อมูลจริง")
                    : barnsTotal.from === "local"
                      ? t("บันทึกในเครื่องนี้")
                      : t("ข้อมูลตัวอย่าง")}
                </StatusBadge>
              </p>
              <p className="pt-banner-value">
                <b className="num">{formatNumber(realTotal ?? total)}</b>
                <em>{t("ตัว")}</em>
              </p>

              {/* แยกตามขั้นการเลี้ยงของโรงเรือน — บรรทัดเดียว ไม่ใช่กล่องใหม่ */}
              {realByStage.length > 0 && (
                <p className="pt-banner-stages">
                  {realByStage.map((row) => (
                    <span key={row.stage}>
                      {t(row.stage)} <b className="num">{formatNumber(row.count)}</b>
                    </span>
                  ))}
                </p>
              )}

              <p className="pt-banner-note">
                {realTotal == null
                  ? t("{farm} · {range} · อัปเดตล่าสุด {time}", {
                      farm: t(farmName),
                      range: t(RANGES.find((r) => r.value === range)?.label ?? ""),
                      time: formatDateTime(summary.updatedAt),
                    })
                  : /* ★ ยังนับไม่ครบต้องบอกเสมอ ไม่งั้นยอดที่ขาดจะดูเหมือนยอดเต็ม
                       และต้องบอกด้วยว่าการ์ดข้างล่างยังเป็นตัวอย่าง จะได้ไม่งงว่าทำไมไม่ตรงกัน */
                    t("นับจาก {n} โรงเรือน{rest} · การ์ดแยกประเภทข้างล่างยังเป็นข้อมูลตัวอย่าง", {
                      n: barnsTotal.knownBarns,
                      rest:
                        barnsTotal.unknownBarns > 0
                          ? t(" · ยังไม่รู้อีก {u} โรงเรือน", { u: barnsTotal.unknownBarns })
                          : "",
                    })}
              </p>
            </div>
            <img
              className="pt-banner-photo"
              src={asset("/pigs/all.jpg")}
              alt=""
              loading="lazy"
            />
          </section>
        </Block>

        {/* ---------- การ์ดประเภทสุกร ---------- */}
        <Block id="types" label={t("การ์ดประเภทสุกร")}>
          <ul className="pt-grid">
            {types.map((type) => (
              <li key={type.id}>
                {/* ทั้งการ์ดเป็นลิงก์ — พาไปหน้ารายละเอียดของประเภทนี้ พร้อมฟาร์มที่เลือกอยู่ */}
                <Link
                  to={`/dashboard/pigs/${type.id}${farmId === "all" ? "" : `?farm=${farmId}`}`}
                  className={`pt-card is-s${type.series}`}
                >
                  <div className="pt-card-head">
                    <h2>{t(type.name)}</h2>
                    <p className="pt-card-count">
                      <b className="num">{formatNumber(type.value)}</b>
                      <em>{t("ตัว")}</em>
                    </p>
                  </div>

                  <img
                    className="pt-photo"
                    src={type.photo}
                    alt={t("ภาพประกอบ{name}", { name: t(type.name) })}
                    loading="lazy"
                  />

                  <p className="pt-tag">
                    <span className="pt-tag-icon" aria-hidden="true">
                      <Icon name={type.tagIcon} size={18} />
                    </span>
                    <span>
                      <b>{t(type.short)}</b>
                      {t(type.desc)}
                    </span>
                  </p>

                  <span className="pt-card-more">
                    <span className="pt-card-more-text">
                      {t("ดูรายละเอียด{name}", { name: t(type.short) })}
                    </span>
                    <Icon name="chevron" size={16} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Block>

        {/* ---------- โดนัท + แถบสัดส่วน ---------- */}
        <Block id="donut" label={t("สัดส่วนจำนวนสุกร แยกตามประเภท")}>
          <Card
            title={t("สัดส่วนจำนวนสุกร แยกตามประเภท")}
            icon="chart"
            className="pt-donut-card"
          >
            <div className="pt-donut">
              <div className="pt-donut-chart">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={types}
                      dataKey="value"
                      nameKey="short"
                      innerRadius="62%"
                      outerRadius="92%"
                      paddingAngle={2}
                      stroke="var(--bg-surface)"
                      strokeWidth={2}
                    >
                      {types.map((type) => (
                        <Cell key={type.id} fill={SERIES[type.series - 1]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [
                        t("{n} ตัว", { n: formatNumber(value) }),
                        t(name),
                      ]}
                      contentStyle={{
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border)",
                        fontFamily: "var(--font-sans)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <span className="pt-donut-center">
                  <b className="num">{formatNumber(total)}</b>
                  <em>{t("ตัว")}</em>
                </span>
              </div>

              <ul className="pt-donut-legend">
                {types.map((type) => (
                  <li key={type.id}>
                    <span
                      className={`pt-dot is-s${type.series}`}
                      aria-hidden="true"
                    />
                    <span className="pt-legend-name">{t(type.short)}</span>
                    <b className="num">{formatNumber(type.value)}</b>
                    <span className="pt-legend-unit">{t("ตัว")}</span>
                    <span className="num pt-legend-pct">
                      {formatNumber1(shareOf(type))}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </Block>

        <Block id="share" label={t("สัดส่วนแบบแท่ง")}>
          <Card title={t("สัดส่วนแบบแท่ง")} icon="list" className="pt-bar-card">
            <div
              className="pt-bar"
              role="img"
              aria-label={types
                .map((type) => `${t(type.name)} ${formatNumber1(shareOf(type))}%`)
                .join(" · ")}
            >
              {types.map((type) => (
                <span
                  key={type.id}
                  className={`pt-bar-seg is-s${type.series}`}
                  style={{ width: `${shareOf(type)}%` }}
                />
              ))}
            </div>

            <ul className="pt-bar-legend">
              {types.map((type) => (
                <li key={type.id} className={`is-s${type.series}`}>
                  <b className="num">{formatNumber1(shareOf(type))}%</b>
                  <span className="pt-bar-name">{t(type.name)}</span>
                  <span className="pt-bar-count num">
                    {t("{n} ตัว", { n: formatNumber(type.value) })}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Block>

        {/* ---------- ตารางแยกตามฟาร์ม ---------- */}
        <Block id="table" label={t("จำนวนสุกรแยกตามฟาร์มและประเภท")}>
          <Card
            title={t("จำนวนสุกรแยกตามฟาร์มและประเภท")}
            subtitle={t(
              "ตัวเลขเต็มของทุกฟาร์ม (ไม่ขึ้นกับตัวกรองด้านบน) — รวมของแต่ละฟาร์มตรงกับหน้าภาพรวม",
            )}
            icon="list"
          >
            <div className="table-scroll">
              <table className="pt-table">
                <thead>
                  <tr>
                    <th>{t("ฟาร์ม|หัวตาราง")}</th>
                    {PIG_TYPES.map((type) => (
                      <th key={type.id} className="num">
                        {t(type.short)}
                      </th>
                    ))}
                    <th className="num">{t("รวม")}</th>
                  </tr>
                </thead>
                <tbody>
                  {farms.map((f) => {
                    /* ตารางนี้แจกแจง "ประเภทสุกรรายฟาร์ม" ซึ่งมีเฉพาะฟาร์มในข้อมูลระบบ
                       ฟาร์มที่ผู้ใช้เพิ่มเองยังไม่มีการแจกแจงประเภท → แสดงขีดกลาง ไม่ใช่เดาเป็น 0
                       (เดิมอ้าง rows[i] ตามลำดับ พอมีฟาร์มเพิ่มเข้ามาแถวเกินจึงพังทั้งหน้า) */
                    const cells = rowsByType.map(
                      (type) =>
                        type.rows.find((r) => r.farmId === f.id)?.count ?? null,
                    );
                    const known = cells.filter((c) => c != null);
                    return (
                      <tr
                        key={f.id}
                        className={farmId === f.id ? "is-active" : ""}
                      >
                        <td>
                          <Link to={`/dashboard/farms/${f.id}`}>{t(f.name)}</Link>
                        </td>
                        {cells.map((c, j) => (
                          <td key={PIG_TYPES[j].id} className="num">
                            {c == null ? "—" : formatNumber(c)}
                          </td>
                        ))}
                        <td className="num">
                          <b>
                            {known.length === 0
                              ? "—"
                              : formatNumber(known.reduce((a, b) => a + b, 0))}
                          </b>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th>{t("รวมทุกฟาร์ม")}</th>
                    {PIG_TYPES.map((type) => (
                      <td key={type.id} className="num">
                        <b>
                          {formatNumber(
                            valueOf(targetKey("pigtype", type.id), type.count),
                          )}
                        </b>
                      </td>
                    ))}
                    <td className="num">
                      <b>
                        {formatNumber(
                          PIG_TYPES.reduce(
                            (sum, type) =>
                              sum +
                              valueOf(targetKey("pigtype", type.id), type.count),
                            0,
                          ),
                        )}
                      </b>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </Block>
      </PageBoard>
    </div>
  );
}
