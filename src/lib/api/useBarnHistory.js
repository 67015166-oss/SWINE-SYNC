/**
 * ข้อมูลย้อนหลังและผังเซนเซอร์ของโรงเรือน "ที่ต่อเซนเซอร์จริง" — ดึงจากหลังบ้าน
 *
 * **ปัญหาที่แก้** หลังบ้านมีข้อมูลจริงเก็บไว้เป็นแสนแถวและเปิดเส้นทางให้เรียกไว้แล้ว
 * แต่หน้าเว็บไม่เคยเรียกเลย ยังอ่าน mock อยู่ ฟาร์มจริงจึงขึ้นว่า
 * "เซนเซอร์ของโรงเรือนนี้ไม่ส่งค่า — ยังไม่มีข้อมูลย้อนหลัง" ทั้งที่ข้อมูลมีเต็ม
 *
 * ใช้กับโรงเรือนที่มี `apiId` เท่านั้น (ฟาร์มตัวอย่างไม่มี จึงยังใช้ mock ต่อไปตามเดิม)
 *
 * รูปผลลัพธ์ **เหมือน getBarnTrend()/getBarnDaily() ของ mock ทุกฟิลด์** เพื่อให้
 * โค้ดวาดกราฟชุดเดิมใช้ได้เลยโดยไม่ต้องรู้ว่าข้อมูลมาจากไหน
 */
import { useEffect, useState } from "react";
import { fetchSeries, fetchSummary, plotnexusReady, PIG_SOURCE } from "./plotnexus.js";
import { FARM_MAP } from "./plotnexusFarms.js";
import { apiGet } from "./client.js";
import { useLiveFarms } from "./useLiveFarms.js";
/* กติกาสรุปยอดอยู่ในไฟล์ของตัวเอง เพราะเทสต์ต้องเรียกได้โดยไม่ผ่าน import.meta.env */
import { rangeOf, statsFromPoints, toStats } from "./summaryStats.js";
import { seriesAllBelowFloor, stuckLabel, stuckSeriesKeys } from "../sensorHealth.js";
import { sensorMapOf } from "./serverFarms.js";

/**
 * ค่าที่กราฟใช้ → ชื่อที่ PlotNexus เรียก
 * ขอเท่าที่กราฟวาดจริง จะได้ไม่ยิงคำขอเปล่า (หนึ่งค่า = หนึ่งคำขอ)
 */
const METRICS = [
  ["temp_c", "temperature"],
  ["humidity", "humidity"],
  /* ลมในเล้าคือ `airflow` ส่วน `wind_speed` เป็นลมที่เสาอากาศข้างนอก คนละตัวกัน */
  ["wind_ms", "airflow"],
  ["nh3", "nh3"],
  ["co2", "co2"],
];


const round1 = (n) => (n == null ? null : Number(n.toFixed(1)));

/** ป้ายแกน X — รายชั่วโมงใช้ "13:00" · รายวันใช้ "31/8" (เวลาไทยเสมอ) */
function labelOf(iso, hourly) {
  const d = new Date(iso);
  if (hourly) return `${String(d.getHours()).padStart(2, "0")}:00`;
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/**
 * แถวยาวจาก API (หนึ่งแถวต่อหนึ่ง metric ต่อหนึ่งช่วงเวลา) → หนึ่ง object ต่อหนึ่งจุดเวลา
 *
 * **ต้องแยก `outdoor` ออกจากกัน** — เซนเซอร์ในและนอกโรงเรือนผูกกับโรงเรือนหลังเดียวกัน
 * ถ้ารวมกันจะได้ค่าเฉลี่ยที่ไม่ใช่ทั้งข้างในและข้างนอก (ดูเหตุผลเต็มใน
 * server/src/modules/readings/route.js)
 */
function toSeries(points, hourly) {
  const byTime = new Map();
  for (const p of points) {
    const key = p.at;
    if (!byTime.has(key)) {
      byTime.set(key, {
        at: key,
        hour: labelOf(key, hourly),
        tempC: null, humidity: null, wind: null, nh3: null, co2: null,
        tempOut: null, humidityOut: null,
      });
    }
    const row = byTime.get(key);
    const v = round1(Number(p.value));
    if (p.outdoor) {
      if (p.metric === "temp_c") row.tempOut = v;
      if (p.metric === "humidity") row.humidityOut = v;
    } else {
      if (p.metric === "temp_c") row.tempC = v;
      if (p.metric === "humidity") row.humidity = v;
      if (p.metric === "wind_ms") row.wind = v;
      if (p.metric === "nh3") row.nh3 = v;
      if (p.metric === "co2") row.co2 = v;
    }
  }

  /* เรียงตามเวลา แล้วใส่ `t` เป็นลำดับจุด — แกน X ต้องใช้ `t` ไม่ใช่ชื่อชั่วโมง
     เพราะช่วง 48 ชม. มีชื่อชั่วโมงซ้ำกัน จุดที่ชื่อซ้ำจะทับกันจนกราฟหายไปครึ่งหนึ่ง */
  return [...byTime.values()]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((row, i) => ({ ...row, t: i }));
}

/* ตัวแปลงผังเซนเซอร์ถูกลบไปพร้อมกับหลังบ้านเดิม (T1.214)
   PlotNexus บอกแค่ว่าค่ามาจาก "จุดติดตั้ง" ไหน ไม่ได้บอกว่าอยู่โซน A/B/C/D ตรงไหนในเล้า
   จึงเดาผังให้ไม่ได้ — หน้าจอถอยไปใช้ผังตัวอย่างเหมือนฟาร์มที่ไม่มีเซนเซอร์จริง */

/**
 * @param {string|null} apiId  รหัสโรงเรือนฝั่งหลังบ้าน (`barn.apiId`) — null = ฟาร์มตัวอย่าง
 * @param {string} range       "24h" · "7d" · "30d"
 * @param {{map?: boolean}} [options] `map: false` = ไม่ต้องดึงผังเซนเซอร์
 *   (กราฟเส้นเล็กในการ์ดโรงเรือนไม่ได้ใช้ผัง จะได้ไม่ยิงคำขอเปล่าทีละใบ)
 * @returns {{series: Array|null, stats: object|null, sensorMap: object|null,
 *            status: "idle"|"loading"|"ok"|"error"}}
 *          `series`/`stats`/`sensorMap` เป็น null = ยังไม่มีข้อมูลจริง ให้ผู้เรียกใช้ mock ต่อ
 */
export function useBarnHistory(apiId, range = "24h", { map = true } = {}) {
  const [state, setState] = useState({ series: null, stats: null, sensorMap: null, stuck: [], status: "idle" });
  /* แหล่งข้อมูลตัดสินที่ LiveFarmsProvider ที่เดียว — ที่นี่แค่ทำตาม
     ถ้าที่นี่ตัดสินเองด้วย วันหนึ่งค่าปัจจุบันกับกราฟจะมาจากคนละแหล่งโดยไม่มีใครรู้ */
  const { source } = useLiveFarms();

  useEffect(() => {
    if (!apiId) {
      setState({ series: null, stats: null, sensorMap: null, stuck: [], status: "idle" });
      return undefined;
    }

    const controller = new AbortController();
    setState((prev) => ({ ...prev, status: "loading" }));

    const { hourly: rangeHourly, api: apiRange } = rangeOf(range);

    /* ═══ หลังบ้านของเราเอง (T1.303) ═══
       endpoint เดียวได้ครบทุกค่า และส่ง `min`/`max`/`n` ของแต่ละช่วงมาด้วย
       จึงสรุปต่ำสุด/สูงสุด**จริง**ได้ ต่างจาก PlotNexus ที่ต้องยิง /summary แยกอีกคำขอ
       ผังเซนเซอร์ก็มีให้ด้วย (PlotNexus ไม่รู้ว่าเซนเซอร์ตัวไหนอยู่โซนไหนในเล้า) */
    if (source === "server") {
      const metrics = METRICS.map(([m]) => m).join(",");
      Promise.all([
        apiGet(`/barns/${apiId}/readings?range=${apiRange}&metrics=${metrics}`, { signal: controller.signal }),
        map
          ? apiGet(`/barns/${apiId}/sensor-map`, { signal: controller.signal }).catch(() => null)
          : Promise.resolve(null),
      ])
        .then(([res, mapRes]) => {
          if (controller.signal.aborted) return;
          const raw = (res?.points ?? []).filter((p) => p.value != null);

          /* ═══ เส้นที่เซนเซอร์ค้างต้องไม่ถูกวาดเป็นกราฟ (T1.304) ═══
             อันตรายกว่าเซนเซอร์ที่เงียบ เพราะค่าค้างวาดเป็นเส้นสวย ๆ ได้
             คนอ่านเห็นเส้นก็เชื่อว่าวัดจริง (ของจริง: เซนเซอร์นอกอาคารส่ง 27.6 °C
             ซ้ำ 3,525 ครั้งใน 24 ก.ย. 2569 แล้วกลายเป็นเส้นประในกราฟ)
             ตัดทิ้งแล้ว**บอกชื่อเส้นที่ตัด** ให้หน้าจอขึ้นเหตุผลได้ ไม่ใช่หายไปเฉย ๆ */
          const stuck = stuckSeriesKeys(raw);
          const points = stuck.size === 0
            ? raw
            : raw.filter((p) => !stuck.has(`${p.metric}|${p.outdoor ? "out" : "in"}`));

          setState({
            series: points.length ? toSeries(points, rangeHourly) : null,
            stats: statsFromPoints(points),
            /* คำตอบดิบของหลังบ้านคนละรูปกับที่การ์ดผังอ่าน — ต้องแปลงก่อนเสมอ (T1.336) */
            sensorMap: sensorMapOf(mapRes),
            stuck: [...stuck].map(stuckLabel),
            status: "ok",
          });
        })
        .catch((err) => {
          if (err.name === "AbortError" || controller.signal.aborted) return;
          setState({ series: null, stats: null, sensorMap: null, stuck: [], status: "error" });
        });

      return () => controller.abort();
    }

    /* ★ แหล่งสำรองถูกปิดแล้ว (T1.342) — ไม่มีอะไรให้ยิง หยุดตรงนี้เลย
       เดิมไหลต่อไปขอ PlotNexus ซึ่งตอบ 403 แล้วค่อยขึ้นว่าโหลดกราฟไม่สำเร็จ
       ผลหน้าจอเหมือนกัน แต่เสียเวลารอรอบเครือข่ายและปล่อยให้คอนโซลเต็มไปด้วย 403 */
    if (!plotnexusReady) {
      setState({ series: null, stats: null, sensorMap: null, stuck: [], status: "error" });
      return () => controller.abort();
    }

    const { hours, hourly } = rangeOf(range);
    /* จุดติดตั้งที่นับว่าเป็น "นอกอาคาร" ของชุดข้อมูลนี้ — เส้นที่มาจากจุดนั้นคือค่าภายนอก */
    const outdoorId = FARM_MAP[PIG_SOURCE]?.outdoor;

    Promise.all([
      ...METRICS.map(([metric, measure]) =>
        fetchSeries(PIG_SOURCE, measure, hours, controller.signal)
          .then((res) => ({ metric, res }))
          /* ค่าไหนไม่มีข้อมูลก็ข้ามไป ไม่ต้องล้มทั้งกราฟ */
          .catch(() => null),
      ),
      /* สรุปยอดของช่วงเดียวกัน — คำขอเดียวได้ครบทุกค่า และเป็นยอด**จริง**
         ไม่ใช่ยอดของค่าเฉลี่ยรายช่วงที่ /series ส่งมา (ดู toStats) */
      fetchSummary(PIG_SOURCE, hours, controller.signal).catch(() => null),
    ])
      .then((all) => {
        if (controller.signal.aborted) return;
        const results = all.slice(0, METRICS.length);
        const summary = all[METRICS.length];

        /* คลี่ผลลัพธ์เป็นรายการจุดแบนแบบเดียวกับที่หลังบ้านเดิมส่งมา
           แล้วใช้ตัวแปลงเดิมต่อได้เลย (รูปที่กราฟรออยู่ไม่เปลี่ยน) */
        /* ═══ เซนเซอร์ก๊าซที่ไม่ได้วัดแล้วส่ง 0 มา ต้องไม่กลายเป็นเส้นกราฟ ═══
           กติกาเดียวกับค่าปัจจุบัน (T1.220) แต่ต้องกรองซ้ำที่นี่ด้วย เพราะกราฟดึง
           /series ตรงจาก PlotNexus ไม่ได้ผ่าน plotnexusFarms.js ที่กรองไว้แล้ว
           ผลคือหัวกราฟขึ้น "— ppm" (ค่าปัจจุบันถูกกรองแล้ว) แต่ในกราฟกลับมีเส้นแบนที่ 0
           = การ์ดใบเดียวกันบอกสองอย่างขัดกัน คนอ่านไม่รู้จะเชื่ออันไหน
           ตัดจุดทิ้งทั้งชุด แล้ว TrendChart จะขึ้นกล่อง "ไม่มีค่าในช่วงนี้" ซึ่งเป็นความจริง */
        const co2Values = [];
        for (const item of results) {
          if (item?.metric !== "co2") continue;
          for (const line of item.res?.["เส้น"] ?? []) {
            for (const p of line["ข้อมูล"] ?? []) co2Values.push(p.v);
          }
        }
        const gasSuspect = seriesAllBelowFloor("co2", co2Values);

        const points = [];
        for (const item of results) {
          if (!item) continue;
          /* NH₃ มาจากอุปกรณ์ตัวเดียวกับ CO₂ จึงเชื่อไม่ได้พร้อมกัน (ดู lib/sensorHealth.js) */
          if (gasSuspect && (item.metric === "co2" || item.metric === "nh3")) continue;
          for (const line of item.res?.["เส้น"] ?? []) {
            const outdoor = line["จุดติดตั้ง"] === outdoorId;
            /* เส้นนอกอาคารมีแค่อุณหภูมิกับความชื้นที่กราฟใช้ ตัวอื่นข้ามไป */
            if (outdoor && item.metric !== "temp_c" && item.metric !== "humidity") continue;
            for (const p of line["ข้อมูล"] ?? []) {
              points.push({ metric: item.metric, at: p.t, value: p.v, outdoor });
            }
          }
        }

        setState({
          series: points.length ? toSeries(points, hourly) : null,
          /* สรุปล้มเหลวไม่ทำให้กราฟล้ม — ได้ null แล้วหน้าจอถอยไปคิดจาก series เหมือนเดิม */
          stats: toStats(summary, apiId),
          /* PlotNexus ไม่มีผังเซนเซอร์ให้ (ไม่รู้ว่าตัวไหนอยู่โซนไหนในเล้า)
             — ปล่อย null ให้หน้าจอถอยไปใช้ผังตัวอย่างเหมือนเดิม */
          sensorMap: null,
          stuck: [],
          status: "ok",
        });
      })
      .catch((err) => {
        if (err.name === "AbortError" || controller.signal.aborted) return;
        setState({ series: null, stats: null, sensorMap: null, stuck: [], status: "error" });
      });

    return () => controller.abort();
  }, [apiId, range, map, source]);

  return state;
}
