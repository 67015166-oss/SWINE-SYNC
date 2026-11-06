/**
 * เติมส่วนที่ขาดของสูตรอาหาร และแบ่งอาหารเป็นมื้อ (T1.294)
 *
 * ★ **ทำไมต้องมีตัวเติม** — ตัวคิดสูตรของทีม Farmy (`feedMix.js`) ไล่สัดส่วนทีละ 2.5%
 *   แต่ที่ว่างที่ต้องเติมคือ 98.5% (พรีมิกซ์กินไป 1.5%) ซึ่ง **2.5 หารไม่ลงตัว**
 *   โค้ดของเขาปัดลงเหลือ 39 ช่อง = 97.5% ➜ สูตรที่ได้บวกพรีมิกซ์แล้วรวมได้ 99% ไม่ใช่ 100%
 *
 *   ผลจริง: ผสม "หนึ่งชุด 100 กก." แล้วได้ของจริง 99 กก. และหมูได้อาหารน้อยกว่าที่ตั้งใจ 1%
 *   ทุกวันแบบไม่มีอาการให้เห็น (สัดส่วนระหว่างวัตถุดิบยังถูก คุณค่าต่อกิโลจึงไม่เพี้ยน)
 *
 *   ➜ เราไม่แก้ไฟล์ของเขา (คำเตือนหัวไฟล์ห้ามไว้) แต่เติมส่วนที่ขาดลงใน **วัตถุดิบหลัก**
 *      ของสูตรนั้น แล้ว **บอกบนหน้าจอว่าเติมเท่าไรลงตัวไหน** ไม่ใช่เติมเงียบ ๆ
 *      เลือกวัตถุดิบหลัก (สัดส่วนมากสุด) เพราะเป็นตัวที่เปลี่ยน 1% แล้วกระทบค่าโภชนะน้อยที่สุด
 *      และต้องไม่ดันให้เกินเพดาน `max` ของตัวนั้น — เกินแล้วค่อยไล่ไปตัวถัดไป
 */

/** ปัดทศนิยมหนึ่งตำแหน่งแบบไม่ให้ค่าอย่าง 0.30000000000000004 หลุดออกไป */
const r1 = (n) => +n.toFixed(1);

/**
 * เติมสูตรให้รวมกับพรีมิกซ์ได้ 100%
 *
 * @returns {{rows, total, gap, filled}} `gap` = ส่วนที่ขาดก่อนเติม (%) ·
 *          `filled` = [{id, percent}] ว่าเติมลงตัวไหนไปเท่าไร (ว่าง = ไม่ต้องเติม)
 */
export function fillToHundred(mix, premixPercent = 0) {
  const rows = mix.map((m) => ({ ...m, added: 0 }));
  const sum = rows.reduce((a, m) => a + m.percent, 0);
  const gap = r1(100 - premixPercent - sum);
  if (gap <= 0 || rows.length === 0) {
    return { rows, total: r1(sum + premixPercent), gap: gap < 0 ? gap : 0, filled: [] };
  }

  /* ไล่จากตัวที่ใส่มากสุดลงไป — ตัวใหญ่ดูดส่วนที่ขาดได้โดยค่าโภชนะขยับน้อยที่สุด */
  const order = [...rows].sort((a, b) => b.percent - a.percent);
  let left = gap;
  for (const row of order) {
    if (left <= 0) break;
    /* เพดานของวัตถุดิบมีเหตุผลด้านสุขภาพ (รำมากไขมันนิ่ม · ปลาป่นมากเนื้อมีกลิ่น) ห้ามล้ำ */
    const room = r1(Math.max(0, (row.max ?? 100) - row.percent));
    const take = r1(Math.min(room, left));
    if (take <= 0) continue;
    row.added = r1(row.added + take);
    row.percent = r1(row.percent + take);
    left = r1(left - take);
  }

  return {
    rows,
    total: r1(rows.reduce((a, m) => a + m.percent, 0) + premixPercent),
    gap,
    filled: rows.filter((m) => m.added > 0).map((m) => ({ id: m.id, name: m.name, percent: m.added })),
  };
}

/**
 * แบ่งอาหารต่อวันออกเป็นมื้อตามสัดส่วนของแผนมื้อ
 *
 * ปัดเป็นทศนิยมสองตำแหน่ง (10 กรัม) แล้ว **ยัดเศษที่ปัดหายไปลงมื้อแรก**
 * ไม่งั้นรวมทุกมื้อแล้วไม่เท่ากับปริมาณต่อวันที่เขียนไว้บรรทัดบน ซึ่งคนจะคิดว่าเลขผิด
 */
export function mealSplit(plan, kgPerDay) {
  if (!Array.isArray(plan) || plan.length === 0 || !(kgPerDay > 0)) return [];
  const rows = plan.map((m) => ({ ...m, kg: +((kgPerDay * m.share) / 100).toFixed(2) }));
  const drift = +(kgPerDay - rows.reduce((a, m) => a + m.kg, 0)).toFixed(2);
  if (drift !== 0) rows[0] = { ...rows[0], kg: +(rows[0].kg + drift).toFixed(2) };
  return rows;
}

/**
 * คิดโภชนะและต้นทุนของสูตร **หลังเติมส่วนที่ขาดแล้ว**
 *
 * ★ ต้องคิดใหม่ ไม่ใช้ค่าที่ `solveMix` คืนมา — ค่าพวกนั้นคิดจากสัดส่วนก่อนเติม (97.5%)
 *   ถ้าเอามาโชว์คู่กับตารางที่เติมแล้ว ตัวเลขบนจอจะไม่ตรงกับของที่คนตวงจริง
 *
 * ★ `price` เป็น null เมื่อมีวัตถุดิบตัวใดตัวหนึ่งยังไม่รู้ราคา — **ห้ามคิดเป็นศูนย์**
 *   ราคาที่ขาดไปหนึ่งตัวแล้วแอบนับเป็น 0 จะได้ต้นทุนที่ต่ำกว่าจริงและดูน่าเชื่อถือ
 *   ซึ่งแย่กว่าไม่บอกต้นทุนเลย (ของจริงในไฟล์ข้อมูลตั้ง `price: null` ไว้ทุกตัวตั้งใจ)
 */
export function summarize(rows, premix) {
  let cp = 0;
  let me = 0;
  let price = 0;
  let priced = true;
  for (const row of rows) {
    cp += (row.cp * row.percent) / 100;
    me += (row.me * row.percent) / 100;
    if (row.price > 0) price += (row.price * row.percent) / 100;
    else priced = false;
  }
  const px = premix?.percent ?? 0;
  if (px > 0) {
    if (premix?.price > 0) price += (premix.price * px) / 100;
    else priced = false;
  }
  return { cp: +cp.toFixed(2), me: Math.round(me), price: priced ? +price.toFixed(2) : null };
}
