/**
 * ธีมของแดชบอร์ด — มี 2 แกนที่แยกกันเด็ดขาด เลือกอิสระต่อกันได้ 11 × 20 แบบ
 *
 *   1) ธีมบทบาท (ROLE_THEMES)  ตัดสินใจว่า "เห็นอะไร" — เมนูบนและกล่องสรุปหน้าภาพรวม
 *   2) โหมดโทนสี (COLOR_MODES) ตัดสินใจว่า "สีอะไร" — สว่าง 10 · มืด 10 (styles/modes.css)
 *
 * ทำไมต้องแยก: กติกาใน docs/DESIGN.md บอกว่า "สีมีหน้าที่ ไม่ใช่เครื่องประดับ"
 * ถ้าปล่อยให้บทบาทเปลี่ยนสีด้วย สีทองจะไม่ได้แปลว่า "กดได้" อีกต่อไปในบางบทบาท
 * บทบาทจึงคุมเนื้อหาและลำดับความสำคัญ ส่วนโหมดสีคุมสีทั้งหมดแต่เพียงผู้เดียว
 */
/**
 * หน้าภาพรวม = "หน้าแรก" ของแอปนี้ ที่เดียวที่เขียนเส้นทางนี้ไว้
 *
 * ทุกอย่างที่ผู้ใช้เข้าใจว่าเป็น "กลับหน้าแรก" ต้องชี้มาที่นี่เสมอ —
 * โลโก้ SWINE SYNC · ปุ่ม "หน้าแรก" · เมนู "ภาพรวม"
 * (ห้ามผูกกับค่า "หน้าเปิดระบบ" ในหน้าตั้งค่า ค่านั้นคุมแค่หน้าที่เปิดให้ตอนเข้าสู่ระบบ
 *  เคยผูกไว้แล้วเกิดเรื่อง: ตั้งค่านั้นเป็นหน้าสภาพแวดล้อม กดโลโก้ทีก็เด้งไปที่นั่น)
 */
export const OVERVIEW_PATH = "/dashboard";

/**
 * เมนู "โรงเรือน" — หน้ารายการโรงเรือนต้องมีฟาร์มเสมอ แต่ "ฟาร์มไหน" ตอบล่วงหน้าไม่ได้
 *
 * เคยเขียนตายตัวเป็น `/dashboard/farms/${farms[0].id}` (ฟาร์มแรกของข้อมูลตัวอย่าง)
 * ซึ่งพังทันทีที่ผู้ใช้ลบฟาร์มนั้นทิ้ง — เมนู "โรงเรือน" ที่อยู่ทุกหน้า กดแล้วได้ "ไม่พบฟาร์มนี้"
 * และแก้ที่เดียวไม่จบ เพราะค่านี้ถูกใช้ต่อในเมนูข้าง ช่องค้นหา และผู้ช่วย AI ด้วย
 *
 * ➜ ชี้มาที่เส้นทางกลางแทน แล้วให้หน้า BarnsHome เป็นคนเลือกฟาร์มจากรายการ "ที่มีอยู่ตอนนั้น"
 *   (ลบฟาร์มไปกี่ฟาร์มเมนูนี้ก็ยังพาไปถูกที่เสมอ ไม่มีฟาร์มเหลือเลยก็บอกตรง ๆ พร้อมปุ่มเพิ่มฟาร์ม)
 */
export const BARNS_HOME = "/dashboard/barns";

/**
 * ส่วนงานทั้งหมดที่ธีมสลับได้ — key ในนี้คือสิ่งที่ ROLE_THEMES อ้างถึง
 *
 * `nav`  = ขึ้นเป็นเมนูบนได้ไหม (บางส่วนงานเป็นได้แค่กล่องสรุป เช่น อุณหภูมิ
 *          ที่ต้องเลือกฟาร์ม/โรงเรือนจากป๊อบอัพก่อน ไม่มี URL ตายตัวให้ลิงก์)
 * `tile` = ขึ้นเป็นกล่องสรุปในหน้าภาพรวมได้ไหม
 */
export const SECTIONS = {
  farms: {
    label: "ฟาร์มของฉัน",
    icon: "home",
    to: "/dashboard/farms",
    end: true,
    nav: true,
    tile: true,
  },
  barns: {
    label: "โรงเรือน",
    icon: "thermometer",
    to: BARNS_HOME,
    match: "/dashboard/farms/",
    nav: true,
    tile: false,
  },
  pigs: {
    label: "จำนวนสุกร",
    icon: "pig",
    to: "/dashboard/pigs",
    nav: true,
    tile: true,
  },
  herd: {
    label: "ฝูงสุกร",
    icon: "pulse",
    to: "/dashboard/herd",
    nav: true,
    tile: true,
  },
  feed: {
    label: "อาหาร & น้ำ",
    icon: "feed",
    to: "/dashboard/feed",
    nav: true,
    tile: true,
  },
  climate: {
    label: "อุณหภูมิ / ความชื้น",
    icon: "drop",
    /* มีหน้าของตัวเองแล้ว (/dashboard/climate = ทุกฟาร์ม) จึงขึ้นเมนูบนได้
       — เมื่อก่อนต้องเลือกฟาร์ม/โรงเรือนจากป๊อบอัพก่อน เลยไม่มี URL ตายตัวให้ลิงก์ */
    to: "/dashboard/climate",
    nav: true,
    tile: true,
  },
  env: {
    label: "สภาพแวดล้อม",
    icon: "wind",
    to: "/dashboard/environment",
    nav: true,
    tile: true,
  },
  /**
   * อากาศ**นอก**โรงเรือน (เสาอากาศ + พยากรณ์) — คู่กับ env ที่เป็นอากาศในเล้า
   * วางติดกันเหมือนในแถบเมนูซ้าย เพราะเป็นเรื่องเดียวกันคนละฝั่งกำแพง
   *
   * `tile: false` — ยังไม่มีกล่องสรุปของหน้านี้ใน `TILES()` ของ Overview.jsx
   * ถ้าเปิดเป็น true โดยไม่เขียนกล่องก่อน คนเลือกมาแล้วจะได้ช่องว่างเปล่า ๆ
   * (Overview ข้ามกล่องที่ไม่รู้จักด้วย `if (!tile) return null`)
   */
  weather: {
    label: "สภาพอากาศ",
    icon: "sun",
    to: "/dashboard/weather",
    nav: true,
    tile: false,
  },
  cameras: {
    label: "กล้อง AI",
    icon: "camera",
    to: "/dashboard/cameras",
    nav: true,
    tile: true,
  },
  alerts: {
    label: "การแจ้งเตือน",
    icon: "bell",
    to: "/dashboard/alerts",
    nav: true,
    tile: true,
  },
  finance: {
    label: "การเงิน",
    icon: "wallet",
    to: "/dashboard/finance",
    nav: true,
    tile: true,
  },
};

/** key ของส่วนงานที่ขึ้นเมนูบนได้ / ขึ้นกล่องสรุปได้ — ใช้ในหน้าตั้งค่า */
export const NAV_KEYS = Object.keys(SECTIONS).filter((k) => SECTIONS[k].nav);
export const TILE_KEYS = Object.keys(SECTIONS).filter((k) => SECTIONS[k].tile);

/** จำนวนเมนู/กล่องสรุปที่แถวหนึ่งรับไหว — เกินกว่านี้แถบเมนูจะล้นและกล่องจะเล็กจนอ่านยาก */
export const MAX_NAV = 4;
export const MAX_TILES = 4;

/**
 * ธีมบทบาท 10 + "ปรับค่าเอง" อีก 1
 *
 * `nav`   เมนูบน (เมนู "ภาพรวม" ถูกเติมให้เป็นอันแรกเสมอ ไม่ต้องใส่ที่นี่)
 * `tiles` ลำดับกล่องสรุปในหน้าภาพรวม — อันแรกคือสิ่งที่บทบาทนี้เปิดมาต้องเห็นก่อน
 */
export const ROLE_THEMES = [
  {
    id: "husbandry",
    name: "สัตวบาล",
    icon: "pig",
    tagline: "ดูแลฝูงและการเจริญเติบโตรายโรงเรือน",
    nav: ["pigs", "herd", "barns", "feed"],
    tiles: ["pigs", "herd", "feed", "alerts"],
  },
  {
    id: "caretaker",
    name: "ผู้ดูแลฟาร์ม",
    icon: "home",
    tagline: "งานประจำวันหน้างาน — เดินโรงเรือน ให้อาหาร เก็บข้อมูล",
    nav: ["farms", "barns", "feed", "alerts"],
    /* สลับ "จำนวนสุกร" เป็น "กล้อง AI" — งานหลักคือเดินดูโรงเรือน กล้องช่วยดูก่อนเดิน
       และตัวเลข AI นับได้ก็อยู่ในหน้ากล้องอยู่แล้ว */
    tiles: ["alerts", "climate", "feed", "cameras"],
  },
  {
    id: "vet",
    name: "สัตวแพทย์",
    icon: "pulse",
    tagline: "สุขภาพสัตว์ การสูญเสีย และสิ่งผิดปกติที่ต้องเข้าดู",
    nav: ["herd", "alerts", "barns", "pigs"],
    /* สลับ "จำนวนสุกร" เป็น "กล้อง AI" — ดูอาการสัตว์จากภาพก่อนตัดสินใจเข้าโรงเรือน
       (เข้าโรงเรือนทีต้องอาบน้ำเปลี่ยนชุด ดูจากกล้องก่อนจึงคุ้มกว่า) */
    tiles: ["alerts", "herd", "cameras", "climate"],
  },
  {
    id: "manager",
    name: "ผู้จัดการฟาร์ม",
    icon: "chart",
    tagline: "ภาพรวมทุกฟาร์มในความรับผิดชอบ",
    nav: ["farms", "barns", "pigs", "feed"],
    /* เรียงตามที่ผู้ใช้กำหนดในแบบหน้าแรก: ฟาร์ม → สุกร → แจ้งเตือน → อุณหภูมิ */
    tiles: ["farms", "pigs", "alerts", "climate"],
  },
  {
    id: "owner",
    name: "เจ้าของฟาร์ม",
    icon: "globe",
    tagline: "ผลประกอบการและสถานะรวมของทั้งเครือ",
    nav: ["farms", "finance", "pigs", "alerts"],
    tiles: ["finance", "farms", "pigs", "alerts"],
  },
  {
    id: "nutrition",
    name: "นักโภชนาการอาหารสัตว์",
    icon: "feed",
    tagline: "สูตรอาหาร ปริมาณการกิน และการเปลี่ยนเป็นน้ำหนัก",
    nav: ["feed", "herd", "pigs", "barns"],
    tiles: ["feed", "pigs", "herd", "finance"],
  },
  {
    id: "technician",
    name: "ช่างเทคนิค",
    icon: "monitor",
    tagline: "เซนเซอร์ อุปกรณ์ และจุดที่สัญญาณขาด",
    nav: ["barns", "alerts", "env", "farms"],
    /* สลับ "ฟาร์มของฉัน" เป็น "กล้อง AI" — กล้องคืออุปกรณ์ที่บทบาทนี้ต้องดูแล
       และกล่องนี้บอก "ไม่มีสัญญาณกี่โรงเรือน" ตรงกับงานหาจุดที่สัญญาณขาด */
    tiles: ["alerts", "env", "cameras", "climate"],
  },
  {
    id: "climate",
    name: "ผู้ควบคุมสภาพแวดล้อม",
    icon: "wind",
    tagline: "อุณหภูมิ ความชื้น การระบายอากาศ และแก๊สในโรงเรือน",
    nav: ["barns", "env", "alerts", "feed"],
    tiles: ["climate", "env", "alerts", "pigs"],
  },
  {
    id: "finance",
    name: "ฝ่ายบัญชี-การเงิน",
    icon: "wallet",
    tagline: "ต้นทุน รายรับ และจุดคุ้มทุน",
    nav: ["finance", "feed", "pigs", "farms"],
    tiles: ["finance", "feed", "pigs", "farms"],
  },
  {
    id: "biosecurity",
    name: "ฝ่ายความปลอดภัยชีวภาพ",
    icon: "shield",
    tagline: "เฝ้าระวังความเสี่ยงและการเข้าออกพื้นที่เลี้ยง",
    nav: ["farms", "barns", "alerts", "herd"],
    /* สลับ "อุณหภูมิ/ความชื้น" เป็น "กล้อง AI" — บทบาทนี้เฝ้าการเข้าออกพื้นที่เลี้ยง
       กล้องคือเครื่องมือหลัก ส่วนอุณหภูมิเป็นงานของผู้ควบคุมสภาพแวดล้อม */
    tiles: ["alerts", "farms", "herd", "cameras"],
  },
  {
    id: "custom",
    name: "ปรับค่าเอง",
    icon: "pencil",
    tagline: "เลือกเมนูและกล่องสรุปที่อยากเห็นด้วยตัวเอง",
    /* ค่าตั้งต้นของธีมนี้ = ธีมผู้จัดการฟาร์ม แล้วผู้ใช้ค่อยแก้ในหน้าตั้งค่า */
    nav: ["farms", "barns", "pigs", "feed"],
    tiles: ["farms", "pigs", "climate", "alerts"],
    custom: true,
  },
];

export const DEFAULT_ROLE = "manager";

/**
 * โหมดโทนสี — ค่าสีจริงอยู่ใน styles/modes.css (`[data-mode="<id>"]`)
 * ที่นี่เก็บแค่ชื่อไทยกับว่าเป็นโทนสว่างหรือมืด
 */
export const COLOR_MODES = [
  { id: "cream", name: "ครีมทอง", scheme: "light", note: "โทนตั้งต้นของแบรนด์" },
  { id: "daylight", name: "ขาวกลางวัน", scheme: "light", note: "เทาฟ้าคมชัด สู้แสงจ้า" },
  { id: "meadow", name: "ทุ่งเขียว", scheme: "light", note: "เขียวใบไม้อ่อน สบายตา" },
  { id: "blossom", name: "ชมพูหมู", scheme: "light", note: "โทนอ่อนโยน" },
  { id: "paper", name: "กระดาษเซเปีย", scheme: "light", note: "อุ่นที่สุด แสงฟ้าน้อย" },
  { id: "seafoam", name: "มิ้นต์ทะเล", scheme: "light", note: "เขียวน้ำทะเล เย็นตาไม่หวาน" },
  { id: "lilac", name: "ลาเวนเดอร์", scheme: "light", note: "ม่วงอ่อน นุ่มแต่ยังคม" },
  { id: "terracotta", name: "ดินเผา", scheme: "light", note: "ส้มอิฐอุ่น เข้ากับภาพฟาร์ม" },
  { id: "slate", name: "หินชนวน", scheme: "light", note: "เทากลางไร้สี ให้ตัวเลขเด่นคนเดียว" },
  { id: "crisp", name: "ขาวคมชัด", scheme: "light", note: "หมึกเกือบดำ ไว้ใช้กลางแดด" },
  { id: "midnight", name: "ราตรีทอง", scheme: "dark", note: "โหมดมืดของโทนแบรนด์" },
  { id: "navy", name: "น้ำเงินลึก", scheme: "dark", note: "โทนห้องควบคุม" },
  { id: "forest", name: "ป่าดึก", scheme: "dark", note: "เขียวเข้ม สบายตาที่สุด" },
  { id: "plum", name: "ม่วงราตรี", scheme: "dark", note: "โทนเย็นแบบพลบค่ำ" },
  { id: "carbon", name: "ดำสนิท", scheme: "dark", note: "คอนทราสต์สูง ประหยัดแบต OLED" },
  { id: "abyss", name: "ทะเลลึก", scheme: "dark", note: "เขียวน้ำทะเลเข้ม เย็นไม่หม่น" },
  { id: "graphite", name: "เทาเงิน", scheme: "dark", note: "เทาไร้สี สุภาพที่สุด" },
  { id: "indigo", name: "ครามราตรี", scheme: "dark", note: "น้ำเงินอมม่วง สีเน้นครามอ่อน" },
  { id: "orchid", name: "กล้วยไม้ราตรี", scheme: "dark", note: "บานเย็น คู่มืดของชมพูหมู" },
  { id: "mocha", name: "มอคค่า", scheme: "dark", note: "น้ำตาลกาแฟ อุ่นแบบไม่ใช้ทอง" },
];

export const DEFAULT_MODE = "cream";

export const LIGHT_MODES = COLOR_MODES.filter((m) => m.scheme === "light");
export const DARK_MODES = COLOR_MODES.filter((m) => m.scheme === "dark");

export const getRole = (id) =>
  ROLE_THEMES.find((r) => r.id === id) ?? ROLE_THEMES.find((r) => r.id === DEFAULT_ROLE);

export const getMode = (id) =>
  COLOR_MODES.find((m) => m.id === id) ?? COLOR_MODES.find((m) => m.id === DEFAULT_MODE);
