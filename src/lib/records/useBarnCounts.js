/**
 * จำนวนสุกรรายโรงเรือน รวมจากทุกทางที่กรอกได้ — **กติกาชุดเดียวของทั้งแอป** (T1.338)
 *
 * ═══ ทำไมต้องแยกมาเป็น hook ═══
 * ตรรกะชุดนี้เขียนไว้ในหน้าจำนวนสุกร (T1.332) แล้วหน้าภาพรวมต้องการเลขเดียวกันพอดี
 * ถ้าคัดลอกไปเขียนซ้ำ วันหนึ่งสองหน้าจะตอบคำถามเดียวกันคนละเลข โดยที่ไม่มีอะไรพัง
 * ให้เห็น — ซึ่งแย่กว่าแอปพัง เพราะไม่มีใครรู้ว่าต้องเชื่อหน้าไหน
 * (กติกาเดียวกับ `lib/outdoor.js` ที่หน้าสภาพอากาศกับหน้าสภาพแวดล้อมถือร่วมกัน)
 *
 * ═══ ไล่ตามความน่าเชื่อถือ ═══
 *   1. **บันทึกในฐาน** (`records`)  ยอดเหตุการณ์จริงจาก `barn_log` ผ่าน `useHerdCounts`
 *   2. **ค่าในเครื่องนี้** (`local`) ที่กรอกไว้ตอนยังไม่เข้าสู่ระบบ + ส่วนต่างจาก "ปรับจำนวน"
 *   3. **ข้อมูลตัวอย่าง** (`demo`)   เล้าของฟาร์มตัวอย่างที่ยังไม่มีใครแตะ
 * ยอดผสมรายงาน**ตัวที่อ่อนที่สุด** เสมอ (ดู `barnCountTotal`) — มีของตัวอย่างปนแม้เล้าเดียว
 * ก็ห้ามป้ายว่า "ข้อมูลจริง"
 *
 * ★ เรียก `useHerdCounts` **ที่นี่ที่เดียว** หน้าไหนอยากได้เลขให้เรียก hook นี้
 *   เรียกซ้ำสองที่ในหน้าเดียวกันคือยิง API ซ้ำทุก 30 วินาทีโดยไม่ได้อะไรเพิ่ม
 */
import { useMemo } from "react";
import { useAllFarms } from "./useAllFarms.js";
import { useHerdCounts } from "../api/useHerdCounts.js";
import { useAdjust, targetKey } from "../adjust/useAdjust.js";
import { barnCount, barnCountTotal } from "../herdCount.js";

/**
 * @param {string} [farmId] รหัสฟาร์มที่สนใจ — `"all"` (ค่าตั้งต้น) = ทุกฟาร์มที่มีอยู่ตอนนี้
 * @returns {{rows: Array<{barn, stage, count, from}>, total: object,
 *            farms: Array, barnsOf: Function, status: string}}
 *   `rows[].count` เป็น null = เล้านั้นยังสรุปจำนวนไม่ได้ (คนละเรื่องกับ "มีศูนย์ตัว")
 *   `total` = ผลของ `barnCountTotal` → `{count, knownBarns, unknownBarns, from}`
 */
export function useBarnCounts(farmId = "all") {
  const { farms, barnsOf } = useAllFarms();
  const { valueOf, netOf } = useAdjust();

  const liveFarms = useMemo(() => farms.filter((f) => f.apiId), [farms]);
  const realHerd = useHerdCounts(liveFarms);

  const rows = useMemo(() => {
    const countById = Object.fromEntries(
      /* ★ ใช้ของที่อ่านได้ล่าสุดเสมอ ไม่ผูกกับ status === "ready" (T1.333)
         hook เก็บค่าเดิมไว้ระหว่างโหลดซ้ำแล้ว ถ้าตรงนี้ยังรอ "ready" อย่างเดียว
         ตัวเลขก็ยังกระพริบทุก 30 วินาทีอยู่ดี */
      (realHerd.farms ?? []).flatMap(({ farm, byBarn }) =>
        Object.entries(byBarn).map(([code, r]) => [`${farm.id}-${code}`, r]),
      ),
    );
    /* ★ ฟาร์มที่บันทึกยังมาไม่ถึง — ห้ามเอาค่าในเครื่องมาโชว์ไปก่อน (T1.340)
       `barnCount` ให้บันทึกในฐานชนะค่าในเครื่องเสมอ (ตั้งใจ) ผลคือถ้าโชว์ค่าในเครื่อง
       ระหว่างรอ พอบันทึกมาถึงตัวเลขจะ**เด้งกลับ**ทันที
       ผู้ใช้เห็นเป็น "ขึ้นแป๊บเดียวแล้วกลับมาเป็นค่าเดิม" ซึ่งดูเหมือนแอปพัง
       ตอบว่า "ยังไม่รู้" ระหว่างรอ ตรงกับความจริงมากกว่า และไม่เด้ง */
    const waiting = new Set(
      farms
        .filter((f) => f.apiId && !(realHerd.farms ?? []).some((r) => r.farm.id === f.id))
        .map((f) => f.id),
    );
    const pick = farmId === "all" ? farms : farms.filter((f) => f.id === farmId);
    return pick.flatMap((f) =>
      (barnsOf(f.id) ?? []).map((b) => {
        if (waiting.has(f.id)) return { barn: b, stage: b.stage ?? null, count: null, from: null };
        const got = barnCount(countById[b.id], valueOf(targetKey("barn", b.id), b.pigs));
        /* ★ เล้าของฟาร์มตัวอย่างที่ยังไม่มีใครแก้ = ข้อมูลตัวอย่าง ไม่ใช่ "บันทึกในเครื่องนี้"
           ถ้ามีส่วนต่างจาก "ปรับจำนวน" อยู่ แปลว่าคนในเครื่องนี้แก้แล้วจริง ๆ */
        const touched = netOf(targetKey("barn", b.id)) !== 0;
        const from =
          got.from === "local" && b.dataSource === "demo" && !touched ? "demo" : got.from;
        return { barn: b, stage: b.stage ?? null, count: got.count, from };
      }),
    );
  }, [realHerd, farms, farmId, barnsOf, valueOf, netOf]);

  const total = useMemo(() => barnCountTotal(rows), [rows]);

  return { rows, total, farms, barnsOf, status: realHerd.status };
}
