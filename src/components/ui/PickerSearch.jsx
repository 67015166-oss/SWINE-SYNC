/**
 * ช่องค้นหาในป๊อบอัพเลือกฟาร์ม/โรงเรือน — ใช้ร่วมกันทั้งป๊อบอัพอุณหภูมิและป๊อบอัพแจ้งเตือน
 *
 * พิมพ์ชื่อฟาร์ม จังหวัด หรือชื่อโรงเรือน แล้วกดผลลัพธ์ = เลือกให้เลย
 * (เลือกโรงเรือนจะตั้งค่าฟาร์มของโรงเรือนนั้นให้ด้วย ไม่ต้องไล่เลือกทีละขั้น)
 *
 * **กติกาการจับคู่**: เทียบกับข้อความที่ผู้ใช้เห็นบนจอเท่านั้น (ชื่อ + บรรทัดคำอธิบาย)
 * ไม่มีคำพ้องที่ซ่อนอยู่ — กติกาเดียวกับ lib/search.js
 */
import { useMemo, useState } from "react";
import Icon from "./Icon.jsx";
import { useAllFarms } from "../../lib/records/useAllFarms.js";
import { formatNumber } from "../../lib/format.js";
import { useT } from "../../lib/i18n/useT.js";

/** จำนวนผลลัพธ์สูงสุดที่แสดง — ป๊อบอัพเตี้ย ถ้าแสดงหมดจะดันปุ่มยืนยันตกจอ */
const LIMIT = 6;

/* สร้างดัชนีใหม่เมื่อรายการฟาร์มเปลี่ยน — เดิมสร้างครั้งเดียวตอนโหลดไฟล์เพราะ mock เป็นค่าคงที่
   แต่ตอนนี้ผู้ใช้เพิ่มฟาร์ม/โรงเรือนเองได้ ดัชนีจึงต้องตามให้ทัน ไม่งั้นค้นหาของที่เพิ่งเพิ่มไม่เจอ */
const buildItems = (farms, barnsOf) =>
  farms.flatMap((farm) => [
    {
      kind: "farm",
      farmId: farm.id,
      barnId: "",
      label: farm.name,
      meta: t("{id} · จังหวัด {province} · {n} โรงเรือน", {
        id: farm.id,
        province: t(farm.province),
        n: formatNumber(barnsOf(farm.id).length),
      }),
      icon: "pin",
    },
    ...barnsOf(farm.id).map((barn) => ({
      kind: "barn",
      farmId: farm.id,
      barnId: barn.id,
      label: barn.name,
      meta: t("{farm} · โซน {zone} · {stage}", {
        farm: t(farm.name),
        zone: barn.zone,
        stage: t(barn.stage),
      }),
      icon: "home",
    })),
  ]);

const norm = (text) => String(text ?? "").toLowerCase().trim();

/** ไฮไลต์ตัวอักษรที่ตรงคำค้น — ผู้ใช้จะเห็นชัดว่าผลลัพธ์นี้ตรงตรงไหน */
function Highlight({ text, query }) {
  const q = query.trim().toLowerCase();
  const value = String(text ?? "");
  const at = q === "" ? -1 : value.toLowerCase().indexOf(q);
  if (at < 0) return value;
  return (
    <>
      {value.slice(0, at)}
      <mark className="cp-mark">{value.slice(at, at + q.length)}</mark>
      {value.slice(at + q.length)}
    </>
  );
}

/**
 * @param {(pick: {farmId: string, barnId: string}) => void} onPick เลือกผลลัพธ์แล้วทำอะไรต่อ
 */
export default function PickerSearch({ onPick }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const { farms, barnsOf } = useAllFarms();
  const ITEMS = useMemo(() => buildItems(farms, barnsOf), [farms, barnsOf]);

  const q = norm(query);
  const matched =
    q === ""
      ? []
      : ITEMS.filter((item) => norm(item.label).includes(q) || norm(item.meta).includes(q));
  const visible = matched.slice(0, LIMIT);

  const pick = (item) => {
    setQuery("");
    onPick({ farmId: item.farmId, barnId: item.barnId });
  };

  return (
    <div className="cp-search">
      <span className="cp-search-box">
        <Icon name="search" size={19} className="cp-search-icon" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && visible.length > 0) {
              e.preventDefault();
              pick(visible[0]);
            }
            /* Esc ครั้งแรกล้างคำค้น (ไม่ปิดป๊อบอัพทิ้งไปเลย) */
            if (e.key === "Escape" && query !== "") {
              e.stopPropagation();
              setQuery("");
            }
          }}
          placeholder={t("ค้นหาชื่อฟาร์ม จังหวัด หรือชื่อโรงเรือน")}
          aria-label={t("ค้นหาฟาร์มหรือโรงเรือน")}
          autoComplete="off"
        />
      </span>

      {q !== "" &&
        (matched.length === 0 ? (
          <p className="cp-search-empty">
            {t("ไม่พบ “{query}” — ลองพิมพ์ชื่อฟาร์มหรือชื่อโรงเรือน", { query })}
          </p>
        ) : (
          <ul className="cp-results">
            {visible.map((item) => (
              <li key={item.kind + item.farmId + item.barnId}>
                <button type="button" className="cp-result" onClick={() => pick(item)}>
                  <Icon name={item.icon} size={18} />
                  <span className="cp-result-text">
                    <b>
                      <Highlight text={item.label} query={query} />
                    </b>
                    <span>
                      <Highlight text={item.meta} query={query} />
                    </span>
                  </span>
                  <Icon name="chevron" size={15} className="cp-result-arrow" />
                </button>
              </li>
            ))}
            {matched.length > visible.length && (
              <li className="cp-results-more">
                มีอีก {formatNumber(matched.length - visible.length)} รายการ — พิมพ์เพิ่มเพื่อค้นให้แคบลง
              </li>
            )}
          </ul>
        ))}
    </div>
  );
}
