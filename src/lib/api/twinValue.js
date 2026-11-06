/**
 * อ่านค่าล่าสุดของ metric หนึ่งจากก้อนที่หลังบ้านส่งมา (T1.260)
 *
 * รูปที่หลังบ้านส่ง: { temp_c: { value, at, devices }, humidity: {...} }
 * แยกมาไว้ไฟล์เดียวเพราะทั้งหน้าและ component ผังใช้ร่วมกัน และไฟล์ที่ export component
 * ต้อง export แต่ component เท่านั้น ไม่งั้น fast refresh ตอน dev ไม่ทำงาน
 *
 * ค่าที่ไม่ใช่ตัวเลข (ไม่มีเซนเซอร์ · ยังไม่ส่งค่า) คืน null เสมอ — หน้าจอจะได้เขียนว่า
 * "ไม่มีค่า" แทนที่จะโชว์ 0 ซึ่งอ่านแล้วนึกว่าวัดได้จริง
 */
export const valueOf = (bucket, metric) => {
  const cell = bucket?.[metric];
  return typeof cell?.value === "number" ? cell.value : null;
};
