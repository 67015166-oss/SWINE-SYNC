/**
 * ค้นเว็บ — ใช้ตอน AI ของฟาร์มตอบไม่ได้หรือต่อไม่ติด
 *
 * **ทำไมต้องมีทั้งที่ AI ก็ค้นเว็บเองได้** เพราะมันค้นได้ก็ต่อเมื่อมันยังทำงานอยู่
 * ตอน AI ล่ม/คิวเต็ม/กุญแจหมดอายุ ผู้ช่วยเคยตกกลับไปตอบจาก mock data อย่างเดียว
 * ซึ่งช่วยอะไรไม่ได้เลยกับคำถามอย่าง "ราคาหมูวันนี้เท่าไร" — ตรงนั้นค้นเว็บตรง ๆ ยังดีกว่า
 *
 * **ตอนนี้ใช้ DuckDuckGo หน้า html ธรรมดา** เพราะไม่ต้องสมัครกุญแจ ใช้ได้ทันที
 * ข้อเสียคือมันคือการอ่านหน้าเว็บ ไม่ใช่ API ที่เขารับประกัน — เขาเปลี่ยนหน้าเมื่อไรก็พังเมื่อนั้น
 * (ทดสอบแล้วใช้ได้: 26 ส.ค. 2569 · `lite.duckduckgo.com` โดนกันด้วย 202 ใช้ไม่ได้)
 * ➜ เขียนแยกเป็นไฟล์นี้ไฟล์เดียว พอจะเปลี่ยนไปใช้เจ้าที่มีกุญแจ (Brave/Tavily)
 *   ก็แก้แค่ `runSearch` ตัวเดียว ที่เหลือไม่ต้องแตะ
 *
 * ⚠️ **ผลลัพธ์ที่ได้คือข้อความจากคนแปลกหน้าบนอินเทอร์เน็ต** ห้ามเชื่อ ห้ามเอาไปสั่งงานต่อ
 * ที่นี่จึงทำแค่สองอย่าง: ล้าง HTML ออกให้เหลือข้อความเปล่า และทิ้งลิงก์ที่ไม่ใช่ http(s)
 */

const ENDPOINT = "https://html.duckduckgo.com/html/";
/* บางเว็บตอบต่างกันมากถ้าไม่บอกว่าเป็นเบราว์เซอร์ */
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const TIMEOUT_MS = 12_000;
const MAX_RESULTS = 5;

/** เอาแท็ก HTML ออกให้เหลือข้อความล้วน แล้วคืนอักขระพิเศษกลับเป็นตัวจริง */
function plain(raw) {
  return String(raw ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (m, code) => {
      if (code[0] === "#") {
        const n = code[1]?.toLowerCase() === "x"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " }[code.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * DuckDuckGo ห่อลิงก์ปลายทางไว้ในลิงก์เปลี่ยนทางของตัวเอง (`/l/?uddg=<ที่อยู่จริง>`)
 * ถ้าส่งลิงก์ห่อนี้ให้ผู้ใช้ เขาจะเห็นแต่ชื่อ duckduckgo ไม่รู้ว่ากำลังจะไปไหน — ต้องแกะออกก่อน
 */
function realUrl(href) {
  const raw = plain(href);
  const wrapped = /[?&]uddg=([^&]+)/.exec(raw);
  const url = wrapped ? decodeURIComponent(wrapped[1]) : raw;

  /* รับเฉพาะ http/https — กัน `javascript:` กับ `data:` ที่หลุดมาแล้วกลายเป็นลิงก์อันตราย
     ตอนเอาไปแปะเป็น <a href> บนหน้าเว็บ */
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/**
 * ค้นเว็บหนึ่งครั้ง
 * @returns {Promise<Array<{title: string, url: string, snippet: string, site: string}>>}
 *          ค้นไม่ได้/ไม่เจอ → คืนอาร์เรย์ว่าง ไม่โยน error
 *          (คนถามแค่อยากได้คำตอบ ไม่ได้อยากรู้ว่าตัวค้นพังยังไง)
 */
export async function webSearch(query) {
  const q = String(query ?? "").trim().slice(0, 300);
  if (!q) return [];

  let html;
  try {
    const res = await fetch(`${ENDPOINT}?q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": UA, "Accept-Language": "th,en;q=0.8" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    html = await res.text();
  } catch {
    return [];
  }

  const links = [...html.matchAll(/<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];

  const out = [];
  const seen = new Set();

  for (let i = 0; i < links.length && out.length < MAX_RESULTS; i += 1) {
    const url = realUrl(links[i][1]);
    const title = plain(links[i][2]);
    if (!url || !title) continue;

    const site = new URL(url).hostname.replace(/^www\./, "");

    /* โฆษณา — ลิงก์ยังชี้กลับไปที่ duckduckgo เองเพราะแกะที่อยู่จริงไม่ออก
       ทดสอบแล้วเจอจริง: ถามราคาหมู ผลแรกเป็นโฆษณาร้านวัสดุก่อสร้าง
       ถ้าปล่อยไว้ ผู้ใช้จะเห็นของที่ไม่เกี่ยวเป็นอันดับหนึ่งแล้วเลิกเชื่อทั้งกล่อง */
    if (site.endsWith("duckduckgo.com")) continue;

    /* หนึ่งเว็บหนึ่งผลพอ — ไม่งั้นเว็บเดียวกินครบห้าช่องแล้วผู้ใช้ไม่ได้มุมมองอื่นเลย */
    if (seen.has(site)) continue;
    seen.add(site);

    out.push({
      title: title.slice(0, 160),
      url,
      snippet: plain(snippets[i]?.[1]).slice(0, 260),
      site,
    });
  }

  return out;
}
