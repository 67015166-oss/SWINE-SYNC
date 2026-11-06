/**
 * ตัวกรองของการ์ดแผนที่ (components/map/FarmExplorer.jsx)
 * แยกมาไว้ไฟล์นี้เพื่อให้หน้าแม่ถือ state ได้ และกล่องสถิติกดเพื่อกรองได้
 */
import { useMemo, useState } from "react";
import { farms as allFarms, FARM_STATUS_LABEL } from "../../data/mock/farms.js";

/**
 * ภาคของแต่ละจังหวัด — ใช้เฉพาะตัวกรองในไฟล์นี้
 * (ไม่เพิ่มฟิลด์ลง mock data เพราะหน้าอื่นใช้โครงสร้างเดียวกันอยู่)
 */
const PROVINCE_REGION = {
  เชียงใหม่: "ภาคเหนือ",
  ลำพูน: "ภาคเหนือ",
  ขอนแก่น: "ภาคอีสาน",
  นครสวรรค์: "ภาคกลาง",
  ปราจีนบุรี: "ภาคตะวันออก",
  กำแพงเพชร: "ภาคกลาง",
};

export const regionOf = (farm) => PROVINCE_REGION[farm.province] ?? "ภาคอื่น ๆ";

export const REGIONS = [...new Set(allFarms.map(regionOf))];

/**
 * ตัวกรองสถานะ — ค่าเดียวกันนี้ใช้ทั้งกล่องสถิติที่กดได้ เมนูสถานะ และคำอธิบายใต้แผนที่
 * "online" ไม่ใช่สถานะในข้อมูล แต่คือ "ทุกฟาร์มที่ยังส่งข้อมูลอยู่" (ไม่ออฟไลน์)
 */
export const STATUS_OPTIONS = [
  { value: "online", label: "ออนไลน์" },
  ...Object.entries(FARM_STATUS_LABEL).map(([value, label]) => ({ value, label })),
];

/** ประเภทสุกรทั้งหมดที่มีในข้อมูล — เรียงตามช่วงวัยจริง ไม่ใช่ตามตัวอักษร */
const TYPE_ORDER = ["แม่พันธุ์", "ลูกสุกร", "อนุบาล", "ขุน"];

export const PIG_TYPES = TYPE_ORDER.filter((t) =>
  allFarms.some((f) => f.pigTypes?.includes(t))
);

export const matchesPigType = (farm, pigType) =>
  pigType === "all" || (farm.pigTypes ?? []).includes(pigType);

export const matchesStatus = (farm, status) =>
  status === "all" ||
  (status === "online" ? farm.status !== "offline" : farm.status === status);

/** สถานะและตัวกรองทั้งหมดของการ์ดแผนที่ — เรียกที่หน้าแม่แล้วส่งลงมาทาง prop `fx` */
export function useFarmFilters(farms) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("all");
  const [status, setStatus] = useState("all");
  const [pigType, setPigType] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  /* ปกติซ่อนรายชื่อฟาร์มไว้ให้แผนที่เต็มพื้นที่ — เปิดเมื่อกดกล่องสถิติหรือกดหมุด */
  const [listOpen, setListOpen] = useState(false);

  const visibleFarms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return farms.filter((f) => {
      const matchQuery =
        !q ||
        [f.name, f.province, f.district, f.id].some((v) =>
          v.toLowerCase().includes(q)
        );
      const matchRegion = region === "all" || regionOf(f) === region;
      return (
        matchQuery &&
        matchRegion &&
        matchesStatus(f, status) &&
        matchesPigType(f, pigType)
      );
    });
  }, [farms, query, region, status, pigType]);

  /* ฟาร์มที่เลือกอยู่อาจถูกกรองออกไป — ต้องไม่ค้างเป็นหมุดที่มองไม่เห็น */
  const activeId = visibleFarms.some((f) => f.id === selectedId) ? selectedId : null;

  return {
    farms,
    visibleFarms,
    activeId,
    query,
    setQuery,
    region,
    setRegion,
    status,
    setStatus,
    pigType,
    setPigType,
    listOpen,
    setListOpen,
    setSelectedId,
    isFiltered:
      status !== "all" || region !== "all" || pigType !== "all" || query.trim() !== "",
    isPicked: (value) => listOpen && status === value,

    /** กดกล่องสถิติ/ปุ่มสถานะ: เปิดรายชื่อพร้อมกรอง — กดค่าเดิมซ้ำ = ล้างตัวกรองและซ่อนรายชื่อ */
    pickStatus(value) {
      if (listOpen && status === value) {
        setStatus("all");
        setListOpen(false);
        return;
      }
      setStatus(value);
      setSelectedId(null);
      setListOpen(true);
    },

    /** กดหมุดบนแผนที่ — เปิดรายชื่อให้เห็นว่าเลือกฟาร์มไหนอยู่ */
    pickFarm(id) {
      setSelectedId(id);
      if (id) setListOpen(true);
    },

    clearFilters() {
      setQuery("");
      setRegion("all");
      setStatus("all");
      setPigType("all");
    },
  };
}

