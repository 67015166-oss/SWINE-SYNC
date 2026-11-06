/**
 * เก็บว่าใครเข้าระบบอยู่และมีสิทธิ์อะไร แล้วกระจายให้ทั้งแอป
 *
 * - เก็บลง localStorage คีย์ของตัวเอง (คนละคีย์กับธีม/การตั้งค่า/เลย์เอาต์/ข้อมูลที่เพิ่มเอง)
 *   เพราะ "ล้างข้อมูลที่เก็บในเครื่อง" ต้องล้างสิทธิ์ไปด้วย แต่คืนค่าธีมไม่ควรแตะสิทธิ์
 * - ตั้ง `data-account` ที่ <html> ให้ CSS ใช้ได้ถ้าต้องซ่อน/หรี่อะไรเป็นบล็อกใหญ่
 *
 * **สิทธิ์มาจากเซิร์ฟเวอร์เท่านั้น** (1 ก.ย. 2569) — `signIn()` ส่งฟอร์มไปให้ /api/auth/login
 * ตรวจ แล้วรับ role กลับมา ไม่มีการตัดสินสิทธิ์ในเบราว์เซอร์อีกแล้ว
 * ค่าที่เก็บใน localStorage เป็นแค่ "ของที่โชว์ระหว่างรอเซิร์ฟเวอร์ตอบ" — ตอนเปิดแอป
 * จะถาม `/api/auth/me` ทุกครั้ง ถ้า token ใช้ไม่ได้ก็ตกกลับไปเป็นยังไม่ได้เข้าระบบ
 * (แก้ค่าในเครื่องให้ตัวเองเป็นแอดมินได้ก็จริง แต่ **ด่านจริงอยู่ที่เซิร์ฟเวอร์**
 *  ซึ่งปฏิเสธทุกคำขอที่เขียนข้อมูลถ้า token ไม่ใช่ของแอดมินจริง)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthContext } from "./useAuth.js";
import { getAccountRole, roleCan } from "./roles.js";
import {
  checkMe,
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  readToken,
  writeToken,
} from "./authApi.js";
import { AUTH_STALE_EVENT, setAuthToken } from "../api/client.js";
import {
  dropLocalLog,
  forgetAccount,
  rememberAccount,
  rememberedAccounts,
  wasAsked,
} from "./sessions.js";

const STORE_KEY = "swine-sync:auth";

/**
 * ถามเซิร์ฟเวอร์ซ้ำทุกกี่มิลลิวินาทีระหว่างใช้งาน (T1.257) — ผู้ดูแลระบบเปลี่ยนสิทธิ์ของใคร
 * หน้าจอของคนนั้นต้องเปลี่ยนตามภายในไม่กี่วินาที ไม่ใช่รอจนกดรีเฟรชเอง
 * (ด่านจริงที่เซิร์ฟเวอร์เปลี่ยนทันทีอยู่แล้ว — ตรงนี้คือทำให้ปุ่มกับป้ายบนจอพูดความจริง)
 */
const RECHECK_MS = 20_000;
/** ถามถี่กว่านี้ไม่ได้ — กันอีเวนต์ 403 หลายตัวพร้อมกันยิง /auth/me รัว ๆ */
const RECHECK_GAP_MS = 3_000;

/**
 * สภาพตอนยังไม่ได้เข้าสู่ระบบ — ได้สิทธิ์ **ผู้ชม** (ต่ำสุด · T1.251 เดิมเป็น "ผู้ใช้งาน")
 *
 * สิทธิ์ผูกกับคนที่เข้าระบบ คนที่ยังไม่ได้เข้าจึงไม่ควรได้สิทธิ์สูงกว่าคนที่เข้ามาแล้ว
 * (หน้าแรกของแอปคือหน้าเข้าสู่ระบบอยู่แล้ว การเข้าเป็นผู้ดูแลระบบจึงอยู่ห่างไปแค่ฟอร์มเดียว)
 */
const SIGNED_OUT = { userId: "", roleId: "viewer" };

/**
 * ค่าที่เก็บไว้ในเครื่อง — ใช้เป็น "ภาพชั่วคราว" ระหว่างรอ /api/auth/me ตอบเท่านั้น
 * ไม่มีการตัดสินสิทธิ์จากค่านี้ เพราะเซิร์ฟเวอร์จะยืนยันทับให้ในเสี้ยววินาทีถัดมา
 */
const readStore = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return SIGNED_OUT;
    const userId = typeof raw.userId === "string" ? raw.userId : "";
    /* ค่าเพี้ยน/รุ่นเก่า → getAccountRole แปลงให้ (user → editor · ไม่รู้จัก → viewer) */
    const roleId = getAccountRole(raw.roleId).id;
    return userId ? { userId, roleId, displayName: raw.displayName ?? userId } : SIGNED_OUT;
  } catch {
    /* โหมดส่วนตัวของบางเบราว์เซอร์ห้ามอ่าน localStorage — ใช้ค่าตั้งต้นไปก่อน */
    return SIGNED_OUT;
  }
};

export function AuthProvider({ children }) {
  const [state, setState] = useState(readStore);
  /* บัญชีที่จดจำไว้อยู่ใน state ด้วย หน้าจอจึงอัปเดตทันที
     (ถ้าอ่านจาก localStorage ตรง ๆ ตอน render จะไม่รู้ว่าค่าเปลี่ยน)
     บันทึกการเข้าใช้งานไม่อยู่ที่นี่แล้ว — เซิร์ฟเวอร์จดเอง หน้าตั้งค่าอ่านผ่าน useAuthEvents (T1.255) */
  const [remembered, setRemembered] = useState(rememberedAccounts);

  /* ลบบันทึกรุ่นเก่าที่ค้างใน localStorage ครั้งเดียวตอนเปิดแอป */
  useEffect(dropLocalLog, []);

  const role = getAccountRole(state.roleId);

  /**
   * ตอนเปิดแอป — เอา token ที่เก็บไว้ไปถามเซิร์ฟเวอร์ว่ายังใช้ได้ไหมและเป็นของใคร
   *
   * **ต้องถามทุกครั้ง ไม่ใช่เชื่อค่าที่เก็บไว้ในเครื่อง** เพราะ session ถูกถอนได้จากฝั่ง
   * เซิร์ฟเวอร์ (แอดมินปิดบัญชี · ตั้งรหัสใหม่ให้ · หมดอายุ 30 วัน) ถ้าไม่ถาม
   * หน้าจอจะยังโชว์ว่าเป็นแอดมินอยู่ทั้งที่ทุกคำขอถูกปฏิเสธหมดแล้ว
   */
  useEffect(() => {
    const token = readToken();
    if (!token) {
      /* ไม่มี token = ยังไม่ได้เข้าระบบ ล้างของที่ค้างในเครื่องทิ้งให้ตรงกัน */
      setState((cur) => (cur.userId ? SIGNED_OUT : cur));
      return;
    }
    setAuthToken(token);
    let alive = true;
    fetchMe().then((res) => {
      if (!alive) return;
      if (res.status === "ok") {
        setState({
          userId: res.user.username,
          roleId: getAccountRole(res.user.role).id,
          displayName: res.user.displayName,
        });
        return;
      }
      if (res.status === "unauthorized") {
        /* เซิร์ฟเวอร์ตอบชัดว่า token นี้ใช้ไม่ได้แล้ว — ออกจากระบบถูกต้อง */
        writeToken(null);
        setState(SIGNED_OUT);
        return;
      }
      /* ★ ต่อไม่ติด/ช้าเกิน/ถูกยกเลิก — **ห้ามลบ token และห้ามเตะออกจากระบบ** (T1.313)
         เราไม่รู้ว่า token ยังใช้ได้ไหม และ "ไม่รู้" ไม่ใช่เหตุผลที่จะทิ้งของผู้ใช้
         คงภาพจากเครื่องไว้ก่อน แล้วรอบหน้าที่เรียกสำเร็จจะยืนยันทับให้เอง
         ทุกคำสั่งที่เขียนข้อมูลยังถูกตรวจสิทธิ์ที่หลังบ้านอยู่ดี จึงไม่ได้เปิดช่องให้ใคร */
      console.warn("ถาม /auth/me ตอนเปิดแอปไม่สำเร็จ — คงสถานะเดิมไว้ ไม่เตะออกจากระบบ");
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * ประกาศบนจอเมื่อสิทธิ์เปลี่ยนจากฝั่งเซิร์ฟเวอร์ (T1.257)
   *   { kind: "changed", from, to }  ผู้ดูแลระบบเปลี่ยนระดับสิทธิ์ของบัญชีนี้
   *   { kind: "revoked" }            token ใช้ไม่ได้แล้ว (ปิดบัญชี · ตั้งรหัสใหม่ · หมดอายุ) → ออกจากระบบ
   */
  const [roleNotice, setRoleNotice] = useState(null);
  /* สภาพล่าสุดสำหรับเทียบตอนเซิร์ฟเวอร์ตอบ — อ่านจาก state ใน closure จะได้ค่าตอนตั้ง listener */
  const currentRef = useRef(state);
  useEffect(() => {
    currentRef.current = state;
  }, [state]);

  /**
   * ถามซ้ำระหว่างใช้งานว่าบัญชีนี้ยังมีสิทธิ์อะไร (T1.257 — ผู้ใช้สั่ง
   * "ตอนผู้ดูแลระบบเปลี่ยนสิทธิ์แอคเคาต์อื่น สิทธิ์ผู้ใช้งานก็ต้องเปลี่ยนด้วย")
   *
   * ถามเมื่อ: ทุก RECHECK_MS ตอนแท็บเปิดดูอยู่ · กลับมาที่แท็บ · หลังบ้านตอบ 401/403 (AUTH_STALE_EVENT)
   * ต่อไม่ติดเฉย ๆ ไม่ทำอะไร — เน็ตสะดุดต้องไม่เตะคนออกจากระบบ
   */
  useEffect(() => {
    if (!state.userId) return undefined;
    let alive = true;
    let busy = false;
    /* เพิ่งถามตอนเปิดแอป/ล็อกอินไป — นับช่วงห่างจากตอนนี้ */
    let last = Date.now();

    const check = async () => {
      if (busy || Date.now() - last < RECHECK_GAP_MS) return;
      busy = true;
      last = Date.now();
      const res = await checkMe();
      busy = false;
      if (!alive) return;
      const cur = currentRef.current;
      if (res.status === "unauthorized") {
        writeToken(null);
        setState(SIGNED_OUT);
        setRoleNotice({ kind: "revoked" });
        return;
      }
      if (res.status !== "ok" || !cur.userId) return;
      const next = {
        userId: res.user.username,
        roleId: getAccountRole(res.user.role).id,
        displayName: res.user.displayName,
      };
      if (
        next.userId === cur.userId &&
        next.roleId === cur.roleId &&
        next.displayName === cur.displayName
      ) {
        return;
      }
      if (next.roleId !== cur.roleId) {
        setRoleNotice({ kind: "changed", from: cur.roleId, to: next.roleId });
      }
      setState(next);
    };

    const whenVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    const timer = setInterval(whenVisible, RECHECK_MS);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", whenVisible);
    window.addEventListener(AUTH_STALE_EVENT, check);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", whenVisible);
      window.removeEventListener(AUTH_STALE_EVENT, check);
    };
  }, [state.userId]);

  const dismissRoleNotice = useCallback(() => setRoleNotice(null), []);

  useEffect(() => {
    document.documentElement.dataset.account = role.id;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      /* เขียนไม่ได้ก็ยังใช้ได้จนกว่าจะปิดแท็บ */
    }
  }, [state, role]);

  /**
   * เข้าสู่ระบบ — **เซิร์ฟเวอร์เป็นคนตรวจ** ที่นี่แค่เก็บผล
   * คืน { ok, message } ให้หน้าจอเอาไปขึ้นข้อความเอง (ไม่ throw เมื่อรหัสผิด)
   */
  const signIn = useCallback(async (username, password) => {
    const res = await apiLogin(username, password);
    if (!res.ok) return res;
    setRoleNotice(null);
    setState({
      userId: res.user.username,
      roleId: getAccountRole(res.user.role).id,
      displayName: res.user.displayName,
    });
    return { ok: true, user: res.user };
  }, []);

  /**
   * ออกจากระบบ — **ถอน session ที่เซิร์ฟเวอร์ด้วย** ไม่ใช่แค่ลืม token ในเครื่อง
   * (ลืมฝั่งเดียว token ยังใช้ได้อีก 30 วันถ้าใครก๊อบไป)
   * ล้าง state ทันทีไม่รอเซิร์ฟเวอร์ — คนกดออกต้องเห็นว่าออกแล้วเดี๋ยวนั้น
   */
  const signOut = useCallback(() => {
    setState(SIGNED_OUT);
    apiLogout();
  }, []);

  /**
   * จดจำบัญชีนี้ไว้ในเครื่อง — **เก็บแค่ชื่อผู้ใช้ ไม่เก็บรหัสผ่านแล้ว**
   * ไม่ต้องเก็บอีกเพราะ session token อยู่ได้ 30 วัน เปิดแอปมาก็ยังล็อกอินค้างอยู่
   */
  const remember = useCallback((userId, roleId) => {
    rememberAccount(userId, roleId, true);
    setRemembered(rememberedAccounts());
  }, []);

  /** ตอบว่า "ไม่ต้องจดจำ" — เก็บไว้เพื่อไม่ถามซ้ำบัญชีนี้อีก (ไม่เก็บรหัสผ่าน) */
  const declineRemember = useCallback((userId, roleId) => {
    rememberAccount(userId, roleId, false);
    setRemembered(rememberedAccounts());
  }, []);

  /** ลืมบัญชีนี้ทิ้ง — ครั้งหน้าเข้ามาจะถามใหม่ */
  const forget = useCallback((userId) => {
    forgetAccount(userId);
    setRemembered(rememberedAccounts());
  }, []);

  const value = useMemo(
    () => ({
      role,
      roleId: role.id,
      /** รหัสผู้ใช้ที่เข้าอยู่ — "" เมื่อยังไม่ได้เข้าสู่ระบบ */
      userId: state.userId,
      /** ชื่อที่แสดง (จากเซิร์ฟเวอร์) — ตกกลับไปใช้ชื่อผู้ใช้ถ้ายังไม่ได้ถาม */
      displayName: state.displayName || state.userId,
      isAdmin: role.id === "admin",
      can: (action) => roleCan(role.id, action),
      signIn,
      signOut,
      /** ประกาศว่าสิทธิ์เปลี่ยนจากฝั่งเซิร์ฟเวอร์ — แสดงโดย components/ui/RoleNotice.jsx */
      roleNotice,
      dismissRoleNotice,
      /** บัญชีที่จดจำไว้ในเครื่องนี้ */
      remembered,
      remember,
      declineRemember,
      forget,
      wasAsked,
    }),
    [
      role,
      state.userId,
      state.displayName,
      signIn,
      signOut,
      roleNotice,
      dismissRoleNotice,
      remembered,
      remember,
      declineRemember,
      forget,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
