/**
 * แผงวอยซ์ — "ห้องแชทเล็ก ๆ แต่คุยด้วยเสียง" เด้งขึ้นเหนือแถบลอยเหมือนห้องแชทผู้ช่วย AI
 *
 * **ผู้ใช้สั่ง (16 ก.ย. 2569)**: กดปุ่ม Voice AI แล้วให้ขึ้นแผงเล็ก ๆ แบบแชทบอทแต่เป็นแบบเสียง
 * **เอาแค่ระบบการทำงาน ไม่เอาแดชบอร์ดของวอยซ์** — ของเดิมเป็นกรอบเว็บ Farmy ทั้งเว็บ
 * (เมนู หน้าเข้าสู่ระบบ แดชบอร์ดของเขา) ซึ่งกินทั้งจอและต้องล็อกอินของอีกทีมก่อนถึงจะถามได้
 *
 * **ไฟล์นี้เหลือแต่หน้าตา** — สมอง (ฟัง · ตัดสินว่าใครควรตอบ · ตอบ · อ่านออกเสียง)
 * ย้ายไปอยู่ที่ `useVoiceConversation.js` แล้ว (T1.286) เพื่อให้หน้าเต็มจอ `/dashboard/voice`
 * ใช้สมองตัวเดียวกันได้ แทนที่จะฝัง iframe ของ Farmy แบบผู้เยี่ยมชมซึ่งตอบคำถามในฟาร์มไม่ได้
 * ➜ อยากรู้ว่าคำถามไหนใครตอบ ดูที่ `useVoiceConversation.js` ไม่ใช่ที่นี่
 *
 * ทางเข้าเว็บ Farmy เต็มรูปแบบยังอยู่ — ปุ่มบนหัวแผง
 */
import Icon from "../ui/Icon.jsx";
import MicPermissionBar from "./MicPermissionBar.jsx";
import { DICTATION_ERROR_TEXT, MIC_STATE_TEXT } from "../../lib/voice/useMicPermission.js";
import { ORIGIN, useVoiceConversation } from "./useVoiceConversation.js";
import { useT } from "../../lib/i18n/useT.js";
import "./voicePanel.css";

export default function VoicePanel({ open, onClose, onOpenSite }) {
  const t = useT();
  const {
    log,
    busy,
    wait,
    heard,
    dictation,
    speech,
    micOff,
    farmy,
    feedRef,
    speakOn,
    toggleSpeak,
    toggleListening,
    lastAnswer,
  } = useVoiceConversation({ active: open });

  if (!open) return null;

  return (
    <section className="vp" aria-label={t("Voice AI · ระบบสั่งงานด้วยเสียง")}>
      <header className="vp-head">
        <span className="vp-head-mark" aria-hidden="true">
          <Icon name="mic" size={20} />
        </span>
        <span className="vp-head-text">
          <b>{t("Voice AI")}</b>
          {/* บอกตั้งแต่ก่อนพูดว่ากำลังจะคุยกับสมองตัวไหน — คำตอบจากคนละที่เชื่อถือได้ไม่เท่ากัน */}
          {/* เหตุผลที่ยังไม่พร้อมมาจากเซิร์ฟเวอร์ของเขาเอง (T1.288) — โชว์ตรง ๆ ดีกว่าเขียนเอง
              ว่า "ต่อไม่ได้" เพราะข้อความของเขาบอกวิธีแก้ในตัว เช่นบอกว่ากล่องยังไม่ได้เปิดแอป
              ไม่แปลภาษา เพราะเป็นข้อความสด ๆ จากระบบอื่น ไม่ใช่ข้อความของแอปเรา */}
          <span>
            {farmy?.ready
              ? t("ต่อระบบวอยซ์ Farmy แล้ว · กดไมค์แล้วพูดได้เลย")
              : (farmy?.reason ?? t("กดไมค์แล้วพูด กดอีกครั้งเมื่อพูดจบ"))}
          </span>
        </span>

        {/* เปิด/ปิดการอ่านคำตอบออกเสียง — สถานะดูออกจากรูปไอคอน ไม่ใช่จากสีอย่างเดียว
            ปิดแล้วยังพูดถามได้เหมือนเดิม แค่ตอบเป็นตัวหนังสืออย่างเดียว */}
        {speech.supported && (
          <button
            type="button"
            className={"vp-head-btn" + (speakOn ? " is-on" : "")}
            onClick={toggleSpeak}
            aria-pressed={speakOn}
            title={speakOn ? t("กำลังอ่านคำตอบออกเสียง — กดเพื่อปิดเสียง") : t("ปิดเสียงอยู่ — กดเพื่อให้อ่านคำตอบออกเสียง")}
            aria-label={speakOn ? t("กำลังอ่านคำตอบออกเสียง — กดเพื่อปิดเสียง") : t("ปิดเสียงอยู่ — กดเพื่อให้อ่านคำตอบออกเสียง")}
          >
            <Icon name={speakOn ? "speaker" : "mute"} size={17} />
          </button>
        )}

        {/* ทางเข้าเว็บ Farmy เต็มรูปแบบ — ระบบของอีกทีมยังอยู่ครบ แค่ไม่ใช่ของที่เด้งมาก่อน */}
        <button
          type="button"
          className="vp-head-btn"
          onClick={onOpenSite}
          title={t("เปิดเว็บ Voice AI เต็มรูปแบบ")}
          aria-label={t("เปิดเว็บ Voice AI เต็มรูปแบบ")}
        >
          <Icon name="expand" size={17} />
        </button>
        <button
          type="button"
          className="vp-head-btn"
          onClick={onClose}
          title={t("พับแผงวอยซ์")}
          aria-label={t("พับแผงวอยซ์")}
        >
          <Icon name="minus" size={18} />
        </button>
      </header>

      <ul className="vp-feed" ref={feedRef}>
        {log.length === 0 && !busy && (
          <li className="vp-hint">
            <Icon name="info" size={16} aria-hidden="true" />
            <span>
              {t("ลองพูดว่า “ตอนนี้กี่องศา” · “เปิดหน้าการแจ้งเตือน” · “อาหารเหลือพอกี่วัน”")}
            </span>
          </li>
        )}

        {log.map((msg) =>
          msg.from === "user" ? (
            <li key={msg.id} className="vp-msg is-user">
              <p>{msg.text}</p>
            </li>
          ) : (
            <li key={msg.id} className="vp-msg is-bot">
              <p>{msg.text}</p>
              {msg.bullets?.length > 0 && (
                <ul className="vp-list">
                  {msg.bullets.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              <span className={"vp-tag is-" + msg.origin}>
                <Icon name={ORIGIN[msg.origin].icon} size={13} aria-hidden="true" />
                {t(ORIGIN[msg.origin].text)}
              </span>
            </li>
          ),
        )}

        {busy && (
          <li className="vp-msg is-bot">
            <p className="vp-wait" role="status">
              <span className="vp-dots" aria-hidden="true">
                <i /><i /><i />
              </span>
              {wait > 0 ? t("AI กำลังคิด… ({n} วิ)", { n: wait }) : t("กำลังหาคำตอบให้…")}
            </p>
          </li>
        )}
      </ul>

      {/* ได้ยินว่าอะไรต้องเห็นบนจอระหว่างพูด ไม่ใช่รู้ตอนคำตอบออกมาแล้วว่าฟังผิด */}
      {(dictation.listening || heard) && (
        <p className="vp-heard" role="status">
          <Icon name="mic" size={15} aria-hidden="true" />
          <span>{heard || t("กำลังฟัง…")}</span>
        </p>
      )}

      {/* เครื่องไม่มีเสียงของภาษานี้ = จะอ่านด้วยเสียงตั้งต้น สำเนียงเพี้ยนแต่ไม่เงียบ
          ต้องบอกไว้ ไม่งั้นผู้ใช้จะนึกว่าระบบพัง */}
      {speakOn && speech.voiceMissing && (
        <p className="vp-note" role="status">
          <Icon name="speaker" size={15} aria-hidden="true" />
          <span>{t("เครื่องนี้ยังไม่มีเสียงของภาษานี้ — จะอ่านด้วยเสียงที่มีอยู่แทน")}</span>
        </p>
      )}

      {/* `title` เก็บรหัสดิบของเบราว์เซอร์ไว้ (เช่น not-allowed, network) — เอาเมาส์ชี้แล้วเห็น
          เวลามีคนบอกว่า "ใช้ไมค์ไม่ได้" จะได้ถามหารหัสนี้แทนที่จะเดากันไปมา */}
      {/* หน้าถูกปิดไมค์ทั้งหน้าอยู่ = ข้อความ "เบราว์เซอร์บล็อกอยู่ กดไอคอนข้างช่องที่อยู่เว็บ"
          ไม่ใช่เรื่องจริงของเคสนี้และทำตามแล้วไม่หาย — โชว์เหตุผลเดียวคือเรื่อง http พอ */}
      {dictation.error && !micOff && (
        <p className="vp-error" role="status" title={dictation.error}>
          <Icon name="warn" size={15} aria-hidden="true" />
          <span>
            {DICTATION_ERROR_TEXT[dictation.error]
              ? t(DICTATION_ERROR_TEXT[dictation.error])
              : t("ถอดเสียงไม่สำเร็จ ({code}) — กดไมค์แล้วพูดอีกครั้ง", { code: dictation.error })}
          </span>
        </p>
      )}

      <div className="vp-bar">
        {micOff ? (
          <p className="vp-error" role="status">
            <Icon name="warn" size={15} aria-hidden="true" />
            <span>{t(MIC_STATE_TEXT.insecure)}</span>
          </p>
        ) : dictation.supported ? (
          <button
            type="button"
            className={"vp-mic" + (dictation.listening ? " is-on" : "")}
            disabled={busy}
            onClick={toggleListening}
            aria-pressed={dictation.listening}
            title={dictation.listening ? t("กดอีกครั้งเมื่อพูดจบ") : t("กดแล้วพูดได้เลย")}
          >
            <Icon name={dictation.listening ? "check" : "mic"} size={26} />
            <span>
              {dictation.listening ? t("กดอีกครั้งเมื่อพูดจบ") : t("กดแล้วพูดได้เลย")}
            </span>
          </button>
        ) : (
          /* Firefox ยังไม่มี Web Speech API — บอกตรง ๆ พร้อมทางไปต่อ
             ไม่ใช่โชว์ปุ่มที่กดแล้วเงียบ */
          <p className="vp-error" role="status">
            <Icon name="warn" size={15} aria-hidden="true" />
            <span>{t("เบราว์เซอร์นี้ยังถอดเสียงไม่ได้ — ใช้ Chrome, Edge หรือ Safari")}</span>
          </p>
        )}

        {/* หยุดเสียงได้ตลอด ไม่ต้องรอให้อ่านจบ */}
        {speech.speaking && (
          <button type="button" className="vp-stop" onClick={speech.stop}>
            <Icon name="cross" size={16} aria-hidden="true" />
            {t("หยุดอ่าน")}
          </button>
        )}

        {/* กดซ้ำให้อ่านคำตอบล่าสุดอีกรอบ — ฟังไม่ทันไม่ต้องถามใหม่ทั้งคำถาม */}
        {!speech.speaking && speakOn && lastAnswer && (
          <button
            type="button"
            className="vp-stop"
            onClick={() => speech.speak([lastAnswer.text, ...(lastAnswer.bullets ?? [])].join(" "))}
          >
            <Icon name="speaker" size={16} aria-hidden="true" />
            {t("อ่านอีกครั้ง")}
          </button>
        )}
      </div>

      <MicPermissionBar readyText="ไมโครโฟนพร้อม · ปิดแผงนี้แล้วไมค์หยุดทันที" />
    </section>
  );
}
