/**
 * พูดแล้วกลายเป็นข้อความ — ใช้ Web Speech API ที่มากับเบราว์เซอร์ **ไม่เพิ่ม dependency**
 *
 * **นี่คนละเรื่องกับ "Voice AI" ของทีมอื่น** (ปุ่มวงกลมในหน้าภาพรวม) ตัวนั้นเป็นแอปแยก
 * ที่รันคนละที่และตอบเองได้ ส่วนตัวนี้แค่แปลงเสียงเป็นตัวอักษรลงช่องพิมพ์ของผู้ช่วย AI
 * ในแดชบอร์ดนี้ แล้วให้ผู้ใช้กดส่งเอง — เร็วกว่าพิมพ์ แต่ยังเป็นการถามผู้ช่วยตัวเดิม
 *
 * **รองรับเฉพาะบางเบราว์เซอร์** (Chrome · Edge · Safari) — Firefox ยังไม่มี
 * `supported` จึงเป็น false ที่นั่น และหน้าจอต้องซ่อนปุ่มทิ้ง ไม่ใช่โชว์ปุ่มที่กดแล้วเงียบ
 *
 * **กดครั้งเดียวแล้วพูด กดอีกครั้งเมื่อพูดจบ** (ผู้ใช้สั่งเปลี่ยน 17 ก.ย. 2569 · เดิมเป็นกดค้าง)
 * ตัวฮุกนี้ไม่ได้กำหนดท่ากด — คนเรียกเป็นคนสั่ง start/stop เอง
 * ท่ากดครั้งเดียวไม่มีจังหวะ "ปล่อยนิ้ว" มาปิดไมค์ให้ **คนเรียกจึงต้องปิดเองทุกทางออก**
 * (ปิดแผง · พับห้องแชท · ถอดคอมโพเนนต์) ไม่งั้นไมค์ค้างเปิดโดยไม่มีใครรู้
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** ตัวที่เบราว์เซอร์มีให้ — Safari กับ Chrome รุ่นเก่ายังใช้ชื่อที่มี prefix */
const Recognition =
  typeof window === "undefined"
    ? null
    : window.SpeechRecognition || window.webkitSpeechRecognition || null;

export const dictationSupported = Boolean(Recognition);

/** ภาษาของแอป → รหัสภาษาที่ตัวถอดเสียงเข้าใจ */
const LOCALE = { th: "th-TH", en: "en-US", zh: "zh-CN" };

/**
 * @param {(text: string) => void} onText เรียกทุกครั้งที่ได้ข้อความใหม่ (ระหว่างพูดก็เรียก)
 * @param {string} lang ภาษาของแอป ("th" | "en" | "zh")
 */
export function useDictation(onText, lang = "th") {
  const [listening, setListening] = useState(false);
  /** ข้อผิดพลาดล่าสุดเป็นรหัสของ Web Speech API เช่น "not-allowed" (ไม่อนุญาตไมค์) */
  const [error, setError] = useState(null);
  const ref = useRef(null);
  /* เก็บ callback ล่าสุดไว้ใน ref — ตัวถอดเสียงถูกสร้างครั้งเดียว ถ้าอ่าน onText
     จาก closure ตอนสร้าง มันจะค้างอยู่กับ state รอบแรกตลอดไป */
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    if (!Recognition) return undefined;
    const rec = new Recognition();
    rec.continuous = true;
    /* ส่งผลลัพธ์ระหว่างพูดด้วย — ไม่งั้นจอนิ่งจนกว่าจะพูดจบ ซึ่งดูเหมือนค้าง */
    rec.interimResults = true;
    rec.lang = LOCALE[lang] ?? LOCALE.th;

    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i += 1) text += e.results[i][0].transcript;
      onTextRef.current(text);
    };
    /* "aborted" เกิดตอนเราสั่งหยุดเอง ไม่ใช่ความผิดพลาดที่ต้องบอกผู้ใช้ */
    rec.onerror = (e) => {
      if (e.error !== "aborted") setError(e.error);
      setListening(false);
    };
    rec.onend = () => setListening(false);

    ref.current = rec;
    return () => {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        /* ปิดไปแล้วก็ไม่เป็นไร */
      }
      ref.current = null;
    };
  }, [lang]);

  const start = useCallback(() => {
    if (!ref.current || listening) return;
    setError(null);
    try {
      ref.current.start();
      setListening(true);
    } catch {
      /* เรียก start() ซ้อนตอนยังไม่ปิดสนิทจะ throw — ถือว่ายังฟังอยู่ ไม่ต้องทำอะไร */
    }
  }, [listening]);

  const stop = useCallback(() => {
    if (!ref.current) return;
    try {
      ref.current.stop();
    } catch {
      /* หยุดไปแล้วก็ไม่เป็นไร */
    }
    setListening(false);
  }, []);

  return { supported: dictationSupported, listening, error, start, stop };
}
