/**
 * อ่านสตรีมคำตอบของ AI เท่าที่ทันเวลาที่ไลน์รอได้ (T1.323)
 *
 * ═══ ★ ทำไมแยกไฟล์ ═══
 * **ไม่ import อะไรเลย** แบบเดียวกับ `intent.js` เพราะชุดทดสอบอยู่ที่รากโครงงาน
 * ซึ่งไม่มี `pg` ติดตั้งไว้ ถ้าไฟล์นี้แตะฐานข้อมูล เทสต์จะเรียกไม่ได้เลย
 * (เจอเองตอนเขียน — รอบแรกรวมไว้ไฟล์เดียวแล้วเทสต์ล้มด้วย ERR_MODULE_NOT_FOUND)
 *
 * ═══ ★★ ข้อจำกัดที่กำหนดรูปร่างของไฟล์นี้ ═══
 * AI ตัวนี้ตอบสองจังหวะ (ดู server/src/modules/assistant/route.js)
 *   · **ตอบทันที** — คำถามค่าเซนเซอร์ตรง ๆ ~0.5 วินาที บรรทัดเดียวจบ
 *   · **ให้โมเดลคิด** — คำถามที่ต้องวิเคราะห์ **20–90 วินาที** หลายสิบบรรทัด
 *
 * ไลน์ให้ตอบกลับด้วย reply token ที่ใช้ได้ครั้งเดียวและอายุสั้น รอ 90 วินาทีไม่ได้
 *
 * ★ ทางที่ **ไม่** เลือก: ตอบ "กำลังคิด…" แล้วส่งคำตอบจริงทีหลังด้วย `push`
 *   เพราะ `push` กินโควตา 300 ข้อความ/เดือน ถามวันละสิบคำถามก็หมดในเดือนเดียว
 *   แล้วเดือนนั้นจะส่งแจ้งเตือนเรื่องหมูตายไม่ได้ ซึ่งสำคัญกว่าการตอบคำถามมาก
 *
 * ★ ทางที่เลือก: **รับแค่คำตอบที่มาทันเวลา** ถ้าจะช้าก็บอกตรง ๆ แล้วพาไปคุยต่อในเว็บ
 *   ผลคือการถามในไลน์ไม่กินโควตาเลยแม้แต่ข้อความเดียว
 */

/**
 * รอคำตอบได้นานสุดเท่านี้ — เลือกจากข้อจำกัดของไลน์ ไม่ใช่จากความเร็วของ AI
 * เผื่อเวลาให้เส้นทางเขียนคำตอบกลับไปหาไลน์ด้วย จึงไม่ตั้งชิดขอบ
 */
export const BUDGET_MS = 9000;

/** คำตอบยาวเกินนี้อ่านในแชทไม่ไหว — ตัดแล้วบอกให้ไปอ่านต่อในเว็บ */
export const MAX_REPLY = 900;


/**
 * อ่านสตรีม NDJSON เท่าที่ทันในงบเวลา
 *
 * ★ **เลิกรอทันทีที่รู้ว่าจะช้า** ไม่ใช่รอจนหมดงบ — ฝั่ง AI ส่ง `route` หรือ `waiting`
 *   มาก่อนเริ่มคิด ซึ่งเป็นสัญญาณชัดว่ากำลังเข้าทางโมเดล เลิกตอนนั้นทำให้
 *   ผู้ใช้ได้คำตอบว่า "ต้องไปเว็บ" ใน 1–2 วินาที แทนที่จะนิ่งรอ 9 วินาทีก่อนได้คำตอบเดียวกัน
 *   และไม่ปล่อยให้ฝั่ง AI คิดค้างคิวไว้เปล่า ๆ
 *
 * @returns {{ok: true, text: string} | {ok: false, why: "slow"|"unavailable"|"empty"}}
 */
export async function readFast(upstream, abort) {
  const reader = upstream.body?.getReader?.();
  if (!reader) return { ok: false, why: "unavailable" };

  const decoder = new TextDecoder();
  let buf = "";
  let answer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        let obj;
        try { obj = JSON.parse(t); } catch { continue; }

        /* สัญญาณว่ากำลังเข้าทางโมเดล = จะช้า เลิกรอเดี๋ยวนี้ */
        if (obj.route || obj.waiting != null) {
          abort.abort();
          return { ok: false, why: "slow" };
        }
        /* `thinking` คือความคิดภายใน **ห้ามเอาไปแสดง** — ไม่ใช่คำตอบ */
        const chunk = obj.message?.content;
        if (typeof chunk === "string") answer += chunk;
        if (obj.done === true) {
          const text = answer.trim();
          return text ? { ok: true, text } : { ok: false, why: "empty" };
        }
      }
    }
  } catch {
    /* งบเวลาหมดหรือสายหลุดกลางทาง — ถ้าได้คำตอบมาบ้างแล้วก็ถือว่าใช้ไม่ได้
       เพราะคำตอบที่ตัดครึ่งอ่านแล้วเข้าใจผิดง่ายกว่าไม่ตอบเลย */
    return { ok: false, why: answer ? "slow" : "unavailable" };
  }
  return { ok: false, why: answer ? "slow" : "unavailable" };
}
