/**
 * แถบลอยล่างจอ — ทางเข้ากลางของผู้ช่วย AI (แชท) และ Voice AI (สั่งงานด้วยเสียง)
 *
 * **ผู้ใช้สั่ง (16 ก.ย. 2569)** ให้ย้ายทั้งสองระบบมารวมอยู่ในแถบลอยแถบเดียว กดได้จากตรงนั้น
 * ของเดิมอยู่คนละมุมจอ: ลูกกลมแชทมุมขวาล่าง · ปุ่มไมค์เล็ก ๆ บนแถบบนขวาของโครงหน้าสามแบบ
 * (ซึ่งต้องไปใส่ซ้ำทุกโครง ลืมโครงไหนปุ่มก็หายไปเฉย ๆ — ตอนนี้มีที่เดียวนอก <Routes>)
 *
 * แถบนี้เป็นเจ้าของ "เปิด/ปิด" ของทั้งสองระบบ:
 *   · ห้องแชท  — `<Assistant open onClose>` วาดแผงขึ้นเหนือแถบ
 *   · Voice AI — `<VoicePanel>` แผงเล็กแบบเดียวกันแต่คุยด้วยเสียง (ผู้ใช้สั่ง 16 ก.ย. 2569)
 *                เดิมเป็นกรอบเว็บ Farmy ทั้งเว็บกลางจอ ตอนนี้เหลือเป็นทางเลือกในหัวแผง
 *                (`<VoiceModal>`) สำหรับคนที่อยากได้หน้าจอเต็มของอีกทีมจริง ๆ
 *
 * **`<Assistant>` ต้องอยู่ในจอเสมอแม้ตอนไม่ได้เปิดห้องแชท** — ถอดออกเมื่อไหร่
 * ประวัติการคุยหายทั้งหมด (state อยู่ในตัวมัน) ตัวมันคืนค่า null เองตอนปิด
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Icon from "../ui/Icon.jsx";
import Assistant from "../assistant/Assistant.jsx";
import VoicePanel from "../voice/VoicePanel.jsx";
import VoiceModal from "../voice/VoiceModal.jsx";
import { LINKED_SYSTEMS } from "../../data/linkedSystems.js";
import { OPEN_ASSISTANT_EVENT } from "../../lib/nav/openAssistant.js";
import { useSettings } from "../../lib/settings/useSettings.js";
import { useLayout } from "../../lib/layout/useLayout.js";
import { useScrollHide } from "./useScrollHide.js";
import { useT } from "../../lib/i18n/useT.js";
import "./dock.css";

/**
 * หน้าที่ไม่มีแถบลอย
 *   `/` `/login`  ยังไม่ได้เข้าระบบ ไม่มีอะไรให้ถามและไม่ควรมีของลอยบังฟอร์ม
 *   `/hub`        ★ ตู้กลางเป็นคนละระบบกับแดชบอร์ดฟาร์ม (T1.347) ผู้ช่วยตอบเรื่องฟาร์ม
 *                 ไม่ได้รู้เรื่องกล่องกับสิทธิ์ ปล่อยให้ลอยอยู่จะชวนให้ถามแล้วได้คำตอบผิดที่
 */
const HIDE_ON = ["/", "/login", "/hub"];

/** แถบ "เรียกกลับ" อยู่กี่วินาทีหลังกดกากบาทเอาปุ่มออก */
const UNDO_SECONDS = 12;

/**
 * ปุ่มบนแถบที่ "เอาออกได้" — คีย์ตั้งค่าของใครของมัน (ทั้งคู่จำไว้ที่หน้าตั้งค่า)
 *
 * เป็นคนละระบบกันจริง ๆ (ผู้ช่วยเป็นของแดชบอร์ดนี้ · Voice AI เป็นของทีมอื่น)
 * เอาออกทีละตัวได้ ปิดทั้งคู่ = ไม่มีแถบลอยเลย
 */
const REMOVABLE = {
  assistant: { key: "showAssistant", icon: "chat", doneText: "นำผู้ช่วย AI ออกจากหน้าแล้ว" },
  voice: { key: "showVoiceAi", icon: "mic", doneText: "นำ Voice AI ออกจากหน้าแล้ว" },
};

export default function AppDock() {
  const t = useT();
  const { pathname } = useLocation();
  const { settings, set } = useSettings();
  /* โหมดจัดเลย์เอาต์มีแถบลอยของตัวเองอยู่ตรงกลางล่างจอเหมือนกัน (EditingBar)
     สองแถบซ้อนกันพอดี จึงหลบให้ระหว่างจัด — เป็นโหมดชั่วคราวและมีทางออกในแถบนั้นอยู่แล้ว */
  const { editing } = useLayout();
  /* เลื่อนหน้าลงแล้วแถบหลบลงไปให้ (ผู้ใช้สั่ง 16 ก.ย. 2569) — เลื่อนขึ้นคืนมาเอง */
  const scrolledAway = useScrollHide();

  const [chat, setChat] = useState(false);
  const [voice, setVoice] = useState(false);
  /* เว็บ Farmy เต็มรูปแบบ — เปิดจากปุ่มในหัวแผงวอยซ์เท่านั้น ไม่ใช่ของที่เด้งมาก่อน */
  const [voiceSite, setVoiceSite] = useState(false);
  /* เพิ่งเอาปุ่มไหนออกไป + เหลือเวลาอีกกี่วินาที — `null` = ไม่มีแถบเรียกกลับอยู่
     เก็บเป็นก้อนเดียวเพราะแถบเรียกกลับมีได้ทีละอัน กดเอาออกอีกปุ่มก็นับใหม่ */
  const [undo, setUndo] = useState(null);

  const shown = settings.showAssistant;
  const voiceShown = settings.showVoiceAi;
  /* กำลังเปิดห้องแชทหรือป๊อบอัพ Voice AI อยู่ = ไม่หลบ
     ห้องแชทเกาะขอบบนของแถบ ถ้าแถบหายไปห้องจะลอยไปทับเนื้อหาโดยไม่มีอะไรรองรับ
     และปุ่มพับห้องก็หายไปพร้อมกัน */
  const tucked = scrolledAway && !chat && !voice;
  const hidden = editing || HIDE_ON.includes(pathname);
  /* ระบบที่ยังไม่ได้ตั้ง `url` ใน data/linkedSystems.js จะไม่ขึ้นบนแถบ */
  const voiceItem = LINKED_SYSTEMS.find((system) => system.id === "voice-ai" && system.url);
  const hasVoice = Boolean(voiceItem) && voiceShown;
  /* เอาออกทั้งสองปุ่มแล้ว = ไม่ต้องมีแถบ ไม่งั้นเหลือพิลล์เปล่า ๆ ลอยอยู่กลางล่างจอ */
  const empty = !shown && !hasVoice;

  /* เปิดจากเมนู "Chatbot AI" ในแถบซ้าย (T1.247) — คนกดเมนูตั้งใจจะคุยแน่ ๆ
     ถ้าเคยกดกากบาทเอาผู้ช่วยออกไว้ ให้เรียกกลับมาด้วยเลย ไม่งั้นกดเมนูแล้วไม่เกิดอะไรขึ้น */
  useEffect(() => {
    const onOpen = () => {
      set("showAssistant", true);
      setUndo(null);
      setVoice(false);
      setChat(true);
    };
    window.addEventListener(OPEN_ASSISTANT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, onOpen);
  }, [set]);

  /* นับถอยหลังแถบเรียกกลับ — หมดเวลาแล้วหายไปเอง */
  useEffect(() => {
    if (!undo) return undefined;
    if (undo.left <= 0) {
      setUndo(null);
      return undefined;
    }
    const timer = setTimeout(() => setUndo((u) => (u ? { ...u, left: u.left - 1 } : null)), 1000);
    return () => clearTimeout(timer);
  }, [undo]);

  /* เอาปุ่มออกจากแถบ — ปิดของที่ปุ่มนั้นเปิดค้างไว้ด้วย
     ไม่งั้นกดกากบาทตอนห้องแชทกางอยู่ ห้องจะค้างบนจอโดยไม่มีปุ่มพับ */
  /* เปิดได้ทีละแผง — สองแผงซ้อนกันในกองเดียวสูงเกินจอ (วัดแล้วล้นขึ้นไปบนสุด 210px)
     และสองห้องสนทนาเปิดพร้อมกันก็ไม่มีใครใช้จริง */
  const toggleChat = () => {
    const next = !chat;
    setChat(next);
    if (next) setVoice(false);
  };

  const toggleVoice = () => {
    const next = !voice;
    setVoice(next);
    if (next) setChat(false);
  };

  const remove = (id) => {
    if (id === "assistant") setChat(false);
    if (id === "voice") setVoice(false);
    set(REMOVABLE[id].key, false);
    setUndo({ id, left: UNDO_SECONDS });
  };

  const bringBack = () => {
    if (undo) set(REMOVABLE[undo.id].key, true);
    setUndo(null);
  };

  return (
    /* กองเดียวกันทั้งหมด เรียงจากบนลงล่าง: ห้องแชท → แถบเรียกกลับ → แถบลอย
       ใครโผล่มาก็ดันของข้างบนขึ้นไปเอง ไม่มีใครต้องรู้ความสูงของใคร (ดู dock.css) */
    <div className="dock-stack">
      {/* วาดไว้ตลอด ปิดอยู่ = คืน null เอง (ดูหัวไฟล์ว่าทำไมห้ามถอดออก) */}
      <Assistant open={chat && shown && !hidden} onClose={() => setChat(false)} />
      <VoicePanel
        open={voice && hasVoice && !hidden}
        onClose={() => setVoice(false)}
        onOpenSite={() => setVoiceSite(true)}
      />
      {/* ป๊อบอัพเต็มจอ วาดผ่าน portal ไป <body> จึงไม่เกี่ยวกับกองนี้ */}
      <VoiceModal open={voiceSite} onClose={() => setVoiceSite(false)} />

      {/* เรียกปุ่มที่เพิ่งเอาออกกลับได้ทันทีถ้าเผลอกด — หลังจากนี้เปิดคืนที่หน้าตั้งค่า */}
      {!hidden && undo && (
        <div className="as-undo" role="status">
          <Icon name={REMOVABLE[undo.id].icon} size={18} aria-hidden="true" />
          <span>{t(REMOVABLE[undo.id].doneText)}</span>
          <button type="button" className="as-undo-btn" onClick={bringBack}>
            {t("เรียกกลับ")}
          </button>
        </div>
      )}

      {!hidden && !empty && (
        <div className={"dock" + (tucked ? " is-tucked" : "")} role="toolbar" aria-label={t("แถบผู้ช่วยและสั่งงานด้วยเสียง")}>
          {shown && (
            <div className="dock-slot">
              <button
                type="button"
                className={"dock-btn" + (chat ? " is-on" : "")}
                onClick={toggleChat}
                aria-expanded={chat}
                title={chat ? t("พับห้องแชท") : t("ถามผู้ช่วย AI")}
                aria-label={chat ? t("พับห้องแชท") : t("ถามผู้ช่วย AI")}
              >
                <span className="dock-icon" aria-hidden="true">
                  <Icon name={chat ? "chevron" : "chat"} size={24} />
                </span>
                <span className="dock-label">{t("ผู้ช่วย AI")}</span>
              </button>

              <button
                type="button"
                className="dock-remove"
                onClick={() => remove("assistant")}
                title={t("นำผู้ช่วยออกจากหน้า")}
                aria-label={t("นำผู้ช่วยออกจากหน้า")}
              >
                <Icon name="cross" size={13} />
              </button>
            </div>
          )}

          {hasVoice && (
            <div className="dock-slot">
              <button
                type="button"
                className={"dock-btn" + (voice ? " is-on" : "")}
                onClick={toggleVoice}
                aria-expanded={voice}
                title={`${voiceItem.name} · ${t(voiceItem.description)} · ${t("ทำโดย")} ${t(voiceItem.owner)}`}
                aria-label={`${voiceItem.name} — ${t(voiceItem.thaiName)}`}
              >
                <span className="dock-icon is-link" aria-hidden="true">
                  <Icon name={voiceItem.icon} size={22} />
                </span>
                <span className="dock-label">{voiceItem.name}</span>
              </button>

              {/* กากบาทชุดเดียวกับของผู้ช่วย (ผู้ใช้สั่ง 16 ก.ย. 2569) — เอาออกทีละระบบได้ */}
              <button
                type="button"
                className="dock-remove"
                onClick={() => remove("voice")}
                title={t("นำ Voice AI ออกจากหน้า")}
                aria-label={t("นำ Voice AI ออกจากหน้า")}
              >
                <Icon name="cross" size={13} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
