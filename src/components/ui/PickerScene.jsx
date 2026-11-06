/**
 * ภาพประกอบหัวป๊อบอัพ "เลือกฟาร์มและโรงเรือน"
 *
 * องค์ประกอบตามแบบ: โรงเรือนสองหลังซ้าย-ขวา · แผ่นเช็กลิสต์ติ๊กถูก 3 ข้อกลางภาพ
 * · หมูใส่ชุดเอี๊ยมเขียวยืนข้างเช็กลิสต์ · วงกลมพื้นหลังจาง ๆ
 *
 * วาดเป็น SVG ในโค้ด ไม่พึ่งไฟล์ภาพหรือ dependency ใหม่ · สีมาจาก token ทั้งหมด
 * ถ้ามีภาพจริง: วางไฟล์ที่ public/picker-hero.png แล้วจะถูกใช้แทนอัตโนมัติ
 * (ดู PickerArt.jsx — ถ้าโหลดไฟล์ไม่ได้จะย้อนกลับมาใช้ภาพวาดนี้)
 */
export default function PickerScene({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 320 200"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      {/* วงกลมพื้นหลังจาง */}
      <circle cx="160" cy="96" r="86" fill="var(--green-tint)" opacity="0.7" />
      <ellipse cx="160" cy="176" rx="132" ry="14" fill="var(--bg-sunken)" />

      {/* พื้นหญ้าสองข้าง */}
      <ellipse cx="62" cy="168" rx="60" ry="16" fill="var(--scene-field)" />
      <ellipse cx="258" cy="168" rx="60" ry="16" fill="var(--scene-field)" />

      {/* ---------- โรงเรือนซ้าย ---------- */}
      <g>
        <path d="M26 154V116l38-20 38 20v38Z" fill="var(--scene-wall)" />
        <path d="M20 118 64 94l44 24-6 8-38-20-38 20Z" fill="var(--scene-roof)" />
        <rect x="46" y="128" width="36" height="26" rx="3" fill="var(--bg-sunken)" />
        <rect x="52" y="134" width="10" height="8" rx="2" fill="var(--scene-metal)" />
        <rect x="66" y="134" width="10" height="8" rx="2" fill="var(--scene-metal)" />
        <rect x="26" y="150" width="76" height="4" fill="var(--scene-road)" />
      </g>

      {/* ---------- โรงเรือนขวา ---------- */}
      <g>
        <path d="M218 154v-38l38-20 38 20v38Z" fill="var(--scene-wall)" />
        <path d="M212 118 256 94l44 24-6 8-38-20-38 20Z" fill="var(--scene-roof)" />
        <rect x="238" y="128" width="36" height="26" rx="3" fill="var(--bg-sunken)" />
        <rect x="244" y="134" width="10" height="8" rx="2" fill="var(--scene-metal)" />
        <rect x="258" y="134" width="10" height="8" rx="2" fill="var(--scene-metal)" />
        <rect x="218" y="150" width="76" height="4" fill="var(--scene-road)" />
      </g>

      {/* ต้นไม้ประกอบ */}
      <g fill="var(--scene-tree)">
        <circle cx="112" cy="140" r="13" />
        <circle cx="208" cy="140" r="13" />
      </g>
      <g fill="var(--scene-tree-dark)">
        <rect x="110" y="150" width="4" height="10" rx="2" />
        <rect x="206" y="150" width="4" height="10" rx="2" />
      </g>

      {/* ---------- แผ่นเช็กลิสต์ ---------- */}
      <g>
        <rect
          x="104"
          y="44"
          width="86"
          height="112"
          rx="10"
          fill="var(--green)"
          opacity="0.18"
        />
        <rect
          x="110"
          y="50"
          width="74"
          height="100"
          rx="8"
          fill="var(--bg-surface)"
          stroke="var(--border-strong)"
        />
        <rect x="132" y="42" width="30" height="14" rx="5" fill="var(--scene-metal)" />

        {[70, 94, 118].map((y) => (
          <g key={y}>
            <circle cx="128" cy={y} r="8" fill="var(--green)" />
            <path
              d={`M124.5 ${y} 127 ${y + 3} 131.5 ${y - 3.5}`}
              fill="none"
              stroke="var(--ink-inverse)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x="142" y={y - 4} width="32" height="7" rx="3.5" fill="var(--bg-sunken)" />
          </g>
        ))}
      </g>

      {/* ---------- หมูใส่ชุดเอี๊ยม ---------- */}
      <g>
        {/* ขา */}
        <rect x="206" y="140" width="9" height="14" rx="4" fill="var(--pink-soft)" />
        <rect x="222" y="140" width="9" height="14" rx="4" fill="var(--pink-soft)" />
        {/* ลำตัว/ชุดเอี๊ยม */}
        <rect x="199" y="106" width="40" height="40" rx="14" fill="var(--green)" />
        <rect x="207" y="100" width="8" height="14" rx="4" fill="var(--green)" />
        <rect x="223" y="100" width="8" height="14" rx="4" fill="var(--green)" />
        <circle cx="219" cy="126" r="4" fill="var(--green-tint)" />
        {/* แขน */}
        <rect x="190" y="112" width="12" height="26" rx="6" fill="var(--pink-soft)" />
        <rect x="236" y="112" width="12" height="26" rx="6" fill="var(--pink-soft)" />
        {/* หัว */}
        <path d="M202 82c-2-8 4-12 8-8Z" fill="var(--pink-soft)" />
        <path d="M236 82c2-8-4-12-8-8Z" fill="var(--pink-soft)" />
        <rect x="199" y="74" width="40" height="34" rx="16" fill="var(--pink-soft)" />
        <ellipse cx="219" cy="98" rx="11" ry="8" fill="var(--bg-surface)" opacity="0.45" />
        <ellipse cx="219" cy="98" rx="9" ry="6.5" fill="var(--pink-soft)" />
        <circle cx="216" cy="98" r="1.7" fill="var(--ink-primary)" opacity="0.55" />
        <circle cx="222" cy="98" r="1.7" fill="var(--ink-primary)" opacity="0.55" />
        <circle cx="210" cy="87" r="2.6" fill="var(--ink-primary)" />
        <circle cx="228" cy="87" r="2.6" fill="var(--ink-primary)" />
      </g>
    </svg>
  );
}
