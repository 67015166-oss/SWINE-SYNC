/**
 * สมองของวอยซ์ — ฟัง → ตัดสินว่าใครควรตอบ → ตอบ → อ่านออกเสียง (T1.286)
 *
 * ═══ ทำไมต้องแยกออกมาเป็น hook ═══
 * เดิมโค้ดชุดนี้อยู่ใน `VoicePanel.jsx` ตัวเดียว ส่วนหน้าเต็มจอ `/dashboard/voice`
 * ไปฝัง **เว็บของทีม Farmy ทั้งเว็บผ่าน iframe** ซึ่งเข้าไปเป็น "ผู้เยี่ยมชม"
 * เขาจึงปฏิเสธคำถามเกี่ยวกับฟาร์มทั้งหมด — นั่นคืออาการ "วอยซ์ตอบไม่ตรงประเด็น"
 * ที่ผู้ใช้แจ้งมา (T1.282 แก้ได้เฉพาะฝั่งแผง หน้าเต็มจอยังเป็น iframe เหมือนเดิม)
 *
 * พอแยกสมองออกมา หน้าเต็มจอก็ใช้เส้นทางเดียวกับแผงได้ คือยิงผ่านหลังบ้านของเรา
 * ที่ล็อกอิน Farmy ด้วยบัญชีจริงแล้ว (`/api/farmy/ask`) **คำถามในฟาร์มจึงได้คำตอบจริง**
 *
 * ★ กติกาที่ห้ามละเมิด: ห้ามมีที่ไหนเขียนลำดับการตัดสินใจนี้ขึ้นมาใหม่อีก
 *   ลำดับ 1→5 ในไฟล์นี้ต้องตรงกับ `ask()` ของห้องแชท (components/assistant/Assistant.jsx)
 *   สองที่นี้ตอบคำถามเดียวกันคนละอย่างเมื่อไร คนใช้จะเลิกเชื่อทั้งคู่
 *
 * หน้าตาอยู่ที่ `VoicePanel.jsx` (แผงเล็ก) และ `VoiceStage.jsx` (เต็มจอ) — คนละสกิน สมองเดียวกัน
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDictation } from "../../lib/voice/useDictation.js";
import { useSpeak } from "../../lib/voice/useSpeak.js";
import { useMicPermission } from "../../lib/voice/useMicPermission.js";
import { aiStatus, askAi, fetchNow, fetchWeather } from "../../lib/api/assistantApi.js";
import { farmyAsk, farmyStatus } from "../../lib/api/farmyVoice.js";
import { currentReadingAsk } from "../../lib/api/sensorQuestion.js";
import { nowReply } from "../../lib/api/nowReply.js";
import { weatherReply } from "../../lib/api/weatherReply.js";
import {
  answerFor,
  isOutwardQuestion,
  localOnlyTopicFor,
  navFor,
  topicIdFor,
  wantsAdvice,
} from "../assistant/answers.js";
import { weatherPlaceOutside } from "../../lib/api/thaiPlaces.js";
import { useAllFarms } from "../../lib/records/useAllFarms.js";
import { useSettings } from "../../lib/settings/useSettings.js";
import { useAuth } from "../../lib/auth/useAuth.js";
import { useLang } from "../../lib/i18n/useT.js";

/** ป้ายที่มาของคำตอบ — ข้อความชุดเดียวกับห้องแชท ไม่งั้นของอย่างเดียวกันถูกเรียกคนละชื่อ */
export const ORIGIN = {
  sensor: { icon: "spark", text: "อ่านจากเซนเซอร์ฟาร์มโดยตรง" },
  weather: { icon: "spark", text: "อากาศจริงจากบริการพยากรณ์ (Open-Meteo)" },
  farmy: { icon: "mic", text: "จากระบบวอยซ์ Farmy" },
  ai: { icon: "spark", text: "จาก AI ฟาร์ม" },
  local: { icon: "info", text: "จากข้อมูลตัวอย่างในระบบ" },
  nav: { icon: "info", text: "คำสั่งของแดชบอร์ดนี้" },
};

/**
 * @param {object} opt
 * @param {boolean} opt.active แผง/หน้านี้กำลังใช้งานอยู่ไหม — เป็น false เมื่อไร
 *                            ไมค์ เสียง และคำถามที่ค้างอยู่ต้องหยุดทันที
 *                            (หน้าเต็มจอส่ง true ตลอด เพราะไม่มีสถานะ "พับ")
 */
export function useVoiceConversation({ active = true } = {}) {
  const { lang } = useLang();
  const navigate = useNavigate();
  const { settings, comfort, set, openSettings } = useSettings();
  const { userId } = useAuth();
  const { farms: allFarms, barnsOf } = useAllFarms();

  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  /** รอ AI มาแล้วกี่วินาที — คำถามที่ต้องให้โมเดลคิดใช้เวลาเป็นนาที จอต้องไม่ดูค้าง */
  const [wait, setWait] = useState(0);

  /* ข้อความที่ถอดได้ระหว่างพูด — เก็บใน ref ด้วย เพราะตอนหยุดฟังต้องอ่านค่าล่าสุด
     ไม่ใช่ค่าที่ค้างอยู่ใน closure ของตอนที่เริ่มพูด */
  const [heard, setHeard] = useState("");
  const heardRef = useRef("");
  const takeHeard = (text) => {
    heardRef.current = text;
    setHeard(text);
  };
  const dictation = useDictation(takeHeard, lang);
  const speech = useSpeak(lang);
  /* เปิดหน้าผ่าน http ที่ไม่ใช่ localhost (เช่นเข้าจากมือถือด้วยเลข IP ของเครื่อง)
     = เบราว์เซอร์ปิดไมค์ทั้งหน้า **แก้ในหน้าเว็บไม่ได้เลย**
     จึงต้องเอาปุ่มไมค์ออกแล้วบอกเหตุผลแทน ไม่ใช่ปล่อยปุ่มที่กดแล้วขึ้น
     "เบราว์เซอร์บล็อกอยู่ กดไอคอนข้างช่องที่อยู่เว็บ" ซึ่งทำตามแล้วก็ยังใช้ไม่ได้ */
  const { state: micState } = useMicPermission();
  const micOff = micState === "insecure";

  const abortRef = useRef(null);
  const seq = useRef(0);
  const feedRef = useRef(null);
  /* AI ฝั่งโน้นใช้ `session` ผูกบทสนทนาเดียวกัน — ของแผงนี้แยกจากห้องแชท
     ไม่งั้นคำถามที่พูดกับที่พิมพ์จะไปปนกันเป็นบทสนทนาเดียว */
  const sessionRef = useRef(`voice-${Math.random().toString(36).slice(2, 10)}`);

  /* เกณฑ์ของผู้ใช้ — ต้องเป็นชุดเดียวกับที่หน้าอื่นใช้ ไม่งั้นตัวเลขจะขัดกันเอง */
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

  /* ถามหลังบ้านครั้งเดียวว่าต่อ AI จริงได้ไหม — เก็บตัว promise ไว้ ไม่ใช่เก็บผลลัพธ์
     คนที่เปิดแผงแล้วพูดทันทีจะถามมาถึงตอนที่ยังตอบไม่กลับ ถ้าตัดสินจาก state ที่ยังว่าง
     จะได้คำตอบจากข้อมูลตัวอย่างไปเงียบ ๆ ทั้งที่ AI ใช้งานได้ */
  const probeRef = useRef(null);
  const ensureAi = () => {
    probeRef.current ??= aiStatus();
    return probeRef.current;
  };
  /* ระบบวอยซ์ของอีกทีมพร้อมไหม — ถามครั้งเดียวเหมือนกัน แล้วบอกไว้บนหัวแผง
     จะได้รู้ตั้งแต่ก่อนพูดว่ากำลังคุยกับสมองตัวไหน */
  const [farmy, setFarmy] = useState(null);
  const farmyRef = useRef(null);
  const ensureFarmy = () => {
    farmyRef.current ??= farmyStatus().then((info) => {
      setFarmy(info);
      return info;
    });
    return farmyRef.current;
  };
  useEffect(() => {
    probeRef.current = null;
    farmyRef.current = null;
    setFarmy(null);
    if (userId) ensureFarmy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /* ปิดแผง = หยุดทุกอย่างทันที — ไมค์ เสียงที่กำลังพูด และคำถามที่ AI ยังคิดค้างอยู่
     (เหตุผลเดียวกับที่ป๊อบอัพเดิมถอดกรอบเว็บทิ้งตอนปิด) */
  useEffect(() => {
    if (active) return;
    /* ปิดแผงระหว่างที่ยังฟังอยู่ = ทิ้งคำถามนั้นไป ไม่ใช่ส่งตามหลังตอนแผงปิดไปแล้ว */
    cancelRef.current = true;
    dictation.stop();
    speech.stop();
    abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /* คำตอบใหม่ต้องเห็นทันทีโดยไม่ต้องเลื่อนเอง */
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log, busy]);

  const speakOn = settings.speakAnswers;

  const say = (entry) => {
    setLog((all) => [...all, entry]);
    /* อ่านออกเสียงทั้งคำตอบรวมหัวข้อย่อย — บนจอมีข้อความเดียวกันครบอยู่แล้ว
       เครื่องที่ไม่มีเสียงภาษานั้นจึงยังใช้งานได้ ไม่ได้เหลือทางเดียวคือฟัง */
    if (speakOn) speech.speak([entry.text, ...(entry.bullets ?? [])].join(" "));
  };

  const ask = async (raw) => {
    const text = String(raw ?? "").trim();
    if (!text || busy) return;
    seq.current += 1;
    const id = seq.current;
    setLog((all) => [...all, { id: `u${id}`, from: "user", text }]);

    /* ═══ 1. สั่งเปิดหน้า — ต้องมาก่อนคำถามเสมอ ═══
       ไม่งั้น "เปิดหน้าโรงเรือน" จะโดนจับเป็นคำถามแล้วได้ตัวเลขแทนที่จะพาไปหน้านั้น */
    const nav = navFor(text, ctx);
    if (nav) {
      say({ id: `b${id}`, from: "bot", origin: "nav", text: `เปิด${nav.label}ให้แล้วครับ` });
      if (nav.action === "settings") openSettings();
      else navigate(nav.to);
      return;
    }

    setBusy(true);
    setWait(0);
    try {
      const [info, farmyInfo] = await Promise.all([ensureAi(), ensureFarmy()]);

      /* ═══ 2. เรื่องที่มีแต่แดชบอร์ดนี้รู้ → ตอบก่อนใครเลย ═══
         แจ้งเตือนค้าง · เซนเซอร์ตัวไหนเงียบ · มีกี่ฟาร์ม · ถามว่าทำอะไรได้บ้าง
         **ต้องมาก่อนการอ่านค่าเซนเซอร์สด** ไม่งั้น "มีเซนเซอร์ตัวไหนไม่ส่งค่า" จะถูกจับเป็น
         "ขอค่าล่าสุด" แล้วตอบค่าของตัวที่ยังส่งอยู่กลับไป ซึ่งตรงข้ามกับที่ถาม (เจอตอนทดสอบ) */
      const outward = isOutwardQuestion(text);
      const topic = outward ? null : topicIdFor(text);
      /* กติกาอยู่ที่ `localOnlyTopicFor` ที่เดียว ใช้ร่วมกับห้องแชท (T1.282)
         เดิมสองที่เขียนเงื่อนไขเอง แล้วทางลัดนี้ลืมเช็กว่าเป็นคำถามขอความเห็นหรือเปล่า */
      if (localOnlyTopicFor(text)) {
        say({ id: `b${id}`, from: "bot", origin: "local", ...answerFor(text, ctx) });
        return;
      }

      /* ═══ 2.3 ถามอากาศของที่อื่นที่ไม่ใช่ฟาร์มเรา → ดึงจากบริการพยากรณ์ตรง ๆ ═══
         **ต้องมาก่อนการอ่านค่าเซนเซอร์สด** — เจอตอนทดสอบ (17 ก.ย. 2569):
         "อากาศกรุงเทพวันนี้เป็นยังไง" มีทั้งคำว่า "อากาศ" และ "เป็นยังไง"
         จึงถูกจับเป็น "ขอค่าล่าสุด" แล้วตอบด้วยค่าในเล้าที่กำแพงเพชรกลับไป
         ตัวกันที่มีอยู่ (`weatherPlaceOutside`) วางไว้หลังจุดนี้ จึงไม่ทันกิน

         ห้องแชทตอบคำถามนี้ถูกอยู่แล้วเพราะเช็กที่หัวเลย — ที่นี่ทำให้ตรงกัน
         **รวมถึงตัวเรียบเรียงคำตอบด้วย** (`weatherReply` ตัวเดียวกัน) ไม่งั้นสองที่
         จะตอบคำถามเดียวกันคนละแบบจากข้อมูลชุดเดียวกัน */
      const place = weatherPlaceOutside(text, info?.sources ?? []);
      if (place) {
        const w = await fetchWeather(place);
        if (w) {
          say({ id: `b${id}`, from: "bot", origin: "weather", ...weatherReply(w) });
          return;
        }
        /* หาที่นั่นไม่เจอ — ไม่ตัน ไปทางปกติต่อ (แต่ห้ามตกไปตอบด้วยเซนเซอร์ของเรา
           เพราะเขาไม่ได้ถามถึงเล้าเรา) */
      }

      /* ═══ 2.5 แค่อยากรู้ค่าตอนนี้ → ตอบจากเซนเซอร์ตรง ๆ ═══
         วัดแล้วทางนี้ 0.1 วินาที ส่วน AI ใช้ 28–150 วินาทีกับคำถามเดียวกัน
         ซึ่งนานเกินไปสำหรับการถามด้วยเสียง */
      const asked = place ? null : currentReadingAsk(text);
      if (asked) {
        const barns = await fetchNow();
        const reply = barns.length > 0 ? nowReply(barns, asked) : null;
        if (reply) {
          say({ id: `b${id}`, from: "bot", origin: "sensor", ...reply });
          return;
        }
        /* ไม่มีค่าสด หรือไม่มีเซนเซอร์วัดค่าที่ถาม → ไปทางปกติต่อ ไม่ตัน */
      }

      /* ═══ 2.7 คำถามอื่นที่ "แดชบอร์ดนี้" ตอบได้ตรงกว่า AI ตัวไหน ═══
         **ผู้ใช้แจ้งว่าตอบไม่ตรงคำถาม (17 ก.ย. 2569)** — ถาม "อาหารเหลือพอกี่วัน"
         แล้ว AI ตอบกลับมาว่า "คำถามของคุณไม่ชัดเจน โปรดระบุว่า…" เพราะมันไม่มีทางรู้
         ว่าไซโลของเราเหลือเท่าไร ส่วน `answerFor` คิดจากข้อมูลชุดเดียวกับที่หน้าจอแสดงอยู่
         ตอบได้ใน 0.1 วินาทีและตรงกับตัวเลขบนจอ — สำคัญเป็นพิเศษกับการถามด้วยเสียง
         เพราะรอ AI คิด 20–90 วินาทีแล้วได้คำตอบกว้าง ๆ คือแย่ที่สุดของทั้งสองทาง

         ตัวกันสี่ชั้นก่อนจะเชื่อว่า "เป็นเรื่องของแดชบอร์ด":
           · ไม่ใช่คำถามเรื่องนอกฟาร์ม (โรค ราคา ข่าว — `isOutwardQuestion`)
           · ไม่ได้ถามอากาศของจังหวัดอื่น (ไม่งั้น "อากาศกรุงเทพ" จะถูกตอบด้วยค่าในเล้าเรา)
           · ไม่ได้ขอความเห็น (`wantsAdvice` — "ควร" "อันตราย" "เทียบ" "แนวโน้ม")
             **ผู้ใช้แจ้งรอบสอง**: ถามอุณหภูมิแล้วได้ "ร้อนที่สุดคือ…" ทั้งที่ไม่ได้ถามว่าหลังไหนร้อนที่สุด
             คำถามเชิงความเห็นเรื่องอุณหภูมิถูกตัวกันของเซนเซอร์ปล่อยผ่านมาถูกแล้ว
             แต่มาโดนคำตอบสำเร็จรูปของเรื่องนั้นฉกไปตรงนี้แทน
           · คำที่ใช้จับต้องเข้าเรื่องใดเรื่องหนึ่งจริง ๆ */
      const localTopic = place || wantsAdvice(text) ? null : topic;
      if (localTopic) {
        say({ id: `b${id}`, from: "bot", origin: "local", ...answerFor(text, ctx) });
        return;
      }

      /* ═══ 3. สมองของระบบวอยซ์ Farmy ═══
         เป็นตัวหลักของแผงนี้ตามที่ผู้ใช้สั่ง — เขารู้เรื่องคลังความรู้ วัคซีน และเซนเซอร์
         ของฝั่งเขาที่แดชบอร์ดเราไม่มี · ตอบไม่ได้เมื่อไหร่ค่อยถอยไปใช้ AI ของ CPF */
      if (farmyInfo?.ready) {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          const history = log
            .filter((m) => m.from === "user" || m.origin === "farmy")
            .slice(-6)
            .map((m) => ({ role: m.from === "user" ? "user" : "model", text: m.text }));
          const answer = await farmyAsk(text, history, controller.signal);
          if (answer) {
            say({ id: `b${id}`, from: "bot", origin: "farmy", text: answer });
            return;
          }
        } catch (err) {
          if (err?.name === "AbortError") return;
          /* ของเขาล่ม/ช้าเกินไป — ไม่ตัน ไปทางปกติต่อ แล้วติดป้ายที่มาให้ตรงความจริง */
        }
      }

      /* ═══ 4. AI จริงของฟาร์ม (ตัวเดียวกับห้องแชท) ═══ */
      if (info?.ready) {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const history = log
          .filter((m) => m.from === "user" || m.origin === "ai")
          .map((m) => ({ role: m.from === "user" ? "user" : "assistant", content: m.text }));
        const { text: answer } = await askAi({
          messages: [...history, { role: "user", content: text }],
          session: sessionRef.current,
          user: userId,
          signal: controller.signal,
          onEvent: (ev) => {
            if (ev.type === "waiting") setWait(ev.seconds);
          },
        });
        say({ id: `b${id}`, from: "bot", origin: "ai", text: answer });
        return;
      }

      /* ═══ 5. ต่อ AI ไม่ได้ → ตอบจากข้อมูลตัวอย่างชุดเดียวกับที่หน้าอื่นใช้ ═══ */
      say({ id: `b${id}`, from: "bot", origin: "local", ...answerFor(text, ctx) });
    } catch (err) {
      /* ยกเลิกเอง (ปิดแผง/ถามใหม่) ไม่ใช่ความผิดพลาดที่ต้องพูดออกมา */
      if (err?.name === "AbortError") return;
      say({
        id: `b${id}`,
        from: "bot",
        origin: "local",
        ...answerFor(text, ctx),
      });
    } finally {
      setBusy(false);
      setWait(0);
    }
  };

  /* ---------- กดครั้งเดียวแล้วพูด กดอีกครั้งเมื่อพูดจบ ----------
     **ผู้ใช้สั่งเปลี่ยนจาก "กดค้างแล้วพูด" (17 ก.ย. 2569)** — พูดประโยคยาว ๆ ไม่ต้องค้างนิ้วไว้
     ตัวถอดเสียงตั้ง `continuous` ไว้แล้ว จึงไม่ตัดกลางประโยคตอนหยุดหายใจ
     คนเป็นคนบอกเองว่าพูดจบเมื่อไหร่ (ท่าเดียวกับโมดูลของทีม Farmy)

     **แลกมาด้วยความเสี่ยงที่ไมค์ค้างเปิดโดยไม่รู้ตัว** จึงต้องมีตัวกันครบ:
     ปุ่มเปลี่ยนรูปและข้อความชัดเจนตอนฟังอยู่ · ปิดแผงแล้วหยุดทันที ·
     เบราว์เซอร์เลิกฟังเองเมื่อไหร่ก็ส่งคำถามให้เลย ไม่ค้างเป็นข้อความที่ไม่มีใครส่ง */
  const cancelRef = useRef(false);

  const startListening = () => {
    if (busy) return;
    /* ปลุกตัวสังเคราะห์เสียงตั้งแต่ตอนที่ผู้ใช้ยังแตะปุ่มอยู่ — บางเบราว์เซอร์ยอมให้พูด
       เฉพาะเสียงที่สั่งในจังหวะที่ผู้ใช้แตะ แต่คำตอบจริงมาทีหลังหลายวินาที */
    if (speakOn) speech.prime();
    speech.stop();
    cancelRef.current = false;
    takeHeard("");
    dictation.start();
  };

  const stopListening = () => {
    if (!dictation.listening) return;
    dictation.stop();
  };

  const toggleListening = () => {
    if (dictation.listening) stopListening();
    else startListening();
  };

  /* เลิกฟังเมื่อไหร่ก็ส่งคำถามตรงนั้น — ไม่ว่าจะเพราะผู้ใช้กดปุ่มอีกครั้ง
     หรือเบราว์เซอร์เลิกฟังเอง (บางตัวหยุดเองเมื่อเงียบนานพอ)
     **ต้องดักที่ "เลิกฟัง" ไม่ใช่ที่ปุ่ม** ไม่งั้นกรณีหลังจะได้ข้อความค้างที่ไม่มีใครส่ง */
  const wasListening = useRef(false);
  useEffect(() => {
    if (dictation.listening) {
      wasListening.current = true;
      return;
    }
    if (!wasListening.current) return;
    wasListening.current = false;

    const text = heardRef.current;
    takeHeard("");
    /* ยกเลิกเอง (ปิดแผง) หรือถอดเสียงพัง = ไม่ส่ง — ข้อความผิดพลาดขึ้นบนจออยู่แล้ว
       (ตัวถอดเสียงล้าง error ทุกครั้งที่เริ่มฟังใหม่ ค่าที่เห็นตรงนี้จึงเป็นของรอบนี้เสมอ) */
    if (cancelRef.current || dictation.error) {
      cancelRef.current = false;
      return;
    }
    if (text.trim()) ask(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictation.listening]);

  /** คำตอบล่าสุด — ไว้ให้ปุ่ม "อ่านอีกครั้ง" */
  const lastAnswer = [...log].reverse().find((m) => m.from === "bot") ?? null;
  /* เปิด/ปิดการอ่านคำตอบออกเสียง — เก็บในการตั้งค่าของผู้ใช้ จึงจำข้ามหน้าและข้ามการรีเฟรช */
  const toggleSpeak = () => {
    if (speakOn) speech.stop();
    set("speakAnswers", !speakOn);
  };

  return {
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
  };
}
