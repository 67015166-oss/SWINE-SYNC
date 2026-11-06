/**
 * ไทล์ค่าที่วาดจาก "ทะเบียนชนิดค่า" — ไม่ผูกกับชื่อค่าตัวใดตัวหนึ่ง (T1.346)
 *
 * ═══ ทำไมต้องมี ═══
 * ไทล์เดิมในหน้าสภาพแวดล้อมเขียนไว้ทีละตัว (อุณหภูมิ ความชื้น ลม NH₃ CO₂ H₂S)
 * เซนเซอร์ชนิดใหม่จึงต้องเขียนโค้ดเพิ่มทุกครั้ง ซึ่งเป็นโจทย์ที่ต้องแก้ก่อนต่อ Easy Pairing
 * ไฟล์นี้รับ `spec` จาก `lib/metrics/registry.js` แล้ววาดเอง — ค่าใหม่เสียบเข้าได้ทันที
 *
 * ═══ ★ กติกาที่ห้ามละเมิด: ไม่มีเกณฑ์ = ไม่มีป้ายสถานะ ═══
 * ค่าที่ยังไม่มีใครตั้งเกณฑ์จะขึ้น **เลขกับหน่วย** และบอกตรง ๆ ว่ายังไม่ได้ตั้งเกณฑ์
 * ห้ามขึ้นป้ายเขียว เพราะเท่ากับบอกว่า "ปกติ" ทั้งที่ไม่มีใครรู้ว่าปกติของค่านั้นคือเท่าไร
 * (เหตุผลเต็มอยู่ใน registry.js หัวข้อ "กติกาเรื่องเกณฑ์")
 */
import Icon from "../ui/Icon.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";
import AdminNote from "../ui/AdminNote.jsx";
import { formatNumber, formatNumber1, formatNumber2 } from "../../lib/format.js";
import { heldDisplay } from "../../lib/heldReading.js";
import { statusOf } from "../../lib/metrics/registry.js";
import { STALE_MS } from "../../lib/api/nowReply.js";
import { useState } from "react";

import { useAuth } from "../../lib/auth/useAuth.js";
import { useSettings } from "../../lib/settings/useSettings.js";
import { useT } from "../../lib/i18n/useT.js";
import "./metrics.css";

/** เลือกตัวจัดรูปตามจำนวนทศนิยมที่ทะเบียนกำหนด */
const formatterFor = (decimals) =>
  decimals >= 2 ? formatNumber2 : decimals === 1 ? formatNumber1 : formatNumber;

/**
 * ฟอร์มตั้งเกณฑ์เล็ก ๆ ในไทล์ (T1.346)
 *
 * ★ วางไว้ตรงที่คนเห็นค่า ไม่ใช่ในหน้าตั้งค่า เพราะหน้าตั้งค่าไม่รู้จักชนิดค่า
 *   ที่เพิ่งเสียบเข้ามา — ค่าเหล่านั้นมีอยู่เฉพาะในข้อมูลที่ไหลเข้ามาจริงเท่านั้น
 */
function RangeForm({ spec, current, onSave, onCancel }) {
  const t = useT();
  const [min, setMin] = useState(current?.min ?? "");
  const [max, setMax] = useState(current?.max ?? "");
  const [error, setError] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    const lo = min === "" ? null : Number(min);
    const hi = max === "" ? null : Number(max);

    if ((lo != null && !Number.isFinite(lo)) || (hi != null && !Number.isFinite(hi)))
      return setError(t("กรอกเป็นตัวเลข"));
    /* ไม่กรอกเลยสองช่อง = ยังไม่มีเกณฑ์ ไม่ใช่เกณฑ์ว่าง */
    if (lo == null && hi == null) return setError(t("กรอกอย่างน้อยหนึ่งช่อง"));
    if (lo != null && hi != null && lo >= hi) return setError(t("ค่าต่ำสุดต้องน้อยกว่าค่าสูงสุด"));

    setError(null);
    onSave(lo == null ? { max: hi } : hi == null ? { min: lo } : { min: lo, max: hi });
  };

  return (
    <form className="mt-form" onSubmit={submit}>
      <label className="mt-field">
        <span>{t("ต่ำสุด")}</span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={min}
          onChange={(e) => { setMin(e.target.value); setError(null); }}
        />
      </label>
      <label className="mt-field">
        <span>{t("สูงสุด")}</span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={max}
          onChange={(e) => { setMax(e.target.value); setError(null); }}
        />
      </label>
      {spec.unit && <span className="mt-form-unit">{spec.unit}</span>}

      {error && <p className="mt-error" role="alert">{error}</p>}

      <span className="mt-form-actions">
        <button type="submit" className="mt-btn is-primary">{t("บันทึก")}</button>
        <button type="button" className="mt-btn" onClick={onCancel}>{t("ยกเลิก")}</button>
      </span>
    </form>
  );
}

/**
 * ไทล์เดียว
 *
 * @param {object}  props
 * @param {import("../../lib/metrics/registry.js").MetricSpec} props.spec
 * @param {number|null} props.value  ค่าที่ตรรกะใช้ — null เมื่อเก่าเกินเกณฑ์
 * @param {string|null} [props.at]   เวลาที่วัดค่าล่าสุด ใช้บอกอายุตอนค้างค่า
 * @param {{min?: number, max?: number}} [props.override] เกณฑ์ที่ผู้ใช้ตั้งเอง
 */
export function MetricTile({ spec, value, at = null, override = null }) {
  const t = useT();
  const { can } = useAuth();
  const { settings, setMetricRange } = useSettings();
  const [editing, setEditing] = useState(false);
  const format = formatterFor(spec.decimals);

  /* เกณฑ์ที่คนตั้งเองชนะเกณฑ์ในทะเบียน ส่วน override จากข้างนอกชนะทั้งสอง */
  const saved = settings?.metricRanges?.[spec.key] ?? null;
  const effective = override ?? saved ?? spec.range;

  /* การตั้งเกณฑ์เปลี่ยนความหมายของคำว่า "ปกติ" ที่ทุกคนเห็น
     จึงใช้สิทธิ์เดียวกับเกณฑ์สภาพแวดล้อมในหน้าตั้งค่า (T1.251) */
  const canEdit = can("rules.write");

  /* ★ ค่าที่มาทาง `extras` ยังไม่ผ่านการกรองความเก่า ต่างจากค่าหลักที่ `toBarn` กรองให้แล้ว
     ไทล์จึงต้องตัดสินเอง ไม่งั้นค่าเมื่อชั่วโมงก่อนจะขึ้นป้าย "อยู่ในเกณฑ์" เหมือนค่าสด
     (เจอจริงตอนตรวจงานบนหน้าจอ — ค่าอายุ 40 นาทีขึ้นเขียวอยู่พักหนึ่ง) */
  const age = at ? Date.now() - new Date(at).getTime() : null;
  const stale = age != null && Number.isFinite(age) && age > STALE_MS;
  const live = stale ? null : value ?? null;

  /* ค่าค้างเมื่อเซนเซอร์เงียบ — กติกาเดียวกับทุกจุดในระบบ (lib/heldReading.js) */
  const shown = heldDisplay({ live, held: value ?? null, at, format, t });

  /* เกณฑ์ตัดสินจากค่าที่ยังสดเท่านั้น — ค่าค้างห้ามมีป้ายสถานะ */
  const status = statusOf(spec.key, live, effective);
  const range = effective;

  /* บรรทัดใต้ตัวเลข: บอกเกณฑ์ถ้ามี · บอกอายุถ้าค่าค้าง · บอกว่ายังไม่มีเกณฑ์ถ้าไม่มี */
  const rangeText = () => {
    if (shown.note) return shown.note;
    if (!range) return t("ยังไม่ได้ตั้งเกณฑ์");
    if (range.min != null && range.max != null)
      return t("เกณฑ์ {min}–{max}", { min: format(range.min), max: format(range.max) });
    if (range.max != null) return t("ไม่เกิน {max}", { max: format(range.max) });
    return t("ไม่ต่ำกว่า {min}", { min: format(range.min) });
  };

  return (
    <li className={"mt-tile" + (shown.isHeld ? " is-held" : "")}>
      <span className="mt-head">
        <span className="mt-chip" aria-hidden="true">
          <Icon name={spec.icon} size={18} />
        </span>
        {t(spec.label)}
      </span>

      <span className="mt-value">
        <b className="num">{shown.text}</b>
        {spec.unit && <em>{spec.unit}</em>}
      </span>

      <span className="mt-meta">
        {/* ★ ไม่มีเกณฑ์ → ไม่มีป้าย ห้ามขึ้นเขียว ดูหัวข้อกติกาด้านบน */}
        {status && (
          <StatusBadge tone={status === "good" ? "good" : "warning"}>
            {t(status === "good" ? "อยู่ในเกณฑ์" : "นอกเกณฑ์")}
          </StatusBadge>
        )}
        <span className="mt-range">{rangeText()}</span>
      </span>

      {editing ? (
        <RangeForm
          spec={spec}
          current={saved}
          onCancel={() => setEditing(false)}
          onSave={(next) => { setMetricRange(spec.key, next); setEditing(false); }}
        />
      ) : (
        /* ★ ปุ่มขึ้นเฉพาะค่าที่ยังไม่มีเกณฑ์จากทะเบียน — ค่าหลักอย่างอุณหภูมิมีหน้าตั้งค่าของตัวเอง
           อยู่แล้ว ถ้าให้แก้ได้สองที่จะมีเกณฑ์สองชุดที่ขัดกันโดยไม่มีใครรู้ว่าอันไหนใช้จริง */
        !spec.range && (
          <span className="mt-actions">
            {canEdit ? (
              <>
                <button type="button" className="mt-btn" onClick={() => setEditing(true)}>
                  <Icon name="pencil" size={14} aria-hidden="true" />
                  {t(saved ? "แก้เกณฑ์" : "ตั้งเกณฑ์")}
                </button>
                {saved && (
                  <button type="button" className="mt-btn" onClick={() => setMetricRange(spec.key, null)}>
                    {t("ลบเกณฑ์")}
                  </button>
                )}
              </>
            ) : (
              /* ไม่มีสิทธิ์ = บอกว่าต้องใช้สิทธิ์ระดับไหน ไม่ใช่ซ่อนปุ่มทิ้ง (กติกาใน CLAUDE.md) */
              <AdminNote action="rules.write">
                {t("เกณฑ์นี้เปลี่ยนตัวเลข “หลุดเกณฑ์” ที่ทุกคนเห็น")}
              </AdminNote>
            )}
          </span>
        )
      )}
    </li>
  );
}

/**
 * รายการไทล์จากของที่เซนเซอร์ส่งมา
 *
 * ใช้กับ `barn.extras.inside` / `barn.extras.outdoor` ได้ตรง ๆ — ของพวกนั้นเป็นค่าที่
 * หลังบ้านส่งมาแต่ยังไม่มีใครขึ้นทะเบียน ซึ่งเดิมถูกข้ามเงียบ ๆ ตั้งแต่ `bagOf`
 *
 * @param {object} props
 * @param {Array<{spec: object, value: number|null, at: string|null}>} props.items
 * @param {string} [props.title]
 * @param {string} [props.empty] ข้อความเมื่อไม่มีอะไรจะแสดง — ไม่ส่ง = ซ่อนทั้งก้อน
 */
export default function MetricTiles({ items, title, empty }) {
  const t = useT();
  const list = items ?? [];

  /* ไม่มีของและไม่ได้สั่งให้บอก = ซ่อนไปเลย ดีกว่าโชว์หัวข้อว่างให้คนสงสัยว่าพังหรือเปล่า */
  if (list.length === 0 && !empty) return null;

  return (
    <div className="mt-wrap">
      {title && <p className="mt-title">{t(title)}</p>}
      {list.length === 0 ? (
        <p className="mt-empty">{t(empty)}</p>
      ) : (
        <ul className="mt-list">
          {list.map(({ spec, value, at }) => (
            /* ★ key ต้องเป็นชื่อค่าอย่างเดียว ห้ามผสมเวลาเข้าไป — เวลาเปลี่ยนทุกครั้งที่ข้อมูล
               รีเฟรช ถ้าผสมไว้ React จะถอดไทล์ทิ้งแล้วสร้างใหม่ ฟอร์มตั้งเกณฑ์ที่เปิดค้างอยู่
               จะปิดเองพร้อมเลขที่พิมพ์ไปแล้ว (เจอจริงตอนกดทดสอบบนหน้าจอ) */
            <MetricTile key={spec.key} spec={spec} value={value} at={at} />
          ))}
        </ul>
      )}
    </div>
  );
}
