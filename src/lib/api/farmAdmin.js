/**
 * เพิ่ม/แก้/ปิด ฟาร์มกับโรงเรือนที่ **หลังบ้านของเราเอง** (T1.316)
 *
 * ก่อนหน้านี้การจัดการฟาร์มเก็บใน localStorage ของเครื่องเดียว — ผู้ดูแลระบบกรอกฟาร์มใหม่
 * เสร็จแล้วรีเฟรชทีเดียวหายหมด และเครื่องอื่นไม่เคยเห็นเลย ไฟล์นี้คือทางไปฐานจริง
 *
 * ★ **ไม่มีการลบจริง** — `remove*` เรียก DELETE ที่ฝั่งเซิร์ฟเวอร์ตั้ง `active = false`
 *   เพราะค่าเซนเซอร์สี่แสนกว่าแถวผูกอยู่กับโรงเรือนผ่าน foreign key
 *   (เหตุผลเต็มอยู่ใน server/src/modules/farms/route.js)
 */
import { apiDelete, apiPatch, apiPost } from "./client.js";

/**
 * รหัสฟาร์มตั้งต้นสำหรับฟาร์มใหม่
 *
 * ★ **รหัสนี้กลายเป็น id ที่หน้าจอใช้** (ดู serverFarms.js) และไปอยู่ในลิงก์
 *   เลย์เอาต์กระดาน บันทึกของผู้ใช้ และค่าตั้งรายโรงเรือนผูกกับมัน
 *   จึงให้แก้ได้แค่ "ตอนสร้าง" เท่านั้น — เปลี่ยนทีหลังเท่ากับทำของที่ผูกไว้หลุดหมด
 *   ตั้งค่าตั้งต้นให้สุ่มไว้ ผู้ดูแลระบบอยากตั้งเป็น F-NSN เองก็แก้ในช่องได้
 */
export const suggestFarmCode = (now = Date.now()) =>
  `F-${now.toString(36).slice(-4).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

/** รหัสโรงเรือนตั้งต้น — เลี่ยงรหัสที่ฟาร์มนี้มีอยู่แล้ว */
export function suggestBarnCode(existing = []) {
  const used = new Set(existing.map((c) => String(c).toUpperCase()));
  for (const zone of "ABCDEFGH") {
    for (let n = 1; n <= 20; n += 1) {
      const code = `${zone}${n}`;
      if (!used.has(code)) return code;
    }
  }
  return `Z${Date.now() % 1000}`;
}

/* ---------- ฟาร์ม ---------- */

export const createFarm = (body) => apiPost("/farms", body).then((r) => r.farm);
export const patchFarm = (apiId, body) => apiPatch(`/farms/${apiId}`, body).then((r) => r.farm);
export const closeFarm = (apiId) => apiDelete(`/farms/${apiId}`);
export const reopenFarm = (apiId) => apiPost(`/farms/${apiId}/restore`, {});

/* ---------- โรงเรือน (อยู่ใต้ฟาร์มเสมอ เพื่อให้พิสูจน์ความเป็นเจ้าของได้) ---------- */

export const createBarn = (farmApiId, body) =>
  apiPost(`/farms/${farmApiId}/barns`, body).then((r) => r.barn);
export const patchBarn = (farmApiId, barnApiId, body) =>
  apiPatch(`/farms/${farmApiId}/barns/${barnApiId}`, body).then((r) => r.barn);
export const closeBarn = (farmApiId, barnApiId) =>
  apiDelete(`/farms/${farmApiId}/barns/${barnApiId}`);
export const reopenBarn = (farmApiId, barnApiId) =>
  apiPost(`/farms/${farmApiId}/barns/${barnApiId}/restore`, {});

/**
 * แถวจากฐาน → รูปฟาร์มที่หน้าจออ่าน (เฉพาะช่องที่รู้ได้ทันทีหลังสร้าง)
 *
 * ★ id เป็น `code` ไม่ใช่ uuid ให้ตรงกับที่ `serverFarms.js` ทำ ไม่งั้นลิงก์ที่พาไป
 *   หน้าฟาร์มใหม่จะหาฟาร์มไม่เจอ เพราะทั้งแอปค้นด้วย code
 *   ค่าเซนเซอร์กับตัวเลขสรุปยังไม่มี — รอรอบโหลดถัดไปของ LiveFarmsProvider เติมให้
 */
export const toAppFarm = (row) => ({
  id: row.code,
  apiId: row.id,
  name: row.name,
  province: row.province ?? "",
  district: row.district ?? "",
  lat: row.lat == null ? null : Number(row.lat),
  lng: row.lng == null ? null : Number(row.lng),
  dataSource: row.data_source ?? "demo",
  status: "offline",
  pigs: null,
  barnCount: 0,
  alerts: 0,
  tempC: null,
  humidity: null,
  fcr: null,
  pigTypes: [],
  updatedAt: null,
});
