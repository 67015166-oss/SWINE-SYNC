/**
 * รายงานส่งเวร — ส่วนคำนวณล้วน (T1.268)
 *
 * **ไม่มี import อะไรเลย** เทสต์จากราก repo ได้โดยไม่ต้องมีฐานข้อมูล (แบบเดียวกับ twin/decide.js)
 * ส่วนดึงข้อมูลอยู่ที่ shiftReport.js
 *
 * กติกาที่ตั้งใจ:
 *  - **บอกความครบของข้อมูลเสมอ** — กลางคืนข้อมูลหายบ่อย (เครื่องที่รันระบบหลับ ดู RUNBOOK)
 *    ถ้าไม่บอก "สูงสุด 26.2°C" ของกะที่มีข้อมูลแค่ครึ่งกะจะดูเหมือนทั้งคืนปกติ
 *  - เวลาทุกค่าเป็นมิลลิวินาที (epoch ms) · ช่องสรุปละ BUCKET_MIN นาที
 */

/** ความละเอียดของช่องสรุป — กราฟในรายงานกับการนับเวลานอกเกณฑ์ใช้ช่องเดียวกัน */
export const BUCKET_MIN = 5;

/** ข้อมูลขาดติดกันนานเท่านี้ขึ้นไปจึงนับเป็น "ช่วงข้อมูลขาด" — สั้นกว่านี้เป็นแค่สัญญาณสะดุด */
export const GAP_MIN = 15;

const MIN_MS = 60_000;

/**
 * ความครบของข้อมูล + ช่วงที่ขาด จากเวลาต้นช่องที่มีข้อมูล
 *
 * @param {number[]} bucketTimes เวลาต้นช่อง (ms) ที่มีข้อมูลอย่างน้อยหนึ่งค่า
 * @param {number} from ต้นกะ (ms)
 * @param {number} to   ท้ายกะ (ms) — ถ้ากะยังไม่จบ ให้ส่ง "ตอนนี้" มา ไม่ใช่เวลาจบกะ
 */
export function coverageOf(bucketTimes, from, to, { bucketMin = BUCKET_MIN, gapMin = GAP_MIN } = {}) {
  const step = bucketMin * MIN_MS;
  const start = Math.floor(from / step) * step;
  const total = Math.max(0, Math.ceil((to - start) / step));
  const have = new Set(bucketTimes.map((t) => Math.floor(t / step) * step));

  const gaps = [];
  let runStart = null;
  let covered = 0;
  for (let k = 0; k < total; k += 1) {
    const t = start + k * step;
    if (have.has(t)) {
      covered += 1;
      if (runStart !== null) {
        pushGap(gaps, runStart, t, from, gapMin);
        runStart = null;
      }
    } else if (runStart === null) {
      runStart = t;
    }
  }
  if (runStart !== null) pushGap(gaps, runStart, start + total * step, from, gapMin, to);

  const missingMinutes = gaps.reduce((sum, g) => sum + g.minutes, 0);
  return {
    /* 0–1 · นับเป็นช่อง ไม่ใช่นับจำนวนค่า — เซนเซอร์ส่งถี่ไม่เท่ากันทุกช่วง */
    ratio: total === 0 ? 0 : covered / total,
    coveredMinutes: covered * bucketMin,
    totalMinutes: total * bucketMin,
    gaps,
    missingMinutes,
  };
}

function pushGap(gaps, a, b, from, gapMin, cap = Infinity) {
  const start = Math.max(a, from);
  const end = Math.min(b, cap);
  const minutes = Math.round((end - start) / MIN_MS);
  if (minutes >= gapMin) gaps.push({ from: start, to: end, minutes });
}

/**
 * เวลาที่ค่าเฉลี่ยรายช่องอยู่นอกเกณฑ์ — นับเป็นนาที แยกสูงเกิน / ต่ำกว่า
 *
 * นับจากค่าเฉลี่ยช่องละ 5 นาที ไม่ใช่ค่าดิบ: ค่าดิบกระพริบข้ามเส้นไปมาได้หลายสิบครั้งในนาทีเดียว
 * ช่องที่ไม่มีข้อมูล**ไม่นับทั้งสองฝั่ง** — ไม่รู้ก็คือไม่รู้ (ความครบบอกแยกไว้แล้ว)
 *
 * @param {{avg: number}[]} buckets
 * @param {{min?: number|null, max?: number|null}} limits
 */
export function minutesOutside(buckets, limits, bucketMin = BUCKET_MIN) {
  let high = 0;
  let low = 0;
  for (const b of buckets) {
    if (!Number.isFinite(b.avg)) continue;
    if (Number.isFinite(limits?.max) && b.avg > limits.max) high += bucketMin;
    else if (Number.isFinite(limits?.min) && b.avg < limits.min) low += bucketMin;
  }
  return { high, low };
}

/**
 * แยกแจ้งเตือนที่เกี่ยวกับกะนี้เป็นสองกอง
 *
 *  - `during`  เปิดขึ้น **ในกะ** (ช่วง [from, to))
 *  - `pending` **ยังไม่ปิดตอนจบกะ** — ส่วนที่สำคัญที่สุดของรายงาน เพราะเป็นงานที่กะถัดไปต้องรับต่อ
 *    รวมใบที่เปิดมาก่อนกะแล้วค้างข้ามมาด้วย (ตัวอย่างจริง: ความชื้นเกินค้าง 4 วันไม่มีใครรับทราบ)
 *
 * ใบหนึ่งอยู่ได้ทั้งสองกอง (เกิดในกะและยังไม่ปิด) — หน้าจอแสดงทั้งสองที่โดยตั้งใจ
 *
 * @param {Array<{opened_at: string|Date, resolved_at?: string|Date|null}>} alerts
 */
export function splitAlerts(alerts, from, to) {
  const ms = (v) => (v == null ? null : new Date(v).getTime());
  const during = [];
  const pending = [];
  for (const a of alerts) {
    const opened = ms(a.opened_at);
    const resolved = ms(a.resolved_at);
    if (!Number.isFinite(opened) || opened >= to) continue;
    if (opened >= from) during.push(a);
    if (resolved === null || resolved > to) pending.push(a);
  }
  return { during, pending };
}

/**
 * ไฟที่ใช้ในช่วงหนึ่งจากเลขสะสมของมิเตอร์ (kWh)
 *
 * คืน null เมื่อบอกไม่ได้จริง ๆ — ไม่มีค่า มีค่าเดียว หรือเลขถอยหลัง (มิเตอร์ถูกรีเซ็ต/เปลี่ยนตัว)
 * **ห้ามคืน 0 แทน** เพราะ "ใช้ไฟ 0 หน่วย" เป็นข้อมูลที่ผิดและดูน่าเชื่อ
 */
export function kwhUsed(first, last) {
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  const used = last - first;
  return used < 0 ? null : used;
}

/**
 * อายุของข้อมูลเป็นคำพูด — "41 นาที" / "7 ชั่วโมง" / "4 วัน"
 *
 * ★ เกินสองชั่วโมงแล้วห้ามพูดเป็นนาทีอีก (T1.302)
 *   "2,462 นาที" คนอ่านต้องหารเองถึงจะรู้ว่านานแค่ไหน — ซึ่งไม่มีใครหาร
 *   ตัวเลขที่อ่านแล้วรู้สึกทันทีว่า "นานผิดปกติ" คือสิ่งที่ทำให้มีคนลุกไปดู
 *
 * @param {number} minutes จำนวนนาที
 * @returns {string}
 */
export function ageText(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 120) return `${m} นาที`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} ชั่วโมง`;
  return `${Math.round(h / 24)} วัน`;
}
