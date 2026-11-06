/**
 * สมองของผู้ช่วย AI — จับคำในคำถามแล้วตอบด้วย "ข้อมูลจริงในระบบ"
 *
 * ตัวนี้ **ไม่ใช่โมเดลภาษา** และไม่ได้เรียก API ที่ไหนทั้งสิ้น — เป็นชุดกติกาที่อ่านจาก
 * data/mock/ ชุดเดียวกับที่ทุกหน้าใช้ แล้วประกอบเป็นประโยคไทย จึงตอบได้เฉพาะเรื่องที่
 * แดชบอร์ดมีข้อมูลอยู่จริง และตัวเลขที่ตอบต้องตรงกับหน้าที่มันชี้ไปเสมอ
 * (ตรงนี้สำคัญ: เกณฑ์ตัดสินสถานะต้องรับมาจากหน้าตั้งค่า ไม่ใช่ค่าคงที่ในไฟล์นี้
 *  ไม่งั้นคำตอบจะขัดกับตัวเลขบนหน้าจอทันทีที่ผู้ใช้ไปแก้เกณฑ์ — เคยเป็นบั๊กมาแล้ว T1.65)
 *
 * เมื่อต่อ API จริง: แทนที่ answerFor() ด้วยการเรียกโมเดล โดยคงรูปผลลัพธ์เดิมไว้
 * ({ text, bullets, to, toLabel }) ตัวหน้าจอจะไม่ต้องแก้เลย
 */
import { farms, summarizeFarms } from "../../data/mock/farms.js";
import { getFarmBarns } from "../../data/mock/barnsByFarm.js";
import { BARNS_HOME } from "../../lib/theme/themes.js";
import { allAlerts, ALERT_LEVELS } from "../../data/mock/alerts.js";
import { readingStatus, thiOf, thiLevel } from "../../data/mock/climate.js";
import { feedDaily, feedStock, batches } from "../../data/mock/feed.js";
import { financeSummary } from "../../data/mock/finance.js";
import { herdSummary, mortalityRate } from "../../data/mock/herd.js";
import { formatNumber, formatNumber1, formatBaht } from "../../lib/format.js";
import {
  bestMatch,
  includesLoose,
  matchesAny,
  matchesAnyExact,
} from "../../lib/text/match.js";

/**
 * โรงเรือนทุกหลังของทุกฟาร์ม พร้อมชื่อฟาร์มติดมาด้วย
 * รับขอบเขตมาจากหน้าจอ (useAllFarms) เพื่อให้นับฟาร์มที่ผู้ใช้เพิ่มเองด้วย —
 * ไม่งั้นผู้ช่วยจะตอบคนละจำนวนกับที่เห็นบนหน้าจอ
 */
const allBarns = (ctx) =>
  farmsOf(ctx).flatMap((farm) =>
    barnsOfFarm(ctx, farm.id).map((barn) => ({
      ...barn,
      farmId: farm.id,
      farmName: farm.name,
    }))
  );

/** ขอบเขตข้อมูล — ไม่ได้ส่งมาก็ถอยไปใช้ข้อมูลระบบอย่างเดียว */
const farmsOf = (ctx) => ctx?.farms ?? farms;
const barnsOfFarm = (ctx, farmId) =>
  ctx?.barnsOf ? ctx.barnsOf(farmId) : getFarmBarns(farmId) ?? [];

const levelLabel = (id) => ALERT_LEVELS.find((l) => l.id === id)?.label ?? id;

/**
 * คำที่บอกว่าคำถามนี้ถามหา "อันไหนที่สุด" ไม่ใช่ถามค่าตอนนี้
 * ใช้แบบไม่เผื่อพิมพ์ผิด — ติดเกินไปแปลว่าคำถามธรรมดาจะได้คำตอบเรื่องหลังที่ร้อนที่สุดกลับไป
 * ซึ่งเป็นบั๊กที่ผู้ใช้แจ้งมาพอดี
 */
const SUPERLATIVE_WORDS = [
  "ที่สุด", "สูงสุด", "ต่ำสุด", "มากสุด", "น้อยสุด",
  "หลังไหน", "โรงเรือนไหน", "ฟาร์มไหน", "ตัวไหน", "ที่ไหน", "อันไหน",
];

/**
 * หัวข้อที่ตอบได้ — เรียงตามลำดับที่ตรวจ (อันแรกที่คำตรงชนะ)
 * `chip` = ข้อความบนปุ่มคำถามด่วน · `words` = คำที่ถือว่าถามเรื่องนี้
 */
export const TOPICS = [
  {
    id: "alerts",
    chip: "มีแจ้งเตือนอะไรค้างอยู่",
    words: ["แจ้งเตือน", "เตือน", "alert", "ปัญหา", "ผิดปกติ", "เร่งด่วน", "วิกฤต"],
    answer: ({ limits }) => {
      const list = allAlerts(limits);
      const critical = list.filter((a) => a.level === "critical");
      const top = [...list]
        .sort((a, b) => ALERT_LEVELS.findIndex((l) => l.id === a.level) - ALERT_LEVELS.findIndex((l) => l.id === b.level))
        .slice(0, 3);
      return {
        text:
          list.length === 0
            ? "ตอนนี้ไม่มีการแจ้งเตือนค้างอยู่เลยครับ"
            : `ตอนนี้มีแจ้งเตือนค้างอยู่ ${formatNumber(list.length)} รายการ เป็นระดับวิกฤต ${formatNumber(critical.length)} รายการ เรื่องที่ควรดูก่อน:`,
        bullets: top.map((a) => `${a.title} · ${a.barnName} ${a.farmName} (${levelLabel(a.level)})`),
        to: "/dashboard/alerts",
        toLabel: "เปิดศูนย์การแจ้งเตือน",
      };
    },
  },
  {
    id: "climate",
    chip: "โรงเรือนไหนร้อนที่สุด",
    words: ["อุณหภูมิ", "ร้อน", "เย็น", "ความชื้น", "องศา", "อากาศ", "thi", "เครียด"],
    /**
     * **ต้องตอบตามที่ถาม ไม่ใช่ตอบคำถามที่อยู่บนปุ่มลัด** (ผู้ใช้แจ้ง 17 ก.ย. 2569)
     * ถาม "อุณหภูมิเท่าไหร่" แล้วได้ "ร้อนที่สุดคือ A2 … องศา" กลับไป ทั้งที่ไม่ได้ถามว่าหลังไหนร้อนที่สุด
     * — คำตอบไม่ผิดข้อเท็จจริง แต่ไม่ใช่คำตอบของคำถามนั้น ซึ่งแย่กว่าตอบว่าไม่รู้
     * เพราะผู้ใช้ต้องมานั่งแปลเองว่าตกลงตอบคำถามเขาหรือเปล่า
     *
     * ➜ ดูจากคำถามก่อนว่าถามหา "หลังไหนที่สุด" หรือถามค่าตอนนี้ แล้วค่อยเลือกรูปคำตอบ
     * (ค่าที่ใช้ยังเป็นชุดเดียวกันทั้งหมด ต่างกันแค่ว่าอะไรควรอยู่บรรทัดแรก)
     */
    answer: (ctx, question = "") => {
      const { comfort } = ctx;
      const live = allBarns(ctx).filter((b) => b.status !== "offline");
      if (live.length === 0) return { text: "ยังไม่มีโรงเรือนที่ส่งค่าเซนเซอร์เข้ามาเลยครับ" };

      const byTemp = [...live].sort((a, b) => b.tempC - a.tempC);
      const hottest = byTemp[0];
      const coolest = byTemp.at(-1);
      const outOfRange = live.filter(
        (b) => readingStatus("tempC", b.tempC, comfort).tone !== "good"
      );
      const avg = live.reduce((sum, b) => sum + b.tempC, 0) / live.length;
      const avgHumidity = live.reduce((sum, b) => sum + b.humidity, 0) / live.length;
      const limitLine = `เกณฑ์ที่ตั้งไว้ ${formatNumber(comfort.tempC.min)}–${formatNumber(comfort.tempC.max)} °C · หลุดเกณฑ์ ${formatNumber(outOfRange.length)} หลัง จากที่ส่งค่าอยู่ ${formatNumber(live.length)} หลัง`;

      /* ถามหา "หลังไหน" จริง ๆ → ยกหลังนั้นขึ้นมาเป็นคำตอบ (คำถามเดิมของปุ่มลัด) */
      if (matchesAnyExact(question, SUPERLATIVE_WORDS)) {
        const cool = matchesAnyExact(question, ["เย็น", "หนาว", "ต่ำสุด", "น้อยสุด"]);
        const pick = cool ? coolest : hottest;
        const thi = thiOf(pick.tempC, pick.humidity);
        return {
          text: `${cool ? "เย็น" : "ร้อน"}ที่สุดคือ${pick.name} ของ${pick.farmName} วัดได้ ${formatNumber1(pick.tempC)} °C ความชื้น ${formatNumber(pick.humidity)}% (THI ${formatNumber(thi)} — ${thiLevel(thi).label})`,
          bullets: [`เฉลี่ยทุกโรงเรือน ${formatNumber1(avg)} °C`, limitLine],
          to: `/dashboard/climate/${pick.farmId}/${pick.id}`,
          toLabel: `ดูระบบติดตามของ${pick.name}`,
        };
      }

      /* ถามความชื้นอย่างเดียว → ขึ้นต้นด้วยความชื้น ไม่ใช่อุณหภูมิ */
      const asksHumidity = matchesAnyExact(question, ["ความชื้น", "ชื้น", "humidity"]);
      const asksTemp = matchesAnyExact(question, ["อุณหภูมิ", "องศา", "ร้อน", "เย็น", "หนาว", "temp", "thi"]);
      if (asksHumidity && !asksTemp) {
        const wettest = [...live].sort((a, b) => b.humidity - a.humidity)[0];
        return {
          text: `ความชื้นเฉลี่ยทุกโรงเรือน ${formatNumber1(avgHumidity)}% จากที่ส่งค่าอยู่ ${formatNumber(live.length)} หลัง`,
          bullets: [
            `ชื้นที่สุดคือ${wettest.name} ของ${wettest.farmName} ${formatNumber(wettest.humidity)}%`,
            `อุณหภูมิเฉลี่ย ${formatNumber1(avg)} °C`,
          ],
          to: "/dashboard/climate",
          toLabel: "ดูสภาพแวดล้อมทุกโรงเรือน",
        };
      }

      /* ถามค่าตอนนี้/ภาพรวม → ตอบด้วยค่าเฉลี่ยกับช่วงที่วัดได้ แล้วค่อยบอกหลังที่ร้อนที่สุดเป็นรายละเอียด */
      return {
        text: `อุณหภูมิเฉลี่ยทุกโรงเรือน ${formatNumber1(avg)} °C (ต่ำสุด ${formatNumber1(coolest.tempC)} °C ถึงสูงสุด ${formatNumber1(hottest.tempC)} °C) ความชื้นเฉลี่ย ${formatNumber1(avgHumidity)}%`,
        bullets: [
          limitLine,
          `หลังที่ร้อนที่สุดตอนนี้คือ${hottest.name} ของ${hottest.farmName} ${formatNumber1(hottest.tempC)} °C`,
        ],
        to: "/dashboard/climate",
        toLabel: "ดูสภาพแวดล้อมทุกโรงเรือน",
      };
    },
  },
  {
    id: "offline",
    chip: "มีเซนเซอร์ตัวไหนไม่ส่งค่า",
    words: ["ออฟไลน์", "offline", "ไม่ส่งค่า", "เซนเซอร์", "สัญญาณ", "หลุด", "เสีย"],
    answer: (ctx) => {
      const off = allBarns(ctx).filter((b) => b.status === "offline");
      return {
        text:
          off.length === 0
            ? "เซนเซอร์ส่งค่าครบทุกโรงเรือนครับ"
            : `มีโรงเรือนที่ไม่ส่งค่าเซนเซอร์ ${formatNumber(off.length)} หลัง — ตรวจไฟและสัญญาณที่ตู้ควบคุมท้ายโรงเรือนก่อนครับ`,
        bullets: off.slice(0, 5).map((b) => `${b.name} · ${b.farmName}`),
        to: "/dashboard/climate",
        toLabel: "ดูสถานะทุกโรงเรือน",
      };
    },
  },
  {
    id: "gas",
    chip: "แอมโมเนียเกินเกณฑ์ไหม",
    words: ["แอมโมเนีย", "nh3", "ก๊าซ", "กลิ่น", "อากาศเสีย", "co2", "h2s"],
    answer: (ctx) => {
      const { limits } = ctx;
      const live = allBarns(ctx).filter((b) => b.status !== "offline" && b.nh3 != null);
      const over = live.filter((b) => b.nh3 > limits.nh3Limit).sort((a, b) => b.nh3 - a.nh3);
      /* ไม่มีโรงเรือนไหนวัดแอมโมเนียได้เลย ≠ แอมโมเนียอยู่ในเกณฑ์ — ต้องตอบว่า "ไม่รู้"
         (เซนเซอร์ก๊าซของฟาร์มจริงถูกกรองทิ้งเพราะส่งค่าที่เชื่อไม่ได้ ดู lib/sensorHealth.js
          ถ้าตอบว่าอยู่ในเกณฑ์ตรงนี้ ก็เป็นการโกหกแบบเดียวกับป้ายเขียวบนหน้าจอ) */
      if (live.length === 0) {
        return {
          text: "ตอนนี้ไม่มีโรงเรือนไหนส่งค่าแอมโมเนียที่เชื่อถือได้เลยครับ จึงยังบอกไม่ได้ว่าเกินเกณฑ์หรือไม่ — ต้องให้ช่างตรวจเซนเซอร์ก๊าซก่อน",
          to: "/dashboard/environment",
          toLabel: "เปิดระบบควบคุมสภาพแวดล้อม",
        };
      }
      return {
        text:
          over.length === 0
            ? `แอมโมเนียอยู่ในเกณฑ์ทุกโรงเรือนที่วัดได้ครับ (เกณฑ์ที่ตั้งไว้ไม่เกิน ${formatNumber(limits.nh3Limit)} ppm)`
            : `มี ${formatNumber(over.length)} โรงเรือนที่แอมโมเนียเกินเกณฑ์ ${formatNumber(limits.nh3Limit)} ppm — เร่งระบายอากาศและตักมูลออกจากร่องครับ`,
        bullets: over.slice(0, 5).map((b) => `${b.name} ${b.farmName} · ${formatNumber(b.nh3)} ppm`),
        to: "/dashboard/environment",
        toLabel: "เปิดระบบควบคุมสภาพแวดล้อม",
      };
    },
  },
  {
    id: "feed",
    chip: "อาหารเหลือพอกี่วัน",
    words: ["อาหาร", "ไซโล", "สต็อก", "สั่งของ", "feed", "fcr", "น้ำหนัก", "adg", "โต"],
    answer: () => {
      const last = feedDaily.at(-1);
      const today = Object.entries(last)
        .filter(([key]) => key !== "date")
        .reduce((sum, [, kg]) => sum + kg, 0);
      const low = [...feedStock].sort((a, b) => a.daysLeft - b.daysLeft)[0];
      const fcr = batches.reduce((sum, b) => sum + b.fcr, 0) / batches.length;
      const adg = batches.reduce((sum, b) => sum + b.adgGram, 0) / batches.length;
      return {
        text: `วันล่าสุดให้อาหารรวม ${formatNumber(today)} กก. · สูตรที่จะหมดก่อนคือ${low.formula} เหลืออีก ${formatNumber(low.daysLeft)} วัน`,
        bullets: [
          `FCR เฉลี่ยของทุกล็อต ${formatNumber1(fcr)}`,
          `น้ำหนักขึ้นเฉลี่ย ${formatNumber(adg)} กรัม/ตัว/วัน`,
        ],
        to: "/dashboard/feed",
        toLabel: "เปิดหน้าอาหาร & น้ำหนัก",
      };
    },
  },
  {
    id: "finance",
    chip: "เดือนนี้กำไรเท่าไหร่",
    /* คำต้องเฉพาะพอ — เคยใส่ "ราคา" กับ "บาท" ไว้ แล้ว "ราคาทองวันนี้" ดันได้คำตอบเรื่องกำไรฟาร์ม
       คำกว้างเกินไปอันตรายกว่าตอบไม่ได้ เพราะผู้ใช้จะนึกว่าระบบเข้าใจคำถามแล้วจริง ๆ */
    words: ["กำไร", "ขาดทุน", "รายได้", "ต้นทุน", "การเงิน", "คุ้มทุน", "ราคาหมู", "ราคาสุกร", "ราคาขาย"],
    answer: () => {
      const f = financeSummary;
      const margin = (f.profit / f.totalRevenue) * 100;
      return {
        text: `เดือนล่าสุด รายได้ ${formatBaht(f.totalRevenue)} ต้นทุน ${formatBaht(f.totalCost)} เหลือกำไร ${formatBaht(f.profit)} (อัตรากำไร ${formatNumber1(margin)}%)`,
        bullets: [
          `ต้นทุนเฉลี่ยต่อตัวที่ขาย ${formatBaht(f.costPerPigSold)}`,
          `ราคาคุ้มทุน ${formatNumber1(f.breakEvenPriceKg)} บาท/กก.`,
        ],
        to: "/dashboard/finance",
        toLabel: "เปิดหน้าการเงิน",
      };
    },
  },
  {
    id: "herd",
    chip: "อัตราการตายเป็นยังไง",
    /* "ตายกี่ตัว" กับ "อัตราตาย" ต้องอยู่ที่นี่ ไม่งั้นคำว่า "หมู" ในประโยคเดียวกัน
       จะลากไปเข้าเรื่องภาพรวมฟาร์มแทน (เจอตอนไล่คำถามจริง 2 ก.ย. 2569) */
    words: [
      "ตาย", "ตายกี่ตัว", "อัตราตาย", "ป่วย", "สุขภาพ", "ฝูง",
      "แม่พันธุ์", "ลูกสุกร", "อนุบาล", "ขุน",
    ],
    answer: () => {
      const last = mortalityRate.at(-1);
      const prev = mortalityRate.at(-2);
      const diff = prev ? last.rate - prev.rate : null;
      return {
        text: `อัตราการตายล่าสุดอยู่ที่ ${formatNumber1(last.rate)}%${
          diff == null
            ? ""
            : diff <= 0
              ? ` ลดลงจากเดือนก่อน ${formatNumber1(Math.abs(diff))}%`
              : ` เพิ่มขึ้นจากเดือนก่อน ${formatNumber1(diff)}%`
        }`,
        bullets: [
          `สุกรในฝูงรวม ${formatNumber(herdSummary.total)} ตัว`,
          `แม่พันธุ์ ${formatNumber(herdSummary.sows)} · อนุบาล ${formatNumber(herdSummary.nursery)} · ขุน ${formatNumber(herdSummary.fatteners)} ตัว`,
        ],
        to: "/dashboard/herd",
        toLabel: "เปิดหน้าฝูงสุกร",
      };
    },
  },
  {
    id: "farms",
    chip: "สรุปภาพรวมทุกฟาร์ม",
    /* ถอด "กี่ตัว" ออก — กว้างเกินไป ("หมูตายกี่ตัว" ควรเข้าเรื่องฝูงสุกร ไม่ใช่ภาพรวมฟาร์ม)
       ส่วน "กี่โรงเรือน" ยังอยู่ เพราะเจาะจงว่าถามจำนวนโรงเรือนจริง ๆ */
    words: ["ฟาร์ม", "ภาพรวม", "สรุป", "ทั้งหมด", "กี่โรงเรือน", "สุกร", "หมู"],
    answer: (ctx) => {
      const s = summarizeFarms(farmsOf(ctx));
      return {
        text: `ตอนนี้ดูแลอยู่ ${formatNumber(s.total)} ฟาร์ม รวมสุกร ${formatNumber(s.pigs)} ตัว ใน ${formatNumber(s.barns)} โรงเรือน`,
        bullets: [
          `สถานะฟาร์ม — ปกติ ${formatNumber(s.good)} · เฝ้าระวัง ${formatNumber(s.warning)} · ออฟไลน์ ${formatNumber(s.offline)}`,
          `แจ้งเตือนค้างรวม ${formatNumber(s.alerts)} รายการ`,
        ],
        to: "/dashboard/farms",
        toLabel: "เปิดหน้าฟาร์มทั้งหมด",
      };
    },
  },
  {
    id: "help",
    chip: "ถามอะไรได้บ้าง",
    words: ["ช่วย", "ทำอะไร", "ถามอะไร", "help", "คำสั่ง", "ใช้ยังไง", "สวัสดี", "หวัดดี", "hello"],
    answer: () => ({
      text: "ผมตอบจากข้อมูลที่อยู่ในแดชบอร์ดนี้ได้ครับ ลองถามเรื่องพวกนี้ดู:",
      bullets: [
        "แจ้งเตือนที่ค้างอยู่ · โรงเรือนที่ร้อนเกินเกณฑ์ · เซนเซอร์ที่ไม่ส่งค่า",
        "แอมโมเนียเกินเกณฑ์ · อาหารเหลือกี่วัน · FCR",
        "กำไร-ต้นทุนเดือนล่าสุด · อัตราการตาย · ภาพรวมทุกฟาร์ม",
      ],
    }),
  },
];

/* ============================================================
   สั่งเปิดหน้า — พิมพ์ "เปิดหน้าโรงเรือน" แล้วให้มันพาไปเลย
   ============================================================ */

/**
 * คำที่ถือว่าเป็น "คำสั่งให้พาไป" ไม่ใช่คำถาม
 *
 * ต้องมีคำพวกนี้ก่อนเสมอ ไม่งั้น "โรงเรือนไหนร้อนที่สุด" จะกลายเป็นคำสั่งเปิดหน้าโรงเรือน
 * และคำอย่าง "ดู"/"แสดง" เดี่ยว ๆ กว้างเกินไป ("อยากดูว่าโรงเรือนไหนร้อน" ก็จะโดนดักไปด้วย)
 * จึงบังคับให้มีคำว่า "หน้า" ต่อท้ายในเคสพวกนั้น
 */
const NAV_VERBS = [
  "เปิด",
  "ไปหน้า",
  "ไปที่",
  "พาไป",
  "เข้าหน้า",
  "ดูหน้า",
  "แสดงหน้า",
  "เปลี่ยนไป",
  "open ",
  "go to",
];

/**
 * หน้าที่สั่งเปิดได้ — เรียงจาก "คำเฉพาะ" ไป "คำกว้าง"
 * (ต้องให้ "ฟาร์มทั้งหมด" ชนะ "ฟาร์ม" ไม่งั้นสั่งเปิดหน้าฟาร์มทั้งหมดแล้วได้หน้าอื่น)
 */
const PAGES = [
  { to: "/dashboard", label: "ภาพรวม", words: ["ภาพรวม", "หน้าแรก", "แดชบอร์ด", "dashboard"] },
  { to: "/dashboard/alerts", label: "การแจ้งเตือน", words: ["แจ้งเตือน", "เตือน", "alert"] },
  { to: "/dashboard/environment", label: "ระบบควบคุมสภาพแวดล้อม", words: ["สภาพแวดล้อม", "สิ่งแวดล้อม", "environment"] },
  { to: "/dashboard/climate", label: "อุณหภูมิและความชื้น", words: ["อุณหภูมิ", "ความชื้น", "climate"] },
  { to: "/dashboard/feed", label: "อาหาร & น้ำหนัก", words: ["อาหาร", "น้ำหนัก", "ไซโล", "feed"] },
  { to: "/dashboard/finance", label: "การเงิน", words: ["การเงิน", "บัญชี", "กำไร", "รายได้", "finance"] },
  { to: "/dashboard/herd", label: "ฝูงสุกร", words: ["ฝูงสุกร", "ฝูง", "สุขภาพ", "herd"] },
  { to: "/dashboard/pigs", label: "จำนวนสุกร", words: ["จำนวนสุกร", "ประเภทสุกร", "จำนวนหมู"] },
  { to: "/dashboard/farms", label: "ฟาร์มทั้งหมด", words: ["ฟาร์มทั้งหมด", "ฟาร์มของฉัน", "รายชื่อฟาร์ม", "แผนที่", "farms"] },
  { to: BARNS_HOME, label: "โรงเรือน", words: ["โรงเรือน", "เล้า", "คอก", "barn"] },
  { to: "/dashboard/farms", label: "ฟาร์มทั้งหมด", words: ["ฟาร์ม", "farm"] },
  { to: "/dashboard/pigs", label: "จำนวนสุกร", words: ["สุกร", "หมู", "pig"] },
];

/** ตัดคำนำหน้าชื่อฟาร์มออก เทียบได้ทั้ง "ฟาร์มขอนแก่น" และ "ขอนแก่น" */
const bareName = (name) => name.replace(/^ฟาร์ม/, "");

/**
 * อ่านคำสั่งเปิดหน้าจากข้อความ — ไม่ใช่คำสั่งคืน null (ให้ไปเข้าทางถาม-ตอบตามปกติ)
 *
 * เจาะได้ถึงระดับฟาร์มและโรงเรือน:
 *   "เปิดหน้าโรงเรือน"              → หน้าโรงเรือน
 *   "เปิดฟาร์มขอนแก่น"              → โรงเรือนทั้งหมดของฟาร์มนั้น
 *   "เปิดโรงเรือน A1 ฟาร์มขอนแก่น"  → หน้าภายในโรงเรือนหลังนั้น
 *   "เปิดหน้าตั้งค่า"               → ป๊อบอัพตั้งค่า (ไม่ใช่เส้นทาง จึงคืน action แทน)
 *
 * @returns {{to?: string, action?: "settings", label: string}|null}
 */
export function navFor(question, ctx = null) {
  const text = String(question ?? "").toLowerCase();
  /* คำสั่ง ("เปิด" "ไปที่") เป็นตัวกัน — ต้องพิมพ์มาชัด ๆ ถึงจะนับว่าสั่งให้เปิดหน้า
     เผื่อพิมพ์ผิดตรงนี้จะกลายเป็นว่าคำถามธรรมดาโดนตีความเป็นคำสั่งแล้วเด้งเปลี่ยนหน้าทิ้ง */
  if (!matchesAnyExact(question, NAV_VERBS)) return null;

  if (matchesAny(question, ["ตั้งค่า", "settings"])) {
    return { action: "settings", label: "ตั้งค่า" };
  }

  /* ชื่อฟาร์มมาก่อน — เจาะจงกว่าชื่อหน้ารวม */
  const farm = farmsOf(ctx).find(
    (f) => includesLoose(question, f.name) || includesLoose(question, bareName(f.name))
  );
  if (farm) {
    /* มีรหัสโรงเรือนของฟาร์มนั้นด้วยไหม เช่น "A1" (ต้องระบุฟาร์มก่อน เพราะทุกฟาร์มมี A1)
       รหัสโรงเรือนสั้นมาก ("a1") ห้ามเผื่อพิมพ์ผิดเด็ดขาด ไม่งั้น a1 กับ a2 จะกลายเป็นตัวเดียวกัน */
    const barn = barnsOfFarm(ctx, farm.id).find((b) => {
      const code = b.name.replace(/^โรงเรือน\s*/, "").toLowerCase();
      return code && text.includes(code);
    });
    return barn
      ? { to: `/dashboard/farms/${farm.id}/barns/${barn.id}`, label: `${barn.name} ของ${farm.name}` }
      : { to: `/dashboard/farms/${farm.id}`, label: `โรงเรือนทั้งหมดใน${farm.name}` };
  }

  const page = bestMatch(question, PAGES, (p) => p.words);
  return page ? { to: page.to, label: page.label } : null;
}

/** ข้อความเปิดห้องแชท */
export const GREETING = {
  text: "สวัสดีครับ ผมเป็นผู้ช่วยของ SWINE SYNC ถามเรื่องฟาร์ม โรงเรือน อาหาร หรือการเงินได้เลย",
  bullets: [
    "สั่งให้เปิดหน้าก็ได้ เช่น “เปิดหน้าโรงเรือน” หรือ “เปิดฟาร์มขอนแก่น” แล้วผมจะพาไปให้ทันที",
  ],
};

/**
 * หาคำตอบของคำถามหนึ่งข้อ
 *
 * @param {string} question คำถามที่ผู้ใช้พิมพ์
 * @param {object} ctx { comfort, limits } — เกณฑ์ของผู้ใช้จากหน้าตั้งค่า
 * @returns {{text: string, bullets?: string[]|null, to?: string, toLabel?: string}}
 */
/**
 * คำถามนี้เข้าเรื่องไหนของแดชบอร์ด — คืน id ของเรื่อง หรือ null ถ้าไม่เข้าเรื่องไหนเลย
 * มีไว้ให้ผู้ช่วยเลือกทางถอยตอน AI ล่ม
 */
export function topicIdFor(question) {
  return bestMatch(question, TOPICS, (t) => t.words)?.id ?? null;
}

/**
 * เรื่องที่ **ค้นเว็บช่วยอะไรไม่ได้เลย** เพราะเป็นเรื่องของเครื่องนี้ล้วน ๆ
 * ไม่มีเว็บไหนในโลกรู้ว่าโรงเรือน B2 ของเรามีแจ้งเตือนค้างกี่อัน
 *
 * **ทำไมต้องระบุเป็นรายการตรง ๆ แทนที่จะเดาจากคำ** เพราะคำที่ใช้จับเรื่องมันกว้างเกิน
 * จะเอามาตัดสินใจ — เรื่อง `finance` มีคำว่า "ราคาหมู" อยู่ในรายการ ทั้งที่มันตอบเรื่อง
 * กำไรขาดทุนของฟาร์มเรา ไม่ใช่ราคาตลาด พอถามว่า "ราคาสุกรมีชีวิตวันนี้กิโลละเท่าไร"
 * ระบบจึงตอบงบการเงินของฟาร์มกลับไป แล้วไม่ยอมค้นเว็บให้เพราะคิดว่าตอบได้แล้ว
 * ส่วนเรื่อง `farms` ก็มีคำว่า "หมู" กับ "สุกร" ซึ่งติดแทบทุกคำถามในแดชบอร์ดหมู
 *
 * ➜ เรื่องที่อยู่นอกรายการนี้ = ตอบจากในเครื่องได้ **และ** ค้นเว็บมาเสริมด้วย
 *   ผู้ใช้ได้ทั้งตัวเลขฟาร์มตัวเองและข้อมูลข้างนอก แล้วเลือกเองว่าต้องการอันไหน
 */
export const LOCAL_ONLY_TOPICS = ["alerts", "offline", "help", "farms"];

/**
 * คำที่บอกว่า **เรื่องนี้อยู่นอกแดชบอร์ดแน่นอน** ไม่ว่าจะจับเข้าเรื่องไหนก็ตาม
 *
 * **ทำไมต้องมีตัวคร่อมแบบนี้** เพราะคำที่ใช้จับเรื่องกว้างเกินไป — เรื่อง `farms`
 * มีคำว่า "สุกร" กับ "หมู" อยู่ในรายการ ซึ่งติดแทบทุกคำถามในแดชบอร์ดหมู
 * เจอของจริงตอน AI ล่ม: ถาม "โรคสุกรที่ควรระวังช่วงนี้" แล้วได้จำนวนฟาร์มกลับมา
 * และเพราะ `farms` อยู่ในรายการข้างบน มันเลยไม่ยอมค้นเว็บให้ด้วย
 * ทั้งที่เป็นคำถามที่ค้นเว็บตอบได้ดีที่สุด
 *
 * เจอคำพวกนี้ = ข้ามคำตอบในเครื่องไปเลย ค้นเว็บอย่างเดียว
 * เพราะแดชบอร์ดไม่มีข้อมูลเรื่องพวกนี้อยู่แล้ว ตอบไปก็ได้แต่ของที่ไม่ตรงคำถาม
 */
const OUTWARD_WORDS = [
  "โรค", "วัคซีน", "ระบาด", "เชื้อ", "ยา", "รักษา",
  "ราคา", "ตลาด", "ส่งออก", "นำเข้า", "ข่าว",
  "กฎหมาย", "มาตรฐาน", "ใบอนุญาต", "ภาษี",
  /* ── ความรู้เรื่องตัวสัตว์ (เพิ่ม 24 ก.ย. 2569 · T1.282) ──
     แดชบอร์ดนี้เก็บ "จำนวนและสถานะ" ของหมู ไม่ได้เก็บ "ความรู้เรื่องหมู"
     ทดสอบแล้วเจอว่า "หมูสายพันธุ์ดูร็อคเลี้ยงยังไง" ถูกจับเป็นเรื่อง `farms`
     แล้วตอบด้วยจำนวนฟาร์มกลับไป · "หมูป่วยกี่ตัว" ก็เช่นกัน ทั้งที่บันทึกหมูป่วย
     อยู่ฝั่ง Farmy ไม่ได้อยู่กับเรา
     "พันธุ์" ตัวเดียวครอบทั้ง สายพันธุ์ · ผสมพันธุ์ · พันธุ์หมู */
  "พันธุ์", "ป่วย", "อาการ", "ท้องเสีย",
];

/**
 * เรื่องที่อยู่ใน `LOCAL_ONLY_TOPICS` แต่ **คำที่ใช้จับกว้างเกินไป**
 *
 * `farms` มีคำว่า "หมู"/"สุกร" ซึ่งติดแทบทุกประโยคในแดชบอร์ดหมู คำถามเชิงความรู้
 * หรือเชิงความเห็นจึงหลุดเข้ามาแล้วถูกตอบด้วยสถิติฟาร์ม
 * ส่วน `alerts` · `offline` · `help` คำจับแคบและเป็นเรื่องของเครื่องนี้แท้ ๆ
 * **ห้ามเอามาใส่ที่นี่** ไม่งั้น "ควรดูแจ้งเตือนไหนก่อน" จะถูกโยนไปให้ AI ที่ไม่รู้จักเหตุของเรา
 */
const BROAD_LOCAL_TOPICS = ["farms"];

/**
 * เรื่องนี้เป็นของ "เครื่องนี้เท่านั้น" จริงไหม — ใช้ตัดสินว่าจะตอบเองก่อนถาม AI หรือเปล่า
 *
 * **ต้องมีที่เดียวและใช้ร่วมกันทั้งห้องแชทและแผงวอยซ์**
 * ก่อนหน้านี้สองที่เขียนเงื่อนไขของตัวเอง แล้วทางลัดนี้ลืมเช็ก `wantsAdvice`
 * ทั้งที่ทางสายล่างในไฟล์เดียวกันเช็ก ผลคือ "ทำไมหมูถึงไอ" (มีคำว่า "ทำไม")
 * ถูกทางลัดฉกไปตอบด้วยจำนวนฟาร์ม ส่วนคำถามคล้าย ๆ กันที่ไม่โดนทางลัดกลับตอบถูก
 * — อาการ "ตอบไม่ตรงประเด็น" ที่ผู้ใช้แจ้ง 24 ก.ย. 2569
 *
 * @returns {string|null} id ของเรื่อง ถ้าควรตอบจากในเครื่องเท่านั้น · null = ปล่อยไป AI
 */
export function localOnlyTopicFor(question) {
  if (isOutwardQuestion(question)) return null;
  const topic = topicIdFor(question);
  if (!topic || !LOCAL_ONLY_TOPICS.includes(topic)) return null;
  /* เรื่องที่คำจับกว้าง ต้องไม่ฉกคำถามเชิงความเห็น/คำอธิบายไปตอบเอง */
  if (BROAD_LOCAL_TOPICS.includes(topic) && wantsAdvice(question)) return null;
  return topic;
}

/** คำถามนี้เป็นเรื่องนอกแดชบอร์ดชัด ๆ หรือเปล่า */
export function isOutwardQuestion(question) {
  /* ตัวกัน — ใช้แบบไม่เผื่อพิมพ์ผิด เพราะติดเกินไปแปลว่าคำถามที่ตอบได้เองอยู่แล้ว
     จะถูกโยนไปค้นเว็บทิ้ง ๆ ขว้าง ๆ (ดูเหตุผลเต็มใน lib/text/match.js) */
  return matchesAnyExact(question, OUTWARD_WORDS);
}

/**
 * คำที่บอกว่า **อยากได้ความเห็น ไม่ใช่ตัวเลขของเรา** — ตรงนี้ AI เก่งกว่าชุดกติกาในไฟล์นี้มาก
 *
 * `lib/api/sensorQuestion.js` มีตัวกันแบบเดียวกันอยู่แล้ว (`WANTS_THINKING`) ที่ตั้งใจไม่ให้
 * "อุณหภูมิเท่าไรถึงจะอันตรายกับหมู" ถูกตอบด้วยเลข 26.7 °C — แต่พอ T1.271 ให้แดชบอร์ด
 * ตอบเรื่องของตัวเองก่อน AI คำถามที่ตัวกันนั้นปล่อยผ่านกลับถูกคำตอบสำเร็จรูปของเรื่องนั้นฉกไปแทน
 * (ผู้ใช้แจ้ง: ถามอุณหภูมิ ได้ "ร้อนที่สุดคือ…" กลับมา) ➜ ต้องมีตัวกันที่ทางนี้ด้วย
 *
 * **ไม่ใช่รายการเดียวกันเป๊ะกับ `WANTS_THINKING`** — ที่นั่นกันคำว่า "อาหาร" กับ "ราคา" ไว้ด้วย
 * เพราะเป็นตัวกันของ "การอ่านค่าเซนเซอร์" โดยเฉพาะ ส่วนที่นี่ "อาหารเหลือพอกี่วัน"
 * คือคำถามที่แดชบอร์ดต้องตอบเอง (เรื่องที่ผู้ใช้แจ้งมารอบก่อนหน้า)
 */
const ADVICE_WORDS = [
  "ควร", "แนะนำ", "ทำไม", "เพราะ", "วิเคราะห์", "เหมาะ", "วิธี",
  "อันตราย", "เสี่ยง", "ผลกระทบ", "ป้องกัน", "แก้ไข", "รับมือ",
  "เทียบ", "เปรียบเทียบ", "แนวโน้ม", "ย้อนหลัง", "พยากรณ์",
  /* ── ช่วงเวลาข้างหน้า (24 ก.ย. 2569 · T1.282) ──
     "อากาศพรุ่งนี้เป็นยังไง" เข้าเรื่อง `climate` แล้วถูกตอบด้วยค่าที่วัดได้ตอนนี้
     ข้อมูลบนแดชบอร์ดบอกได้แค่อดีตถึงปัจจุบัน อนาคตต้องให้ตัวที่มีแบบจำลองตอบ */
  "พรุ่งนี้", "มะรืน", "คืนนี้", "สัปดาห์หน้า", "เดือนหน้า", "ข้างหน้า",
];

/** คำถามนี้ขอ "ความเห็น/คำอธิบาย" ไม่ใช่ตัวเลขบนหน้าจอ — ให้ AI ตอบดีกว่า */
export function wantsAdvice(question) {
  return matchesAnyExact(question, ADVICE_WORDS);
}

export function answerFor(question, ctx) {
  /* **ให้คะแนนทุกเรื่องแล้วเลือกตัวที่ตรงที่สุด ไม่ใช่เจอคำแรกแล้วจบ**
     ของเดิมใช้ find() ซึ่งแปลว่าเรื่องที่อยู่บนสุดของรายการชนะเสมอ
     และจับคำแบบตรงตัวอักษร พิมพ์ "sensor" หรือ "อุนหภูมิ" ก็หลุดหมด (ผู้ใช้แจ้งเอง) */
  const hit = bestMatch(question, TOPICS, (t) => t.words);
  /* **ส่งคำถามเข้าไปด้วย** — บางเรื่องมีคำตอบได้หลายรูป ("อุณหภูมิเท่าไหร่" กับ
     "โรงเรือนไหนร้อนที่สุด" เป็นคนละคำถามที่เข้าเรื่องเดียวกัน) */
  if (hit) return hit.answer(ctx, question);

  /* ไม่เข้าเรื่องไหนเลย — บอกตรง ๆ ว่ายังตอบไม่ได้ แล้วเสนอเรื่องที่ตอบได้แทน
     (ห้ามเดาคำตอบ ผู้ใช้เอาไปตัดสินใจเรื่องสัตว์จริง) */
  return {
    text: "ขอโทษครับ เรื่องนี้ผมยังไม่มีข้อมูลในระบบ ผมตอบได้เฉพาะสิ่งที่แดชบอร์ดนี้เก็บไว้ ลองเลือกจากหัวข้อด้านล่างดูครับ",
    bullets: null,
  };
}
