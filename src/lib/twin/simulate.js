/**
 * จำลองแบบจำลองฝั่งหน้าเว็บ — ชั้นที่ 3 "แบบจำลองที่ทดลองได้" (T1.262)
 *
 * คณิตชุดเดียวกับ simulate() ใน server/src/twin/thermalModel.js ทุกประการ
 * (มีเทสต์เทียบผลสองฝั่งให้ตรงกันใน test/twinScenario.test.js — แก้ที่หนึ่งต้องแก้อีกที่)
 * ย้ายมาคำนวณฝั่งนี้เพราะตัวเลื่อนต้องตอบทันทีที่ลาก ไม่ใช่รอหลังบ้านทุกครั้ง
 *
 *     T_in[k] = a·T_in[k−1] + (1 − a)·(K·T_out[k−1−d] + S·แดด[k−1] + c)
 *
 * ตัวเลื่อนที่มีได้ **เฉพาะสิ่งที่แบบจำลองเรียนรู้จากข้อมูลจริงแล้ว**
 *   sunScale       คูณแดด (0 = มืดครึ้มทั้งวัน · 1.5 = แดดจัดกว่าที่พยากรณ์ครึ่งหนึ่ง)
 *   setpointShift  เลื่อนอุณหภูมิประจำที่เล้าดึงกลับหา (เหมือนระบบทำความเย็นทำงานแรง/เบาลง)
 * ไม่มีตัวเลื่อนพัดลม จำนวนสุกร หรืออุณหภูมินอก — ข้อมูลยังไม่พอให้แบบจำลองเรียนผลของสิ่งเหล่านั้น
 */

/**
 * @param {{a:number, gainOut:number, sunEffect:number, setpoint:number, lag?:number}} model
 * @param {number} start ค่าในเล้าจุดเริ่ม (ต้องเป็นค่าวัดจริง)
 * @param {Array<{tout:number, rad:number, actual?:number}>} drivers แถวละช่องเวลา — แถว 0 คือจุดเริ่ม
 * @param {{sunScale?:number, setpointShift?:number}} [what]
 * @returns {number[]} ค่าที่แบบจำลองคาดของทุกช่อง (ช่อง 0 = จุดเริ่ม)
 */
export function simulateTwin(model, start, drivers, { sunScale = 1, setpointShift = 0 } = {}) {
  const { a, gainOut: K, sunEffect: S, setpoint: c } = model;
  const lag = model.lag ?? 0;
  const out = [start];
  let tin = start;
  for (let k = 1; k < drivers.length; k++) {
    const prev = k - 1;
    if (prev < lag && Number.isFinite(drivers[k].actual)) {
      /* ยังไม่มีอากาศย้อนหลังพอสำหรับเวลาหน่วง — ใช้ค่าจริงไปก่อนเหมือนฝั่งหลังบ้าน */
      tin = drivers[k].actual;
      out.push(tin);
      continue;
    }
    const tout = drivers[Math.max(0, prev - lag)].tout;
    const drive = K * tout + S * sunScale * drivers[prev].rad + c + setpointShift;
    tin = a * tin + (1 - a) * drive;
    out.push(tin);
  }
  return out;
}

/**
 * สรุปเส้นหนึ่งเส้นเป็นประโยคที่คนอ่าน: สูงสุดเท่าไหร่ตอนไหน · เกินเกณฑ์นานแค่ไหน · เกินครั้งแรกเมื่อไหร่
 * @param {number[]} values ค่าแต่ละช่อง
 * @param {number[]} times เวลาของแต่ละช่อง (วินาที)
 * @param {number} limit เพดานอุณหภูมิจากหน้าตั้งค่า
 * @param {number} stepSec ความยาวหนึ่งช่อง
 */
export function summarize(values, times, limit, stepSec) {
  let peak = -Infinity;
  let peakAt = null;
  let overSteps = 0;
  let firstOver = null;
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) return;
    if (v > peak) {
      peak = v;
      peakAt = times[i];
    }
    if (v > limit) {
      overSteps += 1;
      if (firstOver == null) firstOver = times[i];
    }
  });
  return {
    peak: Number.isFinite(peak) ? peak : null,
    peakAt,
    overMinutes: (overSteps * stepSec) / 60,
    firstOver,
  };
}
