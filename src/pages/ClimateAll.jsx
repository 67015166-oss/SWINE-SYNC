/**
 * หน้า "อุณหภูมิและความชื้นทุกฟาร์ม" (/dashboard/climate)
 * ปลายทางของกล่องสรุป "อุณหภูมิ / ความชื้น" ในหน้าภาพรวม
 *
 * เดิมกล่องนั้นเปิดป๊อบอัพให้เลือกฟาร์มกับโรงเรือนก่อนถึงจะดูอะไรได้ — กดแล้วยังไม่เห็นค่าอะไรเลย
 * หน้านี้จึงตอบคำถาม "ตอนนี้ทุกฟาร์มเป็นอย่างไร" ให้ก่อนในหน้าเดียว แล้วค่อยเจาะรายโรงเรือน
 * (ป๊อบอัพเลือกฟาร์ม/โรงเรือนยังอยู่ ย้ายไปเป็นปุ่มที่หัวหน้าและลิงก์ในตาราง)
 *
 * โครงหน้า: ตัวเลขรวม 4 ใบ → อุณหภูมิเฉลี่ยรายฟาร์ม (กราฟแท่ง) → ตารางทุกโรงเรือน
 *
 * เกณฑ์ "อยู่ในช่วงเหมาะสม" มาจากหน้าตั้งค่า (useSettings) เหมือนหน้าอื่นทั้งแอป
 * กราฟมีค่าเดียวและแกน Y เดียว · แท่งทุกแท่งสีเดียวกันเพราะเป็นปริมาณ ไม่ใช่การแยกประเภท
 */
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  ReferenceArea,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import PageHeader from "../components/ui/PageHeader.jsx";
import PageBoard, { Block } from "../components/board/PageBoard.jsx";
import Card from "../components/ui/Card.jsx";
import StatTile from "../components/ui/StatTile.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import Icon from "../components/ui/Icon.jsx";
import ClimatePicker from "../components/climate/ClimatePicker.jsx";
import { useAllFarms } from "../lib/records/useAllFarms.js";
import { BARN_STATUS_LABEL } from "../data/mock/barnsByFarm.js";
import { readingStatus, thiOf, thiLevel } from "../data/mock/climate.js";
import { gridProps, axisProps, tooltipStyle, comfortBandProps } from "../lib/chartTheme.js";
import { useSettings } from "../lib/settings/useSettings.js";
import { formatNumber, formatNumber1, formatDateTime } from "../lib/format.js";
import "./ClimateAll.css";
import { useT } from "../lib/i18n/useT.js";

/** รหัสกระดานของหน้านี้ — คีย์ที่ใช้เก็บชุดเลย์เอาต์ (ดู lib/layout/presets.js) */
const BOARD_ID = "climateAll";

/** ความสูงมาตรฐานของกราฟในหน้านี้ */
const CHART_HEIGHT = 300;

const dash = (value, format = formatNumber) => (value == null ? "—" : format(value));

/** ค่าเฉลี่ยความชื้นเป็นทศนิยมยาว ๆ (75.767) — ปัดเป็นจำนวนเต็มก่อนแสดงเสมอ */
const asPercent = (value) => (value == null ? "—" : formatNumber(Math.round(value)));

const mean = (list, pick) => {
  const values = list.map(pick).filter((v) => v != null);
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

/** โรงเรือนทุกหลังของทุกฟาร์ม พร้อมชื่อฟาร์มติดมาด้วย
    เดิมคำนวณครั้งเดียวตอนโหลดไฟล์ ตอนนี้ต้องคำนวณใหม่เมื่อผู้ใช้เพิ่มฟาร์ม/โรงเรือนเอง */
const buildBarns = (farms, barnsOf) =>
  farms.flatMap((farm) =>
    barnsOf(farm.id).map((barn) => ({
      ...barn,
      farmId: farm.id,
      farmName: farm.name,
      province: farm.province,
    }))
  );

/** อุณหภูมิ/ความชื้นเฉลี่ยรายฟาร์ม — ใช้ทั้งกราฟแท่งและปุ่มกรอง */
const buildFarmRows = (farms, allBarns) =>
  farms.map((farm) => {
    const barns = allBarns.filter((b) => b.farmId === farm.id);
    /* "ส่งค่าอยู่" ต้องมีค่าจริงด้วย — โรงเรือนที่ผู้ใช้เพิ่งเพิ่มยังไม่มีเซนเซอร์ (tempC = null)
       ถ้านับเป็นออนไลน์จะไปถ่วงค่าเฉลี่ยด้วยของที่ไม่มีตัวเลข */
    const online = barns.filter((b) => b.status !== "offline" && b.tempC != null);
    return {
      id: farm.id,
      name: farm.name,
      short: farm.name.replace("ฟาร์ม", ""),
      barns: barns.length,
      offline: barns.length - online.length,
      tempC: mean(online, (b) => b.tempC),
      humidity: mean(online, (b) => b.humidity),
    };
  });

/** วิธีเรียงตาราง — อยู่นอกคอมโพเนนต์เพราะต้องใช้ตรวจค่าที่อ่านมาจาก URL ด้วย */
const SORTS = [
  { id: "temp", label: "ร้อนที่สุด" },
  { id: "humidity", label: "ชื้นที่สุด" },
  { id: "farm", label: "ชื่อฟาร์ม" },
];

export default function ClimateAll() {
  const t = useT();
  /* ช่วงที่ถือว่าเหมาะสมปรับได้ในหน้าตั้งค่า — แถบเขียวในกราฟและป้ายสถานะขยับตามทันที */
  const { comfort } = useSettings();
  /* รวมฟาร์ม/โรงเรือนที่ผู้ใช้เพิ่มเองด้วย — หลังที่ยังไม่มีเซนเซอร์จะขึ้นเป็น "ไม่ส่งค่า" */
  const { farms, barnsOf } = useAllFarms();
  const ALL_BARNS = useMemo(() => buildBarns(farms, barnsOf), [farms, barnsOf]);
  const FARM_ROWS = useMemo(() => buildFarmRows(farms, ALL_BARNS), [farms, ALL_BARNS]);
  const [pickerOpen, setPickerOpen] = useState(false);

  /**
   * ตัวกรองฟาร์มกับการเรียง **อยู่ใน URL ไม่ใช่ใน state**
   * (`?farm=F-KKN&sort=humidity`) — เก็บใน state เฉย ๆ แล้วรีเฟรชทีตัวกรองหลุด
   * กลับไปเป็น "ทุกฟาร์ม" ทุกครั้ง ทั้งที่หน้าเดิม URL เดิม
   *
   * อ่านจาก URL ตรง ๆ ไม่สำเนาไว้ใน state ด้วย — สองที่จะไม่มีวันไม่ตรงกัน
   * ค่าที่ไม่มีอยู่จริง (ฟาร์มถูกลบ / แก้ URL มั่ว) ถอยไปค่าตั้งต้นแทนที่จะได้ตารางเปล่า
   */
  const [params, setParams] = useSearchParams();
  const rawFarmId = params.get("farm") ?? "";
  const farmId = farms.some((f) => f.id === rawFarmId) ? rawFarmId : "";
  const rawSort = params.get("sort") ?? "";
  /* ค่าเริ่มต้นคือร้อนสุดขึ้นก่อน เพราะเป็นสิ่งที่ต้องรีบดู */
  const sort = SORTS.some((s) => s.id === rawSort) ? rawSort : "temp";

  /* replace ไม่ใช่ push — กดกรอง/เรียงหลายทีแล้วประวัติจะกองจนกดย้อนกลับไม่ออก
     ค่าว่าง = ลบพารามิเตอร์ทิ้ง ("ทุกฟาร์ม" คือ "ไม่ได้กรอง" ไม่ใช่กรองด้วยค่าว่าง) */
  const patchParams = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key)
    );
    setParams(next, { replace: true });
  };
  const setFarmId = (id) => patchParams({ farm: id });
  const setSort = (id) => patchParams({ sort: id === "temp" ? "" : id });

  const tempRange = comfort.tempC;
  const humidityRange = comfort.humidity;

  const rows = useMemo(() => {
    const list = farmId ? ALL_BARNS.filter((b) => b.farmId === farmId) : ALL_BARNS;
    const order = [...list];
    /* โรงเรือนที่ไม่ส่งค่าไปอยู่ท้ายเสมอ ไม่ว่าจะเรียงแบบไหน (ไม่มีตัวเลขให้เทียบ) */
    order.sort((a, b) => {
      if (a.tempC == null) return 1;
      if (b.tempC == null) return -1;
      if (sort === "humidity") return b.humidity - a.humidity;
      if (sort === "farm") return a.farmName.localeCompare(b.farmName, "th");
      return b.tempC - a.tempC;
    });
    return order;
  }, [farmId, sort, ALL_BARNS]);

  /* ตัวเลขรวมของสิ่งที่กำลังดูอยู่ (ทุกฟาร์ม หรือฟาร์มเดียวเมื่อกรองไว้) */
  const online = rows.filter((b) => b.status !== "offline" && b.tempC != null);
  const avgTemp = mean(online, (b) => b.tempC);
  const avgHumidity = mean(online, (b) => b.humidity);
  const outOfRange = online.filter(
    (b) => readingStatus("tempC", b.tempC, comfort).tone !== "good"
  ).length;
  const offline = rows.length - online.length;
  const scopeName = farmId ? t(FARM_ROWS.find((f) => f.id === farmId)?.name ?? "") : t("ทุกฟาร์ม");

  /* เวลาอัปเดตล่าสุดของทั้งเครือ — ผู้ใช้ลบฟาร์มได้จนไม่เหลือสักฟาร์ม รายการจึงว่างได้จริง
     (เคยอ่าน farms[0].updatedAt ตรง ๆ แล้วลบฟาร์มหมดเมื่อไรหน้านี้ขาวทั้งหน้า) */
  const latestUpdate = farms.map((f) => f.updatedAt).sort().at(-1) ?? null;

  const chartData = (farmId ? FARM_ROWS.filter((f) => f.id === farmId) : FARM_ROWS).map(
    (farm) => ({ ...farm, tempC: farm.tempC == null ? 0 : Number(farm.tempC.toFixed(1)) })
  );

  return (
    <>
      <PageHeader
        title={t("อุณหภูมิและความชื้น")}
        subtitle={t("ทุกฟาร์มในเครือ · {n} โรงเรือน · อัปเดตล่าสุด {time}", {
          n: formatNumber(ALL_BARNS.length),
          time: formatDateTime(latestUpdate),
        })}
        action={
          <button
            type="button"
            className="ca-pick-btn"
            onClick={() => setPickerOpen(true)}
            aria-haspopup="dialog"
          >
            <span className="ca-pick-icon" aria-hidden="true">
              <Icon name="home" size={20} />
            </span>
            <span className="ca-pick-text">
              <span>{t("เจาะรายโรงเรือน")}</span>
              <b>{t("เลือกฟาร์มและโรงเรือน")}</b>
            </span>
            <Icon name="chevron" size={18} className="ca-pick-arrow" aria-hidden="true" />
          </button>
        }
      />

      <ClimatePicker open={pickerOpen} onClose={() => setPickerOpen(false)} />

      <PageBoard boardId={BOARD_ID}>
        <Block id="avgTemp" label={t("อุณหภูมิเฉลี่ย")}>
          <StatTile
            variant="row"
            label={t("อุณหภูมิเฉลี่ย · {scope}", { scope: scopeName })}
            value={dash(avgTemp, formatNumber1)}
            unit="°C"
            delta={{
              text: t("ช่วงที่เหมาะสม {min}–{max} °C", {
                min: formatNumber(tempRange.min),
                max: formatNumber(tempRange.max),
              }),
              tone:
                avgTemp == null || readingStatus("tempC", avgTemp, comfort).tone === "good"
                  ? "good"
                  : "bad",
            }}
          />
        </Block>

        <Block id="avgHumidity" label={t("ความชื้นเฉลี่ย")}>
          <StatTile
            variant="row"
            label={t("ความชื้นเฉลี่ย · {scope}", { scope: scopeName })}
            value={asPercent(avgHumidity)}
            unit="%RH"
            delta={{
              text: t("ช่วงที่เหมาะสม {min}–{max}%", {
                min: formatNumber(humidityRange.min),
                max: formatNumber(humidityRange.max),
              }),
              tone:
                avgHumidity == null ||
                readingStatus("humidity", avgHumidity, comfort).tone === "good"
                  ? "good"
                  : "bad",
            }}
          />
        </Block>

        <Block id="outOfRange" label={t("โรงเรือนที่หลุดเกณฑ์อุณหภูมิ")}>
          <StatTile
            variant="row"
            label={t("หลุดเกณฑ์อุณหภูมิ")}
            value={formatNumber(outOfRange)}
            unit={t("โรงเรือน|หน่วยนับ")}
            delta={{
              text: t("จากที่ส่งค่าอยู่ {n} หลัง", { n: formatNumber(online.length) }),
              tone: outOfRange > 0 ? "bad" : "good",
            }}
          />
        </Block>

        <Block id="offline" label={t("โรงเรือนที่ไม่ส่งค่า")}>
          <StatTile
            variant="row"
            label={t("เซนเซอร์ไม่ส่งค่า")}
            value={formatNumber(offline)}
            unit={t("โรงเรือน|หน่วยนับ")}
            delta={{
              text:
                offline > 0 ? t("ตรวจไฟและสัญญาณที่ตู้ควบคุม") : t("ทุกหลังส่งค่าปกติ"),
              tone: offline > 0 ? "bad" : "good",
            }}
          />
        </Block>

        {/* ---------- อุณหภูมิเฉลี่ยรายฟาร์ม ---------- */}
        <Block id="farmChart" label={t("อุณหภูมิเฉลี่ยรายฟาร์ม")}>
          <Card
            title={t("อุณหภูมิเฉลี่ยรายฟาร์ม")}
            subtitle={t(
              "แถบเขียวคือช่วงที่เหมาะสม {min}–{max} °C · กดชื่อฟาร์มด้านล่างเพื่อดูเฉพาะฟาร์มนั้น",
              { min: formatNumber(tempRange.min), max: formatNumber(tempRange.max) },
            )}
            icon="chart"
          >
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid {...gridProps} />
                {/* แถบช่วงเหมาะสมต้องอยู่หลังแท่งเสมอ (isFront: false อยู่ใน comfortBandProps) */}
                <ReferenceArea y1={tempRange.min} y2={tempRange.max} {...comfortBandProps} />
                <XAxis dataKey="short" {...axisProps} tickFormatter={(name) => t(name)} />
                <YAxis {...axisProps} width={44} domain={[20, 34]} />
                <Tooltip
                  {...tooltipStyle}
                  cursor={{ fill: "var(--bg-tint)" }}
                  formatter={(value) => [
                    `${formatNumber1(value)} °C`,
                    t("อุณหภูมิเฉลี่ย"),
                  ]}
                  labelFormatter={(name) => t(`ฟาร์ม${name}`)}
                />
                {/* แท่งทุกแท่งสีเดียวกัน — นี่คือ "ปริมาณ" ไม่ใช่การแยกประเภท */}
                <Bar
                  dataKey="tempC"
                  name={t("อุณหภูมิเฉลี่ย")}
                  fill="var(--seq-400)"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>

            <div className="ca-farms" role="group" aria-label={t("กรองตามฟาร์ม")}>
              <button
                type="button"
                aria-pressed={farmId === ""}
                className={"ca-farm" + (farmId === "" ? " is-on" : "")}
                onClick={() => setFarmId("")}
              >
                <Icon name={farmId === "" ? "check" : "grid"} size={16} aria-hidden="true" />
                {t("ทุกฟาร์ม")}
              </button>
              {FARM_ROWS.map((farm) => (
                <button
                  key={farm.id}
                  type="button"
                  aria-pressed={farmId === farm.id}
                  className={"ca-farm" + (farmId === farm.id ? " is-on" : "")}
                  onClick={() => setFarmId(farm.id)}
                >
                  <Icon
                    name={farmId === farm.id ? "check" : "pin"}
                    size={16}
                    aria-hidden="true"
                  />
                  {t(farm.name)}
                  <em className="num">{dash(farm.tempC, formatNumber1)}°</em>
                </button>
              ))}
            </div>
          </Card>
        </Block>

        {/* ---------- ตารางทุกโรงเรือน ---------- */}
        <Block id="barnTable" label={t("อุณหภูมิและความชื้นรายโรงเรือน")}>
          <Card
            title={t("รายโรงเรือน · {scope} ({n} หลัง)", {
              scope: scopeName,
              n: formatNumber(rows.length),
            })}
            subtitle={t("กดชื่อโรงเรือนเพื่อเข้าไปดูกราฟย้อนหลังและสั่งพัดลม/ปั๊มของหลังนั้น")}
            icon="list"
          >
            <div className="ca-sorts" role="group" aria-label={t("เรียงตาราง")}>
              <span className="ca-sorts-label">{t("เรียงตาม")}</span>
              {SORTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={sort === item.id}
                  className={"ca-sort" + (sort === item.id ? " is-on" : "")}
                  onClick={() => setSort(item.id)}
                >
                  {t(item.label)}
                </button>
              ))}
            </div>

            <div className="table-scroll">
              <table className="ca-table">
                <thead>
                  <tr>
                    <th>{t("ฟาร์ม|หัวตาราง")}</th>
                    <th>{t("โรงเรือน|หัวตาราง")}</th>
                    <th className="num">{t("อุณหภูมิ")}</th>
                    <th className="num">{t("ความชื้น")}</th>
                    <th className="num">NH₃</th>
                    <th className="num">THI</th>
                    <th>{t("สถานะ")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((barn) => {
                    const tempStatus = readingStatus("tempC", barn.tempC, comfort);
                    const humidStatus = readingStatus("humidity", barn.humidity, comfort);
                    const thi = barn.tempC == null ? null : thiOf(barn.tempC, barn.humidity);
                    const level = thi == null ? null : thiLevel(thi);
                    return (
                      <tr key={barn.id}>
                        <td className="ca-farm-cell">
                          <b>{t(barn.farmName)}</b>
                          <span>{t(barn.province)}</span>
                        </td>
                        <td>
                          <Link
                            className="ca-link"
                            to={`/dashboard/climate/${barn.farmId}/${barn.id}`}
                          >
                            {t(barn.name)}
                            <Icon name="chevron" size={15} aria-hidden="true" />
                          </Link>
                          <span className="ca-stage">{t(barn.stage)}</span>
                        </td>
                        <td className={`num ca-value is-${tempStatus.tone}`}>
                          {dash(barn.tempC, formatNumber1)} °C
                        </td>
                        <td className={`num ca-value is-${humidStatus.tone}`}>
                          {dash(barn.humidity)}%
                        </td>
                        <td className="num">{dash(barn.nh3)} ppm</td>
                        <td className="num">{dash(thi, formatNumber1)}</td>
                        <td>
                          {/* ต้องเช็ก level ว่าง ไม่ใช่เช็กแค่ offline —
                              โรงเรือนที่ผู้ใช้เพิ่งเพิ่มยังไม่มีเซนเซอร์ จึงไม่มีค่า THI
                              แต่สถานะไม่ใช่ "offline" (ไม่ได้หลุดการเชื่อมต่อ แค่ยังไม่ได้ติดตั้ง) */}
                          {barn.status === "offline" ? (
                            <StatusBadge tone="offline">
                              {t(BARN_STATUS_LABEL.offline)}
                            </StatusBadge>
                          ) : level == null ? (
                            <StatusBadge tone="offline">{t("ยังไม่มีเซนเซอร์")}</StatusBadge>
                          ) : (
                            <StatusBadge tone={level.tone}>{t(level.label)}</StatusBadge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </Block>
      </PageBoard>
    </>
  );
}
