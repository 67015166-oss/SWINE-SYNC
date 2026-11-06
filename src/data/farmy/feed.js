/**
 * ⚠️ ไฟล์นี้มาจากทีม Farmy — **ห้ามแก้เนื้อหาโดยไม่คุยกับเขาก่อน** (T1.289)
 *
 * ที่มา: `ฟาร์มมี่-ส่งทีมแดชบอร์ด-2026-09-29.zip` → `4-โค้ดที่ยกไปใช้ได้เลย/data/feed.js`
 * เขาอนุญาตให้ยกมาใช้ได้ทั้งชุด (ดู `อ่านก่อน.txt` ในชุดไฟล์นั้น)
 *
 * **เอามาเฉพาะข้อมูลกับสูตรคำนวณ ไม่ได้เอาหน้าจอของเขามา** — หน้าจอเราเขียนใหม่
 * ด้วยระบบดีไซน์ของเราเอง (โทนครีม-ทอง · token สี · Icon.jsx) ตามกติกาใน CLAUDE.md
 * CSS ของเขา 3,900 บรรทัดใช้คนละระบบสี ยกมาแล้วทั้งแอปจะมีสองหน้าตา
 *
 * เนื้อหาในนี้เรียบเรียงจากเอกสารกรมปศุสัตว์/มกอช.
 * ★ **ต่างจากไฟล์อื่นในโฟลเดอร์นี้: ไฟล์นี้ไม่ได้ export `SOURCE_NOTE` มาด้วย**
 *   ข้อความที่มาจึงเขียนไว้ที่หน้าจอ (`src/pages/guide/FeedMix.jsx`) แทน
 *   **ยังต้องแสดงที่มาบนจอเสมอ** เหมือนชุดอื่น คนอ่านต้องรู้ว่าคำแนะนำมาจากไหน
 */

// ข้อมูลอาหารสุกร — ตารางการกิน ความต้องการโภชนะ และวัตถุดิบที่ฟาร์มหาได้
//
// แก้ตัวเลขได้ที่ไฟล์นี้ไฟล์เดียว (ราคาวัตถุดิบแก้ได้จากหน้าเว็บด้วย แล้วจำไว้ในเครื่อง)
// ค่าโภชนะเป็นค่าเฉลี่ยอ้างอิง ของจริงแต่ละล็อตต่างกันได้ ±10% ถ้ามีผลวิเคราะห์ให้ใส่ตามจริง
//
// ราคา: ตั้งใจไม่ใส่ค่าเริ่มต้น (price: null) เพราะราคาตลาดเปลี่ยนตลอดและต่างกันตามพื้นที่
// ถ้าใส่ตัวเลขมั่ว ๆ ไว้ คนจะเผลอเชื่อว่าเป็นราคาจริง — ให้ฟาร์มกรอกจากใบเสร็จเองเท่านั้น

// ตารางมาตรฐานการกินอาหารของสุกรตามอายุ (จากเอกสารการเลี้ยงสุกรขุน)
//   age       อายุ (วัน)
//   weight    น้ำหนักตัว (กก.)
//   adg       อัตราการเจริญเติบโต (กรัม/วัน)
//   fcr       ประสิทธิภาพการใช้อาหาร (กก.อาหาร ต่อ น้ำหนักเพิ่ม 1 กก.)
//   perDay    อาหารที่กินต่อตัวต่อวัน (กก.)
//   cumulative ปริมาณอาหารสะสมตั้งแต่เริ่ม (กก./ตัว)
export const FEED_TABLE = [
  { age: 30, weight: 6.5, adg: 150, fcr: null, perDay: 0.30, cumulative: 0.4 },
  { age: 42, weight: 9.0, adg: 330, fcr: 1.5, perDay: 0.50, cumulative: 5.0 },
  { age: 60, weight: 15.0, adg: 500, fcr: 1.6, perDay: 1.0, cumulative: 15.0 },
  { age: 70, weight: 22.0, adg: 600, fcr: 1.8, perDay: 1.4, cumulative: 27.0 },
  { age: 82, weight: 30.0, adg: 650, fcr: 2.2, perDay: 1.5, cumulative: 45.0 },
  { age: 94, weight: 40.0, adg: 700, fcr: 2.3, perDay: 2.0, cumulative: 67.0 },
  { age: 106, weight: 50.0, adg: 720, fcr: 2.3, perDay: 2.2, cumulative: 90.0 },
  { age: 120, weight: 60.0, adg: 750, fcr: 2.4, perDay: 2.4, cumulative: 125 },
  { age: 133, weight: 70.0, adg: 780, fcr: 2.5, perDay: 2.6, cumulative: 155 },
  { age: 145, weight: 80.0, adg: 800, fcr: 2.6, perDay: 2.8, cumulative: 190 },
  { age: 158, weight: 90.0, adg: 800, fcr: 3.0, perDay: 3.0, cumulative: 225 },
  { age: 170, weight: 100.0, adg: 800, fcr: 3.0, perDay: 3.0, cumulative: 260 },
]

// ความต้องการโภชนะตามช่วงน้ำหนัก — โปรตีน (%) และพลังงานใช้ประโยชน์ได้ ME (kcal/kg)
export const NUTRIENT_NEEDS = [
  { id: 'nursery', label: 'ลูกสุกรอนุบาล', maxWeight: 15, cp: 20, me: 3300 },
  { id: 'starter', label: 'สุกรเล็ก', maxWeight: 30, cp: 18, me: 3250 },
  { id: 'grower', label: 'สุกรรุ่น', maxWeight: 60, cp: 16, me: 3150 },
  { id: 'finisher', label: 'สุกรขุน', maxWeight: 999, cp: 14, me: 3100 },
  // แม่พันธุ์ไม่ได้เลือกจากน้ำหนัก แต่เลือกจากประเภทสุกรโดยตรง (อุ้มท้อง)
  { id: 'sow', label: 'แม่พันธุ์', maxWeight: null, cp: 14, me: 3050 },
]

// วัตถุดิบที่ใช้ผสมได้ — cp โปรตีน (%) · me พลังงาน (kcal/kg) · price ราคาอ้างอิง (บาท/กก.)
// max = สัดส่วนสูงสุดที่ใส่ได้ (%) เกินกว่านี้จะมีปัญหา เช่น ท้องเสีย กินไม่ลง หรือไขมันนิ่ม
export const INGREDIENTS = [
  { id: 'corn', name: 'ข้าวโพดบด', cp: 8.5, me: 3350, price: null, max: 70, note: 'แหล่งพลังงานหลัก ราคาถูกที่สุดต่อพลังงาน' },
  { id: 'corn_whole', name: 'เมล็ดข้าวโพด', cp: 8.5, me: 3300, price: null, max: 60, note: 'ต้องบดก่อนให้กิน ไม่งั้นย่อยไม่ได้' },
  { id: 'rice_bran', name: 'รำละเอียด', cp: 12, me: 2900, price: null, max: 30, note: 'ถูกแต่ไขมันสูง ใส่มากทำให้ไขมันซากนิ่มและหืนเร็ว' },
  { id: 'soybean', name: 'กากถั่วเหลือง', cp: 44, me: 2600, price: null, max: 35, note: 'แหล่งโปรตีนหลัก กรดอะมิโนดี' },
  { id: 'fishmeal', name: 'ปลาป่น', cp: 58, me: 2800, price: null, max: 8, note: 'โปรตีนสูงมาก แต่แพงและใส่มากทำให้เนื้อมีกลิ่น' },
  { id: 'chicken_meal', name: 'ไก่ป่น', cp: 55, me: 2700, price: null, max: 8, note: 'โปรตีนสูง ราคาถูกกว่าปลาป่น คุณภาพแปรปรวนตามล็อต' },
  { id: 'fish_solubles', name: 'น้ำนึ่งปลา', cp: 30, me: 2200, price: null, max: 5, note: 'ช่วยให้กินได้ดีขึ้น ใส่น้อย ๆ พอ' },
  { id: 'oil', name: 'น้ำมันพืช/น้ำมันปาล์ม', cp: 0, me: 8600, price: null, max: 5, note: 'เติมพลังงานให้ถึงเกณฑ์ในสูตรลูกสุกร ใส่เกินทำให้อาหารเหม็นหืน' },
]

// พรีมิกซ์วิตามิน-แร่ธาตุ + เกลือ ต้องมีเสมอ ไม่ใช่ตัวเลือก
// (สูตรที่ได้โปรตีนพอแต่ขาดแร่ธาตุ ทำให้ขาหัก กระดูกอ่อน โตไม่ดี)
export const PREMIX = { id: 'premix', name: 'พรีมิกซ์ + เกลือ', cp: 0, me: 0, price: null, percent: 1.5 }

// ราคาอาหารสำเร็จรูปที่ฟาร์มซื้ออยู่ — ผู้ใช้กรอกเองในหน้าเว็บ (บาท/กก.) ไว้เทียบว่าผสมเองคุ้มไหม
export const READY_FEED_HINT = 'ดูจากใบเสร็จหรือถุงอาหารที่ใช้อยู่'

export function needsFor(weight) {
  return NUTRIENT_NEEDS.find((n) => weight <= n.maxWeight) || NUTRIENT_NEEDS[NUTRIENT_NEEDS.length - 1]
}

// เทียบอายุ (วัน) กับตาราง แล้วเทียบบัญญัติไตรยางศ์ระหว่างสองแถวที่ใกล้ที่สุด
// ตารางมีเป็นช่วง ๆ ถ้าใช้แถวที่ใกล้ที่สุดเฉย ๆ ค่าจะกระโดด ทำให้ปริมาณอาหารเพี้ยนได้หลายสิบกิโลต่อรุ่น
export function feedForAge(age) {
  const t = FEED_TABLE
  if (age <= t[0].age) return { ...t[0], estimated: age < t[0].age }
  if (age >= t[t.length - 1].age) return { ...t[t.length - 1], estimated: age > t[t.length - 1].age }
  for (let i = 0; i < t.length - 1; i++) {
    const a = t[i], b = t[i + 1]
    if (age >= a.age && age <= b.age) {
      const r = (age - a.age) / (b.age - a.age)
      const mix = (k) => +(a[k] + (b[k] - a[k]) * r).toFixed(2)
      return {
        age, weight: mix('weight'), adg: Math.round(a.adg + (b.adg - a.adg) * r),
        fcr: a.fcr && b.fcr ? mix('fcr') : b.fcr, perDay: mix('perDay'), cumulative: mix('cumulative'),
        estimated: false,
      }
    }
  }
  return { ...t[t.length - 1], estimated: true }
}


// ประเภทสุกรที่เลือกได้ — ปกติระบบเดาจากอายุให้ แต่เลือกเองได้ถ้ารู้ว่าเป็นคอกไหน
//   needId ชี้ไปที่เกณฑ์โภชนะใน NUTRIENT_NEEDS · fixedPerDay = ไม่อิงตารางอายุ (แม่พันธุ์)
export const PIG_TYPES = [
  { id: 'auto', label: 'ตามอายุ', icon: 'ti-wand', desc: 'ให้ระบบเลือกช่วงให้จากอายุ' },
  { id: 'nursery', label: 'สุกรเล็ก', icon: 'ti-pig', needId: 'nursery' },
  { id: 'grower', label: 'สุกรรุ่น', icon: 'ti-pig', needId: 'grower' },
  { id: 'finisher', label: 'สุกรขุน', icon: 'ti-pig', needId: 'finisher' },
  { id: 'sow', label: 'แม่พันธุ์', icon: 'ti-pig-money', needId: 'sow', fixedPerDay: 2.5 },
]

// จำนวนมื้อและเวลาให้อาหาร — สัดส่วนรวมกันได้ 100%
export const MEAL_PLANS = {
  2: [{ time: '07:00', label: 'มื้อเช้า', share: 55 }, { time: '16:00', label: 'มื้อเย็น', share: 45 }],
  3: [{ time: '06:00', label: 'มื้อเช้า', share: 34 }, { time: '12:00', label: 'มื้อกลางวัน', share: 34 }, { time: '17:00', label: 'มื้อเย็น', share: 32 }],
  4: [{ time: '06:00', label: 'มื้อเช้า', share: 25 }, { time: '10:00', label: 'มื้อสาย', share: 25 }, { time: '14:00', label: 'มื้อบ่าย', share: 25 }, { time: '18:00', label: 'มื้อเย็น', share: 25 }],
}

// เทียบจากน้ำหนักตัวแทนอายุ — ใช้เมื่อผู้ใช้ชั่งน้ำหนักจริงมา (แม่นกว่าเดาจากอายุ)
export function feedForWeight(weight) {
  const t = FEED_TABLE
  if (weight <= t[0].weight) return { ...t[0], estimated: weight < t[0].weight }
  if (weight >= t[t.length - 1].weight) return { ...t[t.length - 1], estimated: weight > t[t.length - 1].weight }
  for (let i = 0; i < t.length - 1; i++) {
    const a = t[i], b = t[i + 1]
    if (weight >= a.weight && weight <= b.weight) {
      const r = (weight - a.weight) / (b.weight - a.weight)
      const mix = (k) => +(a[k] + (b[k] - a[k]) * r).toFixed(2)
      return { age: Math.round(a.age + (b.age - a.age) * r), weight, adg: Math.round(a.adg + (b.adg - a.adg) * r),
        fcr: a.fcr && b.fcr ? mix('fcr') : b.fcr, perDay: mix('perDay'), cumulative: mix('cumulative'), estimated: false }
    }
  }
  return { ...t[t.length - 1], estimated: true }
}
