/**
 * กติกาของตัวเฝ้าระวังช่องทางไลน์ (T1.278) — ฟังก์ชันล้วน ไม่ import อะไรเลย
 * แยกไว้ให้เทสต์เรียกได้โดยไม่ต้องมีฐานข้อมูลหรือกุญแจ
 */

/** ตรวจถี่แค่ไหน — ถี่กว่านี้ไม่ช่วยอะไร เพราะการแก้ต้องใช้คนอยู่ดี */
export const CHECK_EVERY_MIN = 60;

/**
 * ถึงเวลาตรวจรอบใหม่หรือยัง
 * @param {Date|string|null} lastCheckedAt
 * @param {Date} now
 */
export function shouldCheck(lastCheckedAt, now = new Date(), everyMinutes = CHECK_EVERY_MIN) {
  if (!lastCheckedAt) return true;
  return (now.getTime() - new Date(lastCheckedAt).getTime()) / 60000 >= everyMinutes;
}

/**
 * ควรส่งข้อความบอกผู้ใช้ว่าช่องทางพังไหม
 *
 * **ส่งผ่านขาออก (push) ซึ่งยังใช้ได้แม้ช่องทางขาเข้าพัง** — คนละทางกัน
 * ขาออกยิงตรงไป api.line.me ส่วนขาเข้าต้องให้ LINE วิ่งเข้ามาหาเครื่องเรา
 *
 * กติกา: บอกครั้งเดียวตอนเพิ่งพัง (ไม่ใช่ทุกชั่วโมง) และบอกอีกครั้งตอนกลับมาใช้ได้
 * เพราะโควตามีจำกัด และข้อความซ้ำ ๆ ทำให้คนเลิกอ่าน
 *
 * @param {boolean} okNow ผลตรวจรอบนี้
 * @param {boolean|null} okBefore ผลตรวจรอบก่อน (null = ยังไม่เคยตรวจ)
 * @returns {"down"|"recovered"|null} ชนิดข้อความที่ควรส่ง
 */
export function notifyKind(okNow, okBefore) {
  if (okBefore === null || okBefore === undefined) return okNow ? null : "down";
  if (!okNow && okBefore) return "down";
  if (okNow && !okBefore) return "recovered";
  return null;
}

/** ข้อความที่ส่งเข้าไลน์ — สั้น ตรง และบอกว่าต้องทำอะไร */
export function healthMessage(kind, { since, reason } = {}) {
  if (kind === "down") {
    return {
      type: "text",
      text: [
        "⚠ เมนูและการถามตอบในไลน์ใช้ไม่ได้ชั่วคราว",
        since ? `ตรวจพบเมื่อ ${since}` : null,
        reason ? `สาเหตุจากฝั่ง LINE: ${reason}` : null,
        "",
        "สรุปรายวันและแจ้งเตือนยังส่งได้ตามปกติ (คนละช่องทางกัน)",
        "วิธีแก้: เปิดช่องทางใหม่ที่เครื่องเซิร์ฟเวอร์ด้วยคำสั่ง tailscale funnel แล้วรอ 3–5 นาที",
      ].filter(Boolean).join("\n"),
    };
  }
  return {
    type: "text",
    text: "✅ เมนูและการถามตอบในไลน์กลับมาใช้ได้แล้ว",
  };
}
