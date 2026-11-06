/**
 * แปลง error ของ `fetch` ให้เป็นข้อความไทยที่บอกทางออก (T1.349)
 *
 * **ทำไมต้องมี** — `fetch` โยน `TypeError` ดิบ ๆ เมื่อคำขอไปไม่ถึงเซิร์ฟเวอร์
 * หน้าจอที่เอา `err.message` ไปโชว์ตรง ๆ จึงขึ้นคำของเบราว์เซอร์ให้ผู้ใช้เห็น
 * — Safari ขึ้น **"Load failed"** · Chrome ขึ้น **"Failed to fetch"**
 * เรื่องเดียวกันแต่คนละคำ และทั้งคู่ไม่บอกว่าควรทำอะไรต่อ
 * (ผิดกติกาใน CLAUDE.md สองข้อ: UI ต้องเป็นไทยทั้งหมด · สถานะต้องบอกให้ชัด)
 *
 * **แยกออกมาเป็นไฟล์ของตัวเอง** เพราะ `client.js` อ่าน `import.meta.env` ของ Vite
 * ตั้งแต่บรรทัดบน ๆ ทำให้ `import` เข้ามาทดสอบใน Node ตรง ๆ ไม่ได้ —
 * ไฟล์นี้ไม่พึ่งอะไรเลยนอกจาก `ApiError` จึงเทสต์ได้
 *
 * ★ **ยกเว้นเดียวที่ห้ามแตะ: `AbortError`** — คือตอนที่ผู้เรียกยกเลิกเอง
 * (ออกจากหน้าไปก่อนคำขอจะเสร็จ) หน้าจออย่างน้อย 8 ที่เช็ก `err.name === "AbortError"`
 * แล้วเงียบไว้ ถ้าแปลงเป็นข้อความผิดพลาด ผู้ใช้จะเห็นคำเตือนเด้งทุกครั้งที่เปลี่ยนหน้าเร็ว ๆ
 */
import { ApiError } from "./apiError.js";

export const NETWORK_MESSAGE = {
  offline: "ติดต่อเซิร์ฟเวอร์ไม่ได้ ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่ หากยังไม่ได้ให้แจ้งผู้ดูแลระบบ",
  timeout: "เซิร์ฟเวอร์ไม่ตอบ ลองใหม่อีกครั้ง หากยังไม่ได้ให้แจ้งผู้ดูแลระบบ",
};

export const toNetworkError = (err) => {
  if (err?.name === "AbortError") return err;
  if (err?.name === "TimeoutError") return new ApiError(0, "timeout", NETWORK_MESSAGE.timeout);
  if (err instanceof TypeError) return new ApiError(0, "offline", NETWORK_MESSAGE.offline);
  return err;
};
