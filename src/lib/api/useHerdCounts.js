/**
 * จำนวนสุกรจริงของฟาร์มที่มีเซนเซอร์/บันทึกอยู่ในระบบ (T1.321)
 *
 * ★ หลังบ้านส่ง**ยอดดิบแยกชนิด** (`GET /api/farms/:id/herd`) แล้วที่นี่เอามาเข้ากติกา
 *   `herdFromLogs` ตัวเดียวกับที่ทุกที่ใช้ — เพราะกติกานั้นแยก "ยังไม่รู้" ออกจาก "ศูนย์"
 *   ซึ่ง SQL ตอบแทนให้ไม่ได้ (เหตุผลเต็มอยู่ใน lib/herdCount.js)
 */
import { useEffect, useState } from "react";
import { apiConfigured, apiGet } from "./client.js";
import { herdFromLogs, herdTotal } from "../herdCount.js";

const EMPTY = { status: "idle", farms: [], total: null, error: null };

/**
 * @param {Array<{id: string, apiId: string, name: string}>} liveFarms ฟาร์มที่มีแถวอยู่ในฐาน
 */
export function useHerdCounts(liveFarms) {
  const [state, setState] = useState(EMPTY);
  /* ★ เทียบด้วยคีย์ที่เป็นสตริง ไม่ใช่ตัวอาร์เรย์ — อาร์เรย์เป็นของใหม่ทุกรอบ render
     ถ้าใส่ลงใน deps ตรง ๆ จะยิง API วนไม่หยุด (เคยพลาดแบบนี้มาแล้วตอน T1.313) */
  const key = (liveFarms ?? []).map((f) => f.apiId).filter(Boolean).sort().join(",");

  useEffect(() => {
    if (!apiConfigured || !key) {
      setState(EMPTY);
      return undefined;
    }
    const list = (liveFarms ?? []).filter((f) => f.apiId);
    const controller = new AbortController();
    /* ★ ดึงซ้ำแล้ว**ห้ามล้างของเดิมทิ้ง** (T1.333)
       หน้าแม่ดึงใหม่ทุก 30 วินาที ถ้าล้างทุกรอบ ตัวเลขจะถอยไปใช้ข้อมูลตัวอย่าง
       ชั่วขณะแล้วเด้งกลับ — ผู้ใช้เห็นเป็น "เดี๋ยวขึ้นเดี๋ยวไม่ขึ้น" เหมือนบั๊ก
       หลักเดียวกับ T1.314: ของจริงต้องไม่หายจากจอเพราะกำลังโหลดหรือต่อไม่ได้ */
    setState((prev) => ({ ...prev, status: "loading", error: null }));

    Promise.allSettled(
      list.map((f) =>
        apiGet(`/farms/${f.apiId}/herd`, { signal: controller.signal }).then((r) => ({ farm: f, rows: r.barns ?? [] })),
      ),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
      if (ok.length === 0) {
        const why = results[0]?.reason?.message ?? "ดึงข้อมูลไม่สำเร็จ";
        /* ล้มแล้วก็ยังโชว์ของที่อ่านได้ล่าสุด ไม่ปล่อยให้จอว่าง (เหตุผลเดียวกับข้างบน) */
        setState((prev) => ({ ...prev, status: "error", error: why }));
        return;
      }
      const farms = ok.map(({ farm, rows }) => {
        const byBarn = {};
        for (const r of rows) {
          byBarn[r.barn_code] = herdFromLogs([
            { type: "moveIn", amount: r.move_in, unit: "ตัว" },
            { type: "moveOut", amount: r.move_out, unit: "ตัว" },
            { type: "dead", amount: r.dead, unit: "ตัว" },
            { type: "missing", amount: r.missing, unit: "ตัว" },
          ].filter((e) => Number(e.amount) > 0));
          /* ★ ไม่มีบันทึกเลยต้องเป็น "no-logs" ไม่ใช่ "no-opening" — คนละสาเหตุ คนละคำแนะนำ */
          if (r.entries === 0) byBarn[r.barn_code] = herdFromLogs([]);
        }
        return { farm, byBarn, ...herdTotal(byBarn) };
      });
      const all = Object.fromEntries(
        farms.flatMap((f) => Object.entries(f.byBarn).map(([code, v]) => [`${f.farm.id}-${code}`, v])),
      );
      setState({ status: "ready", farms, total: herdTotal(all), error: null });
    });

    return () => controller.abort();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [key]);

  return state;
}
