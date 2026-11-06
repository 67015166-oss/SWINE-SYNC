/**
 * ทะเบียนอุปกรณ์ตั้งต้นของโรงเรือน (T1.284)
 *
 * ตาราง `control_device` เป็นตัวจริง แต่โรงเรือนที่ยังไม่ได้ลงทะเบียน (โรงเรือนตัวอย่าง
 * หรือโรงเรือนจริงที่ยังไม่ได้ที่อยู่ปลายทางจากเจ้าของระบบ) ต้องมีค่าตั้งต้นที่ **ปลอดภัยพอ**
 * ไม่ใช่ปล่อยว่างแล้วให้ด่านความปลอดภัยเงียบไปเฉย ๆ
 *
 * ชุดนี้ต้องตรงกับที่หน้าเว็บใช้ (`src/data/mock/barnSystems.js`) — มีเทสต์คุมไว้
 * ถ้าวันหนึ่งโรงเรือนจริงมีพัดลม 8 ตัว ให้ลงแถวใน control_device ไม่ใช่มาแก้ตัวเลขที่นี่
 *
 * ★ สองธงที่ตัดสินความปลอดภัย
 *   critical  หยุดแล้วกระทบชีวิตสัตว์โดยตรง (น้ำดื่ม) — ปิดได้แต่ต้องยืนยัน
 *   cooling   เป็นอุปกรณ์ทำความเย็น — ปิดหรือหรี่ตอนอากาศร้อนต้องผ่านด่านอุณหภูมิ
 *             **ม่านน้ำเป็น cooling ไม่แพ้พัดลม** ตอนแรกผมมองข้ามเพราะมันชื่อว่า "ปั๊ม"
 */

/** จำนวนพัดลมตั้งต้นต่อโรงเรือน — ต้องตรงกับ FAN_COUNT ฝั่งหน้าเว็บ */
export const FAN_COUNT = 5;

/** หน้าที่ของปั๊มแต่ละตัว — ต้องตรงกับ PUMP_ROLES ฝั่งหน้าเว็บ (ลำดับ P1–P3) */
export const PUMP_DUTY = {
  P1: { duty: "น้ำดื่ม", critical: true, cooling: false },
  P2: { duty: "ระบายน้ำ", critical: false, cooling: false },
  P3: { duty: "ม่านน้ำ", critical: false, cooling: true },
};

/** อุปกรณ์ตั้งต้นทั้งชุดของโรงเรือนหนึ่งหลัง */
export const defaultDevices = () => [
  ...Array.from({ length: FAN_COUNT }, (_, i) => ({
    kind: "fan",
    device_id: `FAN ${i + 1}`,
    duty: "ระบายอากาศ",
    critical: false,
    cooling: true,
    enabled: true,
    remote_addr: null,
  })),
  ...Object.entries(PUMP_DUTY).map(([id, r]) => ({
    kind: "pump",
    device_id: id,
    duty: r.duty,
    critical: r.critical,
    cooling: r.cooling,
    enabled: true,
    remote_addr: null,
  })),
];

/**
 * หาอุปกรณ์หนึ่งตัว — ใช้แถวในฐานถ้ามี ไม่มีก็ใช้ค่าตั้งต้น
 * คืน null เมื่อรหัสไม่อยู่ในชุดตั้งต้นเลย (สั่งอุปกรณ์ที่ไม่มีตัวตนไม่ได้)
 */
export function resolveDevice(row, kind, deviceId) {
  const fallback = defaultDevices().find((d) => d.kind === kind && d.device_id === deviceId);
  if (!row) return fallback ?? null;
  /* แถวในฐานชนะทุกช่อง — โรงเรือนจริงอาจมีอุปกรณ์ที่ชุดตั้งต้นไม่รู้จัก */
  return { ...fallback, ...row };
}
