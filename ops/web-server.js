/**
 * เสิร์ฟหน้าเว็บที่ build แล้ว + ส่งต่อ /api ไปที่หลังบ้าน
 *
 * **ทำไมไม่ใช้ nginx** — เครือข่ายของ CPF ทำ TLS interception (ใบรับรองที่ตอบกลับมา
 * เป็นของ *.cpf.co.th) Docker จึงดึง image ใหม่จาก Docker Hub ไม่ได้เลย
 *   failed to verify certificate: x509: certificate is valid for *.cpf.co.th
 * ไฟล์นี้จึงใช้ `node:22-alpine` ที่มีอยู่ในเครื่องแล้ว และ **ไม่พึ่ง dependency ใด ๆ**
 * ใช้แต่ของที่มากับ Node (http · fs · path) ตามกติกาห้ามเพิ่ม dependency
 *
 * ถ้าวันหนึ่งดึง image ได้แล้ว จะเปลี่ยนไปใช้ nginx ก็ได้ — nginx.conf ที่เทียบเท่ากัน
 * เก็บไว้ที่ web/nginx.conf แล้ว
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/app/dist";
const PORT = Number(process.env.PORT || 80);
const API = process.env.API_ORIGIN || "http://api:3000";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  /* ---------- ส่งต่อไปหลังบ้าน ---------- */
  if (req.url.startsWith("/api/")) {
    const target = new URL(API);
    const proxy = http.request(
      {
        hostname: target.hostname,
        port: target.port || 80,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: target.host },
      },
      (up) => {
        res.writeHead(up.statusCode, up.headers);
        /* pipe ตรง ๆ ไม่รวมก้อน — ผู้ช่วย AI ตอบเป็นสายทีละคำ (NDJSON)
           ถ้าอมไว้จนจบ ผู้ใช้จะเห็นจอนิ่งเป็นนาทีแล้วคำตอบโผล่มาทีเดียว */
        up.pipe(res);
      },
    );
    /* คำถามที่ต้องให้โมเดลคิดใช้เวลาได้ถึง ~2 นาที ตั้งเผื่อไว้ 10 นาที */
    proxy.setTimeout(600_000, () => proxy.destroy());
    proxy.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: { code: "api_unreachable", message: "ต่อหลังบ้านไม่ได้" } }));
    });
    req.pipe(proxy);
    return;
  }

  /* ---------- ไฟล์ static ---------- */
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  /* กัน path traversal — `..` ในที่อยู่ต้องไม่พาออกนอกโฟลเดอร์ dist ได้ */
  const wanted = path.normalize(path.join(ROOT, urlPath));
  const safe = wanted.startsWith(ROOT) ? wanted : ROOT;

  fs.stat(safe, (err, stat) => {
    /* SPA: ที่อยู่ที่ไม่ใช่ไฟล์จริงต้องตกมาที่หน้าเริ่มของแอปนั้น
       ไม่มีบรรทัดนี้ กด F5 ที่ /dashboard/farms แล้วได้ 404

       ★ มีสองแอปบนโดเมนเดียวกัน (T1.347)
         /hub/*  → ตู้กลาง (hub.html)   เว็บคนละตัว คนละบัญชีผู้ใช้ไม่ได้ แต่คนละหน้าจอ
         อื่น ๆ   → แดชบอร์ดฟาร์ม (index.html)
       ถ้าไม่แยกตรงนี้ คนเปิด /hub จะได้ index.html ของแดชบอร์ดแทน
       แล้ว router ของแดชบอร์ดจะขึ้น "ไม่พบหน้านี้" ซึ่งงงมากเพราะที่อยู่ถูกแล้ว */
    const isHub = urlPath === "/hub" || urlPath.startsWith("/hub/");
    const fallback = path.join(ROOT, isHub ? "hub.html" : "index.html");
    const file = !err && stat.isFile() ? safe : fallback;
    const ext = path.extname(file);
    const headers = { "Content-Type": TYPES[ext] ?? "application/octet-stream" };
    /* ไฟล์ใน /assets/ มีลายนิ้วมืออยู่ในชื่อ เปลี่ยนชื่อทุกครั้งที่ build — cache ยาวได้
       ส่วน index.html ห้าม cache ไม่งั้น deploy ใหม่แล้วเบราว์เซอร์ยังถือของเก่า */
    headers["Cache-Control"] = file.includes("/assets/")
      ? "public, max-age=31536000, immutable"
      : "no-cache";

    fs.createReadStream(file)
      .on("error", () => { res.writeHead(404); res.end("ไม่พบไฟล์"); })
      .once("open", () => res.writeHead(200, headers))
      .pipe(res);
  });
});

server.headersTimeout = 620_000;
server.requestTimeout = 620_000;
server.listen(PORT, () => console.log(`เสิร์ฟหน้าเว็บที่พอร์ต ${PORT} · ส่งต่อ /api ไปที่ ${API}`));
