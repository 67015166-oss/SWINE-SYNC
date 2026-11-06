/**
 * "ตอนนี้ดูฟาร์มไหน โรงเรือนไหน" ของคนในไลน์แต่ละคน (T1.277)
 *
 * ทุกปุ่มบนเมนูตอบตามตัวที่เลือกไว้ ถ้ายังไม่เคยเลือก → **ฟาร์มกำแพงเพชร** ตามที่ผู้ใช้สั่ง
 * (ฟาร์มจริงฟาร์มเดียวที่มีเซนเซอร์ส่งค่าเข้ามา)
 *
 * ═══ ฟาร์มตัวอย่างอยู่แค่ในหน้าเว็บ ไม่มีในฐาน ═══
 * ตัวเลขของฟาร์มนครสวรรค์ถูก "สร้างขึ้นในเบราว์เซอร์" ตอนเปิดหน้า (ดู src/data/mock/)
 * เซิร์ฟเวอร์จึงไม่มีค่าพวกนั้นให้ตอบ และ **ห้ามแต่งตัวเลขขึ้นมาเอง**
 * เลือกฟาร์มตัวอย่างได้ แต่คำตอบจะบอกตรง ๆ ว่าเป็นข้อมูลตัวอย่างและให้ไปดูในเว็บ
 */
import { query } from "../db/pool.js";

/** ใช้เมื่อยังไม่เคยเลือก — ผู้ใช้สั่งไว้ 23 ก.ย. 2569 */
export const DEFAULT_FARM = "F-KPP";

/**
 * ฟาร์มที่มีเฉพาะในหน้าเว็บ — รายการนี้ซ้ำกับ `src/data/mock/farms.js` โดยตั้งใจ
 * (เซิร์ฟเวอร์อ่านไฟล์ของหน้าเว็บไม่ได้) **เพิ่มฟาร์มตัวอย่างใหม่ต้องมาเติมที่นี่ด้วย**
 * ถ้าวันหนึ่งฟาร์มตัวอย่างถูกย้ายเข้าฐานจริง ให้ลบออกจากที่นี่แล้วมันจะมาจากฐานเอง
 */
const DEMO_FARMS = [{ code: "F-NSN", name: "ฟาร์มนครสวรรค์", demo: true }];

/** ฟาร์มทั้งหมดที่ให้เลือกได้ — ของจริงมาก่อน ตัวอย่างต่อท้าย */
export async function listFarms() {
  const { rows } = await query(
    `select code, name, data_source from farm where active order by data_source, name`,
  );
  const live = rows.map((r) => ({ code: r.code, name: r.name, demo: r.data_source !== "live" }));
  const extra = DEMO_FARMS.filter((d) => !live.some((f) => f.code === d.code));
  return [...live, ...extra];
}

/** โรงเรือนของฟาร์มนั้นในฐาน — ฟาร์มตัวอย่างจะได้ลิสต์ว่าง */
export async function listBarns(farmCode) {
  const { rows } = await query(
    `select b.code, b.name from barn b join farm f on f.id = b.farm_id
      where f.code = $1 and b.active order by b.name`,
    [farmCode],
  );
  return rows;
}

/**
 * ฟาร์ม/โรงเรือนที่คนนี้เลือกไว้ พร้อมข้อมูลที่ต้องใช้ตอบ
 * @returns {{farmCode: string, barnCode: string|null, farmName: string, barnName: string|null,
 *            barnId: string|null, demo: boolean, chosen: boolean}}
 */
export async function getScope(lineUserId) {
  const { rows } = await query(
    `select farm_code, barn_code from line_user where line_user_id = $1`,
    [lineUserId ?? ""],
  );
  const chosen = rows.length > 0;
  const farmCode = rows[0]?.farm_code ?? DEFAULT_FARM;
  const barnCode = rows[0]?.barn_code ?? null;

  const { rows: found } = await query(
    `select f.name as farm_name, f.data_source, b.id as barn_id, b.name as barn_name, b.code as barn_code
       from farm f
       left join barn b on b.farm_id = f.id and b.active and ($2::text is null or b.code = $2)
      where f.code = $1
      order by b.name
      limit 1`,
    [farmCode, barnCode],
  );

  if (found.length === 0) {
    /* ไม่มีในฐาน = ฟาร์มตัวอย่าง (หรือฟาร์มที่ถูกลบไปแล้ว) */
    const demoFarm = DEMO_FARMS.find((d) => d.code === farmCode);
    return {
      farmCode, barnCode,
      farmName: demoFarm?.name ?? farmCode,
      barnName: barnCode,
      barnId: null, demo: true, chosen,
    };
  }

  const r = found[0];
  return {
    farmCode,
    barnCode: r.barn_code ?? null,
    farmName: r.farm_name,
    barnName: r.barn_name ?? null,
    barnId: r.barn_id ?? null,
    demo: r.data_source !== "live",
    chosen,
  };
}

/**
 * บันทึกสิ่งที่เลือก — เลือกใหม่ทับของเดิมได้เสมอ
 * ไม่มี `lineUserId` (ข้อความจากกลุ่มที่ปิดสิทธิ์อ่าน userId) = จำให้ไม่ได้ ข้ามไปเงียบ ๆ
 * ไม่ใช่โยน error ให้ทั้งการตอบพัง
 */
export async function setScope(lineUserId, farmCode, barnCode = null) {
  if (!lineUserId) return;
  await query(
    `insert into line_user (line_user_id, farm_code, barn_code, updated_at)
          values ($1, $2, $3, now())
     on conflict (line_user_id)
       do update set farm_code = excluded.farm_code,
                     barn_code = excluded.barn_code,
                     updated_at = now()`,
    [lineUserId, farmCode, barnCode],
  );
}

/** ข้อความสั้น ๆ บอกว่ากำลังดูอะไรอยู่ — ติดไว้หัวการ์ดทุกใบ ผู้ใช้จะได้ไม่สับสนว่าเลขของที่ไหน */
export const scopeLabel = (scope) =>
  `${scope.farmName}${scope.barnName ? ` · ${scope.barnName}` : ""}${scope.demo ? " (ข้อมูลตัวอย่าง)" : ""}`;
