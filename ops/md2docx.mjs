/**
 * แปลงเอกสาร Markdown ในโฟลเดอร์ docs/ส่งมอบองค์กร/ เป็นไฟล์ Word สองเล่ม
 *
 * ★ ไฟล์นี้ **ไม่ใช่ส่วนหนึ่งของระบบ** และ **ไม่ได้ใช้ dependency ของโปรเจกต์**
 *   ใช้ไลบรารี `docx` ซึ่งตั้งใจไม่ลงไว้ในโปรเจกต์ (กติกา: ห้ามเพิ่ม dependency โดยไม่จำเป็น)
 *
 * วิธีใช้ — ลงไลบรารีไว้นอกโปรเจกต์แล้วรันจากที่นั่น
 *   mkdir -p ~/docxbuild && cd ~/docxbuild && npm init -y && npm i docx@9.5.1
 *   node /path/to/cpf_dashboard/ops/md2docx.mjs
 *
 * ★ แผนภาพ Mermaid ในเอกสารถูกแทนด้วยไฟล์ PNG ใน docs/ส่งมอบองค์กร/ภาพ/
 *   ลำดับของ PNG ต้องตรงกับลำดับบล็อก mermaid ในแต่ละไฟล์ (ดู parts ด้านล่าง)
 *   เพิ่ม/ย้ายแผนภาพเมื่อไร ต้องแก้ลำดับตรงนั้นด้วย ไม่งั้นภาพจะสลับกันเงียบ ๆ
 *
 * ★ ต้นฉบับคือไฟล์ Markdown — **อย่าแก้ในไฟล์ Word โดยตรง** เพราะรันใหม่แล้วทับทิ้ง
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/* ★ หา `docx` จากโฟลเดอร์ที่สั่งรัน ไม่ใช่จากที่ไฟล์นี้วางอยู่
   เพราะไลบรารีตัวนี้ตั้งใจลงไว้นอกโปรเจกต์ (ไม่เพิ่ม dependency ให้ระบบ)
   ถ้า import ตรง ๆ Node จะหาใน ops/ แล้วไม่เจอ */
const requireFromCwd = createRequire(path.join(process.cwd(), "noop.js"));
const {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, Packer,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun,
  WidthType, PageNumber,
} = requireFromCwd("docx");

const SRC = "/Users/Ananmiw/cpf_dashboard/docs/ส่งมอบองค์กร";
const OUT = SRC;
const FONT = "Tahoma";
const MONO = "Consolas";

/* A4 ขอบ 2 ซม. → กว้างใช้งานได้ 9638 ทวิป = 6.69 นิ้ว = 642 พิกเซลที่ 96 dpi */
const PAGE = { width: 11906, height: 16838 };
const MARGIN = 1134;
const CONTENT_DXA = PAGE.width - MARGIN * 2;
const MAX_IMG_W = 640;
const MAX_IMG_H = 860;

const INK = "2F2718";
const GOLD = "8A6D3B";
const RULE = "CDB183";
const CODE_BG = "F7F3E9";
const HEAD_BG = "F0E6D2";

/** อ่านขนาดภาพจากหัวไฟล์ PNG / JPEG */
function imageSize(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return { w: MAX_IMG_W, h: 400 };
}

/** ตัดคำที่ไม่ใช่ข้อความทิ้ง แล้วคืนเป็นชิ้น ๆ พร้อมรูปแบบ */
function inline(text, { size = 21, color = INK, bold = false } = {}) {
  const runs = [];
  const re = /(\*\*[^*]+\*\*)|(`[^`]+`)|(\[[^\]]*\]\([^)]*\))/g;
  let last = 0;
  let m;
  const push = (t, extra = {}) => {
    if (!t) return;
    runs.push(new TextRun({ text: t, font: FONT, size, color, bold, ...extra }));
  };
  while ((m = re.exec(text)) !== null) {
    push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) push(tok.slice(2, -2), { bold: true });
    else if (tok.startsWith("`")) {
      runs.push(new TextRun({ text: tok.slice(1, -1), font: MONO, size: size - 2, color: GOLD }));
    } else {
      const label = tok.slice(1, tok.indexOf("]"));
      push(label, { color: GOLD });
    }
    last = m.index + tok.length;
  }
  push(text.slice(last));
  return runs.length ? runs : [new TextRun({ text: "", font: FONT, size })];
}

const para = (text, opt = {}) =>
  new Paragraph({ children: inline(text, opt), spacing: { after: 120, line: 300 }, ...opt.p });

function codeBlock(lines) {
  return lines.map((l, i) => new Paragraph({
    children: [new TextRun({ text: l || " ", font: MONO, size: 17, color: INK })],
    shading: { type: ShadingType.CLEAR, fill: CODE_BG },
    spacing: { before: i === 0 ? 80 : 0, after: i === lines.length - 1 ? 160 : 0, line: 260 },
    indent: { left: 180, right: 180 },
  }));
}

function imageParagraph(file) {
  const buf = readFileSync(file);
  const { w, h } = imageSize(buf);
  const k = Math.min(MAX_IMG_W / w, MAX_IMG_H / h, 1);
  return new Paragraph({
    children: [new ImageRun({
      data: buf,
      type: file.toLowerCase().endsWith(".png") ? "png" : "jpg",
      transformation: { width: Math.round(w * k), height: Math.round(h * k) },
    })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 160, after: 160 },
  });
}

const splitRow = (line) =>
  line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

function cellContent(text, bold) {
  const img = text.match(/!\[[^\]]*\]\(([^)]+)\)/);
  if (img) {
    const f = path.join(SRC, decodeURIComponent(img[1]));
    if (existsSync(f)) return [imageParagraph(f)];
  }
  return [new Paragraph({
    children: inline(text.replace(/<br\s*\/?>/g, " "), { size: 18, bold }),
    spacing: { before: 40, after: 40, line: 260 },
  })];
}

function buildTable(rows) {
  const cols = Math.max(...rows.map((r) => r.length));
  const width = Math.floor(CONTENT_DXA / cols);
  const widths = Array.from({ length: cols }, () => width);
  return new Table({
    columnWidths: widths,
    width: { size: CONTENT_DXA, type: WidthType.DXA },
    rows: rows.map((cells, ri) => new TableRow({
      tableHeader: ri === 0,
      children: Array.from({ length: cols }, (_, ci) => new TableCell({
        width: { size: widths[ci], type: WidthType.DXA },
        shading: ri === 0 ? { type: ShadingType.CLEAR, fill: HEAD_BG } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: cellContent(cells[ci] ?? "", ri === 0),
      })),
    })),
  });
}

function convert(md, diagrams, breakBefore = false) {
  const out = [];
  let pendingBreak = breakBefore;
  const takeBreak = () => { const b = pendingBreak; pendingBreak = false; return b; };
  const lines = md.split("\n");
  let i = 0;
  let diagramAt = 0;
  let inList = null;

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const body = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) { body.push(lines[i]); i += 1; }
      i += 1;
      if (lang === "mermaid") {
        const f = diagrams[diagramAt];
        diagramAt += 1;
        if (f && existsSync(f)) out.push(imageParagraph(f));
      } else {
        out.push(...codeBlock(body));
      }
      continue;
    }

    if (/^\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        if (!/^\|[\s:-]+\|/.test(lines[i])) rows.push(splitRow(lines[i]));
        i += 1;
      }
      if (rows.length) {
        out.push(buildTable(rows));
        out.push(new Paragraph({ text: "", spacing: { after: 160 } }));
      }
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      out.push(new Paragraph({
        children: inline(h[2], { size: [0, 30, 26, 23, 21][lvl], bold: true, color: lvl <= 2 ? GOLD : INK }),
        heading: [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][lvl],
        spacing: { before: lvl <= 2 ? 320 : 220, after: 140 },
        pageBreakBefore: takeBreak(),
        border: lvl <= 2 ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 6 } } : undefined,
      }));
      i += 1;
      continue;
    }

    if (/^(---|___|\*\*\*)\s*$/.test(line)) {
      out.push(new Paragraph({
        text: "",
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 4 } },
        spacing: { before: 120, after: 160 },
      }));
      i += 1;
      continue;
    }

    const img = line.match(/^!\[[^\]]*\]\(([^)]+)\)\s*$/);
    if (img) {
      const f = path.join(SRC, decodeURIComponent(img[1]));
      if (existsSync(f)) out.push(imageParagraph(f));
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { body.push(lines[i].replace(/^>\s?/, "")); i += 1; }
      out.push(new Paragraph({
        children: inline(body.join(" "), { size: 20 }),
        shading: { type: ShadingType.CLEAR, fill: CODE_BG },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: RULE, space: 8 } },
        indent: { left: 200 },
        spacing: { before: 120, after: 160, line: 300 },
      }));
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      out.push(new Paragraph({ children: inline(bullet[1]), bullet: { level: 0 }, spacing: { after: 60, line: 300 } }));
      inList = "bullet";
      i += 1;
      continue;
    }

    const num = line.match(/^(\d+)\.\s+(.*)$/);
    if (num) {
      out.push(new Paragraph({
        children: [new TextRun({ text: `${num[1]}.  `, font: FONT, size: 21, bold: true, color: GOLD }), ...inline(num[2])],
        indent: { left: 360, hanging: 240 },
        spacing: { after: 60, line: 300 },
      }));
      inList = "number";
      i += 1;
      continue;
    }

    if (!line.trim()) { inList = null; i += 1; continue; }

    /* บรรทัดธรรมดาที่ตามหลังรายการทันที คือบรรทัดต่อของรายการนั้น ต้องย่อหน้าให้ตรงกัน */
    if (inList) {
      out.push(new Paragraph({
        children: inline(line),
        indent: { left: inList === "number" ? 360 : 420 },
        spacing: { after: 60, line: 300 },
      }));
      i += 1;
      continue;
    }

    /* ลิงก์กลับสารบัญของฉบับเว็บ ไม่มีความหมายในไฟล์ Word */
    if (/^\[←\s*กลับ/.test(line)) { i += 1; continue; }

    out.push(para(line));
    i += 1;
  }
  return out;
}

function titlePage(title, subtitle, meta) {
  return [
    new Paragraph({ text: "", spacing: { before: 2400 } }),
    new Paragraph({
      children: [new TextRun({ text: title, font: FONT, size: 52, bold: true, color: GOLD })],
      alignment: AlignmentType.CENTER, spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: subtitle, font: FONT, size: 26, color: INK })],
      alignment: AlignmentType.CENTER, spacing: { after: 700 },
    }),
    ...meta.map((m) => new Paragraph({
      children: [new TextRun({ text: m, font: FONT, size: 21, color: INK })],
      alignment: AlignmentType.CENTER, spacing: { after: 80 },
    })),
  ];
}

function makeDoc({ title, subtitle, meta, parts }) {
  const children = [...titlePage(title, subtitle, meta)];
  parts.forEach((p) => {
    children.push(...convert(readFileSync(path.join(SRC, p.file), "utf8"), p.diagrams ?? [], true));
  });
  return new Document({
    creator: "SWINE SYNC",
    title,
    description: subtitle,
    styles: { default: { document: { run: { font: FONT, size: 21, color: INK } } } },
    sections: [{
      properties: { page: { size: PAGE, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `${title} · หน้า `, font: FONT, size: 16, color: GOLD }),
              new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: GOLD }),
            ],
          })],
        }),
      },
      children,
    }],
  });
}

const D = (n) => path.join(SRC, "ภาพ", n);

const เล่ม1 = makeDoc({
  title: "เอกสารส่งมอบงาน",
  subtitle: "SWINE SYNC / Smart Farm System\nส่วนงาน Dashboard และระบบเชื่อมต่อข้อมูลกลาง",
  meta: ["จัดทำเมื่อ 5 พฤศจิกายน 2569", "งานล่าสุดที่ปิด T1.367", "ตัวเลขทุกตัววัดจากระบบจริง"],
  parts: [
    { file: "README.md" },
    { file: "01-ภาพรวมโครงการ.md", diagrams: [D("d1-ขอบเขตระบบ.png")] },
    { file: "02-เริ่มต้นใช้งาน.md" },
    { file: "04-สถาปัตยกรรมระบบ.md", diagrams: [D("d2-สถาปัตยกรรมระบบ.png"), D("d3-หน้าบ้านคุยกับหลังบ้าน.png"), D("d4-ทางเดินข้อมูล.png")] },
    { file: "05-โครงสร้างไฟล์.md" },
    { file: "06-สารบัญไฟล์.md" },
    { file: "07-เชื่อมต่อกับแต่ละทีม.md", diagrams: [D("d5-สามทางที่ข้อมูลเข้ามา.png"), D("d6-ขาออกสั่งอุปกรณ์.png")] },
    { file: "08-container-และบริการ.md", diagrams: [D("d7-คอนเทนเนอร์และบริการ.png")] },
    { file: "09-ปัญหาและแนวทางแก้.md", diagrams: [D("d8-ไล่หาสาเหตุเมื่อระบบเงียบ.png")] },
    { file: "10-สถานะงานและงานต่อไป.md" },
    { file: "11-เอกสารอ้างอิง.md" },
    { file: "12-ภาคผนวก.md" },
  ],
});

const เล่ม2 = makeDoc({
  title: "คู่มือ GitHub สำหรับผู้เริ่มต้น",
  subtitle: "SWINE SYNC / Smart Farm System\nเอกสารแนบของชุดส่งมอบงาน",
  meta: ["จัดทำเมื่อ 5 พฤศจิกายน 2569", "สำหรับคนที่ไม่เคยใช้ Git มาก่อน", "ทุกคำสั่งใช้ได้จริงกับโปรเจกต์นี้"],
  parts: [{ file: "03-คู่มือ-GitHub.md" }],
});

const files = [
  ["เอกสารส่งมอบงาน-SWINE-SYNC.docx", เล่ม1],
  ["คู่มือ-GitHub-สำหรับผู้เริ่มต้น.docx", เล่ม2],
];
for (const [name, doc] of files) {
  const buf = await Packer.toBuffer(doc);
  writeFileSync(path.join(OUT, name), buf);
  console.log("เขียน", name, (buf.length / 1024).toFixed(0), "KB");
}
