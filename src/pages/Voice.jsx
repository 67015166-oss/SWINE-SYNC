/**
 * หน้า Voice AI — /dashboard/voice
 *
 * ฝังเว็บ Voice AI (Farmy) ของอีกทีมไว้ในแดชบอร์ด ผู้ใช้สั่ง 14 ก.ย. 2569 (T1.243)
 * เดิมปุ่มไมค์เปิดเว็บนั้นในแท็บใหม่ ผู้ใช้อยากให้อยู่ในแดชบอร์ดต่อ ไม่ต้องสลับแท็บ
 *
 * ═══ 29 ก.ย. 2569: เลิกฝัง iframe แล้ว (T1.286) ═══
 * เดิมหน้านี้ฝัง **เว็บของ Farmy ทั้งเว็บ** ซึ่งเข้าไปเป็น "ผู้เยี่ยมชม"
 * เขาจึงปฏิเสธคำถามเกี่ยวกับฟาร์มทั้งหมด — คือต้นเหตุของ "วอยซ์ตอบไม่ตรงประเด็น"
 * ตอนนี้ใช้ `VoiceStage` ซึ่งใช้สมองตัวเดียวกับแผงเล็ก คือยิงผ่านหลังบ้านของเรา
 * ที่ล็อกอิน Farmy ด้วยบัญชีจริงแล้ว **คำถามในฟาร์มจึงได้คำตอบจริง**
 * และได้ของที่ iframe ให้ไม่ได้ด้วย: ค่าเซนเซอร์ของเรา · คำสั่ง "เปิดหน้า…" · ป้ายบอกที่มา
 *
 * ปุ่มบนหัวหน้ายังเปิดเว็บเต็มรูปแบบของเขาได้อยู่ — ระบบของอีกทีมไม่ได้หายไปไหน
 * แค่ไม่ใช่สิ่งที่เห็นเป็นอย่างแรกอีกต่อไป
 *
 * (ไมค์ใช้ได้เฉพาะหน้าที่เปิดผ่าน https หรือ localhost — เปิดผ่าน http://IP ในวงแลน
 *  เบราว์เซอร์ไม่ให้ใช้ไมค์เลย จึงขึ้นป้ายบอกทางถอยไว้)
 */
import PageHeader from "../components/ui/PageHeader.jsx";
import PageBoard, { Block } from "../components/board/PageBoard.jsx";
import Card from "../components/ui/Card.jsx";
import Icon from "../components/ui/Icon.jsx";
import VoiceStage from "../components/voice/VoiceStage.jsx";
import { VOICE } from "../components/voice/voiceSystem.js";
import { useT } from "../lib/i18n/useT.js";
import "./Voice.css";

export default function Voice() {
  const t = useT();
  const url = VOICE?.url ?? "";

  return (
    <>
      <PageHeader
        title={t("Voice AI · ระบบสั่งงานด้วยเสียง")}
        subtitle={t("สั่งงานและถามข้อมูลด้วยเสียงพูด · สมองจาก{owner}", {
          owner: t(VOICE?.owner ?? ""),
        })}
        action={
          /* ทางเข้าเว็บเต็มรูปแบบของทีม Farmy — ที่นั่นมีแดชบอร์ดและคลังความรู้ของเขา
             ซึ่งเราไม่ได้เอามาด้วย เปิดแท็บใหม่เพราะเป็นคนละระบบกัน ไม่ใช่ส่วนหนึ่งของหน้านี้ */
          url ? (
            <a className="vo-newtab" href={url} target="_blank" rel="noreferrer">
              <Icon name="expand" size={18} aria-hidden="true" />
              {t("เปิดเว็บ Voice AI เต็มรูปแบบ")}
            </a>
          ) : null
        }
      />

      <PageBoard boardId="voice">
        <Block id="app" label={t("Voice AI")}>
          <Card className="vo-card">
            <VoiceStage />
          </Card>
        </Block>
      </PageBoard>
    </>
  );
}
