/**
 * กรอบเว็บ Voice AI (Farmy ของอีกทีม) — ใช้ร่วมกันสองที่ (T1.248)
 *   · หน้า /dashboard/voice (pages/Voice.jsx)
 *   · ป๊อบอัพจากปุ่มไมค์บนแถบบน (VoiceModal.jsx)
 * แยกออกมาเพื่อให้กติกาของกรอบอยู่ที่เดียว — ถ้าเขียนซ้ำสองที่ วันหนึ่ง `allow` หรือ `sandbox`
 * ของสองที่จะไม่ตรงกันโดยไม่มีใครรู้ แล้วไมค์ใช้ได้ที่หนึ่งแต่อีกที่ไม่ได้
 *
 * `sandbox` ไม่มี `allow-top-navigation` โดยตั้งใจ — เว็บในกรอบพาทั้งแดชบอร์ดไปที่อื่นไม่ได้
 * ส่วน `allow` เปิดไมโครโฟนให้ ไม่งั้นเบราว์เซอร์บล็อกไมค์ในกรอบเงียบ ๆ
 * ข้อความรอระหว่างโหลด — โฮสต์ฟรีของ Render หลับเมื่อไม่มีคนใช้ ครั้งแรกของวันรอ 30–60 วินาที
 *
 * **เต็มจอ (T1.250)** — ผู้ห่อ (ป๊อบอัพ/หน้า) ถือ `useFullscreen` แล้วส่ง `stageRef` + `fullscreen` มา
 * สิ่งที่ขยายคือ `.vo-stage` (กรอบเว็บอย่างเดียว) ปุ่ม "ออกจากเต็มจอ" จึงต้องอยู่ข้างในนี้
 * ไม่งั้นพอเต็มจอแล้วปุ่มเข้า (ที่อยู่ท้ายป๊อบอัพ/หัวหน้า) มองไม่เห็น ออกได้ทางเดียวคือ Esc
 *
 * @param {{ current: HTMLElement | null }} [stageRef]
 * @param {{ active: boolean, pseudo: boolean, exit: () => void }} [fullscreen]
 */
import { useState } from "react";
import Icon from "../ui/Icon.jsx";
import { VOICE } from "./voiceSystem.js";
import { useT } from "../../lib/i18n/useT.js";
import "./voice.css";

export default function VoiceFrame({ stageRef, fullscreen }) {
  const t = useT();
  const [loaded, setLoaded] = useState(false);
  const url = VOICE?.url ?? "";

  if (!url) {
    return (
      <p className="vo-empty">
        <Icon name="mic" size={22} aria-hidden="true" />
        {t(VOICE?.note ?? "กำลังพัฒนา ยังไม่เปิดให้ใช้")}
      </p>
    );
  }

  return (
    <div
      ref={stageRef}
      className={"vo-stage" + (fullscreen?.pseudo ? " is-pseudo-full" : "")}
    >
      {fullscreen?.active && (
        <button type="button" className="vo-exit-full" onClick={fullscreen.exit}>
          <Icon name="shrink" size={16} aria-hidden="true" />
          {t("ออกจากเต็มจอ")}
          <kbd>Esc</kbd>
        </button>
      )}
    <div className="vo-frame-wrap">
      {!loaded && (
        <p className="vo-loading" role="status">
          <Icon name="mic" size={22} aria-hidden="true" />
          <span>
            <b>{t("กำลังเปิด Voice AI…")}</b>
            {t("ครั้งแรกของวันอาจรอ 30–60 วินาที เพราะเซิร์ฟเวอร์ของระบบนี้พักเครื่องเมื่อไม่มีคนใช้")}
          </span>
        </p>
      )}
      <iframe
        className={"vo-frame" + (loaded ? " is-loaded" : "")}
        src={url}
        title={t("Voice AI · ระบบสั่งงานด้วยเสียง")}
        allow="microphone; autoplay; clipboard-write; fullscreen"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
      />
    </div>
    </div>
  );
}
