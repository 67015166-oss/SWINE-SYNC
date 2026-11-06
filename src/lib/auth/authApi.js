/**
 * คุยกับ /api/auth ของหลังบ้าน — ที่เดียวที่รู้จักรูปแบบคำตอบของเส้นทางเข้าสู่ระบบ
 *
 * เดิมการตรวจรหัสผ่านเกิดในเบราว์เซอร์ล้วน ๆ (`accounts.js` ที่ฝังรหัส "1234" ไว้)
 * ซึ่งเป็น "การแบ่งหน้าที่" ไม่ใช่ "การกันคนไม่ให้ทำ" — ตอนนี้เซิร์ฟเวอร์เป็นคนตัดสิน
 * และสิทธิ์ที่ได้กลับมาคือสิ่งที่เซิร์ฟเวอร์บอก ไม่ใช่สิ่งที่เบราว์เซอร์เดาเอง
 */
import { apiGet, apiPost, setAuthToken } from "../api/client.js";

/** คีย์เก็บ token ของเครื่องนี้ — แยกจากคีย์อื่นเพื่อให้ล้างทิ้งได้เป็นเอกเทศ */
const TOKEN_KEY = "swine-sync:token";

export const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    /* โหมดส่วนตัวของบางเบราว์เซอร์ห้ามอ่าน localStorage — ถือว่ายังไม่ได้ล็อกอิน */
    return null;
  }
};

/**
 * ติด token ให้ตัวเรียก API ตั้งแต่ตอนโหลดโมดูล — **ก่อน component ตัวไหนจะ render**
 *
 * จำเป็นเพราะ effect ของลูกทำงานก่อน effect ของพ่อแม่เสมอ: หน้าจัดการผู้ใช้ยิง /api/users
 * ตั้งแต่ effect แรกของตัวเอง ซึ่งเกิดก่อนที่ `AuthProvider` จะได้ตั้ง token
 * ผลคือได้ 401 แล้วหน้าขึ้นว่า "ต้องมีสิทธิ์ผู้ดูแลระบบ" ทั้งที่ล็อกอินเป็นแอดมินอยู่
 * (เจอตอนทดสอบจริง 1 ก.ย. 2569) — ตั้งที่นี่ทีเดียวจบ ไม่ต้องไล่แก้ทุกหน้า
 */
setAuthToken(readToken());

export function writeToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* เขียนไม่ได้ก็ยังใช้ได้จนกว่าจะปิดแท็บ (token อยู่ในหน่วยความจำแล้ว) */
  }
  setAuthToken(token);
}

/**
 * เข้าสู่ระบบ
 * @returns {{ok: true, user: object} | {ok: false, code: string, message: string}}
 *          ไม่ throw เมื่อรหัสผิด — หน้าจอต้องขึ้นข้อความ ไม่ใช่จอแดง
 */
export async function login(username, password) {
  try {
    const res = await apiPost("/auth/login", { username, password });
    writeToken(res.token);
    return { ok: true, user: res.user };
  } catch (err) {
    return {
      ok: false,
      code: err.code ?? "network",
      /* ต่อหลังบ้านไม่ติดเป็นคนละเรื่องกับรหัสผิด — ต้องบอกให้ตรง ไม่งั้นคนไปนั่งงมรหัสผ่าน
         และ "สำเนานี้ไม่มีหลังบ้าน" ก็เป็นคนละเรื่องกับ "เซิร์ฟเวอร์ล่ม" อีกที —
         อันแรกลองใหม่กี่ครั้งก็ไม่ติด ต้องบอกทางออกที่ใช้ได้จริงแทน (กดเข้าชมข้อมูลตัวอย่าง) */
      message:
        err.code === "bad_credentials" || err.code === "bad_request"
          ? err.message
          : err.code === "no_backend"
            ? "สำเนานี้ยังไม่ได้ต่อกับเซิร์ฟเวอร์ จึงเข้าสู่ระบบไม่ได้ — กด “เข้าชมข้อมูลตัวอย่าง” ด้านล่างเพื่อดูข้อมูลได้เลย"
            : "ต่อกับเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง",
    };
  }
}

/** ถามว่า token ที่มีอยู่ยังใช้ได้ไหมและเป็นของใคร — เรียกตอนเปิดแอป */
export async function fetchMe() {
  /* ★ เลิกถือว่า "ล้มเพราะอะไรก็ตาม = ยังไม่ได้ล็อกอิน" (T1.313)
     ของเดิมคืน null ทุกกรณี แล้ว AuthProvider เอาไปลบ token ทิ้งและเตะออกจากระบบ
     ผลคือ **เน็ตสะดุดครั้งเดียวตอนเปิดแอป = หลุดออกจากระบบถาวร** (token ถูกลบ)
     และหน้าจอไม่เด้งไปหน้าล็อกอิน มันแค่กลับไปแสดงข้อมูลตัวอย่างเงียบ ๆ
     อาการที่ผู้ใช้เจอคือ "ฟาร์มจริงหายไปบ้างขึ้นบ้าง รีเฟรชแล้วไม่เหมือนเดิม"

     `checkMe()` ข้างล่างแยกสองกรณีนี้ถูกแล้วตั้งแต่ T1.257 เพราะเจอปัญหาเดียวกัน
     **ระหว่างใช้งาน** — ตอนเปิดแอปก็ต้องแยกเหมือนกัน ใช้ตัวเดียวกันไปเลย */
  return checkMe();
}

/**
 * ถามซ้ำระหว่างใช้งานว่า token ยังเป็นของใครและสิทธิ์อะไร (T1.257)
 *
 * **แยก "ถูกปฏิเสธ" ออกจาก "ต่อไม่ติด"** — เน็ตสะดุดครั้งเดียวต้องไม่เตะคนออกจากระบบ
 * ★ ตั้งแต่ T1.313 `fetchMe()` ใช้ตัวนี้ด้วย เพราะตอนเปิดแอปก็ต้องแยกสองกรณีเหมือนกัน
 *   (ของเดิมตอนเปิดแอปถือว่าล้มเพราะอะไรก็ตาม = ยังไม่ได้ล็อกอิน แล้วลบ token ทิ้ง)
 * @returns {{status: "ok", user: object} | {status: "unauthorized"} | {status: "error"}}
 */
export async function checkMe() {
  try {
    const res = await apiGet("/auth/me");
    return res.user ? { status: "ok", user: res.user } : { status: "error" };
  } catch (err) {
    return { status: err.status === 401 ? "unauthorized" : "error" };
  }
}

/** ออกจากระบบ — ถอน session ที่เซิร์ฟเวอร์ด้วย ไม่ใช่แค่ลืม token ในเครื่อง */
export async function logout() {
  try {
    await apiPost("/auth/logout");
  } catch {
    /* ถอนไม่สำเร็จก็ต้องออกจากระบบฝั่งเครื่องอยู่ดี (session จะหมดอายุเองใน 30 วัน) */
  }
  writeToken(null);
}

/**
 * บันทึกการเข้าใช้งานจากเซิร์ฟเวอร์ (ใหม่สุดขึ้นก่อน)
 * ผู้ดูแลระบบได้ทุกบัญชี (`scope: "all"`) · คนอื่นได้เฉพาะของตัวเอง (`scope: "self"`)
 * @returns {{ok: true, scope: "all"|"self", events: {at: string, event: string, username: string}[]}
 *          | {ok: false}}
 */
export async function fetchAuthEvents(limit) {
  try {
    const res = await apiGet(`/auth/events${limit ? `?limit=${limit}` : ""}`);
    return { ok: true, scope: res.scope === "all" ? "all" : "self", events: res.events ?? [] };
  } catch {
    return { ok: false };
  }
}

/** เปลี่ยนรหัสผ่านของตัวเอง */
export async function changePassword(current, next) {
  try {
    await apiPost("/auth/password", { current, next });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message ?? "เปลี่ยนรหัสผ่านไม่สำเร็จ" };
  }
}
