/**
 * อ่านค่าจาก InfluxDB 2 ที่ Node-RED เขียนไว้ — **อ่านอย่างเดียว ไม่เขียนกลับ**
 *
 * ใช้ fetch ที่มากับ Node ตรง ๆ ไม่ลง client library เพิ่ม
 * (Flux HTTP API เป็น POST ธรรมดา + ตอบ CSV — ไม่คุ้มที่จะเพิ่ม dependency)
 */

const cfg = () => ({
  url: (process.env.INFLUX_URL || "http://localhost:8086").replace(/\/+$/, ""),
  org: process.env.INFLUX_ORG || "swinefarm",
  bucket: process.env.INFLUX_BUCKET || "climatesensor",
  measurement: process.env.INFLUX_MEASUREMENT || "kampangphet",
  token: process.env.INFLUX_TOKEN || "",
});

/** แยกบรรทัด CSV แบบมี quote — Influx ใส่ quote เมื่อค่ามีคอมมา */
function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else { quoted = false; }
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** ยิง Flux แล้วคืนเป็น array ของ object ตามหัวตาราง */
async function flux(query) {
  const { url, org, token } = cfg();
  const res = await fetch(`${url}/api/v2/query?org=${encodeURIComponent(org)}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/vnd.flux",
      Accept: "application/csv",
    },
    body: query,
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    throw new Error(`InfluxDB ตอบ ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const text = await res.text();
  /* Influx ตอบมาแบบ CRLF — ถ้าไม่ตัด \r ทิ้ง ค่าในคอลัมน์สุดท้ายจะติด \r ไปด้วย
     (เคยทำให้ชื่อ field กลายเป็น "temperature_2\r" แล้วหาในตารางแปลงไม่เจอสักตัว) */
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  // Influx ขึ้นตารางใหม่ด้วยบรรทัดหัวซ้ำได้ ถ้า schema ต่างกัน — จับทุกครั้งที่เจอ
  let header = null;
  const rows = [];
  for (const line of lines) {
    const cells = splitCsvLine(line);
    if (cells[1] === "result" || cells[1] === "") {
      if (cells.includes("_time") || cells.includes("_value")) { header = cells; continue; }
    }
    if (!header) continue;
    const row = {};
    header.forEach((h, i) => { if (h) row[h] = cells[i]; });
    if (row._time) rows.push(row);
  }
  return rows;
}

/**
 * ดึงค่าดิบในช่วงเวลาที่ขอ
 * @returns {Promise<Array<{at: Date, field: string, value: number}>>}
 */
export async function fetchReadings(startIso, stopIso) {
  const { bucket, measurement } = cfg();

  /* `exists r.farm` คือตัวกรองที่สำคัญที่สุดในไฟล์นี้ —
     bucket เดียวกันมีข้อมูลของแท็บ PRUK เก่าปนอยู่ 207,510 จุด ซึ่งเขียนพัง
     (tag กลายเป็น field) แถวพวกนั้นไม่มี tag `farm` จึงคัดออกด้วยเงื่อนไขนี้ */
  const rows = await flux(`
from(bucket: "${bucket}")
  |> range(start: ${startIso}, stop: ${stopIso})
  |> filter(fn: (r) => r._measurement == "${measurement}" and exists r.farm)
  |> keep(columns: ["_time", "_field", "_value"])
`);

  const out = [];
  for (const r of rows) {
    const value = Number(r._value);
    if (!Number.isFinite(value)) continue;
    const at = new Date(r._time);
    if (Number.isNaN(at.getTime())) continue;
    out.push({ at, field: r._field, value });
  }
  return out;
}

/**
 * ค่าล่าสุดของแต่ละ field — ใช้โดยตัวเฝ้า "ข้อมูลยังไหลอยู่ไหม" (T1.295)
 *
 * แยกจาก `fetchReadings` เพราะตัวเฝ้าถามทุก 5 นาที และต้องการแค่ **จุดสุดท้าย**
 * ไม่ใช่ทุกจุดในช่วง (ชั่วโมงละ ~7,000 จุด ดึงมาทั้งหมดทุกรอบคือการเผาทิ้งเปล่า ๆ)
 *
 * `start` ย้อนไกลพอที่จะยัง "เห็น" ตอนท่อหยุดไปหลายวัน — ไม่งั้นพอเงียบเกินช่วงที่ถาม
 * ผลจะกลายเป็นรายการว่าง ซึ่งแยกไม่ออกจาก "ต่อ Influx ไม่ได้"
 *
 * @param {string} [start] ช่วงย้อนหลังแบบ Flux เช่น "-7d"
 * @returns {Promise<Array<{at: Date, field: string, value: number}>>}
 */
export async function lastReadings(start = "-7d") {
  const { bucket, measurement } = cfg();
  const rows = await flux(`
from(bucket: "${bucket}")
  |> range(start: ${start})
  |> filter(fn: (r) => r._measurement == "${measurement}" and exists r.farm)
  |> keep(columns: ["_time", "_field", "_value"])
  |> group(columns: ["_field"])
  |> last()
`);

  const out = [];
  for (const r of rows) {
    const value = Number(r._value);
    const at = new Date(r._time);
    if (!Number.isFinite(value) || Number.isNaN(at.getTime())) continue;
    out.push({ at, field: r._field, value });
  }
  return out;
}

/** เช็กว่าต่อ InfluxDB ได้ไหม — ใช้ตอนบูตเพื่อให้ error ชัดตั้งแต่แรก */
export async function ping() {
  const { url } = cfg();
  const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`InfluxDB /health ตอบ ${res.status}`);
  return res.json();
}
