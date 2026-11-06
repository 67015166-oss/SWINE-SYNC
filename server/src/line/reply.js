/**
 * ตอบคำถามและปุ่มเมนูที่กดเข้ามาในไลน์ (T1.276 · ขยายเป็นเมนู 6 ปุ่มใน T1.277)
 *
 * **ตอบจากฐานข้อมูลของเราเอง ไม่ส่งให้ AI คิด** — เหตุผลเดียวกับ `/api/assistant/now`
 * (ดูหัวข้อในไฟล์นั้น): คำถามแบบ "ตอนนี้กี่องศา" ถ้าส่งเข้าโมเดลจะใช้เวลา 28–150 วินาที
 * แต่ replyToken ของ LINE มีอายุสั้นมาก ค่าชุดเดียวกันอยู่ในฐานเราอยู่แล้ว อ่านเองเร็วกว่าเป็นพันเท่า
 *
 * **ทุกคำตอบยึดฟาร์ม/โรงเรือนที่คนนั้นเลือกไว้** (scope.js) ยังไม่เคยเลือก = กำแพงเพชร
 *
 * **ห้ามเดาคำตอบ** ระบบนี้พูดแทนฟาร์มจริง ตอบผิดแล้วคนหน้างานทำตามได้
 * ฟาร์มตัวอย่างไม่มีค่าจริงในฐาน → บอกตรง ๆ แล้วส่งไปดูในเว็บ ไม่แต่งตัวเลขขึ้นมา
 */
import { query } from "../db/pool.js";
import { thaiDate } from "./flex.js";
import { HELP, detectIntent, detectRecord } from "./intent.js";
import { recorderOf, savedText, undoLast, writeLog } from "./record.js";
import { logActivity } from "../activity/log.js";
import { AI_DOWN, AI_OFF, AI_SLOW, ASK_WHICH, LOG_LABEL, NEED_BARN, NOT_ALLOWED, ROLE_TOO_LOW, askAmount, powerText } from "./recordText.js";
import { askFast } from "./ask.js";
import { dashLink } from "./links.js";
import { barnStatus, dailyActions, thiOf } from "./advice.js";
import { alertsCard, barnPickerCard, dailyReportCard, envCard, farmPickerCard, linkCard, pigsCard } from "./cards.js";
import { getScope, listBarns, listFarms, scopeLabel, setScope } from "./scope.js";

export { detectIntent };

/** ข้อความสั้น ๆ ว่าค่าล่าสุดเก่าแค่ไหน — ต้องบอกเสมอ ไม่งั้นคนเชื่อว่าเป็นค่าวินาทีนี้ */
function freshnessText(at, now = Date.now()) {
  if (!at) return "ไม่มีข้อมูล";
  const min = Math.round((now - new Date(at).getTime()) / 60000);
  if (min < 2) return "เมื่อครู่นี้";
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
  return thaiDate(new Date(at), { withTime: true });
}

const minutesSince = (at) => (at ? (Date.now() - new Date(at).getTime()) / 60000 : null);

/** เกณฑ์ระดับระบบที่เครื่องคิดแจ้งเตือนใช้จริง — ตัวเดียวกับที่หน้าเว็บแสดง */
async function globalLimits() {
  const { rows } = await query(
    `select metric, threshold_min, threshold_max from alert_rule where scope = 'global' and enabled`,
  );
  const limits = {};
  for (const r of rows) limits[r.metric] = { min: r.threshold_min, max: r.threshold_max };
  return limits;
}

/** ค่าล่าสุดในเล้าของโรงเรือนหนึ่ง */
async function currentOf(barnId) {
  const { rows } = await query(
    `select metric, value, at from v_barn_current where barn_id = $1 and not outdoor`,
    [barnId],
  );
  const out = { at: null };
  for (const r of rows) {
    out[r.metric] = Number(r.value);
    if (!out.at || r.at > out.at) out.at = r.at;
  }
  return out;
}

async function alertsOf(barnId) {
  const { rows } = await query(
    `select code, params, metric, value, threshold_used, level, opened_at
       from alert
      where barn_id = $1 and status <> 'resolved'
      order by case level when 'critical' then 0 when 'serious' then 1 else 2 end, opened_at desc`,
    [barnId],
  );
  return rows;
}

/** ข้อความเดียวที่ใช้ทุกครั้งที่คนเลือกฟาร์มตัวอย่าง — พูดครั้งเดียวให้ชัดว่าทำไมไม่มีตัวเลข */
const demoAnswer = (scope, page) =>
  linkCard({
    title: "ฟาร์มตัวอย่าง",
    scopeText: scopeLabel(scope),
    detail: "ฟาร์มนี้เป็นข้อมูลตัวอย่างที่สร้างขึ้นในหน้าเว็บ ไม่มีเซนเซอร์ส่งค่าเข้าระบบกลาง ไลน์จึงไม่มีตัวเลขจริงให้ตอบ — ดูตัวเลขตัวอย่างได้ในแดชบอร์ด หรือกดเปลี่ยนเป็นฟาร์มกำแพงเพชรที่มีเซนเซอร์จริง",
    link: dashLink(page),
    label: "เปิดในแดชบอร์ด",
  });

/* ─────────── ปุ่มแต่ละปุ่ม ─────────── */

async function answerAlerts(scope) {
  if (!scope.barnId) return demoAnswer(scope, "alerts");
  const alerts = await alertsOf(scope.barnId);
  return alertsCard(alerts, { scopeText: scopeLabel(scope), link: dashLink("alerts") });
}

async function answerEnv(scope) {
  if (!scope.barnId) return demoAnswer(scope, "environment");
  const [cur, limits, alerts] = await Promise.all([currentOf(scope.barnId), globalLimits(), alertsOf(scope.barnId)]);
  const status = barnStatus({
    temp: cur.temp_c ?? null,
    humidity: cur.humidity ?? null,
    limits,
    ageMinutes: minutesSince(cur.at),
    alerts,
  });
  return envCard({
    scopeText: scopeLabel(scope),
    temp: cur.temp_c ?? null,
    humidity: cur.humidity ?? null,
    thi: thiOf(cur.temp_c ?? null, cur.humidity ?? null),
    status,
    freshness: freshnessText(cur.at),
    link: dashLink("environment"),
  });
}

async function answerPigs(scope) {
  if (!scope.barnId) return demoAnswer(scope, "pigs");

  /* บันทึกของคนหน้างานวันนี้ — ตาราง barn_log ใช้รหัสแบบหน้าเว็บ ("F-KPP-A1") */
  const barnKey = `${scope.farmCode}-${scope.barnCode}`;
  const { rows } = await query(
    `select type, sum(amount)::int as total
       from barn_log
      where barn_key = $1 and deleted_at is null
        and at >= date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'
      group by type`,
    [barnKey],
  );
  const counts = {};
  for (const r of rows) counts[r.type] = r.total;

  /* ยอดสุกรทั้งหมดยังไม่มีในระบบกลาง — ตัวเลขในแดชบอร์ดตอนนี้มาจากข้อมูลตัวอย่าง
     จึงตอบว่า "ยังไม่มี" ไม่ใช่หยิบเลขตัวอย่างมาตอบให้ดูเหมือนของจริง */
  return pigsCard({
    scopeText: scopeLabel(scope),
    total: null,
    counts,
    note: "ยอดสุกรทั้งหมดและจำนวนที่ AI นับได้ยังไม่ได้ต่อเข้าระบบกลาง ตัวเลขในแดชบอร์ดส่วนนี้ยังเป็นข้อมูลตัวอย่าง",
    link: dashLink("pigs"),
  });
}

async function answerDaily(scope) {
  if (!scope.barnId) return demoAnswer(scope, "report");

  const { buildSummary } = await import("./summary.js");
  const startOfToday = new Date(
    `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())}T00:00:00+07:00`,
  );
  const summary = await buildSummary(startOfToday, new Date());
  const mine = summary.barns.find((b) => b.barnId === scope.barnId);

  const [cur, limits, alerts] = await Promise.all([currentOf(scope.barnId), globalLimits(), alertsOf(scope.barnId)]);
  const status = barnStatus({
    temp: cur.temp_c ?? null,
    humidity: cur.humidity ?? null,
    limits,
    ageMinutes: minutesSince(cur.at),
    alerts,
  });
  const actions = dailyActions({ status, openAlerts: alerts, coveragePct: mine?.coveragePct ?? null });

  return dailyReportCard({
    scopeText: scopeLabel(scope),
    dateLabel: thaiDate(new Date()),
    temp: mine?.tempAvg ?? null,
    tempMax: mine?.tempMax ?? null,
    humidity: mine?.humidityAvg ?? null,
    coveragePct: mine?.coveragePct ?? 0,
    openAlerts: alerts.length,
    status,
    actions,
    link: dashLink("report"),
  });
}

/* ─────────── เลือกฟาร์ม / โรงเรือน ─────────── */

export async function farmPicker(lineUserId) {
  const [farms, scope] = await Promise.all([listFarms(), getScope(lineUserId)]);
  return farmPickerCard(farms, scope.chosen ? scopeLabel(scope) : null);
}

/** คนกดเลือกฟาร์มแล้ว — บันทึกไว้ แล้วถามต่อว่าโรงเรือนไหน */
export async function chooseFarm(lineUserId, farmCode) {
  const farms = await listFarms();
  const farm = farms.find((f) => f.code === farmCode);
  if (!farm) return { type: "text", text: "ไม่พบฟาร์มนี้แล้วครับ ลองกด เลือกฟาร์ม อีกครั้ง" };

  const barns = await listBarns(farmCode);
  /* โรงเรือนเดียวก็เลือกให้เลย ไม่ต้องให้กดซ้ำ */
  await setScope(lineUserId, farmCode, barns.length === 1 ? barns[0].code : null);
  if (barns.length === 1) {
    const scope = await getScope(lineUserId);
    return { type: "text", text: `เลือกแล้ว: ${scopeLabel(scope)}\nทุกเมนูจะยึดโรงเรือนนี้จนกว่าจะเปลี่ยนใหม่ครับ` };
  }
  return barnPickerCard(farm, barns);
}

export async function chooseBarn(lineUserId, barnCode) {
  const scope = await getScope(lineUserId);
  await setScope(lineUserId, scope.farmCode, barnCode);
  const updated = await getScope(lineUserId);
  return { type: "text", text: `เลือกแล้ว: ${scopeLabel(updated)}\nทุกเมนูจะยึดโรงเรือนนี้จนกว่าจะเปลี่ยนใหม่ครับ` };
}

/* ─────────── ตัวกลาง ─────────── */

/**
 * ตอบหนึ่งข้อความ
 * @param {string} text ข้อความที่คนพิมพ์หรือคำที่ปุ่มเมนูส่งมา
 * @param {string} lineUserId เพื่อรู้ว่าคนนี้เลือกฟาร์มไหนไว้
 */
export async function replyFor(text, lineUserId) {
  const intent = detectIntent(text);
  if (intent === "pick") return farmPicker(lineUserId);

  const scope = await getScope(lineUserId);
  const scopeText = scopeLabel(scope);

  /* ═══ บันทึกงานผ่านไลน์ (T1.322) ═══
     ★ ตรวจก่อน switch เพราะคำสั่งบันทึกไม่ใช่ intent เดียว ๆ แต่เป็น "คำ + จำนวน"
       (`detectRecord` บังคับว่าต้องขึ้นต้นด้วยคำสั่ง จึงไม่ชนกับคำถามที่มีคำเดียวกัน) */
  const rec = detectRecord(text);
  if (rec) {
    const recorder = await recorderOf(lineUserId);
    if (!recorder.ok) {
      /* ★ สองเหตุผลนี้ต้องบอกคนละอย่าง — ทางแก้คนละทาง (ดู recordText.js) */
      return { type: "text", text: recorder.why === "role" ? ROLE_TOO_LOW : NOT_ALLOWED };
    }
    /* ★ ไม่รู้ว่าจะลงเล้าไหน = ไม่บันทึก ห้ามเดาเอาเล้าแรกของฟาร์ม
       ลงผิดเล้าแล้วตัวเลขของสองเล้าผิดพร้อมกัน และหายากกว่าไม่บันทึกเลย */
    if (!scope.barnCode) return { type: "text", text: NEED_BARN };
    if (rec.amount == null) return { type: "text", text: askAmount(rec.type, rec.unit) };

    const entry = await writeLog({
      barnKey: `${scope.farmCode}-${scope.barnCode}`,
      type: rec.type,
      amount: rec.amount,
      unit: rec.unit,
      note: rec.note,
      recorder,
    });
    /* ★ ติด via: "line" ไว้ — ข้อความแจ้งเตือนจะได้บอกได้ว่ารายการนี้มาจากไลน์
       ซึ่งเป็นคำถามแรกที่คนถามเวลาเห็นตัวเลขเปลี่ยนโดยไม่มีใครนั่งอยู่หน้าเว็บ */
    await logActivity({
      kind: "barnlog", action: "barnlog.create",
      actor: { id: recorder.userId, display_name: recorder.name },
      target: `${scope.farmCode}-${scope.barnCode}`,
      detail: { label: LOG_LABEL[rec.type] ?? rec.type, amount: rec.amount, unit: rec.unit, via: "line" },
    });
    return { type: "text", text: savedText(entry, scopeText, rec.extra === true) };
  }

  if (intent === "undo") {
    const recorder = await recorderOf(lineUserId);
    if (!recorder.ok) {
      return { type: "text", text: recorder.why === "role" ? ROLE_TOO_LOW : NOT_ALLOWED };
    }
    if (!scope.barnCode) return { type: "text", text: NEED_BARN };
    const gone = await undoLast({ barnKey: `${scope.farmCode}-${scope.barnCode}`, recorder });
    if (gone) {
      await logActivity({
        kind: "barnlog", action: "barnlog.delete",
        actor: { id: recorder.userId, display_name: recorder.name },
        target: `${scope.farmCode}-${scope.barnCode}`, detail: { via: "line" },
      });
    }
    return {
      type: "text",
      text: gone
        /* ★ ชนิดที่ไม่มีจำนวนไม่ต้องขึ้นว่า "1 ครั้ง" — กติกาเดียวกับตอนบันทึก (T1.366) */
        ? `ถอนแล้ว · ${LOG_LABEL[gone.type] ?? gone.type}${
            gone.unit === "ครั้ง" ? "" : ` ${gone.amount} ${gone.unit}`
          }\n\nกำลังดู: ${scopeText}`
        : `ไม่มีรายการที่เพิ่งบันทึกให้ถอนครับ\n\nถอนได้เฉพาะรายการที่คุณบันทึกผ่านไลน์เอง\nการแก้รายการอื่นทำได้ที่หน้าโรงเรือนบนเว็บ`,
    };
  }

  switch (intent) {
    case "dashboard":
      return linkCard({
        title: "แดชบอร์ด SWINE SYNC", scopeText,
        detail: "เปิดหน้าแดชบอร์ดเพื่อดูแผนที่ฟาร์ม กราฟย้อนหลัง และรายละเอียดทั้งหมด",
        link: dashLink("home"), label: "เปิดแดชบอร์ด",
      });
    case "assistant":
      return linkCard({
        title: "ผู้ช่วย AI", scopeText,
        detail: "เปิดแดชบอร์ดแล้วกดปุ่มผู้ช่วย AI ที่แถบลอยด้านล่างจอ เพื่อถามคำถามที่ต้องวิเคราะห์ลึกกว่านี้",
        link: dashLink("home"), label: "เปิดผู้ช่วย AI",
      });
    case "alerts":
      return answerAlerts(scope);
    case "env":
    case "temp":
    case "humidity":
      return answerEnv(scope);
    case "pigs":
      return answerPigs(scope);
    case "daily":
      return answerDaily(scope);
    /* ค่าไฟ (T1.324) — มิเตอร์ส่งค่ามาจริงทุก ~30 วินาที */
    case "power": {
      if (!scope.barnId) return { type: "text", text: NEED_BARN };
      const { rows: [latest] } = await query(
        `select voltage, current_a, current_b, current_c, frequency, power_kw
           from power_reading where barn_id = $1 order by at desc limit 1`,
        [scope.barnId],
      );
      const { rows: [usage] } = await query(
        `select
           max(kwh_total) filter (where at >= date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')
             - min(kwh_total) filter (where at >= date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok') as today_kwh,
           max(kwh_total) filter (where at >= date_trunc('month', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')
             - min(kwh_total) filter (where at >= date_trunc('month', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok') as month_kwh,
           min(at) filter (where at >= date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok') as today_from
         from power_reading
         where barn_id = $1 and kwh_total is not null`,
        [scope.barnId],
      );
      return { type: "text", text: powerText(latest ? { ...latest, ...usage } : null, scopeText) };
    }

    /* ★ สั้นจนไม่รู้ว่าถามอะไร — ถามกลับ ไม่เดา และไม่ส่งไปให้ AI เดาแทน */
    case "ambiguous":
      return { type: "text", text: `${ASK_WHICH}\n\nกำลังดู: ${scopeText}` };

    case "help":
      return { type: "text", text: `กำลังดู: ${scopeText}\n\n${HELP}` };
    default: {
      /* ═══ ไม่ตรงคำสั่งไหน = ส่งไปถาม AI ของฟาร์ม (T1.323) ═══
         เดิมตอบว่า "ยังตอบคำถามนี้ไม่ได้" ซึ่งปิดประตูทั้งที่ AI ต่ออยู่แล้ว
         ★ รอได้เท่าที่ไลน์รอได้เท่านั้น ถ้าจะช้าก็พาไปถามต่อในเว็บ
           ไม่ใช่ตอบ "กำลังคิด" แล้ว push ตามหลัง ซึ่งจะกินโควตาจนส่งแจ้งเตือนไม่ได้ */
      const ai = await askFast(text);
      if (ai.ok) {
        return { type: "text", text: `${ai.text}\n\n— ผู้ช่วย AI · ${scopeText}` };
      }
      if (ai.why === "slow") return { type: "text", text: AI_SLOW };
      if (ai.why === "notready") return { type: "text", text: AI_OFF };
      if (ai.why === "unavailable") return { type: "text", text: AI_DOWN };
      /* ตอบมาว่าง = ไม่เข้าใจคำถาม ให้กลับไปเสนอเมนูตามเดิม */
      return { type: "text", text: `ยังตอบคำถามนี้ไม่ได้ครับ\n\nกำลังดู: ${scopeText}\n${HELP}` };
    }
  }
}

/** ทักทายคนที่เพิ่งเพิ่มเป็นเพื่อน — ถามฟาร์มก่อนเลยตามที่ผู้ใช้สั่ง */
export async function greeting(lineUserId) {
  return [
    {
      type: "text",
      text: "ยินดีต้อนรับสู่ SWINE SYNC ครับ\nที่นี่จะส่งสรุปฟาร์มประจำวันทุกเช้า และแจ้งเตือนทันทีเมื่อมีเหตุวิกฤต\n\nเริ่มจากเลือกก่อนว่าจะดูฟาร์มไหน (ไม่เลือกก็ได้ ระบบจะใช้ฟาร์มกำแพงเพชรให้)",
    },
    await farmPicker(lineUserId),
  ];
}
