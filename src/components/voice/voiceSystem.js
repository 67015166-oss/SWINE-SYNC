/**
 * ข้อมูลของระบบ Voice AI ที่ทั้งกรอบ ป๊อบอัพ และหน้า /dashboard/voice ใช้ร่วมกัน
 * แยกจาก VoiceFrame.jsx เพราะไฟล์ที่ export component ต้อง export แต่ component
 * (ไม่งั้น fast refresh ตอน dev ไม่ทำงาน — แบบเดียวกับ lib/api/useLiveFarms.js)
 */
import { LINKED_SYSTEMS } from "../../data/linkedSystems.js";

export const VOICE = LINKED_SYSTEMS.find((item) => item.id === "voice-ai");

