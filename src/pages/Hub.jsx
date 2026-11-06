/**
 * ตู้กลาง — หน้าเว็บแยกของตัวเอง ไม่ได้อยู่ในแดชบอร์ดฟาร์ม (T1.347)
 *
 * ═══ ★ ทำไมถึงแยกออกมา ═══
 * ตู้กลางเป็นงาน **ดูแลระบบ** — ออกกุญแจให้ทีมอื่น กำหนดว่าใครดึงข้อมูลอะไรได้
 * ส่วนแดชบอร์ดเป็นงาน **ดูแลฟาร์ม** — คนละคนใช้ คนละเรื่อง (หัวหน้าสั่งให้แยก 27 ต.ค. 2569)
 *
 * จึงอยู่ที่ `/hub` ไม่ใช่ `/dashboard/hub` และ **ไม่ใช้โครงของแดชบอร์ดเลย**
 *   - ไม่มี AppLayout · ไม่มีเมนูซ้าย · ไม่มีกระดานจัดเลย์เอาต์
 *   - มีหัวเว็บของตัวเอง พร้อมทางกลับไปแดชบอร์ด
 * ที่ยังใช้ร่วมกันมีแค่ระบบล็อกอิน ชุดสี และไอคอน เพราะเป็นระบบเดียวกันและคนเดียวกันดูแล
 *
 * ═══ ★★ ค่าตั้งต้นคือไม่มีใครดึงได้ ═══
 * ชุดข้อมูลที่เพิ่งไหลเข้ามาจะยังไม่มีใครเห็น จนกว่าจะเปิดให้ทีละกล่อง
 * ปลอดภัยกว่าเปิดหมดแล้วค่อยไล่ปิด เพราะถ้าลืมปิดสักชุดจะไม่มีอะไรเตือน
 *
 * ═══ ★★★ กุญแจโชว์ครั้งเดียว ═══
 * หลังบ้านคืนกุญแจเต็มมาครั้งเดียวตอนออกให้ ฐานเก็บแต่แฮช อ่านย้อนไม่ได้อีกแม้แต่แอดมิน
 * หน้านี้จึงต้องบอกให้คัดลอกทันทีอย่างชัดเจน หายแล้วต้องออกใบใหม่
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Icon from "../components/ui/Icon.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import { useAuth } from "../lib/auth/useAuth.js";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../lib/api/client.js";
import { formatDateTime, formatNumber } from "../lib/format.js";
import { useT } from "../lib/i18n/useT.js";
import "./Hub.css";

/** ชนิดของชุดข้อมูล → ไอคอนกับคำอธิบายสั้น ๆ */
const KIND = {
  reading: { icon: "chart", label: "ตัวเลขตามเวลา" },
  event: { icon: "list", label: "เหตุการณ์ / ข้อความ" },
  file: { icon: "camera", label: "ไฟล์ (เก็บที่อยู่)" },
};

/** หัวเว็บของตู้กลาง — ประกาศนอก component เพื่อไม่ให้ React ถอดทิ้งแล้วสร้างใหม่ทุกเรนเดอร์ */
function Shell({ t, displayName, onSignOut, children }) {
  return (
    <div className="hub-app">
      <header className="hub-topbar">
        <span className="hub-brand">
          <Icon name="globe" size={20} aria-hidden="true" />
          <b>{t("ตู้กลาง")}</b>
          <em>{t("ศูนย์รวมข้อมูลของทุกทีม")}</em>
        </span>
        <span className="hub-topbar-right">
          {displayName && <span className="hub-who">{displayName}</span>}
          {/* ทางกลับแดชบอร์ด — คนละระบบกันแต่คนดูแลคนเดียวกัน ไม่ควรต้องพิมพ์ URL เอง */}
          <Link to="/dashboard" className="hub-btn">
            <Icon name="home" size={15} aria-hidden="true" />
            {t("แดชบอร์ดฟาร์ม")}
          </Link>
          <button type="button" className="hub-btn" onClick={onSignOut}>
            {t("ออกจากระบบ")}
          </button>
        </span>
      </header>
      <main className="hub-main">{children}</main>
    </div>
  );
}

export default function Hub() {
  const t = useT();
  const { can, displayName, signOut } = useAuth();
  /* ★ ต้องเป็นชื่อที่มีอยู่จริงใน lib/auth/roles.js — `roleCan` เช็ก `action in PERMISSIONS` ก่อน
     ชื่อที่ไม่มีในตารางจะคืน false ให้ **ทุกคนรวมถึงแอดมิน** โดยไม่มี error อะไรเลย
     (เจอจริง 27 ต.ค. 2569 — ใช้ "system.admin" ที่ไม่มีอยู่ หน้าเลยล็อกตัวเองทั้งที่ล็อกอินถูก) */
  const isAdmin = can("system.settings");

  const [boxes, setBoxes] = useState([]);
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  /* กุญแจที่เพิ่งออก — เก็บไว้โชว์จนกว่าผู้ใช้จะปิดเอง เพราะอ่านย้อนไม่ได้อีก */
  const [freshKey, setFreshKey] = useState(null);
  const [adding, setAdding] = useState(false);
  /* กล่องที่กำลังแก้ชื่อ/หมายเหตุอยู่ — เก็บไอดีตัวเดียว แก้ทีละกล่อง */
  const [editing, setEditing] = useState(null);
  /* ตารางสิทธิ์อยู่ในโหมดแก้ไขไหม — นอกโหมดนี้ติ๊กไม่ได้ กันเผลอกดแล้วเปิดข้อมูลให้ทีมอื่นทันที */
  const [grantEdit, setGrantEdit] = useState(false);
  /* ช่องที่ติ๊กเปลี่ยนแต่ยังไม่กดบันทึก: "streamId:boxId" → ค่าที่อยากให้เป็น (true = เปิด)
     เก็บเฉพาะช่องที่ต่างจากของจริง — ติ๊กกลับเป็นค่าเดิมแล้วช่องนั้นหายจากรายการ */
  const [draft, setDraft] = useState(() => new Map());
  const [savingGrants, setSavingGrants] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [b, s] = await Promise.all([apiGet("/hub/boxes"), apiGet("/hub/streams")]);
      setBoxes(b.boxes ?? []);
      setStreams(s.streams ?? []);
    } catch (err) {
      /* ★ เก็บข้อความดิบไว้ แล้วค่อยแปลตอนเรนเดอร์ — ห้ามเรียก t() ที่นี่
         `useT()` คืนฟังก์ชันใหม่ทุกครั้งที่เรนเดอร์ ใส่ไว้ใน deps เมื่อไร `load` จะใหม่ทุกรอบ
         แล้ว useEffect จะวนเรียกไม่สิ้นสุด (เจอจริงตอนเปิดหน้าดู — 249 error ใน 5 วินาที) */
      setError(err.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
    else setLoading(false);
  }, [isAdmin, load]);

  /* ---------- การกระทำ ---------- */

  const addBox = async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      const res = await apiPost("/hub/boxes", {
        code: String(form.get("code") ?? "").trim().toLowerCase(),
        name: String(form.get("name") ?? "").trim(),
        note: String(form.get("note") ?? "").trim(),
      });
      setFreshKey({ code: res.box.code, key: res.key });
      setAdding(false);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const regenerate = async (box) => {
    try {
      const res = await apiPost(`/hub/boxes/${box.id}/key`, {});
      setFreshKey({ code: box.code, key: res.key, warning: res.warning });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  /** ดูกุญแจที่ออกไปแล้ว — ขอทีละใบ ไม่ได้ส่งมาพร้อมรายการกล่อง */
  const reveal = async (box) => {
    try {
      const res = await apiPost(`/hub/boxes/${box.id}/reveal`, {});
      setFreshKey({ code: res.code, key: res.key, issuedAt: res.issuedAt, old: true });
    } catch (err) {
      setError(err.message);
    }
  };

  const saveEdit = async (e, box) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await apiPatch(`/hub/boxes/${box.id}`, {
        name: String(form.get("name") ?? "").trim(),
        note: String(form.get("note") ?? "").trim(),
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleActive = async (box) => {
    try {
      await apiPatch(`/hub/boxes/${box.id}`, { active: !box.active });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  /**
   * แก้สิทธิ์แบบร่างก่อน แล้วกดบันทึกทีเดียว (T1.352)
   *
   * ★ ผู้ใช้สั่ง: ติ๊กแล้ว "ยังไม่มีผล" จนกว่าจะกดบันทึก — ติ๊กพลาดช่องเดียว
   *   เดิมเท่ากับเปิดข้อมูลของทีมหนึ่งให้อีกทีมทันที ตอนนี้ยังยกเลิกได้ก่อนกดบันทึก
   *
   * ★★ ตอนบันทึกยังส่ง **ทีละช่อง เรียงกันทีละคำขอ** (`PUT/DELETE …/grants/:boxId`)
   *   ห้ามกลับไปส่งรายชื่อทั้งชุด — เคยทำให้ช่องหายเงียบ ๆ เมื่อคำขอสลับลำดับ (T1.351)
   *   ช่องไหนไม่ผ่านจะค้างอยู่ในร่างให้กดบันทึกซ้ำได้ ช่องที่ผ่านแล้วไม่ต้องส่งใหม่
   */
  const cellKey = (streamId, boxId) => `${streamId}:${boxId}`;

  const isOn = (s, boxId) => {
    const k = cellKey(s.id, boxId);
    return draft.has(k) ? draft.get(k) : s.grantees.includes(boxId);
  };

  const toggleDraft = (s, boxId, on) =>
    setDraft((cur) => {
      const next = new Map(cur);
      const k = cellKey(s.id, boxId);
      if (on === s.grantees.includes(boxId)) next.delete(k);
      else next.set(k, on);
      return next;
    });

  const cancelGrants = () => {
    setDraft(new Map());
    setGrantEdit(false);
  };

  const saveGrants = async () => {
    setSavingGrants(true);
    setError(null);
    const failed = new Map();
    let lastError = null;
    for (const [k, on] of draft) {
      const [streamId, boxId] = k.split(":");
      const path = `/hub/streams/${streamId}/grants/${boxId}`;
      try {
        if (on) await apiPut(path, {});
        else await apiDelete(path);
      } catch (err) {
        failed.set(k, on);
        lastError = err.message;
      }
    }
    try {
      /* โหลดของจริงกลับมาจากหลังบ้าน — จอต้องตรงกับสิทธิ์ที่มีผลจริง ไม่ใช่ที่เราคิดว่าส่งไปแล้ว */
      const s = await apiGet("/hub/streams");
      setStreams(s.streams ?? []);
    } catch (err) {
      lastError = lastError ?? err.message;
    }
    setDraft(failed);
    if (failed.size === 0) setGrantEdit(false);
    else setError(lastError);
    setSavingGrants(false);
  };

  /* มีร่างค้างอยู่แล้วจะปิดหน้า — เตือนก่อน ไม่งั้นนึกว่าบันทึกแล้วทั้งที่ทีมอื่นยังดึงไม่ได้ */
  useEffect(() => {
    if (draft.size === 0) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft.size]);

  /* ---------- หน้าจอ ---------- */

  const shell = { t, displayName, onSignOut: signOut };

  if (!isAdmin) {
    return (
      <Shell {...shell}>
        <section className="hub-card hub-denied">
          <Icon name="lock" size={22} aria-hidden="true" />
          <div>
            <b>{t("ต้องมีสิทธิ์ผู้ดูแลระบบ")}</b>
            <p>{t("หน้านี้กำหนดว่าใครดึงข้อมูลของทุกทีมไปใช้ได้")}</p>
          </div>
        </section>
      </Shell>
    );
  }

  return (
    <Shell {...shell}>
      {error && <p className="hub-error" role="alert">{t(error)}</p>}

      {freshKey && (
        <section className="hub-card hub-key-card">
          <p className="hub-key-head">
            <Icon name="key" size={18} aria-hidden="true" />
            {t("กุญแจของกล่อง {code}", { code: freshKey.code })}
          </p>
          {/* ★ ข้อความต่างกันตามว่าเป็นใบที่เพิ่งออก หรือใบเก่าที่กดดูย้อนหลัง
              ใบที่เพิ่งออก = ของเดิมใช้ไม่ได้แล้ว ต้องแจ้งทีมนั้น
              ใบที่กดดู    = ไม่มีอะไรเปลี่ยน กดดูใหม่ได้เรื่อย ๆ ไม่ต้องขู่ให้รีบคัดลอก */}
          {freshKey.old ? (
            <p className="hub-key-ok">
              {freshKey.issuedAt
                ? t("ใบนี้ออกเมื่อ {when} · ยังใช้งานอยู่", { when: formatDateTime(freshKey.issuedAt) })
                : t("ใบที่ใช้งานอยู่ตอนนี้")}
            </p>
          ) : (
            <p className="hub-key-warn">
              {t("ส่งให้ทีมนั้นแล้วกุญแจใบเดิมของเขาจะใช้ไม่ได้ทันที")}
            </p>
          )}
          {freshKey.warning && <p className="hub-key-warn">{freshKey.warning}</p>}
          <code className="hub-key-value">{freshKey.key}</code>
          <span className="hub-key-actions">
            <button
              type="button"
              className="hub-btn is-primary"
              onClick={() => navigator.clipboard?.writeText(freshKey.key)}
            >
              {t("คัดลอก")}
            </button>
            <button type="button" className="hub-btn" onClick={() => setFreshKey(null)}>
              {t("ปิด")}
            </button>
          </span>
        </section>
      )}

      <section className="hub-card">
        <header className="hub-card-head">
          <h2>{t("กล่องที่ส่งข้อมูลเข้ามาได้")}</h2>
          <button type="button" className="hub-btn is-primary" onClick={() => setAdding((v) => !v)}>
            <Icon name="plus" size={15} aria-hidden="true" />
            {t("เพิ่มกล่อง")}
          </button>
        </header>

        {adding && (
          <form className="hub-form" onSubmit={addBox}>
            <label className="hub-field">
              <span>{t("ชื่อย่อ")}</span>
              <input name="code" required placeholder="jew" pattern="[a-z0-9]{2,20}" />
            </label>
            <label className="hub-field is-wide">
              <span>{t("ชื่อเต็ม")}</span>
              <input name="name" required placeholder={t("BOX-jew กล้อง AI")} />
            </label>
            <label className="hub-field is-wide">
              <span>{t("หมายเหตุ")}</span>
              <input name="note" placeholder={t("ใครดูแล ติดต่อยังไง")} />
            </label>
            <span className="hub-form-actions">
              <button type="submit" className="hub-btn is-primary">{t("สร้างและออกกุญแจ")}</button>
              <button type="button" className="hub-btn" onClick={() => setAdding(false)}>
                {t("ยกเลิก")}
              </button>
            </span>
          </form>
        )}

        {loading ? (
          <p className="hub-empty">{t("กำลังโหลด…")}</p>
        ) : boxes.length === 0 ? (
          <p className="hub-empty">{t("ยังไม่มีกล่องไหนลงทะเบียน — กดเพิ่มกล่องเพื่อเริ่ม")}</p>
        ) : (
          <ul className="hub-boxes">
            {boxes.map((b) => (
              <li key={b.id} className={"hub-box" + (b.active ? "" : " is-off")}>
                <span className="hub-box-head">
                  <b>{b.name}</b>
                  <code>{b.code}</code>
                  <StatusBadge tone={b.active ? "good" : "offline"}>
                    {t(b.active ? "เปิดอยู่" : "ปิดอยู่")}
                  </StatusBadge>
                </span>
                <span className="hub-box-meta">
                  {t("{n} ชุดข้อมูล", { n: formatNumber(b.streamCount) })}
                  {" · "}
                  {b.lastSeenAt
                    ? t("ส่งล่าสุด {when}", { when: formatDateTime(b.lastSeenAt) })
                    : t("ยังไม่เคยส่งข้อมูลเข้ามา")}
                </span>
                {b.note && <span className="hub-box-note">{b.note}</span>}

                {b.keyIssuedAt && (
                  <span className="hub-box-meta">
                    {t("กุญแจใบนี้ออกเมื่อ {when}", { when: formatDateTime(b.keyIssuedAt) })}
                  </span>
                )}

                {editing === b.id ? (
                  <form className="hub-edit" onSubmit={(e) => saveEdit(e, b)}>
                    <label className="hub-field is-wide">
                      <span>{t("ชื่อเต็ม")}</span>
                      <input name="name" defaultValue={b.name} required />
                    </label>
                    <label className="hub-field is-wide">
                      <span>{t("หมายเหตุ")}</span>
                      <input name="note" defaultValue={b.note ?? ""} />
                    </label>
                    {/* ★ ชื่อย่อแก้ไม่ได้ — มันฝังอยู่ในกุญแจที่ส่งให้ทีมอื่นไปแล้ว
                        แก้ตรงนี้แล้วกุญแจเดิมจะหาแถวไม่เจอ ข้อมูลหยุดไหลโดยไม่มีใครรู้ */}
                    <span className="hub-edit-note">
                      {t("ชื่อย่อ {code} แก้ไม่ได้ เพราะอยู่ในกุญแจที่ส่งให้ทีมนั้นแล้ว", { code: b.code })}
                    </span>
                    <span className="hub-form-actions">
                      <button type="submit" className="hub-btn is-primary">{t("บันทึก")}</button>
                      <button type="button" className="hub-btn" onClick={() => setEditing(null)}>
                        {t("ยกเลิก")}
                      </button>
                    </span>
                  </form>
                ) : (
                  <span className="hub-box-actions">
                    <button type="button" className="hub-btn" onClick={() => setEditing(b.id)}>
                      <Icon name="pencil" size={14} aria-hidden="true" />
                      {t("แก้ไข")}
                    </button>
                    {/* ★ ปุ่มดูกุญแจขึ้นเฉพาะใบที่ดูย้อนได้จริง — ใบเก่าที่ออกก่อนเปิดระบบนี้
                        ไม่มีของเข้ารหัสเก็บไว้ ขึ้นปุ่มแล้วกดไม่ได้จะชวนให้สับสนกว่า */}
                    {b.canReveal && (
                      <button type="button" className="hub-btn" onClick={() => reveal(b)}>
                        <Icon name="eye" size={14} aria-hidden="true" />
                        {t("ดูกุญแจ")}
                      </button>
                    )}
                    <button type="button" className="hub-btn" onClick={() => regenerate(b)}>
                      {t("ออกกุญแจใหม่")}
                    </button>
                    <button type="button" className="hub-btn" onClick={() => toggleActive(b)}>
                      {t(b.active ? "ปิดกล่อง" : "เปิดกล่อง")}
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hub-card">
        <header className="hub-card-head">
          <h2>{t("ใครดึงชุดไหนได้")}</h2>
          {streams.length > 0 &&
            (grantEdit ? (
              <span className="hub-form-actions">
                <button type="button" className="hub-btn" onClick={cancelGrants} disabled={savingGrants}>
                  <Icon name="cross" size={15} aria-hidden="true" />
                  {t("ยกเลิก")}
                </button>
                <button
                  type="button"
                  className="hub-btn is-primary"
                  onClick={saveGrants}
                  disabled={savingGrants || draft.size === 0}
                >
                  <Icon name="check" size={15} aria-hidden="true" />
                  {savingGrants
                    ? t("กำลังบันทึก…")
                    : draft.size > 0
                      ? t("บันทึก ({n} ช่อง)", { n: formatNumber(draft.size) })
                      : t("บันทึก")}
                </button>
              </span>
            ) : (
              <button type="button" className="hub-btn is-primary" onClick={() => setGrantEdit(true)}>
                <Icon name="pencil" size={15} aria-hidden="true" />
                {t("แก้ไขสิทธิ์")}
              </button>
            ))}
        </header>
        <p className="hub-hint">
          <Icon name="shield" size={16} aria-hidden="true" />
          {t("ช่องที่ไม่ติ๊ก = ดึงไม่ได้ — ค่าตั้งต้นคือปิดทั้งหมด")}
        </p>
        {grantEdit && (
          <p className="hub-hint hub-draft-note" role="status">
            <Icon name="warn" size={16} aria-hidden="true" />
            {draft.size > 0
              ? t("เปลี่ยนไว้ {n} ช่อง — ยังไม่มีผลจนกว่าจะกดบันทึก", { n: formatNumber(draft.size) })
              : t("ติ๊กช่องที่ต้องการ แล้วกดบันทึก — ติ๊กแล้วยังไม่มีผลจนกว่าจะบันทึก")}
          </p>
        )}

        {streams.length === 0 ? (
          <p className="hub-empty">
            {t("ยังไม่มีชุดข้อมูลไหลเข้ามา — ชุดใหม่จะขึ้นเองเมื่อมีกล่องส่งเข้ามาครั้งแรก")}
          </p>
        ) : (
          <div className="hub-table-wrap">
            <table className="hub-table">
              <thead>
                <tr>
                  <th>{t("ชุดข้อมูล")}</th>
                  <th>{t("เจ้าของ")}</th>
                  <th className="num">{t("จำนวน")}</th>
                  {boxes.map((b) => (
                    <th key={b.id} className="hub-col-box">{b.code}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {streams.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="hub-stream">
                        <Icon name={KIND[s.kind]?.icon ?? "pulse"} size={16} aria-hidden="true" />
                        <b>{s.name}</b>
                        {s.unit && <em>{s.unit}</em>}
                      </span>
                      <span className="hub-stream-kind">{t(KIND[s.kind]?.label ?? s.kind)}</span>
                    </td>
                    <td>{s.owner.code}</td>
                    <td className="num">{formatNumber(s.sampleCount)}</td>
                    {boxes.map((b) => {
                      /* เจ้าของดึงของตัวเองได้อยู่แล้ว ไม่ต้องให้ติ๊ก */
                      const owns = b.code === s.owner.code;
                      const on = isOn(s, b.id);
                      const changed = draft.has(cellKey(s.id, b.id));
                      return (
                        <td key={b.id} className="hub-col-box">
                          {owns ? (
                            <span className="hub-own" title={t("เจ้าของชุดข้อมูล")}>
                              <Icon name="check" size={15} aria-hidden="true" />
                            </span>
                          ) : (
                            <label
                              className="hub-check"
                              data-changed={changed || undefined}
                              title={changed ? t("ยังไม่บันทึก") : undefined}
                            >
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={!grantEdit || savingGrants}
                                onChange={(e) => toggleDraft(s, b.id, e.target.checked)}
                                aria-label={t("ให้ {box} ดึง {stream}", { box: b.code, stream: s.name })}
                              />
                            </label>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Shell>
  );
}
