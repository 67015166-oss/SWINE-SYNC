/**
 * กติกา "คำสั่งนี้ปลอดภัยพอจะส่งไหม" (T1.284) — ฟังก์ชันล้วน เทสต์ได้ ไม่แตะฐาน
 *
 * ═══ ข้อจำกัดที่กำหนดรูปของไฟล์นี้ทั้งไฟล์ ═══
 * **เราไม่มีสถานะจริงของอุปกรณ์** ตู้ควบคุมของฟาร์มไม่ได้ส่งกลับมาว่าพัดลมตัวไหนหมุนอยู่
 * ฉะนั้นกติกาแบบ "ห้ามปิดพัดลมตัวสุดท้าย" **บังคับไม่ได้** เพราะเราไม่รู้ว่าเหลือกี่ตัว
 * เขียนไว้ก็ได้แค่หลอกตัวเองว่ากันไว้แล้ว
 *
 * ของที่เรารู้จริงคือ **อุณหภูมิล่าสุดในโรงเรือน** (จาก sensor_reading) กับ
 * **เพดานอุณหภูมิที่ตกลงไว้** (จาก alert_rule) กติกาทุกข้อจึงยืนบนสองค่านี้
 * และถ้าไม่รู้อุณหภูมิ (ไม่มีค่า หรือค่าเก่าเกินไป) ให้ถือว่า **ห้ามลดการระบายความร้อน**
 * — ไม่รู้แล้วปล่อยผ่านคือกันได้เฉพาะตอนที่ไม่ต้องกัน
 *
 * ผลลัพธ์มีสามแบบ ไม่ใช่สองแบบ
 *   ok                     ส่งได้
 *   needsConfirm           ส่งได้ถ้าคนกดยืนยันอีกครั้งโดยรู้เหตุผล (ส่ง confirmed: true กลับมา)
 *   ok:false ไม่มี confirm  ห้ามส่ง ยืนยันก็ไม่ได้ — เป็นพื้นที่ที่เราไม่ยอมให้คนกดพลาด
 */

/** ปิดพัดลมได้เมื่ออุณหภูมิต่ำกว่าเพดานลงมาเกินเท่านี้ (°C) ใกล้กว่านี้ต้องยืนยัน */
export const NEAR_C = 1.5;

/** รอบพัดลมที่ถือว่า "เดินเบา" — สั่งเบาขนาดนี้ตอนอากาศใกล้ร้อนต้องยืนยัน */
export const SLOW_HZ = 30;

/** อุณหภูมิเก่ากว่านี้ถือว่าไม่รู้ค่า (นาที) — ให้ตรงกับ ALERT_SILENT_MINUTES */
export const TEMP_STALE_MINUTES = 15;

/** สั่งโรงเรือนเดียวได้ไม่เกินเท่านี้ต่อนาที — กันมือลั่นและกันสคริปต์วนส่ง */
export const RATE_PER_MINUTE = 10;

const refuse = (code, message) => ({ ok: false, code, message });
const confirm = (code, message) => ({ ok: false, needsConfirm: true, code, message });

/**
 * คำสั่งนี้ทำให้ระบายความร้อนได้น้อยลงหรือเปล่า
 *
 * ตัดสินจากธง `cooling` ของอุปกรณ์ **ไม่ใช่จากชนิด** — ม่านน้ำเป็นปั๊มแต่ทำความเย็น
 * ปิดมันตอนอากาศร้อนอันตรายไม่ต่างจากปิดพัดลม (ดู control/devices.js)
 */
const reducesCooling = (cmd, device) => {
  if (!device?.cooling) return false;
  if (cmd.action === "off") return true;
  return (cmd.action === "on" || cmd.action === "speed") && cmd.hz !== null && cmd.hz < SLOW_HZ;
};

/**
 * @param {object} cmd  ผลจาก checkCommand().value
 * @param {object} ctx  { online, tempC, tempAgeMinutes, tempMax, device, recentCount }
 *                      device = { kind, duty, critical } จากตาราง control_device
 * @returns {{ok: boolean, needsConfirm?: boolean, code?: string, message?: string}}
 */
export function checkSafety(cmd, ctx) {
  const c = ctx ?? {};

  if (c.online === false)
    return refuse("barn_offline", "โรงเรือนนี้ออฟไลน์ ส่งคำสั่งไปก็ไม่ถึงตู้ควบคุม");

  if (c.recentCount > RATE_PER_MINUTE)
    return refuse(
      "too_many",
      `สั่งถี่เกินไป — โรงเรือนนี้รับได้ ${RATE_PER_MINUTE} คำสั่งต่อนาที รออีกครู่แล้วลองใหม่`,
    );

  if (c.device?.enabled === false)
    return refuse("device_disabled", `${cmd.deviceId} ถูกปิดการสั่งงานไว้ในตาราง control_device`);

  /* คืนการตัดสินใจให้ตู้ควบคุม — ทิศทางที่ปลอดภัยที่สุด ผ่านได้เสมอ
     ต้องอยู่ก่อนด่านอุณหภูมิ เพราะตอนไม่รู้อุณหภูมิ "กลับไป auto" คือสิ่งที่ควรทำที่สุด */
  if (cmd.action === "auto") return { ok: true };

  const tempKnown =
    typeof c.tempC === "number" &&
    Number.isFinite(c.tempC) &&
    typeof c.tempAgeMinutes === "number" &&
    c.tempAgeMinutes <= TEMP_STALE_MINUTES;

  if (reducesCooling(cmd, c.device) && !tempKnown)
    return refuse(
      "temp_unknown",
      "ยังไม่รู้อุณหภูมิล่าสุดของโรงเรือนนี้ (ไม่มีค่า หรือค่าเก่าเกิน " +
        `${TEMP_STALE_MINUTES} นาที) จึงไม่ยอมให้ลดการระบายความร้อน — สั่ง auto ได้`,
    );

  const max = typeof c.tempMax === "number" ? c.tempMax : null;

  if (reducesCooling(cmd, c.device) && max !== null) {
    const temp = c.tempC;
    const name = c.device?.duty ? `${cmd.deviceId} (${c.device.duty})` : cmd.deviceId;
    const what = cmd.action === "off" ? `ปิด ${name}` : `ให้ ${name} เดินแค่ ${cmd.hz} Hz`;

    if (temp >= max)
      return refuse(
        "too_hot",
        `ตอนนี้ ${temp} °C ถึงเพดาน ${max} °C แล้ว — ${what} ตอนนี้ไม่ได้ ` +
          "ถ้าต้องหยุดอุปกรณ์จริงให้ปิดที่ตู้ในโรงเรือนพร้อมคนอยู่หน้างาน",
      );

    if (temp >= max - NEAR_C)
      return confirm(
        "near_limit",
        `ตอนนี้ ${temp} °C ห่างเพดาน ${max} °C ไม่ถึง ${NEAR_C} °C — ยืนยันว่าจะ${what} ใช่ไหม`,
      );
  }

  /* ปั๊มที่มีหน้าที่สำคัญต่อชีวิตสัตว์ (น้ำดื่ม) ปิดได้ แต่ต้องรู้ตัวว่าปิดอะไร */
  if (cmd.deviceKind === "pump" && cmd.action === "off" && c.device?.critical)
    return confirm(
      "critical_pump",
      `${cmd.deviceId} ทำหน้าที่ "${c.device.duty || "สำคัญ"}" — ยืนยันว่าจะปิดใช่ไหม`,
    );

  return { ok: true };
}

/**
 * รวมสองด่านให้ผู้เรียกใช้ทีเดียว — ถ้าคนกดยืนยันมาแล้ว ข้อที่ต้องยืนยันจะผ่าน
 * แต่ข้อที่ห้ามเด็ดขาด **ยืนยันแล้วก็ยังไม่ผ่าน** ตรงนี้คือความต่างที่ทั้งไฟล์มีอยู่เพื่อสิ่งนี้
 */
export function gate(cmd, ctx) {
  const r = checkSafety(cmd, ctx);
  if (r.ok) return r;
  if (r.needsConfirm && cmd.confirmed) return { ok: true, confirmedPast: r.code };
  return r;
}
