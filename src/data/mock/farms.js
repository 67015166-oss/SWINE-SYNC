/**
 * Mock data: ฟาร์มทั้งหมดในเครือ — ใช้ในหน้า "ภาพรวมทุกฟาร์ม" และแผนที่
 *
 * โครงสร้างนี้คือ "สัญญา" ของข้อมูล เมื่อต่อ API จริงให้แปลงมาเป็นรูปนี้
 * - lat/lng เป็นพิกัดจริงของพื้นที่ฟาร์มในแต่ละจังหวัด (WGS84)
 *   แผนที่ฉายแบบ Web Mercator เพราะฉะนั้นค่าพวกนี้ต้องเป็นองศาทศนิยมเท่านั้น
 * - status: "good" ปกติ | "warning" มีแจ้งเตือนค้าง | "offline" เซนเซอร์ขาดการเชื่อมต่อ
 * - alerts: จำนวนแจ้งเตือนที่ยังไม่ถูกจัดการ (รวมทุกฟาร์ม = ตัวเลขบนกระดิ่ง)
 * - pigTypes: ประเภทสุกรที่เลี้ยงในฟาร์มนั้น ใช้คำเดียวกับ barns[].stage ใน herd.js
 *   ("แม่พันธุ์" | "ลูกสุกร" | "อนุบาล" | "ขุน") — ฟาร์มหนึ่งมีได้หลายประเภท
 *   เพิ่มเข้ามาเพื่อทำตัวกรอง "ประเภทสุกร" ในหน้า /dashboard/farms (เป็นฟิลด์ใหม่ ไม่ได้แก้ของเดิม)
 *
 * **เหลือฟาร์มตัวอย่างแค่ฟาร์มเดียว (นครสวรรค์) ตั้งแต่ 31 ส.ค. 2569**
 * ผู้ใช้สั่งให้ตัดเชียงใหม่ · ลำพูน · ขอนแก่น · ปราจีนบุรี ออก เพราะของจริงมีแค่กำแพงเพชร
 * เก็บนครสวรรค์ไว้ตัวเดียวเพื่อให้ยังมีของเทียบตอนดูหน้าที่เปรียบเทียบหลายฟาร์ม
 * (ถ้าจะเอากลับ ไฟล์เดิมอยู่ในประวัติ git — ทุกอย่างในระบบคำนวณจากอาร์เรย์นี้
 *  เพิ่มก้อนกลับเข้ามาแล้วโรงเรือน แจ้งเตือน และจำนวนสุกรจะขึ้นตามเอง
 *  **แต่ต้องแก้ `groupPopulationTrend` ให้เดือนล่าสุดเท่ากับผลรวม farms[].pigs ด้วย**)
 */
import { shiftDate, shiftMonthsIn } from "./asOf.js";

export const farms = [
  {
    id: "F-NSN",
    name: "ฟาร์มนครสวรรค์",
    province: "นครสวรรค์",
    district: "ตาคลี",
    lat: 15.2604,
    lng: 100.3419,
    status: "good",
    pigs: 11200,
    barnCount: 7,
    alerts: 2,
    tempC: 29.1,
    humidity: 75,
    fcr: 2.57,
    pigTypes: ["ขุน"],
    updatedAt: shiftDate("2026-08-03T10:17:00"),
  }
];

/**
 * จำนวนสุกร "รวมทุกฟาร์ม" ย้อนหลังรายเดือน
 * (คนละชุดกับ populationTrend ใน herd.js ซึ่งเป็นระดับฟาร์มเดียว — อย่าสลับกัน)
 * เดือนล่าสุดต้องเท่ากับผลรวม farms[].pigs
 */
export const groupPopulationTrend = shiftMonthsIn([
  { month: "2026-02", total: 10600 },
  { month: "2026-03", total: 10800 },
  { month: "2026-04", total: 10900 },
  { month: "2026-05", total: 10750 },
  { month: "2026-06", total: 11050 },
  { month: "2026-07", total: 11200 },
]);

/** ป้ายภาษาไทยของสถานะฟาร์ม — ใช้คู่กับ StatusBadge เสมอ (ไอคอน + ข้อความ) */
export const FARM_STATUS_LABEL = {
  good: "ปกติ",
  warning: "เฝ้าระวัง",
  offline: "ออฟไลน์",
};

/** สรุปสถานะรวมของทุกฟาร์ม — คำนวณจาก farms เสมอ ห้าม hardcode ตัวเลข */
export function summarizeFarms(list = farms) {
  /* ★ รวมเฉพาะตัวเลขที่มีจริง (T1.311)
     ฟาร์มที่ออฟไลน์มีค่าเป็น `null` และใน JS `0 + null` ได้ 0
     ของเดิมจึงบวกศูนย์เข้าไป **แต่ยังหารด้วยจำนวนฟาร์มทั้งหมด**
     มีฟาร์มจริงออฟไลน์หนึ่งฟาร์มคู่กับฟาร์มตัวอย่าง 29.1 °C → ได้ค่าเฉลี่ย 14.6 °C
     ซึ่งเป็นอุณหภูมิที่เป็นไปไม่ได้ในเล้าสุกร แต่หน้าจอจะโชว์หน้าตาเฉย ๆ
     (อาการเดียวกับ `Number(null) === 0` ใน T1.295 และ T1.308) */
  /* ★★★ `Number(null)` คือ **0** ไม่ใช่ NaN — `Number.isFinite(Number(n))` อย่างเดียว
     จึงปล่อย null ผ่านมาเป็นศูนย์ ซึ่งคือบั๊กที่เรากำลังแก้พอดี
     ต้องคัด null/undefined/ช่องว่างทิ้งก่อนเสมอ (กับดักเดียวกับ T1.295 · T1.308) */
  const nums = (pick) =>
    list
      .map(pick)
      .filter((n) => n != null && n !== "" && Number.isFinite(Number(n)))
      .map(Number);
  const sum = (pick) => nums(pick).reduce((a, b) => a + b, 0);
  const mean = (pick) => {
    const got = nums(pick);
    /* ★ ไม่มีค่าให้เฉลี่ยเลยต้องเป็น null ไม่ใช่ 0 หรือ NaN
       — `format` คืนขีดกลางให้ ซึ่งอ่านว่า "ไม่รู้" ตรงกับความจริง */
    return got.length === 0 ? null : got.reduce((a, b) => a + b, 0) / got.length;
  };

  return {
    total: list.length,
    good: list.filter((f) => f.status === "good").length,
    warning: list.filter((f) => f.status === "warning").length,
    offline: list.filter((f) => f.status === "offline").length,
    pigs: sum((f) => f.pigs),
    barns: sum((f) => f.barnCount),
    alerts: sum((f) => f.alerts),
    avgTempC: mean((f) => f.tempC),
    avgHumidity: mean((f) => f.humidity),
    /** เวลาอัปเดตล่าสุดในบรรดาทุกฟาร์ม
     *  ★ ต้องคัดค่าว่างออกก่อนเรียง — `[null, "2026-10-05…"].sort()` ให้ null ไปอยู่ท้าย
     *  (เพราะ "null" > "2026" เมื่อเทียบเป็นสตริง) แล้ว `.at(-1)` จะคืน null
     *  ฟาร์มเดียวที่ไม่มีเวลาจึงลบเวลาอัปเดตของทั้งหน้าทิ้ง */
    updatedAt: list
      .map((f) => f.updatedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null,
  };
}
