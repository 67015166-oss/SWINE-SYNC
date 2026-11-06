/**
 * อ่านคำตอบออกเสียง — ใช้ `speechSynthesis` ที่มากับเบราว์เซอร์ **ไม่เพิ่ม dependency**
 * (คู่กับ `useDictation.js` ที่ทำขาเข้า: เสียง → ตัวอักษร)
 *
 * **เสียงต้องหยุดได้ทันทีเสมอ** — ปิดแผง เปลี่ยนคำถาม หรือออกจากหน้า ต้องเงียบทันที
 * ไม่งั้นเสียงจะพูดต่อทั้งที่ผู้ใช้ปิดไปแล้ว ซึ่งน่ากลัวกว่าไมค์ค้างเสียอีก
 *
 * **ตัดเป็นประโยคก่อนพูด** — คำตอบยาว ๆ ก้อนเดียวใน Chrome จะเงียบไปเองกลางคัน
 * (บั๊กเก่าของ speechSynthesis ที่หยุดเองราว 15 วินาที) ส่งเป็นก้อนสั้น ๆ เข้าคิวแทน
 *
 * **ไม่ใช่ทางเดียวที่ผู้ใช้จะรู้คำตอบ** — บนจอต้องมีข้อความเดียวกันครบเสมอ
 * เครื่องที่ไม่มีเสียงภาษาไทยจะพูดไม่ออก/สำเนียงเพี้ยน แต่ยังอ่านได้
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** ภาษาของแอป → รหัสภาษาของเสียง (ชุดเดียวกับ useDictation.js) */
const LOCALE = { th: "th-TH", en: "en-US", zh: "zh-CN" };

const synth = typeof window === "undefined" ? null : window.speechSynthesis ?? null;

export const speechSupported = Boolean(synth);

/**
 * หาเสียงที่ตรงภาษา — **ต้องเลือกเองจาก getVoices()** ไม่ใช่ตั้งแค่ `lang`
 * บางเครื่อง (โดยเฉพาะวินโดวส์ที่ไม่ได้ลงเสียงไทย) ตั้ง lang เฉย ๆ แล้วเงียบไปทั้งประโยค
 * โดยไม่มี error — ถ้าหาเสียงตรงภาษาไม่เจอ คืน null แล้วปล่อยให้อ่านด้วยเสียงตั้งต้น
 * สำเนียงเพี้ยนยังดีกว่าเงียบ (และหน้าจอบอกไว้ด้วยว่าเครื่องนี้ไม่มีเสียงภาษานั้น)
 */
function voiceFor(code) {
  const all = synth?.getVoices?.() ?? [];
  const head = code.slice(0, 2);
  return all.find((v) => v.lang === code) ?? all.find((v) => v.lang?.startsWith(head)) ?? null;
}

/** ยาวเกินนี้ตัดเป็นก้อนใหม่ — สั้นพอที่จะไม่โดนบั๊กเงียบกลางคัน */
const CHUNK = 180;

/** สั่งพูดแล้วไม่เริ่มสักทีภายในกี่มิลลิวินาที ถือว่าค้าง */
const STUCK_MS = 2500;

/** ตัดสัญลักษณ์ที่เขียนไว้ให้ "ตาอ่าน" ออกก่อน ไม่งั้นเสียงจะอ่านว่า "ดอกจัน" ตามตัว */
const clean = (text) =>
  String(text ?? "")
    .replace(/[*_#`>]/g, " ")
    .replace(/·/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * แบ่งตามจุดจบประโยคก่อน ถ้ายังยาวเกินค่อยหั่นตามช่องว่าง
 * (export ไว้ให้เทสต์เรียกได้ — **ภาษาไทยไม่ใส่จุดจบประโยค** คำตอบยาว ๆ จึงมาเป็นก้อนเดียว
 * ถ้าตัวหั่นสำรองไม่ทำงาน เสียงจะเงียบกลางคันโดยไม่มีใครรู้)
 */
export function splitForSpeech(text) {
  const out = [];
  let buf = "";
  for (const piece of text.split(/(?<=[.!?。！？\n])\s+/)) {
    if ((buf + " " + piece).trim().length <= CHUNK) {
      buf = (buf + " " + piece).trim();
      continue;
    }
    if (buf) out.push(buf);
    buf = piece;
    while (buf.length > CHUNK) {
      const cut = buf.lastIndexOf(" ", CHUNK);
      out.push(buf.slice(0, cut > 0 ? cut : CHUNK));
      buf = buf.slice(cut > 0 ? cut : CHUNK).trim();
    }
  }
  if (buf) out.push(buf);
  return out;
}

export function useSpeak(lang = "th") {
  const [speaking, setSpeaking] = useState(false);
  /** ไม่มีเสียงของภาษานี้ในเครื่อง — หน้าจอต้องบอก ไม่ใช่ปล่อยให้สงสัยว่าพังหรือเปล่า */
  const [voiceMissing, setVoiceMissing] = useState(false);
  const langRef = useRef(lang);
  langRef.current = lang;

  /* รายชื่อเสียงมาทีหลังในหลายเบราว์เซอร์ — ครั้งแรกที่เรียก getVoices() มักได้อาร์เรย์ว่าง
     ต้องรอ `voiceschanged` แล้วค่อยรู้ว่ามีเสียงภาษานั้นจริงไหม */
  useEffect(() => {
    if (!synth) return undefined;
    const check = () => setVoiceMissing(!voiceFor(LOCALE[langRef.current] ?? LOCALE.th));
    check();
    synth.addEventListener?.("voiceschanged", check);
    return () => synth.removeEventListener?.("voiceschanged", check);
  }, [lang]);

  /* ตัวจับเวลา "สั่งพูดแล้วไม่เริ่มสักที" — ดูคำอธิบายที่ speak() */
  const watchdog = useRef(null);
  const clearWatchdog = () => {
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = null;
  };

  const stop = useCallback(() => {
    clearWatchdog();
    synth?.cancel();
    setSpeaking(false);
  }, []);

  /* ปลุกตัวสังเคราะห์เสียง "ตอนที่ผู้ใช้กดปุ่มอยู่" — ซาฟารี (โดยเฉพาะบน iPhone) ยอมให้
     พูดได้เฉพาะเสียงที่สั่งภายในจังหวะที่ผู้ใช้แตะเท่านั้น แต่คำตอบจริงกว่าจะมาก็หลายวินาที
     ผ่านไปแล้ว ➜ ส่งเสียงเปล่า (volume 0) ตั้งแต่ตอนกด ครั้งเดียวพอ หลังจากนั้นพูดได้ตลอด */
  const primed = useRef(false);
  const prime = useCallback(() => {
    if (!synth || primed.current) return;
    primed.current = true;
    try {
      const warm = new SpeechSynthesisUtterance(" ");
      warm.volume = 0;
      synth.speak(warm);
    } catch {
      /* เครื่องที่ไม่ยอมก็ไม่เป็นไร — แค่เสียงแรกอาจไม่ออก */
    }
  }, []);

  const speak = useCallback((text) => {
    if (!synth) return;
    const body = clean(text);
    if (!body) return;

    const code = LOCALE[langRef.current] ?? LOCALE.th;
    const voice = voiceFor(code);
    const parts = splitForSpeech(body);
    let left = parts.length;
    let started = false;

    const run = () => {
      /* **ค้างแบบไม่มี error**: สั่งพูดแล้ว `speaking` เป็นจริง แต่เสียงไม่เริ่มเลย
         (เจอตอนทดสอบในแท็บที่ถูกซ่อนอยู่ — เบราว์เซอร์พักงานเสียงของหน้าที่ไม่ได้ดู)
         ถ้าปล่อยไว้ ปุ่มจะค้างเป็น "หยุดอ่าน" ตลอดกาลและสั่งอ่านใหม่ไม่ได้
         ➜ ปลุกหนึ่งครั้ง ยังไม่เริ่มอีกก็ล้างคิวทิ้งแล้วคืนปุ่มให้ผู้ใช้ */
      clearWatchdog();
      watchdog.current = setTimeout(() => {
        if (started) return;
        synth.resume?.();
        watchdog.current = setTimeout(() => {
          if (started) return;
          synth.cancel();
          setSpeaking(false);
        }, STUCK_MS);
      }, STUCK_MS);

      /* บั๊กเก่าของ Chrome: ปล่อยทิ้งไว้นาน ๆ ตัวสังเคราะห์เสียงจะค้างอยู่ในสถานะ "พัก"
         แล้ว speak() ถัดไปเงียบสนิทโดยไม่มี error — ปลุกก่อนทุกครั้ง ราคาถูกและไม่มีผลข้างเคียง */
      synth.resume?.();
      for (const part of parts) {
        const say = new SpeechSynthesisUtterance(part);
        say.lang = code;
        if (voice) say.voice = voice;
        say.onstart = () => {
          started = true;
          clearWatchdog();
        };
        const done = () => {
          left -= 1;
          if (left <= 0) setSpeaking(false);
        };
        say.onend = done;
        say.onerror = done;
        synth.speak(say);
      }
    };

    setSpeaking(true);

    /* ของเก่ายังพูดค้างอยู่ = ทิ้งทั้งคิว ไม่ใช่ต่อท้าย — คำตอบใหม่มาแล้ว
       คำตอบเก่าไม่มีประโยชน์ และสองเสียงซ้อนกันฟังไม่รู้เรื่อง

       **cancel() แล้วต่อด้วย speak() ในจังหวะเดียวกัน ก้อนใหม่จะหายไปเฉย ๆ ใน Chrome**
       จึงต้องยกเลิกก่อนแล้วค่อยสั่งพูดในรอบถัดไป และยกเลิกเฉพาะตอนที่มีอะไรค้างจริง */
    if (synth.speaking || synth.pending) {
      synth.cancel();
      setTimeout(run, 60);
      return;
    }
    run();
  }, []);

  /* ออกจากแผง/ออกจากแอป = เงียบทันที */
  useEffect(
    () => () => {
      if (watchdog.current) clearTimeout(watchdog.current);
      synth?.cancel();
    },
    [],
  );

  return { supported: speechSupported, speaking, voiceMissing, speak, stop, prime };
}
