/**
 * กล่องขาออกของคำสั่งอุปกรณ์ (T1.310) — กติกาล้วน ไม่แตะฐาน ไม่แตะเครือข่าย
 *
 * ═══ ทำไมคำสั่งถึงเดินทางแบบนี้ ═══
 * API ที่รับคำสั่งรันอยู่ใน**กล่อง** ส่วน Node-RED ที่คุยกับตู้ควบคุมได้อยู่บน**เครื่องผู้พัฒนา**
 * และ **กล่องต่อมาหาเครื่องผู้พัฒนาไม่ได้** (tailscaled ในกล่องเป็น userspace-networking
 * จึงต่อออกไปหา 100.x ไม่ได้ — เรื่องเดียวกับที่ทำให้กล่องอ่าน InfluxDB บนเครื่องผู้พัฒนาไม่ได้)
 * ส่วนทิศทางเครื่องผู้พัฒนา → กล่อง ใช้ได้ปกติ
 *
 * ทางที่เหลือจึงมีสองแบบ และเลือกแบบนี้ (ผู้ใช้ตัดสิน 5 ต.ค. 2569)
 *
 *   **Node-RED เป็นฝ่ายมาดึง** — บนเครื่องผู้พัฒนาถามกล่องเป็นระยะว่ามีคำสั่งค้างไหม
 *   แล้ว Node-RED เป็นคน publish ไป PLC เอง
 *
 * ★ ข้อดีที่ทำให้เลือกทางนี้
 *   1. **คำสั่งไม่ต้องวิ่งผ่าน broker สาธารณะ** — ถ้าให้กล่อง publish ขึ้น broker ฟรี
 *      ใครก็ publish ข้อความปลอมเข้า topic เดียวกันได้ แล้ว Node-RED จะส่งต่อให้ PLC
 *   2. **Node-RED ถือ credential ของฟาร์มอยู่แล้ว** ไม่ต้องเอารหัสมาไว้อีกที่
 *   3. ไม่ต้องเพิ่ม dependency ฝั่งเรา
 *
 * ★ ข้อเสียที่ยอมรับ: คำสั่งมาถึงช้าเท่ากับจังหวะที่ Node-RED มาถาม (ตั้งไว้ 5 วินาที)
 *   **ไม่เหมาะกับการสั่งหยุดฉุกเฉิน** — ของแบบนั้นต้องมีสวิตช์จริงที่หน้างาน ไม่ใช่ผ่านเว็บ
 */

/** คำสั่งที่รออยู่ในกล่องขาออกมีสถานะนี้ คู่กับ `transport = "outbox"` */
export const OUTBOX_STATUS = "held";
export const OUTBOX_TRANSPORT = "outbox";

/** ดึงได้มากสุดกี่รายการต่อครั้ง — กันไม่ให้ Node-RED ขอทีเดียวหมดจนยิงรัว */
export const MAX_BATCH = 50;

export const clampLimit = (n, max = MAX_BATCH) => {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1) return 10;
  return Math.min(v, max);
};

/**
 * แปลงแถวในฐาน → สิ่งที่ Node-RED ต้องใช้ ไม่มากกว่านั้น
 *
 * ★ **ไม่ส่งชื่อคนสั่งหรือเหตุผลออกไป** — Node-RED ไม่ต้องรู้ และอะไรที่ส่งออกไป
 *   ก็มีโอกาสไปโผล่ใน log ของระบบอื่นที่เราควบคุมไม่ได้
 *
 * `remoteAddr` คือที่อยู่ฝั่ง PLC ที่เจ้าของระบบให้มา (`control_device.remote_addr`)
 * **เป็น null ได้** เพราะในทางนี้ตัวแปลงอยู่ใน Node-RED — ถ้ามีค่าให้ใช้ค่านี้ก่อน
 * ถ้าไม่มี Node-RED ต้องแปลงจาก `deviceId` เอง
 */
export function toOutboxItem(row) {
  if (!row?.id) return null;
  return {
    id: row.id,
    barnKey: row.barn_key,
    deviceKind: row.device_kind,
    deviceId: row.device_id,
    remoteAddr: row.remote_addr ?? null,
    action: row.action,
    hz: row.hz ?? null,
    requestedAt: row.requested_at,
  };
}

/**
 * ตรวจคำตอบที่ Node-RED ส่งกลับมาหลังพยายามส่งให้ PLC
 *
 * ★ `ok: false` **ไม่ใช่ error ของระบบเรา** — เป็นข้อเท็จจริงที่ต้องบันทึก
 *   ("ส่งไม่สำเร็จเพราะ PLC ไม่ตอบ" เป็นข้อมูลที่ต้องตอบได้ภายหลัง)
 *
 * @returns {{ok: true, sent: boolean, detail: string} | {ok: false, message: string}}
 */
export function checkAck(body) {
  if (body == null || typeof body !== "object")
    return { ok: false, message: "ต้องส่ง JSON มาด้วย" };

  if (typeof body.ok !== "boolean")
    return { ok: false, message: "ต้องมีฟิลด์ ok เป็น true หรือ false" };

  const detail = String(body.detail ?? "").trim().slice(0, 300);
  if (!body.ok && detail === "")
    return { ok: false, message: "ส่งไม่สำเร็จต้องบอกเหตุผลมาด้วย (detail)" };

  return {
    ok: true,
    sent: body.ok,
    /* สำเร็จแล้วไม่บอกอะไรก็ได้ — เขียนข้อความกลาง ๆ ให้แทน จะได้ไม่มีช่องว่างในบันทึก */
    detail: detail || (body.ok ? "Node-RED ส่งให้ตู้ควบคุมแล้ว" : ""),
  };
}

/**
 * สถานะที่ควรบันทึกหลังรับคำตอบ
 *
 * ★ `sent` **ไม่ได้แปลว่าตู้ทำตาม** — แปลว่าคำสั่งออกจากมือเราไปแล้วเท่านั้น
 *   การยืนยันว่าพัดลมหมุนจริงต้องรอช่องทางตอบกลับที่ยังไม่มี (สถานะ `confirmed` จึงยังว่าง)
 */
export const ackStatus = (sent) => (sent ? "sent" : "failed");
