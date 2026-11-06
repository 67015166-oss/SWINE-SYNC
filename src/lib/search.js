/**
 * ค้นหาทั่วระบบ — ใช้กับช่องค้นหาบนแถบเมนู (components/layout/SearchBox.jsx)
 *
 * ค้นได้ทั้ง: ตัวเลขสรุป (KPI) · หน้า/เมนู · ฟาร์ม · โรงเรือน · ประเภทสุกร
 * ทุกผลลัพธ์ต้องมีปลายทางที่เปิดได้จริง (ไม่มีผลลัพธ์ที่กดแล้วไม่ไปไหน)
 *
 * **กติกาการจับคู่**: เทียบกับ "ข้อความที่ผู้ใช้เห็นจริง" เท่านั้น (ชื่อ + บรรทัดคำอธิบาย)
 * ไม่มีคำพ้องที่ซ่อนอยู่ เพราะเคยทำให้พิมพ์ "ค" แล้ว "โรงเรือนทั้งหมด" โผล่ขึ้นมา
 * (ไปตรงกับคำพ้องที่ซ่อนไว้ว่า "อาคาร") — ผู้ใช้มองไม่เห็นว่าตรงตรงไหน จึงงง
 *
 * ดัชนีสร้างครั้งเดียวตอนโหลดไฟล์ เพราะ mock data เป็นค่าคงที่
 * เมื่อต่อ API จริง: สร้าง buildIndex() ใหม่ตอนข้อมูลเปลี่ยน แล้วเรียก searchAll() เหมือนเดิม
 */
import { farms, summarizeFarms } from "../data/mock/farms.js";
import { getFarmBarns } from "../data/mock/barnsByFarm.js";
import { PIG_TYPES } from "../data/mock/pigTypes.js";
import { BARNS_HOME } from "../components/layout/topNav.js";
import { formatNumber, formatNumber1 } from "./format.js";
import { thaiOnly, translateItem } from "./searchText.js";

/**
 * กล่องตัวเลขสรุป — โผล่ก่อนใครเมื่อคำค้นตรง (เช่นพิมพ์ "โรงเรือน" ต้องเห็นยอดรวมโรงเรือน)
 *
 * คิดจาก "รายการฟาร์มที่ส่งเข้ามา" ไม่ใช่จากข้อมูลตัวอย่างตอนโหลดไฟล์ —
 * เดิมคำนวณครั้งเดียวเป็นค่าคงที่ ผู้ใช้เพิ่ม/ลบฟาร์มแล้วตัวเลขในช่องค้นหาไม่ขยับตาม
 * (และปลายทางของ KPI อุณหภูมิผูกกับฟาร์มแรกของข้อมูลตัวอย่าง ลบฟาร์มนั้นแล้วลิงก์ตาย)
 */
const kpisOf = (list) => {
  const summary = summarizeFarms(list);
  return [
    {
      id: "kpi-farms",
      label: "ฟาร์มทั้งหมด",
      value: formatNumber(summary.total),
      unit: "ฟาร์ม",
      icon: "pin",
      to: "/dashboard/farms",
    },
    {
      id: "kpi-barns",
      label: "โรงเรือนทั้งหมด",
      value: formatNumber(summary.barns),
      unit: "หลัง",
      icon: "home",
      to: BARNS_HOME,
    },
    {
      id: "kpi-pigs",
      label: "จำนวนสุกรทั้งหมด",
      value: formatNumber(summary.pigs),
      unit: "ตัว",
      icon: "pig",
      to: "/dashboard/pigs",
    },
    {
      id: "kpi-alerts",
      label: "การแจ้งเตือน",
      value: formatNumber(summary.alerts),
      unit: "รายการ",
      icon: "bell",
      to: "/dashboard/alerts",
    },
    {
      id: "kpi-climate",
      label: "อุณหภูมิ / ความชื้นเฉลี่ย",
      /* ลิสต์ว่าง (ลบฟาร์มหมด) ทำให้ค่าเฉลี่ยเป็น NaN — format คืนขีดกลางให้เอง */
      value: `${formatNumber1(summary.avgTempC)} °C / ${formatNumber(
        list.length > 0 ? Math.round(summary.avgHumidity) : null
      )}%`,
      icon: "thermometer",
      /* หน้าอุณหภูมิทุกฟาร์ม — ไม่ต้องเดาว่าจะพาไปโรงเรือนไหน จึงไม่มีวันเป็นลิงก์ตาย */
      to: "/dashboard/climate",
    },
  ];
};

/** หน้า/เมนูทั้งหมดที่เปิดได้จริง */
const PAGES = [
  { label: "ภาพรวม", icon: "chart", to: "/dashboard", meta: "แผนที่และสถานะทุกฟาร์ม" },
  { label: "ฟาร์มของฉัน", icon: "pin", to: "/dashboard/farms", meta: "รายการฟาร์มทั้งหมด" },
  { label: "โรงเรือน", icon: "home", to: BARNS_HOME, meta: "รายการโรงเรือนรายฟาร์ม" },
  { label: "จำนวนสุกร", icon: "pig", to: "/dashboard/pigs", meta: "แยกตามประเภทการเลี้ยง" },
  { label: "การแจ้งเตือน", icon: "bell", to: "/dashboard/alerts", meta: "ศูนย์การแจ้งเตือน" },
  { label: "ฝูงสุกร", icon: "pulse", to: "/dashboard/herd", meta: "สุขภาพและประชากรสุกร" },
  { label: "อาหาร & น้ำหนัก", icon: "feed", to: "/dashboard/feed", meta: "อาหารและน้ำหนักสุกร" },
  /* สี่หน้านี้เคยตกสำรวจ — มีเมนูซ้ายพาไปได้ แต่ค้นชื่อตัวเองแล้วไม่เจอเลยสักผลลัพธ์
     (พิมพ์ "กล้อง" หรือ "สภาพอากาศ" ได้ผลลัพธ์ว่าง ทั้งที่ทั้งสองหน้าเปิดอยู่ได้จริง)
     **เพิ่มหน้าใหม่ที่นี่ทุกครั้งที่เพิ่ม route** ไม่งั้นช่องค้นหาจะเก่ากว่าตัวแอปเรื่อย ๆ */
  { label: "อุณหภูมิและความชื้น", icon: "drop", to: "/dashboard/climate", meta: "อุณหภูมิ / ความชื้น ทุกฟาร์ม" },
  { label: "สภาพอากาศ", icon: "sun", to: "/dashboard/weather", meta: "อากาศนอกโรงเรือนจากเสาอากาศ · พยากรณ์" },
  { label: "ระบบควบคุมสภาพแวดล้อม", icon: "wind", to: "/dashboard/environment", meta: "อากาศในเล้า · อุปกรณ์ · ระบบไฟฟ้า" },
  { label: "กล้อง AI", icon: "camera", to: "/dashboard/cameras", meta: "ผนังกล้องทุกฟาร์ม" },
  { label: "การเงิน", icon: "wallet", to: "/dashboard/finance", meta: "รายรับ ต้นทุน กำไร" },
];

/** ฟาร์มทุกแห่ง — รับรายการมาจากผู้เรียก เพราะผู้ใช้เพิ่มฟาร์มเองได้ (ค้นหาต้องเจอด้วย) */
const farmItems = (list) =>
  list.map((f) => ({
    label: f.name,
    /* ฟาร์มจากหลังบ้านยังไม่มีอำเภอ — กรองค่าว่างทิ้งก่อนต่อจุดคั่น ไม่งั้นขึ้นคำว่า "null" */
    metaParts: [f.id, f.district, f.province],
    icon: "pin",
    to: `/dashboard/farms/${f.id}`,
  }));

/** โรงเรือนทุกหลังของทุกฟาร์ม */
const barnItems = (list, barnsOf) =>
  list.flatMap((f) =>
    barnsOf(f.id).map((b) => ({
      label: b.name,
      /* ช่วงวัยกับจำนวนสุกรยังว่างได้ (โรงเรือนจริงยังไม่มีข้อมูลฝูง) — ตัดส่วนที่ไม่รู้ทิ้ง */
      metaParts: [
        f.name,
        b.zone ? { key: "โซน {zone}", vars: { zone: b.zone } } : null,
        b.stage,
        b.pigs == null ? null : { key: "{n} ตัว", vars: { n: formatNumber(b.pigs) } },
      ],
      icon: "home",
      to: `/dashboard/farms/${f.id}/barns/${b.id}`,
    }))
  );

/** ประเภทสุกร */
const PIG_ITEMS = PIG_TYPES.map((t) => ({
  label: t.name,
  metaParts: [t.short, { key: "{n} ตัว", vars: { n: formatNumber(t.count) } }, t.ageRange],
  icon: "pig",
  to: `/dashboard/pigs/${t.id}`,
}));

const norm = (text) => String(text ?? "").toLowerCase().trim();



/* เทียบกับ "ตัวหนังสือที่ผู้ใช้เห็นจริง" เท่านั้น คือชื่อกับบรรทัดคำอธิบายใต้ชื่อ
   ห้ามเทียบคำพ้องที่ซ่อนไว้ เพราะพิมพ์ "ค" แล้วผลลัพธ์ที่ไม่มี ค โผล่มา = งงมาก */
const hit = (item, q) => norm(item.label).includes(q) || norm(item.meta).includes(q);

/**
 * ค้นหาทุกหมวด
 *
 * @param {string} query คำค้น
 * @param {number} [limit] จำนวนผลลัพธ์สูงสุดต่อหมวด
 * @param {object} [scope] ขอบเขตข้อมูลที่จะค้น — { farms, barnsOf } จาก useAllFarms()
 *   ไม่ส่งมาจะค้นเฉพาะข้อมูลระบบ (ฟาร์มที่ผู้ใช้เพิ่มเองจะหาไม่เจอ)
 * @param {Function} [tr] ตัวแปลภาษา (t จาก useT) — ไม่ส่งมา = ไทยล้วน
 * @returns {{kpis: Array, groups: Array<{id, label, items: Array, total: number, to?: string}>}}
 */
export function searchAll(query, limit = 5, scope = null, tr = thaiOnly) {
  const list = scope?.farms ?? farms;
  const barnsOf = scope?.barnsOf ?? ((id) => getFarmBarns(id) ?? []);
  const inLang = translateItem(tr);
  const q = norm(query);
  if (q.length === 0) return { kpis: [], groups: [], total: 0 };

  const kpis = kpisOf(list).map(inLang).filter((k) => hit(k, q));
  const pick = (items) => items.map(inLang).filter((it) => hit(it, q));

  const groups = [
    { id: "pages", label: "หน้าในระบบ", all: pick(PAGES) },
    { id: "farms", label: "ฟาร์ม", all: pick(farmItems(list)), to: "/dashboard/farms" },
    { id: "barns", label: "โรงเรือน", all: pick(barnItems(list, barnsOf)), to: BARNS_HOME },
    { id: "pigs", label: "ประเภทสุกร", all: pick(PIG_ITEMS), to: "/dashboard/pigs" },
  ]
    .filter((g) => g.all.length > 0)
    .map((g) => ({
      id: g.id,
      label: g.label,
      to: g.to,
      total: g.all.length,
      items: g.all.slice(0, limit),
    }));

  const total = kpis.length + groups.reduce((sum, g) => sum + g.total, 0);
  return { kpis, groups, total };
}

/** ผลลัพธ์แรกสุด — ใช้ตอนกด Enter ในช่องค้นหา */
export function firstResult(query, scope = null, tr = thaiOnly) {
  const { kpis, groups } = searchAll(query, 1, scope, tr);
  return kpis[0] ?? groups[0]?.items[0] ?? null;
}
