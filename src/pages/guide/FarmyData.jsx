/**
 * "ข้อมูลจากฟาร์มมี่" — /dashboard/guide/farmy (T1.290)
 *
 * สามชุดที่แดชบอร์ดเราไม่มีข้อมูลเองเลย จึงดึงมาจากระบบของทีม Farmy
 *   · วัคซีนใกล้ครบกำหนดฉีดซ้ำ
 *   · งานฟาร์มของวันนี้ (รวมงานที่ค้างข้ามวัน)
 *   · เคสที่ปรึกษาสัตวแพทย์
 *
 * ★ **อ่านอย่างเดียว** ไม่มีปุ่มรับงาน/ปิดเคส เพราะเราใช้บัญชี Farmy บัญชีเดียวร่วมกันทุกคน
 *   กดจากที่นี่แล้วฝั่งเขาจะบันทึกว่าเป็นคนคนเดียวกันหมด ซึ่งผิดจากความจริงและตามรอยไม่ได้
 *   จะเปิดให้กดได้ต้องรอ SSO (T1.244) — จนกว่าจะถึงตอนนั้นให้กดในเว็บของเขา
 *
 * ★ **ทุกการ์ดต้องติดป้ายว่าเป็นข้อมูลของทีมอื่น** ไม่งั้นคนจะเอาไปปนกับตัวเลขของเรา
 *   แล้วเข้าใจว่ามาจากฐานเดียวกัน — ซึ่งไม่ใช่ และสองระบบนี้ไม่ได้ซิงก์กันเลย
 *
 * แต่ละชุดโหลดแยกกันและพังแยกกัน ชุดหนึ่งล่มต้องไม่ทำให้อีกสองชุดหายไปด้วย
 */
import PageHeader from "../../components/ui/PageHeader.jsx";
import PageBoard, { Block } from "../../components/board/PageBoard.jsx";
import Card from "../../components/ui/Card.jsx";
import Icon from "../../components/ui/Icon.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import { rowsOf, useFarmySet } from "../../lib/api/farmyData.js";
import { formatDateShort } from "../../lib/format.js";
import { useT } from "../../lib/i18n/useT.js";
import "./guide.css";

/** วันครบกำหนดเหลืออีกกี่วัน — ติดลบ = เลยกำหนดมาแล้ว */
function daysLeft(dateStr) {
  if (!dateStr) return null;
  const due = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due - today) / 86_400_000);
}

/** กล่องห่อของทุกชุด — โหลด / พัง / ว่าง / มีข้อมูล ต้องหน้าตาเหมือนกันทั้งสามชุด */
function SetCard({ title, subtitle, icon, set, empty, children }) {
  const t = useT();
  return (
    <Card title={t(title)} subtitle={t(subtitle)} icon={icon}>
      {set.loading && (
        <p className="gd-empty" role="status">
          <Icon name="clock" size={26} aria-hidden="true" />
          <span>{t("กำลังดึงข้อมูลจากระบบฟาร์มมี่…")}</span>
        </p>
      )}

      {/* ข้อความผิดพลาดมาจากเซิร์ฟเวอร์ของเขา ซึ่งมักบอกวิธีแก้ในตัว — โชว์ตรง ๆ */}
      {!set.loading && set.error && (
        <p className="gd-warn" role="status">
          <Icon name="warn" size={18} aria-hidden="true" />
          <span>{set.error}</span>
        </p>
      )}

      {!set.loading && !set.error && rowsOf(set.data).length === 0 && (
        <p className="gd-empty" role="status">
          <Icon name="check" size={26} aria-hidden="true" />
          <span>{t(empty)}</span>
        </p>
      )}

      {!set.loading && !set.error && rowsOf(set.data).length > 0 && children(rowsOf(set.data))}

      <p className="gd-source">
        <Icon name="info" size={14} aria-hidden="true" />
        {t("ข้อมูลของทีม Farmy · ไม่ได้อยู่ในฐานข้อมูลของแดชบอร์ดนี้ และไม่ได้ซิงก์กัน")}
      </p>
    </Card>
  );
}

export default function FarmyData() {
  const t = useT();
  const due = useFarmySet("vaccine-due");
  const tasks = useFarmySet("farm-tasks");
  const posts = useFarmySet("vet-posts");

  return (
    <>
      <PageHeader
        title={t("ข้อมูลจากฟาร์มมี่")}
        subtitle={t("วัคซีน · งานฟาร์ม · เคสสัตวแพทย์ — ดูอย่างเดียว แก้ที่เว็บของเขา")}
      />

      <PageBoard boardId="guideFarmy">
        <Block id="vaccine" label={t("วัคซีนใกล้ครบกำหนด")}>
          <SetCard
            title="วัคซีนใกล้ครบกำหนด"
            subtitle="เข็มที่ถึงกำหนดฉีดซ้ำใน 7 วันข้างหน้า และที่เลยกำหนดแล้ว"
            icon="spark"
            set={due}
            empty="ไม่มีเข็มที่ใกล้ครบกำหนดใน 7 วันนี้"
          >
            {(rows) => (
              <ul className="gd-rows">
                {rows.map((r, i) => {
                  const left = daysLeft(r.next_due_date);
                  return (
                    <li key={r.id ?? i} className="gd-row">
                      <span className="gd-row-main">
                        <b>{r.vaccine_name || t("ไม่ระบุชื่อวัคซีน")}</b>
                        <span className="gd-row-sub">
                          {[r.barn_no && t("โรงเรือน {n}", { n: r.barn_no }), r.pen_no && t("คอก {n}", { n: r.pen_no })]
                            .filter(Boolean)
                            .join(" · ") || t("ไม่ระบุตำแหน่ง")}
                        </span>
                      </span>
                      <span className="gd-row-side">
                        {r.next_due_date && <span className="gd-row-date">{formatDateShort(r.next_due_date)}</span>}
                        {/* เลยกำหนดแล้วต้องเด่นกว่า "อีกกี่วัน" — คนละความเร่งด่วนกันคนละเรื่อง */}
                        {left !== null && (
                          <StatusBadge tone={left < 0 ? "critical" : left <= 1 ? "warning" : "good"}>
                            {left < 0
                              ? t("เลยกำหนด {n} วัน", { n: Math.abs(left) })
                              : left === 0
                                ? t("ครบกำหนดวันนี้")
                                : t("อีก {n} วัน", { n: left })}
                          </StatusBadge>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SetCard>
        </Block>

        <Block id="tasks" label={t("งานฟาร์มวันนี้")}>
          <SetCard
            title="งานฟาร์มวันนี้"
            subtitle="รวมงานที่ค้างจากวันก่อนด้วย"
            icon="list"
            set={tasks}
            empty="ไม่มีงานค้างของวันนี้"
          >
            {(rows) => (
              <ul className="gd-rows">
                {rows.map((r, i) => (
                  <li key={r.id ?? i} className="gd-row">
                    <span className="gd-row-main">
                      <b>{r.title}</b>
                      {r.detail && <span className="gd-row-sub">{r.detail}</span>}
                      <span className="gd-row-sub">
                        {[
                          r.barn_no && t("โรงเรือน {n}", { n: r.barn_no }),
                          r.due_time,
                          r.assignee_name && t("ผู้รับผิดชอบ {name}", { name: r.assignee_name }),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="gd-row-side">
                      {r.priority === "urgent" && (
                        <StatusBadge tone="critical">{t("ด่วน")}</StatusBadge>
                      )}
                      <StatusBadge
                        tone={
                          r.status === "done" ? "good" : r.status === "issue" ? "critical" : r.status === "doing" ? "warning" : "offline"
                        }
                      >
                        {t(
                          r.status === "done"
                            ? "เสร็จแล้ว"
                            : r.status === "issue"
                              ? "พบปัญหา"
                              : r.status === "doing"
                                ? "กำลังทำ"
                                : "ยังไม่เริ่ม",
                        )}
                      </StatusBadge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SetCard>
        </Block>

        <Block id="vet" label={t("เคสที่ปรึกษาสัตวแพทย์")}>
          <SetCard
            title="เคสที่ปรึกษาสัตวแพทย์"
            subtitle="เคสที่ฟาร์มโพสต์ถามและสถานะการรับดูแล"
            icon="chat"
            set={posts}
            empty="ยังไม่มีเคสที่ถามไว้"
          >
            {(rows) => (
              <ul className="gd-rows">
                {rows.map((r, i) => (
                  <li key={r.id ?? i} className="gd-row">
                    <span className="gd-row-main">
                      <b>{r.title}</b>
                      <span className="gd-row-sub">
                        {[
                          r.farm_name,
                          r.barn_no && t("โรงเรือน {n}", { n: r.barn_no }),
                          r.age_stage,
                          r.created_at && formatDateShort(r.created_at),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="gd-row-side">
                      <StatusBadge
                        tone={r.status === "done" ? "good" : r.status === "claimed" ? "warning" : "critical"}
                      >
                        {t(
                          r.status === "done"
                            ? "จบเคสแล้ว"
                            : r.status === "claimed"
                              ? "มีสัตวแพทย์ดูแลแล้ว"
                              : "ยังไม่มีใครรับ",
                        )}
                      </StatusBadge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SetCard>
        </Block>
      </PageBoard>
    </>
  );
}
