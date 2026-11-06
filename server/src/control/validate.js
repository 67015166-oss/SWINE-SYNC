/**
 * รูปของ "คำสั่งหนึ่งคำสั่ง" ที่ส่งไปตู้ควบคุมโรงเรือน (T1.284)
 *
 * ไฟล์นี้ตรวจแค่ว่า **รูปถูกไหม** ไม่ตัดสินว่า **ปลอดภัยไหม** — เรื่องปลอดภัยอยู่ที่ limits.js
 * แยกกันเพราะสองอย่างนี้พังไม่เหมือนกัน: รูปผิดคือคนเขียนโค้ดพลาด (แก้ที่โค้ด)
 * แต่ไม่ปลอดภัยคือคนกดพลาด (ต้องบอกเหตุผลให้คนอ่านรู้เรื่อง แล้วบันทึกไว้ว่าเคยมีคนกด)
 *
 * ยังไม่มีสิทธิ์ส่งเข้าระบบฟาร์มจริง (ดู docs/RUNBOOK.md หัวข้อ "ส่งคำสั่งไปตู้ควบคุม")
 * ฉะนั้นกติกาในไฟล์นี้เป็น **ข้อเสนอของเรา** ที่จะยื่นให้เจ้าของระบบตรวจ ไม่ใช่สเปกที่เขาให้มา
 * วันที่ได้สเปกจริงมา ให้แก้ที่นี่ที่เดียวแล้วเทสต์จะบอกว่าอะไรพังตามไปด้วย
 */

/** ชนิดอุปกรณ์ที่สั่งได้ */
export const DEVICE_KINDS = ["fan", "pump"];

/**
 * สิ่งที่สั่งได้
 *   on    เปิด (พัดลมเปิดพร้อมกำหนดรอบได้ด้วย)
 *   off   ปิด
 *   speed เปลี่ยนรอบพัดลมโดยไม่แตะสถานะเปิด/ปิด
 *   auto  คืนการตัดสินใจให้ตู้ควบคุม — **ทิศทางที่ปลอดภัยที่สุดเสมอ**
 */
export const ACTIONS = ["on", "off", "speed", "auto"];

/** ช่วงรอบพัดลมที่ยอมรับ (Hz) — ต่ำกว่านี้ลมไม่พอ สูงกว่านี้เกินพิกัดมอเตอร์ */
export const FAN_HZ = { min: 20, max: 60 };

/** รหัสอุปกรณ์ต้องเป็นรูปที่หน้าเว็บใช้จริง — "FAN 1"…"FAN 9" หรือ "P1"…"P9" */
const FAN_ID = /^FAN [1-9]$/;
const PUMP_ID = /^P[1-9]$/;

/** คีย์โรงเรือนแบบเดียวกับบันทึกในโรงเรือน (barn_log) — รูปเดียวกันทั้งระบบ */
export const BARN_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

const idOk = (kind, id) => (kind === "fan" ? FAN_ID.test(id) : PUMP_ID.test(id));

/**
 * ตรวจรูปคำสั่ง
 * @returns {{ok: true, value: object} | {ok: false, errors: string[]}}
 */
export function checkCommand(input) {
  const errors = [];
  const body = input && typeof input === "object" ? input : {};

  const kind = typeof body.deviceKind === "string" ? body.deviceKind.trim() : "";
  const id = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  const action = typeof body.action === "string" ? body.action.trim() : "";

  if (!DEVICE_KINDS.includes(kind)) errors.push("deviceKind ต้องเป็น fan หรือ pump");
  if (!ACTIONS.includes(action)) errors.push(`action ต้องเป็นหนึ่งใน ${ACTIONS.join(" · ")}`);
  if (kind && !idOk(kind, id)) errors.push(`deviceId ไม่ใช่รูปของ ${kind} ("${id}")`);

  /* ปั๊มไม่มีรอบให้ปรับ — ถ้าส่ง speed มาคือฝั่งเรียกเข้าใจผิด ไม่ใช่ค่าที่ควรเมินเฉย */
  if (kind === "pump" && action === "speed") errors.push("ปั๊มปรับรอบไม่ได้");

  let hz = null;
  if (kind === "fan" && (action === "on" || action === "speed")) {
    const raw = body.hz;
    if (action === "speed" && raw === undefined) errors.push("action speed ต้องส่ง hz มาด้วย");
    else if (raw !== undefined) {
      hz = Number(raw);
      if (!Number.isFinite(hz)) errors.push("hz ต้องเป็นตัวเลข");
      else if (hz < FAN_HZ.min || hz > FAN_HZ.max)
        errors.push(`hz ต้องอยู่ระหว่าง ${FAN_HZ.min}–${FAN_HZ.max} (ได้ ${hz})`);
      else hz = Math.round(hz);
    }
  } else if (body.hz !== undefined) {
    errors.push("hz ใส่ได้เฉพาะพัดลมตอนสั่ง on หรือ speed");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      deviceKind: kind,
      deviceId: id,
      action,
      hz,
      /* คนกดยืนยันคำสั่งที่กติกาถือว่าอันตรายแล้วหรือยัง (ดู limits.js) */
      confirmed: body.confirmed === true,
      /* id ของฝั่งเรียก — กดซ้ำหรือเน็ตกระตุกแล้วส่งซ้ำ ก็ได้คำสั่งเดียว */
      clientId: typeof body.clientId === "string" ? body.clientId.slice(0, 64) : null,
      reason: typeof body.reason === "string" ? body.reason.slice(0, 200) : "",
    },
  };
}
