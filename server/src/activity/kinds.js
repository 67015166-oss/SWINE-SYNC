/**
 * ชนิดของ "กิจกรรมที่คนทำ" และข้อความไทยของแต่ละอัน (T1.359)
 *
 * ★ ไฟล์นี้ **ไม่ import อะไรเลย** ชุดทดสอบที่รากโครงงานจึงอ่านได้โดยไม่ต้องมีฐานข้อมูล
 *   (กติกาเดียวกับที่ `line/recordText.js` กับ `line/intent.js` แยกไว้)
 *
 * ★★ **หน้าเว็บไม่ได้ถือรายการนี้ซ้ำ** — มันขอมาจาก `GET /api/activity/settings`
 *   แล้วเอาไปวาดช่องติ๊กตามที่ได้มา จึงไม่มีทางที่สองฝั่งจะไม่ตรงกัน
 *   (ถ้าก๊อปรายการไปไว้ฝั่งหน้าเว็บด้วยเมื่อไหร่ ผู้ใช้จะติ๊กปิดหมวดหนึ่ง
 *   แล้วยังได้รับอีกหมวดโดยไม่มีอะไรฟ้องว่าทำไม)
 */

/** หมวดที่ผู้ใช้เลือกเปิด-ปิดได้ เรียงตามลำดับที่แสดงบนหน้าจอ */
export const ACTIVITY_KINDS = [
  {
    id: "settings",
    label: "แก้เกณฑ์และตั้งค่าระบบ",
    hint: "เกณฑ์อุณหภูมิ ความชื้น NH3 และเกณฑ์แจ้งเตือน",
  },
  {
    id: "admin",
    label: "เพิ่ม / แก้ / ลบ ฟาร์ม · โรงเรือน · ผู้ใช้",
    hint: "รวมการเปลี่ยนสิทธิ์และการปิดบัญชี",
  },
  {
    id: "barnlog",
    label: "บันทึกงานในเล้า",
    hint: "หมูตาย ป่วย ย้ายเข้า-ออก ให้อาหาร ให้ยา — รวมที่บันทึกผ่านไลน์",
  },
  {
    id: "control",
    label: "สั่งเปิด-ปิดอุปกรณ์",
    hint: "พัดลมและปั๊ม",
  },
];

export const ACTIVITY_KIND_IDS = ACTIVITY_KINDS.map((k) => k.id);

/** หมวดนี้มีจริงไหม — ใช้กันค่าที่หลุดมาจากคำขอภายนอก */
export const isActivityKind = (id) => ACTIVITY_KIND_IDS.includes(id);

/**
 * ★ ตัดข้อความยาวก่อนเก็บ — ชื่อฟาร์มที่ผู้ใช้พิมพ์เองยาวได้ไม่จำกัด
 * ถ้าไม่ตัด ข้อความแจ้งเตือนใบเดียวจะดันใบอื่นตกขอบของไลน์ไปทั้งรอบ
 */
export const clip = (text, max = 120) => {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};


/**
 * ชื่อไทยและหน่วยของสิ่งที่แก้ได้ (T1.364)
 *
 * ★★ ข้อความต้องอ่านแล้วเข้าใจทันทีโดยไม่ต้องเปิดหน้าจอตาม
 *   "แก้เกณฑ์ · tempMax" ไม่ได้บอกอะไรเลยว่าเปลี่ยนจากเท่าไรเป็นเท่าไร
 *   คนอ่านในไลน์ต้องตัดสินใจได้จากข้อความใบเดียว ไม่ใช่ต้องไปเปิดเว็บดูต่อ
 */
export const FIELD_LABEL = {
  /* เกณฑ์สภาพแวดล้อม */
  tempMin: { name: "อุณหภูมิต่ำสุด", unit: "°C" },
  tempMax: { name: "อุณหภูมิสูงสุด", unit: "°C" },
  humidityMin: { name: "ความชื้นต่ำสุด", unit: "%" },
  humidityMax: { name: "ความชื้นสูงสุด", unit: "%" },
  nh3Limit: { name: "เพดานแอมโมเนีย", unit: "ppm" },
  /* ฟาร์ม / โรงเรือน */
  code: { name: "รหัส" },
  name: { name: "ชื่อ" },
  province: { name: "จังหวัด" },
  district: { name: "อำเภอ" },
  lat: { name: "พิกัดละติจูด" },
  lng: { name: "พิกัดลองจิจูด" },
  data_source: { name: "แหล่งข้อมูล" },
  zone: { name: "โซน" },
  building: { name: "อาคาร" },
  stage: { name: "ช่วงวัย" },
  capacity: { name: "ความจุ" },
};

/** ชื่อไทยของระดับสิทธิ์ — ต้องตรงกับที่หน้าจอแสดง ไม่งั้นคนอ่านจะงงว่าคนละระบบกันไหม */
export const ROLE_LABEL = {
  viewer: "ผู้ชม",
  editor: "ผู้บันทึก",
  operator: "ผู้ควบคุมอุปกรณ์",
  admin: "ผู้ดูแลระบบ",
};

/** เลขอ่านง่าย — ตัดทศนิยมที่ไม่จำเป็นทิ้ง (26.0 → 26) */
const n = (v) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return null;
  return String(Math.round(x * 100) / 100);
};

/**
 * "จาก 26 °C เป็น 29 °C" พร้อมคำว่าเพิ่ม/ลดให้ตรงทิศ
 *
 * ★ ใช้คำว่า "เพิ่ม"/"ลด" เมื่อเทียบตัวเลขได้ และ "เปลี่ยน" เมื่อเป็นข้อความ
 *   — บอกทิศทางช่วยให้คนอ่านรู้ทันทีว่าเกณฑ์หลวมขึ้นหรือเข้มขึ้น
 */
export function changeText(field, from, to) {
  const meta = FIELD_LABEL[field] ?? { name: field };
  const unit = meta.unit ? ` ${meta.unit}` : "";
  const a = n(from);
  const b = n(to);
  if (a !== null && b !== null) {
    const verb = Number(b) > Number(a) ? "เพิ่ม" : "ลด";
    return `${verb}${meta.name} จาก ${a}${unit} เป็น ${b}${unit}`;
  }
  const was = from == null || from === "" ? "(ว่าง)" : clip(String(from), 40);
  const now = to == null || to === "" ? "(ว่าง)" : clip(String(to), 40);
  return `เปลี่ยน${meta.name} จาก ${was} เป็น ${now}`;
}

/**
 * ข้อความสรุปของกิจกรรมหนึ่งบรรทัด — ประกอบตั้งแต่ตอนเขียนลงฐาน
 *
 * ★★ **ต้องบอกว่าใครทำเสมอ** กิจกรรมที่ตอบไม่ได้ว่าใครทำคือกิจกรรมที่ไม่มีประโยชน์
 *   ตอนไล่หาสาเหตุ — คนอ่านจะได้รู้ว่าต้องไปถามใคร ไม่ใช่รู้แค่ว่ามีอะไรเปลี่ยน
 */
/** " (ชื่อ · จังหวัด)" — ช่องที่ถูกแก้ แปลเป็นไทย · ว่างไว้ถ้าไม่รู้ */
function fieldsText(detail) {
  const list = Array.isArray(detail?.fields) ? detail.fields : [];
  if (list.length === 0) return "";
  return ` — ${list.map((f) => FIELD_LABEL[f]?.name ?? f).join(" · ")}`;
}

export function summaryOf({ action, actorName, target, detail = {} }) {
  /* ★ ขึ้นต้นด้วย "<ชื่อ> ได้…" ตามที่ผู้ใช้ขอ — อ่านเป็นประโยคบอกเล่าเต็ม
     ไม่ใช่หัวข้อห้วน ๆ ซึ่งคนอ่านในไลน์ต้องเดาต่อเองว่าเกิดอะไรขึ้น */
  const who = clip(actorName || "ไม่ทราบผู้ใช้", 40);
  const what = clip(target, 60);
  /* ★ ตัวคั่นสองแบบ ไม่ใช่แบบเดียว
       `on` = ช่องว่างธรรมดา สำหรับประโยคที่ "สิ่งนั้นเป็นกรรมของกริยา"
              เช่น "เพิ่มโรงเรือน B2" · "ผูกบัญชีไลน์กับ สมชาย"
       `at` = จุดกลาง สำหรับที่ซึ่ง "สิ่งนั้นเป็นสถานที่/บริบท" เช่น "บันทึก หมูตาย 2 ตัว · เล้า A1"
     ใช้จุดกลางกับทุกอันเหมือนกันหมด ประโยคจะขาดเป็นท่อน ๆ อ่านสะดุด */
  const on = what ? ` ${what}` : "";
  const at = what ? ` · ${what}` : "";
  switch (action) {
    case "comfort.update": {
      const list = Array.isArray(detail.changes) ? detail.changes : [];
      if (list.length === 0) return `${who} ได้แก้เกณฑ์สภาพแวดล้อม${at}`;
      /* ★ แก้ช่องเดียว = ประโยคเดียวอ่านจบ ไม่ต้องมีหัวข้อนำ */
      if (list.length === 1) {
        const c = list[0];
        return `${who} ได้${changeText(c.field, c.from, c.to)}`;
      }
      /* หลายช่อง = ขึ้นหัวว่ากี่อย่าง แล้วไล่ทีละอย่างคั่นด้วยจุดกลาง */
      return `${who} ได้แก้เกณฑ์ ${list.length} อย่าง — ${list
        .map((c) => changeText(c.field, c.from, c.to))
        .join(" · ")}`;
    }
    case "farm.create":
      return `${who} ได้เพิ่มฟาร์ม${on}`;
    case "farm.update":
      return `${who} ได้แก้ข้อมูลฟาร์ม${on}${fieldsText(detail)}`;
    case "farm.delete":
      return `${who} ได้ลบฟาร์ม${on}`;
    case "farm.restore":
      return `${who} ได้กู้ฟาร์ม${on} คืน`;
    case "barn.create":
      return `${who} ได้เพิ่มโรงเรือน${on}`;
    case "barn.update":
      return `${who} ได้แก้ข้อมูลโรงเรือน${on}${fieldsText(detail)}`;
    case "barn.delete":
      return `${who} ได้ลบโรงเรือน${on}`;
    case "barn.restore":
      return `${who} ได้กู้โรงเรือน${on} คืน`;
    case "user.create":
      return `${who} ได้เพิ่มผู้ใช้${on}`;
    case "user.update": {
      /* เปลี่ยนสิทธิ์เป็นเรื่องที่ต้องเห็นชัดกว่าการแก้ชื่อ จึงเขียนแยก */
      if (detail.role) {
        const now = ROLE_LABEL[detail.role] ?? detail.role;
        const was = detail.roleFrom ? ROLE_LABEL[detail.roleFrom] ?? detail.roleFrom : null;
        return was
          ? `${who} ได้เปลี่ยนสิทธิ์ของ${on} จาก${was} เป็น${now}`
          : `${who} ได้เปลี่ยนสิทธิ์ของ${on} เป็น${now}`;
      }
      /* ปิด/เปิดบัญชีต้องเห็นชัดพอ ๆ กับการเปลี่ยนสิทธิ์ */
      if (detail.active === false) return `${who} ได้ปิดบัญชีของ${on}`;
      if (detail.active === true) return `${who} ได้เปิดบัญชีของ${on} คืน`;
      return `${who} ได้แก้ข้อมูลผู้ใช้${on}`;
    }
    case "user.delete":
      return `${who} ได้ปิดบัญชีของ${on}`;
    case "line.link":
      return `${who} ได้ผูกบัญชีไลน์กับ${on}`;
    case "line.unlink":
      return `${who} ได้ถอนการผูกบัญชีไลน์${on}`;
    case "user.password":
      return `${who} ได้ตั้งรหัสผ่านใหม่ให้${on}`;
    case "barnlog.create": {
      const n = detail.amount == null ? "" : ` ${detail.amount}`;
      const unit = detail.unit ? ` ${clip(detail.unit, 12)}` : "";
      const via = detail.via === "line" ? " (ผ่านไลน์)" : "";
      return `${who} ได้บันทึก ${clip(detail.label || "งานในเล้า", 30)}${n}${unit}${at}${via}`;
    }
    case "barnlog.delete":
      return `${who} ได้ถอนรายการที่บันทึกไว้${at}`;
    case "control.command": {
      const device = clip(detail.device || "อุปกรณ์", 24);
      const act = detail.action === "off" ? "ปิด" : "เปิด";
      return `${who} ได้สั่ง${act} ${device}${at}`;
    }
    default:
      return `${who} ได้ทำรายการ ${clip(action, 40)}${at}`;
  }
}

/**
 * ข้อความรวมหลายกิจกรรมเป็นใบเดียวสำหรับส่งเข้าไลน์
 *
 * ★★ **รวมเป็นใบเดียวเสมอ ห้ามส่งทีละรายการ** โควตาบัญชีนี้มี 300 ข้อความ/เดือน
 *   และนับต่อผู้รับ — วันที่มีคนจัดฟาร์มรัว ๆ จะกินโควตาทั้งเดือนในชั่วโมงเดียว
 *   (กติกาเดียวกับที่แจ้งเตือนเหตุผิดปกติยึดไว้ตั้งแต่ T1.275)
 */
export const ACTIVITY_MAX_LINES = 12;

export function activityMessage(rows, { now = new Date() } = {}) {
  if (!rows?.length) return null;
  const time = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
  const shown = rows.slice(0, ACTIVITY_MAX_LINES);
  const lines = [
    `มีการเปลี่ยนแปลงในระบบ ${rows.length} รายการ`,
    `ถึง ${time} น.`,
    "",
    ...shown.map((r) => `• ${clip(r.summary, 110)}`),
  ];
  /* ★ บอกตรง ๆ ว่าตัดไปกี่รายการ ไม่ใช่เงียบ — ไม่งั้นคนอ่านจะนึกว่าเห็นครบแล้ว */
  if (rows.length > shown.length) {
    lines.push("", `(อีก ${rows.length - shown.length} รายการ ดูได้ในเว็บ)`);
  }
  return lines.join("\n");
}
