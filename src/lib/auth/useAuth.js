/**
 * ตัวกลางของสิทธิ์การใช้งาน — แยกออกจาก AuthProvider.jsx เพราะไฟล์ที่ export component
 * ห้าม export อย่างอื่นปนด้วย ไม่งั้น hot reload ตอน dev จะรีเฟรชทั้งหน้าแทนที่จะเปลี่ยนเฉพาะส่วน
 */
import { createContext, useContext } from "react";
import { getAccountRole, roleCan } from "./roles.js";

/**
 * ค่าตั้งต้นเผื่อ component ที่อยู่นอก provider (เช่นในเทสต์) — ใช้สิทธิ์ต่ำสุดเหมือน
 * สภาพ "ยังไม่ได้เข้าสู่ระบบ" และไม่ใช่ null เพราะ `can()` ต้องเรียกได้เสมอโดยไม่ต้องเช็กก่อน
 */
const GUEST_ROLE = "viewer";

export const AuthContext = createContext({
  role: getAccountRole(GUEST_ROLE),
  roleId: GUEST_ROLE,
  userId: "",
  isAdmin: false,
  can: (action) => roleCan(GUEST_ROLE, action),
  signIn: () => {},
  signOut: () => {},
  roleNotice: null,
  dismissRoleNotice: () => {},
  /* บัญชีที่จดจำไว้ (ดู sessions.js) — นอก provider ถือว่า "ยังไม่มีอะไร" */
  remembered: [],
  remember: () => {},
  declineRemember: () => {},
  forget: () => {},
  wasAsked: () => false,
});

/**
 * อ่านสิทธิ์ที่ใช้อยู่ (ดูรายละเอียดที่ AuthProvider.jsx และกติกาที่ roles.js)
 *
 *   const { can, isAdmin } = useAuth();
 *   <button disabled={!can("farm.manage")}>ลบฟาร์ม</button>
 *
 * @returns {{
 *   role: object, roleId: string, userId: string, isAdmin: boolean,
 *   can: (action: string) => boolean,
 *   signIn: (userId: string, roleId: string) => void, signOut: () => void,
 *   remembered: object[],
 *   remember: (userId: string, roleId: string, password?: string) => void,
 *   declineRemember: (userId: string, roleId: string) => void,
 *   forget: (userId: string) => void, wasAsked: (userId: string) => boolean,
 * }}
 */
export const useAuth = () => useContext(AuthContext);
