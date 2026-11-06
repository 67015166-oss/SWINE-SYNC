/**
 * ฉากฟาร์มสุกรอัจฉริยะ — ภาพประกอบพื้นหลัง (ใช้ที่หน้า /login เท่านั้น)
 *
 * วาดเป็น SVG ในโค้ดเพื่อไม่ต้องพึ่งไฟล์ภาพหรือ dependency ใหม่ และคมทุกความละเอียด
 * สีทั้งหมดมาจากชุด --scene-* ใน tokens.css (จงใจให้จาง เพราะมีม่านขาวคลุมทับ)
 *
 * การจัดวาง: การ์ดฟอร์มจะทับพื้นที่กลางภาพ (ราว x 560–1040 ของ viewBox 1600)
 * จึงตั้งใจวางโรงเรือน คอกสุกร ไซโล และกังหันลมไว้สองข้างให้มองเห็นได้จริง
 *
 * ถ้าภายหลังมีภาพถ่ายฟาร์มจริง: วางไฟล์ไว้แล้วเปลี่ยน .login-scene ใน Login.css
 * ให้เป็น background-image แทน แล้วเอา component นี้ออกได้ทันที (ไม่มีที่อื่นเรียกใช้)
 */

/* โรงเรือนหลังคาโซลาร์ — ใช้ซ้ำหลายจุด */
function Barn({ x, y, w, h }) {
  return (
    <g>
      <path
        d={`M${x} ${y} ${x + w} ${y} ${x + w - 26} ${y - 40} ${x + 26} ${y - 40}Z`}
        fill="url(#scene-solar)"
      />
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="8"
        fill="var(--scene-wall)"
        stroke="var(--scene-outline)"
      />
      {/* ช่องระบายอากาศด้านข้างโรงเรือน */}
      <g stroke="var(--scene-outline)" fill="none">
        {Array.from({ length: Math.max(2, Math.round(w / 90)) }, (_, i) => (
          <rect
            key={i}
            x={x + 22 + i * 84}
            y={y + h * 0.32}
            width="52"
            height={h * 0.4}
            rx="4"
          />
        ))}
      </g>
    </g>
  );
}

/* คอกสุกรกลางแจ้ง — รั้วเตี้ย ๆ พร้อมสุกรสองสามตัว */
function Pen({ x, y, w }) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height="76"
        rx="8"
        fill="var(--scene-field-alt)"
        stroke="var(--scene-outline)"
      />
      <g stroke="var(--scene-outline)" strokeWidth="3">
        {Array.from({ length: Math.round(w / 58) }, (_, i) => (
          <path key={i} d={`M${x + 20 + i * 58} ${y + 76}v-56`} />
        ))}
        <path d={`M${x} ${y + 34}h${w}`} />
      </g>
      {[0.26, 0.62].map((p) => (
        <g key={p} fill="var(--pink-soft)" opacity="0.55">
          <ellipse cx={x + w * p} cy={y + 56} rx="26" ry="12" />
          <circle cx={x + w * p + 25} cy={y + 49} r="9" />
          <path
            d={`M${x + w * p - 16} ${y + 64}v9M${x + w * p + 4} ${y + 64}v9M${x + w * p + 18} ${y + 64}v8`}
            stroke="var(--pink-soft)"
            strokeWidth="4"
          />
        </g>
      ))}
    </g>
  );
}

function Tree({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path
        d="M0 0v46"
        stroke="var(--scene-tree-dark)"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <circle cy="-30" r="34" fill="var(--scene-tree)" />
      <circle cx="-24" cy="-8" r="24" fill="var(--scene-tree-dark)" opacity="0.8" />
      <circle cx="22" cy="-12" r="22" fill="var(--scene-tree-dark)" opacity="0.65" />
      <circle cx="4" cy="-46" r="20" fill="var(--scene-tree)" />
    </g>
  );
}

/** กรอบภาพย่อยของฉาก — ใช้ให้การ์ดฟาร์มแต่ละใบเห็นมุมที่ต่างกัน */
const CROPS = [
  "0 120 900 560",
  "700 140 900 560",
  "300 60 1000 620",
  "980 200 620 460",
  "120 260 760 520",
];

export default function FarmScene({ className = "", crop }) {
  return (
    <svg
      className={className}
      viewBox={crop == null ? "0 0 1600 900" : CROPS[crop % CROPS.length]}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="scene-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--scene-sky-top)" />
          <stop offset="100%" stopColor="var(--scene-sky-bottom)" />
        </linearGradient>
        <linearGradient id="scene-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--scene-sky-bottom)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--scene-sky-bottom)" stopOpacity="0" />
        </linearGradient>
        <pattern id="scene-solar" width="26" height="18" patternUnits="userSpaceOnUse">
          <rect width="26" height="18" fill="var(--scene-solar)" />
          <path
            d="M26 0v18M0 9h26"
            stroke="var(--scene-wall)"
            strokeWidth="2"
            opacity="0.65"
          />
        </pattern>
      </defs>

      {/* ---------- ท้องฟ้า ภูเขา และหมอกบาง ๆ ---------- */}
      <rect width="1600" height="900" fill="url(#scene-sky)" />
      <path
        d="M0 236 168 132l142 88 168-118 160 110 132-72 182 120 168-90 200 122 92-52-12 178H0Z"
        fill="var(--scene-hill-far)"
      />
      <path
        d="M0 318 160 244l178 70 170-50 204 92 164-62 188 78 182-54 92 42-8 130H0Z"
        fill="var(--scene-hill-mid)"
      />
      <rect y="300" width="1600" height="150" fill="url(#scene-haze)" />

      {/* ---------- ทุ่งและถนน ---------- */}
      <path d="M0 400h1600v500H0Z" fill="var(--scene-field)" />
      <path
        d="M0 400h1600v54H0ZM0 520h1600v46H0ZM0 660h1600v54H0Z"
        fill="var(--scene-field-alt)"
        opacity="0.5"
      />
      <path
        d="M-40 900C280 742 520 664 900 626c290-30 500-42 760-36v52c-262-8-470 6-762 36-372 38-600 128-898 268Z"
        fill="var(--scene-road)"
      />

      {/* ---------- ฝั่งซ้าย: โรงเรือน + คอกสุกร + ต้นไม้ ---------- */}
      <Barn x={40} y={470} w={330} h={86} />
      <Barn x={330} y={520} w={250} h={74} />
      <Pen x={60} y={706} w={430} />
      <Tree x={520} y={640} s={1.15} />
      <Tree x={16} y={646} s={0.95} />

      {/* ---------- ฝั่งขวา: กังหันลม ไซโล โรงเรือน ---------- */}
      {[
        { x: 1268, y: 214, s: 1 },
        { x: 1454, y: 176, s: 0.76 },
      ].map((w) => (
        <g key={w.x} transform={`translate(${w.x} ${w.y}) scale(${w.s})`}>
          <path d="M0 0v250" stroke="var(--scene-metal)" strokeWidth="10" strokeLinecap="round" />
          <g stroke="var(--scene-metal)" strokeWidth="9" strokeLinecap="round" fill="none">
            <path d="M0 0 0-78M0 0 68 40M0 0-68 40" />
          </g>
          <circle r="10" fill="var(--scene-wall)" stroke="var(--scene-outline)" />
        </g>
      ))}

      {[1108, 1188, 1268].map((x, i) => (
        <g key={x}>
          <path d={`M${x} 452 ${x + 28} 424 ${x + 56} 452Z`} fill="var(--scene-metal)" />
          <rect
            x={x}
            y="450"
            width="56"
            height={124 - i * 12}
            rx="6"
            fill="var(--scene-metal)"
            stroke="var(--scene-outline)"
          />
          <path
            d={`M${x + 18} 462v${104 - i * 12}M${x + 38} 462v${104 - i * 12}`}
            stroke="var(--scene-wall)"
            strokeWidth="3"
          />
        </g>
      ))}

      <Barn x={1064} y={604} w={420} h={96} />
      <Pen x={1130} y={760} w={410} />
      <Tree x={1044} y={716} s={1.2} />
      <Tree x={1560} y={690} s={1.05} />

      {/* ---------- กลางภาพ (ส่วนใหญ่อยู่หลังการ์ด) ---------- */}
      <Barn x={636} y={470} w={300} h={70} />
      <Tree x={960} y={596} s={0.85} />
      <Tree x={606} y={604} s={0.8} />
    </svg>
  );
}
