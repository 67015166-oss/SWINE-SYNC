/**
 * ตัวเรียก API ของหลังบ้าน — ทุกที่ในแอปต้องผ่านไฟล์นี้ ห้าม fetch เองในเพจ
 *
 * เส้นทางขึ้นต้น /api เสมอ แล้วให้ vite (ตอน dev) หรือ nginx (ตอนขึ้นจริง)
 * เป็นคนส่งต่อไปที่เซิร์ฟเวอร์ — หน้าเว็บจึงไม่ต้องรู้ว่า API อยู่พอร์ตอะไร
 *
 * **ทุกคำขอมี token ติดไปด้วย** ผ่าน `authHeader()` ตั้งแต่ T1.242
 * และหลังบ้านตรวจซ้ำด้วย `requireAuth` ทุกเส้นทางที่ไม่ใช่ `/auth/*` กับ `/health`
 * (เส้นทางที่เขียนข้อมูลตรวจระดับสิทธิ์เพิ่มด้วย `requireRole` — ดู server/src/lib/auth.js)
 *
 * ★ คอมเมนต์เดิมที่นี่เขียนว่า "หลังบ้านยังไม่มีระบบยืนยันตัวตน" ซึ่งค้างมาจากก่อน T1.242
 *   อันตรายกว่าคอมเมนต์ผิดทั่วไป เพราะคนที่มาอ่านต่อจะเชื่อว่า API เปิดโล่ง
 *   แล้วอาจเขียนเส้นทางใหม่โดยไม่ใส่ด่าน หรือตัดสินใจเรื่องความปลอดภัยผิดไปเลย
 */

/** เวลาที่ยอมรอ ก่อนถือว่าหลังบ้านไม่ตอบ */
const TIMEOUT_MS = 8000;

/**
 * ที่อยู่ของหลังบ้าน — **ต้องระบุให้ชัด ห้ามเดาจากโดเมนที่หน้าเว็บบังเอิญไปวางอยู่**
 *
 * เดิมทุกคำขอยิงไปที่ `/api` ของโดเมนปัจจุบัน ซึ่งถูกเมื่ออยู่หลัง nginx ของเราเอง
 * (web:80 ส่งต่อไป api:3000) แต่ **ผิดอย่างอันตรายเมื่อเอา `dist` ไปวางบนโฮสต์ของคนอื่น**
 * — สำเนาที่วางบน lab.plotnexuslab.com จะส่งฟอร์มเข้าสู่ระบบไปที่
 * `https://lab.plotnexuslab.com/api/auth/login` คือ **ส่งชื่อผู้ใช้กับรหัสผ่านให้เซิร์ฟเวอร์
 * ของคนอื่น** โดยที่ไม่มีใครตั้งใจ (เจอตอนตรวจการนำขึ้นโฮสต์ 4 ก.ย. 2569)
 *
 * ค่าที่รับได้ของ `VITE_API_BASE`
 *   ไม่ตั้ง    → `/api` ของโดเมนเดียวกัน (ค่าตั้งต้น — ถูกสำหรับ dev proxy และ compose)
 *   `none`    → **ไม่มีหลังบ้าน** ทุกคำขอถูกปฏิเสธทันทีโดยไม่ส่งอะไรออกไปเลย
 *               ใช้กับสำเนาที่เอาไปวางบนโฮสต์ของคนอื่น (`npm run build:host`)
 *   URL เต็ม  → หลังบ้านอยู่คนละโดเมน เช่น `https://api.example.com/api`
 *               ฝั่งเซิร์ฟเวอร์ต้องเปิด CORS ให้โดเมนของหน้าเว็บด้วย (ดู CORS_ORIGINS)
 */
import { ApiError } from "./apiError.js";
import { toNetworkError } from "./networkError.js";

const RAW_BASE = (import.meta.env.VITE_API_BASE ?? "/api").trim();

/** มีหลังบ้านให้เรียกไหม — หน้าจอใช้ค่านี้บอกผู้ใช้ก่อนที่จะกดอะไรเสียเวลา */
export const apiConfigured = RAW_BASE !== "" && RAW_BASE !== "none";

/** ที่อยู่เต็มของเส้นทางหนึ่ง — ใช้ร่วมกับตัวที่ fetch เองไม่ผ่านไฟล์นี้ (ผู้ช่วย AI) */
export const apiUrl = (path) => `${RAW_BASE.replace(/\/$/, "")}${path}`;

/** ยิงคำขอไม่ได้เพราะยังไม่ได้ตั้งค่าที่อยู่หลังบ้าน — โยนก่อน fetch เสมอ */
const noBackend = () =>
  new ApiError(0, "no_backend", "สำเนานี้ยังไม่ได้ต่อกับเซิร์ฟเวอร์ของ SWINE SYNC");

/**
 * token ของ session ที่ล็อกอินอยู่ — เก็บในตัวแปรของโมดูล ไม่ใช่อ่าน localStorage ทุกคำขอ
 *
 * `AuthProvider` เป็นคนตั้งค่าให้ (ตอนเปิดแอป · ตอนล็อกอิน · ตอนออกจากระบบ)
 * ที่นี่จึงไม่ต้องรู้ว่า token เก็บไว้ที่ไหน และเปลี่ยนที่เก็บทีหลังได้โดยไม่ต้องแก้ไฟล์นี้
 */
let authToken = null;
export const setAuthToken = (token) => {
  authToken = token || null;
};

/**
 * ส่วนหัวที่บอกว่า "คนนี้ล็อกอินอยู่" — **export ออกไปด้วย**
 * เพราะบางเส้นทางเรียก `fetch` เองไม่ผ่านฟังก์ชันในไฟล์นี้ (เช่นการรับคำตอบแบบสายทีละคำ
 * ของผู้ช่วย AI ที่ต้องอ่าน NDJSON ทีละบรรทัด) ที่นั่นก็ยังต้องแนบกุญแจตัวเดียวกันนี้
 */
export const authHeader = () => (authToken ? { Authorization: `Bearer ${authToken}` } : {});

export { ApiError } from "./apiError.js";

/**
 * ชื่ออีเวนต์ "สิทธิ์ที่หน้าจอถืออยู่อาจเก่าแล้ว" — `AuthProvider` ฟังแล้วถามเซิร์ฟเวอร์ใหม่ทันที (T1.257)
 *
 * ยิงเมื่อหลังบ้านตอบ 401/403 **ตอนที่ถือ token อยู่** — แปลว่าผู้ดูแลระบบอาจเพิ่งลดระดับสิทธิ์
 * ปิดบัญชี หรือตั้งรหัสผ่านใหม่ให้ ขณะที่หน้าจอยังโชว์ปุ่มตามสิทธิ์เดิม
 * (ตอนยังไม่ล็อกอินไม่ยิง — 401 จากฟอร์มเข้าสู่ระบบคือรหัสผิดธรรมดา)
 */
export const AUTH_STALE_EVENT = "swine-sync:auth-stale";

/**
 * แปลงคำตอบที่ไม่สำเร็จเป็น ApiError — ทุกเมธอดใช้ตัวนี้ตัวเดียว
 * หลังบ้านตอบ error รูปแบบเดียวกันหมด { error: { code, message } }
 * แต่ถ้าล้มก่อนถึงตรงนั้น (เช่น proxy ตอบ 502) จะไม่ใช่ JSON — กันไว้ด้วย
 */
async function toApiError(res) {
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (authToken && (res.status === 401 || res.status === 403) && typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_STALE_EVENT));
  }
  return new ApiError(
    res.status,
    payload?.error?.code ?? "http_error",
    payload?.error?.message ?? `หลังบ้านตอบ ${res.status}`,
    payload?.error?.details ?? null,
  );
}

/**
 * ★★ วิธีที่ตัวส่งต่อโดเมนยอมให้ผ่าน มีแค่ GET กับ POST (T1.348)
 *
 * ตัวส่งต่อของผู้ให้บริการที่อยู่หน้าสุด (mew.plotnexuslab.com → กล่อง) ตอบ
 * `501 Unsupported method` ให้ PUT, PATCH และ DELETE **ตั้งแต่ก่อนถึงหลังบ้านของเรา**
 * วัดเองเมื่อ 27 ต.ค. 2569: GET 401 · POST 401 · PUT/PATCH/DELETE 501
 *
 * ของนั้นอยู่นอกกล่อง เราแก้ไม่ได้ จึงห่อสามวิธีนั้นเป็น POST แล้วบอกวิธีจริงในหัวคำขอ
 * หลังบ้านแปลงกลับให้เองก่อนเข้าเส้นทาง (ดู `server/src/app.js`)
 *
 * ★ ตอนรันในเครื่อง vite ส่งตรงเข้าพอร์ต 3000 ไม่ผ่านตัวส่งต่อ ทุกวิธีจึงใช้ได้ปกติ
 *   **นี่คือเหตุผลที่บั๊กนี้ไม่มีใครเจอเลยจนกว่าจะเปิดผ่านโดเมนจริง** — เขียนไว้กันลืม
 */
const VIA_POST = new Set(["PUT", "PATCH", "DELETE"]);

/** คืนวิธีที่จะส่งจริง + หัวที่ต้องเติม */
function wireMethod(method) {
  return VIA_POST.has(method)
    ? { method: "POST", overrideHeader: { "X-HTTP-Method-Override": method } }
    : { method, overrideHeader: {} };
}

export async function apiGet(path, { signal } = {}) {
  if (!apiConfigured) throw noBackend();
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  let res;
  try {
    res = await fetch(apiUrl(path), {
      headers: { Accept: "application/json", ...authHeader() },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (err) {
    throw toNetworkError(err);
  }

  if (!res.ok) throw await toApiError(res);

  return res.json();
}

/**
 * ส่งค่าไปเขียนที่หลังบ้านด้วย PUT — ตอนนี้มีที่เดียวคือเกณฑ์แจ้งเตือน (PUT /alerts/rules)
 *
 * ด่านมีสามชั้น: token ที่ติดไปกับคำขอ · `requireRole("editor")` ที่เซิร์ฟเวอร์ ·
 * และสิทธิ์ `system.settings` ที่ฝั่งหน้าเว็บซึ่งปิดปุ่มไว้ก่อนถึงตรงนี้
 * ★ ชั้นที่ฝั่งหน้าเว็บเป็นแค่ความสะดวกของผู้ใช้ **ด่านจริงคือสองชั้นแรก**
 *   อย่าเอาการปิดปุ่มมานับเป็นความปลอดภัย — ใครก็เรียก API ตรงได้
 */
export async function apiPut(path, body, { signal } = {}) {
  if (!apiConfigured) throw noBackend();
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const wire = wireMethod("PUT");
  let res;
  try {
    res = await fetch(apiUrl(path), {
      method: wire.method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...wire.overrideHeader,
        ...authHeader(),
      },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (err) {
    throw toNetworkError(err);
  }

  if (!res.ok) throw await toApiError(res);

  return res.json();
}

/**
 * ส่ง POST/PATCH/DELETE — ใช้กับเส้นทางที่ต้องล็อกอินทั้งหมด (auth · จัดการผู้ใช้)
 *
 * รวมสามอย่างไว้ในตัวเดียวเพราะโครงเหมือนกันหมด ต่างแค่ method
 * `body` เป็น undefined ได้ (เช่น logout ที่ไม่ต้องส่งอะไร)
 */
export async function apiSend(method, path, body, { signal } = {}) {
  if (!apiConfigured) throw noBackend();
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const wire = wireMethod(method);
  let res;
  try {
    res = await fetch(apiUrl(path), {
      method: wire.method,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...wire.overrideHeader,
        ...authHeader(),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (err) {
    throw toNetworkError(err);
  }

  if (!res.ok) throw await toApiError(res);

  return res.status === 204 ? null : res.json();
}

export const apiPost = (path, body, options) => apiSend("POST", path, body, options);
export const apiPatch = (path, body, options) => apiSend("PATCH", path, body, options);
export const apiDelete = (path, options) => apiSend("DELETE", path, undefined, options);
