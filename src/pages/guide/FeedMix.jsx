/**
 * คู่มือ "ผสมอาหารต้นทุนต่ำ" — /dashboard/guide/feed-mix (T1.294)
 *
 * ตัวคิดสูตรและตารางการกินมาจากทีม Farmy (`src/data/farmy/feed.js` · `feedMix.js`)
 * เรียบเรียงจากเอกสารกรมปศุสัตว์ — หน้าจอเป็นของเรา
 *
 * ★ **ไม่รู้ราคา = ไม่บอกต้นทุน** ไฟล์ข้อมูลของเขาตั้ง `price: null` ไว้ทุกตัวโดยตั้งใจ
 *   เพราะราคาตลาดเปลี่ยนตลอดและต่างกันตามพื้นที่ ถ้าเราแอบนับตัวที่ยังไม่รู้ราคาเป็น 0
 *   จะได้ต้นทุนที่ต่ำกว่าจริงแต่ดูน่าเชื่อถือ ซึ่งแย่กว่าไม่บอกเลย — คนจะเอาไปตัดสินใจซื้อจริง
 *   ➜ หน้านี้จึงบอกไปตรง ๆ ว่าขาดราคาตัวไหน แทนที่จะโชว์ตัวเลข
 *
 * ★ **พรีมิกซ์ + เกลือ 1.5% ไม่ใช่ตัวเลือก** สูตรที่โปรตีนพอแต่ขาดแร่ธาตุทำให้ขาหัก
 *   กระดูกอ่อน โตไม่ดี — แถวนี้จึงอยู่ในตารางเสมอ ติ๊กออกไม่ได้
 *
 * ★ **สูตรที่ได้จากตัวคิดของเขารวมได้ 99% ไม่ใช่ 100%** (เขาไล่ทีละ 2.5% แต่ที่ว่างคือ 98.5%)
 *   เราเติมส่วนที่ขาดลงวัตถุดิบหลักแล้ว **บอกบนจอว่าเติมเท่าไรลงตัวไหน** ไม่ใช่เติมเงียบ ๆ
 *   ➜ รายละเอียดอยู่ที่ `src/lib/farmy/feedPlan.js`
 *
 * ★ **ค่าโภชนะและต้นทุนคิดใหม่จากสูตรที่เติมแล้ว** ไม่ใช้ค่าที่ `solveMix` คืนมา
 *   ไม่งั้นตัวเลขบนจอจะไม่ตรงกับของที่คนตวงจริง
 */
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../components/ui/PageHeader.jsx";
import PageBoard, { Block } from "../../components/board/PageBoard.jsx";
import Card from "../../components/ui/Card.jsx";
import Icon from "../../components/ui/Icon.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import {
  FEED_TABLE,
  INGREDIENTS,
  MEAL_PLANS,
  NUTRIENT_NEEDS,
  PIG_TYPES,
  PREMIX,
  READY_FEED_HINT,
  feedForAge,
  feedForWeight,
  needsFor,
} from "../../data/farmy/feed.js";
import { solveMix, suggestAdditions, toAmounts } from "../../data/farmy/feedMix.js";
import { iconFor } from "../../data/farmy/icons.js";
import { fillToHundred, mealSplit, summarize } from "../../lib/farmy/feedPlan.js";
import { formatBaht, formatNumber, formatNumber1, formatNumber2 } from "../../lib/format.js";
import { useT } from "../../lib/i18n/useT.js";
import "./guide.css";

/** ราคาวัตถุดิบที่ฟาร์มกรอกเอง — ของเครื่องนี้เท่านั้น ไม่ได้ขึ้นระบบกลาง */
const PRICE_KEY = "swine-sync:feed-prices";
const DEFAULT_HAVE = ["corn", "rice_bran", "soybean"];

const readPrices = () => {
  try {
    return JSON.parse(localStorage.getItem(PRICE_KEY) ?? "{}") ?? {};
  } catch {
    /* โหมดส่วนตัวของบางเบราว์เซอร์ห้ามอ่าน localStorage — เริ่มใหม่ ไม่ใช่พังทั้งหน้า */
    return {};
  }
};

/** ช่องกรอกราคาว่าง ๆ ต้องเป็น null ไม่ใช่ 0 — 0 แปลว่า "ของฟรี" ซึ่งคนละเรื่องกับ "ยังไม่รู้" */
const priceOf = (raw) => {
  const n = Number(raw);
  return raw !== "" && raw != null && Number.isFinite(n) && n > 0 ? n : null;
};

export default function FeedMix() {
  const t = useT();
  const [have, setHave] = useState(() => new Set(DEFAULT_HAVE));
  const [prices, setPrices] = useState(readPrices);
  const [pigs, setPigs] = useState(100);
  const [mode, setMode] = useState("age");
  const [age, setAge] = useState(120);
  const [weight, setWeight] = useState(60);
  const [pigType, setPigType] = useState("auto");
  const [meals, setMeals] = useState(3);

  useEffect(() => {
    try {
      localStorage.setItem(PRICE_KEY, JSON.stringify(prices));
    } catch {
      /* เขียนไม่ได้ก็ใช้งานต่อได้ แค่ไม่จำราคาข้ามการรีเฟรช */
    }
  }, [prices]);

  const typeMeta = PIG_TYPES.find((p) => p.id === pigType) ?? PIG_TYPES[0];

  /* ตารางการกิน: เทียบจากน้ำหนักจริงแม่นกว่าเดาจากอายุ ผู้ใช้เลือกได้ว่าจะบอกอะไรมา */
  const row = mode === "age" ? feedForAge(Number(age) || 0) : feedForWeight(Number(weight) || 0);
  const need =
    typeMeta.needId
      ? NUTRIENT_NEEDS.find((n) => n.id === typeMeta.needId) ?? needsFor(row.weight)
      : needsFor(row.weight);
  /* แม่พันธุ์ไม่อิงตารางอายุสุกรขุน — ข้อมูลของเขากำหนดปริมาณตายตัวไว้ */
  const perDay = typeMeta.fixedPerDay ?? row.perDay;
  const herdPerDay = perDay * (Number(pigs) || 0);

  const picked = useMemo(
    () => INGREDIENTS.filter((x) => have.has(x.id)).map((x) => ({ ...x, price: priceOf(prices[x.id]) })),
    [have, prices],
  );
  const premix = useMemo(() => ({ ...PREMIX, price: priceOf(prices[PREMIX.id]) }), [prices]);

  const solved = useMemo(() => solveMix(picked, need, premix), [picked, need, premix]);
  const plan = useMemo(
    () => (solved ? fillToHundred(solved.mix, PREMIX.percent) : null),
    [solved],
  );
  const totals = useMemo(
    () => (plan ? summarize(plan.rows, premix) : null),
    [plan, premix],
  );
  /* ของที่ควรไปซื้อเพิ่ม — คิดเฉพาะตอนสูตรยังไม่ถึงเกณฑ์ เพราะต้องไล่แก้สมการหลายรอบ */
  const additions = useMemo(
    () => (solved && !solved.enough ? suggestAdditions(picked, INGREDIENTS, need, premix) : []),
    [solved, picked, need, premix],
  );

  const amounts = plan ? toAmounts(plan.rows, perDay, Number(pigs) || 0) : [];
  const premixKg = (perDay * PREMIX.percent) / 100;
  const readyPrice = priceOf(prices.ready);
  const saving = totals?.price != null && readyPrice != null ? readyPrice - totals.price : null;
  const noPriceYet = plan ? plan.rows.filter((m) => !(m.price > 0)) : [];

  const toggle = (id) =>
    setHave((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setPrice = (id, value) => setPrices((old) => ({ ...old, [id]: value }));

  return (
    <>
      <PageHeader
        title={t("ผสมอาหารต้นทุนต่ำ")}
        subtitle={t("บอกว่ามีวัตถุดิบอะไร แล้วดูสูตรที่ถูกที่สุดที่ยังได้โภชนะครบ")}
      />

      <PageBoard boardId="guideFeedMix">
        <Block id="have" label={t("ของที่ฟาร์มมี")}>
          <Card
            title={t("ของที่ฟาร์มมีตอนนี้")}
            subtitle={t("ติ๊กเฉพาะที่มีจริง · ใส่ราคาจากใบเสร็จถ้าอยากรู้ต้นทุน")}
            icon="feed"
          >
            <ul className="gd-ings">
              {INGREDIENTS.map((x) => {
                const on = have.has(x.id);
                return (
                  <li key={x.id} className={"gd-ing" + (on ? " is-on" : "")}>
                    <label className="gd-ing-pick">
                      <input type="checkbox" checked={on} onChange={() => toggle(x.id)} />
                      <span>
                        <b>{t(x.name)}</b>
                        <span className="gd-ing-spec">
                          {t("โปรตีน {cp}% · พลังงาน {me} · ใส่ได้ไม่เกิน {max}%", {
                            cp: formatNumber1(x.cp),
                            me: formatNumber(x.me),
                            max: formatNumber(x.max),
                          })}
                        </span>
                        <span className="gd-ing-note">{t(x.note)}</span>
                      </span>
                    </label>
                    {/* ช่องราคาโผล่เฉพาะของที่ติ๊กไว้ — ของที่ไม่มีไม่ต้องถามราคา */}
                    {on && (
                      <label className="gd-price">
                        <span>{t("บาท/กก.")}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.25"
                          inputMode="decimal"
                          value={prices[x.id] ?? ""}
                          onChange={(e) => setPrice(x.id, e.target.value)}
                          placeholder={t("ยังไม่รู้")}
                        />
                      </label>
                    )}
                  </li>
                );
              })}

              {/* ★ พรีมิกซ์ไม่ใช่ตัวเลือก — ไม่มีช่องติ๊ก มีแต่ช่องราคา */}
              <li className="gd-ing is-fixed">
                <span className="gd-ing-pick">
                  <Icon name="lock" size={18} aria-hidden="true" />
                  <span>
                    <b>{t(PREMIX.name)}</b>
                    <span className="gd-ing-spec">
                      {t("ใส่ {p}% เสมอ — ต้องมีทุกสูตร", { p: formatNumber1(PREMIX.percent) })}
                    </span>
                    <span className="gd-ing-note">
                      {t("สูตรที่โปรตีนพอแต่ขาดแร่ธาตุ ทำให้ขาหัก กระดูกอ่อน และโตไม่ดี")}
                    </span>
                  </span>
                </span>
                <label className="gd-price">
                  <span>{t("บาท/กก.")}</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="decimal"
                    value={prices[PREMIX.id] ?? ""}
                    onChange={(e) => setPrice(PREMIX.id, e.target.value)}
                    placeholder={t("ยังไม่รู้")}
                  />
                </label>
              </li>
            </ul>

            <label className="gd-price is-wide">
              <span>{t("ราคาอาหารสำเร็จรูปที่ซื้ออยู่ (บาท/กก.)")}</span>
              <input
                type="number"
                min="0"
                step="0.25"
                inputMode="decimal"
                value={prices.ready ?? ""}
                onChange={(e) => setPrice("ready", e.target.value)}
                placeholder={t(READY_FEED_HINT)}
              />
            </label>

            <p className="gd-source">
              <Icon name="lock" size={14} aria-hidden="true" />
              {t("ราคาที่กรอกเก็บในเครื่องนี้เท่านั้น ไม่ได้ส่งขึ้นระบบกลาง")}
            </p>
            {/* ★ ที่มาต้องอยู่บนจอเสมอ — วางในกล่องแรกซึ่งเป็นกล่องที่คนเห็นก่อนเลื่อนหน้า
                ชุดข้อมูลนี้ไม่ได้ export `SOURCE_NOTE` มา (ต่างจากชุดอื่น) จึงเขียนไว้ที่นี่ */}
            <p className="gd-source">
              <Icon name="info" size={14} aria-hidden="true" />
              {t("เรียบเรียงจากเอกสารการเลี้ยงสุกร กรมปศุสัตว์ · มกอช.")}
            </p>
          </Card>
        </Block>

        <Block id="pigs" label={t("หมูที่จะให้กิน")}>
          <Card
            title={t("หมูที่จะให้กิน")}
            subtitle={t("ระบบเลือกเกณฑ์โภชนะให้จากช่วงนี้")}
            icon="pig"
          >
            <label className="gd-price is-wide">
              <span>{t("จำนวนหมู (ตัว)")}</span>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={pigs}
                onChange={(e) => setPigs(e.target.value)}
              />
            </label>

            <div className="gd-tabs" role="tablist">
              {[
                { id: "age", label: "บอกเป็นอายุ" },
                { id: "weight", label: "บอกเป็นน้ำหนัก" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === m.id}
                  className={"gd-tab" + (mode === m.id ? " is-on" : "")}
                  onClick={() => setMode(m.id)}
                >
                  {t(m.label)}
                </button>
              ))}
            </div>

            {mode === "age" ? (
              <label className="gd-price is-wide">
                <span>{t("อายุ (วัน)")}</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                />
              </label>
            ) : (
              <label className="gd-price is-wide">
                <span>{t("น้ำหนักตัว (กก.)")}</span>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </label>
            )}

            <h5 className="gd-sub">{t("ประเภทสุกร")}</h5>
            <div className="gd-tabs" role="tablist">
              {PIG_TYPES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={pigType === p.id}
                  className={"gd-tab" + (pigType === p.id ? " is-on" : "")}
                  onClick={() => setPigType(p.id)}
                >
                  <Icon name={iconFor(p.icon)} size={16} aria-hidden="true" />
                  {t(p.label)}
                </button>
              ))}
            </div>

            <dl className="gd-facts">
              <div className="gd-fact">
                <dt>{t("เกณฑ์ที่ใช้")}</dt>
                <dd>
                  <b>{t(need.label)}</b>
                  <span>
                    {t("โปรตีน {cp}% · พลังงาน {me} kcal/kg", {
                      cp: formatNumber(need.cp),
                      me: formatNumber(need.me),
                    })}
                  </span>
                </dd>
              </div>
              <div className="gd-fact">
                <dt>{t("กินต่อตัวต่อวัน")}</dt>
                <dd>
                  <b>{t("{n} กก.", { n: formatNumber2(perDay) })}</b>
                  <span>
                    {typeMeta.fixedPerDay
                      ? t("ค่าคงที่ของแม่พันธุ์ ไม่อิงตารางอายุสุกรขุน")
                      : t("น้ำหนักตัวประมาณ {w} กก. · โตวันละ {adg} กรัม", {
                          w: formatNumber1(row.weight),
                          adg: formatNumber(row.adg),
                        })}
                  </span>
                </dd>
              </div>
              <div className="gd-fact">
                <dt>{t("ทั้งคอกต่อวัน")}</dt>
                <dd>
                  <b>{t("{n} กก.", { n: formatNumber1(herdPerDay) })}</b>
                  <span>{t("หมู {n} ตัว", { n: formatNumber(Number(pigs) || 0) })}</span>
                </dd>
              </div>
            </dl>

            {/* ★ นอกช่วงของตาราง = ค่าที่ยืดออกไปเอง ไม่ใช่ค่าที่เอกสารรับรอง ต้องบอก */}
            {row.estimated && (
              <p className="gd-warn" role="note">
                <Icon name="warn" size={18} aria-hidden="true" />
                <span>
                  {t("ค่านี้อยู่นอกช่วงของตาราง ({from}–{to} วัน) — เป็นค่าประมาณ ไม่ใช่ค่าจากเอกสาร", {
                    from: formatNumber(FEED_TABLE[0].age),
                    to: formatNumber(FEED_TABLE[FEED_TABLE.length - 1].age),
                  })}
                </span>
              </p>
            )}
          </Card>
        </Block>

        <Block id="mix" label={t("สูตรที่ได้")}>
          <Card
            title={t("สูตรที่ได้")}
            subtitle={t("ถูกที่สุดเท่าที่ของในคอกทำได้ · ต่อชุด {n} กก.", {
              n: formatNumber1(herdPerDay),
            })}
            icon="chart"
          >
            {!plan ? (
              <p className="gd-empty">
                <Icon name="info" size={20} aria-hidden="true" />
                {t("ติ๊กวัตถุดิบอย่างน้อย 2 อย่างก่อน จึงจะผสมเป็นสูตรได้")}
              </p>
            ) : (
              <>
                <div className="gd-meter">
                  <span>
                    <b>{t("โปรตีน {n}%", { n: formatNumber2(totals.cp) })}</b>
                    <span>{t("เป้า {n}%", { n: formatNumber(need.cp) })}</span>
                  </span>
                  <StatusBadge tone={totals.cp >= need.cp ? "good" : "warning"}>
                    {totals.cp >= need.cp ? t("ถึงเกณฑ์") : t("ยังไม่ถึง")}
                  </StatusBadge>
                </div>
                <div className="gd-meter">
                  <span>
                    <b>{t("พลังงาน {n} kcal/kg", { n: formatNumber(totals.me) })}</b>
                    <span>{t("เป้า {n} kcal/kg", { n: formatNumber(need.me) })}</span>
                  </span>
                  <StatusBadge
                    tone={totals.me >= need.me ? "good" : totals.me >= need.me * 0.98 ? "warning" : "serious"}
                  >
                    {totals.me >= need.me ? t("ถึงเกณฑ์") : t("ยังไม่ถึง")}
                  </StatusBadge>
                </div>

                {/* ★ ตัวคิดสูตรของเขายอมให้พลังงานต่ำกว่าเป้าได้ 2% แล้วนับว่า "พอ"
                    ถ้าโชว์แค่ป้ายเขียว คนจะไม่มีทางรู้ว่าต่ำกว่าเป้าอยู่ */}
                {totals.me < need.me && totals.me >= need.me * 0.98 && (
                  <p className="gd-source">
                    <Icon name="info" size={14} aria-hidden="true" />
                    {t("พลังงานต่ำกว่าเป้าไม่เกิน 2% ซึ่งตัวคิดสูตรยอมให้ผ่าน — ถ้าอยากเต็มเกณฑ์ให้เติมน้ำมันพืช")}
                  </p>
                )}

                {/* จอแคบ: ให้เลื่อนในตาราง ไม่ใช่ดันทั้งหน้าให้มีแถบเลื่อนแนวนอน */}
                <div className="gd-table-wrap">
                <table className="gd-table">
                  <thead>
                    <tr>
                      <th>{t("วัตถุดิบ")}</th>
                      <th>{t("สัดส่วน")}</th>
                      <th>{t("ต่อตัว/วัน")}</th>
                      <th>{t("ทั้งคอก/วัน")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {amounts.map((m) => (
                      <tr key={m.id}>
                        <td>
                          {t(m.name)}
                          {/* ★ ส่วนที่เราเติมเข้าไปเอง ต้องเห็นว่าเติมตรงไหนเท่าไร */}
                          {m.added > 0 && (
                            <span className="gd-added">
                              {t("รวมส่วนที่ปัดเศษ +{n}%", { n: formatNumber1(m.added) })}
                            </span>
                          )}
                        </td>
                        <td>{t("{n}%", { n: formatNumber1(m.percent) })}</td>
                        <td>{t("{n} กก.", { n: formatNumber2(m.kgPerPig) })}</td>
                        <td>{t("{n} กก.", { n: formatNumber2(m.kgTotal) })}</td>
                      </tr>
                    ))}
                    <tr className="is-fixed">
                      <td>
                        {t(PREMIX.name)}
                        <span className="gd-added">{t("ต้องมีทุกสูตร")}</span>
                      </td>
                      <td>{t("{n}%", { n: formatNumber1(PREMIX.percent) })}</td>
                      <td>{t("{n} กก.", { n: formatNumber2(premixKg) })}</td>
                      <td>{t("{n} กก.", { n: formatNumber2(premixKg * (Number(pigs) || 0)) })}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>{t("รวม")}</th>
                      <th>{t("{n}%", { n: formatNumber1(plan.total) })}</th>
                      <th>{t("{n} กก.", { n: formatNumber2(perDay) })}</th>
                      <th>{t("{n} กก.", { n: formatNumber1(herdPerDay) })}</th>
                    </tr>
                  </tfoot>
                </table>
                </div>

                {plan.gap > 0 && (
                  <p className="gd-source">
                    <Icon name="info" size={14} aria-hidden="true" />
                    {t("ตัวคิดสูตรไล่สัดส่วนทีละ 2.5% จึงเหลือเศษ {n}% — เติมลงวัตถุดิบหลักให้ครบ 100 แล้ว", {
                      n: formatNumber1(plan.gap),
                    })}
                  </p>
                )}

                {/* ★ ไม่รู้ราคา = ไม่บอกต้นทุน (ดูเหตุผลที่หัวไฟล์) */}
                <h5 className="gd-sub">{t("ต้นทุน")}</h5>
                {totals.price == null ? (
                  <p className="gd-empty">
                    <Icon name="wallet" size={20} aria-hidden="true" />
                    {t("ยังบอกต้นทุนไม่ได้ — ยังไม่รู้ราคาของ {list}", {
                      list: noPriceYet
                        .map((m) => t(m.name))
                        .concat(premix.price > 0 ? [] : [t(PREMIX.name)])
                        .join(" · "),
                    })}
                  </p>
                ) : (
                  <dl className="gd-facts">
                    <div className="gd-fact">
                      <dt>{t("ต้นทุนอาหารผสมเอง")}</dt>
                      <dd>
                        {/* ★ ราคาต่อกิโลต้องมีสตางค์ — `formatBaht` ปัดเป็นบาทเต็ม ซึ่งที่ปริมาณ
                            ระดับคอก (หลายร้อยกิโลต่อวัน) เศษสตางค์กลายเป็นหลักร้อยบาทต่อวัน
                            ยอดรวมทั้งคอกยังใช้บาทเต็มได้ เพราะเป็นเลขก้อนใหญ่อยู่แล้ว */}
                        <b>{t("{n} บาท/กก.", { n: formatNumber2(totals.price) })}</b>
                        <span>
                          {t("ทั้งคอกวันละ {n}", { n: formatBaht(totals.price * herdPerDay) })}
                        </span>
                      </dd>
                    </div>
                    {saving != null && (
                      <div className="gd-fact">
                        <dt>{saving >= 0 ? t("ประหยัดกว่าอาหารสำเร็จรูป") : t("แพงกว่าอาหารสำเร็จรูป")}</dt>
                        <dd>
                          <b>{t("{n} บาท/กก.", { n: formatNumber2(Math.abs(saving)) })}</b>
                          <span>
                            {t("ทั้งคอกวันละ {n}", { n: formatBaht(Math.abs(saving) * herdPerDay) })}
                          </span>
                        </dd>
                      </div>
                    )}
                  </dl>
                )}

                {/* ของที่ควรไปซื้อเพิ่ม — ขึ้นเฉพาะตอนสูตรยังไม่ถึงเกณฑ์ */}
                {additions.length > 0 && (
                  <>
                    <h5 className="gd-sub">{t("ซื้ออะไรเพิ่มแล้วสูตรจะถึงเกณฑ์")}</h5>
                    <ul className="gd-rows">
                      {additions.map((group) => (
                        <li key={group.map((g) => g.id).join("+")} className="gd-row">
                          <span className="gd-row-main">
                            <b>{group.map((g) => t(g.name)).join(" + ")}</b>
                            <span className="gd-row-sub">
                              {group
                                .map((g) => t("{name} {n}%", { name: t(g.name), n: formatNumber1(g.percent) }))
                                .join(" · ")}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {solved && !solved.enough && additions.length === 0 && (
                  <p className="gd-warn" role="note">
                    <Icon name="warn" size={18} aria-hidden="true" />
                    <span>
                      {t("ของที่มีและที่มีในรายการยังทำให้ถึงเกณฑ์ไม่ได้ — ปรึกษาสัตวแพทย์หรือผู้ขายอาหารสัตว์")}
                    </span>
                  </p>
                )}
              </>
            )}
          </Card>
        </Block>

        <Block id="meals" label={t("แบ่งมื้อ")}>
          <Card
            title={t("แบ่งเป็นมื้อ")}
            subtitle={t("ปริมาณต่อตัวต่อมื้อ")}
            icon="clock"
          >
            <div className="gd-tabs" role="tablist">
              {Object.keys(MEAL_PLANS).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="tab"
                  aria-selected={meals === Number(n)}
                  className={"gd-tab" + (meals === Number(n) ? " is-on" : "")}
                  onClick={() => setMeals(Number(n))}
                >
                  {t("{n} มื้อ", { n: formatNumber(Number(n)) })}
                </button>
              ))}
            </div>

            <ul className="gd-rows">
              {mealSplit(MEAL_PLANS[meals], perDay).map((m) => (
                <li key={m.time} className="gd-row">
                  <span className="gd-row-main">
                    <b>{t(m.label)}</b>
                    <span className="gd-row-sub">{t("{n}% ของอาหารทั้งวัน", { n: formatNumber(m.share) })}</span>
                  </span>
                  <span className="gd-row-side">
                    <span className="gd-row-date">{m.time}</span>
                    <b>{t("{n} กก.", { n: formatNumber2(m.kg) })}</b>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Block>

        <Block id="table" label={t("ตารางการกิน")}>
          <Card
            title={t("ตารางการกินตามอายุ")}
            subtitle={t("ค่าอ้างอิงจากเอกสาร ไม่ใช่ค่าที่ชั่งจากฝูงนี้")}
            icon="list"
          >
            {/* จอแคบ: ให้เลื่อนในตาราง ไม่ใช่ดันทั้งหน้าให้มีแถบเลื่อนแนวนอน */}
            <div className="gd-table-wrap">
            <table className="gd-table">
              <thead>
                <tr>
                  <th>{t("อายุ (วัน)")}</th>
                  <th>{t("น้ำหนัก (กก.)")}</th>
                  <th>{t("โตวันละ (ก.)")}</th>
                  <th>{t("อัตราแลกเนื้อ")}</th>
                  <th>{t("กิน/วัน (กก.)")}</th>
                  <th>{t("สะสม (กก.)")}</th>
                </tr>
              </thead>
              <tbody>
                {FEED_TABLE.map((r) => (
                  <tr key={r.age}>
                    <td>{formatNumber(r.age)}</td>
                    <td>{formatNumber1(r.weight)}</td>
                    <td>{formatNumber(r.adg)}</td>
                    {/* แถวแรกยังไม่มีอัตราแลกเนื้อในเอกสาร — ขีดกลาง ไม่ใช่เลข 0 */}
                    <td>{r.fcr == null ? "—" : formatNumber1(r.fcr)}</td>
                    <td>{formatNumber2(r.perDay)}</td>
                    <td>{formatNumber1(r.cumulative)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            <p className="gd-source">
              <Icon name="info" size={14} aria-hidden="true" />
              {t("ค่าโภชนะของวัตถุดิบเป็นค่าเฉลี่ยอ้างอิง ของจริงแต่ละล็อตต่างกันได้ ±10%")}
            </p>
            <p className="gd-source">
              <Icon name="info" size={14} aria-hidden="true" />
              {t("เรียบเรียงจากเอกสารการเลี้ยงสุกร กรมปศุสัตว์ · มกอช.")}
            </p>
          </Card>
        </Block>
      </PageBoard>
    </>
  );
}
