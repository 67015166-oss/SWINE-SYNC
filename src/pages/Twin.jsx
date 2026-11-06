/**
 * Farm Digital Twin — แบบจำลองโรงเรือนของโรงเรือน ชั้นที่ 1 "เห็นสถานะจริง" (T1.260)
 *
 * ชั้นนี้ยังไม่มีแบบจำลองและยังจำลองสถานการณ์ไม่ได้ ตั้งใจให้ทำหน้าที่เดียว:
 * **สะท้อนสิ่งที่วัดได้จริงตอนนี้เป็นภาพ** และบอกให้ชัดว่าอะไรที่มันยังไม่รู้
 * (การ์ด "แบบจำลองนี้รู้อะไรบ้าง") — แบบจำลองที่อ้างเกินกว่าที่วัดได้คือแบบจำลองที่หลอกคนดู
 *
 * ค่าทั้งหมดมาจากหลังบ้านของเราเอง ไม่ใช่ PlotNexus ที่ถูกถอนสิทธิ์ไปแล้ว — ดู useTwinState.js
 */
import { useMemo, useState } from "react";
import PageHeader from "../components/ui/PageHeader.jsx";
import PageBoard, { Block } from "../components/board/PageBoard.jsx";
import Card from "../components/ui/Card.jsx";
import Icon from "../components/ui/Icon.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import BarnTwin from "../components/twin/BarnTwin.jsx";
import TwinModel from "../components/twin/TwinModel.jsx";
import TwinLab from "../components/twin/TwinLab.jsx";
import { valueOf } from "../lib/api/twinValue.js";
import { useTwinState } from "../lib/api/useTwinState.js";
import { useBarnTwin } from "../lib/api/useBarnTwin.js";
import { useTwinScenario } from "../lib/api/useTwinScenario.js";
import { useSettings } from "../lib/settings/useSettings.js";
import { readingStatus, thiOf, thiLevel } from "../data/mock/climate.js";
import { alertText, alertTitle } from "../lib/api/alertText.js";
import { formatNumber, formatNumber1, formatDateTime } from "../lib/format.js";
import { useT } from "../lib/i18n/useT.js";
import { durationText } from "../lib/duration.js";
import "./Twin.css";

const BOARD_ID = "twin";

/** ข้อมูลเก่ากว่านี้ถือว่า "ไม่สด" — เซนเซอร์ส่งทุก ~10 วินาที 15 นาทีจึงนานผิดปกติแล้ว */
const STALE_MINUTES = 15;

const minutesSince = (iso) => {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60000)) : null;
};

/** เวลาที่ค่าล่าสุดของโรงเรือนนี้ถูกวัด (เอาอันที่ใหม่ที่สุดในบรรดาทุก metric) */
function latestAt(barn) {
  const cells = [...Object.values(barn?.current ?? {}), ...Object.values(barn?.outdoor ?? {})];
  const times = cells.map((c) => c?.at).filter(Boolean).sort();
  return times.at(-1) ?? null;
}

/** เหตุที่แบบจำลองยังเปิดไม่ได้ — หลังบ้านส่งรหัสมา หน้าเว็บประกอบประโยคเอง (สลับภาษาได้) */
function reasonText(t, reason) {
  switch (reason?.code) {
    case "weather_unavailable":
      return t("ดึงข้อมูลแดดและอากาศจาก Open-Meteo ไม่ได้ — จะลองใหม่อัตโนมัติ");
    case "no_location":
      return t("ฟาร์มนี้ยังไม่มีพิกัด — แบบจำลองต้องใช้พิกัดเพื่อดึงข้อมูลแดดและอากาศ");
    case "not_enough_data":
      return t("ข้อมูลต่อเนื่องยังไม่พอ — มี {have} ชั่วโมง ต้องการอย่างน้อย {need} ชั่วโมง", {
        have: formatNumber(reason.have),
        need: formatNumber(reason.need),
      });
    case "unstable":
      return t("แบบจำลองที่ได้ไม่เสถียร — ยังไม่เปิดใช้");
    default:
      return t("ยังไม่มีข้อมูลพอให้สร้างแบบจำลอง");
  }
}

export default function Twin() {
  const t = useT();
  const { comfort } = useSettings();
  const twin = useTwinState();
  const [picked, setPicked] = useState(null);

  const barn = useMemo(
    () => twin.barns.find((b) => b.id === picked) ?? twin.barns[0] ?? null,
    [twin.barns, picked],
  );

  const barnAlerts = twin.alerts.filter((a) => a.barn_id === barn?.id);
  /* ชั้นที่ 2: แบบจำลอง + สุขภาพเซนเซอร์นอกเล้า (ค้างหรือไม่) */
  const model = useBarnTwin(barn?.id);
  /* ชั้นที่ 3: วัตถุดิบสำหรับจำลองสถานการณ์ */
  const scenario = useTwinScenario(barn?.id);
  const sensors = model.data?.sensors;
  const outTempStuck = sensors?.outdoorTemp?.stuck === true;
  const outHumidStuck = sensors?.outdoorHumidity?.stuck === true;
  /* ชั่วโมงที่ค้าง — คิดเฉพาะตัวที่ค้างจริง (ไม่เอา 0 มาแทนค่าที่ไม่มี) */
  const stuckHours = Math.round(
    Math.max(
      ...[outTempStuck && sensors.outdoorTemp.unchangedHours, outHumidStuck && sensors.outdoorHumidity.unchangedHours]
        .filter((h) => Number.isFinite(h)),
      Number.NEGATIVE_INFINITY,
    ),
  );
  const measuredAt = latestAt(barn);
  const age = minutesSince(measuredAt);
  const stale = age != null && age > STALE_MINUTES;

  const tempIn = valueOf(barn?.current, "temp_c");
  const humidIn = valueOf(barn?.current, "humidity");
  const windIn = valueOf(barn?.current, "wind_ms");
  const tempOut = valueOf(barn?.outdoor, "temp_c");
  const humidOut = valueOf(barn?.outdoor, "humidity");
  const thi = tempIn != null && humidIn != null ? thiOf(tempIn, humidIn) : null;

  /* ---------- ยังต่อข้อมูลไม่ได้ ---------- */
  if (!barn) {
    const message =
      twin.status === "loading"
        ? t("กำลังต่อกับหลังบ้าน…")
        : twin.status === "unauthorized"
          ? t("ต้องเข้าสู่ระบบก่อนจึงจะเห็นสถานะจริงของโรงเรือน")
          : twin.status === "error"
            ? t("ต่อกับหลังบ้านไม่ได้ — {reason}", { reason: twin.error ?? "" })
            : t("ยังไม่มีโรงเรือนที่ส่งค่าเข้ามา — แบบจำลองแสดงเฉพาะของจริง ไม่มีข้อมูลตัวอย่างแทน");
    return (
      <>
        <PageHeader title={t("แบบจำลองโรงเรือน")} subtitle={t("ภาพสะท้อนโรงเรือนจากค่าที่วัดได้จริง")} />
        <PageBoard boardId={BOARD_ID}>
          <Block id="plan" label={t("ผังโรงเรือน")}>
            <Card title={t("ยังไม่มีอะไรให้สะท้อน")} icon="monitor">
              <p className="tw-empty">{message}</p>
            </Card>
          </Block>
        </PageBoard>
      </>
    );
  }

  const rows = [
    { key: "อุณหภูมิในเล้า", value: tempIn, unit: "°C", kind: "tempC", icon: "thermometer" },
    { key: "ความชื้นในเล้า", value: humidIn, unit: "%", kind: "humidity", icon: "drop" },
    { key: "ลมในเล้า", value: windIn, unit: "m/s", kind: null, icon: "wind" },
    { key: "อุณหภูมินอกเล้า", value: tempOut, unit: "°C", kind: null, icon: "sun", stuck: outTempStuck },
    { key: "ความชื้นนอกเล้า", value: humidOut, unit: "%", kind: null, icon: "cloud", stuck: outHumidStuck },
  ];

  return (
    <>
      <PageHeader
        title={t("แบบจำลองโรงเรือน")}
        subtitle={t("{farm} · {barn} · ค่าล่าสุดเมื่อ {time}", {
          farm: t(barn.farmName ?? ""),
          barn: t(barn.name),
          time: measuredAt ? formatDateTime(measuredAt) : t("ไม่มีค่า"),
        })}
      />

      <PageBoard boardId={BOARD_ID}>
        <Block id="plan" label={t("ผังโรงเรือน")}>
          <Card
            title={t("ผังโรงเรือน {barn}", { barn: t(barn.name) })}
            subtitle={t("มองจากด้านบน · สีของพื้นมาจากจุดวัดจุดเดียวที่มีจริงในเล้า")}
            icon="map"
          >
            {twin.barns.length > 1 && (
              <div className="tw-pick" role="group" aria-label={t("เลือกโรงเรือน")}>
                {twin.barns.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={"tw-pick-btn" + (b.id === barn.id ? " is-on" : "")}
                    onClick={() => setPicked(b.id)}
                  >
                    {t(b.name)}
                  </button>
                ))}
              </div>
            )}

            <BarnTwin
              barn={barn}
              comfort={comfort}
              openCount={barnAlerts.length}
              outdoorStuck={outTempStuck}
            />

            <p className="tw-legend">
              {stale
                ? t("ค่าล่าสุดเก่า {time} แล้ว — ภาพนี้อาจไม่ตรงกับของจริงตอนนี้", {
                  time: durationText(t, age),
                })
                : t("ภาพนี้อัปเดตตามค่าที่วัดได้ทุก 20 วินาที")}
            </p>
          </Card>
        </Block>

        <Block id="now" label={t("ค่าที่วัดได้ตอนนี้")}>
          <Card
            title={stale ? t("ค่าที่วัดได้ล่าสุด") : t("ค่าที่วัดได้ตอนนี้")}
            icon="thermometer"
          >
            {/* ★ การ์ดนี้เคยชื่อ "ตอนนี้" เสมอ และติดป้าย "ปกติ" ให้ค่าที่เก่าเป็นวัน ๆ
                เจอจริง 30 ก.ย. 2569: ข้อมูลหยุดไหล 35 ชั่วโมง แต่หน้าจอยังบอกว่าปกติ
                คนอ่านจึงเชื่อว่าเล้าเรียบร้อยดี ทั้งที่ระบบไม่รู้อะไรเลยมาตั้งแต่เมื่อวาน
                ➜ ข้อมูลไม่สดต้องบอกก่อนเห็นตัวเลข และ**ห้ามตัดสินสถานะปัจจุบันจากค่าเก่า** */}
            {stale && (
              <p className="tw-stale">
                <StatusBadge tone="offline">{t("ข้อมูลไม่สด")}</StatusBadge>
                <span>
                  {t("ค่าเหล่านี้วัดเมื่อ {at} (เก่า {time}) — ไม่ใช่สถานะตอนนี้", {
                    at: measuredAt ? formatDateTime(measuredAt) : t("ไม่มีค่า"),
                    time: durationText(t, age),
                  })}
                </span>
              </p>
            )}
            <ul className="tw-rows">
              {rows.map((r) => {
                /* ค่าค้าง = ไม่ได้วัดจริง ต้องติดป้ายให้เห็น ไม่ใช่โชว์เหมือนค่าปกติ */
                const status = r.stuck
                  ? { tone: "offline", label: "ค่าค้าง" }
                  : /* ข้อมูลไม่สด = ตัดสินสถานะ "ตอนนี้" ไม่ได้ · แถบด้านบนบอกไปแล้วว่าเก่าแค่ไหน */
                    !stale && r.kind
                    ? readingStatus(r.kind, r.value, comfort)
                    : null;
                return (
                  <li key={r.key} className="tw-row">
                    <span className="tw-row-icon" aria-hidden="true">
                      <Icon name={r.icon} size={18} />
                    </span>
                    <span className="tw-row-label">{t(r.key)}</span>
                    <b className="tw-row-value">
                      {r.value == null ? t("ไม่มีค่า") : `${formatNumber1(r.value)} ${r.unit}`}
                    </b>
                    {status && <StatusBadge tone={status.tone}>{t(status.label)}</StatusBadge>}
                  </li>
                );
              })}
            </ul>

            {(outTempStuck || outHumidStuck) && (
              <p className="tw-stuck">
                <Icon name="warn" size={16} aria-hidden="true" />
                {t("ค่านอกเล้าไม่เปลี่ยนเลยมา {n} ชั่วโมง — เซนเซอร์ค้าง ไม่ใช่อากาศนิ่ง อย่าใช้ตัดสินใจ", {
                  n: formatNumber(stuckHours),
                })}
              </p>
            )}

            {thi != null && !stale && (
              <div className="tw-thi">
                <span className="tw-thi-label">{t("ดัชนีความเครียดร้อน (THI)")}</span>
                <b className="tw-thi-value">{formatNumber1(thi)}</b>
                <StatusBadge tone={thiLevel(thi).tone}>{t(thiLevel(thi).label)}</StatusBadge>
                <p className="tw-thi-text">{t(thiLevel(thi).text)}</p>
              </div>
            )}
          </Card>
        </Block>

        <Block id="model" label={t("แบบจำลองที่คิดได้")}>
          <Card
            title={t("แบบจำลองที่คิดได้")}
            subtitle={t("แบบจำลองความร้อนของเล้าที่หาจากข้อมูลจริง แล้วทำนายคู่กับของจริงเพื่อจับความผิดปกติ")}
            icon="pulse"
          >
            {model.status === "loading" || model.status === "idle" ? (
              <p className="tw-empty">{t("กำลังคำนวณแบบจำลอง…")}</p>
            ) : model.status === "error" ? (
              <p className="tw-empty">{t("ต่อกับหลังบ้านไม่ได้ — {reason}", { reason: model.error ?? "" })}</p>
            ) : !model.data?.model ? (
              <div className="tw-model-off">
                <StatusBadge tone="offline">{t("ยังเปิดใช้ไม่ได้")}</StatusBadge>
                <p className="tw-model-reason">{reasonText(t, model.data?.reason)}</p>
                <p className="tw-model-need">
                  {t("ชั้นนี้สอนตัวเองใหม่ทุกชั่วโมง เมื่อเงื่อนไขครบจะเปิดใช้เอง")}
                </p>
              </div>
            ) : (
              <TwinModel data={model.data} />
            )}
          </Card>
        </Block>

        <Block id="lab" label={t("แบบจำลองที่ทดลองได้")}>
          <Card
            title={t("แบบจำลองที่ทดลองได้")}
            subtitle={t("ดูว่า 24 ชม. ข้างหน้าเล้าจะเป็นยังไง หรือเล่นซ้ำวันที่ร้อนที่สุด แล้วลองปรับดูว่าผลเปลี่ยนไปแค่ไหน")}
            icon="sun"
          >
            {scenario.status === "loading" || scenario.status === "idle" ? (
              <p className="tw-empty">{t("กำลังเตรียมข้อมูลจำลอง…")}</p>
            ) : scenario.status === "error" ? (
              <p className="tw-empty">{t("ต่อกับหลังบ้านไม่ได้ — {reason}", { reason: scenario.error ?? "" })}</p>
            ) : !scenario.data?.model ? (
              <div className="tw-model-off">
                <StatusBadge tone="offline">{t("ยังเปิดใช้ไม่ได้")}</StatusBadge>
                <p className="tw-model-reason">{reasonText(t, scenario.data?.reason)}</p>
              </div>
            ) : (
              <TwinLab data={scenario.data} comfort={comfort} />
            )}
          </Card>
        </Block>

        <Block id="alerts" label={t("เหตุที่ยังไม่ปิด")}>
          <Card title={t("เหตุที่ยังไม่ปิด")} icon="bell">
            {barnAlerts.length === 0 ? (
              <p className="tw-empty">{t("ตอนนี้ไม่มีเหตุค้างของโรงเรือนนี้")}</p>
            ) : (
              <ul className="tw-alerts">
                {barnAlerts.map((a) => {
                  const text = alertText(a);
                  return (
                    <li key={a.id} className="tw-alert">
                      <StatusBadge tone={a.level === "warning" ? "warning" : a.level}>
                        {alertTitle(t, text)}
                      </StatusBadge>
                      <span className="tw-alert-time">{formatDateTime(a.opened_at)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </Block>

        <Block id="trust" label={t("แบบจำลองนี้รู้อะไรบ้าง")}>
          <Card
            title={t("แบบจำลองนี้รู้อะไรบ้าง")}
            subtitle={t("แบบจำลองที่อ้างเกินกว่าที่วัดได้คือแบบจำลองที่หลอกคนดู — ตรงนี้บอกขอบเขตให้ครบ")}
            icon="eye"
          >
            <div className="tw-trust">
              <section>
                <h4>
                  <Icon name="check" size={16} aria-hidden="true" />
                  {t("วัดได้จริง")}
                </h4>
                <ul>
                  <li>{t("อุณหภูมิ ความชื้น และลมในเล้า จากจุดวัดจุดเดียว")}</li>
                  {!outTempStuck && !outHumidStuck && sensors && (
                    <li>{t("อุณหภูมิและความชื้นนอกเล้า จากเสาข้างนอก")}</li>
                  )}
                  <li>{t("เหตุที่เครื่องจับได้ พร้อมเวลาที่เกิด")}</li>
                </ul>
              </section>
              <section>
                <h4>
                  <Icon name="grid" size={16} aria-hidden="true" />
                  {t("วาดตามโครงสร้าง ไม่ใช่ค่าที่วัด")}
                </h4>
                <ul>
                  <li>{t("ตำแหน่งคอก ช่องลมเข้า และพัดลม")}</li>
                  <li>{t("ทิศทางลมจากหัวเล้าไปท้ายเล้า")}</li>
                  {/* ความจุยังไม่ได้บันทึกในฐานของโรงเรือนจริง — ไม่มีก็ไม่ต้องโชว์ขีดกลางให้งง
                      (ย้ายไปอยู่ใน "ยังไม่รู้" แทน ซึ่งเป็นที่ของมันจริง ๆ) */}
                  {barn.capacity != null && (
                    <li>{t("ความจุโรงเรือน {n} ตัว", { n: formatNumber(barn.capacity) })}</li>
                  )}
                </ul>
              </section>
              <section>
                <h4>
                  <Icon name="pulse" size={16} aria-hidden="true" />
                  {t("คำนวณจากแบบจำลอง ไม่ใช่ค่าวัด")}
                </h4>
                <ul>
                  <li>{t("อุณหภูมิที่แบบจำลองคาด และส่วนต่างกับของจริง")}</li>
                  <li>{t("แดดและอากาศนอก จาก Open-Meteo (แบบจำลองอากาศรายชั่วโมง)")}</li>
                </ul>
              </section>
              <section>
                <h4>
                  <Icon name="warn" size={16} aria-hidden="true" />
                  {t("ยังไม่รู้")}
                </h4>
                <ul>
                  <li>{t("พัดลมหมุนอยู่จริงหรือไม่ — ยังไม่มีสายกลับจากตู้ควบคุม")}</li>
                  <li>{t("อุณหภูมิตามมุมต่าง ๆ ของเล้า — มีจุดวัดจุดเดียว จึงไล่เฉดสีไม่ได้")}</li>
                  {(outTempStuck || outHumidStuck) && (
                    <li>
                      {t("อุณหภูมิและความชื้นนอกเล้า — เซนเซอร์ส่งค่าเดิมซ้ำมา {n} ชั่วโมง จึงไม่นับเป็นค่าจริง", {
                        n: formatNumber(stuckHours),
                      })}
                    </li>
                  )}
                  <li>{t("จำนวนสุกรที่อยู่จริงในเล้าขณะนี้")}</li>
                  {barn.capacity == null && <li>{t("ความจุของโรงเรือน — ยังไม่ได้บันทึกไว้ในระบบ")}</li>}
                </ul>
              </section>
            </div>
          </Card>
        </Block>
      </PageBoard>
    </>
  );
}
