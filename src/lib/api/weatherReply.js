/**
 * เรียบเรียง "อากาศของที่อื่น" ให้เป็นคำตอบภาษาคน — **ประกอบเองในโค้ด ไม่ผ่านโมเดล**
 *
 * ตัวเลขมาจากบริการพยากรณ์ตรง ๆ (Open-Meteo) จึงไม่มีอะไรต้องตีความ เขียนเองได้
 * คำตอบเหมือนกันทุกครั้ง เร็วกว่ารอโมเดลคิด และไม่มีทางแต่งตัวเลขเกินจริง
 *
 * **แยกออกมาจาก Assistant.jsx (17 ก.ย. 2569)** ด้วยเหตุผลเดียวกับ `nowReply.js` —
 * แผงวอยซ์ต้องใช้ตัวเดียวกัน ถ้าปล่อยให้ต่างคนต่างเรียบเรียง วันหนึ่งห้องแชทกับวอยซ์
 * จะตอบคำถามเดียวกันคนละแบบจากข้อมูลชุดเดียวกัน
 *
 * **ค่านี้เป็นค่า "ทำนาย" จากแบบจำลอง ห้ามเอาไปปนกับค่าที่เสาอากาศของเราวัดได้**
 * (ต่างกันได้หลายองศาโดยที่ทั้งคู่ไม่ได้พัง — กติกาเดียวกับ lib/api/openMeteo.js)
 */
import { formatNumber, formatNumber1 } from "../format.js";

/**
 * @param {object} w ผลจาก `fetchWeather(place)`
 * @returns {{text: string, bullets: string[]}}
 */
export function weatherReply(w) {
  const where = w.area && !w.area.includes(w.place) ? `${w.place} (${w.area})` : w.place;
  const bullets = [];

  if (w.today?.max != null) {
    bullets.push(
      `วันนี้ ${formatNumber1(w.today.min)}–${formatNumber1(w.today.max)} °C` +
        (w.today.rainChance != null ? ` · โอกาสฝน ${formatNumber(w.today.rainChance)}%` : ""),
    );
  }
  if (w.tomorrow?.max != null) {
    bullets.push(
      `พรุ่งนี้ ${formatNumber1(w.tomorrow.min)}–${formatNumber1(w.tomorrow.max)} °C` +
        (w.tomorrow.rainChance != null ? ` · โอกาสฝน ${formatNumber(w.tomorrow.rainChance)}%` : ""),
    );
  }
  if (w.windKmh != null) bullets.push(`ลม ${formatNumber1(w.windKmh)} กม./ชม.`);

  return {
    text:
      `${where} ตอนนี้ ${formatNumber1(w.tempC)} °C` +
      (w.humidity != null ? ` · ความชื้น ${formatNumber(w.humidity)}%` : "") +
      (w.sky ? ` · ${w.sky}` : ""),
    bullets,
  };
}
