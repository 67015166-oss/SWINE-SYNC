/**
 * คู่มือ "เช็กลิสต์ฟาร์ม" — /dashboard/guide/checklist (T1.291)
 *
 * 46 ข้อจากทีม Farmy เรียบเรียงจากมาตรฐาน GAP ฟาร์มสุกร (กรมปศุสัตว์ · มกอช.)
 * แบ่งตามความถี่ (ทุกวัน · ทุกสัปดาห์ · ทุกเดือน · ทุกรุ่น) และตามระบบ 8 ระบบ
 *
 * ★ **ติ๊กแล้วรีเซ็ตเองเมื่อขึ้นรอบใหม่** (`lib/farmy/checklistState.js`)
 *   เช็กลิสต์รายวันที่ติ๊กค้างจากเมื่อวานอันตรายกว่าไม่มีเช็กลิสต์เลย
 *   เพราะมันสร้างหลักฐานปลอมว่าตรวจแล้วทั้งที่ยังไม่ได้เดินดูสักคอก
 *
 * ★ **เก็บในเครื่องนี้เท่านั้น ไม่ได้ขึ้นฐานกลาง** — ต้องบอกให้ชัดบนหน้าจอ
 *   ไม่งั้นคนจะเข้าใจว่าหัวหน้าเห็นด้วย ซึ่งไม่จริง และไม่ใช่หลักฐานการตรวจตาม GAP
 *   (ถ้าวันหนึ่งต้องเป็นหลักฐานจริง ต้องขึ้นฐานเหมือน barn_log — ดู T1.269)
 *
 * แต่ละข้อมีทั้ง "ผ่านแปลว่าอะไร" (`ok`) และ "ไม่ผ่านทำยังไง" (`fix`)
 * **ห้ามตัด `fix` ทิ้งเพื่อประหยัดที่** — เช็กลิสต์ที่บอกแค่ว่าไม่ผ่าน แต่ไม่บอกว่าทำยังไงต่อ
 * ทำให้คนติ๊กผ่านไปเฉย ๆ เพราะไม่รู้จะทำอะไร
 */
import { useEffect, useState } from "react";
import PageHeader from "../../components/ui/PageHeader.jsx";
import PageBoard, { Block } from "../../components/board/PageBoard.jsx";
import Card from "../../components/ui/Card.jsx";
import Icon from "../../components/ui/Icon.jsx";
import { CHECKS, FREQS, SOURCE_NOTE, SYSTEMS } from "../../data/farmy/checklist.js";
import { iconFor } from "../../data/farmy/icons.js";
import {
  STORE_KEY,
  activeTicks,
  startNewBatch,
  toggleTick,
} from "../../lib/farmy/checklistState.js";
import { formatNumber } from "../../lib/format.js";
import { useT } from "../../lib/i18n/useT.js";
import "./guide.css";

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") ?? {};
  } catch {
    /* โหมดส่วนตัวของบางเบราว์เซอร์ห้ามอ่าน localStorage — เริ่มใหม่ ไม่ใช่พังทั้งหน้า */
    return {};
  }
};

export default function Checklist() {
  const t = useT();
  const [freq, setFreq] = useState("daily");
  const [store, setStore] = useState(read);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch {
      /* เขียนไม่ได้ก็ใช้งานต่อได้ แค่ไม่จำข้ามการรีเฟรช */
    }
  }, [store]);

  const meta = FREQS.find((f) => f.id === freq) ?? FREQS[0];
  const items = CHECKS.filter((c) => c.freq === freq);
  const { done } = activeTicks(store, freq);
  const doneSet = new Set(done);
  const left = items.length - items.filter((c) => doneSet.has(c.id)).length;

  return (
    <>
      <PageHeader
        title={t("เช็กลิสต์ฟาร์ม")}
        subtitle={t("{n} ข้อ แบ่งตามความถี่และระบบ · ติ๊กแล้วรีเซ็ตเองเมื่อขึ้นรอบใหม่", {
          n: formatNumber(CHECKS.length),
        })}
      />

      <PageBoard boardId="guideChecklist">
        <Block id="checks" label={t("รายการตรวจ")}>
          <Card
            title={t("รายการตรวจ · {label}", { label: t(meta.label) })}
            subtitle={t(meta.note)}
            icon={iconFor(meta.icon)}
          >
            {/* เลือกความถี่ — ปุ่มเรียงกันแทน dropdown เพราะมีแค่ 4 ตัว
                และตัวเลขค้างต่อความถี่ต้องเห็นพร้อมกันทั้งสี่ ไม่ใช่ต้องกดเปิดดูทีละอัน */}
            <div className="gd-tabs" role="tablist">
              {FREQS.map((f) => {
                const all = CHECKS.filter((c) => c.freq === f.id);
                const undone = all.length - activeTicks(store, f.id).done.length;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={freq === f.id}
                    className={"gd-tab" + (freq === f.id ? " is-on" : "")}
                    onClick={() => setFreq(f.id)}
                  >
                    <Icon name={iconFor(f.icon)} size={16} aria-hidden="true" />
                    {t(f.short)}
                    <span className="gd-tab-n">
                      {undone > 0 ? t("ค้าง {n}", { n: formatNumber(undone) }) : t("ครบ")}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="gd-progress" role="status">
              <Icon name={left === 0 ? "check" : "list"} size={16} aria-hidden="true" />
              {left === 0
                ? t("ตรวจครบทุกข้อของรอบนี้แล้ว")
                : t("เหลืออีก {n} จาก {all} ข้อ", {
                    n: formatNumber(left),
                    all: formatNumber(items.length),
                  })}
              {freq === "batch" && (
                <button type="button" className="gd-reset" onClick={() => setStore(startNewBatch(store))}>
                  {t("เริ่มรอบใหม่")}
                </button>
              )}
            </p>

            {SYSTEMS.map((sys) => {
              const rows = items.filter((c) => c.sys === sys.id);
              if (rows.length === 0) return null;
              return (
                <section key={sys.id} className="gd-sys">
                  <h4>
                    <Icon name={iconFor(sys.icon)} size={17} aria-hidden="true" />
                    {t(sys.name)}
                  </h4>
                  <ul className="gd-checks">
                    {rows.map((c) => {
                      const on = doneSet.has(c.id);
                      return (
                        <li key={c.id} className={"gd-check" + (on ? " is-done" : "")}>
                          <label>
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => setStore(toggleTick(store, freq, c.id))}
                            />
                            <span className="gd-check-body">
                              <b>{t(c.text)}</b>
                              <span className="gd-check-ok">
                                <Icon name="check" size={13} aria-hidden="true" />
                                {t(c.ok)}
                              </span>
                              {/* ★ "ไม่ผ่านทำยังไง" ห้ามตัดทิ้ง — ดูเหตุผลที่หัวไฟล์ */}
                              <span className="gd-check-fix">
                                <Icon name="warn" size={13} aria-hidden="true" />
                                {t(c.fix)}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}

            <p className="gd-source">
              <Icon name="info" size={14} aria-hidden="true" />
              {t(SOURCE_NOTE)}
            </p>
            <p className="gd-source">
              <Icon name="lock" size={14} aria-hidden="true" />
              {t("ผลติ๊กเก็บในเครื่องนี้เท่านั้น ไม่ได้ส่งขึ้นระบบกลาง และไม่ใช่หลักฐานการตรวจ")}
            </p>
          </Card>
        </Block>
      </PageBoard>
    </>
  );
}
