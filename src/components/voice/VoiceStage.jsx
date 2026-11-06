/**
 * หน้าวอยซ์แบบเต็มพื้นที่ — สกินใหญ่ของสมองตัวเดียวกับแผงเล็ก (T1.286)
 *
 * ═══ ทำไมถึงมีไฟล์นี้ ═══
 * เดิมหน้า `/dashboard/voice` ฝัง **เว็บของทีม Farmy ทั้งเว็บผ่าน iframe**
 * ซึ่งเข้าไปเป็น "ผู้เยี่ยมชม" เขาจึงปฏิเสธคำถามเกี่ยวกับฟาร์มทั้งหมด
 * — นั่นคืออาการ "วอยซ์ตอบไม่ตรงประเด็น" ที่ผู้ใช้แจ้ง (T1.282 แก้ได้แค่ฝั่งแผง)
 *
 * ที่นี่ใช้ `useVoiceConversation` ตัวเดียวกับแผง จึงยิงผ่านหลังบ้านของเราที่
 * **ล็อกอิน Farmy ด้วยบัญชีจริงแล้ว** คำถามในฟาร์มจึงได้คำตอบจริง และยังได้
 * ของที่ iframe ให้ไม่ได้ด้วย: ค่าจากเซนเซอร์ของเราเอง · คำสั่ง "เปิดหน้า…" ·
 * ป้ายบอกที่มาของทุกคำตอบ
 *
 * ใช้คลาส `vp-*` ชุดเดียวกับแผงเล็ก ห่อด้วย `.vs` ที่ขยายขนาดให้เต็มการ์ด
 * — สองสกินใช้สไตล์ชีตเดียว ไม่งั้นแก้ที่หนึ่งแล้วอีกที่เพี้ยนตามไม่รู้ตัว
 */
import Icon from "../ui/Icon.jsx";
import MicPermissionBar from "./MicPermissionBar.jsx";
import { DICTATION_ERROR_TEXT, MIC_STATE_TEXT } from "../../lib/voice/useMicPermission.js";
import { ORIGIN, useVoiceConversation } from "./useVoiceConversation.js";
import { useT } from "../../lib/i18n/useT.js";
import "./voicePanel.css";
import "./voiceStage.css";

/** ตัวอย่างคำถามที่กดแล้วถามได้เลย — คนที่เพิ่งเปิดหน้ามักไม่รู้ว่าถามอะไรได้ */
const SAMPLES = [
  "ตอนนี้กี่องศา",
  "อาหารเหลือพอกี่วัน",
  "มีแจ้งเตือนอะไรค้างอยู่บ้าง",
  "เปิดหน้าการแจ้งเตือน",
];

export default function VoiceStage() {
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
    ask,
    toggleListening,
    lastAnswer,
  } = useVoiceConversation({ active: true });

  return (
    <section className="vs" aria-label={t("Voice AI · ระบบสั่งงานด้วยเสียง")}>
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
      </header>

      <ul className="vp-feed" ref={feedRef}>
        {log.length === 0 && !busy && (
          <li className="vs-start">
            <Icon name="mic" size={34} aria-hidden="true" />
            <p>{t("กดไมค์แล้วพูดได้เลย หรือเลือกตัวอย่างคำถามข้างล่าง")}</p>
            <div className="vs-samples">
              {SAMPLES.map((s) => (
                <button key={s} type="button" disabled={busy} onClick={() => ask(t(s))}>
                  {t(s)}
                </button>
              ))}
            </div>
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

      {(dictation.listening || heard) && (
        <p className="vp-heard" role="status">
          <Icon name="mic" size={15} aria-hidden="true" />
          <span>{heard || t("กำลังฟัง…")}</span>
        </p>
      )}

      {speakOn && speech.voiceMissing && (
        <p className="vp-note" role="status">
          <Icon name="speaker" size={15} aria-hidden="true" />
          <span>{t("เครื่องนี้ยังไม่มีเสียงของภาษานี้ — จะอ่านด้วยเสียงที่มีอยู่แทน")}</span>
        </p>
      )}

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
            <span>{dictation.listening ? t("กดอีกครั้งเมื่อพูดจบ") : t("กดแล้วพูดได้เลย")}</span>
          </button>
        ) : (
          <p className="vp-error" role="status">
            <Icon name="warn" size={15} aria-hidden="true" />
            <span>{t("เบราว์เซอร์นี้ยังถอดเสียงไม่ได้ — ใช้ Chrome, Edge หรือ Safari")}</span>
          </p>
        )}

        {speech.speaking && (
          <button type="button" className="vp-stop" onClick={speech.stop}>
            <Icon name="cross" size={16} aria-hidden="true" />
            {t("หยุดอ่าน")}
          </button>
        )}

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

      <MicPermissionBar readyText="ไมโครโฟนพร้อม · ออกจากหน้านี้แล้วไมค์หยุดทันที" />
    </section>
  );
}
