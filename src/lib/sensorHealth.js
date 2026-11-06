/**
 * แยก "ค่าที่วัดได้จริง" ออกจาก "อุปกรณ์ไม่ได้วัดแล้วส่งศูนย์มาแทน"
 *
 * เซนเซอร์ที่เงียบไปเลยไม่อันตราย เพราะหน้าจอขึ้นขีดกลางแล้วทุกคนรู้ว่าไม่มีข้อมูล
 * ที่อันตรายคือเซนเซอร์ที่ **ตายแล้วยังส่งเลขสวย ๆ มา** — 0 ppm จะไหลเข้าไปเทียบเกณฑ์
 * แล้วได้ป้ายเขียว "อยู่ในเกณฑ์" ทั้งที่ไม่มีใครวัดอะไรเลย คนอ่านจึงสบายใจผิด ๆ
 *
 * ไฟล์นี้เป็นกติกากลาง — ทั้งชั้นที่รับข้อมูลเข้า (lib/api) และหน้าจอใช้ตัวเดียวกัน
 */

/**
 * พื้นล่างทางกายภาพของแต่ละค่า — ต่ำกว่านี้ไม่ใช่ "ดีมาก" แต่คือ "วัดไม่ได้"
 *
 * มีแต่ CO₂ ที่ใส่ได้ เพราะเป็นตัวเดียวที่มีพื้นล่างจริงในธรรมชาติ:
 * อากาศกลางแจ้งทั้งโลกอยู่ราว 420 ppm และในเล้าปิดที่มีสุกรหายใจอยู่ยิ่งสูงกว่านั้นมาก
 * ค่า 0 ppm จึงเป็นไปไม่ได้ ไม่ว่าจะระบายอากาศดีแค่ไหน — ตั้งเส้นไว้ที่ 250 ppm
 * ให้ต่ำกว่าอากาศกลางแจ้งพอสมควร เพื่อไม่ไปตัดสินเซนเซอร์ที่แค่สอบเทียบเพี้ยนเล็กน้อย
 *
 * **NH₃ กับ H₂S ใส่ไม่ได้** — 0 ppm ในเล้าที่ระบายอากาศดีเป็นค่าที่เป็นไปได้จริง
 * ถ้าตั้งพื้นล่างให้สองตัวนี้ เล้าที่อากาศดีจริงจะโดนหาว่าเซนเซอร์เสีย
 */
export const GAS_FLOOR = { co2: 250 };

/** ค่านี้ต่ำจนเป็นไปไม่ได้ทางกายภาพหรือไม่ (ไม่มีค่า = ตอบ false ปล่อยให้ที่อื่นจัดการ) */
export function belowPhysicalFloor(kind, value) {
  const floor = GAS_FLOOR[kind];
  return floor != null && value != null && value < floor;
}

/**
 * โมดูลวัดก๊าซของโรงเรือนนี้ยังเชื่อถือได้ไหม
 *
 * NH₃ · CO₂ ของเล้า R มาจากจุดติดตั้งเดียวกันใน PlotNexus (`barn_R`) = อุปกรณ์ตัวเดียวกัน
 * ถ้า CO₂ อ่านค่าที่เป็นไปไม่ได้ แปลว่าทั้งโมดูลไม่ได้วัด เลข 0 ของ NH₃ ที่มาพร้อมกัน
 * จึงไม่ใช่ "แอมโมเนียต่ำ" แต่คือ "ไม่รู้" เหมือนกัน ต้องถือว่าน่าสงสัยทั้งชุด
 *
 * ที่มา (ตรวจ 3 ก.ย. 2569): ขอ /series ของฟาร์มกำแพงเพชรย้อนหลัง 24 ชม.
 * ได้ co2 121 จุด เป็น 0.0 ทุกจุด และ nh3 121 จุด เป็น 0.0 ทุกจุด — ไม่ขยับเลยแม้แต่จุดเดียว
 * ส่วน h2s ไม่มีเส้นข้อมูลส่งมาเลย (ไม่มีเซนเซอร์ตัวนั้นอยู่จริง คนละอาการกัน)
 *
 * @param {{co2: number|null|undefined}} gases ค่าก๊าซดิบก่อนกรอง
 */
export const gasModuleSuspect = (gases) => belowPhysicalFloor("co2", gases?.co2 ?? null);

/**
 * ทั้งเส้นย้อนหลังของค่านี้ต่ำกว่าพื้นล่างทางกายภาพหมดเลยไหม
 *
 * ใช้กับกราฟย้อนหลัง ซึ่งมีหลักฐานมากกว่าค่าล่าสุดตัวเดียว — เส้นที่นิ่งอยู่ใต้พื้นล่าง
 * ตลอดทั้งช่วงคือเซนเซอร์ที่ไม่ได้วัด ไม่ใช่ช่วงที่อากาศดีเป็นพิเศษ
 * (ถ้ามีสักจุดที่ขึ้นมาเหนือพื้นล่าง แปลว่าอุปกรณ์อ่านค่าได้จริง — ไม่ตัดสินว่าเสีย)
 *
 * @param {"co2"} kind ค่าที่มีพื้นล่างเท่านั้น (ดู GAS_FLOOR)
 * @param {Array<number|null|undefined>} values ค่าทุกจุดในช่วงนั้น
 */
export function seriesAllBelowFloor(kind, values) {
  if (GAS_FLOOR[kind] == null) return false;
  const known = (values ?? []).filter((v) => v != null);
  return known.length > 0 && known.every((v) => belowPhysicalFloor(kind, v));
}

/**
 * จำนวนจุดและช่วงเวลาขั้นต่ำก่อนจะตัดสินว่า "ค้าง" (T1.304)
 *
 * น้อยกว่านี้ตัดสินไม่ได้ — เล้าที่คุมอุณหภูมิดีจริงอาจนิ่งได้หลายชั่วโมง
 */
export const STUCK_MIN_POINTS = 12;
export const STUCK_MIN_SPAN_H = 6;

/** ต่ำกว่านี้ถือว่าไม่ขยับเลย — สัดส่วนของ "คู่จุดติดกันที่ค่าเปลี่ยน" ต่อคู่ทั้งหมด */
export const STUCK_CHANGE_RATIO = 0.05;

/**
 * สัดส่วนช่วงที่ "ค่าไม่ขยับเลยทั้งช่วง" (ต่ำสุด = สูงสุด) ที่ถือว่าค้าง
 *
 * วัดจากของจริง 3 ต.ค. 2569 (30 วันของโรงเรือน A1 ฟาร์มกำแพงเพชร):
 *   เซนเซอร์ในเล้า  — ไม่ขยับเลย **0 จาก 108 ช่วง**
 *   เซนเซอร์นอกอาคาร — ไม่ขยับเลย **23 จาก 27 ช่วง (85%)**
 * สองกลุ่มนี้ห่างกันมากจนตั้งเส้นตรงกลางได้สบาย
 */
export const STUCK_FLAT_RATIO = 0.8;

/**
 * สัดส่วนจุดที่ต้องมี `min`/`max` ติดมา ก่อนจะยอมใช้วิธี "ช่วงนั้นเข็มขยับไหม"
 *
 * น้อยกว่านี้ถือว่าหลักฐานไม่พอ แล้วถอยไปใช้วิธีนับการเปลี่ยนค่าแทน
 */
export const SPREAD_COVERAGE = 0.8;

/** คัดค่าที่อ่านเป็นตัวเลขไม่ได้ออก — `null` กับช่องว่างต้องไม่กลายเป็น 0 (กับดักเดิมของ T1.295/T1.311) */
const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * สรุป "หลักฐาน" ของเส้นหนึ่งเส้น — ยังไม่ตัดสินว่าค้างหรือไม่ (T1.315)
 *
 * ═══ ★ ทำไมต้องแยกหลักฐานออกจากการตัดสิน ═══
 * กติกาค้างเดิมรับได้แค่ "ชุดจุดของกราฟ" จึงใช้ได้แต่กับกราฟย้อนหลัง
 * **ไทล์ค่าปัจจุบันไม่มีชุดจุดให้ดู** มันมีค่าล่าสุดตัวเดียว จึงตรวจไม่ได้เลย
 * ผลคือหน้าจอโชว์ 35.5 °C เป็นค่าตอนนี้ ทั้งที่เลขนั้นไม่ขยับมาตั้งแต่ 8 ก.ค. 2569
 *
 * ทางที่ไม่เอา: ให้ฐานข้อมูลตัดสินเองด้วย SQL แล้วส่งคำตอบ "ค้าง/ไม่ค้าง" มา
 * — จะได้กติกาสองชุดที่เพี้ยนออกจากกันได้โดยไม่มีใครรู้ ซึ่งผิดข้อ
 * **"ระบบเดียวกันต้องไม่บอกคนละอย่าง"** ที่ยึดมาตั้งแต่ T1.312
 *
 * ทางที่เอา: หลังบ้านส่ง **หลักฐาน** มา (นับได้กี่จุด · กินเวลากี่ชั่วโมง · กี่ช่วงที่เข็มไม่ขยับ)
 * แล้วให้ `stuckFromEvidence` ตัวเดียวกันเป็นคนตัดสินทั้งสองทาง
 * เก็บหลักฐานได้หลายวิธี แต่**คนตัดสินมีคนเดียว**
 *
 * @param {Array<{at: string|Date, value: number|null, min?: number, max?: number}>} points เรียงตามเวลาแล้ว
 * @returns {{points: number, spanHours: number|null, buckets: number, flatBuckets: number, changes: number}}
 */
export function stuckEvidence(points) {
  const rows = (points ?? []).filter((p) => num(p?.value) != null);
  if (rows.length === 0) return { points: 0, spanHours: null, buckets: 0, flatBuckets: 0, changes: 0 };

  const first = new Date(rows[0].at).getTime();
  const last = new Date(rows[rows.length - 1].at).getTime();
  const spanHours =
    Number.isFinite(first) && Number.isFinite(last) ? (last - first) / 3_600_000 : null;

  const spread = rows.filter((p) => p.min != null && p.max != null);

  let changes = 0;
  for (let i = 1; i < rows.length; i += 1) {
    if (num(rows[i].value) !== num(rows[i - 1].value)) changes += 1;
  }

  return {
    points: rows.length,
    spanHours,
    buckets: spread.length,
    flatBuckets: spread.filter((p) => num(p.min) === num(p.max)).length,
    changes,
  };
}

/**
 * ตัดสินจากหลักฐานว่าเส้นนี้ "ค้าง" ไหม — **ผู้ตัดสินคนเดียวของทั้งระบบ**
 *
 * ═══ ★ ใช้ `min`/`max` ของแต่ละช่วงเป็นตัวตัดสินหลัก ═══
 * มันตอบคำถามที่ถูกต้อง: **"ในช่วงนั้นเข็มขยับไหม"**
 * ดูแค่ค่าเฉลี่ยของแต่ละช่วงไม่พอ — เซนเซอร์ที่อัปเดตวันละครั้งจะมีค่าเฉลี่ยต่างกันทุกวัน
 * ดูเผิน ๆ เหมือนวัดจริง ทั้งที่ภายในวันเดียวกันไม่ขยับเลยสักครั้ง
 * (เจอเองตอนตรวจ: ดูรายวันแล้วมี 10 ค่าที่ต่างกัน จึงไม่เข้าเกณฑ์เดิมทั้งที่ค้างชัด ๆ)
 *
 * ไม่มี `min`/`max` มาด้วย (เช่นข้อมูลจากแหล่งอื่น) ค่อยถอยไปดูว่า
 * "ค่าของช่วงติดกันเปลี่ยนบ่อยแค่ไหน" ซึ่งหยาบกว่าแต่ยังดีกว่าไม่ตรวจเลย
 *
 * ═══ ★ ผู้ส่งหลักฐานเป็นคนเลือกทางตัดสิน ═══
 * ส่ง `buckets`/`flatBuckets` มา = ใช้ทาง min/max · ไม่ส่งมา = ใช้ทางนับการเปลี่ยนค่า
 * **ไม่ใช่ของตกหล่น แต่เป็นการเลือก** เพราะเส้นแบ่งของสองทางวัดมาจากช่วงเวลาคนละขนาด
 * เส้น 0.8 ของทาง min/max วัดจากช่วง **รายวัน** พอเอาไปใช้กับช่วง **รายชั่วโมง**
 * เซนเซอร์ในเล้าที่ยังดีอยู่เคยขึ้นถึง 0.93 (วัดจริง 27 ก.ย. 2569) คือเกินเส้นไปแล้ว
 * ฝั่งที่เก็บหลักฐานรายชั่วโมงจึงส่งแต่ `changes` มา — เหตุผลเต็มอยู่ที่
 * `server/src/modules/farms/route.js` (`stuckEvidenceByBarn`)
 *
 * หลักฐานไม่พอ = ตอบ `false` เสมอ — **"ไม่รู้" ต้องไม่กลายเป็น "ค้าง"**
 * ไม่งั้นเล้าที่คุมอุณหภูมิได้ดีจริงจะถูกหาว่าเซนเซอร์เสีย
 *
 * @param {{points: number, spanHours: number|null, buckets: number, flatBuckets: number, changes: number}} ev
 */
export function stuckFromEvidence(ev, opt = {}) {
  const {
    minPoints = STUCK_MIN_POINTS,
    minSpanHours = STUCK_MIN_SPAN_H,
    changeRatio = STUCK_CHANGE_RATIO,
    flatRatio = STUCK_FLAT_RATIO,
  } = opt;

  const points = num(ev?.points);
  if (points == null || points < minPoints) return false;

  const span = num(ev?.spanHours);
  if (span == null || span < minSpanHours) return false;

  const buckets = num(ev?.buckets) ?? 0;
  if (buckets >= minPoints && buckets / points >= SPREAD_COVERAGE) {
    return (num(ev?.flatBuckets) ?? 0) / buckets >= flatRatio;
  }

  const changes = num(ev?.changes);
  if (changes == null || points < 2) return false;
  return changes / (points - 1) < changeRatio;
}

/**
 * เส้นย้อนหลังเส้นนี้เป็น "ค่าค้าง" ไหม — เซนเซอร์ตายแล้วส่งเลขเดิมซ้ำ ๆ
 *
 * ═══ ทำไมต้องมี ═══
 * อันตรายกว่าเซนเซอร์ที่เงียบไปเลย เพราะ **มันวาดเป็นเส้นกราฟได้**
 * คนอ่านเห็นเส้นก็เชื่อว่าวัดจริง ทั้งที่ไม่มีใครวัดอะไรเลย
 *
 * ของจริงที่เจอ (3 ต.ค. 2569): เซนเซอร์นอกอาคารของฟาร์มกำแพงเพชร
 * วันที่ 24 ก.ย. ส่งมา **3,525 ค่า แต่ต่ำสุดกับสูงสุดเท่ากันเป๊ะ (27.6 °C)** ทั้งวัน
 * ขณะที่เซนเซอร์ในเล้าวันเดียวกันขยับ 24.5–30.8 °C ตามปกติ
 *
 * @param {Array<{at: string|Date, value: number|null, min?: number, max?: number}>} points เรียงตามเวลาแล้ว
 */
export const seriesStuck = (points, opt = {}) => stuckFromEvidence(stuckEvidence(points), opt);

/**
 * หาเส้นที่ค้างในชุดจุดแบน ๆ ที่หลังบ้านส่งมา (T1.304)
 *
 * คีย์เป็น `"<ค่าที่วัด>|<ในเล้า|นอกอาคาร>"` เพราะเซนเซอร์ในเล้ากับนอกอาคาร
 * เป็นคนละตัวกัน ตัวหนึ่งค้างไม่ได้แปลว่าอีกตัวค้างด้วย
 *
 * @param {Array<{metric: string, outdoor: boolean, at: string|Date, value: number|null}>} points
 * @returns {Set<string>} คีย์ของเส้นที่ค้าง
 */
export function stuckSeriesKeys(points, opt = {}) {
  const byKey = new Map();
  for (const p of points ?? []) {
    const key = `${p.metric}|${p.outdoor ? "out" : "in"}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(p);
  }

  const stuck = new Set();
  for (const [key, rows] of byKey) {
    rows.sort((a, b) => new Date(a.at) - new Date(b.at));
    if (seriesStuck(rows, opt)) stuck.add(key);
  }
  return stuck;
}

/** `"temp_c|out"` → `"อุณหภูมินอกอาคาร"` สำหรับบอกผู้ใช้ว่าเส้นไหนเชื่อไม่ได้ */
export function stuckLabel(key) {
  const [metric, place] = String(key).split("|");
  const name = { temp_c: "อุณหภูมิ", humidity: "ความชื้น", wind_ms: "ลม", nh3: "NH₃", co2: "CO₂" }[metric] ?? metric;
  return `${name}${place === "out" ? "นอกอาคาร" : "ในโรงเรือน"}`;
}

/**
 * หาค่าที่ค้างจาก "หลักฐานที่หลังบ้านส่งมา" — ใช้กับไทล์ค่าปัจจุบัน (T1.315)
 *
 * คีย์เป็นชุดเดียวกับ `stuckSeriesKeys` (`"<ค่าที่วัด>|<in|out>"`) ตั้งใจให้ตรงกัน
 * เพราะกราฟกับไทล์บนหน้าเดียวกันต้องตัดค่าเดียวกันทิ้ง ไม่ใช่ตัดคนละอย่าง
 *
 * @param {Record<string, object>} byKey หลักฐานแยกตามคีย์ จาก `GET /api/farms/:id/barns`
 * @returns {Set<string>} คีย์ของค่าที่เชื่อไม่ได้
 */
export function stuckKeysFromEvidence(byKey, opt = {}) {
  const stuck = new Set();
  for (const [key, ev] of Object.entries(byKey ?? {})) {
    if (stuckFromEvidence(ev, opt)) stuck.add(key);
  }
  return stuck;
}
