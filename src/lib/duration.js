/**
 * "นานแค่ไหน" เป็นข้อความที่คนอ่านแล้วเข้าใจทันที (T1.301)
 *
 * ใช้ร่วมกันระหว่างหน้ารายงานส่งเวรกับหน้าแบบจำลองโรงเรือน — เดิมต่างคนต่างเขียน
 * และหน้าแบบจำลองบอกเป็นนาทีดิบ ("เก่า 2,105 นาทีแล้ว") ซึ่งต้องหารในใจก่อนถึงจะรู้ว่านานแค่ไหน
 * เป็นกับดักเดียวกับที่เคยเจอในข้อความแจ้งเตือนทางไลน์ (T1.295) จึงรวมมาไว้ที่เดียว
 *
 * ต้องรับ `t` เข้ามา ไม่เรียก hook เอง — จะได้เรียกจากที่ไหนก็ได้ รวมถึงในเทสต์
 */
import { formatNumber } from "./format.js";

/**
 * @param {(key: string, vars?: object) => string} t ฟังก์ชันแปลภาษา
 * @param {number} minutes จำนวนนาที (ติดลบถือเป็น 0)
 * @returns {string} เช่น "45 นาที" · "3 ชม. 20 นาที" · "1 วัน 11 ชม."
 */
export function durationText(t, minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  /* เกินสองวันบอกเป็นวัน — "130 ชม." ต้องหารในใจก่อนถึงจะรู้ว่านานแค่ไหน */
  if (m >= 48 * 60) {
    const d = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    return h === 0
      ? t("{d} วัน", { d: formatNumber(d) })
      : t("{d} วัน {h} ชม.", { d: formatNumber(d), h: formatNumber(h) });
  }
  const h = Math.floor(m / 60);
  const rest = m % 60;
  /* เกิน 10 ชั่วโมงแล้วนาทีไม่ช่วยอะไร — "35 ชม. 5 นาที" อ่านช้ากว่า "35 ชม." โดยไม่ได้ข้อมูลเพิ่ม */
  if (h >= 10) return t("{h} ชม.", { h: formatNumber(h) });
  if (h === 0) return t("{m} นาที", { m: formatNumber(rest) });
  if (rest === 0) return t("{h} ชม.", { h: formatNumber(h) });
  return t("{h} ชม. {m} นาที", { h: formatNumber(h), m: formatNumber(rest) });
}

/**
 * "อัปเดตเมื่อไร" ของกลุ่มค่าหนึ่ง — **ไม่รู้ ต้องพูดว่าไม่รู้** (T1.305)
 *
 * ★ ของเดิมเขียน `agoMinutes ?? 0` แล้วแสดงว่า "อัปเดต 0 นาทีที่แล้ว"
 *   ซึ่งคนอ่านเข้าใจว่า **เพิ่งอัปเดตเดี๋ยวนี้** — เป็นคำตอบที่มั่นใจที่สุดเท่าที่เป็นไปได้
 *   ทั้งที่ความจริงคือเราไม่รู้เลยด้วยซ้ำว่าค่ามาจากเมื่อไร
 *   (เจอบนหน้าจอจริง 3 ต.ค. 2569 ที่การ์ด "ภายนอก" ของฟาร์มที่เสาอากาศหยุดส่งไปแล้ว)
 *
 * @param {(key: string, vars?: object) => string} t
 * @param {{agoMinutes?: number|null, at?: string|null}|null|undefined} src กลุ่มค่าที่จะบอกเวลา
 * @param {Date} [now]
 * @returns {string}
 */
export function updatedText(t, src, now = new Date()) {
  const ago = src?.agoMinutes;
  if (ago != null && Number.isFinite(Number(ago))) {
    return t("อัปเดต {ago} ที่แล้ว", { ago: durationText(t, Number(ago)) });
  }
  const at = src?.at ? new Date(src.at) : null;
  if (at && !Number.isNaN(at.getTime())) {
    return t("อัปเดต {ago} ที่แล้ว", { ago: durationText(t, (now.getTime() - at.getTime()) / 60000) });
  }
  return t("ไม่รู้ว่าอัปเดตเมื่อไร");
}
