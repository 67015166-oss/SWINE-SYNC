# image เดียวใช้ทั้ง api และ bridge — ต่างกันแค่คำสั่งตอนรัน (compose เป็นคนกำหนด)
FROM node:22-alpine

WORKDIR /app

# ลง dependency ก่อนคัดลอกโค้ด — แก้โค้ดแล้ว build ใหม่ไม่ต้องลงใหม่ทั้งหมด
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
