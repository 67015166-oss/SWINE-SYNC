/**
 * กติกา "คนกดสั่งอุปกรณ์เอง" — ใช้ร่วมกันทุกหน้าที่มีการ์ดควบคุม (EquipmentPanel)
 *
 * แยกมาไว้ที่เดียวเพราะทั้งหน้าสภาพแวดล้อม (สั่งทีละโรงเรือนจากมุมมองทั้งฟาร์ม)
 * และหน้าระบบติดตามรายโรงเรือน ใช้กติกาเดียวกัน — ถ้าเขียนซ้ำสองที่
 * วันหนึ่งค่าตอน "เปิดด้วยมือ" ของสองหน้าจะไม่ตรงกันโดยไม่มีใครรู้ตัว
 *
 * ยังไม่ได้ต่อกับตู้ควบคุมจริง ฟังก์ชันเหล่านี้แค่คืนชุดอุปกรณ์ชุดใหม่
 * เมื่อต่อ API จริง: เรียก API แล้วเอาค่าที่ตอบกลับมาแทนผลของฟังก์ชันนี้ โครงหน้าไม่ต้องแก้
 */

/** ค่าตั้งต้นตอนสั่งเปิดพัดลมด้วยมือ — เดินที่รอบกลาง ๆ ไม่ใช่เร่งสุด */
export const MANUAL_FAN = { hz: 50, amp: 3.5 };

/** ค่าตั้งต้นตอนสั่งเปิดปั๊มด้วยมือ */
export const MANUAL_PUMP = { amp: 2, watt: 440 };

/** พัดลมที่ "หมุนอยู่" — รวมตัวที่กระแสสูงผิดปกติด้วย เพราะมันยังหมุนอยู่จริง */
export const fanRunning = (fan) => fan.state === "on" || fan.state === "warn";

/**
 * สั่งเปิด/ปิดพัดลมตัวที่ index — สั่งเองแล้วชุดนั้นออกจากโหมด AUTO ทันที
 * @param {object} equipment ชุดอุปกรณ์ปัจจุบัน
 * @param {number} index     ลำดับพัดลมในรายการ
 * @returns {object} ชุดอุปกรณ์ชุดใหม่ (ไม่แก้ของเดิม)
 */
export function toggleFan(equipment, index) {
  const fans = equipment.fans.map((fan, i) => {
    if (i !== index) return fan;
    return fanRunning(fan)
      ? { ...fan, state: "off", hz: 0, amp: 0 }
      : { ...fan, state: "on", ...MANUAL_FAN };
  });
  return { ...equipment, auto: false, fans };
}

/** สั่งเปิด/ปิดปั๊มตัวที่ index — กติกาเดียวกับพัดลม */
export function togglePump(equipment, index) {
  const pumps = equipment.pumps.map((pump, i) => {
    if (i !== index) return pump;
    return pump.running
      ? { ...pump, running: false, amp: 0, watt: 0 }
      : { ...pump, running: true, ...MANUAL_PUMP };
  });
  return { ...equipment, auto: false, pumps };
}

/**
 * กระแสและกำลังไฟรวมของอุปกรณ์ที่กำลังเดินอยู่ — ใช้บอกผลของการสั่งงานทันที
 * (นับเฉพาะพัดลมกับปั๊ม ไม่รวมวงจรไฟส่องสว่าง — ตัวเลขเต็มอยู่ในการ์ดระบบไฟฟ้า)
 */
export function equipmentPower(equipment, voltage = 220, powerFactor = 0.9) {
  const amp = [...equipment.fans, ...equipment.pumps].reduce(
    (sum, device) => sum + (device.amp ?? 0),
    0
  );
  return {
    amp: Number(amp.toFixed(1)),
    kw: Number(((voltage * amp * powerFactor) / 1000).toFixed(2)),
  };
}
