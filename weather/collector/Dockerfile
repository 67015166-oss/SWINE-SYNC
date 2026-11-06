# ตัวเก็บข้อมูล — เบามาก มีแค่ตัวต่อ Postgres ตัวเดียวเป็น dependency
# (fetch เป็นของที่ Node 22 มีมาให้อยู่แล้ว ไม่ต้องลง axios/node-fetch)
FROM node:22-alpine

WORKDIR /app

# ลง dependency ก่อนคัดลอกซอร์ส — แก้โค้ดแล้ว build ใหม่จะไม่ต้องลงใหม่ทุกครั้ง
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY sql ./sql
COPY src ./src

# เวลาในคอนเทนเนอร์ตั้งเป็นเวลาไทย เพื่อให้ข้อความ log อ่านแล้วตรงกับนาฬิกาจริง
# **alpine ไม่มีฐานข้อมูลเขตเวลามาให้** ตั้ง TZ เฉย ๆ จะไม่มีผลอะไรเลย ต้องลง tzdata ด้วย
# (ข้อมูลในฐานยังเก็บเป็น UTC เหมือนเดิม — คนละเรื่องกัน ดู config.js)
RUN apk add --no-cache tzdata
ENV TZ=Asia/Bangkok

CMD ["node", "src/index.js"]
