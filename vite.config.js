import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  /**
   * ที่อยู่ที่หน้าเว็บจะไปวางอยู่ — ค่าตั้งต้นคือรากโดเมน (`/`)
   *
   * **ต้องตั้งค่านี้ถ้าเอาไปวางในโฟลเดอร์ย่อย** เช่น lab.plotnexuslab.com/p/mew/dashboard/
   * ไม่งั้นทั้งไฟล์ JS/CSS และลิงก์ในเมนูจะชี้กลับไปที่รากโดเมน กดแล้วหลุดออกจากแอป
   * (เจอของจริง 2 ก.ย. 2569 — กดเมนูแล้วเด้งไป lab.plotnexuslab.com/dashboard
   *  ซึ่งเป็นหน้าของเจ้าของเว็บ ไม่ใช่ของเรา)
   *
   *   VITE_BASE=/p/mew/dashboard/ npm run build
   *
   * ต้องมีทับท้ายเสมอ และค่านี้ถูกส่งต่อให้ `import.meta.env.BASE_URL`
   * ซึ่ง main.jsx เอาไปตั้งเป็น basename ของ router และ lib/asset.js เอาไปเติมหน้าพาธรูป
   */
  base: process.env.VITE_BASE || "/",

  /**
   * ★ สอง entry — แดชบอร์ดฟาร์ม กับ **ตู้กลางซึ่งเป็นเว็บคนละตัว** (T1.347)
   *
   * `hub.html` มีตัวเริ่มของตัวเอง (`src/hub/main.jsx`) และไม่ import อะไรจากแดชบอร์ดเลย
   * นอกจาก Provider ที่ใช้ร่วมกันจริง ๆ (บัญชี ภาษา ธีม) ผลคือคนที่เปิดตู้กลาง
   * **ไม่โหลดโค้ดของแดชบอร์ดแม้แต่บรรทัดเดียว** — ไม่ใช่แค่ซ่อนเมนู
   *
   * ของที่ใช้ร่วมกันจะถูกแยกเป็นก้อนกลางให้เอง ไม่ได้ถูกคัดลอกสองชุด
   */
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        hub: "hub.html",
      },
    },
  },
  // ใช้พอร์ตจาก env ถ้ามี (เครื่องมือ preview กำหนดพอร์ตให้) ไม่งั้นใช้ 5173 ตามปกติ
  server: {
    port: Number(process.env.PORT) || 5173,
    /* บังคับให้ผูกกับ 127.0.0.1 — ค่าตั้งต้นของ Vite คือชื่อ `localhost` ซึ่งบนเครื่องนี้
       Node แปลเป็น IPv6 (`::1`) อย่างเดียว เบราว์เซอร์ที่ลอง IPv4 ก่อนจึงได้ connection refused
       ทั้งที่เซิร์ฟเวอร์รันอยู่จริง (curl ใช้ได้เพราะมันลองทั้งสองแบบ จึงหลอกให้คิดว่าปกติ) */
    host: "127.0.0.1",
    /* พอร์ตต้องเป็น 5173 เสมอ ห้ามเลื่อนไปพอร์ตอื่นเอง
       ค่าตั้งต้นของ Vite คือ "ถ้าพอร์ตไม่ว่างให้ขยับไปพอร์ตถัดไป" ซึ่งฟังดูสะดวก
       แต่ผลคือลิงก์ที่เปิดค้างไว้ตายเงียบ ๆ แล้วต้องไล่หาพอร์ตใหม่ทุกครั้ง
       ➜ strictPort ทำให้พังตั้งแต่ตอนสตาร์ทพร้อมบอกเหตุผล ดีกว่ารันได้แต่อยู่ผิดที่ */
    strictPort: true,
    /* ยิง /api ต่อไปที่ container `api` — เบราว์เซอร์จึงเห็นเป็น origin เดียวกัน
       ไม่มีปัญหา CORS และ cookie ของ refresh token จะทำงานได้ตอนทำ auth
       (ตอนขึ้นจริง nginx ทำหน้าที่นี้แทน — docs/BACKEND.md ข้อ 13) */
    proxy: {
      '/api': {
        target: process.env.API_ORIGIN || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
