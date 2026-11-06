/**
 * สั่งเปิดห้องแชทผู้ช่วย AI จากที่อื่นในแอป — ตอนนี้ใช้ที่เมนู "Chatbot AI" ในแถบซ้าย (T1.247)
 *
 * ทำไมเป็น event แทน context: state `open` ของห้องแชทอยู่ใน Assistant.jsx ตัวเดียว
 * ซึ่งอยู่นอก <Routes> และนอกทุกโครงหน้า ยก state ขึ้นไปเป็น Provider เพื่อปุ่มเดียว
 * ต้องแตะไฟล์ใหญ่ที่คุมทั้งการถาม/สตรีมคำตอบ — ส่ง event เบา ๆ แล้วให้ Assistant ฟังเองง่ายกว่า
 * ถ้าวันหนึ่งมีหลายที่ต้องรู้ว่าห้องแชทเปิดอยู่ไหม ค่อยยกขึ้นเป็น Provider
 */
export const OPEN_ASSISTANT_EVENT = "swine-sync:open-assistant";

export const openAssistant = () => window.dispatchEvent(new Event(OPEN_ASSISTANT_EVENT));
