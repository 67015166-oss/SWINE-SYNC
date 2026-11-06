# หน้าเว็บแดชบอร์ด — เสิร์ฟไฟล์ที่ build ไว้แล้ว
#
# **ต้อง `npm run build` บนเครื่องก่อน** แล้วค่อย `docker compose up -d --build web`
# เพราะเครือข่าย CPF ทำ TLS interception ทำให้ build ข้างในคอนเทนเนอร์ดึงของจาก
# Docker Hub / npm ไม่ได้ (ดูเหตุผลเต็มในหัว web/server.js)
# ใช้ node:22-alpine ที่มีอยู่ในเครื่องแล้ว ไม่ต้องดึง image ใหม่
FROM node:22-alpine
ENV TZ=Asia/Bangkok
WORKDIR /app
COPY dist ./dist
COPY web/server.js ./server.js
EXPOSE 80
CMD ["node", "server.js"]
