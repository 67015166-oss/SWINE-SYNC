/**
 * ภาพโรงเรือนแบบไอโซเมตริก — ใช้ในการ์ดโรงเรือน (หน้า /dashboard/farms/:farmId)
 *
 * วาดตามแบบ: อาคารยาวหลังคาแผงโซลาร์ · ประตูม้วนด้านหน้า · หน้าต่างแถวยาวด้านข้าง
 * · ไซโลอาหารสัตว์ 3 ถังฝั่งซ้าย · ต้นไม้และพุ่มรอบ ๆ · ลานคอนกรีตสีครีม
 *
 * วาดเป็น SVG ในโค้ด ไม่พึ่งไฟล์ภาพหรือ dependency ใหม่ · สีมาจากชุด --scene-* ใน tokens.css
 * prop `variant` สลับรายละเอียดเล็กน้อย (จำนวนพุ่ม/ต้นไม้) ให้การ์ดแต่ละใบไม่ซ้ำกันเป๊ะ
 */
/** มุมทั้งสี่ของหลังคา (a=ชายคาซ้าย, b=หัวจั่ว, c=ชายคาขวา, d=มุมล่างขวา) */
const ROOF = { a: [172, 168], b: [244, 126], c: [412, 180], d: [336, 224] };

export default function BarnScene({ className = "", variant = 0 }) {
  const v = ((variant % 3) + 3) % 3;
  const bushes = [
    [
      { x: 250, y: 236 },
      { x: 286, y: 244 },
      { x: 366, y: 214 },
    ],
    [
      { x: 236, y: 240 },
      { x: 330, y: 224 },
    ],
    [
      { x: 262, y: 238 },
      { x: 300, y: 246 },
      { x: 344, y: 220 },
      { x: 386, y: 206 },
    ],
  ][v];

  return (
    <svg
      className={className}
      viewBox="76 54 412 234"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="barn-panel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--scene-solar)" />
          <stop offset="100%" stopColor="var(--seq-250)" />
        </linearGradient>
        <linearGradient id="barn-wall-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--scene-wall)" />
          <stop offset="100%" stopColor="var(--scene-metal)" />
        </linearGradient>
      </defs>

      {/* ---------- ลานคอนกรีต ---------- */}
      <path
        d="M96 214 236 146l246 78-150 76Z"
        fill="var(--scene-wall)"
        stroke="var(--scene-outline)"
      />
      <path d="M96 214v10l236 78v-10Z" fill="var(--scene-metal)" />
      <path d="M482 224v10l-150 76v-10Z" fill="var(--scene-metal)" opacity="0.7" />

      {/* แปลงหญ้าริมลาน */}
      <path d="M228 232 300 208l52 16-72 26Z" fill="var(--scene-field)" />
      <path d="M372 196 414 182l30 10-42 15Z" fill="var(--scene-field)" />
      <path d="M120 208 168 190l34 11-48 18Z" fill="var(--scene-field)" />

      {/* ---------- ไซโลอาหารสัตว์ 3 ถัง ---------- */}
      {[
        { x: 118, y: 96, s: 1 },
        { x: 150, y: 78, s: 1.08 },
        { x: 184, y: 66, s: 1.02 },
      ].map((s) => (
        <g key={s.x} transform={`translate(${s.x} ${s.y}) scale(${s.s})`}>
          {/* ฝาบน */}
          <path d="M0 22 15 0l15 22Z" fill="var(--scene-wall)" stroke="var(--scene-outline)" />
          {/* ตัวถัง */}
          <path
            d="M0 22h30v52l-15 26L0 74Z"
            fill="url(#barn-wall-side)"
            stroke="var(--scene-outline)"
          />
          {/* วงแหวนรอบถัง */}
          <path
            d="M0 38h30M0 54h30M0 70h30"
            stroke="var(--scene-outline)"
            opacity="0.55"
            fill="none"
          />
          {/* ขาตั้ง */}
          <path
            d="M4 96 8 118M26 96 22 118"
            stroke="var(--scene-metal)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      ))}

      {/* ---------- อาคารโรงเรือน ---------- */}
      {/* ผนังหน้าจั่ว (ด้านหน้า) */}
      <path
        d="M172 168 236 132v52l-64 36Z"
        fill="var(--scene-wall)"
        stroke="var(--scene-outline)"
      />
      {/* ผนังยาวด้านข้าง */}
      <path
        d="M236 132 404 186v52l-168-54Z"
        fill="url(#barn-wall-side)"
        stroke="var(--scene-outline)"
      />
      {/* หลังคาแผงโซลาร์ */}
      <path
        d="M172 168 244 126l168 54-76 44Z"
        fill="url(#barn-panel)"
        stroke="var(--scene-outline)"
      />
      {/* เส้นแบ่งแผงโซลาร์ — คำนวณจากมุมทั้งสี่ของหลังคา จึงวางตัวไปตามระนาบจริง */}
      <g stroke="var(--scene-wall)" strokeWidth="1.3" opacity="0.9" fill="none">
        {Array.from({ length: 11 }, (_, i) => {
          const t = (i + 1) / 12;
          /* ไล่จากชายคาซ้ายไปหัวจั่ว แล้วลากขนานกับสันหลังคา */
          const x1 = ROOF.a[0] + (ROOF.b[0] - ROOF.a[0]) * t;
          const y1 = ROOF.a[1] + (ROOF.b[1] - ROOF.a[1]) * t;
          return (
            <path
              key={`p${i}`}
              d={`M${x1} ${y1} ${x1 + (ROOF.d[0] - ROOF.a[0])} ${y1 + (ROOF.d[1] - ROOF.a[1])}`}
            />
          );
        })}
        {Array.from({ length: 4 }, (_, i) => {
          const t = (i + 1) / 5;
          const x1 = ROOF.a[0] + (ROOF.d[0] - ROOF.a[0]) * t;
          const y1 = ROOF.a[1] + (ROOF.d[1] - ROOF.a[1]) * t;
          return (
            <path
              key={`q${i}`}
              d={`M${x1} ${y1} ${x1 + (ROOF.b[0] - ROOF.a[0])} ${y1 + (ROOF.b[1] - ROOF.a[1])}`}
            />
          );
        })}
      </g>

      {/* สันหลังคาและชายคา */}
      <path d="M244 126 412 180l-8 6-168-54Z" fill="var(--scene-roof)" stroke="var(--scene-outline)" />
      <path d="M172 168 244 126l6 4-72 42Z" fill="var(--scene-roof)" stroke="var(--scene-outline)" />

      {/* ประตูม้วนด้านหน้า */}
      <path d="M188 186 222 168v34l-34 18Z" fill="var(--scene-metal)" stroke="var(--scene-outline)" />
      <g stroke="var(--scene-wall)" strokeWidth="1.6" opacity="0.9">
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={`M188 ${192 + i * 6} 222 ${174 + i * 6}`} />
        ))}
      </g>
      {/* ช่องระบายอากาศเหนือประตู */}
      <path d="M196 162 214 152v8l-18 10Z" fill="var(--scene-metal)" stroke="var(--scene-outline)" />

      {/* หน้าต่างแถวยาวด้านข้าง */}
      <g fill="var(--status-good-bg)" stroke="var(--scene-outline)">
        {Array.from({ length: 7 }, (_, i) => {
          const x = 252 + i * 21;
          const y = 145 + i * 6.8;
          return <path key={i} d={`M${x} ${y}l14 4.5v14l-14-4.5Z`} />;
        })}
      </g>

      {/* ตู้ควบคุมท้ายอาคาร */}
      <path d="M396 190 410 196v20l-14-6Z" fill="var(--scene-metal)" stroke="var(--scene-outline)" />

      {/* ---------- ต้นไม้และพุ่ม ---------- */}
      <g>
        <path d="M104 196v18" stroke="var(--scene-tree-dark)" strokeWidth="5" strokeLinecap="round" />
        <circle cx="104" cy="184" r="17" fill="var(--scene-tree)" />
        <circle cx="93" cy="194" r="11" fill="var(--scene-tree-dark)" opacity="0.8" />
      </g>
      {bushes.map((b) => (
        <g key={`${b.x}-${b.y}`}>
          <ellipse cx={b.x} cy={b.y} rx="13" ry="9" fill="var(--scene-tree)" />
          <ellipse cx={b.x - 8} cy={b.y + 2} rx="8" ry="6" fill="var(--scene-tree-dark)" opacity="0.75" />
        </g>
      ))}
    </svg>
  );
}
