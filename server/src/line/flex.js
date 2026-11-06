/**
 * ประกอบข้อความที่ส่งเข้า LINE — ฟังก์ชันล้วน ไม่แตะฐานข้อมูลและไม่ยิงเครือข่าย (T1.275)
 * แยกไฟล์ไว้เพื่อให้เทสต์เรียกได้ตรง ๆ โดยไม่ต้องมีฐานข้อมูลหรือกุญแจ LINE
 *
 * **ข้อความที่นี่เป็นภาษาไทยตายตัวได้** ต่างจากตาราง `alert` ที่ห้ามเก็บข้อความไทย
 * เพราะอันนั้นเป็นประวัติถาวรที่ต้องแปลภาษาได้ภายหลัง ส่วนอันนี้คือข้อความที่ส่งออกไป
 * แล้วจบในตัว ผู้รับใน LINE ไม่มีปุ่มสลับภาษา
 *
 * **สีเขียนเป็น hex ตรง ๆ ได้เฉพาะไฟล์นี้** — กติกา tokens.css คุมหน้าเว็บของเรา
 * แต่ Flex ของ LINE รับเฉพาะ hex ในโครง JSON ของเขา
 */

export const GOLD = "#9A7424";
export const RED = "#C0392B";
export const GREY = "#6B7280";
export const INK = "#1F2328";

/** ทศนิยมหนึ่งตำแหน่งสำหรับอุณหภูมิ ที่เหลือปัดเป็นจำนวนเต็ม (ให้ตรงกับที่หน้าเว็บแสดง) */
const n1 = (v) => (v == null || Number.isNaN(v) ? "—" : Number(v).toFixed(1));
const n0 = (v) => (v == null || Number.isNaN(v) ? "—" : String(Math.round(v)));

const UNIT = { temp_c: "°C", humidity: "%", nh3: " ppm", co2: " ppm", h2s: " ppm" };
const val = (metric, v) => (metric === "temp_c" ? n1(v) : n0(v)) + (UNIT[metric] ?? "");

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** วันที่แบบไทย (พ.ศ.) ตามเวลาไทยเสมอ ไม่ว่าเครื่องจะตั้งโซนอะไรไว้ */
export function thaiDate(date, { withTime = false } = {}) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "numeric", month: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  const day = Number(get("day"));
  const month = TH_MONTH[Number(get("month")) - 1];
  const year = Number(get("year")) + 543;
  const time = `${get("hour")}:${get("minute")} น.`;
  return withTime ? `${day} ${month} ${year} ${time}` : `${day} ${month} ${year}`;
}

/** เวลาไทยสั้น ๆ เช่น 07:30 น. */
export const thaiTime = (date) => thaiDate(date, { withTime: true }).split(" ").slice(3).join(" ");

/**
 * ข้อความของเหตุแจ้งเตือนหนึ่งใบ — ถ้อยคำเดียวกับที่หน้าเว็บใช้ (src/lib/api/alertText.js)
 * เพิ่ม code ใหม่ต้องเติมทั้งสองที่ ไม่งั้นคนอ่านในไลน์กับในเว็บจะเห็นคนละเรื่อง
 */
export function alertText(alert) {
  const p = alert.params ?? {};
  const metric = alert.metric ?? p.metric;
  const value = p.value ?? alert.value;
  const limit = p.threshold ?? alert.threshold_used;

  switch (alert.code) {
    case "temp_c_high":
      return { title: `อุณหภูมิสูงกว่าเกณฑ์ ${n1(value - limit)} °C`, detail: `วัดได้ ${val(metric, value)} (เพดาน ${val(metric, limit)})` };
    case "temp_c_low":
      return { title: `อุณหภูมิต่ำกว่าเกณฑ์ ${n1(limit - value)} °C`, detail: `วัดได้ ${val(metric, value)} (ขั้นต่ำ ${val(metric, limit)})` };
    case "humidity_high":
      return { title: `ความชื้นสูง ${val(metric, value)}`, detail: `เพดาน ${val(metric, limit)}` };
    case "humidity_low":
      return { title: `ความชื้นต่ำ ${val(metric, value)}`, detail: `ขั้นต่ำ ${val(metric, limit)}` };
    case "nh3_high":
      return { title: `แอมโมเนีย ${val(metric, value)} สูงเกินเกณฑ์`, detail: `เพดาน ${val(metric, limit)}` };
    case "sensor_silent":
      return {
        title: "เซนเซอร์ไม่ส่งข้อมูล",
        detail: "ไม่มีค่าใหม่เข้ามาเกินเวลาที่กำหนด — ตรวจไฟและสัญญาณที่ตู้ควบคุมท้ายโรงเรือน",
      };
    /* สองรหัสนี้มาจากแบบจำลองโรงเรือน — `alert.metric` เป็นกุญแจกันซ้ำ ("stuck:SENSOR-OUT:temp_c")
       ไม่ใช่ชื่อค่าที่วัด ชื่อค่าจริงกับชื่ออุปกรณ์อยู่ใน params (เหมือนที่หน้าเว็บทำ) */
    case "sensor_stuck":
      return {
        title: p.outdoor ? "เซนเซอร์นอกเล้าค่าค้าง" : "เซนเซอร์ในเล้าค่าค้าง",
        detail: `ส่งค่า ${val(p.metric, p.value)} ซ้ำเดิมมา ${n0(p.hours)} ชม. — ไม่ได้วัดจริง ตรวจตัวเซนเซอร์ ${p.device ?? ""}`.trim(),
      };
    case "twin_hotter":
      return {
        title: "ร้อนกว่าที่แบบจำลองคาด",
        detail: `วัดได้ ${val("temp_c", p.value)} แต่แบบจำลองคาด ${val("temp_c", p.expected)} — ตรวจพัดลม ระบบทำความเย็น และประตูที่อาจเปิดค้าง`,
      };
    default:
      return { title: "พบความผิดปกติ", detail: alert.code ?? "" };
  }
}

export const row = (label, value, color = INK) => ({
  type: "box", layout: "baseline", spacing: "sm",
  contents: [
    { type: "text", text: label, size: "sm", color: GREY, flex: 4 },
    { type: "text", text: value, size: "sm", color, flex: 5, weight: "bold", wrap: true },
  ],
});

export const sep = () => ({ type: "separator", margin: "md" });

export const linkButton = (url) =>
  url
    ? [{
        type: "button", style: "primary", height: "sm", color: GOLD, margin: "md",
        action: { type: "uri", label: "เปิดแดชบอร์ด", uri: url },
      }]
    : [];

/**
 * การ์ดสรุปประจำวัน
 * @param {object} s ผลจาก buildDailySummary()
 * @param {string} [dashboardUrl] ลิงก์ปุ่มท้ายการ์ด (ไม่มีก็ไม่ต้องมีปุ่ม)
 */
export function dailyFlex(s, dashboardUrl) {
  const barns = s.barns.slice(0, 6);
  const more = s.barns.length - barns.length;

  const barnBlocks = barns.flatMap((b) => [
    sep(),
    {
      type: "box", layout: "vertical", margin: "md", spacing: "xs",
      contents: [
        { type: "text", text: `${b.farmName} · ${b.barnName}`, weight: "bold", size: "sm", color: INK, wrap: true },
        row("อุณหภูมิ", b.tempAvg == null ? "ไม่มีข้อมูล" : `เฉลี่ย ${n1(b.tempAvg)} °C (สูงสุด ${n1(b.tempMax)})`),
        row("ความชื้น", b.humidityAvg == null ? "ไม่มีข้อมูล" : `เฉลี่ย ${n0(b.humidityAvg)} %`),
        row("ความครบของข้อมูล", `${n0(b.coveragePct)} %`, b.coveragePct < 80 ? RED : INK),
        row("เหตุที่ยังไม่ปิด", b.openAlerts === 0 ? "ไม่มี" : `${b.openAlerts} รายการ`, b.openAlerts > 0 ? RED : INK),
      ],
    },
  ]);

  /* ★ แถว "ข้อมูลเงียบมานานแค่ไหน" (T1.302)
     ขึ้นเฉพาะตอนที่ยังไม่มีค่าใหม่เข้ามาแม้แต่หลังวันที่สรุปจบไปแล้ว — วันปกติจะไม่ขึ้น
     เพราะ `lastDataAt` จะเป็นเวลาของวันนี้ ซึ่งใหม่กว่าปลายช่วงเสมอ */
  const silent = s.lastDataAt == null || new Date(s.lastDataAt) < s.to;
  const silentRows = !silent ? [] : [
    row(
      "ค่าล่าสุดที่ได้รับ",
      s.lastDataAt == null
        ? "ยังไม่เคยได้รับค่าจากเล้าเลย"
        : `${thaiDate(s.lastDataAt, { withTime: true })} (เงียบมา ${s.lastDataAgeText})`,
      RED,
    ),
  ];

  return {
    type: "flex",
    altText: (silent
      ? `สรุปฟาร์มประจำวัน ${s.dateLabel} · ไม่มีค่าใหม่เข้ามา${s.lastDataAgeText ? ` ${s.lastDataAgeText}` : ""}`
      : `สรุปฟาร์มประจำวัน ${s.dateLabel} · เหตุค้าง ${s.totals.openAlerts} รายการ`).slice(0, 400),
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: GOLD, paddingAll: "md",
        contents: [
          { type: "text", text: "สรุปฟาร์มประจำวัน", color: "#FFFFFF", weight: "bold", size: "lg" },
          { type: "text", text: `${s.periodLabel} · ${s.dateLabel}`, color: "#FFFFFF", size: "xs", margin: "xs" },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          row("โรงเรือนที่มีข้อมูล", `${s.totals.barnsWithData} จาก ${s.totals.barns} หลัง`),
          ...silentRows,
          row("เหตุที่ยังไม่ปิด", s.totals.openAlerts === 0 ? "ไม่มี" : `${s.totals.openAlerts} รายการ (วิกฤต ${s.totals.criticalAlerts})`,
            s.totals.criticalAlerts > 0 ? RED : INK),
          row("เซนเซอร์เงียบ/ค่าค้าง", s.totals.sensorIssues === 0 ? "ไม่มี" : `${s.totals.sensorIssues} จุด`,
            s.totals.sensorIssues > 0 ? RED : INK),
          /* ★ แยกใบที่ตรวจซ้ำไม่ได้ออกมา (T1.306) — ถ้านับรวมกับใบที่เพิ่งตรวจมา
             คนอ่านจะเข้าใจว่าทุกใบคือสถานะตอนนี้ ทั้งที่บางใบไม่มีค่ามาตรวจเลยทั้งวัน */
          ...(s.totals.unverifiedAlerts > 0
            ? [row("ในนั้นตรวจซ้ำไม่ได้", `${s.totals.unverifiedAlerts} รายการ — ไม่มีค่าใหม่ให้ตรวจ`, RED)]
            : []),
          ...barnBlocks,
          ...(more > 0 ? [{ type: "text", text: `และอีก ${more} หลัง — ดูทั้งหมดในแดชบอร์ด`, size: "xs", color: GREY, margin: "md", wrap: true }] : []),
          ...linkButton(dashboardUrl),
        ],
      },
    },
  };
}

/**
 * การ์ดเหตุวิกฤต — รวบหลายใบไว้ในข้อความเดียวเพื่อประหยัดโควตา
 * (สูงสุด 5 ใบต่อข้อความ เกินกว่านั้นบอกจำนวนที่เหลือไว้ท้ายการ์ด)
 */
export function alertFlex(alerts, dashboardUrl) {
  const shown = alerts.slice(0, 5);
  const more = alerts.length - shown.length;

  const blocks = shown.flatMap((a, i) => {
    const { title, detail } = alertText(a);
    return [
      ...(i === 0 ? [] : [sep()]),
      {
        type: "box", layout: "vertical", margin: "md", spacing: "xs",
        contents: [
          { type: "text", text: `${a.farmName} · ${a.barnName}`, size: "xs", color: GREY, wrap: true },
          { type: "text", text: title, weight: "bold", size: "md", color: RED, wrap: true },
          { type: "text", text: detail, size: "sm", color: INK, wrap: true },
          { type: "text", text: `เริ่มเมื่อ ${thaiDate(new Date(a.opened_at), { withTime: true })}`, size: "xs", color: GREY },
        ],
      },
    ];
  });

  const head = shown.length === 1 ? alertText(shown[0]).title : `เหตุวิกฤต ${alerts.length} รายการ`;

  return {
    type: "flex",
    altText: `แจ้งเตือนวิกฤต: ${head}`.slice(0, 400),
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: RED, paddingAll: "md",
        contents: [
          { type: "text", text: "แจ้งเตือนระดับวิกฤต", color: "#FFFFFF", weight: "bold", size: "lg" },
          { type: "text", text: thaiDate(new Date(), { withTime: true }), color: "#FFFFFF", size: "xs", margin: "xs" },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          ...blocks,
          ...(more > 0 ? [{ type: "text", text: `และอีก ${more} รายการ`, size: "xs", color: GREY, margin: "md" }] : []),
          ...linkButton(dashboardUrl),
        ],
      },
    },
  };
}

/** ข้อความทดสอบ — ใช้ตรวจว่ากุญแจกับปลายทางถูกต้องก่อนเปิดใช้จริง */
export const testMessage = () => ({
  type: "text",
  text: `ทดสอบการเชื่อมต่อจากแดชบอร์ด SWINE SYNC\n${thaiDate(new Date(), { withTime: true })}`,
});
