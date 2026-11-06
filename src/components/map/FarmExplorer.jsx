/**
 * การ์ดแผนที่ + ค้นหา/กรอง + รายชื่อฟาร์ม — ใช้ร่วมกันระหว่างหน้าแรก (/) และแดชบอร์ด (/dashboard)
 *
 * สถานะทั้งหมดถูกยกขึ้นไปไว้ที่หน้าแม่ผ่าน hook `useFarmFilters` เพื่อให้กล่องสถิติ
 * ของแต่ละหน้ากดเพื่อกรองได้ (กดกล่อง → เปิดรายชื่อฟาร์มข้างแผนที่)
 *
 * ตัวอย่างการใช้:
 *   const fx = useFarmFilters(farms);
 *   <StatTile onClick={() => fx.pickStatus("warning")} active={fx.isPicked("warning")} … />
 *   <FarmExplorer fx={fx} title="แผนที่ฟาร์มสุกรทั้งหมด" subtitle="…" />
 */
import { Link } from "react-router-dom";
import { hasPin } from "../../lib/geo.js";
import { useT } from "../../lib/i18n/useT.js";
import Card from "../ui/Card.jsx";
import Icon from "../ui/Icon.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";
import FarmMap from "./FarmMap.jsx";
import { REGIONS, STATUS_OPTIONS, PIG_TYPES } from "./useFarmFilters.js";
import { FARM_STATUS_LABEL } from "../../data/mock/farms.js";
import { formatNumber } from "../../lib/format.js";
import "./FarmExplorer.css";

export default function FarmExplorer({
  fx,
  title,
  subtitle,
  className = "",
  cta,
}) {
  const t = useT();
  const { visibleFarms, activeId, listOpen } = fx;
  /* ฟาร์มที่ปักหมุดได้จริง — ฟาร์มที่ผู้ใช้เพิ่มเองอาจยังไม่ได้ใส่พิกัด */
  /* ใช้กติกาเดียวกับที่แผนที่ใช้ (lib/geo.js) — เช็กแค่ != null ไม่พอ
     ค่าว่างหรือ NaN จะกลายเป็นหมุดที่ลองจิจูด 0 แล้วลากกรอบแผนที่ไปแอฟริกา */
  const pinnedFarms = visibleFarms.filter(hasPin);
  const unpinned = visibleFarms.length - pinnedFarms.length;

  return (
    <Card
      title={title ?? t("แผนที่ฟาร์มสุกรทั้งหมด")}
      subtitle={subtitle}
      icon="map"
      className={`fx ${className}`.trim()}
    >
      <div className="fx-toolbar">
        <span className="fx-search">
          <Icon name="search" size={19} className="fx-search-icon" />
          <input
            type="search"
            className="fx-input"
            value={fx.query}
            onChange={(e) => fx.setQuery(e.target.value)}
            placeholder={t("ค้นหาชื่อฟาร์ม / จังหวัด / รหัสฟาร์ม")}
            aria-label={t("ค้นหาฟาร์ม")}
          />
        </span>
        <select
          className="fx-select"
          value={fx.region}
          onChange={(e) => fx.setRegion(e.target.value)}
          aria-label={t("กรองตามภาค")}
        >
          <option value="all">{t("ทุกภาค")}</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {t(r)}
            </option>
          ))}
        </select>
        <select
          className="fx-select"
          value={fx.status}
          onChange={(e) => {
            fx.setStatus(e.target.value);
            fx.setListOpen(true);
          }}
          aria-label={t("กรองตามสถานะ")}
        >
          <option value="all">{t("ทุกสถานะ")}</option>
          {STATUS_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {t(label)}
            </option>
          ))}
        </select>

        <select
          className="fx-select"
          value={fx.pigType}
          onChange={(e) => fx.setPigType(e.target.value)}
          aria-label={t("กรองตามประเภทสุกร")}
        >
          <option value="all">{t("ทุกประเภทสุกร")}</option>
          {PIG_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(type)}
            </option>
          ))}
        </select>

        {fx.isFiltered && (
          <button type="button" className="fx-btn" onClick={fx.clearFilters}>
            <Icon name="cross" size={17} />
            {t("ล้างตัวกรอง")}
          </button>
        )}
        <button
          type="button"
          className="fx-btn"
          onClick={() => fx.setListOpen(!listOpen)}
          aria-pressed={listOpen}
        >
          <Icon name="list" size={17} />
          {listOpen ? t("ซ่อนรายชื่อฟาร์ม") : t("แสดงรายชื่อฟาร์ม")}
        </button>
      </div>

      {visibleFarms.length === 0 ? (
        <p className="fx-empty">
          {t("ไม่พบฟาร์มที่ตรงกับเงื่อนไข — ลองแก้คำค้นหรือกด “ล้างตัวกรอง”")}
        </p>
      ) : (
        <div className={"map-layout" + (listOpen ? "" : " is-map-only")}>
          {/* แผนที่วาดได้เฉพาะฟาร์มที่มีพิกัด — ฟาร์มที่ผู้ใช้เพิ่มเองโดยไม่ใส่พิกัดต้องถูกข้าม
              ไม่งั้นคำนวณตำแหน่งจาก null แล้วได้ NaN ทั้งแผนที่ (ยังอยู่ในรายชื่อด้านล่างตามปกติ) */}
          <FarmMap farms={pinnedFarms} selectedId={activeId} onSelect={fx.pickFarm} />

          {unpinned > 0 && (
            <p className="fx-unpinned" role="status">
              <Icon name="pin" size={16} aria-hidden="true" />
              {t("มี {n} ฟาร์มที่ยังไม่ได้ใส่พิกัด จึงยังไม่ขึ้นหมุด — แก้ไขฟาร์มแล้วใส่พิกัดได้", {
                n: formatNumber(unpinned),
              })}
            </p>
          )}

          {listOpen && (
            <aside className="map-rail fx-rail">
              <div className="map-rail-head">
                <h4 className="map-rail-title">
                  {t("รายชื่อฟาร์ม")}
                  <span className="fx-rail-count num">
                    {formatNumber(visibleFarms.length)} / {formatNumber(fx.farms.length)}
                  </span>
                </h4>
                <button
                  type="button"
                  className="map-rail-close"
                  onClick={() => fx.setListOpen(false)}
                  aria-label={t("ซ่อนรายชื่อฟาร์ม")}
                >
                  <Icon name="cross" size={18} />
                </button>
              </div>

              <ul className="fx-farm-list">
                {visibleFarms.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className={"fx-farm-row" + (f.id === activeId ? " is-active" : "")}
                      onClick={() => fx.setSelectedId(f.id === activeId ? null : f.id)}
                      aria-pressed={f.id === activeId}
                    >
                      <span className="fx-farm-name">
                        {t(f.name)}
                        <span className="fx-farm-place">
                          {t(f.district)} · {t(f.province)}
                        </span>
                      </span>
                      <StatusBadge tone={f.status}>
                        {t(FARM_STATUS_LABEL[f.status])}
                      </StatusBadge>
                    </button>
                  </li>
                ))}
              </ul>

              {cta && (
                <Link className="map-rail-link" to={cta.to}>
                  {cta.label}
                  <Icon name="chevron" size={16} />
                </Link>
              )}
            </aside>
          )}
        </div>
      )}

      {/* คำอธิบายสีหมุด — กดเพื่อกรองเฉพาะสถานะนั้นได้ (ไอคอน + ข้อความ ไม่ใช่สีอย่างเดียว) */}
      <ul className="fx-legend">
        {Object.entries(FARM_STATUS_LABEL).map(([value, label]) => (
          <li key={value}>
            <button
              type="button"
              className={"fx-legend-btn" + (fx.isPicked(value) ? " is-active" : "")}
              onClick={() => fx.pickStatus(value)}
              aria-pressed={fx.isPicked(value)}
            >
              <StatusBadge tone={value}>
                {t(label)}{" "}
                {formatNumber(fx.farms.filter((f) => f.status === value).length)}
              </StatusBadge>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
