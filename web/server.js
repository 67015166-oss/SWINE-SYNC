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
import https from "node:https";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/app/dist";
const PORT = Number(process.env.PORT || 80);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 443);
/* ใบรับรองที่เราออกเอง — สร้างด้วย `sh ops/make-cert.sh` แล้ว compose เอามาแปะไว้ตรงนี้
   **ไม่มีก็ไม่เป็นไร** เสิร์ฟ http อย่างเดียวเหมือนเดิม ไม่ใช่เหตุให้คอนเทนเนอร์ล้ม */
const CERT_DIR = process.env.CERT_DIR || "/app/certs";
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

/**
 * ตัวจัดการคำขอ — **ตัวเดียวใช้ทั้ง http และ https**
 * แยกเป็นสองฟังก์ชันเมื่อไหร่ วันหนึ่งสองฝั่งจะเสิร์ฟคนละอย่างโดยไม่มีใครรู้
 */
const handle = (req, res) => {
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
    /* SPA: ที่อยู่ที่ไม่ใช่ไฟล์จริงต้องตกมาที่ index.html
       ไม่มีบรรทัดนี้ กด F5 ที่ /dashboard/farms แล้วได้ 404 */
    const file = !err && stat.isFile() ? safe : path.join(ROOT, "index.html");
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
};

/** เวลาที่ใช้ได้ยาว ๆ — ผู้ช่วย AI ตอบเป็นสายและคิดนานได้เป็นนาที */
const stretch = (server) => {
  server.headersTimeout = 620_000;
  server.requestTimeout = 620_000;
  return server;
};

stretch(http.createServer(handle)).listen(PORT, () =>
  console.log(`เสิร์ฟหน้าเว็บที่พอร์ต ${PORT} · ส่งต่อ /api ไปที่ ${API}`),
);

/* ---------- https (ถ้ามีใบรับรอง) ----------
   **จำเป็นสำหรับสาธิตจากมือถือ/เครื่องอื่น** — เบราว์เซอร์ปิดไมโครโฟนและกล้องทั้งหน้า
   เมื่อหน้านั้นเปิดผ่าน http ที่ไม่ใช่ localhost วอยซ์กับกล้องจึงใช้ไม่ได้เลยทาง http://<ไอพี>

   ใบรับรองเราออกเอง เบราว์เซอร์จะเตือนครั้งแรก กดผ่านไปหนึ่งครั้งแล้วใช้ได้ตลอด
   ไม่มีไฟล์ = ข้ามไปเงียบ ๆ ไม่ใช่ error — เครื่องที่ไม่ได้สาธิตก็ไม่ต้องมีใบรับรอง */
const key = path.join(CERT_DIR, "server.key");
const crt = path.join(CERT_DIR, "server.crt");

if (fs.existsSync(key) && fs.existsSync(crt)) {
  stretch(
    https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(crt) }, handle),
  ).listen(HTTPS_PORT, () => console.log(`เสิร์ฟ https ที่พอร์ต ${HTTPS_PORT} ด้วย`));
} else {
  console.log(
    `ไม่มีใบรับรองที่ ${CERT_DIR} — เสิร์ฟ http อย่างเดียว ` +
      "(ไมโครโฟนกับกล้องจะใช้ได้เฉพาะตอนเปิดผ่าน localhost · สร้างใบรับรองด้วย sh ops/make-cert.sh)",
  );
}
