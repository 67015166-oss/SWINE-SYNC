/**
 * หน้ากล้อง AI — หน้าเดียวใช้สองระดับ
 *   /dashboard/cameras                       = ผนังกล้องของทุกฟาร์ม (กรองรายฟาร์มได้)
 *   /dashboard/cameras/:farmId/:barnId       = กล้องทุกตัวของโรงเรือนหลังนั้น
 *
 * ใช้คอมโพเนนต์เดียวกันเพราะเครื่องมือชุดเดียวกันหมด (เลือกฟาร์ม · รูปแบบ · จำนวนจอ)
 * ต่างกันแค่ขอบเขตข้อมูลกับหัวข้อ — แยกไฟล์เมื่อไรก็ต้องก๊อบเครื่องมือทั้งชุดตามไปด้วย
 *
 * โครงหน้า: ตัวเลขรวม 4 ใบ → ผนังกล้อง
 * ผนังกล้องดูได้สองแบบตามที่ผู้ใช้สั่ง — **รวมทั้งฟาร์ม** และ **แยกรายกล้อง**
 *   · รายโรงเรือน = ใบละหนึ่งโรงเรือน (กล้องหัวโรงเรือนเป็นตัวแทน) เห็นภาพรวมทั้งเครือได้ในจอเดียว
 *   · รายกล้อง    = ใบละหนึ่งตัวกล้อง (หัว/กลาง/ท้าย) สำหรับไล่ดูทีละมุม
 * และกรองเฉพาะฟาร์มเดียวได้ด้วยปุ่มฟาร์ม (จำไว้ใน ?farm= เพื่อให้ลิงก์จากที่อื่นเจาะตรงมาได้)
 *
 * ภาพกล้องมาจาก CameraView ตัวเดียวกับหน้าภายในโรงเรือน — ต่อสตรีม MJPEG จริงเมื่อไหร่
 * หน้านี้ก็เปลี่ยนเป็นภาพสดตามไปเอง (ดู components/ui/CameraView.jsx)
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader.jsx";
import PageBoard, { Block } from "../components/board/PageBoard.jsx";
import Card from "../components/ui/Card.jsx";
import Modal from "../components/ui/Modal.jsx";
import StatTile from "../components/ui/StatTile.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import Icon from "../components/ui/Icon.jsx";
import CameraView from "../components/ui/CameraView.jsx";
import { useAllFarms } from "../lib/records/useAllFarms.js";
import { blendSource } from "../lib/records/dataSource.js";
import { REAL_CAMERA, isRealCamera, useVisionHealth, useVisionStreamUrl } from "../lib/api/vision.js";
import DataSourceNote from "../components/ui/DataSourceNote.jsx";
import { BARN_STATUS_LABEL } from "../data/mock/barnsByFarm.js";
import { formatNumber, formatDateTime } from "../lib/format.js";
import "./Cameras.css";
import { useT } from "../lib/i18n/useT.js";

/**
 * รหัสกระดานของหน้านี้ — คีย์ที่ใช้เก็บชุดเลย์เอาต์ (ดู lib/layout/presets.js)
 * แยกกระดานตามระดับที่ดู เพราะผนังกล้องของทั้งเครือ (38 ใบ) กับของโรงเรือนเดียว (3 ใบ)
 * ต้องการความสูงคนละเรื่องกัน ใช้กระดานเดียวกันแล้วจะเหลือที่ว่างค้างเป็นหน้าจอ
 */
const BOARD_ALL = "cameras";
const BOARD_BARN = "cameras:barn";

/**
 * รูปแบบผนังกล้อง — ตั้งชื่อแบบเครื่องบันทึกกล้องวงจรปิด (1×1 · 2×2 · 3×3 · 4×4)
 * ที่คนดูกล้องคุ้นอยู่แล้ว และอ่านออกทุกภาษาโดยไม่ต้องแปล
 * `cols` = จำนวนคอลัมน์บนจอกว้าง · จอแคบลดจำนวนคอลัมน์ให้เองใน Cameras.css
 */
const GRIDS = [
  { cols: 1, label: "1×1", hint: "จอเดียวเต็มความกว้าง" },
  { cols: 2, label: "2×2", hint: "สี่จอต่อหน้าจอ" },
  { cols: 3, label: "3×3", hint: "เก้าจอต่อหน้าจอ" },
  { cols: 4, label: "4×4", hint: "สิบหกจอต่อหน้าจอ" },
];

/** ค่าเริ่มต้น 4 คอลัมน์ — เห็นได้เยอะที่สุดโดยที่กรอบตรวจจับในภาพยังดูออก
    หน้าโรงเรือนเดียวมีกล้อง 3 ตัว ตั้งต้น 3 คอลัมน์จึงพอดีแถวเดียวและภาพใหญ่กว่า */
const DEFAULT_COLS = 4;
const DEFAULT_COLS_BARN = 3;

/** โรงเรือนทุกหลังของทุกฟาร์ม พร้อมชื่อฟาร์มติดมาด้วย (โครงเดียวกับหน้าอุณหภูมิทุกฟาร์ม) */
const buildBarns = (farms, barnsOf) =>
  farms.flatMap((farm) =>
    barnsOf(farm.id).map((barn) => ({
      ...barn,
      farmId: farm.id,
      farmName: farm.name,
      province: farm.province,
    }))
  );

export default function Cameras() {
  const t = useT();
  /* รวมฟาร์ม/โรงเรือนที่ผู้ใช้เพิ่มเองด้วย — หลังที่ยังไม่ได้ติดกล้องจะขึ้นเป็น "ไม่มีสัญญาณ" */
  const { farms, barnsOf } = useAllFarms();
  const allBarns = useMemo(() => buildBarns(farms, barnsOf), [farms, barnsOf]);

  /* ที่มาของตัวเลขกล้อง — คิดจากของที่มีจริง ไม่เขียนตายตัว (T1.283)
     ฟาร์มที่ต่อเซนเซอร์จริงยังไม่มีกล้อง ตัวเลขที่เห็นจึงมาจากฟาร์มตัวอย่างล้วน
     ถ้าวันหนึ่งติดกล้องที่ฟาร์มจริง ป้ายจะเปลี่ยนเป็น "จริง + ตัวอย่าง" เอง */
  const camSource = useMemo(() => {
    const cams = (list) => list.reduce((n, b) => n + (b.cameras?.length ?? 0), 0);
    return blendSource(
      cams(allBarns.filter((b) => b.dataSource === "live")) > 0,
      cams(allBarns.filter((b) => b.dataSource !== "live")) > 0,
    );
  }, [allBarns]);

  /* เก็บสิ่งที่กำลังดูไว้ใน URL ไม่ใช่ state — ลิงก์จากป๊อบอัพเลือกฟาร์มจึงเจาะตรงมาได้เลย
     และผู้ใช้กด back กลับไปมุมมองก่อนหน้าได้ตามที่คาด */
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  /* เข้ามาทางเส้นทางรายโรงเรือนหรือเปล่า — /dashboard/cameras/:farmId/:barnId */
  const route = useParams();
  const barn = route.barnId
    ? (allBarns.find((b) => b.id === route.barnId && b.farmId === route.farmId) ?? null)
    : null;
  /* เจาะรายโรงเรือนมาแต่หาหลังนั้นไม่เจอ (ลิงก์เก่า/พิมพ์ URL เอง/โรงเรือนถูกลบไปแล้ว) */
  const missingBarn = Boolean(route.barnId) && !barn;

  /* ฟาร์มที่กำลังดู: มาจากเส้นทางเมื่อเจาะรายโรงเรือน ไม่งั้นมาจากตัวกรอง ?farm=
     **รับเฉพาะรหัสฟาร์มที่มีอยู่จริง** — รหัสมั่ว ๆ (ลิงก์เก่า/พิมพ์เอง) เคยกรองจนเหลือศูนย์
     แต่หัวหน้ายังเขียนว่า "ทุกฟาร์ม" ผู้ใช้จึงเห็น "ทุกฟาร์ม · 0 กล้อง" ซึ่งขัดกันเอง
     ➜ รหัสที่ไม่รู้จักให้ตกกลับเป็นทุกฟาร์ม เห็นของครบเหมือนเปิดหน้านี้ตรง ๆ */
  const wantedFarmId = route.farmId ?? params.get("farm") ?? "";
  const farm = farms.find((f) => f.id === wantedFarmId) ?? null;
  const farmId = farm ? farm.id : "";
  const byCamera = params.get("view") === "camera";
  /* จำนวนคอลัมน์ของผนังกล้อง — รับเฉพาะค่าที่มีปุ่มให้กดจริง กัน ?grid= มั่ว ๆ จากแถบที่อยู่ */
  const defaultCols = barn ? DEFAULT_COLS_BARN : DEFAULT_COLS;
  const cols = GRIDS.some((g) => String(g.cols) === params.get("grid"))
    ? Number(params.get("grid"))
    : defaultCols;

  /* อ่านค่าเดิมจากตัวที่ส่งเข้ามา ไม่ใช่จาก params ที่ปิดทับไว้ตอน render —
     กดสองปุ่มรัว ๆ ในจังหวะเดียวกัน ค่าที่กดก่อนจะได้ไม่หายไปกับการเขียนทับ */
  const setParam = (key, value) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true }
    );
  };

  /* ป๊อบอัพเลือกฟาร์มเปิดอยู่หรือไม่ — ไม่ได้เก็บใน URL เพราะเป็นสภาพชั่วคราวของหน้าจอ
     ไม่ใช่สิ่งที่ควรติดไปกับลิงก์ (ต่างจากฟาร์ม/มุมมอง/จำนวนจอที่เก็บไว้ใน ?…) */
  const [scopeOpen, setScopeOpen] = useState(false);

  /* เปลี่ยนฟาร์มจากป๊อบอัพ: อยู่หน้าผนังรวมก็แค่เปลี่ยนตัวกรอง แต่ถ้ากำลังเจาะโรงเรือนอยู่
     ต้องพากลับออกมาที่ผนังรวมของฟาร์มนั้น (ใส่ ?farm= ในเส้นทางรายโรงเรือนไม่มีผลอะไร) */
  const pickScope = (id) => {
    setScopeOpen(false);
    if (!barn) {
      setParam("farm", id);
      return;
    }
    const query = new URLSearchParams(params);
    if (id) query.set("farm", id);
    else query.delete("farm");
    const search = query.toString();
    navigate(`/dashboard/cameras${search ? `?${search}` : ""}`);
  };

  const scopeName = barn ? t(barn.name) : farm ? t(farm.name) : t("ทุกฟาร์ม");
  /* ขอบเขตของหน้า: โรงเรือนเดียว → ฟาร์มเดียว → ทุกฟาร์ม */
  const rows = barn ? [barn] : farmId ? allBarns.filter((b) => b.farmId === farmId) : allBarns;

  /* ตัวเลขรวมของสิ่งที่กำลังดูอยู่ (ทุกฟาร์ม หรือฟาร์มเดียวเมื่อกรองไว้)
     โรงเรือนที่ออฟไลน์ในข้อมูลไม่มีรายการกล้องเลย (cameras = []) จึงนับ "ไม่มีสัญญาณ"
     จากจำนวนกล้องที่มีจริง ไม่ใช่จากสถานะอย่างเดียว — หลังที่ผู้ใช้เพิ่งเพิ่มก็ยังไม่มีกล้องเหมือนกัน */
  /* เวลาอัปเดตล่าสุดของทั้งเครือ — ผู้ใช้ลบฟาร์มได้จนไม่เหลือสักฟาร์ม รายการจึงว่างได้จริง
     (เคยอ่าน farms[0].updatedAt ตรง ๆ แล้วลบฟาร์มหมดเมื่อไรหน้านี้ขาวทั้งหน้า) */
  const latestUpdate = farms.map((f) => f.updatedAt).sort().at(-1) ?? null;

  /* ═══ ★★ กล้องจริงมีตัวเดียว และอยู่ที่โรงเรือนเดียว (T1.356) ═══
     ถามสถานะเฉพาะตอนที่หลังนั้นอยู่ในขอบเขตที่กำลังดู — ผนังรวมของทุกฟาร์มก็เข้าข่าย
     ไม่งั้นเปิดหน้าไหนก็ยิงถามกล่องของทีมเขาทุกห้าวินาทีโดยไม่ได้เอาคำตอบไปใช้ */
  const realInScope = rows.some((b) => b.id === REAL_CAMERA.barnKey);
  const vision = useVisionHealth(realInScope);
  const visionStream = useVisionStreamUrl(realInScope && vision.ok);
  /* ภาพโหลดไม่ขึ้นทั้งที่สถานะบอกว่าต่อได้ — นับเป็นไม่มีสัญญาณเหมือนกัน
     (ขอตั๋วผ่านแต่ภาพมาไม่ถึง เป็นคนละเรื่องกับกล่องไม่ตอบ) */
  const [streamLost, setStreamLost] = useState(false);
  useEffect(() => setStreamLost(false), [visionStream]);
  /* ★ มีภาพให้ดูจริงไหม — ต้องครบทั้งสามอย่าง ไม่ใช่แค่ "ต่อได้" */
  const visionLive = vision.ok && Boolean(visionStream) && !streamLost;

  const live = rows.filter((b) => b.status !== "offline" && b.cameras.length > 0);
  const noSignal = rows.length - live.length;
  const cameraCount = rows.reduce((sum, b) => sum + b.cameras.length, 0);
  /* ★ ยอดรวม: กล้องจริงใช้ "เห็นในภาพตอนนี้" ของจริง แทนเลขตัวอย่างของกล้องตัวนั้น
     ส่วนกล้องที่เหลือยังเป็นตัวอย่าง — ป้ายที่มาข้างบนจึงขึ้นว่า "จริง + ตัวอย่าง"
     ★★ ต่อกล้องจริงไม่ได้ = **ไม่นับของตัวนั้นเลย** ไม่ใช่ถอยไปใช้เลขตัวอย่างแทน
        ไม่งั้นยอดรวมจะดูปกติทั้งที่กล้องดับ ซึ่งแย่กว่ายอดที่ลดลงแล้วคนสังเกตเห็น */
  const detected = live.reduce(
    (sum, b) =>
      sum +
      b.cameras.reduce((n, cam) => {
        if (!isRealCamera(b.id, cam.id)) return n + cam.detected;
        return n + (visionLive ? (vision.counts?.inFrame ?? 0) : 0);
      }, 0),
    0
  );

  /* ตัวเลือกในป๊อบอัพเลือกฟาร์ม — "ทุกฟาร์ม" มาก่อน แล้วตามด้วยฟาร์มทีละใบพร้อมตัวเลขของฟาร์มนั้น
     (บอกจำนวนกล้อง/โรงเรือน/ที่ไม่มีสัญญาณไว้เลย จะได้เลือกได้โดยไม่ต้องกดเข้าไปดูทีละฟาร์ม) */
  const countOf = (list) => ({
    barns: list.length,
    cameras: list.reduce((sum, b) => sum + b.cameras.length, 0),
    noSignal: list.filter((b) => b.status === "offline" || b.cameras.length === 0).length,
  });
  const scopes = [
    { id: "", name: t("ทุกฟาร์ม"), ...countOf(allBarns) },
    ...farms.map((item) => ({
      id: item.id,
      name: item.name,
      ...countOf(allBarns.filter((b) => b.farmId === item.id)),
    })),
  ];

  /* ใบที่จะวางบนผนังกล้อง — สลับระหว่าง "ใบละโรงเรือน" กับ "ใบละตัวกล้อง" ตามที่ผู้ใช้เลือก
     (หน้ารายโรงเรือนกางกล้องทุกตัวเสมอ ปุ่มสลับจึงไม่มีให้กด — เหลือใบเดียวก็ไม่ได้ดูอะไร)

     ปลายทางของแต่ละใบต่างกันตามระดับที่ยืนอยู่:
       ผนังรวม  → หน้ากล้องของโรงเรือนนั้น (กางกล้องทุกตัวของหลังนั้น)
       รายโรงเรือน → หน้าภายในโรงเรือน ที่กดขยายเต็มจอและบันทึกภาพได้ */
  const tiles = rows.flatMap((row) => {
    const base = {
      barn: row,
      to: barn
        ? `/dashboard/farms/${row.farmId}/barns/${row.id}#camera`
        : `/dashboard/cameras/${row.farmId}/${row.id}`,
      /* AI ทำเครื่องหมาย "เฝ้าดู" เมื่อโรงเรือนนั้นมีสุกรป่วย (กติกาเดียวกับหน้าภายในโรงเรือน) */
      flagIndex: row.today.sick > 0 ? 3 : -1,
    };
    /* ชื่อใต้ภาพ: ผนังรวมขึ้น **ชื่อฟาร์มก่อน** แล้วค่อยโรงเรือน (ตามที่ผู้ใช้สั่ง) —
       ผนังรวมเรียงโรงเรือนของหลายฟาร์มติดกัน ชื่อฟาร์มจึงเป็นตัวบอกว่ากำลังดูของใครอยู่
       ส่วนหน้ารายโรงเรือนขึ้นชื่อกล้อง เพราะชื่อฟาร์ม/โรงเรือนอยู่บนหัวหน้าและหัวการ์ดแล้ว */
    const label = barn
      ? { title: null, sub: t("{farm} · {barn}", { farm: t(row.farmName), barn: t(row.name) }) }
      /* ช่วงวัยยังว่างได้ (โรงเรือนจริงยังไม่ได้ระบุ) — กรองทิ้งก่อนต่อจุดคั่น
         ไม่งั้นใต้ภาพจะขึ้นว่า "โรงเรือน A1 · null" */
      : {
          title: t(row.farmName),
          sub: [row.name, row.stage].filter(Boolean).map((word) => t(word)).join(" · "),
        };

    /* ใบที่ไม่มีภาพก็ต้องมีชื่อเสมอ — หน้ารายโรงเรือนไม่มีชื่อกล้องให้ใช้ จึงถอยไปใช้ชื่อฟาร์ม */
    if (row.cameras.length === 0) {
      return [
        { ...base, ...label, key: row.id, cam: null, title: label.title ?? t(row.farmName) },
      ];
    }
    if (!byCamera && !barn) {
      const head = row.cameras[0];
      return [{
        ...base, ...label, key: row.id, cam: head, more: row.cameras.length,
        real: isRealCamera(row.id, head.id),
      }];
    }
    return row.cameras.map((cam) => ({
      ...base,
      ...label,
      key: `${row.id}-${cam.id}`,
      cam,
      /* ★ ตัวเดียวเท่านั้นที่เป็นกล้องจริง — ห้ามเอาภาพเดียวกันไปแปะแทนกล้องทุกตัว */
      real: isRealCamera(row.id, cam.id),
      title: label.title ?? (isRealCamera(row.id, cam.id) ? t(REAL_CAMERA.name) : t(cam.name)),
    }));
  });

  return (
    <>
      <PageHeader
        title={
          missingBarn
            ? t("ไม่พบโรงเรือนนี้")
            : barn
              ? t("กล้อง AI · {barn}", { barn: t(barn.name) })
              : t("กล้อง AI ทุกฟาร์ม")
        }
        subtitle={
          /* หัวหน้าต้องพูดเรื่องเดียวกับเนื้อหาข้างล่างเสมอ — ตอนหาโรงเรือนไม่เจอจะไม่มีผนังกล้อง
             ให้ดู การบอกจำนวนกล้องของทั้งเครือตรงนี้จึงกลายเป็นตัวเลขที่ไม่ได้อ้างถึงอะไรเลย */
          missingBarn
            ? t("รหัสโรงเรือน “{id}” ไม่ตรงกับข้อมูลในระบบ", { id: route.barnId })
            : barn
              ? t("{farm} · {stage} · {cams} กล้อง · อัปเดตล่าสุด {time}", {
                  farm: t(barn.farmName),
                  stage: t(barn.stage),
                  cams: formatNumber(cameraCount),
                  time: formatDateTime(barn.updatedAt),
                })
              : t("{scope} · {cams} กล้อง ใน {barns} โรงเรือน · อัปเดตล่าสุด {time}", {
                  scope: scopeName,
                  cams: formatNumber(cameraCount),
                  barns: formatNumber(rows.length),
                  time: formatDateTime(latestUpdate),
                })
        }
        action={
          barn ? (
            /* ทางไปต่อของหน้านี้: เข้าหน้าภายในโรงเรือนที่มีกราฟ ปุ่มควบคุม และภาพเต็มจอ */
            <Link className="cm-head-link" to={`/dashboard/farms/${barn.farmId}/barns/${barn.id}`}>
              <span className="cm-head-icon" aria-hidden="true">
                <Icon name="home" size={20} />

      {/* กล้องยังมีเฉพาะฟาร์มตัวอย่าง — ต้องบอกก่อนคนอ่านตัวเลข (T1.283) */}
      <DataSourceNote source={camSource === "demo" ? "demo" : "mixed"} />
              </span>
              <span className="cm-head-text">
                <span>{t("ดูข้อมูลทั้งหมดของหลังนี้")}</span>
                <b>{t("เข้าหน้า{barn}", { barn: t(barn.name) })}</b>
              </span>
              <Icon name="chevron" size={18} className="cm-scope-arrow" aria-hidden="true" />
            </Link>
          ) : null
        }
      />

      {/* เจาะรายโรงเรือนแต่หาโรงเรือนไม่เจอ (ลิงก์เก่า/พิมพ์ URL เอง) — บอกตรง ๆ พร้อมทางกลับ */}
      {missingBarn ? (
        <Card title={t("ไม่พบโรงเรือนนี้")} icon="camera">
          <p className="fx-empty">
            โรงเรือนที่เรียกดูไม่มีอยู่ในระบบแล้ว หรือลิงก์ไม่ถูกต้อง
          </p>
          <Link className="cm-head-link" to="/dashboard/cameras">
            <span className="cm-head-icon" aria-hidden="true">
              <Icon name="grid" size={20} />
            </span>
            <span className="cm-head-text">
              <span>{t("กลับไปที่")}</span>
              <b>{t("ผนังกล้องทุกฟาร์ม")}</b>
            </span>
          </Link>
        </Card>
      ) : (
      <PageBoard boardId={barn ? BOARD_BARN : BOARD_ALL}>
        <Block id="cameras" label={t("กล้องทั้งหมด")}>
          {/* สีประจำกล่อง: ฟ้า = จำนวน · เขียว = ปกติ · แดง = ต้องดู · ทอง = ผลจาก AI
              เป็นชุดสีเดียวกับกล่องสรุปหน้าภาพรวม สายตาจึงแยกออกทันทีว่าใบไหนเรื่องอะไร */}
          <StatTile
            source={barn ? (barn.dataSource === "live" ? "live" : "demo") : camSource}
            variant="row"
            tone="blue"
            /* ขอบเขตที่ดูอยู่บอกไว้แล้วทั้งบนหัวหน้าและบนปุ่มเลือกฟาร์ม — ใส่ซ้ำในหัวกล่อง
               จะยาวจนตกสองบรรทัด แล้วกล่องสูงไม่เท่าเพื่อนทั้งแถว */
            label={barn ? t("กล้องของหลังนี้") : t("กล้องทั้งหมด")}
            value={formatNumber(cameraCount)}
            unit={t("กล้อง")}
            delta={{
              text: barn
                ? t("โซน {zone} · {stage}", { zone: barn.zone, stage: t(barn.stage) })
                : t("ติดตั้งใน {n} โรงเรือน", { n: formatNumber(live.length) }),
              tone: "neutral",
            }}
          />
        </Block>

        <Block id="online" label={barn ? t("สุกรตามทะเบียน") : t("โรงเรือนที่มีภาพ")}>
          {barn ? (
            <StatTile
              source={barn ? (barn.dataSource === "live" ? "live" : "demo") : camSource}
              variant="row"
              tone="climate"
              label={t("สุกรตามทะเบียน")}
              value={formatNumber(barn.pigs)}
              unit={t("ตัว")}
              delta={{
                text: t("AI นับได้ {n} ตัว", { n: formatNumber(barn.today.aiCount ?? 0) }),
                tone: (barn.today.aiCount ?? 0) < barn.pigs ? "bad" : "good",
              }}
            />
          ) : (
            <StatTile
              source={barn ? (barn.dataSource === "live" ? "live" : "demo") : camSource}
              variant="row"
              tone="climate"
              label={t("โรงเรือนที่มีภาพ")}
              value={formatNumber(live.length)}
              unit={t("โรงเรือน|หน่วยนับ")}
              delta={{
                text: t("จากทั้งหมด {n} หลัง", { n: formatNumber(rows.length) }),
                tone: "good",
              }}
            />
          )}
        </Block>

        <Block id="offline" label={barn ? t("สถานะโรงเรือน") : t("โรงเรือนที่ไม่มีสัญญาณ")}>
          {barn ? (
            <StatTile
              source={barn ? (barn.dataSource === "live" ? "live" : "demo") : camSource}
              variant="row"
              tone="critical"
              label={t("สุกรที่ต้องดู")}
              value={formatNumber(barn.today.sick)}
              unit={t("ตัว")}
              /* ข้อความต้องจบบรรทัดเดียว ไม่งั้นกล่องใบนี้สูงกว่าเพื่อนทั้งแถว
                 (เวลาที่นับอยู่บนหัวหน้าแล้ว ไม่ต้องบอกซ้ำในกล่อง) */
              delta={{
                text: t("หายไป {n} ตัว", { n: formatNumber(barn.today.missing) }),
                tone: barn.today.sick > 0 || barn.today.missing > 0 ? "bad" : "good",
              }}
            />
          ) : (
            <StatTile
              source={barn ? (barn.dataSource === "live" ? "live" : "demo") : camSource}
              variant="row"
              tone="critical"
              label={t("ไม่มีสัญญาณ")}
              value={formatNumber(noSignal)}
              unit={t("โรงเรือน|หน่วยนับ")}
              delta={{
                text: noSignal > 0 ? t("ออฟไลน์หรือยังไม่ได้ติดกล้อง") : t("ทุกหลังมีภาพครบ"),
                tone: noSignal > 0 ? "bad" : "good",
              }}
            />
          )}
        </Block>

        <Block id="detected" label={t("AI นับได้รวม")}>
          {/* หน้ารายโรงเรือนใช้ยอดเดียวกับหน้าภายในโรงเรือน (today.aiCount) ไม่ใช่ผลบวกของกล้องทีละตัว
              — สองเลขนั้นต่างกันเล็กน้อยตามการปัดเศษ ถ้าเอามาวางคู่กันจะดูเหมือนระบบนับไม่ตรง */}
          <StatTile
            /* ★ ใบนี้ใบเดียวที่เป็นค่าจากกล้องจริง ป้ายที่มาจึงต้องเป็น "ข้อมูลจริง"
                 ไม่ใช่ "ข้อมูลตัวอย่าง" ตามโรงเรือนที่มันอยู่ — ติดป้ายผิดคือโกหกคนอ่าน
                 (ต่อไม่ได้แล้วค่าเป็นศูนย์ ก็ยังเป็นของจริง ไม่ใช่ของตัวอย่าง) */
            source={
              barn && realInScope
                ? "live"
                : barn
                  ? (barn.dataSource === "live" ? "live" : "demo")
                  : camSource
            }
            variant="row"
            tone="gold"
            label={barn && realInScope ? t("เห็นในภาพตอนนี้") : t("AI นับได้รวม")}
            value={formatNumber(
              barn && realInScope
                ? (visionLive ? (vision.counts?.inFrame ?? 0) : 0)
                : barn
                  ? (barn.today.aiCount ?? 0)
                  : detected
            )}
            unit={t("ตัว")}
            delta={{
              /* ★★ "เห็นในภาพตอนนี้" กับ "สุทธิจากเส้นนับ" เป็นคนละเลข ทีมกล้องย้ำข้อนี้มาเอง
                     เอามาปนกันเมื่อไหร่ ตัวเลขฝูงสุกรบนหน้าจอจะผิดโดยไม่มีใครรู้ */
              text:
                barn && realInScope
                  ? visionLive
                    ? t("เดินเข้า {in} · ออก {out} · สุทธิ {net} ตัว", {
                        in: formatNumber(vision.counts?.in ?? 0),
                        out: formatNumber(vision.counts?.out ?? 0),
                        net: formatNumber(vision.counts?.net ?? 0),
                      })
                    : t("ไม่มีสัญญาณ — {why}", { why: t(vision.why ?? "ต่อกล้องไม่ได้") })
                  : barn
                    ? t("จากกล้อง {n} ตัวของหลังนี้", { n: formatNumber(cameraCount) })
                    : t("จากกล้องที่ส่งภาพอยู่ {n} ตัว", { n: formatNumber(cameraCount) }),
              tone: barn && realInScope && !visionLive ? "bad" : "neutral",
            }}
          />
        </Block>

        {/* ---------- ผนังกล้อง ---------- */}
        <Block id="wall" label={t("ผนังกล้อง")}>
          <Card
            title={
              barn
                ? t("กล้องของ{barn}", { barn: t(barn.name) })
                : t("ผนังกล้อง · {scope}", { scope: scopeName })
            }
            subtitle={
              barn
                ? t("กล้องทุกตัวของหลังนี้ · กดที่ภาพเพื่อเข้าไปดูเต็มจอและบันทึกภาพ")
                : t("กดที่ภาพเพื่อดูกล้องทุกตัวของโรงเรือนนั้น")
            }
            icon="camera"
          >
            <div className="cm-bars">
              {/* ฟาร์มมีได้เรื่อย ๆ (ผู้ใช้เพิ่มเองได้) — เรียงเป็นปุ่มทีละใบจะกินความกว้างไม่จบ
                  จึงเหลือปุ่มเดียวที่บอกว่ากำลังดูฟาร์มไหน แล้วเลือกในป๊อบอัพ */}
              <button
                type="button"
                className="cm-scope"
                onClick={() => setScopeOpen(true)}
                aria-haspopup="dialog"
              >
                <span className="cm-scope-icon" aria-hidden="true">
                  <Icon name={barn ? "camera" : farm ? "pin" : "grid"} size={20} />
                </span>
                <span className="cm-scope-text">
                  <span>{barn ? t("กำลังดูกล้องของ") : t("ฟาร์มที่กำลังดู")}</span>
                  <b>{scopeName}</b>
                </span>
                <span className="cm-scope-meta num">
                  {barn
                    ? t("{cams} กล้อง · {farm}", {
                        cams: formatNumber(cameraCount),
                        farm: t(barn.farmName),
                      })
                    : t("{cams} กล้อง · {barns} โรงเรือน", {
                        cams: formatNumber(cameraCount),
                        barns: formatNumber(rows.length),
                      })}
                </span>
                <Icon name="chevron" size={18} className="cm-scope-arrow" aria-hidden="true" />
              </button>

              <div className="cm-tools">
                {/* หน้ารายโรงเรือนกางกล้องทุกตัวอยู่แล้ว ปุ่มนี้จึงไม่มีอะไรให้สลับ */}
                {!barn && (
                <div className="cm-views" role="group" aria-label={t("รูปแบบการแสดงผล")}>
                  <button
                    type="button"
                    aria-pressed={!byCamera}
                    className={"cm-view" + (!byCamera ? " is-on" : "")}
                    onClick={() => setParam("view", "")}
                  >
                    <Icon name="home" size={16} aria-hidden="true" />
                    {t("รายโรงเรือน")}
                  </button>
                  <button
                    type="button"
                    aria-pressed={byCamera}
                    className={"cm-view" + (byCamera ? " is-on" : "")}
                    onClick={() => setParam("view", "camera")}
                  >
                    <Icon name="camera" size={16} aria-hidden="true" />
                    {t("รายกล้อง")}
                  </button>
                </div>
                )}

                {/* กี่จอต่อหน้าจอ — กดปุ่มเดียวเปลี่ยนทั้งผนัง */}
                <div className="cm-grids" role="group" aria-label={t("จำนวนจอต่อหน้าจอ")}>
                  <Icon name="grid" size={16} className="cm-grids-icon" aria-hidden="true" />
                  {GRIDS.map((item) => (
                    <button
                      key={item.cols}
                      type="button"
                      aria-pressed={cols === item.cols}
                      title={t(item.hint)}
                      className={"cm-grid" + (cols === item.cols ? " is-on" : "")}
                      onClick={() =>
                        setParam("grid", item.cols === defaultCols ? "" : String(item.cols))
                      }
                    >
                      <span className="num">{item.label}</span>
                      <span className="sr-only">{t(item.hint)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {tiles.length === 0 ? (
              <p className="fx-empty">{t("ยังไม่มีโรงเรือนในขอบเขตที่เลือก")}</p>
            ) : (
              <ul className="cm-wall" data-cols={cols} style={{ "--cm-cols": cols }}>
                {tiles.map((tile) => (
                  <li key={tile.key} className="cm-cell">
                    {tile.cam && !(tile.real && !visionLive) ? (
                      <Link className="cm-shot" to={tile.to}>
                        <span className="cm-frame">
                          <CameraView
                            className="cm-view"
                            flagIndex={tile.flagIndex}
                            /* ★ กล้องจริงใช้สตรีมของมันเอง และห้ามถอยไปใช้ภาพตัวอย่าง */
                            stream={tile.real ? visionStream : tile.cam.stream}
                            live={tile.real}
                            onLost={tile.real ? () => setStreamLost(true) : undefined}
                            alt={t("ภาพจากกล้อง {cam} ของ {barn}", {
                              cam: t(tile.cam.name),
                              barn: t(tile.barn.name),
                            })}
                          />
                          <span className="cm-bar">
                            <Icon name="camera" size={15} aria-hidden="true" />
                            {tile.real ? t("ภาพสด") : t(`${tile.cam.name}|ชื่อสั้น`)}
                            <b className="num">
                              {formatNumber(tile.real ? (vision.counts?.inFrame ?? 0) : tile.cam.detected)}
                            </b>
                            <em>{t("ตัว")}</em>
                          </span>
                          {tile.more > 1 && (
                            <span className="cm-more">
                              {t("+{n} กล้อง", { n: formatNumber(tile.more - 1) })}
                            </span>
                          )}
                        </span>

                        <span className="cm-meta">
                          <b>{tile.title}</b>
                          <span>{tile.sub}</span>
                        </span>
                      </Link>
                    ) : (
                      /* ไม่มีภาพให้ดู จึงไม่ทำเป็นลิงก์ให้กดเก้อ — บอกสาเหตุตรง ๆ แทน */
                      <div className="cm-shot is-off">
                        <span className="cm-frame cm-frame-off">
                          <Icon name="camera" size={30} aria-hidden="true" />
                          <StatusBadge tone="offline">
                            {/* ★ กล้องจริงดับต้องบอกว่า "ไม่มีสัญญาณ" พร้อมเหตุผลจริง
                                ห้ามใช้คำว่า "ยังไม่ได้ติดกล้อง" เพราะติดแล้วแต่ภาพไม่มา */}
                            {tile.real
                              ? t("ไม่มีสัญญาณ")
                              : tile.barn.status === "offline"
                                ? t(BARN_STATUS_LABEL.offline)
                                : t("ยังไม่ได้ติดกล้อง")}
                          </StatusBadge>
                          {tile.real && vision.why && (
                            <span className="cm-why">{t(vision.why)}</span>
                          )}
                        </span>

                        <span className="cm-meta">
                          <b>{tile.title}</b>
                          <span>{tile.sub}</span>
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Block>
      </PageBoard>
      )}

      {/* ---------- ป๊อบอัพเลือกฟาร์ม ---------- */}
      <Modal
        open={scopeOpen}
        onClose={() => setScopeOpen(false)}
        icon="home"
        title={t("เลือกฟาร์ม")}
        subtitle={t("เลือกว่าจะให้ผนังกล้องแสดงฟาร์มไหน — เลือกทุกฟาร์มก็ได้")}
        footer={
          <button
            type="button"
            className="modal-btn"
            onClick={() => setScopeOpen(false)}
          >
            <Icon name="cross" size={19} />
            ปิด
          </button>
        }
      >
        <div className="cm-opts" role="radiogroup" aria-label={t("เลือกฟาร์ม")}>
          {scopes.map((item) => {
            const on = item.id === farmId;
            return (
              <label key={item.id || "all"} className={"cm-opt" + (on ? " is-on" : "")}>
                <input
                  type="radio"
                  className="sr-only"
                  name="cm-scope"
                  checked={on}
                  onChange={() => pickScope(item.id)}
                />
                <span className="icon-chip is-sm" aria-hidden="true">
                  <Icon name={item.id ? "pin" : "grid"} size={18} />
                </span>
                <span className="cm-opt-text">
                  <b>{item.name}</b>
                  <span className="cm-opt-meta">
                    {t("{cams} กล้อง ใน {barns} โรงเรือน", {
                      cams: formatNumber(item.cameras),
                      barns: formatNumber(item.barns),
                    })}
                    {item.noSignal > 0 && (
                      <>
                        {" · "}
                        <em>{t("ไม่มีสัญญาณ {n}", { n: formatNumber(item.noSignal) })}</em>
                      </>
                    )}
                  </span>
                </span>
                <span className="cm-opt-check" aria-hidden="true">
                  {on && <Icon name="check" size={16} />}
                </span>
              </label>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
