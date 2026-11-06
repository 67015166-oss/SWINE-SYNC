/**
 * "ทะเบียนอุปกรณ์ + ประวัติคำสั่งจากกล่อง" → ชุดอุปกรณ์ที่การ์ดควบคุมอ่าน (T1.336)
 *
 * ═══ ทำไมต้องมีไฟล์นี้ ═══
 * หน้าระบบควบคุมสภาพแวดล้อมเรียก `getEquipment()` ของข้อมูลตัวอย่างอยู่ **ทุกโรงเรือน**
 * รวมถึงโรงเรือนจริง ซึ่ง `getBarn()` หาไม่เจอ จึงตกไปได้ `idleEquipment()`
 * ผลคือฟาร์มจริงเห็น "ตู้ควบคุมออฟไลน์ · พัดลม 5 ตัวไม่มีสัญญาณ" แล้ว **สวิตช์ถูกล็อกทั้งใบ**
 * ทั้งที่กล่องเปิดเส้นทาง `/api/control/:barnKey/state` ไว้ตั้งแต่ T1.284 และรับคำสั่งได้จริง
 * (`fetchControlState` มีอยู่ในโค้ดหน้าเว็บมาตลอด แต่ไม่มีใครเรียก — อาการเดียวกับ T1.303)
 *
 * ═══ เส้นที่ห้ามข้าม ═══
 * กล่อง **ไม่มีค่ากลับว่าอุปกรณ์เดินอยู่หรือหยุด** ไม่มีรอบ (Hz) ไม่มีกระแส (A)
 * สิ่งที่กล่องรู้จริงมีสามอย่าง
 *   1. มีอุปกรณ์อะไรให้สั่ง (`control_device` · ไม่มีแถวก็ใช้ชุดตั้งต้นของกล่อง)
 *   2. คำสั่งล่าสุดของอุปกรณ์แต่ละตัวและปลายทางของมัน (`control_command`)
 *   3. คำสั่งส่งออกไปถึงตู้จริงได้ไหม (วันนี้ยังไม่ได้ — `canSend: false`)
 *
 * ➜ จึงตั้ง `state: "unknown"` / `running: null` และ `known: false` ไว้
 *   **ห้ามแปลงคำสั่งล่าสุดเป็นสถานะ** เพราะคำสั่งยังค้างในคิว ไม่ได้ไปถึงพัดลม
 *   "สั่งเปิดแล้ว" กับ "พัดลมหมุนอยู่" เป็นสองเรื่องที่วันนี้ยังไม่เท่ากัน
 *   (บทเรียน T1.335 — ทางถอยที่เงียบคือทางถอยที่หลอกคน)
 */

/** สถานะอุปกรณ์ที่แปลว่า "กล่องไม่ได้บอก" — คนละเรื่องกับ "ไม่มีสัญญาณ" */
export const UNKNOWN = "unknown";

/** คำสั่งที่ผ่านด่านแล้ว — ชุดเดียวกับ `statusText()` ใน lib/api/controlText.js
    (`failed`/`rejected` คือไม่ผ่าน) */
const ACCEPTED = new Set(["held", "sent", "confirmed"]);

/**
 * คำสั่งล่าสุดของอุปกรณ์แต่ละตัว — คีย์คือ `"<ชนิด>|<รหัส>"`
 *
 * นับทั้งใบที่ถูกปฏิเสธด้วย เพราะ "เคยสั่งแล้วไม่ผ่าน" เป็นข้อมูลที่คนกดต้องเห็น
 * (ไม่งั้นกดแล้วเงียบ แล้วเข้าใจว่าไม่เคยกด)
 */
export function lastCommandByDevice(commands) {
  const out = {};
  for (const c of commands ?? []) {
    if (!c?.deviceKind || !c?.deviceId) continue;
    const key = `${c.deviceKind}|${c.deviceId}`;
    const at = c.requestedAt ?? null;
    const prev = out[key];
    if (prev && at != null && prev.at != null && String(prev.at) >= String(at)) continue;
    out[key] = {
      action: c.action ?? null,
      status: c.status ?? null,
      /* ★ ต้องพา `transport` ไปด้วย — `held` มีสองความหมายที่ต่างกันมาก (T1.310)
         `hold` = ไม่มีทางส่งเลย · `outbox` = Node-RED กำลังจะมารับไปส่งในไม่กี่วินาที
         ตกช่องนี้เมื่อไร บรรทัดสถานะจะบอกว่า "ค้างในคิว" ทั้งที่คำสั่งกำลังจะถึงตู้ */
      transport: c.transport ?? null,
      accepted: ACCEPTED.has(c.status),
      hz: c.hz ?? null,
      at,
    };
  }
  return out;
}

/**
 * ชุดอุปกรณ์จากกล่อง
 *
 * @param {object|null} state    คำตอบของ `GET /api/control/:barnKey/state`
 * @param {Array} [commands]     คำตอบของ `GET /api/control/:barnKey/commands` (`commands`)
 * @returns {object|null} รูปเดียวกับ `getEquipment()` ของข้อมูลตัวอย่าง + ช่องที่บอกว่า
 *   "ไม่รู้" (`known: false`) และคำสั่งล่าสุดรายตัว (`last`) · null เมื่อกล่องยังไม่ตอบ
 */
export function equipmentFromBox(state, commands) {
  if (!state) return null;
  const last = lastCommandByDevice(commands);
  const list = state.devices ?? [];

  const common = (d) => ({
    duty: d.duty ?? null,
    critical: d.critical === true,
    cooling: d.cooling === true,
    /* แถวที่ปิดไว้ในทะเบียนสั่งไม่ได้ — ล็อกเฉพาะตัวนั้น ไม่ใช่ล็อกทั้งการ์ด */
    enabled: d.enabled !== false,
  });

  const fans = list
    .filter((d) => d.kind === "fan")
    .map((d) => ({
      id: d.device_id,
      state: UNKNOWN,
      hz: null,
      amp: null,
      ...common(d),
      last: last[`fan|${d.device_id}`] ?? null,
    }));

  const pumps = list
    .filter((d) => d.kind === "pump")
    .map((d, i) => ({
      id: d.device_id,
      /* การ์ดเขียน "<ชื่อ> · <หน้าที่>" — กล่องส่งมาแต่รหัส จึงตั้งชื่อให้อ่านออกตามลำดับ */
      name: `PUMP ${i + 1}`,
      running: null,
      amp: null,
      watt: null,
      ...common(d),
      last: last[`pump|${d.device_id}`] ?? null,
    }));

  return {
    /* กล่องบอกว่าโรงเรือนนี้ยังเปิดใช้งานอยู่ไหม — ไม่ใช่ "ตู้ควบคุมต่ออยู่ไหม"
       ค่านี้คือตัวปลดล็อกสวิตช์ ซึ่งถูกต้องแล้ว เพราะด่านความปลอดภัยอยู่ที่กล่อง */
    online: state.online !== false,
    /* กล่องไม่มีโหมด AUTO/MANUAL ให้ — null = ห้ามเขียนโหมดใดลงหน้าจอ */
    auto: null,
    /* ★ ธงเดียวที่การ์ดต้องเชื่อ: รู้สถานะการทำงานของอุปกรณ์ไหม */
    known: false,
    from: "box",
    real: state.real === true,
    canSend: state.canSend === true,
    transport: state.transport ?? null,
    temp: state.temp ?? null,
    tempMax: state.tempMax ?? null,
    fans,
    pumps,
  };
}
