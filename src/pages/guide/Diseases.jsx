/**
 * คู่มือ "โรคและอาการ" — /dashboard/guide/diseases (T1.289)
 *
 * เนื้อหาและภาพประกอบมาจากทีม Farmy (`src/data/farmy/diseases.js` · `public/farmy/diseases/`)
 * **หน้าจอเขียนใหม่ทั้งหมดด้วยระบบดีไซน์ของเรา** — ไม่ได้ยก CSS 3,900 บรรทัดของเขามา
 * ไม่งั้นแอปจะมีสองหน้าตาที่ดูแลคู่กันไปตลอด
 *
 * ★ สิ่งที่ห้ามตัดทิ้งไม่ว่าจะจัดหน้าใหม่กี่ครั้ง
 *   · `warn` ของแต่ละโรค — บอกว่าหน้านี้ช่วยได้แค่สังเกตอาการเบื้องต้น การยืนยันต้องให้สัตวแพทย์
 *   · `lookalike` — โรคที่อาการคล้ายกัน คนอ่านต้องเห็นว่ามีโอกาสเป็นโรคอื่น
 *   · ที่มาของเนื้อหา (กรมปศุสัตว์ / มกอช.)
 *   ตัดสามอย่างนี้ออกแล้วหน้านี้จะกลายเป็น "เครื่องวินิจฉัยโรค" ซึ่งมันไม่ใช่ และอันตราย
 *
 * โรคที่ `ready: false` ยังไม่มีเนื้อหา — โชว์ในรายการแต่กดเข้าไม่ได้ และบอกตรง ๆ ว่ายังไม่มี
 * ดีกว่าซ่อนทิ้ง เพราะคนจะได้รู้ว่าระบบรู้จักโรคนี้อยู่ แค่ยังไม่ได้เขียน
 */
import { useState } from "react";
import PageHeader from "../../components/ui/PageHeader.jsx";
import PageBoard, { Block } from "../../components/board/PageBoard.jsx";
import Card from "../../components/ui/Card.jsx";
import Icon from "../../components/ui/Icon.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import { DISEASES, findDisease } from "../../data/farmy/diseases.js";
import { iconFor, severityFor } from "../../data/farmy/icons.js";
import { useT } from "../../lib/i18n/useT.js";
import "./guide.css";

const SOURCE = "เนื้อหาและภาพประกอบจากทีม Farmy · เรียบเรียงจากเอกสารกรมปศุสัตว์";

export default function Diseases() {
  const t = useT();
  /* เลือกโรคด้วย state ไม่ใช่ route ย่อย — หน้านี้อยู่บนกระดานจัดเลย์เอาต์
     ถ้าเปลี่ยน route ทั้งหน้าจะ remount แล้วตำแหน่งกล่องที่ผู้ใช้จัดไว้กระพริบทุกครั้งที่กดโรค */
  const [openId, setOpenId] = useState(null);
  const open = openId ? findDisease(openId) : null;

  return (
    <>
      <PageHeader
        title={t("โรคและอาการ")}
        subtitle={t("ดูอาการที่ต้องสังเกต และสิ่งที่ต้องทำเมื่อสงสัย · {n} โรค", {
          n: DISEASES.filter((d) => d.ready).length,
        })}
      />

      <PageBoard boardId="guideDiseases">
        <Block id="list" label={t("รายชื่อโรค")}>
          <Card
            title={t("เลือกโรคที่สงสัย")}
            subtitle={t("กดที่ชื่อโรคเพื่อดูอาการแยกตามตำแหน่งที่ต้องไปดู")}
            icon="pulse"
          >
            <ul className="gd-list">
              {DISEASES.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className={"gd-item" + (openId === d.id ? " is-open" : "")}
                    disabled={!d.ready}
                    onClick={() => setOpenId(openId === d.id ? null : d.id)}
                    aria-expanded={openId === d.id}
                  >
                    <span className="gd-item-mark" aria-hidden="true">
                      <Icon name={iconFor(d.icon)} size={18} />
                    </span>
                    <span className="gd-item-text">
                      <span className="gd-item-top">
                        <b>{t(d.name)}</b>
                        {/* ป้ายนี้บอก **ความร้ายแรงของโรค** อย่างเดียว
                            เรื่อง "มีเนื้อหาหรือยัง" เป็นคนละเรื่อง อยู่บรรทัดล่าง
                            เอามารวมป้ายเดียวเมื่อไรจะได้กากบาทแดงข้างคำว่า "มีข้อมูล" */}
                        <StatusBadge tone={severityFor(d.tone).tone}>
                          {t(severityFor(d.tone).label)}
                        </StatusBadge>
                      </span>
                      <span className="gd-item-en">{d.en}</span>
                      {d.summary && <span className="gd-item-sum">{t(d.summary)}</span>}
                      {!d.ready && (
                        <span className="gd-item-soon">
                          <Icon name="clock" size={13} aria-hidden="true" />
                          {t("ยังไม่มีเนื้อหา")}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="gd-source">
              <Icon name="info" size={14} aria-hidden="true" />
              {t(SOURCE)}
            </p>
          </Card>
        </Block>

        <Block id="detail" label={t("อาการของโรคที่เลือก")}>
          {open ? (
            <Card
              title={t(open.name)}
              subtitle={open.en}
              icon={iconFor(open.icon)}
            >
              {/* ★ คำเตือนต้องอยู่บนสุดเสมอ ก่อนที่คนจะอ่านรายการอาการ */}
              {open.warn && (
                <p className="gd-warn" role="note">
                  <Icon name="warn" size={18} aria-hidden="true" />
                  <span>{t(open.warn)}</span>
                </p>
              )}

              <div className="gd-signs">
                {open.signs.map((s) => (
                  <section key={s.id} className="gd-sign">
                    <img
                      className="gd-sign-art"
                      src={`${import.meta.env.BASE_URL}farmy/diseases/${s.id}.svg`}
                      alt=""
                      loading="lazy"
                    />
                    <div className="gd-sign-body">
                      <h4>{t(s.title)}</h4>
                      <p className="gd-sign-where">
                        <Icon name="pin" size={14} aria-hidden="true" />
                        {t(s.where)}
                      </p>
                      <p className="gd-sign-stage">{t(s.stage)}</p>
                      <ul>
                        {s.list.map((line) => (
                          <li key={line}>{t(line)}</li>
                        ))}
                      </ul>
                    </div>
                  </section>
                ))}
              </div>

              {open.actions?.length > 0 && (
                <>
                  <h4 className="gd-head">{t("สงสัยแล้วต้องทำอะไร")}</h4>
                  <ol className="gd-actions">
                    {open.actions.map((a) => (
                      <li key={a.title}>
                        <span className="gd-act-mark" aria-hidden="true">
                          <Icon name={iconFor(a.icon)} size={17} />
                        </span>
                        <span>
                          <b>{t(a.title)}</b>
                          {a.desc && <span>{t(a.desc)}</span>}
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              )}

              {open.lookalike?.length > 0 && (
                <>
                  <h4 className="gd-head">{t("โรคอื่นที่อาการคล้ายกัน")}</h4>
                  <ul className="gd-look">
                    {open.lookalike.map((name) => (
                      <li key={name}>{t(name)}</li>
                    ))}
                  </ul>
                  <p className="gd-source">
                    <Icon name="info" size={14} aria-hidden="true" />
                    {t("อาการคล้ายกันหลายโรค — ต้องให้สัตวแพทย์ตรวจยืนยันเสมอ")}
                  </p>
                </>
              )}
            </Card>
          ) : (
            <Card title={t("อาการของโรค")} icon="eye">
              <p className="gd-empty">
                <Icon name="pulse" size={30} aria-hidden="true" />
                <span>{t("เลือกโรคจากรายการทางซ้ายเพื่อดูอาการและสิ่งที่ต้องทำ")}</span>
              </p>
            </Card>
          )}
        </Block>
      </PageBoard>
    </>
  );
}
