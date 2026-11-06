/**
 * หน้าเข้าสู่ระบบ — เส้นทาง "/login"
 *
 * โครง: แถบบนสุด (โลโก้ + สลับภาษา + ปุ่มเข้าสู่ระบบ) → ฉากฟาร์มเต็มพื้นที่ (FarmScene)
 *       + ม่านขาวโค้ง → การ์ดฟอร์มลอยกลางจอ → แถบลิขสิทธิ์ล่างสุด
 *
 * ค่าตั้งต้นเป็นภาษาไทยตามกติกาโปรเจกต์ ปุ่ม TH/EN สลับข้อความของหน้านี้ได้จริง
 * (พจนานุกรม COPY ด้านล่าง — ไม่ใช่ปุ่มหลอก)
 *
 * **สิทธิ์มาจากสิ่งที่กรอก ไม่มีปุ่มให้เลือกสิทธิ์** — `admin` + รหัสผ่านที่ถูกต้อง = ผู้ดูแลระบบ
 * สิทธิ์มาจากเซิร์ฟเวอร์ (POST /api/auth/login) ไม่ใช่จากสิ่งที่พิมพ์ — ดู lib/auth/authApi.js
 *
 * **จดจำบัญชี**: เข้าสำเร็จครั้งแรกของแต่ละรหัสผู้ใช้จะถามว่า "จดจำไว้ในเครื่องนี้ไหม"
 * ตอบแล้วจำคำตอบไว้ ไม่ถามซ้ำอีก · ติ๊กช่อง "จดจำการเข้าสู่ระบบ" ไว้ก่อนก็ข้ามคำถามไปเลย
 * บัญชีที่จดจำไว้จะขึ้นเป็นปุ่มลัดเหนือฟอร์ม กดแล้วเติมรหัสผู้ใช้ให้ **แต่ยังต้องกรอกรหัสผ่านเอง**
 * (กติกาและที่เก็บอยู่ใน lib/auth/sessions.js — เก็บแค่รหัสผู้ใช้ ไม่เก็บรหัสผ่านเด็ดขาด)
 *
 * ยังไม่มีระบบ auth จริง: ตรวจกันเองในเบราว์เซอร์ ไม่ได้ส่งรหัสผ่านไปที่ใด
 * และไม่ได้เก็บรหัสผ่านไว้เลย (เก็บแค่ชื่อผู้ใช้กับสิทธิ์) · Google/SSO ยังไม่เปิดใช้งาน
 * เมื่อต่อ backend จริงให้แก้เนื้อใน handleSubmit ที่เดียว
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card from "../components/ui/Card.jsx";
import Icon from "../components/ui/Icon.jsx";
import FarmScene from "../components/ui/FarmScene.jsx";
import { useSettings } from "../lib/settings/useSettings.js";
import { useAuth } from "../lib/auth/useAuth.js";
import { getAccountRole } from "../lib/auth/roles.js";
import "./Login.css";
import { asset } from "../lib/asset.js";
import { useLang } from "../lib/i18n/useT.js";

/**
 * ภาพถ่ายฟาร์มสำหรับพื้นหลัง — วางไฟล์ไว้ในโฟลเดอร์ public/ ของโปรเจกต์
 * ไล่ลองตามลำดับ ถ้าไม่มีไฟล์ไหนเลยจะถอยไปใช้ภาพวาด FarmScene อัตโนมัติ
 * (แนะนำ .jpg คุณภาพ ~80 ขนาดกว้าง 1920–2400px เพื่อให้โหลดเร็ว)
 */
const FARM_PHOTOS = [asset("/farm-hero.jpg"), asset("/farm-hero.png"), asset("/farm-hero.webp")];

/** ปุ่มภาษาบนหน้านี้วนสามภาษา ไทย → อังกฤษ → จีน → ไทย (ชุดเดียวกับ LANGS ใน i18n) */
const NEXT_LANG = { th: "en", en: "zh", zh: "th" };
const LANG_CODE = { th: "TH", en: "EN", zh: "中文" };

const COPY = {
  th: {
    login: "เข้าสู่ระบบ",
    title: "ยินดีต้อนรับกลับ",
    sub: "เข้าสู่ระบบเพื่อใช้งาน SWINE SYNC",
    userLabel: "อีเมล / ชื่อผู้ใช้",
    userPlaceholder: "กรอกอีเมลหรือชื่อผู้ใช้",
    passLabel: "รหัสผ่าน",
    passPlaceholder: "กรอกรหัสผ่าน",
    remember: "จดจำการเข้าสู่ระบบ",
    forgot: "ลืมรหัสผ่าน?",
    busy: "กำลังเข้าสู่ระบบ…",
    or: "หรือเข้าสู่ระบบด้วย",
    google: "บัญชี Google",
    sso: "SSO ขององค์กร",
    noAccount: "ยังไม่มีบัญชีใช่ไหม?",
    contact: "ติดต่อผู้ดูแลระบบ",
    guest: "เข้าชมข้อมูลตัวอย่างในสิทธิ์ผู้ใช้งาน โดยไม่ต้องเข้าสู่ระบบ",
    errEmpty: "กรุณากรอกอีเมล/ชื่อผู้ใช้ และรหัสผ่านให้ครบ",
    errPassword: "รหัสผ่านไม่ถูกต้อง",
    savedList: "บัญชีที่จดจำไว้ในเครื่องนี้",
    savedPass: "รหัสผ่านที่บันทึกไว้",
    forgetOne: "ลืมบัญชีนี้",
    askTitle: "จดจำ {id} ไว้ในเครื่องนี้ไหม?",
    askNote:
      "ครั้งหน้ากดชื่อจากช่องแรกแล้วเข้าได้เลย — เก็บรหัสผ่านไว้ในเครื่องนี้ด้วย ใช้กับเครื่องส่วนตัวเท่านั้น",
    askYes: "จดจำไว้",
    askNo: "ไม่ต้อง",
    notReady: "ยังไม่เปิดใช้งานในรุ่นสาธิต — ใช้ช่องกรอกด้านบนไปก่อนได้เลย",
    showPass: "แสดงรหัสผ่าน",
    hidePass: "ซ่อนรหัสผ่าน",
    langLabel: "เปลี่ยนเป็นภาษาอังกฤษ",
    home: "กลับหน้าแรก",
    rights: "© 2569 เครือเจริญโภคภัณฑ์อาหาร · สงวนลิขสิทธิ์ · ข้อมูลบนหน้านี้เป็นข้อมูลตัวอย่าง",
  },
  en: {
    login: "Login",
    title: "Welcome Back",
    sub: "Sign in to continue to SWINE SYNC",
    userLabel: "Email / Username",
    userPlaceholder: "Enter your email or username",
    passLabel: "Password",
    passPlaceholder: "Enter your password",
    remember: "Remember me",
    forgot: "Forgot Password?",
    busy: "Signing in…",
    or: "or continue with",
    google: "Continue with Google",
    sso: "Continue with SSO",
    noAccount: "Don't have an account?",
    contact: "Contact Administrator",
    guest: "Explore the demo data as a User, without signing in",
    errEmpty: "Please fill in both your email/username and password",
    errPassword: "Incorrect password",
    savedList: "Accounts saved on this device",
    savedPass: "Saved password",
    forgetOne: "Forget this account",
    askTitle: "Remember {id} on this device?",
    askNote:
      "Next time, pick the name in the first field and you are straight in — the password is stored on this device too. Use on personal devices only.",
    askYes: "Remember",
    askNo: "Not now",
    notReady: "Not available in this demo — please use the form above",
    showPass: "Show password",
    hidePass: "Hide password",
    langLabel: "เปลี่ยนเป็นภาษาไทย",
    home: "Back to home",
    rights: "© 2026 CPF Group · All rights reserved · Demo data only",
  },
  zh: {
    login: "登录",
    title: "欢迎回来",
    sub: "登录以使用 SWINE SYNC",
    userLabel: "邮箱 / 用户名",
    userPlaceholder: "请输入邮箱或用户名",
    passLabel: "密码",
    passPlaceholder: "请输入密码",
    remember: "记住登录状态",
    forgot: "忘记密码？",
    busy: "正在登录…",
    or: "或使用以下方式登录",
    google: "使用 Google 账号",
    sso: "企业 SSO",
    noAccount: "还没有账号？",
    contact: "联系系统管理员",
    guest: "以普通用户身份浏览演示数据，无需登录",
    errEmpty: "请填写邮箱/用户名与密码",
    errPassword: "密码不正确",
    savedList: "本机已记住的账号",
    savedPass: "已保存的密码",
    forgetOne: "忘记此账号",
    askTitle: "要在本机记住 {id} 吗？",
    askNote: "下次在第一个输入框点选名字即可直接进入 — 密码也会保存在本机，请仅在个人设备上使用。",
    askYes: "记住",
    askNo: "暂不",
    notReady: "演示版尚未开放 — 请先使用上方的表单",
    showPass: "显示密码",
    hidePass: "隐藏密码",
    langLabel: "เปลี่ยนเป็นภาษาไทย",
    home: "返回首页",
    rights: "© 2026 正大食品集团 · 版权所有 · 本页数据为演示数据",
  },
};

/* ---------- ไอคอนเซนเซอร์ที่ "อยู่ในภาพถ่าย" ----------
 * ภาพ farm-hero มีไอคอนวงกลมเขียวติดมาในไฟล์ (ตัวมันเองขยับไม่ได้)
 * จึงวางไอคอนของเราทับตำแหน่งเดิมให้พอดี แล้วทำให้ลอยขึ้น-ลงแทน
 * ตำแหน่งเป็นสัดส่วนของภาพต้นฉบับ (วัดจากไฟล์จริง 1672x941)
 * และคำนวณกรอบภาพหลัง object-fit: cover เอง ตำแหน่งจึงตรงทุกขนาดจอ
 */
const PHOTO_W = 1672;
const PHOTO_H = 941;
const PHOTO_FOCUS_Y = 0.42; /* ต้องตรงกับ object-position: center 42% ใน Login.css */
const PHOTO_CHIP_SIZE = 0.052; /* เส้นผ่านศูนย์กลาง เทียบความกว้างภาพ (ใหญ่พอกลบไอคอนเดิมตลอดช่วงที่ลอย) */
const PHOTO_CHIP_LIFT = 0.0038; /* ระยะลอย เทียบความกว้างภาพ (ต้องน้อยกว่าส่วนที่เผื่อไว้กลบ) */

/**
 * ตำแหน่ง + สีของไอคอนแต่ละจุด
 * `tint` คือสีเขียวของวงกลมเดิม "หลังผสมกับภาพแล้ว" (สุ่มวัดจากไฟล์ต้นฉบับจุดละ ~140 พิกเซล)
 * ใช้สีนี้ทึบ ๆ แทนการทำโปร่งแสง เพราะถ้าโปร่งจะเห็นไอคอนเดิมทะลุขึ้นมาซ้อนกัน
 * ผลที่ได้จึงกลมกลืนเหมือนอยู่ในภาพเดิม ไม่ฉูดฉาดกว่าของเดิม
 */
const PHOTO_CHIPS = [
  { icon: "pig", x: 0.0781, y: 0.4745, tint: "rgb(141, 174, 128)" },
  { icon: "wifi", x: 0.1905, y: 0.454, tint: "rgb(146, 170, 128)" },
  { icon: "feed", x: 0.4052, y: 0.452, tint: "rgb(145, 176, 133)" },
  { icon: "wind", x: 0.5443, y: 0.4595, tint: "rgb(112, 158, 130)" },
  { icon: "drop", x: 0.7032, y: 0.4425, tint: "rgb(106, 156, 134)" },
  { icon: "wind", x: 0.7942, y: 0.4664, tint: "rgb(103, 154, 131)" },
  { icon: "thermometer", x: 0.9164, y: 0.4418, tint: "rgb(97, 151, 126)" },
];

/* จุดเซนเซอร์ลอยบนฉากหลัง — ตำแหน่งเป็น % ของพื้นที่ฉาก */
const SCENE_CHIPS = [
  { icon: "wifi", top: "22%", left: "13%" },
  { icon: "cloud", top: "43%", left: "9%" },
  { icon: "monitor", top: "64%", left: "15%" },
  { icon: "pulse", top: "38%", left: "84%" },
];

export default function Login() {
  const navigate = useNavigate();
  /* หน้าแรกที่ผู้ใช้ตั้งไว้ — เข้าสู่ระบบแล้วไปที่นั่นเลย ไม่ต้องผ่านหน้าภาพรวมก่อน */
  const { homePath } = useSettings();
  /* สิทธิ์มาจากสิ่งที่กรอกในฟอร์ม ไม่มีปุ่มให้เลือกสิทธิ์ — ผู้เข้าระบบเลือกสิทธิ์ให้ตัวเองไม่ได้
     (เซิร์ฟเวอร์เป็นคนตัดสิน · ตั้งจริงตอนกดเข้าสู่ระบบ ไม่ใช่ระหว่างพิมพ์) */
  const {
    signIn,
    signOut,
    remembered,
    remember: rememberAccount,
    declineRemember,
    forget,
    wasAsked,
  } = useAuth();
  const userRef = useRef(null);
  const userFieldRef = useRef(null);
  const passRef = useRef(null);
  /* **ใช้ภาษาของทั้งแอป ไม่ใช่ state ของหน้านี้เอง** (แก้ 10 ก.ย. 2569)
     ของเดิมหน้านี้เก็บภาษาไว้เอง ผลคือคนที่ตั้งแอปเป็นอังกฤษไว้ พอออกจากระบบ
     จะเจอหน้าเข้าสู่ระบบเป็นภาษาไทยเสมอ และปุ่มสลับภาษาตรงนี้ก็ไม่มีผลกับหน้าอื่นเลย
     ตอนนี้กดแล้วเปลี่ยนทั้งแอปและจำไว้ใน localStorage เหมือนที่ตั้งจากหน้าตั้งค่า */
  const { lang, setLang } = useLang();
  /* บัญชีล่าสุดที่จดจำไว้ = เติมรหัสผู้ใช้ให้เลย (ไม่มีรายการให้เลือกโชว์ค้างบนหน้าจอ)
     นี่คือสิ่งที่ได้จากการตอบว่า "จดจำไว้" — เปิดหน้ามาแล้วเหลือกรอกแค่รหัสผ่าน
     เก็บแค่รหัสผู้ใช้ ไม่เก็บรหัสผ่าน จึงไม่มีทางเข้าระบบได้เองโดยไม่กรอกอะไรเลย */
  const [userId, setUserId] = useState(() => remembered[0]?.userId ?? "");
  /* **ไม่เติมรหัสผ่านให้แล้ว** — เลิกเก็บรหัสผ่านในเครื่องตั้งแต่ทำ auth จริง (1 ก.ย. 2569)
     ไม่ต้องเก็บอีกเพราะ session อยู่ได้ 30 วัน คนที่เคยเข้าจะไม่เจอหน้านี้อยู่แล้ว */
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  /* บัญชีที่ตรวจผ่านแล้วและกำลังรอคำตอบว่า "จดจำไว้ไหม" (null = ไม่ได้ถามอยู่)
     ยังไม่ signIn จนกว่าจะตอบ — จะได้ไม่เด้งออกจากหน้าไปทั้งที่คำถามยังค้าง */
  const [ask, setAsk] = useState(null);
  /* รายการบัญชีที่จดจำไว้ ร่วงลงมาจากช่องรหัสผู้ใช้ตอนกดที่ช่อง (ปิดอยู่เป็นค่าตั้งต้น)
     ไม่โชว์ค้างบนหน้าจอ แต่กดใช้ซ้ำได้ตลอด — เหมือนช่องกรอกที่เบราว์เซอร์เติมให้ */
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /* ไล่ลองไฟล์ภาพทีละนามสกุล — หมดแล้วยังไม่ได้ก็ใช้ภาพวาด FarmScene ที่อยู่ชั้นล่าง */
  const [photoIndex, setPhotoIndex] = useState(0);
  const photo = FARM_PHOTOS[photoIndex];

  /* กรอบของภาพหลัง object-fit: cover — ใช้วางไอคอนให้ทับตำแหน่งเดิมในภาพพอดี */
  const stageRef = useRef(null);
  const [frame, setFrame] = useState(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!photo || !el) {
      setFrame(null);
      return undefined;
    }
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      const scale = Math.max(width / PHOTO_W, height / PHOTO_H);
      const w = PHOTO_W * scale;
      const h = PHOTO_H * scale;
      setFrame({ w, h, left: (width - w) / 2, top: (height - h) * PHOTO_FOCUS_Y });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [photo]);

  /* เติมรหัสผู้ใช้ไว้แล้ว → เด้งไปช่องรหัสผ่านเลย ไม่ต้องกดผ่านช่องแรกที่กรอกไว้ให้อยู่แล้ว
     (รันครั้งเดียวตอนเปิดหน้า ไม่ใช่ทุกครั้งที่พิมพ์) */
  useEffect(() => {
    if (userId) passRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* กดที่อื่นแล้วรายการต้องหุบ — ใช้ pointerdown ไม่ใช่ blur ของช่องกรอก
     เพราะ blur จะยิงก่อนคลิกในรายการทำงาน แล้วปุ่มที่กดจะหายไปก่อนโดนกด */
  useEffect(() => {
    if (!suggestOpen) return undefined;
    const close = (e) => {
      if (!userFieldRef.current?.contains(e.target)) setSuggestOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [suggestOpen]);

  const t = COPY[lang];

  /**
   * เข้าระบบจริงแล้วไปหน้าที่ตั้งไว้
   *
   * ยังไม่มี backend — หน่วงสั้น ๆ ให้เห็นสถานะปุ่ม แล้วเข้าหน้าที่ตั้งไว้ใน "หน้าเปิดระบบ"
   * (เดิมตรึงไว้ที่ /dashboard เสมอ ค่านั้นในหน้าตั้งค่าจึงไม่มีผลกับอะไรเลย
   *  นอกจากลิงก์ "เข้าชมแบบผู้เยี่ยมชม" ข้างล่าง — ผู้ใช้กดเปลี่ยนแล้วไม่เห็นอะไรเปลี่ยน)
   * ปุ่ม "หน้าแรก" และโลโก้บนแถบเมนูยังไปหน้าภาพรวมเสมอ เป็นจุดยืนที่ไม่ขยับตามค่านี้
   *
   * บันทึกลงประวัติการเข้าใช้งานอัตโนมัติที่ AuthProvider ไม่ต้องเรียกเองที่นี่
   */
  /* เข้าระบบสำเร็จแล้ว (AuthProvider ตั้ง state ไปตั้งแต่ signIn) — เหลือแค่พาไปหน้าแรก
     หน่วง 400ms ให้ปุ่มได้ขึ้นสถานะ "กำลังเข้าสู่ระบบ…" ก่อน ไม่งั้นกระพริบแล้วหายไปเฉย ๆ */
  const finish = () => {
    setAsk(null);
    setBusy(true);
    setTimeout(() => navigate(homePath), 400);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userId.trim() || !password) {
      setError(t.errEmpty);
      userRef.current?.focus();
      return;
    }

    /* **เซิร์ฟเวอร์เป็นคนตรวจ** ไม่ใช่เบราว์เซอร์ (เดิมตรวจกับรหัสที่ฝังไว้ในโค้ด)
       ระหว่างรอต้องปิดปุ่มไว้ ไม่งั้นกดรัว ๆ แล้วยิงคำขอซ้อนกันหลายอัน */
    setBusy(true);
    const res = await signIn(userId.trim(), password);
    setBusy(false);

    if (!res.ok) {
      /* เข้าไม่สำเร็จ — ขึ้นข้อความจากเซิร์ฟเวอร์ตรง ๆ (แยกได้ว่ารหัสผิดหรือต่อไม่ติด)
         เซิร์ฟเวอร์จดลงบันทึกการเข้าใช้งานเองแล้ว ไม่ต้องจดซ้ำในเครื่อง */
      setError(res.message || t.errPassword);
      setPassword("");
      passRef.current?.focus();
      return;
    }

    const result = { userId: res.user.username, roleId: res.user.role };
    setError("");
    /* ติ๊กช่องไว้ล่วงหน้า = ตอบคำถามไปแล้ว ไม่ต้องถามซ้ำให้เสียเวลา */
    if (remember) {
      rememberAccount(result.userId, result.roleId);
      finish(result);
      return;
    }
    /* ถามครั้งเดียวต่อหนึ่งบัญชีต่อหนึ่งเครื่อง — ตอบว่าไม่ต้องก็จำคำตอบนั้นไว้เหมือนกัน
       (ไม่งั้นกลายเป็นถามทุกครั้งที่เข้าระบบ ซึ่งน่ารำคาญกว่าที่ได้ประโยชน์)
       ปุ่มขึ้นสถานะ "กำลังเข้าสู่ระบบ…" ไปด้วย เพราะเข้าระบบได้แล้วจริง ๆ เหลือแค่คำถามนี้ */
    if (!wasAsked(result.userId)) {
      setBusy(true);
      /* พกรหัสผ่านที่เพิ่งกรอกไปด้วย — ถ้าตอบว่าจดจำ จะได้เก็บไว้ให้กดทีเดียวเข้าครั้งหน้า */
      setAsk(result);
      return;
    }
    finish(result);
  };

  /** ตอบคำถามในป๊อบอัพ — จดจำหรือไม่ก็ตาม ปิดแล้วเข้าระบบต่อทันทีเสมอ */
  const answerAsk = (save) => {
    if (save) rememberAccount(ask.userId, ask.roleId);
    else declineRemember(ask.userId, ask.roleId);
    finish(ask);
  };

  /**
   * เลือกบัญชีจากรายการที่ร่วงลงมา — **กดทีเดียวเข้าเลย**
   * เติมทั้งสองช่องให้เห็นว่าเกิดอะไรขึ้น แล้วเข้าระบบต่อทันที ไม่ต้องกดปุ่มซ้ำ
   * (บัญชีในรายการผ่านการตอบว่า "จดจำไว้" มาแล้ว จึงไม่ต้องถามอะไรอีก)
   */
  const pickAccount = (account) => {
    setSuggestOpen(false);
    setUserId(account.userId);
    setError("");
    /* **เติมแค่ชื่อผู้ใช้ ไม่เข้าระบบให้** — เลิกเก็บรหัสผ่านในเครื่องแล้ว (1 ก.ย. 2569)
       คนที่เคยเข้าจากเครื่องนี้ส่วนใหญ่จะไม่เห็นหน้านี้อยู่แล้ว เพราะ session อยู่ได้ 30 วัน */
    passRef.current?.focus();
  };

  return (
    <div className="login">
      <header className="login-top">
        <Link to="/" className="login-brand" aria-label={t.home}>
          <span className="app-brand-mark" aria-hidden="true">
            <Icon name="pig" size={24} />
          </span>
          <span className="login-brand-name">SWINE SYNC</span>
        </Link>

        <div className="login-top-actions">
          <button
            type="button"
            className="login-lang"
            onClick={() => setLang(NEXT_LANG[lang] ?? "en")}
            aria-label={t.langLabel}
          >
            <Icon name="globe" size={18} />
            {LANG_CODE[lang] ?? "TH"}
          </button>
          <button
            type="button"
            className="login-top-btn"
            onClick={() => userRef.current?.focus()}
          >
            <Icon name="user" size={19} />
            {t.login}
          </button>
        </div>
      </header>

      <main className={"login-stage" + (photo ? " has-photo" : "")} ref={stageRef}>
        <FarmScene className="login-scene" />
        {photo && (
          /* ภาพถ่ายกับไอคอนอยู่ในชั้นเดียวกัน จะได้ไหลไปพร้อมกันตอนฉากหลังขยับ */
          <div className="login-photo-layer">
            <img
              className="login-photo"
              src={photo}
              alt=""
              aria-hidden="true"
              onError={() => setPhotoIndex((i) => i + 1)}
            />

            {frame && (
              <div className="login-photo-chips" aria-hidden="true">
                {PHOTO_CHIPS.map((c, i) => {
                  const size = PHOTO_CHIP_SIZE * frame.w;
                  return (
                    <span
                      key={`${c.icon}-${i}`}
                      className="login-photo-chip"
                      style={{
                        left: `${frame.left + c.x * frame.w}px`,
                        top: `${frame.top + c.y * frame.h}px`,
                        width: `${size}px`,
                        height: `${size}px`,
                        animationDelay: `${-0.8 * i}s`,
                        background: c.tint,
                        "--lift": `${PHOTO_CHIP_LIFT * frame.w}px`,
                      }}
                    >
                      <Icon name={c.icon} size={Math.round(size * 0.46)} />
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div className="login-veil" aria-hidden="true" />

        <div className="login-chips" aria-hidden="true">
          {SCENE_CHIPS.map((c) => (
            <span
              key={c.icon}
              className="login-chip"
              style={{ top: c.top, left: c.left }}
            >
              <Icon name={c.icon} size={22} />
            </span>
          ))}
        </div>

        <Card className="login-card">
          <h1 className="login-card-title">{t.title}</h1>
          <p className="login-card-sub">{t.sub}</p>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <label className="login-field">
              <span className="login-label">{t.userLabel}</span>
              <span className="login-control" ref={userFieldRef}>
                <Icon name="user" size={19} className="login-control-icon" />
                <input
                  ref={userRef}
                  type="text"
                  className="login-input"
                  value={userId}
                  onChange={(e) => {
                    setUserId(e.target.value);
                    setSuggestOpen(false);
                  }}
                  /* กดหรือแท็บเข้าช่องนี้ = อยากเปลี่ยนบัญชี จึงกางรายการที่จดจำไว้ให้เลือก */
                  onFocus={() => setSuggestOpen(remembered.length > 0)}
                  onClick={() => setSuggestOpen(remembered.length > 0)}
                  onKeyDown={(e) => e.key === "Escape" && setSuggestOpen(false)}
                  placeholder={t.userPlaceholder}
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={suggestOpen}
                  aria-controls="login-suggest"
                />
                {remembered.length > 0 && (
                  <button
                    type="button"
                    className={"login-caret" + (suggestOpen ? " is-open" : "")}
                    /* กันช่องกรอกหลุดโฟกัสก่อนคลิกจะทำงาน */
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSuggestOpen((v) => !v);
                      userRef.current?.focus();
                    }}
                    aria-label={t.savedList}
                    aria-expanded={suggestOpen}
                  >
                    <Icon name="chevron" size={18} />
                  </button>
                )}

                {/* บัญชีที่จดจำไว้ — ร่วงลงมาทับเนื้อหาข้างล่าง ไม่ดันการ์ดให้ยาวขึ้น */}
                {suggestOpen && remembered.length > 0 && (
                  <ul className="login-suggest" id="login-suggest" role="listbox">
                    <li className="login-suggest-head">{t.savedList}</li>
                    {remembered.map((a) => (
                      <li key={a.userId} className="login-suggest-item" role="option" aria-selected={userId === a.userId}>
                        <button
                          type="button"
                          className="login-suggest-btn"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickAccount(a)}
                          title={a.userId}
                        >
                          <Icon name={getAccountRole(a.roleId).icon} size={19} />
                          <span className="login-suggest-text">
                            <span className="login-suggest-id">{a.userId}</span>
                            {/* จุดแทนรหัสผ่านที่เก็บไว้ — บอกว่าแถวนี้กดแล้วเข้าได้เลย
                                ไม่ใช่แค่เติมชื่อให้ (แถวเก่าที่ไม่มีรหัสผ่านจะไม่มีจุด) */}
                            {a.password && (
                              <span className="login-suggest-dots" aria-label={t.savedPass}>
                                {"•".repeat(Math.min(a.password.length, 12))}
                              </span>
                            )}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="login-suggest-x"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => forget(a.userId)}
                          title={t.forgetOne}
                          aria-label={`${t.forgetOne} — ${a.userId}`}
                        >
                          <Icon name="cross" size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </span>
            </label>

            <label className="login-field">
              <span className="login-label">{t.passLabel}</span>
              <span className="login-control">
                <Icon name="lock" size={19} className="login-control-icon" />
                <input
                  ref={passRef}
                  type={showPassword ? "text" : "password"}
                  className="login-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.passPlaceholder}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t.hidePass : t.showPass}
                  aria-pressed={showPassword}
                >
                  <Icon name={showPassword ? "eye-off" : "eye"} size={19} />
                </button>
              </span>
            </label>

            <div className="login-row">
              <label className="login-remember">
                <input
                  type="checkbox"
                  className="login-checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                {t.remember}
              </label>
              <button
                type="button"
                className="login-link"
                onClick={() => setError(t.notReady)}
              >
                {t.forgot}
              </button>
            </div>

            {error && (
              <p className="login-error" role="alert">
                <Icon name="warn" size={18} />
                {error}
              </p>
            )}

            <button type="submit" className="login-submit" disabled={busy}>
              <Icon name="login" size={19} />
              {busy ? t.busy : t.login}
            </button>

            <p className="login-divider">
              <span>{t.or}</span>
            </p>

            <div className="login-alts">
              <button
                type="button"
                className="login-alt"
                onClick={() => setError(t.notReady)}
              >
                <Icon name="google" size={19} />
                {t.google}
              </button>
              <button
                type="button"
                className="login-alt"
                onClick={() => setError(t.notReady)}
              >
                <Icon name="key" size={19} />
                {t.sso}
              </button>
            </div>
          </form>

          <p className="login-foot-note">
            {t.noAccount}{" "}
            <a className="login-link is-inline" href="mailto:admin@swinesync.co.th">
              {t.contact}
            </a>
          </p>
          {/* เข้าดูโดยไม่ล็อกอิน = สภาพ "ยังไม่ได้เข้าสู่ระบบ" ซึ่งได้สิทธิ์ผู้ใช้งาน
              (ล้างของเดิมด้วย ไม่งั้นคนที่เคยเข้าเป็นผู้ดูแลระบบจะยังถือสิทธิ์นั้นติดไป) */}
          <Link to={homePath} className="login-guest" onClick={signOut}>
            {t.guest}
            <Icon name="chevron" size={16} />
          </Link>
        </Card>

        {/* ป๊อบอัพ "จดจำบัญชีนี้ไหม" — ลอยอยู่มุมบน ไม่ใช่ในการ์ด
            เหมือนตอนเบราว์เซอร์ถามว่าจะจำรหัสผ่านไหม: ตรวจผ่านแล้ว กำลังเข้าระบบอยู่
            แค่ถามแถมก่อนไป ตอบปุ๊บก็หายไปเลย ไม่มีอะไรค้างอยู่บนหน้าจอ */}
        {ask && (
          <div className="login-pop" role="dialog" aria-label={t.askTitle.replace("{id}", ask.userId)}>
            <button
              type="button"
              className="login-pop-x"
              onClick={() => answerAsk(false)}
              aria-label={t.askNo}
            >
              <Icon name="cross" size={17} />
            </button>
            <p className="login-pop-title">
              <span className="icon-chip is-sm" aria-hidden="true">
                <Icon name={getAccountRole(ask.roleId).icon} size={18} />
              </span>
              {t.askTitle.replace("{id}", ask.userId)}
            </p>
            <p className="login-pop-note">{t.askNote}</p>
            <div className="login-pop-btns">
              <button type="button" className="login-pop-no" onClick={() => answerAsk(false)}>
                {t.askNo}
              </button>
              <button type="button" className="login-pop-yes" onClick={() => answerAsk(true)}>
                {t.askYes}
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="login-bottom">{t.rights}</footer>
    </div>
  );
}
