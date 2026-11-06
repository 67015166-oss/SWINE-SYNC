/**
 * ฟาร์มที่มีเซนเซอร์จริงต่ออยู่ — **ดึงจาก PlotNexus Lab** (เปลี่ยนแหล่ง 2 ก.ย. 2569)
 *
 * เดิมดึงจากหลังบ้าน `server/` ที่รันในเครื่อง ผู้ใช้เลือกเปลี่ยนมาใช้ PlotNexus เป็นหลัก
 * เพราะเรียกได้จากทุกที่ — หน้าเว็บที่เอาไปวางบนโฮสต์คนอื่นจึงเห็นค่าจริงด้วย
 * ไม่ใช่เห็นแต่ข้อมูลตัวอย่างเหมือนตอนที่ผูกกับ localhost
 *
 * โค้ดแปลงข้อมูลอยู่ที่ `plotnexusFarms.js` — ไฟล์นี้ทำแค่ "ดึงตามรอบและเก็บสถานะ"
 * (โค้ดแปลงของหลังบ้านเดิมถูกลบทิ้งแล้ว ถ้าต้องการย้อนดูมันอยู่ในประวัติ git ก่อน T1.214)
 *
 * แยกจาก mock ชัดเจน: ฟาร์มจากที่นี่ใช้ `data_source` ที่หลังบ้านบอกมา (`live`/`demo`)
 * **ห้ามตรึงเป็น "live" ตายตัว** — ฐานมีคอลัมน์นี้อยู่แล้วและตั้งเป็น demo ได้
 * ถ้าตรึงไว้ ฟาร์มทดสอบที่เพิ่มเข้าฐานจะถูกติดป้าย "ข้อมูลจริง" ทั้งที่ไม่ใช่
 * แล้ว useAllFarms เป็นคนรวมสองชุดเข้าด้วยกัน (หน้าอื่นไม่ต้องรู้ว่ามาจากไหน)
 *
 * ถ้าหลังบ้านล่ม แอปต้องใช้งานต่อได้เหมือนเดิม — จะได้รายการว่างกับสถานะ "error"
 * ไม่ใช่จอขาว เพราะข้อมูลตัวอย่างยังอยู่ครบและเป็นส่วนใหญ่ของหน้าจอ
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LiveFarmsContext } from "./useLiveFarms.js";
import { fetchLatest, plotnexusReady, PIG_SOURCE } from "./plotnexus.js";
import { toFarmBundle } from "./plotnexusFarms.js";
import { apiConfigured, apiGet } from "./client.js";
import { toFarmBundleFromApi } from "./serverFarms.js";
import { readFarmCache, saveFarmCache } from "./farmCache.js";
import { useAuth } from "../auth/useAuth.js";
import { BAHT_PER_KWH } from "../../data/mock/barnSystems.js";
import { DEFAULT_SETTINGS } from "../settings/defaults.js";

/** ดึงค่าใหม่ทุกกี่มิลลิวินาที — เซนเซอร์ส่งทุก ~5 วินาที แต่หน้าจอไม่ต้องไวขนาดนั้น */
const POLL_MS = 30_000;

/**
 * ดึงฟาร์มจริงจาก**หลังบ้านของเราเอง** (T1.303)
 *
 * ★ ค่าไฟขอแยกรายโรงเรือนและ **ยอมให้ล้มทีละหลังได้** (`allSettled`)
 *   มิเตอร์หลังเดียวไม่ตอบ ต้องไม่ทำให้ทั้งฟาร์มหายไปจากหน้าจอ
 */
async function loadFromApi(signal, limits) {
  const { farms = [] } = await apiGet("/farms", { signal });
  if (farms.length === 0) throw new Error("หลังบ้านยังไม่มีฟาร์มจริงในฐาน");

  const lists = await Promise.all(
    farms.map((f) => apiGet(`/farms/${f.id}/barns`, { signal })),
  );

  /* ═══ แจ้งเตือนเอาจากตารางเดียวกับที่ไลน์ใช้ (T1.307) ═══
     เดิมหน้าเว็บคิดแจ้งเตือนเองในเบราว์เซอร์จากค่าปัจจุบัน ส่วนไลน์อ่านจากตาราง `alert`
     = **เครื่องคิดสองตัวที่มีเกณฑ์คนละชุด** หน้าเว็บกับไลน์จึงบอกไม่เหมือนกันได้โดยไม่มีใครรู้
     (ของจริง 3 ต.ค. 2569: ไลน์มีใบ humidity_high ค้างจาก 18 ก.ย. แต่หน้าเว็บไม่มีเลย
      เพราะหน้าเว็บไม่มีความจำ คิดใหม่ทุกรอบจากค่าตอนนี้)
     อ่านจากตารางเดียวกันแล้วสองฝั่งตรงกัน**โดยโครงสร้าง** ไม่ใช่ตรงกันเพราะไปไล่แก้ให้เหมือน */
  const served = await apiGet("/alerts", { signal }).catch(() => null);

  const barnIds = lists.flatMap((l) => (l.barns ?? []).map((b) => b.id));
  const powers = await Promise.allSettled(
    barnIds.map((id) => apiGet(`/barns/${id}/power/latest`, { signal })),
  );
  const powerByBarn = {};
  powers.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value?.reading) powerByBarn[barnIds[i]] = r.value.reading;
  });

  /* ★ จำคำตอบดิบไว้ เผื่อรอบหน้าต่อไม่ได้ (T1.314)
     เก็บ "ดิบ" ไม่ใช่ค่าที่แปลงแล้ว เพราะดิบมีเวลาที่วัดติดมาด้วย
     ตอนหยิบมาใช้ ตัวแปลงจะเห็นว่าเก่าแล้วล้างค่าเป็นขีดกลางให้เอง */
  const raw = { farms, lists, powerByBarn, alerts: served?.alerts ?? null };
  saveFarmCache(raw);
  return toBundles(raw, limits);
}

/** แปลงคำตอบดิบ (จากเน็ตหรือจากที่จำไว้) → รูปที่หน้าจอใช้ */
function toBundles({ farms, lists, powerByBarn, alerts }, limits) {
  const bundles = farms
    .map((f, i) => toFarmBundleFromApi(f, lists[i]?.barns ?? [], limits, {
      powerByBarn,
      rate: BAHT_PER_KWH,
      alerts: alerts ?? undefined,
    }))
    .filter(Boolean);

  return {
    farms: bundles.map((b) => b.farm),
    barnsByFarm: Object.fromEntries(bundles.map((b) => [b.farm.id, b.barns])),
    alerts: bundles.flatMap((b) => b.alerts),
  };
}

export function LiveFarmsProvider({ children }) {
  /* ★ เส้นทางของหลังบ้านเราต้องล็อกอินก่อน (requireAuth) ต่างจาก PlotNexus ที่ใช้แค่กุญแจ
     จึงต้องรอให้มี userId ก่อน แล้วโหลดใหม่เมื่อเพิ่งล็อกอินเสร็จ */
  const { userId } = useAuth();
  const useServer = apiConfigured && Boolean(userId);

  const [state, setState] = useState({
    farms: [],
    barnsByFarm: {},
    /* รายการแจ้งเตือนดิบจากหลังบ้าน — หน้าจอเอาไปประกอบข้อความเองผ่าน lib/api/alertText.js */
    alerts: [],
    status: "loading",
    error: null,
    errorKind: null,
    /* แหล่งที่ใช้จริงในรอบล่าสุด — `useBarnHistory` อ่านค่านี้เพื่อเลือกแหล่งให้ตรงกัน
       **ต้องตัดสินใจที่เดียว** ไม่งั้นค่าปัจจุบันกับกราฟย้อนหลังจะมาจากคนละที่
       แล้วการ์ดใบเดียวกันจะบอกสองอย่างขัดกัน (เคยเจอกับการกรองก๊าซ T1.220) */
    source: null,
    /* ของที่เห็นมาจากความจำตั้งแต่เมื่อไร — null = ของสด (T1.314) */
    cachedAt: null,
  });
  const timer = useRef(null);

  const load = useCallback(async (signal) => {
    /* ═══ หลังบ้านของเราเองมาก่อน (T1.303) ═══
       ข้อมูลชุดเดียวกันอยู่ในฐานเราครบอยู่แล้ว การไปขอจาก PlotNexus เป็นการพึ่งกุญแจ
       ที่เราควบคุมไม่ได้ (ถูกถอนสิทธิ์ 11 ก.ย. 2569 แล้วหน้าจอว่างทั้งแอป)
       **ล้มแล้วไม่ตกไปใช้ PlotNexus เงียบ ๆ** — ถ้าหลังบ้านเราพัง ต้องรู้ว่าพัง
       ไม่ใช่ไปอ่านจากที่อื่นแล้วทำเหมือนไม่มีอะไรเกิดขึ้น */
    if (useServer) {
      try {
        const next = await loadFromApi(signal, DEFAULT_SETTINGS.comfort);
        setState({ ...next, status: "ok", error: null, errorKind: null, source: "server", cachedAt: null });
      } catch (err) {
        if (err.name === "AbortError") return;
        const errorKind = err.status === 401 || err.status === 403 ? "denied" : "unreachable";

        /* ═══ ★ ฟาร์มจริงต้องไม่หายไปจากหน้าจอเพราะต่อไม่ได้ (T1.314) ═══
           ของเดิมเหลือแต่ฟาร์มตัวอย่าง ซึ่งคนอ่านตีความว่า "ไม่มีฟาร์มนี้ในระบบ"
           ความจริงคือ "ฟาร์มยังอยู่ แต่ตอนนี้ติดต่อไม่ได้" — คนละเรื่องกัน
           หยิบของที่จำไว้มาแสดงโครง ส่วนตัวเลขตัวแปลงจะล้างเป็นขีดกลางให้เอง
           เพราะเวลาที่วัดเก่าเกินเกณฑ์ไปแล้ว */
        const cached = readFarmCache();
        if (cached) {
          try {
            const next = toBundles(cached, DEFAULT_SETTINGS.comfort);
            setState({
              ...next,
              status: "error",
              error: err.message,
              errorKind,
              source: "server",
              /* บอกหน้าจอว่าของที่เห็นมาจากความจำ ไม่ใช่ของสด */
              cachedAt: cached.capturedAt,
            });
            return;
          } catch { /* ของที่จำไว้แปลงไม่ได้ — ตกไปทางเดิม */ }
        }

        setState((prev) => ({ ...prev, status: "error", error: err.message, errorKind }));
      }
      return;
    }

    /* ═══ ★ ไม่มีทางถอยไปที่อื่นแล้ว — บอกความจริงแทน (T1.342) ═══
       เดิมตรงนี้ยิงไป PlotNexus ซึ่งถูกถอนสิทธิ์ตั้งแต่ 11 ก.ย. 2569 จึงได้ 403
       ทุกครั้งที่ยังไม่ได้เข้าสู่ระบบ **ติดกันหกสัปดาห์** แล้วค่อยถอยไปใช้ข้อมูลตัวอย่าง
       ผลคือคนอ่านเห็นข้อความว่า "ต่อระบบเซนเซอร์ไม่ได้" ซึ่งชวนให้ไปตรวจเซนเซอร์
       ทั้งที่เรื่องจริงคือ **ยังไม่ได้เข้าสู่ระบบ** เท่านั้นเอง

       แยกสองกรณีให้ชัด เพราะทางแก้คนละเรื่องกันสิ้นเชิง:
         needlogin  มีหลังบ้านอยู่ แค่ยังไม่ได้เข้าสู่ระบบ  → กดเข้าสู่ระบบก็เห็น
         noserver   สำเนานี้ไม่ได้ต่อหลังบ้านเลย (build:host) → ไม่มีอะไรให้เข้า */
    if (!plotnexusReady) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: apiConfigured
          ? "ยังไม่ได้เข้าสู่ระบบ — ข้อมูลจริงอยู่ในระบบกลาง"
          : "สำเนานี้ไม่ได้ต่อกับระบบกลาง",
        errorKind: apiConfigured ? "needlogin" : "noserver",
      }));
      return;
    }
    try {
      const latest = await fetchLatest(PIG_SOURCE, signal);
      /* เกณฑ์ที่ผู้ใช้ตั้งเองอยู่คนละ Provider และ Provider นี้อยู่นอกมัน
         จึงใช้เกณฑ์ตั้งต้นในการ "นับ" แจ้งเตือนไปก่อน แล้วหน้าจอค่อยคิดใหม่ด้วยเกณฑ์จริง
         (ตัวเลขบนการ์ดที่ผู้ใช้เห็นมาจากหน้าจอ ไม่ใช่จากตรงนี้) */
      const bundle = toFarmBundle(PIG_SOURCE, latest, DEFAULT_SETTINGS.comfort);
      if (!bundle) throw new Error("ยังไม่ได้ผูกชุดข้อมูลนี้กับฟาร์มไหน (ดู FARM_MAP)");

      setState({
        farms: [bundle.farm],
        barnsByFarm: { [bundle.farm.id]: bundle.barns },
        alerts: bundle.alerts,
        status: "ok",
        error: null,
        errorKind: null,
        source: "plotnexus",
      });
    } catch (err) {
      if (err.name === "AbortError") return;
      /* ล้มแล้วไม่ล้างของเดิมทิ้ง — ค่าล่าสุดที่เคยได้ยังมีประโยชน์กว่าจอว่าง
         errorKind: "denied" = PlotNexus ตอบว่ากุญแจไม่มีสิทธิ์ (เจอจริง 11 ก.ย. 2569 —
         ป้ายเดิมบอกว่า "ต่อหลังบ้านไม่ได้" ทั้งที่หลังบ้านปกติ) · "unreachable" = อย่างอื่นทั้งหมด */
      const errorKind = err.status === 401 || err.status === 403 ? "denied" : "unreachable";
      setState((prev) => ({ ...prev, status: "error", error: err.message, errorKind }));
    }
  }, [useServer]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    timer.current = setInterval(() => load(controller.signal), POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer.current);
    };
  }, [load]);

  const value = useMemo(
    () => ({ ...state, refresh: () => load() }),
    [state, load],
  );

  return <LiveFarmsContext.Provider value={value}>{children}</LiveFarmsContext.Provider>;
}
