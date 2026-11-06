/**
 * ⚠️ ไฟล์นี้มาจากทีม Farmy — **ห้ามแก้เนื้อหาโดยไม่คุยกับเขาก่อน** (T1.289)
 *
 * ที่มา: `ฟาร์มมี่-ส่งทีมแดชบอร์ด-2026-09-29.zip` → `4-โค้ดที่ยกไปใช้ได้เลย/utils/feedMix.js`
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

// หาสูตรผสมอาหารจาก "ของที่ฟาร์มมี" — ตอบเสมอว่าควรใช้อย่างละกี่กิโล
//
// หลักคิด: ผู้ใช้บอกแค่ว่ามีอะไรบ้าง ที่เหลือระบบคิดให้
//   - ถ้าของที่มีทำให้โปรตีน/พลังงานถึงเกณฑ์ได้ → เลือกสูตรที่ถูกที่สุด (ถ้ารู้ราคา)
//   - ถ้าไม่ถึงเกณฑ์ → ยังให้สูตรที่ดีที่สุดเท่าที่ทำได้ พร้อมบอกว่าขาดอะไรและเติมอะไรถึงจะพอ
//     (ห้ามเงียบหรือปฏิเสธ เพราะหมูต้องกินอยู่ดี)
//
// วิธีหา: ไล่ลองสัดส่วนจริงทีละ 2.5% ของวัตถุดิบ 2-4 ชนิด — ของมีไม่กี่อย่าง ไล่ตรง ๆ เร็วและตรวจสอบง่าย

const STEP = 2.5
const ME_TOLERANCE = 0.98    // พลังงานต่ำกว่าเกณฑ์ได้ 2% ถือว่ายังใช้ได้

function combinations(arr, k) {
  const out = []
  const pick = (start, cur) => {
    if (cur.length === k) return out.push([...cur])
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]); pick(i + 1, cur); cur.pop() }
  }
  pick(0, [])
  return out
}

/** คะแนนความใกล้เป้า ใช้ตอนของที่มีไม่พอจะถึงเกณฑ์ — โปรตีนสำคัญกว่าพลังงาน */
const closeness = (cp, me, need) =>
  Math.min(cp / need.cp, 1) * 0.65 + Math.min(me / (need.me * ME_TOLERANCE), 1) * 0.35

/**
 * @returns {mix, cp, me, price|null, enough, priced} — คืนสูตรเสมอถ้ามีวัตถุดิบตั้งแต่ 2 ชนิด
 */
export function solveMix(ingredients, need, premix) {
  const base = premix?.percent || 0
  const units = Math.round((100 - base) / STEP)
  const usable = ingredients.filter((x) => x.max > 0)
  if (usable.length < 2) return null

  // รู้ราคาครบทุกตัวถึงจะเทียบราคาได้ ไม่งั้นเลือกโดยดูโภชนะอย่างเดียว
  const priced = usable.every((x) => x.price > 0)
  let best = null

  const consider = (picked, alloc) => {
    let cp = 0, me = 0, price = (premix?.price || 0) * base / 100
    for (let i = 0; i < picked.length; i++) {
      const pct = alloc[i] * STEP
      if (pct > picked[i].max) return
      cp += picked[i].cp * pct / 100
      me += picked[i].me * pct / 100
      price += (picked[i].price || 0) * pct / 100
    }
    const enough = cp >= need.cp && me >= need.me * ME_TOLERANCE
    const score = closeness(cp, me, need)
    const cand = {
      enough, priced, score,
      price: priced ? +price.toFixed(3) : null,
      cp: +cp.toFixed(2), me: Math.round(me),
      mix: picked.map((ing, i) => ({ ...ing, percent: +(alloc[i] * STEP).toFixed(1) }))
        .filter((x) => x.percent > 0).sort((a, b) => b.percent - a.percent),
    }
    if (!best) { best = cand; return }
    // สูตรที่ถึงเกณฑ์ชนะสูตรที่ไม่ถึงเสมอ · ถึงเกณฑ์เหมือนกันค่อยดูราคา (หรือโปรตีนเกินน้อยสุดถ้าไม่รู้ราคา)
    if (cand.enough !== best.enough) { if (cand.enough) best = cand; return }
    if (cand.enough) {
      if (priced ? cand.price < best.price : cand.cp < best.cp) best = cand
    } else if (cand.score > best.score + 1e-9
      || (Math.abs(cand.score - best.score) < 1e-9 && priced && cand.price < best.price)) {
      best = cand
    }
  }

  const walk = (picked, idx, left, alloc) => {
    if (idx === picked.length - 1) { alloc[idx] = left; return consider(picked, alloc) }
    const maxUnits = Math.min(left, Math.floor(picked[idx].max / STEP))
    for (let u = 0; u <= maxUnits; u++) { alloc[idx] = u; walk(picked, idx + 1, left - u, alloc) }
  }

  for (let size = 2; size <= Math.min(4, usable.length); size++) {
    for (const picked of combinations(usable, size)) walk(picked, 0, units, new Array(size).fill(0))
  }
  return best
}

/**
 * ของที่ "ยังไม่มี" ตัวไหนบ้างที่เติมเข้าไปแล้วทำให้สูตรถึงเกณฑ์ — เอาไว้บอกว่าควรไปซื้ออะไร
 */
export function suggestAdditions(have, all, need, premix) {
  const missing = all.filter((a) => !have.some((h) => h.id === a.id))
  const px = { ...premix, price: premix?.price || 0 }
  const priced = (list) => list.map((x) => ({ ...x, price: x.price || 1 }))   // ยังไม่รู้ราคาของที่ยังไม่มี ตั้งเท่ากันไว้ก่อน

  // เติมทีละอย่างก่อน — ถ้ามีตัวเดียวที่แก้ได้ ไม่ต้องให้ไปซื้อสองอย่าง
  const single = []
  for (const c of missing) {
    const t = solveMix(priced([...have, c]), need, px)
    if (t?.enough && t.mix.some((m) => m.id === c.id)) single.push([{ ...c, percent: t.mix.find((m) => m.id === c.id).percent }])
  }
  if (single.length) return single.slice(0, 3)

  // ตัวเดียวไม่พอ ลองจับคู่ (มักเป็นโปรตีน 1 + พลังงาน 1)
  const pairs = []
  for (let i = 0; i < missing.length; i++) {
    for (let j = i + 1; j < missing.length; j++) {
      const c1 = missing[i], c2 = missing[j]
      const t = solveMix(priced([...have, c1, c2]), need, px)
      if (t?.enough && t.mix.some((m) => m.id === c1.id) && t.mix.some((m) => m.id === c2.id)) {
        pairs.push([c1, c2].map((c) => ({ ...c, percent: t.mix.find((m) => m.id === c.id).percent })))
      }
    }
  }
  return pairs.slice(0, 2)
}

/** แปลงสัดส่วนเป็นกิโลกรัมต่อตัวต่อวัน และรวมทั้งชุด */
export function toAmounts(mix, kgPerPig, pigs) {
  return mix.map((m) => ({
    ...m,
    kgPerPig: +(kgPerPig * m.percent / 100).toFixed(3),
    kgTotal: +(kgPerPig * pigs * m.percent / 100).toFixed(2),
  }))
}
