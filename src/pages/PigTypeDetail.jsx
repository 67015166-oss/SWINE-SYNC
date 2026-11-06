/**
 * หน้า "รายละเอียดสุกรรายประเภท" — เส้นทาง /dashboard/pigs/:typeId?farm=<รหัสฟาร์ม>
 *
 * เข้ามาจากการ์ดประเภทสุกรในหน้า /dashboard/pigs
 * ฟาร์มที่เลือกไว้ในหน้านั้นถูกส่งต่อมาทาง query "farm" (ไม่ส่งมา = ทุกฟาร์ม)
 * เช่น เลือกฟาร์มกำแพงเพชรแล้วกด "สุกรรุ่น" → /dashboard/pigs/grower?farm=F-KPP
 *
 * โครง: เส้นทางย้อนกลับ + เลือกฟาร์ม → แบนเนอร์ประเภท → ไทล์ตัวเลขหลัก
 *       → แนวโน้ม 6 เดือน + เทียบกับประเภทอื่น → โรงเรือนที่เลี้ยง → กระจายตามฟาร์ม
 *
 * ตัวเลขทั้งหมดมาจาก data/mock/pigTypes.js ชุดเดียวกับหน้าจำนวนสุกร จึงตรงกันเสมอ
 */
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import SideLayout from "../components/layout/SideLayout.jsx";
import { SIDE_NAV } from "../components/layout/sideNav.js";
import Card from "../components/ui/Card.jsx";
import PageBoard, { Block } from "../components/board/PageBoard.jsx";
import Icon from "../components/ui/Icon.jsx";
import StatTile from "../components/ui/StatTile.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import AdjustModal from "../components/adjust/AdjustModal.jsx";
import { useAdjust, targetKey } from "../lib/adjust/useAdjust.js";
import { farms as systemFarms, FARM_STATUS_LABEL, summarizeFarms } from "../data/mock/farms.js";
import { useAllFarms } from "../lib/records/useAllFarms.js";
import { BARN_STATUS_LABEL } from "../data/mock/barnsByFarm.js";
import {
  PIG_TYPES,
  findType,
  countOf,
  barnsOfType,
  trendOf,
} from "../data/mock/pigTypes.js";
import { SERIES, gridProps, axisProps, tooltipStyle } from "../lib/chartTheme.js";
import {
  formatNumber,
  formatNumber1,
  formatMonth,
  formatDateTime,
} from "../lib/format.js";
import "./PigTypeDetail.css";
import { useT } from "../lib/i18n/useT.js";

const summary = summarizeFarms(systemFarms);
const groupPigs = systemFarms.reduce((sum, f) => sum + f.pigs, 0);

/** รหัสกระดานของหน้านี้ — คีย์ที่ใช้เก็บชุดเลย์เอาต์ (ดู lib/layout/presets.js) */
const BOARD_ID = "pigType";

export default function PigTypeDetail() {
  const t = useT();
  const { typeId } = useParams();
  const [params, setParams] = useSearchParams();
  /* hook ต้องเรียกก่อน early return ของเคส "ไม่พบประเภท" เสมอ ไม่งั้นลำดับ hook เพี้ยน */
  const { valueOf, netOf, canWrite } = useAdjust();
  const [adjustOpen, setAdjustOpen] = useState(false);

  /* รหัสฟาร์มที่ไม่มีอยู่จริง (พิมพ์ URL เอง) ให้ถอยกลับเป็น "ทุกฟาร์ม" */
  const farmParam = params.get("farm");
  const { farms } = useAllFarms();
  const farmId = farms.some((f) => f.id === farmParam) ? farmParam : "all";
  const type = findType(typeId);

  if (!type) {
    return (
      <SideLayout
        nav={SIDE_NAV}
        title={t("ไม่พบประเภทสุกร")}
        subtitle={t("ประเภทที่เรียกดูไม่มีอยู่ในระบบ")}
        icon="pig"
      >
        <Card title={t("กลับไปเลือกใหม่")} icon="pig">
          <p className="ptd-empty">
            {t("ลองกลับไปที่หน้าจำนวนสุกรทั้งหมด แล้วเลือกประเภทสุกรจากการ์ดอีกครั้ง")}
          </p>
          <Link className="ptd-back-btn" to="/dashboard/pigs">
            <Icon name="chevron" size={16} className="ptd-back-arrow" />
            {t("จำนวนสุกรทั้งหมด")}
          </Link>
        </Card>
      </SideLayout>
    );
  }

  const farm = farms.find((f) => f.id === farmId) ?? null;
  const farmName = farm ? t(farm.name) : t("ทุกฟาร์มในเครือ");
  /* จำนวนที่แสดง = ค่าตั้งต้น + ส่วนต่างที่ผู้ใช้ปรับเอง (เก็บที่ระดับ "ทุกฟาร์ม")
     ปรับได้เฉพาะตอนดูทุกฟาร์ม เพราะยอดรายฟาร์มเป็นสัดส่วนที่กระจายมาจากยอดรวม
     ไม่ใช่ตัวเลขที่เก็บแยก — ถ้าให้ปรับตอนเลือกฟาร์มเดียวจะไม่รู้ว่าส่วนต่างควรลงฟาร์มไหน */
  const pigTarget = targetKey("pigtype", type.id);
  const canAdjust = farmId === "all";
  const count = canAdjust
    ? valueOf(pigTarget, countOf(type.id, "all"))
    : countOf(type.id, farmId);
  const herdPigs = farm ? farm.pigs : groupPigs;
  const share = herdPigs > 0 ? (count / herdPigs) * 100 : 0;

  const barnRows = farm ? barnsOfType(farm.id, type.id) : [];
  const trend = trendOf(type.id, farmId);
  const color = SERIES[type.series - 1];

  /* เทียบกับประเภทอื่นในขอบเขตเดียวกัน (ฟาร์มเดียวหรือทุกฟาร์ม) */
  const compare = PIG_TYPES.map((item) => ({ ...item, value: countOf(item.id, farmId) }));
  const compareMax = Math.max(...compare.map((item) => item.value), 1);

  const setFarm = (value) => {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete("farm");
    else next.set("farm", value);
    setParams(next, { replace: true });
  };

  return (
    <SideLayout
      nav={SIDE_NAV}
      title={t(type.name)}
      subtitle={t("{short} · {farm}", { short: t(type.short), farm: farmName })}
      icon="pig"
      updatedAt={farm?.updatedAt ?? summary.updatedAt}
    >
      {/* ---------- เส้นทางย้อนกลับ + เลือกฟาร์ม ---------- */}
      <div className="ptd-bar">
        <nav className="ptd-crumbs" aria-label={t("เส้นทางหน้า")}>
          <Link to="/dashboard">{t("ภาพรวม")}</Link>
          <Icon name="chevron" size={15} aria-hidden="true" />
          <Link to={farm ? `/dashboard/pigs?farm=${farm.id}` : "/dashboard/pigs"}>
            {t("จำนวนสุกรทั้งหมด")}
          </Link>
          <Icon name="chevron" size={15} aria-hidden="true" />
          <span aria-current="page">{t(type.name)}</span>
        </nav>

        <label className="ptd-farm-select">
          <span className="sr-only">{t("เลือกฟาร์ม")}</span>
          <select value={farmId} onChange={(e) => setFarm(e.target.value)}>
            <option value="all">{t("ฟาร์มทั้งหมด|ตัวเลือก")}</option>
            {farms.map((f) => (
              <option key={f.id} value={f.id}>
                {t(f.name)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <PageBoard boardId={BOARD_ID}>
        {/* ---------- แบนเนอร์ประเภท ---------- */}
        <Block id="hero" label={t("แบนเนอร์ประเภทสุกร")}>
          <section className={`ptd-hero is-s${type.series}`}>
            <img
              className="ptd-hero-photo"
              src={type.photo}
              alt={t("ภาพประกอบ{name}", { name: t(type.name) })}
            />

            <div className="ptd-hero-text">
              <p className="ptd-hero-farm">
                <Icon name="pin" size={17} aria-hidden="true" />
                {farmName}
                {farm && (
                  <StatusBadge tone={farm.status}>
                    {FARM_STATUS_LABEL[farm.status]}
                  </StatusBadge>
                )}
              </p>
              <h2 className="ptd-hero-name">{t(type.name)}</h2>
              <p className="ptd-hero-desc">{t(type.desc)}</p>
              <p className="ptd-hero-value">
                <b className="num">{formatNumber(count)}</b>
                <em>{t("ตัว")}</em>
                <span className={"ptd-delta is-" + (type.deltaPct >= 0 ? "up" : "down")}>
                  <Icon name={type.deltaPct >= 0 ? "spark" : "pulse"} size={16} />
                  {type.deltaPct >= 0 ? "+" : "−"}
                  {t("{pct}% จากเดือนก่อน", { pct: formatNumber1(Math.abs(type.deltaPct)) })}
                </span>
              </p>

              <p className="ptd-hero-meta">
                <span>
                  <Icon name="clock" size={16} aria-hidden="true" />
                  {t(type.ageRange)}
                </span>
                <span>
                  <Icon name={type.tagIcon} size={16} aria-hidden="true" />
                  {t(type.tagText)}
                </span>
              </p>
            </div>
          </section>
        </Block>

        {/* ---------- ตัวเลขหลัก + ปุ่มปรับจำนวน ---------- */}
        <Block id="count" label={t("จำนวนสุกรประเภทนี้")}>
          <Card className="ptd-count-card">
            <StatTile
              label={t("จำนวนสุกรประเภทนี้")}
              value={formatNumber(count)}
              unit={t("ตัว")}
            />

            {/* ปุ่มอยู่หน้านี้ ไม่ใช่หน้ารวมประเภท — ผู้ใช้สั่งให้กดเข้ามาที่ประเภทก่อนค่อยปรับได้
                กันการกดปรับผิดประเภทตอนกวาดสายตาผ่านการ์ดสี่ใบเรียงกันในหน้ารวม */}
            {canAdjust ? (
              <span className="ptd-count-tools">
                <button
                  type="button"
                  className="aj-open"
                  onClick={() => setAdjustOpen(true)}
                  aria-haspopup="dialog"
                >
                  <Icon name={canWrite ? "plus" : "lock"} size={16} />
                  {canWrite ? t("เพิ่ม / ลดจำนวน") : t("ดูประวัติ")}
                </button>
                {netOf(pigTarget) !== 0 && (
                  <span className="aj-net num">
                    {netOf(pigTarget) > 0 ? "+" : "−"}
                    {formatNumber(Math.abs(netOf(pigTarget)))}
                  </span>
                )}
              </span>
            ) : (
              <p className="ptd-count-note">
                ปรับจำนวนได้ตอนดู “ฟาร์มทั้งหมด” — ยอดรายฟาร์มคำนวณจากสัดส่วนของยอดรวม
              </p>
            )}
          </Card>
        </Block>

        <Block id="share" label={t("สัดส่วนในฝูง")}>
          <StatTile
            label={farm ? t("สัดส่วนในฝูงฟาร์ม") : t("สัดส่วนในฝูงเครือ")}
            value={formatNumber1(share)}
            unit="%"
          />
        </Block>

        <Block id="barns" label={t("โรงเรือนที่เลี้ยง")}>
          <StatTile
            label={t("โรงเรือนที่เลี้ยง")}
            value={formatNumber(farm ? barnRows.length : type.barns)}
            unit={t("หลัง")}
          />
        </Block>

        <Block id="weight" label={t("น้ำหนักเฉลี่ย")}>
          <StatTile
            label={t("น้ำหนักเฉลี่ย")}
            value={formatNumber(type.avgWeightKg)}
            unit={t("กก./ตัว")}
          />
        </Block>

        {/* ---------- แนวโน้ม + เทียบประเภทอื่น ---------- */}
        <Block id="trend" label={t("แนวโน้มจำนวนสุกรย้อนหลัง")}>
          <Card
              title={t("แนวโน้มจำนวนสุกรย้อนหลัง 6 เดือน")}
              subtitle={t("{short} · {farm}", { short: t(type.name), farm: farmName })}
              icon="chart"
            >
              <div className="ptd-chart-box">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="month" tickFormatter={formatMonth} {...axisProps} />
                    <YAxis
                      domain={["dataMin - 200", "dataMax + 200"]}
                      tickFormatter={formatNumber}
                      width={64}
                      {...axisProps}
                    />
                    <Tooltip
                      {...tooltipStyle}
                      labelFormatter={formatMonth}
                      formatter={(value) => [
                        t("{n} ตัว", { n: formatNumber(value) }),
                        t(type.short),
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke={color}
                      strokeWidth={2}
                      dot={{ r: 3, fill: color, strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
          </Card>
        </Block>

        <Block id="compare" label={t("เทียบกับประเภทอื่น")}>
          <Card
              title={t("เทียบกับประเภทอื่น")}
              subtitle={t("สัดส่วนของแต่ละประเภทใน {farm} — กดเพื่อดูรายละเอียดประเภทนั้น", {
                farm: farmName,
              })}
              icon="list"
            >
              <ul className="ptd-compare">
                {compare.map((item) => (
                  <li key={item.id} className={item.id === type.id ? "is-current" : ""}>
                    <Link
                      to={`/dashboard/pigs/${item.id}${farm ? `?farm=${farm.id}` : ""}`}
                      className="ptd-compare-link"
                    >
                      <span className="ptd-compare-name">
                        <span className={`ptd-dot is-s${item.series}`} aria-hidden="true" />
                        {t(item.name)}
                        {item.id === type.id && (
                          <b className="ptd-compare-now">{t("กำลังดู")}</b>
                        )}
                      </span>
                      <span className="ptd-compare-track" aria-hidden="true">
                        <span
                          className={`ptd-compare-fill is-s${item.series}`}
                          style={{ width: `${(item.value / compareMax) * 100}%` }}
                        />
                      </span>
                      <span className="ptd-compare-num num">
                        {t("{n} ตัว", { n: formatNumber(item.value) })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
          </Card>
        </Block>

        {/* ---------- โรงเรือนที่เลี้ยงประเภทนี้ (เฉพาะเมื่อเลือกฟาร์ม) ---------- */}
        {/* สองสถานะนี้เป็นคนละกล่องกันจริง ๆ (ตารางโรงเรือน กับ ข้อความชวนเลือกฟาร์ม)
            จึงแยก id เพื่อให้แต่ละอันมีความสูงตั้งต้นของตัวเอง — ถ้าใช้ id เดียวกัน
            อันหนึ่งจะเหลือที่ว่างค้างเป็นร้อยพิกเซลเสมอ */}
        {farm ? (
          <Block id="barnList" label={t("โรงเรือนที่เลี้ยงประเภทนี้")}>
            <Card
              title={t("โรงเรือนที่เลี้ยง {type} ใน {farm}", {
                type: t(type.short),
                farm: t(farm.name),
              })}
              subtitle={t("โรงเรือนหนึ่งหลังเลี้ยงสุกรประเภทเดียว · กดที่ชื่อโรงเรือนเพื่อเข้าไปดูข้อมูลภายใน")}
              icon="home"
            >
              {barnRows.length === 0 ? (
                <p className="ptd-empty">{t("ฟาร์มนี้ยังไม่มีโรงเรือนสำหรับประเภทนี้")}</p>
              ) : (
                <div className="table-scroll">
                  <table className="ptd-table">
                    <thead>
                      <tr>
                        <th>{t("โรงเรือน|หัวตาราง")}</th>
                        <th>{t("โซน")}</th>
                        <th className="num">{t("{type} (ตัว)", { type: t(type.short) })}</th>
                        <th className="num">{t("สุกรทั้งหมดในโรงเรือน")}</th>
                        <th>{t("สถานะ")}</th>
                        <th className="num">{t("แจ้งเตือน")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {barnRows.map((b) => (
                        <tr key={b.id}>
                          <td>
                            <Link to={`/dashboard/farms/${farm.id}/barns/${b.id}`}>
                              {b.name}
                            </Link>
                          </td>
                          <td>{t("โซน {zone}", { zone: b.zone })}</td>
                          <td className="num">
                            <b>{formatNumber(b.typeCount)}</b>
                          </td>
                          <td className="num">{formatNumber(b.pigs)}</td>
                          <td>
                            <StatusBadge tone={b.status}>
                              {BARN_STATUS_LABEL[b.status]}
                            </StatusBadge>
                          </td>
                          <td className="num">{formatNumber(b.alerts)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan={2}>
                          {t("รวม {n} โรงเรือน", { n: barnRows.length })}
                        </th>
                        <td className="num">
                          <b>{formatNumber(count)}</b>
                        </td>
                        <td className="num">
                          <b>
                            {formatNumber(barnRows.reduce((sum, b) => sum + b.pigs, 0))}
                          </b>
                        </td>
                        <td />
                        <td className="num">
                          <b>{formatNumber(barnRows.reduce((sum, b) => sum + b.alerts, 0))}</b>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Card>
          </Block>
        ) : (
          <Block id="barnHint" label={t("เลือกฟาร์มเพื่อดูรายโรงเรือน")}>
            <Card
              title={t("เลือกฟาร์มเพื่อดูรายโรงเรือน")}
              subtitle={t("ตอนนี้กำลังดูรวมทุกฟาร์ม — เลือกฟาร์มจากตารางด้านล่างหรือช่องเลือกฟาร์มด้านบน")}
              icon="home"
            >
              <p className="ptd-empty">
                {t("เมื่อเลือกฟาร์มแล้ว หน้านี้จะแสดงโรงเรือนที่เลี้ยง {type} ของฟาร์มนั้น พร้อมจำนวนสุกรรายโรงเรือน", {
                  type: t(type.short),
                })}
              </p>
            </Card>
          </Block>
        )}

        {/* ---------- กระจายตามฟาร์ม ---------- */}
        <Block id="farmSpread" label={t("แยกตามฟาร์ม")}>
          <Card
            title={t("{type} แยกตามฟาร์ม", { type: t(type.name) })}
            subtitle={t("กดชื่อฟาร์มเพื่อดูรายละเอียดของประเภทนี้เฉพาะฟาร์มนั้น")}
            icon="pin"
          >
            <div className="table-scroll">
              <table className="ptd-table">
                <thead>
                  <tr>
                    <th>{t("ฟาร์ม|หัวตาราง")}</th>
                    <th>{t("จังหวัด")}</th>
                    <th className="num">{t("{type} (ตัว)", { type: t(type.short) })}</th>
                    <th className="num">{t("สุกรทั้งฟาร์ม")}</th>
                    <th className="num">{t("สัดส่วนในฟาร์ม")}</th>
                  </tr>
                </thead>
                <tbody>
                  {farms.map((f) => {
                    const n = countOf(type.id, f.id);
                    return (
                      <tr key={f.id} className={f.id === farmId ? "is-active" : ""}>
                        <td>
                          <Link to={`/dashboard/pigs/${type.id}?farm=${f.id}`}>{t(f.name)}</Link>
                        </td>
                        <td>{t(f.province)}</td>
                        <td className="num">
                          <b>{formatNumber(n)}</b>
                        </td>
                        <td className="num">{formatNumber(f.pigs)}</td>
                        <td className="num">{formatNumber1((n / f.pigs) * 100)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={2}>{t("รวมทุกฟาร์ม")}</th>
                    <td className="num">
                      <b>{formatNumber(type.count)}</b>
                    </td>
                    <td className="num">
                      <b>{formatNumber(groupPigs)}</b>
                    </td>
                    <td className="num">
                      <b>{formatNumber1((type.count / groupPigs) * 100)}%</b>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </Block>
      </PageBoard>

      <AdjustModal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        target={pigTarget}
        title={t(type.name)}
        subtitle={t("ยอดรวมทุกฟาร์มในเครือ")}
        base={countOf(type.id, "all")}
      />

      <p className="ptd-foot">
        {t("ข้อมูลตัวอย่างสำหรับการสาธิต · อัปเดตล่าสุด {time}", {
          time: formatDateTime(farm?.updatedAt ?? summary.updatedAt),
        })}
      </p>
    </SideLayout>
  );
}
