import { useT } from "../../lib/i18n/useT.js";
/**
 * ฉากวาดภายในโรงเรือน (SVG) — ตัวสำรองของ CameraView
 *
 * ใช้เมื่อยังไม่มีสตรีมกล้องจริงและไม่มีไฟล์ภาพใน public/camera/ ด้วย
 * วาดฉากมองจากกล้องหัวโรงเรือนแล้วครอบกรอบตรวจจับ (bounding box) ให้เห็นว่าระบบ "มองเห็น" กี่ตัว
 */

/** ตำแหน่งสุกรในเฟรม (สัดส่วน 0–1 ของกรอบภาพ) — คงที่ เพื่อให้ภาพนิ่งไม่กระพริบ */
const PIGS = [
  { x: 0.13, y: 0.62, s: 1.15, conf: 98 },
  { x: 0.3, y: 0.52, s: 1, conf: 96 },
  { x: 0.47, y: 0.66, s: 1.2, conf: 99 },
  { x: 0.63, y: 0.5, s: 0.92, conf: 94 },
  { x: 0.78, y: 0.6, s: 1.05, conf: 97 },
  { x: 0.38, y: 0.4, s: 0.8, conf: 91 },
  { x: 0.7, y: 0.38, s: 0.75, conf: 89 },
];

/**
 * @param {string}  [className] คลาสของกรอบภาพ (ส่งต่อจาก CameraView)
 * @param {number}  [flagIndex] ลำดับตัวที่ AI ทำเครื่องหมาย "เฝ้าดู" (-1 = ไม่มี)
 */
export default function CameraScene({ className = "", flagIndex = -1 }) {
  const t = useT();
  return (
    <svg
      className={className}
      viewBox="0 0 640 360"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={t("ภาพจำลองจากกล้อง AI ภายในโรงเรือน พร้อมกรอบตรวจจับสุกร")}
    >
      <defs>
        <linearGradient id="cam-air" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--scene-wall)" />
          <stop offset="100%" stopColor="var(--scene-metal)" />
        </linearGradient>
        <linearGradient id="cam-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--scene-metal)" />
          <stop offset="100%" stopColor="var(--scene-road)" />
        </linearGradient>
      </defs>

      {/* ---------- โครงสร้างภายในโรงเรือน (มุมมองจากกล้องหัวโรงเรือน) ---------- */}
      <rect width="640" height="360" fill="url(#cam-air)" />
      <path d="M0 168h640v192H0Z" fill="url(#cam-floor)" />

      {/* ผนังและหลังคาเข้าสู่จุดรวมสายตา */}
      <path d="M0 0 250 150v18L0 168Z" fill="var(--scene-metal)" opacity="0.55" />
      <path d="M640 0 390 150v18l250 0Z" fill="var(--scene-metal)" opacity="0.4" />
      <path d="M250 150h140v18H250Z" fill="var(--scene-roof)" />
      <path
        d="M0 0 250 150M640 0 390 150M0 360 250 168M640 360 390 168"
        stroke="var(--scene-outline)"
        fill="none"
      />

      {/* รางอาหารสองข้างและร่องระบาย */}
      <path d="M0 300 250 186v10L0 316Z" fill="var(--scene-wall)" stroke="var(--scene-outline)" />
      <path d="M640 300 390 186v10l250 20Z" fill="var(--scene-wall)" stroke="var(--scene-outline)" />
      <path d="M296 168h48v192h-48Z" fill="var(--scene-road)" opacity="0.7" />

      {/* โคมไฟเพดาน */}
      {[300, 320, 340].map((y, i) => (
        <g key={y}>
          <rect x={310 - i * 4} y={y - 220} width={20 + i * 8} height="5" rx="2" fill="var(--accent-tint)" />
        </g>
      ))}

      {/* ---------- สุกรในเฟรม + กรอบตรวจจับของ AI ---------- */}
      {PIGS.map((p, i) => {
        const w = 74 * p.s;
        const h = 42 * p.s;
        const x = p.x * 640 - w / 2;
        const y = p.y * 360 - h / 2;
        const flagged = i === flagIndex;
        return (
          <g key={`${p.x}-${p.y}`}>
            {/* ตัวสุกร */}
            <ellipse cx={x + w / 2} cy={y + h * 0.62} rx={w * 0.42} ry={h * 0.34} fill="var(--pink-soft)" opacity="0.85" />
            <circle cx={x + w * 0.84} cy={y + h * 0.46} r={h * 0.22} fill="var(--pink-soft)" opacity="0.9" />
            <path
              d={`M${x + w * 0.28} ${y + h * 0.86}v${h * 0.2}M${x + w * 0.52} ${y + h * 0.88}v${h * 0.2}M${x + w * 0.7} ${y + h * 0.86}v${h * 0.18}`}
              stroke="var(--pink-soft)"
              strokeWidth={h * 0.12}
              strokeLinecap="round"
              opacity="0.85"
            />
            {/* กรอบตรวจจับ */}
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx="6"
              fill="none"
              stroke={flagged ? "var(--status-warning)" : "var(--status-good)"}
              strokeWidth="2.5"
            />
            {/* ป้ายผลตรวจจับ */}
            <rect
              x={x}
              y={y - 16}
              width={flagged ? 62 : 40}
              height="15"
              rx="3"
              fill={flagged ? "var(--status-warning)" : "var(--status-good)"}
            />
            <text
              x={x + 4}
              y={y - 5}
              fontSize="10.5"
              fontWeight="700"
              fill="var(--ink-inverse)"
              fontFamily="var(--font-sans)"
            >
              {flagged ? t("เฝ้าดู {n}%", { n: p.conf }) : `${p.conf}%`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
