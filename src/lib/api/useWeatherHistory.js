/**
 * ข้อมูลย้อนหลังของ "เสาอากาศ" — ใช้ในหน้าสภาพอากาศ (/dashboard/weather)
 *
 * **ทำไมไม่ใช้ `useBarnHistory` ที่มีอยู่แล้ว** ตัวนั้นดึงค่าที่กราฟในโรงเรือนใช้
 * (อุณหภูมิ · ความชื้น · ลมในเล้า · NH₃ · CO₂) แล้วเก็บค่าของเสาอากาศมาแค่สองตัว
 * คืออุณหภูมิกับความชื้น ส่วนหน้าสภาพอากาศต้องการลม ฝน และแสงของเสาด้วย
 * ซึ่งตัวนั้นไม่ได้ขอมาเลย — ถ้าไปเพิ่มในนั้นก็จะยิงคำขอเปล่าให้ทุกหน้าที่ใช้กราฟในเล้า
 *
 * ขอเฉพาะเส้นของ "จุดติดตั้งนอกอาคาร" เท่านั้น เส้นในเล้าที่ API ส่งมาด้วยถูกทิ้ง
 * (อุณหภูมิของ `pig` มีสองเส้น — ในเล้ากับที่เสา ถ้าไม่กรองจะได้กราฟสองเส้นปนกัน)
 */
import { useEffect, useState } from "react";
import { fetchSeries, plotnexusReady, PIG_SOURCE } from "./plotnexus.js";
import { FARM_MAP } from "./plotnexusFarms.js";
import { apiGet } from "./client.js";
import { useLiveFarms } from "./useLiveFarms.js";
import { rangeOf } from "./summaryStats.js";
import { stuckLabel, stuckSeriesKeys } from "../sensorHealth.js";

/**
 * ค่าที่หน้าสภาพอากาศวาดกราฟ → ชื่อที่ PlotNexus เรียก
 * ขอเท่าที่วาดจริง จะได้ไม่ยิงคำขอเปล่า (หนึ่งค่า = หนึ่งคำขอ)
 */
/** ชื่อค่าที่วัดของฐานเรา → คีย์ที่กราฟหน้านี้ใช้ (T1.312) */
const FIELD_OF = { temp_c: "tempC", humidity: "humidity", wind_ms: "wind" };

const MEASURES = [
  ["tempC", "temperature"],
  ["humidity", "humidity"],
  ["wind", "wind_speed"],
  ["rainfall", "rainfall"],
  ["light", "light"],
];

/** ช่วงเวลาที่หน้าจอเลือก → จำนวนชั่วโมงที่ขอ และป้ายแกน X เป็นรายชั่วโมงไหม */
const RANGE = {
  "24h": { hours: 24, hourly: true },
  "7d": { hours: 24 * 7, hourly: false },
  "30d": { hours: 24 * 30, hourly: false },
};

const round1 = (n) => (n == null ? null : Number(Number(n).toFixed(1)));

/** ป้ายแกน X — รายชั่วโมงใช้ "13:00" · รายวันใช้ "31/8" (เวลาไทยเสมอ) */
function labelOf(iso, hourly) {
  const d = new Date(iso);
  if (hourly) return `${String(d.getHours()).padStart(2, "0")}:00`;
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/**
 * รวมทุกค่าที่วัดให้เป็นหนึ่งแถวต่อหนึ่งจุดเวลา
 * (กราฟ Recharts ต้องการรูปนี้ — หนึ่ง object ต่อหนึ่งจุดบนแกน X)
 */
function toSeries(points, hourly) {
  const byTime = new Map();
  for (const p of points) {
    if (!byTime.has(p.at)) {
      byTime.set(p.at, {
        at: p.at,
        hour: labelOf(p.at, hourly),
        tempC: null,
        humidity: null,
        wind: null,
        rainfall: null,
        light: null,
      });
    }
    byTime.get(p.at)[p.key] = round1(p.value);
  }

  /* เรียงตามเวลา แล้วใส่ `t` เป็นลำดับจุด — แกน X ต้องใช้ `t` ไม่ใช่ชื่อชั่วโมง
     เพราะช่วง 7/30 วันมีชื่อชั่วโมงซ้ำกัน จุดที่ชื่อซ้ำจะทับกันจนกราฟหายไปเกือบหมด
     (บทเรียนเดียวกับ useBarnHistory.js) */
  return [...byTime.values()]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((row, i) => ({ ...row, t: i }));
}

/**
 * @param {string} source รหัสชุดข้อมูลของ PlotNexus (ตอนนี้มีชุดเดียวคือ "pig")
 * @param {"24h"|"7d"|"30d"} range
 * @returns {{series: Array|null, status: "idle"|"loading"|"ok"|"error"}}
 *          `series` เป็น null = ยังไม่มีข้อมูล ให้หน้าจอขึ้นกล่อง "ไม่มีค่าในช่วงนี้"
 */
export function useWeatherHistory(source = PIG_SOURCE, range = "24h", barnApiId = null) {
  const [state, setState] = useState({ series: null, stuck: [], status: "idle" });
  /* แหล่งข้อมูลตัดสินที่ LiveFarmsProvider ที่เดียว เหมือน useBarnHistory (T1.312) */
  const { source: liveSource } = useLiveFarms();

  useEffect(() => {
    const controller = new AbortController();

    /* ═══ หลังบ้านของเราเอง (T1.312) ═══
       ★ ค่านอกอาคารอยู่ในฐานเราอยู่แล้ว — มันมาจากตู้เดียวกับค่าในเล้า
         แค่ผูกกับอุปกรณ์ที่ติดธง `outdoor` เอาไว้ จึงไม่ต้องไปขอใครอีก
       ★ **ของเรามีแค่อุณหภูมิกับความชื้นนอกอาคาร** ไม่มีฝน แสง ทิศลม
         เพราะท่อของเราไม่เคยเก็บ หน้าจอจะขึ้นขีดกลางตรงไปตรงมา */
    if (liveSource === "server" && barnApiId) {
      const { hourly, api } = rangeOf(range);
      setState((prev) => ({ ...prev, status: "loading" }));

      apiGet(`/barns/${barnApiId}/readings?range=${api}&metrics=temp_c,humidity,wind_ms`,
        { signal: controller.signal })
        .then((res) => {
          if (controller.signal.aborted) return;
          /* เอาเฉพาะเส้นของเสาอากาศ — เส้นในเล้าเป็นคนละที่ ไม่ใช่สภาพอากาศ */
          const raw = (res?.points ?? []).filter((p) => p.outdoor && p.value != null);

          /* ★ เสาอากาศของฟาร์มนี้ส่งค่าเดิมซ้ำมาตลอด (ดู T1.304)
             ต้องตัดออกเหมือนกับกราฟในหน้าสภาพแวดล้อม ไม่งั้นหน้านี้จะวาดเส้นปลอม
             ทั้งที่อีกหน้าตัดทิ้งไปแล้ว — ระบบเดียวกันต้องไม่บอกคนละอย่าง */
          const stuck = stuckSeriesKeys(raw);
          const kept = stuck.size === 0
            ? raw
            : raw.filter((p) => !stuck.has(`${p.metric}|out`));

          const points = kept.map((p) => ({
            key: FIELD_OF[p.metric],
            at: typeof p.at === "string" ? p.at : new Date(p.at).toISOString(),
            value: p.value,
          })).filter((p) => p.key);

          setState({
            series: points.length ? toSeries(points, hourly) : null,
            stuck: [...stuck].map(stuckLabel),
            status: "ok",
          });
        })
        .catch((err) => {
          if (err.name === "AbortError" || controller.signal.aborted) return;
          setState({ series: null, stuck: [], status: "error" });
        });

      return () => controller.abort();
    }

    /* ★ แหล่งสำรองถูกปิดแล้ว (T1.342) — หยุดก่อนยิง ไม่งั้นได้ 403 เปล่า ๆ ทุกครั้ง */
    if (!plotnexusReady) {
      setState({ series: null, stuck: [], status: "idle" });
      return undefined;
    }

    const outdoorId = FARM_MAP[source]?.outdoor;
    if (!outdoorId) {
      setState({ series: null, stuck: [], status: "idle" });
      return undefined;
    }

    setState((prev) => ({ ...prev, status: "loading" }));

    const { hours, hourly } = RANGE[range] ?? RANGE["24h"];

    Promise.all(
      MEASURES.map(([key, measure]) =>
        fetchSeries(source, measure, hours, controller.signal)
          .then((res) => ({ key, res }))
          /* ค่าไหนเสาไม่ได้วัดหรือดึงไม่ได้ ก็ข้ามไป ไม่ต้องล้มทั้งกราฟ */
          .catch(() => null),
      ),
    )
      .then((results) => {
        if (controller.signal.aborted) return;

        const points = [];
        for (const item of results) {
          if (!item) continue;
          for (const line of item.res?.["เส้น"] ?? []) {
            /* เอาเฉพาะเส้นของเสาอากาศ — เส้นในเล้าเป็นคนละที่ ไม่ใช่สภาพอากาศ */
            if (line["จุดติดตั้ง"] !== outdoorId) continue;
            for (const p of line["ข้อมูล"] ?? []) {
              points.push({ key: item.key, at: p.t, value: p.v });
            }
          }
        }

        setState({
          series: points.length ? toSeries(points, hourly) : null,
          stuck: [],
          status: "ok",
        });
      })
      .catch((err) => {
        if (err.name === "AbortError" || controller.signal.aborted) return;
        setState({ series: null, stuck: [], status: "error" });
      });

    return () => controller.abort();
  }, [source, range, barnApiId, liveSource]);

  return state;
}
