/**
 * ส่งคำสั่งอุปกรณ์ไปหลังบ้าน (T1.284) — /api/control/:barnKey
 *
 * ★ สิ่งที่ไฟล์นี้ต้องไม่ทำ: ทำให้คนกดเข้าใจว่าคำสั่งถึงตู้ควบคุมแล้ว
 *   วันนี้หลังบ้านยัง **เก็บคำสั่งไว้ในคิว ไม่ส่งออก** เพราะยังไม่มีสิทธิ์เขียนเข้าระบบของอีกฝ่าย
 *   (เหตุผลเต็มอยู่ใน server/src/control/transport.js) คำตอบจึงมีธง `held` ติดมาด้วย
 *   และหน้าจอต้องเอาไปบอกคนกดตรง ๆ ไม่ใช่โชว์ว่าสำเร็จเฉย ๆ
 *
 * ด่านความปลอดภัยที่หลังบ้านตอบกลับมี **สองแบบที่ต่างกันมาก** — แยกให้ออกด้วย
 * `details.needsConfirm` ไม่ใช่ดูแค่ว่าเป็น error
 *   needsConfirm: true   ถามกลับ — ยืนยันแล้วส่งซ้ำได้
 *   needsConfirm: false  ห้าม — ส่งซ้ำกี่ครั้งก็ไม่ผ่าน และไม่ควรมีปุ่มให้ลองอีก
 */
import { useCallback, useState } from "react";
import { ApiError, apiConfigured, apiGet, apiPost } from "./client.js";
import { MANUAL_FAN, fanRunning } from "../equipment.js";
import { statusShort, statusText } from "./controlText.js";

export { statusShort, statusText };

/** ส่งคำสั่งผ่านหลังบ้านได้ไหม — สำเนาที่วางบนโฮสต์คนอื่น (build:host) ทำไม่ได้ */
export const controlReady = apiConfigured;

const path = (barnKey, tail) => `/control/${encodeURIComponent(barnKey)}/${tail}`;

/** สถานะปัจจุบันที่ด่านความปลอดภัยใช้ตัดสิน + ทะเบียนอุปกรณ์ */
export const fetchControlState = (barnKey, signal) => apiGet(path(barnKey, "state"), { signal });

/** ประวัติคำสั่ง รวมที่ถูกปฏิเสธ */
export const fetchControlHistory = (barnKey, signal) =>
  apiGet(path(barnKey, "commands"), { signal });

/**
 * "กดปุ่มพัดลมตัวที่ i" แปลเป็นคำสั่งอะไร
 * กติกาเปิด/ปิดยืมจาก lib/equipment.js ตัวเดียวกับที่หน้าจอใช้ — ห้ามคิดใหม่ที่นี่
 */
export function fanCommand(equipment, index) {
  const fan = equipment.fans[index];
  if (!fan) return null;
  return fanRunning(fan)
    ? { deviceKind: "fan", deviceId: fan.id, action: "off" }
    : { deviceKind: "fan", deviceId: fan.id, action: "on", hz: MANUAL_FAN.hz };
}

/** "กดปุ่มปั๊มตัวที่ i" แปลเป็นคำสั่งอะไร */
export function pumpCommand(equipment, index) {
  const pump = equipment.pumps[index];
  if (!pump) return null;
  return { deviceKind: "pump", deviceId: pump.id, action: pump.running ? "off" : "on" };
}

let seq = 0;
const newClientId = () => `C-${Date.now()}-${(seq += 1)}`;

/**
 * ตัวช่วยของหน้าจอ — จัดการวงจร "ส่ง → ถูกถามกลับ → ยืนยัน → ส่งซ้ำ" ให้ครบ
 *
 * @param {string} barnKey รหัสโรงเรือนแบบหน้าเว็บ ("F-KPP-A1")
 * @returns {{send, confirm, cancel, asking, busy, result, error, clear}}
 *   asking = { message, command } เมื่อหลังบ้านถามกลับ · result = คำสั่งที่เพิ่งผ่าน
 */
export function useEquipmentCommand(barnKey) {
  const [asking, setAsking] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const clear = useCallback(() => {
    setAsking(null);
    setResult(null);
    setError(null);
  }, []);

  /* clientId ผูกกับ "การกดหนึ่งครั้ง" — ตอนยืนยันต่อท้าย -c ให้เป็นคำสั่งใหม่
     ถ้าใช้ id เดิม แถวที่ถูกปฏิเสธไปแล้วจะกันแถวที่ยืนยันไม่ให้เข้า (unique barn_key,client_id) */
  const post = useCallback(
    async (command, clientId, confirmed) => {
      setBusy(true);
      setError(null);
      try {
        const data = await apiPost(path(barnKey, "command"), { ...command, clientId, confirmed });
        setAsking(null);
        /* `entry` = แถวที่บันทึกลงฐาน (มี status จริง) · `command` = สิ่งที่เรากดขอไป
           ห้ามยุบสองอย่างนี้เป็นคีย์ชื่อเดียวกัน เดี๋ยวตัวหนึ่งทับตัวหนึ่งเงียบ ๆ */
        setResult({ entry: data.command ?? null, held: Boolean(data.held), detail: data.detail, command });
        return { ok: true, held: data.held };
      } catch (err) {
        if (err instanceof ApiError && err.details?.needsConfirm) {
          setAsking({ message: err.message, command, clientId });
          return { ok: false, asked: true };
        }
        setError(err instanceof ApiError ? err : new Error("ส่งคำสั่งไม่สำเร็จ"));
        return { ok: false };
      } finally {
        setBusy(false);
      }
    },
    [barnKey],
  );

  const send = useCallback(
    (command) => (command ? post(command, newClientId(), false) : Promise.resolve({ ok: false })),
    [post],
  );

  const confirm = useCallback(() => {
    if (!asking) return Promise.resolve({ ok: false });
    return post(asking.command, `${asking.clientId}-c`, true);
  }, [asking, post]);

  const cancel = useCallback(() => setAsking(null), []);

  return { send, confirm, cancel, asking, busy, result, error, clear };
}
