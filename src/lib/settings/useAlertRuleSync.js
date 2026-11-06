/**
 * ผูกเกณฑ์ในหน้าตั้งค่าเข้ากับเกณฑ์ที่หลังบ้านใช้ตัดสินแจ้งเตือนจริง
 *
 * **ปัญหาที่แก้**: เกณฑ์มีอยู่สองที่ — `settings.comfort` ในเครื่อง (ใช้กับฟาร์มตัวอย่าง)
 * กับตาราง `alert_rule` ที่หลังบ้าน (ใช้กับฟาร์มที่ต่อเซนเซอร์จริง)
 * ตอนแรกตั้งให้ตรงกันไว้ แต่พอผู้ใช้แก้ในหน้าตั้งค่า สองฝั่งจะเริ่มเพี้ยนกันทันที
 * แล้วโรงเรือนจริงกับโรงเรือนตัวอย่างจะถูกตัดสินด้วยคนละเกณฑ์โดยไม่มีใครรู้
 *
 * **ทิศทางของความจริง**: หลังบ้านเป็นตัวจริง เพราะเกณฑ์ระดับระบบเป็นของที่
 * "ทุกคนในเครือใช้ร่วมกัน" ไม่ใช่ความชอบส่วนตัวของเครื่องใดเครื่องหนึ่ง
 *   · เปิดแอป  → ดึงเกณฑ์จากหลังบ้านมาทับค่าในเครื่อง (ทุกเครื่องจึงเห็นตรงกัน)
 *   · แก้ค่า   → ส่งขึ้นไปที่หลังบ้าน แล้วทุกเครื่องจะได้ค่าใหม่ในรอบถัดไป
 *
 * **ทำไมต้องกันวน**: ตอนดึงลงมาทับ ค่าในเครื่องเปลี่ยน → effect เห็นว่าเปลี่ยน →
 * ส่งกลับขึ้นไปอีก กลายเป็นวนไปมา จึงมี `adopting` กันรอบที่เกิดจากการดึงลงมาไว้
 *
 * ต่อหลังบ้านไม่ได้ = ใช้ค่าในเครื่องต่อไปเงียบ ๆ ไม่ขึ้น error ให้ผู้ใช้ตกใจ
 * (ฟาร์มตัวอย่างยังทำงานได้ปกติ ส่วนฟาร์มจริงก็หายไปจากรายการอยู่แล้วตอนหลังบ้านล่ม)
 */
import { useEffect, useRef } from "react";
import { apiGet, apiPut } from "../api/client.js";

/** แปลงแถว alert_rule ที่หลังบ้านส่งมา ให้เป็นรูปเดียวกับ settings.comfort */
function toComfort(rules) {
  const byMetric = new Map(
    rules.filter((r) => r.scope === "global").map((r) => [r.metric, r]),
  );
  const temp = byMetric.get("temp_c");
  const humidity = byMetric.get("humidity");
  const nh3 = byMetric.get("nh3");
  if (!temp || !humidity || !nh3) return null;

  return {
    tempMin: temp.threshold_min,
    tempMax: temp.threshold_max,
    humidityMin: humidity.threshold_min,
    humidityMax: humidity.threshold_max,
    nh3Limit: nh3.threshold_max,
  };
}

const same = (a, b) =>
  a &&
  b &&
  ["tempMin", "tempMax", "humidityMin", "humidityMax", "nh3Limit"].every(
    (k) => Number(a[k]) === Number(b[k]),
  );

/**
 * @param {object}   comfort  settings.comfort ปัจจุบัน
 * @param {function} setAll   ตัวเขียนค่ากลับเข้า settings (รับ object ของ comfort)
 * @param {boolean}  canWrite ผู้ใช้มีสิทธิ์ตั้งค่าระดับระบบไหม
 * @param {string}   userId   คนที่เข้าระบบอยู่ ("" = ยังไม่เข้า) — หลังบ้านให้อ่านเกณฑ์เฉพาะคนที่ล็อกอิน
 */
export function useAlertRuleSync(comfort, setAll, canWrite, userId) {
  /* รอบที่เกิดจากการดึงค่าลงมาทับ — ห้ามส่งกลับขึ้นไป ไม่งั้นวนไม่จบ */
  const adopting = useRef(false);
  /* ค่าที่ส่งขึ้นไปแล้ว — กันส่งซ้ำเมื่อ effect ทำงานด้วยเหตุอื่น */
  const pushed = useRef(null);
  /* โหลดค่าจากหลังบ้านเสร็จหรือยัง (สำเร็จหรือล้มก็นับว่าเสร็จ)
     **ห้ามส่งค่าขึ้นไปก่อนตัวนี้เป็น true** — ไม่งั้นตอนเปิดแอป ค่าในเครื่องจะถูกส่งขึ้นไป
     ทับของหลังบ้านก่อนที่จะรู้ด้วยซ้ำว่าหลังบ้านตั้งไว้เท่าไร (เครื่องที่เปิดทีหลังชนะเสมอ) */
  const ready = useRef(false);
  /* อ่านค่าล่าสุดโดยไม่ต้องผูก effect ตอน mount เข้ากับ comfort */
  const comfortRef = useRef(comfort);
  comfortRef.current = comfort;

  /* ---------- 1. เปิดแอปครั้งแรก: เอาของหลังบ้านมาเป็นตัวตั้ง ----------
     **ห้ามใช้ AbortController + ref กันรันซ้ำคู่กันที่นี่** — ตอน dev React เรียก effect
     สองรอบ (StrictMode) รอบแรกยิงแล้วถูก cleanup ยกเลิก ส่วนรอบสองโดน ref กันไว้
     ผลคือไม่มีคำขอไหนสำเร็จเลย ค่าจากหลังบ้านจึงไม่เคยถูกดึงมาใช้
     ใช้ธง `alive` แทน — ยิงซ้ำได้ไม่เสียหาย (GET ไม่เปลี่ยนอะไร) แค่ไม่เขียนค่าหลังถูกถอด */
  useEffect(() => {
    /* ยังไม่เข้าระบบ = หลังบ้านตอบ 401 แน่ ๆ ไม่ต้องยิง (T1.242)
       **ต้องดึงใหม่ทุกครั้งที่ userId เปลี่ยน** — เดิมดึงครั้งเดียวตอน mount ซึ่งเกิดที่หน้าเข้าสู่ระบบ
       ถ้าไม่ผูกกับ userId คนที่เพิ่งล็อกอินจะไม่เคยได้เกณฑ์ของหลังบ้านจนกว่าจะรีเฟรชหน้า */
    if (!userId) return undefined;
    let alive = true;
    ready.current = false;

    apiGet("/alerts/rules")
      .then(({ rules }) => {
        if (!alive) return;
        const server = toComfort(rules ?? []);
        if (!server) return;
        ready.current = true;
        pushed.current = server;
        if (same(server, comfortRef.current)) return;
        adopting.current = true;
        setAll(server);
      })
      .catch(() => {
        /* หลังบ้านล่มหรือยังไม่ได้เปิด — ใช้ค่าในเครื่องต่อไป
           ไม่ปลด ready เพื่อไม่ให้ส่งค่าขึ้นไปทับตอนที่ยังไม่รู้ว่าหลังบ้านมีอะไรอยู่ */
      });

    return () => {
      alive = false;
    };
    /* รันตอนมีคนเข้าระบบ/สลับบัญชีเท่านั้น — อ่าน comfort ผ่าน ref จะได้ไม่ต้องผูกเป็น dependency */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /* ---------- 2. ผู้ใช้แก้ค่า: ส่งขึ้นไปให้หลังบ้าน ---------- */
  useEffect(() => {
    if (adopting.current) {
      adopting.current = false;
      return undefined;
    }
    if (!ready.current) return undefined;
    if (!canWrite || !comfort) return undefined;
    if (same(pushed.current, comfort)) return undefined;

    /* หน่วงไว้ก่อน — ปุ่ม +/- ในหน้าตั้งค่ากดรัวได้ ไม่ต้องยิงทุกครั้งที่ขยับหนึ่งขั้น */
    const timer = setTimeout(() => {
      pushed.current = comfort;
      apiPut("/alerts/rules", comfort).catch(() => {
        /* ส่งไม่สำเร็จ (ค่านอกขอบเขต / หลังบ้านล่ม) — ให้ลองใหม่ได้ในรอบหน้า */
        pushed.current = null;
      });
    }, 800);

    return () => clearTimeout(timer);
  }, [comfort, canWrite]);
}
