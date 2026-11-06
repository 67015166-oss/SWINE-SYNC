/**
 * แปลงคำตอบของ `/api/summary` (PlotNexus) → ตัวเลขสรุปที่การ์ดใต้กราฟใช้
 *
 * **แยกไฟล์ออกมาโดยตั้งใจ** — `useBarnHistory.js` ดึง `plotnexus.js` ซึ่งอ่าน
 * `import.meta.env` ตั้งแต่ตอนโหลดโมดูล จึง import ในเทสต์ที่รันด้วย node เปล่า ๆ ไม่ได้
 * ไฟล์นี้ไม่พึ่งอะไรเลย เทสต์จึงเรียกตรงได้ และกติกาที่สำคัญที่สุดของ T1.225 อยู่ที่นี่
 */

const round1 = (n) => (n == null ? null : Number(n.toFixed(1)));

/**
 * สรุปต่ำสุด/สูงสุด/เฉลี่ยของ "จุดติดตั้งเดียว" จากคำตอบ /api/summary
 *
 * ═══ ทำไมต้องมีฟังก์ชันนี้ แทนที่จะคิดเอาจากเส้นกราฟ (T1.225) ═══
 * `/series` ส่ง **ค่าเฉลี่ยรายช่วงมาแล้ว** (24 ชม. = 121 จุด ช่วงละ ~12 นาที)
 * ยอดแหลมจริงถูกเฉลี่ยกลืนไปตั้งแต่ฝั่งเซิร์ฟเวอร์ เอามาหา min/max จึงได้ช่วงแคบกว่าจริง
 * ของเดิมคิดแบบนั้นแล้วขึ้นจอว่า "สูงสุด 27.7 °C" ขณะที่ค่าปัจจุบันบนหน้าเดียวกัน
 * เขียน 28.4 °C — **ค่าปัจจุบันสูงกว่าค่าสูงสุด** ซึ่งอ่านแล้วขัดกันเองทันที
 * ยอดจริงของช่วงเดียวกันที่ /summary บอกคือ 25.3–29.9 °C
 *
 * @param {object|null} summary คำตอบดิบจาก /api/summary
 * @param {string} locId รหัสจุดติดตั้งของโรงเรือน — ค่าภายนอกอยู่คนละจุด จึงไม่มีทางปนกัน
 * @returns {object|null} รูปเดียวกับที่ `climateStats()` คืน · null = ไม่มีข้อมูลให้สรุป
 */
export function toStats(summary, locId) {
  const rows = summary?.["สรุป"] ?? [];
  /* `จำนวนค่า` 0 = ช่วงนั้นไม่มีการวัดเลย ต้องถือว่า "ไม่มีข้อมูล" ไม่ใช่ "ต่ำสุด 0"
     (บริการยังส่งแถวมาให้แม้ไม่มีค่า แล้ว min/max เป็น 0 — ปล่อยผ่านคือได้ 0 บนจอ) */
  const pick = (measure) =>
    rows.find(
      (r) => r["จุดติดตั้ง"] === locId && r.id === measure && (r["จำนวนค่า"] ?? 0) > 0,
    ) ?? null;

  const t = pick("temperature");
  const h = pick("humidity");
  if (!t && !h) return null;

  /* ชื่อฟิลด์ต้องตรงกับที่ `climateStats()` คืนทุกตัว เพราะหน้าจอวาดด้วยโค้ดชุดเดียวกัน
     (ฟาร์มตัวอย่างไม่มี /summary ให้เรียก จึงยังใช้ climateStats เหมือนเดิม) */
  return {
    tempMin: round1(t?.["ต่ำสุด"] ?? null),
    tempMax: round1(t?.["สูงสุด"] ?? null),
    tempAvg: round1(t?.["เฉลี่ย"] ?? null),
    humidityMin: h?.["ต่ำสุด"] == null ? null : Math.round(h["ต่ำสุด"]),
    humidityMax: h?.["สูงสุด"] == null ? null : Math.round(h["สูงสุด"]),
    humidityAvg: h?.["เฉลี่ย"] == null ? null : Math.round(h["เฉลี่ย"]),
  };
}

/**
 * สรุปยอดจากจุดที่หลังบ้าน**ของเรา**ส่งมา (T1.303)
 *
 * ★ **ถูกกว่าการคิดจากค่าเฉลี่ยรายช่วง** ซึ่งเป็นเหตุผลที่ `toStats` มีอยู่ตั้งแต่แรก
 *   endpoint ของเราส่ง `min`/`max`/`n` ของแต่ละช่วงมาด้วย จึงได้
 *   ต่ำสุด/สูงสุด**จริง**ของทั้งช่วง (ไม่ใช่ต่ำสุดของค่าเฉลี่ย) และค่าเฉลี่ยที่ถ่วงน้ำหนัก
 *   ด้วยจำนวนค่าในแต่ละช่วง (ช่วงที่วัดได้ 3 ครั้งต้องไม่มีน้ำหนักเท่าช่วงที่วัดได้ 300 ครั้ง)
 *
 * ★ **นับแต่ค่าในเล้า** — ค่านอกอาคารผูกกับโรงเรือนหลังเดียวกันในฐาน
 *   ถ้าเอามารวม จะได้ตัวเลขที่ไม่ใช่ทั้งในเล้าและไม่ใช่ทั้งนอกเล้า (เจอจริง 31 ส.ค. 2569)
 *
 * @param {Array<{metric: string, outdoor: boolean, value: number, min?: number, max?: number, n?: number}>} points
 */
export function statsFromPoints(points) {
  const inside = (points ?? []).filter((p) => !p.outdoor && p.value != null);
  if (inside.length === 0) return null;

  const of = (metric) => {
    const rows = inside.filter((p) => p.metric === metric);
    if (rows.length === 0) return null;
    const weight = rows.reduce((s, p) => s + (Number(p.n) || 1), 0);
    return {
      min: Math.min(...rows.map((p) => Number(p.min ?? p.value))),
      max: Math.max(...rows.map((p) => Number(p.max ?? p.value))),
      avg: rows.reduce((s, p) => s + Number(p.value) * (Number(p.n) || 1), 0) / weight,
    };
  };

  const t = of("temp_c");
  const h = of("humidity");
  if (!t && !h) return null;

  return {
    tempMin: round1(t?.min ?? null),
    tempMax: round1(t?.max ?? null),
    tempAvg: round1(t?.avg ?? null),
    humidityMin: h?.min == null ? null : Math.round(h.min),
    humidityMax: h?.max == null ? null : Math.round(h.max),
    humidityAvg: h?.avg == null ? null : Math.round(h.avg),
  };
}

/**
 * ช่วงเวลาที่หน้าจอเลือก → จำนวนชั่วโมงที่ขอ และจุดบนแกน X ต้องเป็นรายชั่วโมงไหม
 *
 * ★ **เดิมเป็นตารางตายตัวที่มีแค่ `24h` `7d` `30d`** (T1.303)
 *   หน้าโรงเรือนส่ง `12h` กับ `48h` เข้ามาด้วย ซึ่งไม่อยู่ในตาราง จึงตกไปใช้ 24 ชม. เงียบ ๆ
 *   = ผู้ใช้กดเลือก "12 ชั่วโมงล่าสุด" แล้วได้กราฟ 24 ชั่วโมง โดยไม่มีอะไรบอก
 *   ตอนนี้แปลงจากข้อความตรง ๆ และใช้เกณฑ์เดียวกับหลังบ้าน (≤48 ชม. = รายชั่วโมง)
 */
export function rangeOf(range) {
  const m = String(range ?? "").match(/^(\d+)(h|d)$/);
  if (!m) return { hours: 24, hourly: true, api: "24h" };
  const hours = m[2] === "h" ? Number(m[1]) : Number(m[1]) * 24;
  /* ★ **ส่งสตริงเดิมให้หลังบ้าน ห้ามแปลงวันเป็นชั่วโมงก่อน**
     หลังบ้านรับตัวเลขไม่เกิน 365 ต่อหน่วย — "30d" ผ่าน แต่ "720h" ถูกปฏิเสธ 400
     (เจอจริงตอนตรวจบนหน้าจอ 3 ต.ค. 2569: กราฟ 30 วันว่างเปล่าเพราะคำขอถูกตีกลับ) */
  return { hours, hourly: hours <= 48, api: `${m[1]}${m[2]}` };
}
