/**
 * สะพานขาออกไปหาเครื่องในเครือข่าย Tailscale (T1.354 · T1.360)
 *
 * เดิมชื่อ `vision-relay.js` และมีแต่ปลายทางของกล้อง AI
 * พอตัวเฝ้าข้อมูลต้องอ่าน InfluxDB บนเครื่องผู้พัฒนาซึ่งติดเรื่องเดียวกันเป๊ะ
 * จึงเปลี่ยนชื่อให้ตรงกับหน้าที่จริง — **สะพานเดียวใช้ร่วมกันทุกปลายทาง**
 * ไม่ใช่เปิดสะพานใหม่ต่อหนึ่งปลายทาง
 *
 * ═══ ทำไมต้องมี ═══
 * กล่อง box-mew รันอยู่ในคอนเทนเนอร์ที่ **ไม่มี /dev/net/tun** `tailscaled` จึงต้อง
 * รันโหมด `--tun=userspace-networking` ซึ่ง **ไม่ลงเส้นทางของช่วง 100.x ในระบบ**
 * ผลคือ `curl` / `fetch` บนกล่องยิงไปหาเครื่องใน Tailscale ไม่ได้เลยแม้แต่เครื่องเดียว
 * ทั้งที่ `tailscale status` เห็นเครื่องนั้นครบและ `tailscale ping` ตอบ pong ปกติ
 *
 * ★★ **ห้ามแก้ด้วยการรีสตาร์ต tailscaled เพื่อใส่แฟล็กพร็อกซี** — Tailscale SSH
 *   คือทางเดียวที่เข้ากล่องได้ ถ้ามันไม่กลับขึ้นมาคือเข้ากล่องไม่ได้อีกเลย
 *   (โดเมนเสิร์ฟแค่เว็บ ไม่ใช่เชลล์ และไม่มีแผงเปิด-ปิดเครื่อง)
 *
 * วิธีนี้จึงใช้ `tailscale nc` ซึ่งวิ่งผ่าน tailscaled ตัวเดิมที่รันอยู่
 * **ไม่แตะ tailscaled เลย** ถ้าสะพานนี้ตาย เสียแค่หน้ากล้อง ไม่กระทบอย่างอื่น
 *
 * ★ กับดักที่เสียเวลาไปหนึ่งรอบ: ถ้าปิด stdin ของ `tailscale nc` ทันทีที่ส่งคำขอจบ
 *   มันจะปิดการเชื่อมต่อทั้งสองทางก่อนคำตอบกลับมา ได้ exit 0 กับผลลัพธ์ว่างเปล่า
 *   จึงต้อง `{ end: false }` ตอนต่อท่อฝั่งขาเข้า
 */
import net from "node:net";
import { spawn } from "node:child_process";

/** ปลายทางที่ยอมให้ต่อ — เขียนตายตัวโดยเจตนา ไม่รับปลายทางจากคำขอ
    ไม่งั้นสะพานนี้จะกลายเป็นพร็อกซีเปิดให้ยิงไปที่ไหนก็ได้ในเครือข่าย */
const ROUTES = [
  { listen: 18080, host: "100.107.16.7", port: 8080, name: "jetson" },
  { listen: 18002, host: "100.123.171.62", port: 8002, name: "nas" },
  /* InfluxDB บนเครื่องผู้พัฒนา — ตัวเฝ้าข้อมูลในสะพานข้อมูลอ่านผ่านทางนี้ (T1.360)
     ★ เครื่องผู้พัฒนาปิดอยู่ = อ่านไม่ได้ ซึ่งถูกต้องแล้วและเป็นมาแบบนั้นตั้งแต่ต้น
       สะพานนี้แก้แค่เรื่อง "ยิงไปไม่ถึงทั้งที่เครื่องเปิดอยู่" */
  { listen: 18086, host: "100.91.86.95", port: 8086, name: "influx" },
];

/** กันกระบวนการงอกไม่หยุดเวลาปลายทางค้าง — หนึ่งการเชื่อมต่อ = หนึ่ง tailscale nc */
const MAX_CONN = 32;
let open = 0;

const log = (...a) => console.log(new Date().toISOString(), ...a);

for (const r of ROUTES) {
  net
    .createServer((client) => {
      if (open >= MAX_CONN) {
        log(`${r.name} ปฏิเสธ: ถึงเพดาน ${MAX_CONN} การเชื่อมต่อ`);
        client.destroy();
        return;
      }
      open += 1;
      const child = spawn("tailscale", ["nc", r.host, String(r.port)], {
        stdio: ["pipe", "pipe", "ignore"],
      });

      /* ★ end:false — ห้ามปิด stdin ตอนขาเข้าจบ ไม่งั้นคำตอบไม่ทันกลับมา */
      client.pipe(child.stdin, { end: false });
      child.stdout.pipe(client);

      const done = () => {
        if (!child.killed) child.kill();
        client.destroy();
      };
      client.on("error", done);
      client.on("close", done);
      child.stdin.on("error", () => {});
      child.on("exit", () => {
        open -= 1;
        client.end();
      });
    })
    /* ★ ผูกกับ 127.0.0.1 เท่านั้น — ไม่เปิดออกนอกเครื่อง */
    .listen(r.listen, "127.0.0.1", () =>
      log(`${r.name}: 127.0.0.1:${r.listen} -> ${r.host}:${r.port}`)
    );
}
