import "./ui.css";

/**
 * คำอธิบายสีของกราฟ (legend) ที่วาดเอง — วางไว้ใต้กราฟ ไม่ใช่ <Legend/> ของ Recharts
 *
 * ทำไมไม่ใช้ของ Recharts:
 * 1. มันเรียงลำดับรายการของแท่งซ้อนไม่ตรงกับชั้นที่เห็นจริงในกราฟ และ prop `payload`
 *    ที่ควรบังคับลำดับได้กลับไม่มีผลในเวอร์ชันที่ใช้อยู่
 * 2. มันทาสี series ลงบนตัวหนังสือ ซึ่งผิดกติกาใน docs/DESIGN.md —
 *    "ตัวหนังสือห้ามใส่สี series ให้จุดสีข้าง ๆ บอก series แทน"
 *
 * @param {{label: string, color: string}[]} items เรียงตามลำดับที่อยากให้ผู้ใช้อ่าน
 */
export default function ChartLegend({ items }) {
  return (
    <ul className="chart-legend">
      {items.map((item) => (
        <li key={item.label}>
          <span
            className="chart-legend-dot"
            style={{ background: item.color }}
            aria-hidden="true"
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
