/**
 * ตั้งค่าว่ากิจกรรมหมวดไหนให้ส่งเข้าไลน์ (T1.359)
 *
 * ═══ ★★ ทำไมเก็บในฐาน ไม่ใช่ในเครื่องผู้ใช้ ═══
 * ตัวส่งไลน์เดินอยู่ที่ **สะพานข้อมูลบนเซิร์ฟเวอร์** ไม่ได้เดินในเบราว์เซอร์ของใคร
 * ถ้าเก็บค่าไว้ใน localStorage ของเครื่องที่ติ๊ก ตัวส่งจะไม่มีวันเห็นค่านั้นเลย
 * — ติ๊กแล้วไม่มีอะไรเปลี่ยน และไม่มีอะไรฟ้องว่าทำไม
 *
 * เก็บใน `system_setting.settings` ซึ่งเป็นค่าระดับบริษัท **มีผลกับทุกคน**
 * (เหมือนเกณฑ์แจ้งเตือน ไม่ใช่ค่าหน้าจอส่วนตัว) หน้าจอจึงต้องบอกข้อนี้ให้ชัด
 *
 * ★ "ในแอปเห็นเสมอ" ไม่ขึ้นกับค่านี้ — ค่านี้คุมเฉพาะว่าจะ**ส่งออกไลน์**หรือไม่
 *   เพราะโควตาไลน์มีจำกัด แต่การดูย้อนหลังในเว็บไม่เสียอะไร
 */
import { query } from "../db/pool.js";
import { ACTIVITY_KIND_IDS, isActivityKind } from "./kinds.js";

/**
 * ค่าตั้งต้น — **เปิดทุกหมวด** ตามที่ผู้ใช้สั่ง (2 พ.ย. 2569)
 * ตัวกันโควตาไม่ได้อยู่ที่การปิดหมวด แต่อยู่ที่การรวบเป็นใบเดียวและเว้นช่วง (ดู notifier)
 */
export const DEFAULT_LINE_KINDS = [...ACTIVITY_KIND_IDS];

/** อย่างน้อยกี่นาทีถึงจะส่งใบถัดไป — กันวันที่มีคนจัดฟาร์มรัว ๆ กินโควตาทั้งเดือน */
export const ACTIVITY_EVERY_MIN = 30;

const KEY = "activityLineKinds";

/** หมวดที่ตั้งไว้ว่าให้ส่งเข้าไลน์ — ค่าเสียหายหรือยังไม่เคยตั้ง = ใช้ค่าตั้งต้น */
export async function lineKinds() {
  const { rows } = await query(
    `select settings from system_setting order by updated_at desc limit 1`,
  );
  const raw = rows[0]?.settings?.[KEY];
  if (!Array.isArray(raw)) return DEFAULT_LINE_KINDS;
  /* กรองค่าที่ไม่รู้จักทิ้ง — หมวดที่ถูกถอดออกภายหลังจะได้ไม่ค้างอยู่ในค่าที่บันทึกไว้ */
  return raw.filter(isActivityKind);
}

/**
 * ตั้งค่าใหม่ — เขียนทับเฉพาะคีย์ของเรา ไม่แตะค่าอื่นในก้อนเดียวกัน
 * ★ ใช้ `jsonb_set` ไม่ใช่เขียนทับทั้งก้อน เพราะ `system_setting.settings`
 *   เป็นที่เก็บรวมของการตั้งค่าระดับบริษัททุกเรื่อง
 */
export async function setLineKinds(kinds, userId) {
  const clean = [...new Set((kinds ?? []).filter(isActivityKind))];
  const { rows: co } = await query(`select id from company order by created_at limit 1`);
  if (!co[0]) throw new Error("ยังไม่มีบริษัทในระบบ");
  await query(
    `insert into system_setting (company_id, settings, updated_by, updated_at)
     values ($1, jsonb_build_object($2::text, $3::jsonb), $4, now())
     on conflict (company_id) do update
       set settings = jsonb_set(system_setting.settings, array[$2::text], $3::jsonb, true),
           updated_by = $4,
           updated_at = now()`,
    [co[0].id, KEY, JSON.stringify(clean), userId ?? null],
  );
  return clean;
}
