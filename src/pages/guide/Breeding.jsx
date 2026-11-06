/**
 * คู่มือ "ผสมพันธุ์ & สายพันธุ์" — /dashboard/guide/breeding (T1.293)
 *
 * เนื้อหาและภาพลายเส้นมาจากทีม Farmy (`src/data/farmy/breeding.js` · `public/farmy/breeds/`)
 * เรียบเรียงจากเอกสาร "การเลี้ยงสุกร" กรมปศุสัตว์ ที่ฟาร์มให้มา
 *
 * ★ **คำแนะนำในหน้านี้เป็นคำแนะนำทั่วไปจากเอกสาร ไม่ได้คิดจากข้อมูลฝูงของฟาร์มนี้**
 *   ต้องเขียนบอกบนหน้าจอ ไม่ใช่รู้กันแค่ในโค้ด — หน้าตาของมันเหมือน "ระบบคำนวณให้"
 *   ซึ่งชวนให้เข้าใจว่าดูประวัติผสม ผลผลิต และสายเลือดของคอกเราแล้ว ทั้งที่ยังไม่ได้ดูเลย
 *   (ถ้าวันหนึ่งจะให้คิดจากข้อมูลจริง ต้องต่อกับ `barn_log`/ฝูงก่อน — ดู T1.269)
 *
 * ★ **ข้อควรระวัง (`cautions`) ต้องโชว์เสมอ ห้ามพับเก็บ** — เนื้อหาในนั้นคือเหตุผลที่
 *   คำแนะนำอาจไม่เหมาะกับฟาร์มนั้น (เลือดชิด · แม่ดูร็อคให้ลูกไม่ดก · พ่อตัวใหญ่กว่าแม่มาก)
 *   ซ่อนไว้แล้วเหลือแต่ข้อดี = กลายเป็นโฆษณา ไม่ใช่คำแนะนำ
 *
 * ★ **ทางเลือกสำรอง (`alt`) แสดงคู่กับตัวหลักเสมอ** เอกสารตั้งใจให้เลือกตามเป้าหมาย
 *   ของฟาร์ม (เนื้อแดงมากขึ้นแต่โตช้าลง ฯลฯ) ไม่ใช่มีคำตอบเดียว
 *
 * เส้นทางภาพในข้อมูลของเขาเขียนไว้ว่า `/breeds/x.svg` แต่ของเราวางที่ `public/farmy/breeds/`
 * และแอปขึ้นได้ทั้งที่ราก `/` และในโฟลเดอร์ย่อย — จึงต้องประกอบ URL ใหม่ผ่าน `BASE_URL`
 * (ห้ามแก้ไฟล์ข้อมูลของเขาเพื่อให้ path ตรง — ดูคำเตือนหัวไฟล์ `breeding.js`)
 */
import { useState } from "react";
import PageHeader from "../../components/ui/PageHeader.jsx";
import PageBoard, { Block } from "../../components/board/PageBoard.jsx";
import Card from "../../components/ui/Card.jsx";
import Icon from "../../components/ui/Icon.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import {
  BREEDING_FACTS,
  BREEDING_TIMELINE,
  BREEDS,
  CROSS_PLANS,
  DAM_OPTIONS,
  GOALS,
  SELECTION,
  SOURCE_NOTE,
  recommendSire,
} from "../../data/farmy/breeding.js";
import { iconFor } from "../../data/farmy/icons.js";
import { timelineFor, todayIso } from "../../lib/farmy/breedingDates.js";
import { formatDateYear, formatNumber } from "../../lib/format.js";
import { useT } from "../../lib/i18n/useT.js";
import "./guide.css";

/** `/breeds/duroc.svg` (เส้นทางของเขา) → URL จริงของเรา */
const art = (img) => `${import.meta.env.BASE_URL}farmy/breeds/${img.split("/").pop()}`;

/** ใช้ทำอะไรได้ (`use` ในข้อมูลของเขา) → ป้ายที่คนอ่านเข้าใจ */
const USE_TEXT = {
  sire: "ใช้เป็นสายพ่อ",
  dam: "ใช้เป็นสายแม่",
  both: "ใช้ได้ทั้งสายพ่อและสายแม่",
};

/** การ์ดพ่อพันธุ์หนึ่งใบ — ใช้ทั้งตัวที่แนะนำและตัวสำรอง */
function SireCard({ sire, t, alt = false }) {
  return (
    <div className={"gd-sire" + (alt ? " is-alt" : "")}>
      <img className="gd-sire-art" src={art(sire.img)} alt="" loading="lazy" />
      <div className="gd-sire-body">
        <h4>{t(sire.name)}</h4>
        <p className="gd-sire-look">{t(sire.look)}</p>
        <ul>
          {sire.strong.map((line) => (
            <li key={line}>{t(line)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Breeding() {
  const t = useT();
  const [damId, setDamId] = useState(DAM_OPTIONS[0].id);
  const [goal, setGoal] = useState(GOALS[0].id);
  const [bredOn, setBredOn] = useState(todayIso);

  const plan = recommendSire(damId, goal);
  const goalMeta = GOALS.find((g) => g.id === goal) ?? GOALS[0];
  const timeline = timelineFor(bredOn, BREEDING_TIMELINE);

  return (
    <>
      <PageHeader
        title={t("ผสมพันธุ์ & สายพันธุ์")}
        subtitle={t("เลือกพ่อพันธุ์จากแม่ที่มีในคอก · {n} สายพันธุ์ · นับวันคลอดจากวันผสม", {
          n: formatNumber(BREEDS.length),
        })}
      />

      <PageBoard boardId="guideBreeding">
        <Block id="plan" label={t("เลือกพ่อพันธุ์")}>
          <Card
            title={t("เลือกพ่อพันธุ์จากแม่ที่มีในคอก")}
            subtitle={t("ตอบสองข้อ แล้วดูว่าเอกสารแนะนำให้ใช้พ่อพันธุ์อะไร")}
            icon="spark"
          >
            <h4 className="gd-ask">
              {t("1 · แม่พันธุ์ที่มีในคอกตอนนี้")}
            </h4>
            <div className="gd-picks">
              {DAM_OPTIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={"gd-pick" + (damId === d.id ? " is-on" : "")}
                  onClick={() => setDamId(d.id)}
                  aria-pressed={damId === d.id}
                >
                  <img src={art(d.img)} alt="" loading="lazy" />
                  <span>
                    <b>{t(d.short)}</b>
                    <span className="gd-pick-look">{t(d.look)}</span>
                  </span>
                </button>
              ))}
            </div>

            <h4 className="gd-ask">{t("2 · จะเอาลูกไปทำอะไร")}</h4>
            <div className="gd-picks is-wide">
              {GOALS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={"gd-pick" + (goal === g.id ? " is-on" : "")}
                  onClick={() => setGoal(g.id)}
                  aria-pressed={goal === g.id}
                >
                  <span className="gd-pick-mark" aria-hidden="true">
                    <Icon name={iconFor(g.icon)} size={20} />
                  </span>
                  <span>
                    <b>{t(g.label)}</b>
                    <span className="gd-pick-look">{t(g.hint)}</span>
                  </span>
                </button>
              ))}
            </div>

            {plan ? (
              <section className="gd-plan">
                <h4 className="gd-ask">
                  {t("เอกสารแนะนำ: {dam} × {sire}", {
                    dam: t(plan.dam?.short ?? ""),
                    sire: t(plan.sire.name),
                  })}
                </h4>

                <SireCard sire={plan.sire} t={t} />

                <p className="gd-out">
                  <Icon name="chevron" size={16} aria-hidden="true" />
                  <span>
                    <b>{t(plan.out)}</b>
                    <span>{t(plan.outNote)}</span>
                  </span>
                </p>

                {plan.tags?.length > 0 && (
                  <ul className="gd-tags">
                    {plan.tags.map((tag) => (
                      <li key={tag}>{t(tag)}</li>
                    ))}
                  </ul>
                )}

                <h5 className="gd-sub">{t("ได้อะไรจากคู่นี้")}</h5>
                <ul className="gd-rules">
                  {plan.gain.map((line) => (
                    <li key={line}>
                      <Icon name="check" size={15} aria-hidden="true" />
                      <span>{t(line)}</span>
                    </li>
                  ))}
                </ul>

                <h5 className="gd-sub">{t("ทำไมถึงแนะนำแบบนี้")}</h5>
                <ul className="gd-look">
                  {plan.why.map((line) => (
                    <li key={line}>{t(line)}</li>
                  ))}
                </ul>

                {/* ★ ทางเลือกสำรองอยู่คู่ตัวหลักเสมอ — เอกสารตั้งใจให้เลือกตามเป้าหมายฟาร์ม */}
                {plan.alt && (
                  <>
                    <h5 className="gd-sub">{t("ทางเลือกอีกทาง")}</h5>
                    <p className="gd-alt-note">{t(plan.alt.note)}</p>
                    <SireCard sire={plan.alt.sire} t={t} alt />
                  </>
                )}

                {/* ★ ข้อควรระวังห้ามพับเก็บ — ดูเหตุผลที่หัวไฟล์ */}
                {plan.cautions?.length > 0 && (
                  <div className="gd-cautions">
                    {plan.cautions.map((line) => (
                      <p key={line} className="gd-warn" role="note">
                        <Icon name="warn" size={18} aria-hidden="true" />
                        <span>{t(line)}</span>
                      </p>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              /* ตอนนี้ข้อมูลของเขาครบทุกคู่ (แม่ 5 × เป้าหมาย 2) — กันไว้เผื่อเขาเพิ่มตัวเลือก
                 แล้วลืมเติมคำแนะนำ ดีกว่าหน้าขาวหรือโชว์การ์ดว่างเปล่า */
              <p className="gd-empty">
                <Icon name="info" size={20} aria-hidden="true" />
                {t("เอกสารยังไม่มีคำแนะนำสำหรับคู่นี้ — ปรึกษาสัตวแพทย์ผู้ควบคุมฟาร์ม")}
              </p>
            )}

            {/* ★ ต้องบอกให้ชัดว่านี่ไม่ได้คิดจากข้อมูลฝูงของฟาร์มนี้ (เหตุผลที่หัวไฟล์) */}
            <p className="gd-source">
              <Icon name="warn" size={14} aria-hidden="true" />
              {t(
                "เป็นคำแนะนำทั่วไปตามเป้าหมาย “{goal}” จากเอกสาร ไม่ได้คิดจากประวัติผสมหรือสายเลือดของฝูงนี้",
                { goal: t(goalMeta.label) },
              )}
            </p>
            <p className="gd-source">
              <Icon name="info" size={14} aria-hidden="true" />
              {t(SOURCE_NOTE)}
            </p>
          </Card>
        </Block>

        <Block id="timeline" label={t("นับวันจากวันผสม")}>
          <Card
            title={t("นับวันจากวันผสม")}
            subtitle={t("ตั้งท้อง 114 วัน — ประมาณ 3 เดือน 3 สัปดาห์ 3 วัน")}
            icon="clock"
          >
            <label className="gd-date">
              <span>{t("วันที่ผสม")}</span>
              <input
                type="date"
                value={bredOn}
                onChange={(e) => setBredOn(e.target.value)}
              />
            </label>

            <ol className="gd-days">
              {timeline.map((m) => (
                <li key={m.day} className={"gd-day" + (m.day === 114 ? " is-key" : "")}>
                  <span className="gd-day-n" aria-hidden="true">
                    {t("วันที่ {n}", { n: formatNumber(m.day) })}
                  </span>
                  <span className="gd-day-body">
                    <b>{t(m.label)}</b>
                    <span>{t(m.desc)}</span>
                  </span>
                  {/* วันที่ว่างเมื่อช่องกรอกยังไม่มีค่าที่ใช้ได้ — ไม่ใช่โชว์วันที่มั่ว */}
                  <span className="gd-day-date">
                    {m.date ? formatDateYear(m.date) : t("ใส่วันที่ผสมก่อน")}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </Block>

        <Block id="breeds" label={t("สายพันธุ์")}>
          <Card
            title={t("สายพันธุ์ที่ใช้ในไทย")}
            subtitle={t("แต่ละพันธุ์เก่งคนละด้าน ผสมข้ามพันธุ์แล้วลูกได้ข้อดีของทั้งสองฝั่ง")}
            icon="pig"
          >
            <div className="gd-breeds">
              {BREEDS.map((b) => (
                <section key={b.id} className="gd-breed">
                  <img className="gd-breed-art" src={art(b.img)} alt="" loading="lazy" />
                  <div className="gd-breed-body">
                    <div className="gd-item-top">
                      <h4>{t(b.name)}</h4>
                      {/* ใช้เป็นสายพ่อหรือสายแม่ — ป้ายกลาง ๆ ทุกใบ เพราะไม่มีพันธุ์ไหน
                          "ดีกว่า" พันธุ์อื่น มีแต่เหมาะกับหน้าที่ต่างกัน */}
                      <StatusBadge tone="good">{t(USE_TEXT[b.use] ?? b.use)}</StatusBadge>
                    </div>
                    <p className="gd-item-en">{b.en}</p>

                    <dl className="gd-specs">
                      <div>
                        <dt>{t("ถิ่นกำเนิด")}</dt>
                        <dd>{t(b.origin)}</dd>
                      </div>
                      <div>
                        <dt>{t("ประเภท")}</dt>
                        <dd>{t("สุกรพันธุ์{type}", { type: t(b.type) })}</dd>
                      </div>
                      <div>
                        <dt>{t("ลักษณะ")}</dt>
                        <dd>{t(b.color)}</dd>
                      </div>
                      <div>
                        <dt>{t("น้ำหนักโตเต็มที่")}</dt>
                        <dd>{t(b.mature)}</dd>
                      </div>
                      <div>
                        <dt>{t("ลูกต่อครอก")}</dt>
                        <dd>{t(b.litter)}</dd>
                      </div>
                    </dl>

                    <h5 className="gd-sub">{t("จุดเด่น")}</h5>
                    <ul className="gd-rules">
                      {b.strong.map((line) => (
                        <li key={line}>
                          <Icon name="check" size={15} aria-hidden="true" />
                          <span>{t(line)}</span>
                        </li>
                      ))}
                    </ul>

                    {/* ★ ข้อจำกัดต้องอยู่ใบเดียวกับจุดเด่น ไม่ใช่รวมไว้ท้ายหน้า
                        คนเลือกพันธุ์จากใบนี้ใบเดียว ถ้าข้อจำกัดอยู่คนละที่ก็เท่ากับไม่มี */}
                    {b.weak.length > 0 && (
                      <>
                        <h5 className="gd-sub">{t("ข้อจำกัด")}</h5>
                        <ul className="gd-rules is-warn">
                          {b.weak.map((line) => (
                            <li key={line}>
                              <Icon name="warn" size={15} aria-hidden="true" />
                              <span>{t(line)}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    <p className="gd-breed-note">{t(b.note)}</p>
                  </div>
                </section>
              ))}
            </div>
          </Card>
        </Block>

        <Block id="plans" label={t("แผนผสม")}>
          <Card
            title={t("แผนผสมที่เอกสารแนะนำ")}
            subtitle={t("เรียงจากที่ฟาร์มใช้กันมากที่สุด")}
            icon="list"
          >
            <div className="gd-crosses">
              {CROSS_PLANS.map((p) => (
                <section key={p.id} className="gd-cross">
                  <div className="gd-item-top">
                    <h4>{t(p.title)}</h4>
                    {p.recommended && <StatusBadge tone="good">{t("ใช้กันมากที่สุด")}</StatusBadge>}
                  </div>
                  <p className="gd-cross-sum">{t(p.summary)}</p>

                  <ol className="gd-steps">
                    {p.steps.map((s, i) => (
                      <li key={s.out} className="gd-step">
                        <span className="gd-step-n" aria-hidden="true">
                          {formatNumber(i + 1)}
                        </span>
                        <div className="gd-step-body">
                          <h4>
                            {t("พ่อ {sire} × แม่ {dam}", { sire: t(s.sire), dam: t(s.dam) })}
                          </h4>
                          <p className="gd-step-time">
                            <Icon name="chevron" size={14} aria-hidden="true" />
                            {t(s.out)}
                          </p>
                          <p className="gd-step-why">{t(s.note)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>

                  <h5 className="gd-sub">{t("ข้อดี")}</h5>
                  <ul className="gd-rules">
                    {p.pros.map((line) => (
                      <li key={line}>
                        <Icon name="check" size={15} aria-hidden="true" />
                        <span>{t(line)}</span>
                      </li>
                    ))}
                  </ul>

                  <h5 className="gd-sub">{t("ข้อเสีย")}</h5>
                  <ul className="gd-rules is-warn">
                    {p.cons.map((line) => (
                      <li key={line}>
                        <Icon name="warn" size={15} aria-hidden="true" />
                        <span>{t(line)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </Card>
        </Block>

        <Block id="facts" label={t("ตัวเลขหน้าคอก")}>
          <Card
            title={t("ตัวเลขที่ใช้จริงหน้าคอก")}
            subtitle={t("ค่าอ้างอิงจากเอกสาร ไม่ใช่ค่าที่วัดจากฝูงนี้")}
            icon="chart"
          >
            {/* ไม่ใช้ `StatTile` เพราะไทล์นั้นบังคับติดป้ายที่มาของตัวเลข (สด/ผสม/ตัวอย่าง)
                ซึ่งเป็นป้ายของ "ค่าที่วัดได้" — เลขพวกนี้เป็นค่าอ้างอิงจากเอกสาร ติดป้ายนั้นแล้วผิด
                และไม่ได้ใช้ไอคอนในข้อมูลของเขาด้วย เพราะสิ่งที่คนมาหาคือตัวเลข ไม่ใช่รูป */}
            <dl className="gd-facts">
              {BREEDING_FACTS.map((f) => (
                <div key={f.label} className="gd-fact">
                  <dt>{t(f.label)}</dt>
                  <dd>
                    <b>{t(f.value)}</b>
                    <span>{t(f.note)}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </Block>

        <Block id="selection" label={t("คัดตัวทำพันธุ์")}>
          <Card
            title={t("คัดตัวที่จะเก็บไว้ทำพันธุ์")}
            subtitle={t("เก็บตัวไหน และคัดตัวไหนออกจากฝูง")}
            icon="filter"
          >
            <h5 className="gd-sub">{t("เก็บไว้ทำพันธุ์")}</h5>
            <ul className="gd-rules">
              {SELECTION.keep.map((line) => (
                <li key={line}>
                  <Icon name="check" size={15} aria-hidden="true" />
                  <span>{t(line)}</span>
                </li>
              ))}
            </ul>

            <h5 className="gd-sub">{t("คัดออกจากฝูง")}</h5>
            <ul className="gd-rules is-warn">
              {SELECTION.cull.map((line) => (
                <li key={line}>
                  <Icon name="warn" size={15} aria-hidden="true" />
                  <span>{t(line)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Block>
      </PageBoard>
    </>
  );
}
