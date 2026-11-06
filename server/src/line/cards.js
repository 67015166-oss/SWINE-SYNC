/**
 * การ์ดของเมนู 6 ปุ่มบนไลน์ (T1.277) — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล ไม่ยิงเครือข่าย
 *
 * ทุกใบมีสามส่วนเหมือนกัน: หัวบอกว่ากำลังดูฟาร์ม/โรงเรือนไหน · เนื้อหา · ปุ่มดูเพิ่มเติม
 * **หัวการ์ดต้องบอกขอบเขตเสมอ** เพราะคนกดเมนูทีหลังจะจำไม่ได้ว่าเลือกโรงเรือนไหนไว้
 *
 * ปุ่ม "ดูเพิ่มเติม" พาไปหน้าของเรื่องนั้นในเว็บ (ผู้ใช้เลือก 23 ก.ย. 2569)
 * ไม่มีลิงก์ (ยังไม่ตั้ง DASHBOARD_URL) = ไม่ต้องมีปุ่ม ดีกว่าปุ่มที่กดแล้วไปไหนไม่ได้
 */
import { GOLD, GREY, INK, RED, alertText, row, sep, thaiDate } from "./flex.js";
import { postbackData } from "./intent.js";

const GREEN = "#2F7A52";
const TONE_COLOR = { good: GREEN, warn: GOLD, bad: RED };
const TONE_WORD = { good: "ปกติ", warn: "เฝ้าระวัง", bad: "ผิดปกติ" };

const n1 = (v) => (v == null || Number.isNaN(v) ? "—" : Number(v).toFixed(1));
const n0 = (v) => (v == null || Number.isNaN(v) ? "—" : String(Math.round(v)));

const header = (title, scopeText, color = GOLD) => ({
  type: "box", layout: "vertical", backgroundColor: color, paddingAll: "md",
  contents: [
    { type: "text", text: title, color: "#FFFFFF", weight: "bold", size: "lg", wrap: true },
    { type: "text", text: scopeText, color: "#FFFFFF", size: "xs", margin: "xs", wrap: true },
  ],
});

const moreButton = (url, label = "ดูเพิ่มเติมในแดชบอร์ด") =>
  url
    ? [{
        type: "button", style: "primary", height: "sm", color: GOLD, margin: "md",
        action: { type: "uri", label, uri: url },
      }]
    : [];

/** ปุ่มเล็ก ๆ ท้ายการ์ดไว้เปลี่ยนฟาร์ม — มีทุกใบ คนจะได้ไม่ต้องจำคำสั่ง */
const switchButton = () => ({
  type: "button", style: "link", height: "sm",
  action: { type: "postback", label: "เปลี่ยนฟาร์ม/โรงเรือน", data: postbackData("pick"), displayText: "เลือกฟาร์ม" },
});

const bubble = (altText, contents) => ({ type: "flex", altText: altText.slice(0, 400), contents });

/* ─────────── B · แจ้งเตือน ─────────── */

/**
 * @param {object[]} alerts เหตุที่ยังไม่ปิด (เรียงมาแล้ว) — แสดง 3 รายการตามที่ผู้ใช้สั่ง
 */
export function alertsCard(alerts, { scopeText, link }) {
  const LEVEL = { critical: "วิกฤต", serious: "ต้องจัดการ", warning: "เฝ้าระวัง" };
  const shown = alerts.slice(0, 3);
  const more = alerts.length - shown.length;

  const body = shown.length === 0
    ? [{ type: "text", text: "ไม่มีเหตุที่ยังไม่ปิดในโรงเรือนนี้", size: "sm", color: GREEN, weight: "bold", wrap: true }]
    : shown.flatMap((a, i) => {
        const { title, detail } = alertText(a);
        return [
          ...(i === 0 ? [] : [sep()]),
          {
            type: "box", layout: "vertical", margin: i === 0 ? "none" : "md", spacing: "xs",
            contents: [
              { type: "text", text: LEVEL[a.level] ?? a.level, size: "xs", color: a.level === "critical" ? RED : GREY },
              { type: "text", text: title, weight: "bold", size: "sm", color: a.level === "critical" ? RED : INK, wrap: true },
              { type: "text", text: detail, size: "xs", color: INK, wrap: true },
              { type: "text", text: `ตั้งแต่ ${thaiDate(new Date(a.opened_at), { withTime: true })}`, size: "xs", color: GREY },
            ],
          },
        ];
      });

  return bubble(
    `แจ้งเตือน ${alerts.length} รายการ · ${scopeText}`,
    {
      type: "bubble",
      header: header("แจ้งเตือน", scopeText, alerts.some((a) => a.level === "critical") ? RED : GOLD),
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          ...body,
          ...(more > 0 ? [{ type: "text", text: `และอีก ${more} รายการ`, size: "xs", color: GREY, margin: "md" }] : []),
          ...moreButton(link, "ดูเพิ่มเติม"),
          switchButton(),
        ],
      },
    },
  );
}

/* ─────────── C · สภาพแวดล้อม ─────────── */

export function envCard({ scopeText, temp, humidity, thi, status, freshness, link }) {
  return bubble(
    `สภาพแวดล้อม ${scopeText} · ${n1(temp)}°C ${n0(humidity)}% · ${status.headline}`,
    {
      type: "bubble",
      header: header("สภาพแวดล้อมตอนนี้", scopeText, TONE_COLOR[status.tone]),
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          row("อุณหภูมิในเล้า", temp == null ? "ไม่มีค่า" : `${n1(temp)} °C`),
          row("ความชื้นในเล้า", humidity == null ? "ไม่มีค่า" : `${n0(humidity)} %`),
          ...(thi == null ? [] : [row("ดัชนีความร้อน THI", String(thi))]),
          row("สถานะ", `${TONE_WORD[status.tone]} — ${status.headline}`, TONE_COLOR[status.tone]),
          row("ค่าล่าสุดเมื่อ", freshness),
          sep(),
          {
            type: "box", layout: "vertical", margin: "md", spacing: "xs",
            contents: [
              { type: "text", text: "สิ่งที่ต้องระวัง", size: "xs", color: GREY },
              ...(status.cautions.length === 0
                ? [{ type: "text", text: "ไม่มี ทุกค่าอยู่ในเกณฑ์", size: "sm", color: GREEN, weight: "bold", wrap: true }]
                : status.cautions.map((c) => ({ type: "text", text: `• ${c}`, size: "sm", color: INK, wrap: true }))),
            ],
          },
          ...moreButton(link, "ดูเพิ่มเติม"),
          switchButton(),
        ],
      },
    },
  );
}

/* ─────────── D · ติดตามสุกร ─────────── */

/**
 * @param {object} o.counts ยอดจากบันทึกของคนหน้างานวันนี้ เช่น { dead: 2, missing: 1 }
 * @param {number|null} o.total ยอดสุกรทั้งหมด — null = ระบบกลางยังไม่มีข้อมูลนี้
 */
export function pigsCard({ scopeText, total, counts = {}, note, link }) {
  const LABEL = { dead: "ตาย", sick: "ป่วย", missing: "ขาดหาย", moveIn: "ย้ายเข้า", moveOut: "ย้ายออก" };
  const lines = Object.entries(LABEL)
    .filter(([key]) => counts[key] != null)
    .map(([key, label]) => row(label, `${n0(counts[key])} ตัว`, key === "dead" || key === "missing" ? RED : INK));

  return bubble(
    `ข้อมูลสุกร ${scopeText}`,
    {
      type: "bubble",
      header: header("ติดตามสุกร", scopeText),
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          row("จำนวนทั้งหมด", total == null ? "ยังไม่มีในระบบกลาง" : `${n0(total)} ตัว`, total == null ? GREY : INK),
          ...(lines.length > 0
            ? [sep(), { type: "text", text: "บันทึกของวันนี้", size: "xs", color: GREY, margin: "md" }, ...lines]
            : [{ type: "text", text: "วันนี้ยังไม่มีใครบันทึกการตาย ป่วย หรือขาดหาย", size: "sm", color: GREY, margin: "md", wrap: true }]),
          ...(note ? [{ type: "text", text: note, size: "xs", color: GREY, margin: "md", wrap: true }] : []),
          ...moreButton(link, "ดูเพิ่มเติม"),
          switchButton(),
        ],
      },
    },
  );
}

/* ─────────── E · รายงานประจำวัน ─────────── */

export function dailyReportCard({ scopeText, dateLabel, temp, humidity, tempMax, coveragePct, openAlerts, status, actions, link }) {
  return bubble(
    `รายงานประจำวัน ${dateLabel} · ${scopeText} · ${status.headline}`,
    {
      type: "bubble",
      header: header("รายงานประจำวัน", `${scopeText} · ${dateLabel}`, TONE_COLOR[status.tone]),
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          row("สถานะตอนนี้", `${TONE_WORD[status.tone]} — ${status.headline}`, TONE_COLOR[status.tone]),
          row("อุณหภูมิวันนี้", temp == null ? "ไม่มีข้อมูล" : `เฉลี่ย ${n1(temp)} °C (สูงสุด ${n1(tempMax)})`),
          row("ความชื้นวันนี้", humidity == null ? "ไม่มีข้อมูล" : `เฉลี่ย ${n0(humidity)} %`),
          row("ความครบของข้อมูล", `${n0(coveragePct)} %`, coveragePct < 80 ? RED : INK),
          row("เหตุที่ยังไม่ปิด", openAlerts === 0 ? "ไม่มี" : `${openAlerts} รายการ`, openAlerts > 0 ? RED : INK),
          sep(),
          {
            type: "box", layout: "vertical", margin: "md", spacing: "xs",
            contents: [
              { type: "text", text: "ควรทำอะไรต่อ", size: "xs", color: GREY },
              ...actions.map((a) => ({ type: "text", text: `• ${a}`, size: "sm", color: INK, wrap: true })),
            ],
          },
          ...moreButton(link, "ดูเพิ่มเติม"),
          switchButton(),
        ],
      },
    },
  );
}

/* ─────────── เลือกฟาร์ม / โรงเรือน ─────────── */

export function farmPickerCard(farms, currentLabel) {
  return bubble(
    "เลือกฟาร์มที่ต้องการดู",
    {
      type: "bubble",
      header: header("เลือกฟาร์ม", currentLabel ? `กำลังดู: ${currentLabel}` : "ยังไม่ได้เลือก"),
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "text", text: "กดเลือกฟาร์มที่จะให้ทุกเมนูยึดเป็นหลัก", size: "sm", color: INK, wrap: true },
          ...farms.map((f) => ({
            type: "button", style: "secondary", height: "sm", margin: "sm",
            action: {
              type: "postback",
              label: `${f.name}${f.demo ? " (ตัวอย่าง)" : ""}`.slice(0, 20),
              data: postbackData("farm", f.code),
              displayText: `เลือก ${f.name}`,
            },
          })),
        ],
      },
    },
  );
}

export function barnPickerCard(farm, barns) {
  return bubble(
    `เลือกโรงเรือนใน ${farm.name}`,
    {
      type: "bubble",
      header: header("เลือกโรงเรือน", farm.name),
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: barns.length === 0
          ? [{ type: "text", text: "ฟาร์มนี้ยังไม่มีโรงเรือนที่ส่งค่าเข้าระบบกลาง", size: "sm", color: GREY, wrap: true }]
          : barns.map((b) => ({
              type: "button", style: "secondary", height: "sm", margin: "sm",
              action: {
                type: "postback",
                label: b.name.slice(0, 20),
                data: postbackData("barn", b.code),
                displayText: `เลือก ${b.name}`,
              },
            })),
      },
    },
  );
}

/* ─────────── A · F · เปิดเว็บ ─────────── */

export function linkCard({ title, detail, link, label, scopeText }) {
  return bubble(
    `${title} — ${detail}`,
    {
      type: "bubble",
      header: header(title, scopeText ?? ""),
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "text", text: detail, size: "sm", color: INK, wrap: true },
          ...moreButton(link, label),
        ],
      },
    },
  );
}
