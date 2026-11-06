/**
 * ช่องค้นหาบนแถบเมนู — ค้นได้ทั้งตัวเลขสรุป (KPI) หน้า ฟาร์ม โรงเรือน และประเภทสุกร
 *
 * พิมพ์แล้วผลลัพธ์เด้งลงมาทันที โดยกล่อง KPI ที่ตรงคำค้นจะโชว์ก่อนเป็นแถวบนสุด
 * (เช่นพิมพ์ "โรงเรือน" จะเห็นยอดรวมโรงเรือน 38 หลัง แล้วค่อยเป็นหน้า/รายชื่อโรงเรือน)
 *
 * คีย์บอร์ด: Enter = เปิดผลลัพธ์แรก · Esc = ปิด · กดนอกกล่อง = ปิด
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../ui/Icon.jsx";
import { searchAll, firstResult } from "../../lib/search.js";
import { useAllFarms } from "../../lib/records/useAllFarms.js";
import { useT } from "../../lib/i18n/useT.js";
import { formatNumber } from "../../lib/format.js";

/** ไฮไลต์ตัวอักษรที่ตรงคำค้น — ผู้ใช้จะเห็นชัดว่าผลลัพธ์นี้ตรงตรงไหน */
function Highlight({ text, query }) {
  const q = query.trim().toLowerCase();
  const value = String(text ?? "");
  const at = q === "" ? -1 : value.toLowerCase().indexOf(q);
  if (at < 0) return value;
  return (
    <>
      {value.slice(0, at)}
      <mark className="app-search-mark">{value.slice(at, at + q.length)}</mark>
      {value.slice(at + q.length)}
    </>
  );
}

export default function SearchBox() {
  const t = useT();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  /* ค้นหาต้องครอบคลุมฟาร์ม/โรงเรือนที่ผู้ใช้เพิ่มเองด้วย ไม่ใช่เฉพาะข้อมูลระบบ */
  const scope = useAllFarms();
  /* ส่ง t ให้แปลรายการก่อนเทียบ — ค้นเจอด้วยคำในภาษาที่เห็นบนจอ (T2.1) */
  const result = searchAll(query, 5, scope, t);
  const showPanel = open && query.trim() !== "";

  /* กดที่อื่นหรือกด Esc = ปิดผลลัพธ์ */
  useEffect(() => {
    if (!showPanel) return undefined;
    const onDown = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showPanel]);

  const go = (to) => {
    setOpen(false);
    setQuery("");
    navigate(to);
  };

  const submit = (e) => {
    e.preventDefault();
    const first = firstResult(query, scope, t);
    if (first) go(first.to);
  };

  return (
    <div className="app-search-wrap" ref={boxRef}>
      <form className="app-search" onSubmit={submit} role="search">
        <label className="sr-only" htmlFor="app-search-input">
          {t("ค้นหาฟาร์ม โรงเรือน หรือหน้าในระบบ")}
        </label>
        <Icon name="search" size={18} />
        <input
          id="app-search-input"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t("ค้นหาฟาร์ม / โรงเรือน / เมนู")}
          autoComplete="off"
        />
      </form>

      {showPanel && (
        <div className="app-search-panel">
          {result.total === 0 ? (
            <p className="app-search-empty">
              {t("ไม่พบ “{q}” — ลองพิมพ์ชื่อฟาร์ม ชื่อโรงเรือน หรือชื่อเมนู", { q: query })}
            </p>
          ) : (
            <>
              {/* กล่อง KPI ที่ตรงคำค้น — เด้งขึ้นมาก่อนผลลัพธ์อื่น */}
              {result.kpis.length > 0 && (
                <div className="app-search-kpis">
                  {result.kpis.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      className="app-search-kpi"
                      onClick={() => go(k.to)}
                    >
                      <span className="app-search-kpi-icon" aria-hidden="true">
                        <Icon name={k.icon} size={20} />
                      </span>
                      <span className="app-search-kpi-text">
                        <span className="app-search-kpi-label">
                          <Highlight text={k.label} query={query} />
                        </span>
                        <span className="app-search-kpi-value">
                          <b className="num">{k.value}</b>
                          {k.unit && <em>{k.unit}</em>}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {result.groups.map((g) => (
                <section key={g.id} className="app-search-group">
                  <p className="app-search-group-head">
                    {/* บริบท "หมวดค้นหา" — คำเดียวกันในเมนูแปลคนละแบบ (ฟาร์ม = farms/Farms)
                        และ "รายการ" ตรงนี้คือ "ผลการค้นหา" ไม่ใช่ "รายการแจ้งเตือน" */}
                    {t(`${g.label}|หมวดค้นหา`)}
                    <span className="num">
                      {t("{n} รายการ|ผลค้นหา", { n: formatNumber(g.total) })}
                    </span>
                  </p>
                  <ul>
                    {g.items.map((item) => (
                      <li key={item.to + item.label}>
                        <Link
                          to={item.to}
                          className="app-search-item"
                          onClick={() => {
                            setOpen(false);
                            setQuery("");
                          }}
                        >
                          <Icon name={item.icon} size={18} />
                          <span className="app-search-item-text">
                            <b>
                              <Highlight text={item.label} query={query} />
                            </b>
                            {item.meta && (
                              <span>
                                <Highlight text={item.meta} query={query} />
                              </span>
                            )}
                          </span>
                          <Icon name="chevron" size={15} className="app-search-item-arrow" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {g.to && g.total > g.items.length && (
                    <Link
                      to={g.to}
                      className="app-search-more"
                      onClick={() => {
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      {t("ดูทั้งหมดใน{group} ({n})", {
                        group: t(`${g.label}|หมวดค้นหา`),
                        n: formatNumber(g.total),
                      })}
                      <Icon name="chevron" size={15} />
                    </Link>
                  )}
                </section>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
