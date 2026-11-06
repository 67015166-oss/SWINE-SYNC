/**
 * ผู้ช่วย AI — ห้องแชทที่เด้งขึ้นเหนือแถบลอยล่างจอ
 *
 * **ไฟล์นี้เป็น "ห้องแชท" อย่างเดียว ไม่มีปุ่มของตัวเองแล้ว** (ผู้ใช้สั่ง 16 ก.ย. 2569)
 * ปุ่มเปิด/ปิด ปุ่มเอาผู้ช่วยออก และแถบเรียกกลับ ย้ายไปอยู่ที่แถบลอย (`components/dock/AppDock.jsx`)
 * ที่นี่รับมาเป็น prop สองตัว: `open` = กางห้องไหม · `onClose` = พับห้องลง
 *
 * ห้องแชทไม่ใช่ป๊อบอัพเต็มจอโดยตั้งใจ — ต้องถามไปดูข้อมูลบนหน้าไปพร้อมกันได้
 *
 * **ตัว component ต้องถูกวาดค้างไว้ตลอด แม้ตอน `open` เป็นเท็จ** (มันคืน null เอง)
 * ถอดออกจากจอเมื่อไหร่ ประวัติการคุยทั้งหมดหายไปด้วย
 *
 * **คำตอบมาจากสองที่ และห้องแชทต้องบอกให้ชัดว่าอันไหนมาจากไหน**
 *   1. AI จริงของฟาร์ม (ทีมอื่นในโปรเจกต์ทำไว้) — ต่อผ่าน `lib/api/assistantApi.js`
 *      อ่านค่าเซนเซอร์จริงของกำแพงเพชรได้ ตอบเป็นสายทีละคำ ใช้เวลาได้ถึงระดับนาที
 *   2. `answers.js` ในเครื่อง — คิดจาก mock data ชุดเดียวกับที่หน้าอื่นใช้
 *      ใช้เมื่อ AI ต่อไม่ได้ และใช้กับคำสั่งเปิดหน้า (AI ฝั่งโน้นไม่รู้จักหน้าจอของเรา)
 *
 * ทั้งสองแบบติดป้ายกำกับไว้ที่ฟองข้อความ — ผู้ใช้ต้องแยกออกว่ากำลังอ่าน "ค่าจริงจากเซนเซอร์"
 * หรือ "ตัวเลขตัวอย่าง" เพราะสองอย่างนี้เอาไปตัดสินใจต่อไม่เหมือนกันเลย
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../ui/Icon.jsx";
import { useSettings } from "../../lib/settings/useSettings.js";
import { useDictation } from "../../lib/voice/useDictation.js";
import {
  DICTATION_ERROR_TEXT,
  MIC_STATE_TEXT,
  useMicPermission,
} from "../../lib/voice/useMicPermission.js";
import { useLang } from "../../lib/i18n/useT.js";
import { useAuth } from "../../lib/auth/useAuth.js";
import {
  aiStatus,
  askAi,
  fetchNow,
  fetchWeather,
  searchWeb,
  soundsUnanswered,
} from "../../lib/api/assistantApi.js";
import { farmyAsk, farmyStatus } from "../../lib/api/farmyVoice.js";
import { currentReadingAsk } from "../../lib/api/sensorQuestion.js";
/* เรียบเรียงค่าเซนเซอร์เป็นคำตอบ — **ตัวเดียวกับที่แผงวอยซ์ใช้** (lib/api/nowReply.js)
   ต่างคนต่างเรียบเรียงเมื่อไหร่ สองที่จะตอบค่าคนละแบบจากข้อมูลชุดเดียวกัน */
import { nowReply } from "../../lib/api/nowReply.js";
import { weatherPlaceOutside } from "../../lib/api/thaiPlaces.js";
/* เรียบเรียงคำตอบเรื่องอากาศที่อื่น — **ตัวเดียวกับแผงวอยซ์** (เหตุผลในหัวไฟล์นั้น) */
import { weatherReply } from "../../lib/api/weatherReply.js";
import { normalizeChoice, parseChoices, splitSuggestions } from "../../lib/api/clarify.js";
import { useAllFarms } from "../../lib/records/useAllFarms.js";
import { useT } from "../../lib/i18n/useT.js";
import {
  answerFor,
  GREETING,
  isOutwardQuestion,
  localOnlyTopicFor,
  navFor,
  topicIdFor,
  TOPICS,
  wantsAdvice,
} from "./answers.js";
import "./assistant.css";

/** ข้อความหนึ่งฟองในห้องแชท */
/** ยาวเกินเท่านี้ถือว่าต้องพับ — วัดจากความสูงจริงของห้องแชท ไม่ใช่จำนวนตัวอักษร
    เพราะภาษาไทยตัวอักษรเยอะแต่กินที่น้อยกว่าอังกฤษ */
const LONG_LINES = 7;

function Bubble({ msg, onNavigate, onChoose, onAnalyse }) {
  const t = useT();
  /* คำตอบยาว ๆ ในห้องแชทเล็ก ๆ มุมจอ = ต้องเลื่อนหลายหน้าจอกว่าจะเจอใจความ
     พับไว้ให้เห็นย่อหน้าแรกก่อน อยากอ่านต่อค่อยกด — **ไม่ตัดทิ้ง** ข้อความยังอยู่ครบ
     (ต่างจากการสั่ง AI ให้ตอบสั้น ซึ่งมันจะไม่พูดถึงเรื่องนั้นเลยตั้งแต่แรก) */
  const [open, setOpen] = useState(false);

  if (msg.from === "user") {
    return (
      <li className="as-msg is-user">
        <p>{msg.text}</p>
      </li>
    );
  }

  /* ยังไม่มีตัวอักษรออกมาสักตัว — ต้องบอกว่ากำลังทำอะไรอยู่ ไม่ใช่ปล่อยฟองเปล่า
     คำถามที่ต้องให้โมเดลคิดใช้เวลาเป็นนาที ถ้าจอนิ่งผู้ใช้จะคิดว่าค้างแล้วกดซ้ำ */
  const idle = msg.live && !msg.text;
  /* พับเฉพาะตอนตอบจบแล้ว — ระหว่างที่ยังพิมพ์อยู่ ต้องเห็นตัวอักษรไหลเข้ามา
     ไม่งั้นจะดูเหมือนค้าง */
  const long = !msg.live && (msg.text?.split("\n").length ?? 0) > LONG_LINES;

  return (
    <li className="as-msg is-bot">
      <span className="as-msg-mark" aria-hidden="true">
        <Icon name="spark" size={16} />
      </span>
      <div className="as-msg-body">
        {idle ? (
          <p className="as-msg-wait" role="status">
            <span className="as-dots" aria-hidden="true">
              <i /><i /><i />
            </span>
            {msg.phase === "weather"
              ? t("กำลังดูอากาศของที่นั่นให้…")
              : msg.phase === "searching"
              ? t("AI ตอบไม่ได้ กำลังค้นเว็บให้แทน…")
              : msg.queue > 0
              ? t("รอคิวอยู่ อีก {n} คิวข้างหน้า", { n: msg.queue })
              : msg.waitSeconds > 0
                ? t("AI กำลังคิด… ({n} วิ)", { n: msg.waitSeconds })
                : msg.phase === "thinking"
                  ? t("AI กำลังคิด…")
                  : t("กำลังถาม AI…")}
          </p>
        ) : (
          <p className={long && !open ? "as-clamp" : undefined}>
            {msg.text}
            {msg.live && <span className="as-caret" aria-hidden="true" />}
          </p>
        )}

        {long && (
          <button type="button" className="as-more" onClick={() => setOpen((v) => !v)}>
            <Icon name="chevron" size={14} aria-hidden="true" />
            {open ? t("ย่อคำตอบ") : t("อ่านคำตอบเต็ม")}
          </button>
        )}
        {msg.bullets?.length > 0 && (
          <ul className="as-msg-list">
            {msg.bullets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {/* AI ย้อนถามว่าเอาจุดไหน — ทำเป็นปุ่มให้กด ไม่ต้องพิมพ์
            ข้อความของมันเขียนว่า "กดเลือกได้เลย" อยู่แล้ว แปลว่าตั้งใจให้มีปุ่มมาแต่แรก
            และมันรับแค่คำที่ตรงเป๊ะ (พิมพ์ "ทั้งสอง" ไม่ผ่าน ต้อง "ทั้งสองจุด")
            กดปุ่มจึงเป็นทางที่ไม่มีวันพิมพ์ผิด */}
        {msg.choices && !msg.live && (
          <div className="as-choices">
            {msg.choices.options.map((opt) => (
              <button
                key={opt.n}
                type="button"
                className="as-choice"
                onClick={() => onChoose(opt.label, opt.n)}
              >
                {opt.label}
              </button>
            ))}
            {msg.choices.allPhrase && (
              <button
                type="button"
                className="as-choice is-all"
                onClick={() => onChoose(msg.choices.allPhrase, msg.choices.allPhrase)}
              >
                <Icon name="grid" size={14} aria-hidden="true" />
                {msg.choices.allPhrase}
              </button>
            )}
          </div>
        )}

        {/* ตอบเลขให้ทันทีแล้ว แต่บางทีคนอยากได้คำอธิบายต่อ — ให้กดส่งไปถาม AI ได้
            ไม่ยิงไปเองอัตโนมัติ เพราะส่วนใหญ่แค่อยากรู้เลข การรอ AI อีกเป็นนาทีคือการรบกวน */}
        {msg.askAi && !msg.live && (
          <button type="button" className="as-choice is-all" onClick={() => onAnalyse(msg.askAi)}>
            <Icon name="spark" size={14} aria-hidden="true" />
            ให้ AI วิเคราะห์ต่อ
          </button>
        )}

        {/* ผลค้นเว็บ — ต้องหน้าตาต่างจากคำตอบให้ชัด เพราะมันไม่ใช่คำตอบ
            เป็นแค่ "ไปดูต่อที่นี่ได้" ที่ยังไม่มีใครกลั่นกรองให้
            บอกชื่อเว็บทุกอัน คนจะได้ตัดสินเองว่าจะเชื่อแหล่งไหน
            เปิดแท็บใหม่เสมอ ของที่กำลังดูอยู่ต้องไม่หายไป */}
        {msg.results?.length > 0 && (
          <ul className="as-hits">
            {msg.results.map((hit) => (
              <li key={hit.url}>
                <a href={hit.url} target="_blank" rel="noopener noreferrer nofollow">
                  <b>{hit.title}</b>
                  <span className="as-hit-site">
                    <Icon name="globe" size={12} aria-hidden="true" />
                    {hit.site}
                  </span>
                  {hit.snippet && <span className="as-hit-snip">{hit.snippet}</span>}
                </a>
              </li>
            ))}
          </ul>
        )}

        {msg.to && (
          <Link className="as-msg-link" to={msg.to} onClick={onNavigate}>
            {msg.toLabel}
            <Icon name="chevron" size={16} />
          </Link>
        )}

        {/* ป้ายที่มาของคำตอบ — ไม่ใช่ของประดับ ผู้ใช้ต้องรู้ว่าตัวเลขที่อ่านอยู่มาจากไหน
            ก่อนจะเอาไปสั่งเปิดพัดลมจริง ๆ  มีทั้งไอคอนและข้อความ ไม่สื่อด้วยสีอย่างเดียว

            **สามป้าย ไม่ใช่สอง** ตอนแรกเขียนไว้สองแบบคือ "จาก AI = เซนเซอร์จริง" กับ
            "ข้อมูลตัวอย่าง" แล้วพบว่า AI ตัวนี้ค้นเว็บได้ด้วย (ถามราคาหมู ราคาทอง
            ข่าวโรคระบาด มันไปค้นมาให้จริง) คำตอบที่มาจากการค้นเว็บจึงถูกติดป้ายว่า
            "เซนเซอร์จริง" ทั้งที่ไม่ได้แตะเซนเซอร์เลย — เป็นการอ้างที่มาเกินความจริง
            ซึ่งอันตรายกว่าไม่ติดป้าย เพราะคนจะเชื่อว่าเป็นค่าที่วัดได้จากเล้าตัวเอง

            ตัวแยกคือ `direct` ที่ AI ส่งมา — มีค่า = อ่านจากเซนเซอร์ตรง ๆ
            ไม่มี = โมเดลเป็นคนตอบ ซึ่งอาจใช้เซนเซอร์ พยากรณ์อากาศ เว็บ หรือความรู้ของมันเอง
            แยกไม่ออกว่าอันไหน จึงไม่ควรอ้างอะไรทั้งนั้น */}
        {msg.origin && !msg.live && (
          <span className={"as-msg-tag is-" + msg.origin}>
            <Icon
              name={
                msg.origin === "ai"
                  ? "spark"
                  : msg.origin === "web"
                    ? "search"
                    : msg.origin === "weather"
                      ? "cloud"
                      : msg.origin === "farmy"
                        ? "mic"
                        : "info"
              }
              size={13}
              aria-hidden="true"
            />
            {msg.origin === "weather"
              ? t("อากาศจริงจากบริการพยากรณ์ (Open-Meteo)")
              : msg.origin === "web"
              ? t("ผลค้นจากเว็บ ยังไม่มีใครตรวจให้")
              /* ต้องมีป้ายของตัวเอง ไม่ใช่ตกไปเป็น "ข้อมูลตัวอย่าง" — คำตอบจากระบบของอีกทีม
                 กับตัวเลขสมมติในเครื่องเรา เชื่อถือได้คนละระดับกันคนละเรื่อง (T1.287) */
              : msg.origin === "farmy"
              ? t("จากระบบวอยซ์ Farmy")
              : msg.origin !== "ai"
                ? t("จากข้อมูลตัวอย่างในระบบ")
                : msg.direct
                  ? t("อ่านจากเซนเซอร์ฟาร์มโดยตรง")
                  : t("จาก AI ฟาร์ม")}
          </span>
        )}
      </div>
    </li>
  );
}

export default function Assistant({ open, onClose }) {
  const t = useT();
  const navigate = useNavigate();
  const { settings, comfort, openSettings } = useSettings();
  const { userId } = useAuth();
  /* ผู้ช่วยต้องนับฟาร์ม/โรงเรือนที่ผู้ใช้เพิ่มเองด้วย ไม่งั้นตอบคนละจำนวนกับที่เห็นบนหน้าจอ */
  const { farms: allFarms, barnsOf } = useAllFarms();
  const [draft, setDraft] = useState("");
  const [log, setLog] = useState([{ id: "greet", from: "bot", ...GREETING }]);
  /* ต่อ AI จริงได้ไหม — null = ยังไม่รู้ (ยังไม่ได้ถาม หรือถามอยู่) */
  const [ai, setAi] = useState(null);
  const [busy, setBusy] = useState(false);
  const feedRef = useRef(null);
  const inputRef = useRef(null);
  const seq = useRef(0);
  /* ยกเลิกคำถามที่ค้างอยู่ได้ — ทั้งตอนผู้ใช้กดหยุดเองและตอนถอดผู้ช่วยออกจากหน้า */
  const abortRef = useRef(null);

  /* ---------- พูดแทนพิมพ์ (กดไมค์แล้วพูด) ----------
     ข้อความที่ถอดได้ **ต่อท้ายของที่พิมพ์ค้างไว้** ไม่ใช่เขียนทับ — คนอาจพิมพ์ครึ่งหนึ่ง
     แล้วพูดต่อ จำค่าตั้งต้นไว้ตอนเริ่มกด แล้วประกอบใหม่ทุกครั้งที่ได้ผลลัพธ์ */
  const beforeVoiceRef = useRef("");
  const { lang } = useLang();
  const dictation = useDictation(
    (text) => setDraft((beforeVoiceRef.current + " " + text).trim()),
    lang,
  );
  /* สิทธิ์ไมค์ของหน้า + ข้อความบอกผู้ใช้ใต้ห้องแชท (T1.249)
     micNote: null · "ready" (เพิ่งอนุญาต) · หรือสถานะจาก useMicPermission ที่ต้องบอกทางแก้ */
  const mic = useMicPermission();
  const [micNote, setMicNote] = useState(null);

  /* ---------- ปุ่มไมค์: กดครั้งเดียวแล้วพูด กดอีกครั้งเมื่อพูดจบ ----------
     **ผู้ใช้สั่งให้เหมือนกับแผงวอยซ์ (17 ก.ย. 2569)** — เดิมเป็น "กดสั้น = ไปหน้า Voice AI ·
     กดค้าง = พูด" ซึ่งเป็นท่าที่คิดไว้ตอนยังไม่มีแถบลอย ตอนนี้ทางเข้า Voice AI อยู่บนแถบลอย
     และในแถบเมนูซ้ายแล้ว ปุ่มนี้จึงเหลือหน้าที่เดียวคือพูดแทนพิมพ์

     ต่างจากแผงวอยซ์ตรงที่ **ไม่ส่งคำถามให้เอง** — ข้อความไปลงช่องพิมพ์เพื่อให้แก้ก่อนส่งได้
     (ห้องแชทเป็นการพิมพ์ถาม เสียงเป็นแค่ทางลัดแทนแป้นพิมพ์) */
  const startVoice = () => {
    setMicNote(null);
    if (!dictation.supported) return;
    /* ข้อความที่ถอดได้ต่อท้ายของที่พิมพ์ค้างไว้ — จำค่าตั้งต้นไว้ตอนเริ่มพูด */
    beforeVoiceRef.current = draft;

    if (mic.state === "granted") {
      dictation.start();
      return;
    }
    /* **ยังไม่ได้สิทธิ์ = ขอสิทธิ์อย่างเดียว ยังไม่ฟัง** (T1.249)
       เดิมสั่งฟังเลย Chrome เด้งถาม คนไปกด "อนุญาต" การฟังถูกยกเลิกไปแล้ว
       กลายเป็นกดครั้งแรกไม่เกิดอะไร ➜ ขอให้เสร็จ แล้วบอกให้กดอีกครั้ง */
    if (mic.state === "denied" || mic.state === "insecure") {
      setMicNote(mic.state);
      return;
    }
    mic.request().then((result) => setMicNote(result === "granted" ? "ready" : result));
  };

  const toggleVoice = () => (dictation.listening ? dictation.stop() : startVoice());

  /* พับห้องแชท/ถอดผู้ช่วยออกจากหน้า = ไมค์ต้องไม่ค้างฟังต่อ
     ท่ากดครั้งเดียวไม่มีจังหวะ "ปล่อยนิ้ว" มาปิดให้เหมือนเดิมแล้ว จึงต้องปิดตรงนี้เอง */
  useEffect(() => {
    if (!open) dictation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ---------- พูดจบแล้วเคอร์เซอร์ไปรอท้ายข้อความในช่องพิมพ์ ----------
     **ทางสายกลางระหว่าง "ส่งให้เลย" กับ "ไปคลิกช่องเอง"** (ผู้ใช้ให้เลือกทางที่ดีที่สุด · 17 ก.ย. 2569)

     ไม่ส่งให้เองเพราะตัวถอดเสียงฟังศัพท์ฟาร์มเพี้ยนได้บ่อย และคำถามหนัก ๆ ใช้เวลาคิด
     เป็นนาที — ส่งคำที่ฟังผิดออกไปคือเสียเวลาทั้งนาทีนั้นแล้วยังค้างอยู่ในประวัติบทสนทนา
     (ต่างจากแผงวอยซ์ที่ไม่มีช่องพิมพ์ให้แก้อยู่แล้ว จึงต้องส่งเลย)

     แต่ก็ไม่ปล่อยให้ต้องหาที่คลิกเอง — โฟกัสไปรอท้ายข้อความให้ ถอดถูกก็กด Enter ส่งได้ทันที
     ถอดผิดก็พิมพ์แก้ตรงนั้นได้เลย */
  const wasListening = useRef(false);
  useEffect(() => {
    if (dictation.listening) {
      wasListening.current = true;
      return;
    }
    if (!wasListening.current) return;
    wasListening.current = false;

    const box = inputRef.current;
    if (!box) return;
    box.focus();
    /* วางเคอร์เซอร์ท้ายสุด ไม่ใช่เลือกข้อความทั้งก้อน — พิมพ์ต่อได้ทันทีโดยไม่ลบของเดิมทิ้ง */
    const end = box.value.length;
    box.setSelectionRange(end, end);
  }, [dictation.listening]);

  /* AI ฝั่งโน้นใช้ `session` ผูกบทสนทนาเดียวกัน — สุ่มครั้งเดียวต่อการเปิดแอปหนึ่งครั้ง
     ไม่เก็บถาวร เพราะบทสนทนาเก่าข้ามวันมักทำให้คำตอบเพี้ยนมากกว่าช่วย */
  const sessionRef = useRef(`dash-${Math.random().toString(36).slice(2, 10)}`);

  /* กดกากบาทเอาผู้ช่วยออกที่แถบลอย = หยุดกวน AI ที่ยังคิดค้างอยู่
     (ปุ่มอยู่คนละไฟล์แล้ว จึงดูจากค่าที่มันตั้ง ไม่ใช่เรียกตอนกดปุ่ม) */
  const shown = settings.showAssistant;
  useEffect(() => {
    if (!shown) abortRef.current?.abort();
  }, [shown]);

  /* เกณฑ์ของผู้ใช้ — คำตอบต้องตัดสินด้วยชุดเดียวกับที่หน้าอื่นใช้ ไม่งั้นตัวเลขจะขัดกันเอง */
  const ctx = {
    farms: allFarms,
    barnsOf,
    comfort,
    limits: {
      tempMin: settings.comfort.tempMin,
      tempMax: settings.comfort.tempMax,
      humidityMax: settings.comfort.humidityMax,
      nh3Limit: settings.comfort.nh3Limit,
    },
  };

  /* ถามหลังบ้านว่าต่อ AI จริงได้ไหม — ครั้งเดียวต่อการเปิดแอปหนึ่งครั้ง
     เก็บ **ตัว promise** ไว้ ไม่ใช่เก็บแค่ผลลัพธ์ เพราะคนที่กดเปิดห้องแชทแล้วพิมพ์ทันที
     จะถามมาถึงตอนที่ยังตอบไม่กลับ ถ้าตอนนั้นตัดสินจาก state ที่ยังว่างอยู่
     จะได้คำตอบจากข้อมูลตัวอย่างไปเงียบ ๆ ทั้งที่ AI ใช้งานได้ — ผิดแบบที่ไม่มีใครสังเกตเห็น
     ➜ ให้ ask() รอ promise ตัวเดียวกันนี้แทน (เสียเวลาไม่ถึงวินาที ดีกว่าตอบผิดที่มา) */
  const probeRef = useRef(null);
  const ensureAi = () => {
    probeRef.current ??= aiStatus().then((info) => {
      setAi(info);
      return info;
    });
    return probeRef.current;
  };

  /* สมองของระบบวอยซ์ Farmy พร้อมไหม — ท่าเดียวกับ ensureAi ด้วยเหตุผลเดียวกัน (T1.287)
     **ห้องแชทเคยไม่ถาม Farmy เลย** ทั้งที่วอยซ์ถาม ผลคือคำถามเดียวกันได้คำตอบคนละแบบ
     ผู้ใช้เจอเองว่า "วอยซ์แดชบอร์ดตอบตรง วอยซ์ในช่องแชทตอบไม่ตรง" (29 ก.ย. 2569) */
  const farmyRef = useRef(null);
  const ensureFarmy = () => {
    farmyRef.current ??= farmyStatus();
    return farmyRef.current;
  };

  useEffect(() => {
    /* หลังบ้านตอบสถานะ AI เฉพาะคนที่ล็อกอิน (T1.242) — ถามใหม่ทุกครั้งที่มีคนเข้าระบบ
       ไม่งั้นคำตอบ 401 จากตอนอยู่หน้าเข้าสู่ระบบจะค้าง แล้วห้องแชทนึกว่า AI ใช้ไม่ได้ทั้งวัน */
    probeRef.current = null;
    farmyRef.current = null;
    if (!userId) {
      setAi(null);
      return;
    }
    ensureAi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /* ถอดผู้ช่วยออกจากหน้า/ออกจากแอป = หยุดกวน AI ที่ยังคิดค้างอยู่ */
  useEffect(() => () => abortRef.current?.abort(), []);

  /* ข้อความใหม่ต้องเห็นทันทีโดยไม่ต้องเลื่อนเอง */
  useEffect(() => {
    if (!open) return;
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log, open]);

  /* เปิดห้องแล้วเคอร์เซอร์ไปรออยู่ในช่องพิมพ์เลย */
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /* Esc ปิดห้องแชท (ไม่ได้เอาผู้ช่วยออก แค่พับห้องลง ปุ่มบนแถบลอยยังอยู่) */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /** แก้เฉพาะฟองที่ระบุ ไม่แตะฟองอื่น */
  const patchMsg = (id, changes) =>
    setLog((all) =>
      all.map((m) =>
        m.id === id ? { ...m, ...(typeof changes === "function" ? changes(m) : changes) } : m,
      ),
    );

  /**
   * ทางถอยตอนพึ่ง AI ไม่ได้ — ใช้ร่วมกันสองที่: ตอนเปิดแอปมาแล้ว AI ล่มอยู่แล้ว
   * กับตอน AI ล้มกลางคำถาม ทั้งสองกรณีต้องได้ทางถอยแบบเดียวกัน
   * (เคยพลาดมาแล้ว: เขียนไว้แค่ในกรณีล้มกลางคัน ส่วนกรณี AI ล่มตั้งแต่แรก
   *  ตกไปตอบ "ผมไม่รู้" เฉย ๆ โดยไม่ลองค้นเว็บเลย)
   *
   * มีสามทาง เลือกจาก "คำถามนี้ใครตอบได้":
   *   1. เรื่องของเครื่องนี้ล้วน ๆ (`LOCAL_ONLY_TOPICS`) → ข้อมูลในเครื่องอย่างเดียว
   *      ค้นเว็บทั้งวันก็ไม่มีทางรู้ว่าโรงเรือน B2 ของเรามีแจ้งเตือนกี่อัน
   *   2. เข้าเรื่องอื่นในแดชบอร์ด → ตอบจากในเครื่อง **แล้วค้นเว็บมาเสริม**
   *      เพราะคำที่ใช้จับเรื่องกว้างเกินจะเชื่อได้ — "ราคาสุกรมีชีวิตวันนี้" ถูกจับเป็น
   *      เรื่องการเงินของฟาร์ม แล้วตอบงบกำไรขาดทุนกลับไป ซึ่งไม่ใช่สิ่งที่ถาม
   *      ให้ทั้งสองอย่างแล้วผู้ใช้เลือกเอง ดีกว่าเดาผิดแล้วปิดอีกทางทิ้ง
   *   3. ไม่เข้าเรื่องไหนเลย → ค้นเว็บอย่างเดียว
   */
  const fallbackAnswer = async (text, botId, note) => {
    const reply = answerFor(text, ctx);
    const topic = topicIdFor(text);

    const showLocal = (extra) =>
      patchMsg(botId, {
        live: false,
        origin: "local",
        text: reply.text,
        bullets: [...(reply.bullets ?? []), note],
        to: reply.to,
        toLabel: reply.toLabel,
        ...extra,
      });

    /* เรื่องนอกแดชบอร์ดชัด ๆ (โรค ราคา ข่าว กฎหมาย) → ค้นเว็บอย่างเดียว
       ข้ามคำตอบในเครื่องไปเลย เพราะแดชบอร์ดไม่มีข้อมูลเรื่องพวกนี้
       เอามาแสดงก็ได้แต่ของที่ไม่ตรงคำถาม (เคยได้จำนวนฟาร์มตอบคำถามเรื่องโรค) */
    const outward = isOutwardQuestion(text);

    /* ใช้กติกาเดียวกับตอน AI ยังใช้ได้ (T1.282) — ไม่งั้นคำถามเดียวกันจะได้คนละคำตอบ
       แล้วแต่ว่าตอนนั้น AI ล่มหรือเปล่า · คำถามเชิงความรู้ที่ติดคำว่า "หมู" ต้องได้ค้นเว็บ
       ไม่ใช่ถูกปิดทางด้วยคำตอบสำเร็จรูปของเรื่อง `farms` */
    if (localOnlyTopicFor(text)) {
      showLocal();
      return;
    }

    /* ค้นเว็บใช้เวลาหลายวินาที ต้องบอกว่ากำลังทำอะไรอยู่ ไม่ใช่ปล่อยฟองว่าง
       เรื่องที่ตอบจากในเครื่องได้อยู่แล้ว ให้เห็นคำตอบไปก่อนระหว่างรอผลค้น */
    if (topic && !outward) showLocal({ live: true, phase: "searching" });
    else patchMsg(botId, { live: true, text: "", phase: "searching" });

    const results = await searchWeb(text);

    if (results.length === 0) {
      /* ค้นเว็บไม่ได้อีก (เน็ตหลุด/โดนกัน) — เหลือทางสุดท้ายคือข้อมูลในเครื่อง */
      showLocal();
      return;
    }

    if (topic && !outward) {
      showLocal({
        results,
        bullets: [...(reply.bullets ?? []), note, "ถามถึงเรื่องนอกฟาร์มหรือเปล่า — ค้นเว็บมาให้ด้วยแล้ว"],
      });
      return;
    }

    patchMsg(botId, {
      live: false,
      origin: "web",
      text: "ตอนนี้ต่อ AI ไม่ได้ครับ ผมค้นเว็บมาให้แทน",
      bullets: [note],
      results,
    });
  };

  /** ส่งคำถามเดิมไปให้ AI คิดต่อ หลังจากตอบเลขให้ไปแล้ว */
  const analyse = async (question) => {
    seq.current += 1;
    const id = seq.current;
    setLog((all) => [
      ...all,
      { id: `u${id}`, from: "user", text: `${question} — ขอคำวิเคราะห์ด้วย` },
    ]);
    const info = ai ?? (await ensureAi());
    const botId = `b${id}`;
    if (info?.ready) {
      await askAiFor(`${question} ช่วยวิเคราะห์และแนะนำด้วย`, id, botId);
      return;
    }
    setLog((all) => [...all, { id: botId, from: "bot", text: "", live: true, phase: "asking" }]);
    setBusy(true);
    try {
      await fallbackAnswer(question, botId, "(ยังต่อ AI ไม่ได้)");
    } finally {
      setBusy(false);
    }
  };

  /**
   * @param {string} question สิ่งที่ผู้ใช้พิมพ์/กด — ตัวนี้คือสิ่งที่ขึ้นในฟองข้อความ
   * @param {string} [override] คำที่จะส่งให้ AI จริง ๆ ถ้าต่างจากที่แสดง (มาจากปุ่มเลือกจุด)
   */
  const ask = async (question, override) => {
    const text = question.trim();
    if (!text) return;
    seq.current += 1;
    const id = seq.current;
    setDraft("");

    /* ═══ กำลังตอบคำถามที่ AI ย้อนถามอยู่หรือเปล่า ═══
       ถ้าใช่ ต้องแปลงคำให้ตรงกับที่มันรับก่อนส่ง — มันรับแค่คำที่ตรงเป๊ะ
       ทดสอบแล้ว "ทั้งสอง" ไม่ผ่าน มันย้อนถามคำถามเดิมซ้ำ ต้อง "ทั้งสองจุด" เท่านั้น
       และห้ามให้ "1" หรือ "2" ไปโดนตีความเป็นคำสั่งเปิดหน้าหรือคำถามเรื่องอากาศ
       จึงข้ามสองด่านนั้นไปเลยเมื่อกำลังตอบคำถามที่ถูกย้อนถาม */
    const lastBot = [...log].reverse().find((m) => m.from === "bot");
    const answering = lastBot?.choices ?? null;
    const outbound = override ?? (answering ? normalizeChoice(text, answering) : text);

    if (answering) {
      setLog((all) => [...all, { id: `u${id}`, from: "user", text, sent: outbound }]);
      const info = ai ?? (await ensureAi());
      const botId = `b${id}`;
      if (info?.ready) {
        await askAiFor(outbound, id, botId);
        return;
      }
      setLog((all) => [...all, { id: botId, from: "bot", text: "", live: true, phase: "asking" }]);
      setBusy(true);
      try {
        await fallbackAnswer(text, botId, "(ยังต่อ AI ไม่ได้)");
      } finally {
        setBusy(false);
      }
      return;
    }

    /* สั่งเปิดหน้า ("เปิดหน้าโรงเรือน") มาก่อนคำถามเสมอ ไม่งั้นคำสั่งจะไปโดนจับเป็นคำถาม
       แล้วได้คำตอบเป็นตัวเลขแทนที่จะพาไปหน้านั้น */
    const nav = navFor(text, ctx);
    if (nav) {
      setLog((all) => [
        ...all,
        { id: `u${id}`, from: "user", text },
        {
          id: `b${id}`,
          from: "bot",
          origin: "local",
          text: `เปิด${nav.label}ให้แล้วครับ`,
          /* ใส่ลิงก์ไว้ด้วย เผื่อผู้ใช้เลื่อนกลับมาอ่านย้อนหลังแล้วอยากกดซ้ำ */
          to: nav.to,
          toLabel: `กลับไปที่${nav.label}`,
        },
      ]);
      if (nav.action === "settings") openSettings();
      /* ไม่พับห้องแชท — สั่งต่อได้ทันทีเหมือนช่องสั่งงาน และเห็นด้วยว่าคำสั่งทำงานแล้วจริง */
      else navigate(nav.to);
      return;
    }

    /* ฟองของผู้ใช้ขึ้นทันทีเสมอ ไม่รอว่าใครจะเป็นคนตอบ — กดส่งแล้วต้องเห็นผลทันที */
    setLog((all) => [...all, { id: `u${id}`, from: "user", text }]);

    const info = ai ?? (await ensureAi());

    /* ═══ เรื่องที่มีแต่แดชบอร์ดนี้รู้ → ตอบก่อนใครเลย ═══
       **ต้องมาก่อนทั้งเรื่องอากาศและการอ่านค่าเซนเซอร์สด** ไม่งั้น "มีเซนเซอร์ตัวไหนไม่ส่งค่า"
       จะถูกจับเป็น "ขอค่าล่าสุด" แล้วตอบค่าของตัวที่ยังส่งอยู่กลับไป ซึ่งตรงข้ามกับที่ถาม
       **ลำดับนี้ต้องตรงกับวอยซ์เป๊ะ** (useVoiceConversation.js) — มีเทสต์คุมไว้ */
    const outward = isOutwardQuestion(text);
    const topic = outward ? null : topicIdFor(text);
    /* กติกาอยู่ที่ `localOnlyTopicFor` ที่เดียว ใช้ร่วมกับแผงวอยซ์ (T1.282) */
    if (localOnlyTopicFor(text)) {
      setLog((all) => [
        ...all,
        { id: `b${id}`, from: "bot", origin: "local", ...answerFor(text, ctx), askAi: text },
      ]);
      return;
    }

    /* ═══ ถามอากาศของที่อื่นที่ไม่ใช่ฟาร์มเรา → ดึงจากบริการพยากรณ์ตรง ๆ ═══

       ไม่ส่งให้ AI เพราะทดสอบแล้วมันตอบเรื่องนี้ไม่ได้: ตัวจัดเส้นทางของมันดักคำว่า
       "อุณหภูมิ" แล้วย้อนถามว่าจะดูเซนเซอร์จุดไหนในกำแพงเพชร มองข้ามชื่อจังหวัดไปเลย
       (ใส่คำสั่งกำกับนำหน้าก็ยังโดนดักเหมือนเดิม)

       ทำงานได้ทั้งตอน AI ปกติและตอน AI ล่ม เพราะไม่ได้พึ่ง AI เลย */
    const place = weatherPlaceOutside(text, info?.sources ?? []);
    if (place) {
      const botId = `b${id}`;
      setLog((all) => [
        ...all,
        { id: botId, from: "bot", text: "", live: true, phase: "weather" },
      ]);
      setBusy(true);
      try {
        const w = await fetchWeather(place);
        if (w) {
          patchMsg(botId, { live: false, origin: "weather", ...weatherReply(w) });
          return;
        }
        /* หาที่นั่นไม่เจอ — ไม่ตัน ส่งต่อให้ทางปกติทำงานแทน */
        patchMsg(botId, { live: true, phase: "asking" });
        if (info?.ready) {
          await askAiFor(text, id, botId);
          return;
        }
        await fallbackAnswer(text, botId, "(หาข้อมูลอากาศของที่นั่นไม่เจอ)");
        return;
      } finally {
        setBusy(false);
      }
    }

    /* ═══ แค่อยากรู้ค่าตอนนี้ → ตอบเองจากฐานข้อมูลเรา ไม่ต้องรอ AI ═══
       วัดแล้ว AI ใช้ 28–150 วินาทีกับคำถามแค่ "ตอนนี้กี่องศา" ส่วนตรงนี้ 0.1 วินาที
       เป็นค่าจากเซนเซอร์ตัวเดียวกัน (สะพานดึงจาก InfluxDB เข้ามาทุก 30 วินาที)
       ใส่ปุ่มให้ส่งต่อไปถาม AI ได้ เผื่ออยากได้คำวิเคราะห์ต่อ */
    /* ═══ เรื่องที่มีแต่แดชบอร์ดนี้รู้ → ตอบก่อนใครเลย ═══
       **ต้องมาก่อนการอ่านค่าเซนเซอร์สด** ไม่งั้น "มีเซนเซอร์ตัวไหนไม่ส่งค่า" จะถูกจับเป็น
       "ขอค่าล่าสุด" แล้วตอบค่าของตัวที่ยังส่งอยู่กลับไป ซึ่งตรงข้ามกับที่ถาม */
    const asked = currentReadingAsk(text);
    if (asked) {
      const botId = `b${id}`;
      setLog((all) => [...all, { id: botId, from: "bot", text: "", live: true, phase: "asking" }]);
      setBusy(true);
      try {
        const barns = await fetchNow();
        const reply = barns.length > 0 ? nowReply(barns, asked) : null;
        if (reply) {
          patchMsg(botId, { live: false, origin: "ai", direct: true, ...reply, askAi: text });
          return;
        }
      } finally {
        setBusy(false);
      }
      /* ไม่มีข้อมูลสด หรือไม่มีเซนเซอร์วัดค่าที่ถาม → ไปทางปกติต่อ ไม่ตัน */
      if (info?.ready) {
        await askAiFor(text, id, botId);
        return;
      }
      setBusy(true);
      try {
        await fallbackAnswer(text, botId, "(ยังไม่มีค่าเซนเซอร์สด)");
      } finally {
        setBusy(false);
      }
      return;
    }

    /* ═══ คำถามที่ "แดชบอร์ดนี้" ตอบได้ตรงกว่า AI ตัวไหน ═══
       **ผู้ใช้แจ้งว่าตอบไม่ตรงคำถาม (17 ก.ย. 2569)** — ถาม "อาหารเหลือพอกี่วัน"
       แล้วได้ "คำถามของคุณไม่ชัดเจน โปรดระบุว่า…" กลับมาจาก AI
       เพราะ AI ข้างนอกไม่มีทางรู้ว่าไซโลของเราเหลือเท่าไร ตารางให้อาหารเป็นยังไง
       ส่วน `answerFor` คิดจากข้อมูลชุดเดียวกับที่หน้าจอแสดงอยู่ ตอบได้ทันทีและตรงเป๊ะ

       **ยังส่งต่อให้ AI ได้ด้วยปุ่มเดียว** (`askAi`) — ใครอยากได้คำวิเคราะห์ต่อก็กด
       เหมือนที่ทำกับค่าเซนเซอร์สดข้างบน ไม่ได้ปิดทาง AI ทิ้ง

       ตัวกันสามชั้นก่อนจะเชื่อว่า "เป็นเรื่องของแดชบอร์ด": ไม่ใช่คำถามเรื่องนอกฟาร์ม
       (`isOutwardQuestion` — โรค ราคา ข่าว) · ไม่ได้ขอความเห็น (`wantsAdvice` — "ควร"
       "อันตราย" "แนวโน้ม" ซึ่ง AI ตอบดีกว่าชุดกติกาในเครื่องมาก) · และคำที่ใช้จับ
       ต้องเข้าเรื่องใดเรื่องหนึ่งจริง ๆ */
    if (topic && !wantsAdvice(text)) {
      const botId = `b${id}`;
      const reply = answerFor(text, ctx);
      setLog((all) => [
        ...all,
        { id: botId, from: "bot", origin: "local", ...reply, askAi: text },
      ]);
      return;
    }

    /* ═══ สมองของระบบวอยซ์ Farmy — ขั้นเดียวกับที่หน้าวอยซ์ใช้ (T1.287) ═══
       เขารู้เรื่องคลังความรู้ วัคซีน และเซนเซอร์ของฝั่งเขาที่แดชบอร์ดเราไม่มี
       ตอบไม่ได้เมื่อไหร่ค่อยถอยไปใช้ AI ของ CPF โดยใช้ฟองเดิม (ท่าเดียวกับก้อนอากาศข้างบน)

       ★ ห้องแชทต้องมีขั้นนี้ ไม่งั้นคำถามเดียวกันจะได้คำตอบคนละแบบกับวอยซ์
         ซึ่งผู้ใช้เจอเองแล้วและเป็นเหตุผลที่ขั้นนี้ถูกเพิ่มเข้ามา */
    const farmyInfo = await ensureFarmy();
    if (farmyInfo?.ready) {
      const botId = `b${id}`;
      setLog((all) => [...all, { id: botId, from: "bot", text: "", live: true, phase: "asking" }]);
      setBusy(true);
      try {
        /* ส่งเฉพาะเทิร์นล่าสุด และเฉพาะคำตอบที่มาจากเขาเอง — ชุดเดียวกับที่วอยซ์ส่ง */
        const history = log
          .filter((m) => m.from === "user" || m.origin === "farmy")
          .slice(-6)
          .map((m) => ({ role: m.from === "user" ? "user" : "model", text: m.text }));
        const answer = await farmyAsk(text, history);
        if (answer) {
          patchMsg(botId, { live: false, origin: "farmy", text: answer, askAi: text });
          return;
        }
      } catch {
        /* ของเขาล่ม/ช้าเกินไป — ไม่ตัน ใช้ฟองเดิมส่งต่อให้ AI ของ CPF */
      } finally {
        setBusy(false);
      }
      patchMsg(botId, { live: true, phase: "asking" });
      if (info?.ready) {
        await askAiFor(text, id, botId);
        return;
      }
      await fallbackAnswer(text, botId, "(ยังต่อ AI ไม่ได้)");
      return;
    }

    /* ต่อ AI จริงไม่ได้ (ยังไม่ได้ตั้งกุญแจ / เซิร์ฟเวอร์ล่ม) → ใช้ทางถอยชุดเดียวกัน */
    if (!info?.ready) {
      const botId = `b${id}`;
      setLog((all) => [...all, { id: botId, from: "bot", text: "", live: true, phase: "asking" }]);
      setBusy(true);
      try {
        await fallbackAnswer(text, botId, "(ยังต่อ AI ไม่ได้)");
      } finally {
        setBusy(false);
      }
      return;
    }

    askAiFor(text, id);
  };

  /**
   * ถาม AI จริงแล้ววาดคำตอบทีละคำ
   *
   * แยกออกมาจาก `ask` เพราะเป็นงานที่กินเวลาเป็นนาทีและยกเลิกได้ ต่างจากคำตอบในเครื่อง
   * ที่เสร็จภายในเฟรมเดียว — ปนกันแล้วอ่านยากทั้งคู่
   */
  const askAiFor = async (text, id, existingId) => {
    /* คำถามใหม่ระหว่างที่อันเก่ายังไม่จบ = ทิ้งอันเก่า ไม่ให้คำตอบสองชุดมาวาดสลับกัน */
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const botId = existingId ?? `b${id}`;
    setBusy(true);
    /* **ต้องเช็กข้างใน setLog** — `log` ที่อยู่นอกนี้เป็นค่าจากตอน render ที่สร้างฟังก์ชันนี้
       ทางที่ถามค่าเซนเซอร์ก่อนแล้วค่อยส่งต่อมา AI เพิ่งใส่ฟองไปเมื่อกี้ แต่ `log` ยังไม่ทันเห็น
       จึงใส่ฟองซ้ำอีกใบด้วย id เดียวกัน (คีย์ React ชนกัน + ผู้ใช้เห็น "กำลังถาม AI…" สองใบ) */
    setLog((all) =>
      all.some((m) => m.id === botId)
        ? all
        : [
            ...all,
            { id: botId, from: "bot", text: "", live: true, phase: "asking", waitSeconds: 0, queue: 0 },
          ],
    );

    const patch = (changes) => patchMsg(botId, changes);

    /* บริบทที่ส่งไปให้ AI = คำถามของผู้ใช้กับคำตอบที่ AI เคยตอบเองเท่านั้น
       **ไม่ส่งคำตอบจาก answers.js ไปด้วย** — นั่นคิดจาก mock data ถ้าปนเข้าไป
       AI จะรับตัวเลขสมมติมาเป็นข้อเท็จจริงแล้วตอบต่อจากตัวเลขที่ไม่มีอยู่จริง */
    /* `sent` = คำที่แปลงแล้วจริง ๆ ตอนนั้น ไม่ใช่คำที่ผู้ใช้พิมพ์
       ต้องส่งตัวที่แปลงแล้ว ไม่งั้น AI จะเห็นประวัติเป็นคำที่ตัวเองไม่เข้าใจ */
    const history = log
      .filter((m) => m.from === "user" || m.origin === "ai")
      .map((m) => ({ role: m.from === "user" ? "user" : "assistant", content: m.sent ?? m.text }));

    try {
      const { text: answer, direct } = await askAi({
        messages: [...history, { role: "user", content: text }],
        session: sessionRef.current,
        user: userId,
        signal: controller.signal,
        onEvent: (ev) => {
          if (ev.type === "waiting")
            patch({ waitSeconds: ev.seconds, queue: ev.queue, phase: "waiting" });
          else if (ev.type === "thinking") patch({ phase: "thinking" });
          else if (ev.type === "delta") patch((m) => ({ text: m.text + ev.text, phase: "typing" }));
        },
      });
      /* สองอย่างที่ต้องแปลงเป็นปุ่ม ไม่ปล่อยให้ผู้ใช้พิมพ์เอง:
         1. มันย้อนถามว่าเอาจุดไหน (`clarify`)
         2. มันแปะปุ่มแนะนำมาท้ายคำตอบด้วยเครื่องหมาย [[ตัวเลือก]]
            ไม่แยกออกมา มันจะโผล่เป็นข้อความดิบกลางฟองคำตอบ */
      const { text: clean, suggestions } = splitSuggestions(answer);
      const asked = direct === "clarify" ? parseChoices(clean) : null;
      patch({
        text: clean,
        live: false,
        origin: "ai",
        direct,
        choices:
          asked ??
          (suggestions.length > 0
            ? { options: suggestions.map((label) => ({ n: label, label })), allPhrase: null }
            : null),
      });

      /* AI ตอบกลับมาแล้ว แต่เนื้อความแปลว่า "ไม่รู้" — ค้นเว็บมาต่อท้ายให้
         **ไม่ลบคำตอบของ AI ทิ้ง** เพราะบ่อยครั้งมันบอกด้วยว่าไม่รู้เพราะอะไร
         ซึ่งมีประโยชน์กว่าผลค้นดิบ ๆ เอามาวางแทนที่กัน
         ข้ามถ้าเป็นคำตอบจากเซนเซอร์ตรง ๆ (`direct`) — ตรงนั้นมันอ่านค่ามาจริง ไม่ได้ไม่รู้ */
      if (!direct && soundsUnanswered(answer)) {
        const extra = await searchWeb(text);
        if (extra.length > 0) {
          patch((m) => ({
            results: extra,
            bullets: [...(m.bullets ?? []), "ค้นเว็บมาให้เพิ่ม เผื่อมีคำตอบอยู่ข้างนอก"],
          }));
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        /* ผู้ใช้กดหยุดเอง — เก็บที่พิมพ์มาแล้วไว้ ดีกว่าล้างทิ้งทั้งฟอง */
        patch((m) => ({
          live: false,
          origin: m.text ? "ai" : undefined,
          text: m.text || "หยุดถามแล้วครับ",
        }));
        return;
      }

      /* AI ล้มกลางคัน — ทางถอยชุดเดียวกับตอนที่ AI ล่มมาตั้งแต่แรก */
      await fallbackAnswer(text, botId, `(ต่อ AI ไม่สำเร็จ: ${err.message})`);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  };

  /* พับอยู่ = ไม่มีอะไรบนจอ แต่ตัว component ยังอยู่ ประวัติการคุยจึงไม่หาย */
  if (!open) return null;

  return (
    <div className="as-root">
      <section className="as-panel" aria-label={t("ผู้ช่วย AI")}>
        <header className="as-head">
          <span className="as-head-mark" aria-hidden="true">
            <Icon name="spark" size={20} />
          </span>
          <span className="as-head-text">
            <b>{t("ผู้ช่วย AI")}</b>
            {/* บอกตั้งแต่บรรทัดแรกว่ากำลังคุยกับอะไรอยู่ — ผู้ใช้จะได้ตั้งคำถามให้ถูกที่
                ถามค่าเซนเซอร์จริงกับ AI ได้ แต่ถามตอนต่อไม่ได้จะได้แค่ตัวเลขตัวอย่าง */}
            <span>
              {ai === null
                ? t("ตอบจากข้อมูลในแดชบอร์ดนี้")
                : ai.ready
                  ? t("ต่อ AI ฟาร์มแล้ว — ถามค่าเซนเซอร์จริงและเรื่องนอกฟาร์มได้")
                  : t("ต่อ AI ไม่ได้ — ค้นเว็บและดูอากาศให้ได้อยู่")}
            </span>
          </span>
          <button
            type="button"
            className="as-head-btn"
            onClick={onClose}
            title={t("พับห้องแชท")}
            aria-label={t("พับห้องแชท")}
          >
            <Icon name="minus" size={18} />
          </button>
        </header>

        <ul className="as-feed" ref={feedRef}>
          {log.map((msg) => (
            /* กดลิงก์ = ตั้งใจไปดูหน้านั้น พับห้องแชทลงให้เห็นหน้าเต็ม ๆ */
            <Bubble
              key={msg.id}
              msg={msg}
              onNavigate={onClose}
              onChoose={(label, value) => ask(label, value)}
              onAnalyse={(q) => analyse(q)}
            />
          ))}
        </ul>

        {/* คำถามด่วน — กดทีเดียวได้คำตอบ ไม่ต้องเดาว่าถามอะไรได้บ้าง */}
        <div className="as-chips">
          {TOPICS.map((topic) => (
            <button
              key={topic.id}
              type="button"
              className="as-chip"
              disabled={busy}
              onClick={() => ask(topic.chip)}
            >
              {t(topic.chip)}
            </button>
          ))}
        </div>

        {/* ไมค์ติดอะไร ต้องเห็นบนจอ ไม่ใช่ซ่อนอยู่ใน title ของปุ่ม (T1.249) */}
        {(micNote || dictation.error) && (
          <p
            className={"as-mic-note" + (micNote === "ready" ? " is-ready" : "")}
            role="status"
          >
            <Icon name={micNote === "ready" ? "check" : "mic"} size={16} aria-hidden="true" />
            <span>
              {micNote === "ready"
                ? t("อนุญาตไมโครโฟนแล้ว — กดปุ่มไมค์แล้วพูดได้เลย")
                : micNote
                  ? t(MIC_STATE_TEXT[micNote])
                  : DICTATION_ERROR_TEXT[dictation.error]
                    ? t(DICTATION_ERROR_TEXT[dictation.error])
                    : t("ถอดเสียงไม่สำเร็จ ({code}) — กดไมค์แล้วพูดอีกครั้ง", { code: dictation.error })}
            </span>
          </p>
        )}

        <form
          className="as-compose"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) ask(draft);
          }}
        >
          <input
            ref={inputRef}
            type="text"
            className="as-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("พิมพ์คำถามเรื่องฟาร์ม…")}
            aria-label={t("ช่องพิมพ์คำถาม")}
          />
          {/* ---------- ปุ่มไมค์: กดครั้งเดียวแล้วพูด ----------
              เดิมเป็นปุ่มเดียวสองหน้าที่ (กดสั้นไปหน้า Voice AI · กดค้างพูด) ผู้ใช้สั่งให้เหมือน
              แผงวอยซ์ (17 ก.ย. 2569) — ทางเข้า Voice AI ยังอยู่ครบที่แถบลอยล่างจอ
              และเมนูในแถบซ้าย

              ซ่อนปุ่มเมื่อเบราว์เซอร์ถอดเสียงไม่ได้ (Firefox) — ต่างจากเดิมที่ต้องโชว์ไว้
              เพราะครึ่งหนึ่งของปุ่มเคยเป็นทางเข้าเว็บ ตอนนี้ไม่มีหน้าที่นั้นแล้ว */}
          {dictation.supported && !busy && (
            <button
              type="button"
              className={"as-mic" + (dictation.listening ? " is-on" : "")}
              onClick={toggleVoice}
              title={
                dictation.error === "not-allowed"
                  ? t("เบราว์เซอร์ไม่อนุญาตให้ใช้ไมโครโฟน")
                  : dictation.listening
                    ? t("กดอีกครั้งเมื่อพูดจบ")
                    : t("กดแล้วพูดได้เลย")
              }
              aria-label={dictation.listening ? t("กดอีกครั้งเมื่อพูดจบ") : t("กดแล้วพูดได้เลย")}
              aria-pressed={dictation.listening}
            >
              <Icon name={dictation.listening ? "check" : "mic"} size={18} />
            </button>
          )}

          {/* ระหว่างที่ AI ยังคิด ปุ่มส่งกลายเป็นปุ่มหยุด — ไม่ใช่ปุ่มจาง ๆ ที่กดไม่ได้
              คำถามหนักใช้เวลาเป็นนาที ต้องมีทางถอยที่ไม่ใช่การรีเฟรชทั้งหน้า */}
          {busy ? (
            <button
              type="button"
              className="as-send is-stop"
              onClick={() => abortRef.current?.abort()}
              title={t("หยุดถาม")}
              aria-label={t("หยุดถาม")}
            >
              <Icon name="cross" size={18} />
            </button>
          ) : (
            <button
              type="submit"
              className="as-send"
              disabled={!draft.trim()}
              title={t("ส่งคำถาม")}
              aria-label={t("ส่งคำถาม")}
            >
              <Icon name="send" size={18} />
            </button>
          )}
        </form>

        {/* เดิมเขียนตายตัวว่า "ยังไม่ได้ต่อโมเดลภาษาจริง" — ตอนนี้ต่อแล้ว
            บรรทัดนี้จึงต้องเปลี่ยนตามความจริง ณ ตอนนั้น ไม่ใช่ข้อความค้างที่กลายเป็นคำโกหก

            และห้ามเขียนว่า "เรื่องอื่นตอบจากข้อมูลตัวอย่าง" แบบที่เคยเขียนไว้ —
            ผิด เพราะ AI ตัวนี้ค้นเว็บได้ (ราคาหมูรายสัปดาห์ ราคาทอง ข่าวโรคระบาด
            พยากรณ์อากาศล่วงหน้า) ข้อมูลตัวอย่างถูกใช้ก็ต่อเมื่อต่อ AI ไม่ได้เท่านั้น */}
        <p className="as-foot">
          {ai?.ready ? (
            <>
              {t("เซนเซอร์จริง:")} {ai.sources?.length > 0
                ? ai.sources.map((src) => src.label).join(" · ")
                : t("เซนเซอร์ของฟาร์ม")}
              {" · "}
              {t("เรื่องอื่นค้นให้ได้ เช่น ราคาหมู พยากรณ์อากาศ ข่าวโรคระบาด")}
            </>
          ) : (
            t("ตอบจากข้อมูลตัวอย่างในระบบ ยังไม่ได้ต่อโมเดลภาษาจริง")
          )}
        </p>
      </section>
    </div>
  );
}
