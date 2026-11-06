/**
 * Mock data: สุกรแยกตามประเภทการเลี้ยง — ใช้ในหน้า /dashboard/pigs
 *
 * ต่อยอดจาก data/mock/farms.js ไม่ได้แก้โครงเดิมของไฟล์ใด
 * ผลรวมของทุกประเภท = ผลรวม farms[].pigs เสมอ — คำนวณจากอาร์เรย์ ไม่ได้ hardcode
 * (เคยเขียนกำกับว่า 60,000 ตัว แต่ตอนนี้เหลือฟาร์มตัวอย่างฟาร์มเดียวแล้ว ตัวเลขจึงเปลี่ยนตาม)
 *
 * สีประจำประเภทใช้ลำดับ SERIES ตาม docs/DESIGN.md และ "ผูกกับประเภทถาวร"
 * ห้ามสลับสีระหว่างหน้า เพราะคนจะจำสีผิดตัว
 */
import { farms, groupPopulationTrend } from "./farms.js";
import { getFarmBarns } from "./barnsByFarm.js";
import { asset } from "../../lib/asset.js";

/** สัดส่วนของแต่ละประเภทในฝูง (รวมกันได้ 1) — ใช้กระจายจำนวนสุกรของแต่ละฟาร์ม */
const SHARE = {
  farrowing: 0.103,
  replacement: 0.057,
  grower: 0.315,
  finisher: 0.525,
};

const TYPE_DEFS = [
  {
    id: "farrowing",
    photo: asset("/pigs/farrowing.jpg"),
    name: "สุกรพันธุ์คลอดลูก",
    short: "พันธุ์คลอดลูก",
    desc: "แม่พันธุ์ช่วงอุ้มท้องถึงเลี้ยงลูกในคอกคลอด",
    barns: 8,
    ageRange: "แม่พันธุ์ 1–5 ครอก",
    avgWeightKg: 205,
    deltaPct: 2.4,
    series: 6,
    tagIcon: "pig",
    tagText: "แม่พันธุ์ · สำหรับการคลอดลูก",
  },
  {
    id: "replacement",
    photo: asset("/pigs/replacement.jpg"),
    name: "สุกรพันธุ์เตรียมทดแทน",
    short: "เตรียมทดแทน",
    desc: "สุกรสาวที่เตรียมขึ้นทดแทนแม่พันธุ์ชุดเดิม",
    barns: 5,
    ageRange: "อายุ 5–8 เดือน",
    avgWeightKg: 118,
    deltaPct: 5.1,
    series: 5,
    tagIcon: "spark",
    tagText: "ทดแทน · อนาคตของฟาร์ม",
  },
  {
    id: "grower",
    photo: asset("/pigs/grower.jpg"),
    name: "สุกรรุ่น",
    short: "สุกรรุ่น",
    desc: "หลังหย่านมถึงก่อนเข้าโรงเรือนขุน",
    barns: 11,
    ageRange: "อายุ 10–16 สัปดาห์",
    avgWeightKg: 42,
    deltaPct: -1.8,
    series: 4,
    tagIcon: "pulse",
    tagText: "รุ่น · อายุยังน้อย",
  },
  {
    id: "finisher",
    photo: asset("/pigs/finisher.jpg"),
    name: "สุกรขุน",
    short: "สุกรขุน",
    desc: "ช่วงขุนจนถึงน้ำหนักส่งตลาด",
    barns: 14,
    ageRange: "อายุ 17–26 สัปดาห์",
    avgWeightKg: 96,
    deltaPct: 3.6,
    series: 1,
    tagIcon: "chart",
    tagText: "ขุน · เพื่อการบริโภค",
  },
];

/**
 * เมทริกซ์ [ฟาร์ม][ประเภท] — กระจายสุกรของแต่ละฟาร์มตามสัดส่วน SHARE
 * ประเภทสุดท้าย (สุกรขุน) รับเศษที่เหลือ ทำให้ผลรวมของ "แต่ละฟาร์ม" ตรงกับ farms[].pigs เป๊ะ
 * และจำนวนของ "แต่ละประเภท" คือผลรวมของคอลัมน์นั้น จึงตรงกันทั้งสองแกน
 */
const MATRIX = farms.map((f) => {
  const head = TYPE_DEFS.slice(0, -1).map(
    (t) => Math.round((f.pigs * SHARE[t.id]) / 10) * 10
  );
  const last = f.pigs - head.reduce((sum, n) => sum + n, 0);
  return [...head, last];
});

export const PIG_TYPES = TYPE_DEFS.map((t, i) => ({
  ...t,
  count: MATRIX.reduce((sum, row) => sum + row[i], 0),
}));

export const totalPigs = PIG_TYPES.reduce((sum, t) => sum + t.count, 0);

/** สัดส่วนของประเภทนั้นเทียบกับทั้งหมด (0–100) */
export const shareOf = (type) => (type.count / totalPigs) * 100;

/** จำนวนสุกรแต่ละประเภทแยกตามฟาร์ม (อ่านจากเมทริกซ์เดียวกัน จึงตรงกับตัวเลขรวมเสมอ) */
export function typeByFarm() {
  return PIG_TYPES.map((type, i) => ({
    ...type,
    rows: farms.map((f, j) => ({
      farmId: f.id,
      farmName: f.name,
      count: MATRIX[j][i],
    })),
  }));
}

/** ประเภทเดียวจาก id (ใช้ในหน้ารายละเอียด) */
export const findType = (typeId) => PIG_TYPES.find((t) => t.id === typeId) ?? null;

/** จำนวนสุกรของประเภทหนึ่งในฟาร์มหนึ่ง — "all" คือรวมทุกฟาร์ม */
export function countOf(typeId, farmId = "all") {
  const i = PIG_TYPES.findIndex((t) => t.id === typeId);
  if (i < 0) return 0;
  if (farmId === "all") return PIG_TYPES[i].count;
  const j = farms.findIndex((f) => f.id === farmId);
  return j < 0 ? 0 : MATRIX[j][i];
}

/**
 * โรงเรือนที่เลี้ยงประเภทนี้ในฟาร์มหนึ่ง
 * แบ่งโรงเรือนของฟาร์มเป็นบล็อกตามสัดส่วนของแต่ละประเภท (เรียงตามลำดับประเภท)
 * โรงเรือนหนึ่งหลังจึงถูกนับให้ประเภทเดียวเท่านั้น — ไม่ซ้ำและครบทุกหลัง
 */
export function barnsOfType(farmId, typeId) {
  const barns = getFarmBarns(farmId) ?? [];
  if (barns.length === 0) return [];

  const typeIndex = PIG_TYPES.findIndex((t) => t.id === typeId);
  if (typeIndex < 0) return [];

  /* จำนวนโรงเรือนที่แต่ละประเภทได้รับ (อย่างน้อยประเภทละ 1 หลังถ้ามีพอ) */
  const counts = PIG_TYPES.map((t) =>
    Math.max(1, Math.round(barns.length * SHARE[t.id]))
  );
  let over = counts.reduce((a, b) => a + b, 0) - barns.length;
  for (let i = counts.length - 1; over > 0 && i >= 0; i--) {
    const cut = Math.min(over, counts[i] - 1);
    counts[i] -= cut;
    over -= cut;
  }

  const start = counts.slice(0, typeIndex).reduce((a, b) => a + b, 0);
  const picked = barns.slice(start, start + counts[typeIndex]);
  if (picked.length === 0) return [];

  /* กระจายจำนวนสุกรของประเภทนี้ลงโรงเรือนตามสัดส่วนสุกรจริงของแต่ละหลัง */
  const total = countOf(typeId, farmId);
  const sumPigs = picked.reduce((sum, b) => sum + b.pigs, 0) || 1;
  const rows = picked.map((b) => ({
    ...b,
    typeCount: Math.round((total * b.pigs) / sumPigs / 10) * 10,
  }));
  rows[rows.length - 1].typeCount +=
    total - rows.reduce((sum, r) => sum + r.typeCount, 0);
  return rows;
}

/**
 * แนวโน้มจำนวนสุกรของประเภทหนึ่งย้อนหลัง 6 เดือน
 * อ้างอิงแนวโน้มรวมของเครือ (groupPopulationTrend) คูณสัดส่วนประเภทและสัดส่วนฟาร์ม
 */
export function trendOf(typeId, farmId = "all") {
  const share = SHARE[typeId] ?? 0;
  const farmShare =
    farmId === "all"
      ? 1
      : (farms.find((f) => f.id === farmId)?.pigs ?? 0) /
        farms.reduce((sum, f) => sum + f.pigs, 0);

  return groupPopulationTrend.map((row) => ({
    month: row.month,
    count: Math.round((row.total * share * farmShare) / 10) * 10,
  }));
}
