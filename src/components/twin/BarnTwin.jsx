/**
 * ผังแบบจำลองโรงเรือนของโรงเรือนหนึ่งหลัง — มองจากด้านบน วาดเป็น SVG เขียนเอง (T1.260)
 *
 * **ห้ามวาดสิ่งที่ไม่ได้วัด** โรงเรือนจริงมีเซนเซอร์ในเล้าตัวเดียว ถ้าไล่เฉดสีทั้งผัง
 * เหมือนมีเซนเซอร์ยี่สิบตัว = แต่งข้อมูลให้คนดูเข้าใจผิด ผังนี้จึงทาสีพื้นทั้งผืนด้วย
 * "ค่าเดียวที่วัดได้จริง" และปักหมุดตรงจุดที่วัด — ใครดูก็รู้ว่าความละเอียดมีแค่ไหน
 *
 * พัดลมวาดไว้เป็นโครงสร้างของอาคาร ไม่ได้บอกว่าหมุนอยู่หรือไม่ เพราะยังไม่มีสายกลับ
 * จากตู้ควบคุม (ดูหัวข้อ "แบบจำลองนี้รู้อะไรบ้าง" ในหน้า)
 *
 * ไม่ใช้ไลบรารีวาดภาพใด ๆ ตามกติกาห้ามเพิ่ม dependency — SVG มือเขียนเหมือน FarmMap
 */
import { useT } from "../../lib/i18n/useT.js";
import { formatNumber1 } from "../../lib/format.js";
import { readingStatus } from "../../data/mock/climate.js";
import { valueOf } from "../../lib/api/twinValue.js";
import "./twin.css";

/** พัดลมดูดอากาศที่ผนังท้ายเล้า — วาดเป็นโครงสร้าง ไม่ได้สื่อสถานะการทำงาน */
function Fan({ cx, cy }) {
  return (
    <g className="tw-fan">
      <circle cx={cx} cy={cy} r="21" />
      <path
        d={`M${cx} ${cy - 13}a9 9 0 0 1 4 8 9 9 0 0 1-4 5 9 9 0 0 1-8-13 9 9 0 0 1 8 0Z`}
        className="tw-fan-blade"
      />
      <circle cx={cx} cy={cy} r="3.5" className="tw-fan-hub" />
    </g>
  );
}

/**
 * @param {object} barn      โรงเรือนจากหลังบ้าน (มี current / outdoor / capacity)
 * @param {object} comfort   ช่วงที่ถือว่าเหมาะสม จากหน้าตั้งค่า
 * @param {number} openCount จำนวนเหตุที่ยังไม่ปิดของโรงเรือนนี้
 * @param {boolean} outdoorStuck เซนเซอร์นอกเล้าส่งค่าเดิมซ้ำ — ห้ามโชว์ตัวเลขเหมือนวัดได้จริง
 */
export default function BarnTwin({ barn, comfort, openCount = 0, outdoorStuck = false }) {
  const t = useT();
  const tempIn = valueOf(barn?.current, "temp_c");
  const humidIn = valueOf(barn?.current, "humidity");
  const tempOut = valueOf(barn?.outdoor, "temp_c");
  const tone = readingStatus("tempC", tempIn, comfort).tone;

  const degrees = (v) => (v == null ? t("ไม่มีค่า") : `${formatNumber1(v)}°`);

  /* สรุปทั้งผังเป็นประโยคเดียวให้โปรแกรมอ่านหน้าจอ — ภาพนี้ไม่มีข้อมูลอื่นนอกจากนี้ */
  const summary = t("ผังโรงเรือน {barn} มองจากด้านบน ในเล้า {in} องศา นอกเล้า {out} องศา", {
    barn: t(barn?.name ?? ""),
    in: tempIn == null ? t("ไม่มีค่า") : formatNumber1(tempIn),
    out: tempOut == null || outdoorStuck ? t("ไม่มีค่า") : formatNumber1(tempOut),
  });

  return (
    <div className="tw-plan">
      <svg viewBox="0 0 680 400" role="img" aria-label={summary} className="tw-svg">
        <defs>
          <marker id="tw-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 10 5 0 10Z" className="tw-arrow-head" />
          </marker>
        </defs>

        {/* ---------- นอกเล้า ---------- */}
        <rect x="0" y="0" width="680" height="400" rx="16" className="tw-outside" />
        <g className="tw-chip">
          <rect x="18" y="18" width={outdoorStuck ? 196 : 150} height="46" rx="12" />
          <text x="32" y="38" className="tw-chip-label">{t("นอกเล้า")}</text>
          <text x="32" y="56" className={outdoorStuck ? "tw-chip-value is-stuck" : "tw-chip-value"}>
            {outdoorStuck ? t("ค่าค้าง · ไม่ได้วัดจริง") : degrees(tempOut)}
          </text>
        </g>

        {/* ---------- ตัวอาคาร ---------- */}
        <rect x="110" y="70" width="470" height="250" rx="12" className={`tw-shell is-${tone}`} />

        {/* ช่องลมเข้าที่ผนังหัวเล้า */}
        <rect x="104" y="92" width="12" height="206" rx="5" className="tw-inlet" />
        <text x="110" y="340" className="tw-note">{t("ช่องลมเข้า")}</text>

        {/* คอกสุกร — โครงสร้างของเล้า ไม่ใช่ข้อมูลที่วัดได้ */}
        {[0, 1].map((row) =>
          [0, 1, 2, 3].map((col) => (
            <rect
              key={`${row}-${col}`}
              x={140 + col * 100}
              y={96 + row * 106}
              width="88"
              height="94"
              rx="8"
              className="tw-pen"
            />
          )),
        )}

        {/* ทิศทางลม จากหัวเล้าไปท้ายเล้า */}
        {[120, 195, 270].map((y) => (
          <line key={y} x1="126" y1={y} x2="546" y2={y} className="tw-flow" markerEnd="url(#tw-arrow)" />
        ))}

        {/* พัดลมดูดอากาศที่ผนังท้ายเล้า */}
        {[110, 170, 230, 290].map((cy) => (
          <Fan key={cy} cx={580} cy={cy} />
        ))}
        <text x="546" y="348" className="tw-note">{t("พัดลมดูดอากาศ")}</text>

        {/* ---------- จุดที่วัดได้จริงจุดเดียว ---------- */}
        <g className={`tw-probe is-${tone}`}>
          <line x1="340" y1="195" x2="340" y2="150" className="tw-probe-stem" />
          <circle cx="340" cy="195" r="10" className="tw-probe-dot" />
          <rect x="250" y="104" width="180" height="48" rx="12" className="tw-probe-box" />
          <text x="264" y="124" className="tw-chip-label">{t("จุดวัดในเล้า")}</text>
          <text x="264" y="144" className="tw-chip-value">
            {degrees(tempIn)}
            {humidIn == null ? "" : ` · ${formatNumber1(humidIn)}%`}
          </text>
        </g>

        {openCount > 0 && (
          /* วางเหนือหลังคา ไม่ทับพัดลมตัวบนสุด */
          <g className="tw-flag">
            <circle cx="560" cy="48" r="14" />
            <text x="560" y="53" className="tw-flag-text" textAnchor="middle">
              {openCount}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
