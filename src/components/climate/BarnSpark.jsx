/**
 * กราฟเส้นเล็กแสดงแนวโน้ม 24 ชั่วโมงของโรงเรือนหนึ่ง — ใช้ในการ์ดหน้ารายการโรงเรือน
 *
 * **ทำไมเป็นกราฟแยกสองอัน ไม่ใช่กราฟเดียวสองเส้น**
 * อุณหภูมิอยู่ราว 26–30 °C ส่วนความชื้นอยู่ราว 70–90 % คนละหน่วยคนละสเกล
 * ถ้าวาดรวมกันต้องใช้แกน Y สองแกน ซึ่ง `docs/DESIGN.md` ห้ามไว้ชัดเจน
 * ("กราฟหนึ่งมีแกน Y เดียวเท่านั้น") และถ้าฝืนใช้แกนเดียว เส้นอุณหภูมิจะแบนราบ
 * จนอ่านแนวโน้มไม่ออก ➜ แยกเป็นสองอัน อันละหนึ่งเส้น อันละหนึ่งแกน
 * (เส้นเดียวต่อกราฟจึงไม่ต้องมี legend ตามกติกา — ใช้ป้ายกำกับแทน)
 *
 * สีผูกกับตัวชี้วัดถาวร ตรงกับกราฟใหญ่ในหน้ารายละเอียดโรงเรือน:
 * อุณหภูมิ = SERIES[7] · ความชื้น = SERIES[0] (ห้ามสลับ ไม่งั้นคนจำสีผิดข้ามหน้า)
 *
 * ที่มาของข้อมูล: โรงเรือนที่ต่อเซนเซอร์จริง (`apiId`) ดึงจากหลังบ้าน
 * ส่วนฟาร์มตัวอย่างใช้ค่าจำลองเดิม — เหมือนกราฟใหญ่ทุกประการ
 */
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import Icon from "../ui/Icon.jsx";
import { SERIES } from "../../lib/chartTheme.js";
import { getBarnTrend } from "../../data/mock/climate.js";
import { useBarnHistory } from "../../lib/api/useBarnHistory.js";
import { formatNumber, formatNumber1 } from "../../lib/format.js";
import { useT } from "../../lib/i18n/useT.js";
import "./systems.css";

/** สูงพอให้เห็นรูปร่างของเส้น แต่ไม่แย่งที่ตัวเลขในการ์ด */
const SPARK_HEIGHT = 44;

/** ต่ำกว่านี้ถือว่าน้อยเกินกว่าจะเรียกว่า "แนวโน้ม" — จุดเดียวลากเส้นไม่ได้ */
const MIN_POINTS = 2;

function Spark({ label, unit, data, dataKey, color, value, format }) {
  return (
    <div className="bs-item">
      <div className="bs-head">
        <span className="bs-label">{label}</span>
        <span className="bs-now">
          <b className="num">{value == null ? "—" : format(value)}</b> {unit}
        </span>
      </div>
      <div className="bs-chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height={SPARK_HEIGHT}>
          <LineChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
            {/* domain แบบ auto ต่อกราฟ — จุดสำคัญคือ "รูปร่างของการเปลี่ยนแปลง"
                ไม่ใช่ค่าสัมบูรณ์ (ตัวเลขจริงอยู่ข้างบนแล้ว) */}
            <YAxis hide domain={["dataMin - 0.5", "dataMax + 0.5"]} />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * @param {object} barn   โรงเรือนจาก useAllFarms (ต้องมี id · tempC · humidity · apiId ถ้าเป็นของจริง)
 * @param {string} farmId รหัสฟาร์มฝั่งหน้าเว็บ (ใช้กับค่าจำลองเท่านั้น)
 */
export default function BarnSpark({ barn, farmId }) {
  const t = useT();
  /* ไม่ต้องดึงผังเซนเซอร์ — การ์ดใบเล็กใช้แค่เส้นกราฟ ยิงคำขอเปล่าทีละใบไม่คุ้ม */
  const live = useBarnHistory(barn?.apiId ?? null, "24h", { map: false });

  const data = live.series ?? (barn?.apiId ? [] : getBarnTrend(farmId, barn?.id, 24));
  const usable = data.filter((p) => p.tempC != null || p.humidity != null);

  if (usable.length < MIN_POINTS) {
    /* **ห้ามวาดกราฟเปล่า ๆ ทิ้งไว้** — เส้นแบนที่ไม่มีข้อมูลอ่านเหมือน "ค่าคงที่"
       ซึ่งคนละความหมายกับ "ไม่มีค่า" บอกไปตรง ๆ ดีกว่า */
    return (
      <p className="bs-empty">
        <Icon name="power" size={15} aria-hidden="true" />
        {live.status === "loading" ? t("กำลังโหลดแนวโน้ม…") : t("ยังไม่มีข้อมูลย้อนหลังของหลังนี้")}
      </p>
    );
  }

  const last = usable.at(-1);
  return (
    <div className="barn-spark">
      <p className="bs-title">{t("แนวโน้ม 24 ชม.")}</p>
      <div className="bs-grid">
        <Spark
          label={t("อุณหภูมิ")}
          unit="°C"
          data={usable}
          dataKey="tempC"
          color={SERIES[7]}
          value={last.tempC}
          format={formatNumber1}
        />
        <Spark
          label={t("ความชื้น")}
          unit="%"
          data={usable}
          dataKey="humidity"
          color={SERIES[0]}
          value={last.humidity}
          format={formatNumber}
        />
      </div>
    </div>
  );
}
