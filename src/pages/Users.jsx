/**
 * หน้า "จัดการผู้ใช้" — /dashboard/users (ผู้ดูแลระบบเท่านั้น)
 *
 * มาคู่กับระบบยืนยันตัวตนจริง (1 ก.ย. 2569) — ก่อนหน้านี้ "บัญชี" ของระบบนี้คือ
 * รหัสผ่านตัวเดียวที่ฝังไว้ในโค้ด ใครพิมพ์ถูกก็เป็นผู้ดูแลระบบ ไม่มีรายชื่อคนใช้จริง
 *
 * **ทุกอย่างในหน้านี้เป็นการเรียกหลังบ้าน** ไม่มีการตัดสินใจในเบราว์เซอร์
 * เซิร์ฟเวอร์ปฏิเสธเองถ้า token ไม่ใช่ของผู้ดูแลระบบ — หน้านี้แค่ทำให้ใช้งานง่ายขึ้น
 *
 * **ไม่ซ่อนหน้านี้จากผู้ใช้ทั่วไป** ตามกติกาใน CLAUDE.md — เข้ามาแล้วเห็นว่าระบบทำอะไรได้
 * พร้อมบอกว่าต้องขอสิทธิ์จากใคร ดีกว่าเจอ 404 แล้วนึกว่าแอปไม่มีความสามารถนี้
 */
import { useCallback, useEffect, useState } from "react";
import PageHeader from "../components/ui/PageHeader.jsx";
import PageBoard, { Block } from "../components/board/PageBoard.jsx";
import Card from "../components/ui/Card.jsx";
import Icon from "../components/ui/Icon.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import AdminNote from "../components/ui/AdminNote.jsx";
import ConfirmModal from "../components/ui/ConfirmModal.jsx";
import ActionMenu from "../components/ui/ActionMenu.jsx";
import { useAuth } from "../lib/auth/useAuth.js";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api/client.js";
import { formatDateTime } from "../lib/format.js";
import { ACCOUNT_ROLES, roleCan } from "../lib/auth/roles.js";
import "./Users.css";
import { useT } from "../lib/i18n/useT.js";
import { useLineLinks } from "../lib/api/lineLinks.js";

/** ต้องตรงกับที่หลังบ้านตรวจ (server/src/modules/users/route.js) */
const MIN_PASSWORD = 8;

/* **ระดับว่างไว้โดยตั้งใจ** — ผู้ดูแลระบบต้องเลือกเองทุกบัญชี (ผู้ใช้สั่ง "แล้วแต่ว่าเป็นใคร" · T1.251)
   หลังบ้านก็ปฏิเสธถ้าไม่ส่งระดับมา ไม่มีการเดาให้ */
const EMPTY_FORM = { username: "", displayName: "", email: "", role: "", password: "" };

/**
 * ตารางเทียบว่าแต่ละระดับทำอะไรได้ — อ่านจาก PERMISSIONS จริง ไม่ได้เขียนแยกไว้อีกชุด
 * (ถ้าวันหนึ่งย้ายสิทธิ์ข้ามระดับ ตารางนี้เปลี่ยนตามเอง ไม่มีทางโกหก)
 */
const ABILITIES = [
  { action: null, label: "ดูข้อมูล กราฟ และกล้องทุกหน้า" },
  { action: "record.write", label: "บันทึกในโรงเรือน · ปรับจำนวนสุกร · ภาพกล้อง" },
  { action: "rules.write", label: "แก้เกณฑ์สภาพแวดล้อมและการแจ้งเตือน" },
  { action: "equipment.control", label: "สั่งเปิด/ปิดพัดลมและปั๊มน้ำ (PLC)" },
  { action: "farm.manage", label: "เพิ่ม แก้ไข และลบฟาร์มกับโรงเรือน" },
  { action: "system.settings", label: "จัดการผู้ใช้ · ค่าไฟต่อหน่วย · ล้างข้อมูล" },
];

export default function Users() {
  const t = useT();
  const { isAdmin, userId } = useAuth();
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  /* บัญชีที่กำลังตั้งรหัสผ่านใหม่ให้ — { id, username } หรือ null */
  const [resetting, setResetting] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  /* บัญชีที่กำลังแก้ไข (T1.253) — { id, original, username, displayName, email, role } หรือ null */
  const [editing, setEditing] = useState(null);
  /* บัญชีที่รอยืนยันลบถาวร — { id, username, displayName } หรือ null */
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await apiGet("/users");
      setUsers(res.users ?? []);
      setStatus("ok");
    } catch (err) {
      /* 403 = ไม่ใช่แอดมิน ซึ่งไม่ใช่ "พัง" — หน้าจอมีข้อความอธิบายอยู่แล้ว */
      setStatus(err.status === 401 || err.status === 403 ? "denied" : "error");
      /* เก็บ "คีย์ไทย" ไว้เฉย ๆ แล้วค่อยแปลตอน render — ถ้าเรียก t() ตรงนี้
         t จะต้องเป็น dependency ของ useCallback แล้ว load เปลี่ยนทุกรอบ render */
      setError(err.message ?? "โหลดรายชื่อผู้ใช้ไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
    else setStatus("denied");
  }, [isAdmin, load]);

  /** ทำรายการหนึ่งอย่างแล้วโหลดรายชื่อใหม่ — รวมการจัดการ error ไว้ที่เดียว */
  const run = async (fn, okMessage = "") => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      if (okMessage) setError("");
      return true;
    } catch (err) {
      setError(err.message ?? "ทำรายการไม่สำเร็จ");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addUser = async (e) => {
    e.preventDefault();
    const ok = await run(() => apiPost("/users", form));
    if (ok) {
      setForm(EMPTY_FORM);
      setFormOpen(false);
    }
  };

  /** เปิดฟอร์มแก้ไข — ปิดฟอร์มอื่นก่อน จะได้ไม่มีสองฟอร์มซ้อนกันบนหน้า */
  const startEdit = (u) => {
    setFormOpen(false);
    setResetting(null);
    setError("");
    setEditing({
      id: u.id,
      original: u,
      username: u.username,
      displayName: u.displayName,
      email: u.email ?? "",
      role: u.role,
    });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    const { id, original } = editing;
    /* ส่งเฉพาะช่องที่เปลี่ยนจริง — หลังบ้านถอน session เมื่อชื่อผู้ใช้เปลี่ยน ส่งค่าเดิมไปไม่ควรเตะใครออก */
    const patch = {};
    if (editing.username.trim().toLowerCase() !== original.username) patch.username = editing.username;
    if (editing.displayName.trim() !== original.displayName) patch.displayName = editing.displayName;
    if (editing.email.trim().toLowerCase() !== (original.email ?? "")) patch.email = editing.email;
    if (editing.role !== original.role) patch.role = editing.role;
    if (Object.keys(patch).length === 0) {
      setEditing(null);
      return;
    }
    const renamedSelf = original.username === userId && patch.username !== undefined;
    const ok = await run(() => apiPatch(`/users/${id}`, patch));
    if (!ok) return;
    setEditing(null);
    /* เปลี่ยนชื่อผู้ใช้ของตัวเอง — ข้อมูลบัญชีในเครื่องยังเป็นชื่อเก่า โหลดหน้าใหม่ให้ถามหลังบ้านอีกรอบ */
    if (renamedSelf) window.location.reload();
  };

  const confirmDelete = async () => {
    const target = deleting;
    setDeleting(null);
    await run(() => apiDelete(`/users/${target.id}`));
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    const ok = await run(() =>
      apiPost(`/users/${resetting.id}/password`, { password: newPassword }),
    );
    if (ok) {
      setResetting(null);
      setNewPassword("");
    }
  };

  if (status === "denied") {
    return (
      <>
        <PageHeader
          title={t("จัดการผู้ใช้")}
          subtitle={t("เพิ่มคนเข้าระบบ · กำหนดสิทธิ์ · ปิดบัญชีที่ไม่ใช้แล้ว")}
        />
        <PageBoard boardId="users">
          <Block id="denied" label={t("ส่วนนี้สงวนไว้สำหรับผู้ดูแลระบบ")}>
            <Card title={t("ส่วนนี้สงวนไว้สำหรับผู้ดูแลระบบ")} icon="lock">
              <AdminNote>
                {t("การเพิ่ม/แก้ไข/ปิดบัญชีมีผลกับทุกคนที่ใช้ระบบ จึงทำได้เฉพาะผู้ดูแลระบบ — ติดต่อผู้ดูแลระบบของฟาร์มเพื่อขอสิทธิ์ หรือเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ")}
              </AdminNote>
            </Card>
          </Block>
        </PageBoard>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("จัดการผู้ใช้")}
        subtitle={t("เพิ่มคนเข้าระบบ · กำหนดสิทธิ์ · ปิดบัญชีที่ไม่ใช้แล้ว · {n} บัญชี", {
          n: users.length,
        })}
        action={
          <button
            type="button"
            className="us-add"
            onClick={() => {
              /* เปิดฟอร์มได้ทีละใบ — ทุกฟอร์มจองตำแหน่งบนสุดของกระดานไว้ที่เดียวกัน */
              setEditing(null);
              setResetting(null);
              setFormOpen((v) => !v);
            }}
          >
            <Icon name={formOpen ? "cross" : "plus"} size={18} />
            {formOpen ? t("ปิดฟอร์ม") : t("เพิ่มผู้ใช้")}
          </button>
        }
      />

      {/* เนื้อหาทั้งหน้าอยู่บนกระดานจัดเลย์เอาต์ (T1.256) — ฟอร์มสามใบเปิดได้ทีละใบ
          แต่ละใบเป็นกล่องของตัวเอง โผล่มาเฉพาะตอนเปิด กล่องที่ปิดอยู่หายจากกริดเอง
          แล้วกระดานเก็บแถวว่างที่เหลือให้ (reconcile → collapseEmptyRows) */}
      <PageBoard boardId="users">
        {formOpen && (
          <Block id="add" label={t("เพิ่มผู้ใช้ใหม่")}>
            <Card title={t("เพิ่มผู้ใช้ใหม่")} icon="plus">
              <form className="us-form" onSubmit={addUser}>
                <label className="us-field">
                  <span>{t("ชื่อผู้ใช้")}</span>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder={t("เช่น somchai")}
                    autoComplete="off"
                    required
                  />
                  <em>{t("a–z 0–9 . _ - ยาว 3–32 ตัว")}</em>
                </label>

                <label className="us-field">
                  <span>{t("ชื่อที่แสดง")}</span>
                  <input
                    type="text"
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                    placeholder={t("เช่น สมชาย ใจดี")}
                    required
                  />
                </label>

                <label className="us-field">
                  <span>{t("อีเมล")}</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder={t("ไม่บังคับ")}
                    autoComplete="off"
                  />
                  <em>{t("ใช้ล็อกอินแทนชื่อผู้ใช้ได้ · เว้นว่าง = ไม่มีอีเมล")}</em>
                </label>

                <label className="us-field">
                  <span>{t("ระดับสิทธิ์")}</span>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    required
                  >
                    <option value="" disabled>
                      {t("— เลือกระดับสิทธิ์ —")}
                    </option>
                    {ACCOUNT_ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {t(r.name)} — {t(r.tagline)}
                      </option>
                    ))}
                  </select>
                  <em>{t("ขั้นสูงทำได้ทุกอย่างที่ขั้นต่ำกว่าทำได้ · ดูตารางเทียบด้านล่าง")}</em>
                </label>

                {/* ช่องนี้เคยหลุดหายไปตอนแก้ฟอร์มเป็น 4 ระดับ (T1.251) ทำให้เพิ่มผู้ใช้ไม่ได้เลย — แก้ใน T1.252
                    เทสต์ test/usersForm.test.js กันไม่ให้ช่องที่หลังบ้านบังคับหายไปเงียบ ๆ อีก */}
                <label className="us-field">
                  <span>{t("รหัสผ่านชั่วคราว")}</span>
                  <input
                    type="text"
                    name="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    minLength={MIN_PASSWORD}
                    required
                  />
                  {/* โชว์เป็นตัวอักษรธรรมดาโดยตั้งใจ — แอดมินต้องอ่านออกเพื่อบอกเจ้าตัว
                      และระบบบังคับให้เจ้าตัวเปลี่ยนตอนเข้าครั้งแรกอยู่แล้ว */}
                  <em>
                    {t("อย่างน้อย {n} ตัวอักษร · เจ้าตัวต้องเปลี่ยนตอนเข้าครั้งแรก", { n: MIN_PASSWORD })}
                  </em>
                </label>

                {error && (
                  <p className="us-error us-form-error" role="alert">
                    <Icon name="warn" size={17} aria-hidden="true" />
                    {t(error)}
                  </p>
                )}

                <button type="submit" className="us-submit" disabled={busy}>
                  <Icon name="check" size={18} />
                  {busy ? t("กำลังบันทึก…") : t("เพิ่มผู้ใช้")}
                </button>
              </form>
            </Card>
          </Block>
        )}

        {resetting && (
          <Block id="reset" label={t("ตั้งรหัสผ่านใหม่")}>
            <Card
              title={t("ตั้งรหัสผ่านใหม่ให้ {user}", { user: resetting.username })}
              icon="lock"
            >
              <form className="us-form" onSubmit={resetPassword}>
                <label className="us-field">
                  <span>{t("รหัสผ่านใหม่")}</span>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={MIN_PASSWORD}
                    autoFocus
                    required
                  />
                  <em>
                    {t("ตั้งแล้วเจ้าตัวจะถูกดีดออกจากทุกเครื่องทันที และต้องเปลี่ยนรหัสตอนเข้าครั้งหน้า")}
                  </em>
                </label>
                {error && (
                  <p className="us-error us-form-error" role="alert">
                    <Icon name="warn" size={17} aria-hidden="true" />
                    {t(error)}
                  </p>
                )}
                <div className="us-form-actions">
                  <button type="submit" className="us-submit" disabled={busy}>
                    <Icon name="check" size={18} />
                    {t("ตั้งรหัสผ่าน")}
                  </button>
                  <button
                    type="button"
                    className="us-cancel"
                    onClick={() => {
                      setResetting(null);
                      setNewPassword("");
                    }}
                  >
                    {t("ยกเลิก")}
                  </button>
                </div>
              </form>
            </Card>
          </Block>
        )}

        {/* ---------- แก้ไขบัญชี (T1.253) ---------- */}
        {editing && (
          <Block id="edit" label={t("แก้ไขบัญชี")}>
            <Card
              title={t("แก้ไขบัญชี {user}", { user: editing.original.username })}
              icon="pencil"
            >
              <form className="us-form" onSubmit={saveEdit}>
                <label className="us-field">
                  <span>{t("ชื่อผู้ใช้")}</span>
                  <input
                    type="text"
                    value={editing.username}
                    onChange={(e) => setEditing({ ...editing, username: e.target.value })}
                    autoComplete="off"
                    required
                  />
                  <em>
                    {editing.original.username === userId
                      ? t("a–z 0–9 . _ - ยาว 3–32 ตัว · เปลี่ยนแล้วครั้งหน้าต้องล็อกอินด้วยชื่อใหม่")
                      : t("a–z 0–9 . _ - ยาว 3–32 ตัว · เปลี่ยนแล้วเจ้าตัวจะถูกดีดออก ต้องล็อกอินด้วยชื่อใหม่")}
                  </em>
                </label>

                <label className="us-field">
                  <span>{t("ชื่อที่แสดง")}</span>
                  <input
                    type="text"
                    value={editing.displayName}
                    onChange={(e) => setEditing({ ...editing, displayName: e.target.value })}
                    required
                  />
                </label>

                <label className="us-field">
                  <span>{t("อีเมล")}</span>
                  <input
                    type="email"
                    value={editing.email}
                    onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                    placeholder={t("ไม่บังคับ")}
                    autoComplete="off"
                  />
                  <em>{t("ใช้ล็อกอินแทนชื่อผู้ใช้ได้ · เว้นว่าง = ไม่มีอีเมล")}</em>
                </label>

                <label className="us-field">
                  <span>{t("ระดับสิทธิ์")}</span>
                  <select
                    value={editing.role}
                    onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                    disabled={editing.original.username === userId}
                    title={editing.original.username === userId ? t("เปลี่ยนสิทธิ์ของตัวเองไม่ได้") : undefined}
                  >
                    {ACCOUNT_ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {t(r.name)} — {t(r.tagline)}
                      </option>
                    ))}
                  </select>
                  {editing.original.username === userId && <em>{t("เปลี่ยนสิทธิ์ของตัวเองไม่ได้")}</em>}
                </label>

                {error && (
                  <p className="us-error us-form-error" role="alert">
                    <Icon name="warn" size={17} aria-hidden="true" />
                    {t(error)}
                  </p>
                )}
                <div className="us-form-actions">
                  <button type="submit" className="us-submit" disabled={busy}>
                    <Icon name="check" size={18} />
                    {busy ? t("กำลังบันทึก…") : t("บันทึกการแก้ไข")}
                  </button>
                  <button type="button" className="us-cancel" onClick={() => setEditing(null)}>
                    {t("ยกเลิก")}
                  </button>
                </div>
              </form>
            </Card>
          </Block>
        )}

        <Block id="list" label={t("บัญชีทั้งหมด")}>
          <Card
            title={t("บัญชีทั้งหมด")}
            subtitle={t("ปิดบัญชี = เก็บไว้ เปิดคืนได้ · ลบถาวร = หายไปเลย แต่บันทึกการเข้าใช้งานยังอ่านชื่อได้ · ทั้งสองแบบดีดคนนั้นออกจากทุกเครื่องทันที")}
            icon="list"
          >
            {/* ฟอร์มเปิดอยู่ = ข้อความผิดพลาดไปขึ้นในฟอร์มแทน (ข้างปุ่มบันทึก) — ขึ้นเหนือตาราง
                คนที่เพิ่งกดปุ่มท้ายฟอร์มมองไม่เห็น นึกว่ากดแล้วไม่เกิดอะไร (เจอจริง T1.252) */}
            {error && !formOpen && !resetting && !editing && (
              <p className="us-error" role="alert">
                <Icon name="warn" size={17} aria-hidden="true" />
                {t(error)}
              </p>
            )}
            {status === "loading" ? (
              <p className="us-empty">{t("กำลังโหลด…")}</p>
            ) : users.length === 0 ? (
              <p className="us-empty">{t("ยังไม่มีบัญชีในระบบ")}</p>
            ) : (
              <div className="table-scroll">
                <table className="us-table">
                  <thead>
                    <tr>
                      <th>{t("ผู้ใช้")}</th>
                      <th>{t("ระดับสิทธิ์")}</th>
                      <th>{t("สถานะ")}</th>
                      <th>{t("เข้าล่าสุด")}</th>
                      <th>{t("จัดการ")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const isSelf = u.username === userId;
                      return (
                        <tr key={u.id} className={u.active ? "" : "is-off"}>
                          <td>
                            <b className="us-name">
                              {u.displayName}
                              {isSelf && <span className="us-you">{t("คุณ")}</span>}
                            </b>
                            <span className="us-username">
                              {u.username}
                              {u.email ? ` · ${u.email}` : ""}
                            </span>
                          </td>
                          <td>
                            <select
                              className="us-role"
                              value={u.role}
                              disabled={busy || isSelf}
                              title={isSelf ? t("เปลี่ยนสิทธิ์ของตัวเองไม่ได้") : undefined}
                              aria-label={t("ระดับสิทธิ์ของ {user}", { user: u.username })}
                              onChange={(e) => run(() => apiPatch(`/users/${u.id}`, { role: e.target.value }))}
                            >
                              {ACCOUNT_ROLES.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {t(r.name)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <StatusBadge tone={u.active ? "good" : "offline"}>
                              {u.active ? t("ใช้งานอยู่") : t("ปิดบัญชีแล้ว")}
                            </StatusBadge>
                            {/* ไม่โชว์ "ต้องเปลี่ยนรหัสผ่าน" ในตาราง (ผู้ใช้สั่ง 15 ก.ย. 2569 · T1.258)
                                ระบบยังบังคับเปลี่ยนตอนเข้าครั้งแรกเหมือนเดิม แค่ไม่เอามาแสดงตรงนี้ */}
                          </td>
                          <td className="num">
                            {u.lastSignInAt ? formatDateTime(u.lastSignInAt) : t("ยังไม่เคยเข้า")}
                          </td>
                          <td>
                            {/* ปุ่มเฟืองท้ายแถว — รวมคำสั่งทั้งหมดของบัญชีไว้ในดรอปดาวน์ (ผู้ใช้สั่ง · T1.254)
                                คำสั่งที่ทำกับตัวเองไม่ได้ยังอยู่ในเมนู แค่กดไม่ได้พร้อมเหตุผล */}
                            <ActionMenu
                              label={t("จัดการบัญชี {user}", { user: u.username })}
                              disabled={busy}
                              items={[
                                {
                                  id: "edit",
                                  label: t("แก้ไข"),
                                  icon: "pencil",
                                  onSelect: () => startEdit(u),
                                },
                                {
                                  id: "password",
                                  label: t("ตั้งรหัสใหม่"),
                                  icon: "lock",
                                  onSelect: () => {
                                    setEditing(null);
                                    setFormOpen(false);
                                    setResetting({ id: u.id, username: u.username });
                                  },
                                },
                                {
                                  id: "active",
                                  label: u.active ? t("ปิดบัญชี") : t("เปิดใช้งาน"),
                                  icon: u.active ? "power" : "check",
                                  danger: u.active,
                                  disabled: isSelf,
                                  reason: t("ปิดบัญชีของตัวเองไม่ได้"),
                                  onSelect: () => run(() => apiPatch(`/users/${u.id}`, { active: !u.active })),
                                },
                                {
                                  id: "delete",
                                  label: t("ลบถาวร"),
                                  icon: "trash",
                                  danger: true,
                                  disabled: isSelf,
                                  reason: t("ลบบัญชีของตัวเองไม่ได้"),
                                  onSelect: () =>
                                    setDeleting({ id: u.id, username: u.username, displayName: u.displayName }),
                                },
                              ]}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </Block>

        {/* ═══ ผูกบัญชีไลน์กับผู้ใช้ (T1.363) ═══
            ★ อยู่หน้านี้เพราะเป็น "การให้สิทธิ์" เรื่องเดียวกับการตั้งระดับบัญชี
              ไม่ใช่การตั้งค่าการส่งข้อความ (นั่นอยู่ในปุ่มเฟือง) */}
        <Block id="lineLinks" label={t("ผูกบัญชีไลน์กับผู้ใช้")}>
          <LineLinkCard users={users} />
        </Block>

        {/* ตารางเทียบระดับสิทธิ์ — ผู้ดูแลระบบต้องรู้ก่อนเลือกว่าแต่ละขั้นทำอะไรได้ (T1.251)
            ทุกช่องมีไอคอน + ข้อความ (ได้ / ไม่ได้) ไม่ได้สื่อด้วยสีอย่างเดียว */}
        <Block id="matrix" label={t("ระดับสิทธิ์ทำอะไรได้บ้าง")}>
          <Card
            title={t("ระดับสิทธิ์ทำอะไรได้บ้าง")}
            subtitle={t("ทุกระดับดูข้อมูลได้ทุกหน้าเท่ากัน ต่างกันที่การแก้ไข · ขั้นสูงทำได้ทุกอย่างที่ขั้นต่ำกว่าทำได้")}
            icon="shield"
          >
            <div className="table-scroll">
              <table className="us-table us-matrix">
                <thead>
                  <tr>
                    <th>{t("ทำอะไร")}</th>
                    {ACCOUNT_ROLES.map((r) => (
                      <th key={r.id} className="us-matrix-role">
                        <Icon name={r.icon} size={16} aria-hidden="true" />
                        {t(r.name)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ABILITIES.map((ability) => (
                    <tr key={ability.label}>
                      <td>{t(ability.label)}</td>
                      {ACCOUNT_ROLES.map((r) => {
                        const ok = ability.action === null || roleCan(r.id, ability.action);
                        return (
                          <td key={r.id} className={"us-matrix-cell" + (ok ? " is-yes" : " is-no")}>
                            <Icon name={ok ? "check" : "lock"} size={15} aria-hidden="true" />
                            {ok ? t("ได้") : t("ไม่ได้")}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Block>
      </PageBoard>

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={t("ลบบัญชี {user} ถาวร?", { user: deleting?.username ?? "" })}
        message={t("{name} จะเข้าระบบไม่ได้อีก และบัญชีนี้จะหายจากรายชื่อ — กู้คืนไม่ได้", {
          name: deleting?.displayName ?? "",
        })}
        note={t("ถ้าแค่พักการใช้งานชั่วคราว ใช้ “ปิดบัญชี” แทน (เปิดคืนได้) · บันทึกการเข้าใช้งานเดิมยังเห็นชื่อผู้ใช้อยู่")}
        confirmLabel={t("ลบบัญชี {user}", { user: deleting?.username ?? "" })}
      />
    </>
  );
}

/**
 * ผูกบัญชีไลน์กับผู้ใช้ในระบบ (T1.363)
 *
 * ═══ ★★ ค่าตั้งต้นคือ "อ่านได้ แต่เขียนไม่ได้" ═══
 * บัญชีไลน์ของฟาร์มเป็น Official Account ที่ใครก็กดเพิ่มเพื่อนได้
 * การผูกคือการยกให้บัญชีไลน์หนึ่ง **พูดแทนผู้ใช้คนหนึ่ง** — บันทึกที่พิมพ์เข้ามา
 * จะถูกนับว่าเป็นของเขา จึงต้องผูกกับบัญชีของคนนั้นเอง ไม่ใช่บัญชีผู้ดูแลระบบ
 *
 * ★ เรียงจาก "ทักล่าสุด" ลงมา เพราะขั้นตอนจริงคือให้คนนั้นทักบอทก่อนหนึ่งครั้ง
 *   แล้วผู้ดูแลเข้ามาผูก คนที่เพิ่งทักจึงต้องอยู่บนสุด
 */
function LineLinkCard({ users }) {
  const t = useT();
  const { links, status, error, setLink } = useLineLinks();
  const [busy, setBusy] = useState("");

  const change = async (lineUserId, value) => {
    setBusy(lineUserId);
    try {
      await setLink(lineUserId, value || null);
    } finally {
      setBusy("");
    }
  };

  const body = () => {
    if (status === "loading") return <p className="us-empty">{t("กำลังโหลด…")}</p>;
    if (status === "error") {
      return <p className="us-empty">{t("ดูรายการไม่ได้ตอนนี้")} — {t(error ?? "ต่อไม่ได้")}</p>;
    }
    if (links.length === 0) {
      /* ★ ว่างเพราะยังไม่มีใครทักบอท ไม่ใช่เพราะระบบพัง — ต้องบอกขั้นตอนต่อไปให้ชัด */
      return (
        <p className="us-empty">
          {t("ยังไม่มีบัญชีไลน์ทักเข้ามา — ให้คนที่จะใช้ทักบอทหนึ่งครั้งก่อน แล้วกลับมาที่หน้านี้")}
        </p>
      );
    }
    return (
      <div className="table-scroll">
        <table className="us-table">
          <thead>
            <tr>
              <th>{t("บัญชีไลน์")}</th>
              <th>{t("ทักล่าสุด")}</th>
              <th>{t("ผูกกับผู้ใช้")}</th>
              <th>{t("บันทึกข้อมูลได้ไหม")}</th>
            </tr>
          </thead>
          <tbody>
            {links.map((l) => {
              /* ★ ด่านจริงอยู่ที่ฝั่งไลน์ซึ่งอ่านสิทธิ์จากฐานใหม่ทุกครั้ง ที่นี่แค่บอกให้รู้ล่วงหน้า
                 ผูกแล้วแต่สิทธิ์ไม่ถึง = ยังเขียนไม่ได้ ต้องเห็นตั้งแต่ตรงนี้ ไม่ใช่ไปลองเองแล้วงง */
              const canRecord =
                Boolean(l.userId) && l.active && roleCan(l.role, "record.write");
              return (
                <tr key={l.lineUserId}>
                  <td className="us-mono">{l.lineUserId.slice(0, 10)}…</td>
                  <td>{l.updatedAt ? formatDateTime(l.updatedAt) : "—"}</td>
                  <td>
                    <select
                      className="us-input"
                      value={l.userId ?? ""}
                      disabled={busy === l.lineUserId}
                      onChange={(e) => change(l.lineUserId, e.target.value)}
                      aria-label={t("ผูกกับผู้ใช้")}
                    >
                      <option value="">{t("ยังไม่ผูก (อ่านได้อย่างเดียว)")}</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.displayName} ({u.username})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <StatusBadge tone={canRecord ? "good" : "offline"}>
                      {canRecord
                        ? t("บันทึกได้")
                        : l.userId
                          ? t("สิทธิ์ไม่ถึงผู้บันทึก")
                          : t("อ่านได้อย่างเดียว")}
                    </StatusBadge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <Card
      title={t("ผูกบัญชีไลน์กับผู้ใช้")}
      subtitle={t("ผูกแล้วคนนั้นบันทึกงานผ่านไลน์ได้ และทุกรายการจะตอบได้ว่าใครบันทึก")}
      icon="chat"
    >
      {error && status === "ok" && <p className="us-error">{t(error)}</p>}
      {body()}
    </Card>
  );
}
