/**
 * FarmMap — แผนที่จริงแบบเลื่อน/ซูมได้ ทำเองด้วย raster tile (ไม่พึ่ง library แผนที่)
 *
 * หลักการ: Web Mercator เหมือน Google Maps/Leaflet
 *   โลกทั้งใบที่ zoom z = 256 · 2^z พิกเซล
 *   เก็บ view เป็นพิกัด "พิกเซลของโลก" (cx, cy) ที่ zoom z — ทำให้ pan/zoom
 *   เป็นเลขคณิตตรง ๆ ไม่ต้องแปลงกลับไปกลับมาให้ค่าเพี้ยน
 *
 * การใช้งาน: <FarmMap farms={...} selectedId={...} onSelect={fn} />
 * หมายเหตุ tile: ใช้ basemap สาธารณะของ OpenStreetMap
 *   ต้องแสดง attribution เสมอ — ถ้าขึ้น production ที่ทราฟฟิกสูง ให้เปลี่ยน
 *   TILE_URL เป็นผู้ให้บริการที่มีสัญญา หรือ self-host แล้วส่วนอื่นไม่ต้องแก้
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { hasPin, THAILAND_BOUNDS } from "../../lib/geo.js";
import { useT } from "../../lib/i18n/useT.js";
import Icon from "../ui/Icon.jsx";
import "./FarmMap.css";

const TILE_SIZE = 256;
const MIN_ZOOM = 4;
const MAX_ZOOM = 15;
const SINGLE_ZOOM = 11; // ระดับที่เห็นทั้งอำเภอและเมืองข้างเคียง (ใช้ตอนมีหมุดเดียว)
const FIT_PAD_X = 130; // เผื่อที่ให้ป้ายชื่อฟาร์มที่ยื่นไปทางขวาของหมุด
const FIT_PAD_Y = 60; // เผื่อที่ให้ตัวหมุดที่สูงขึ้นไปเหนือจุดพิกัด

/* ย้ายจาก CARTO Positron มาใช้ tile มาตรฐานของ OpenStreetMap (30 ส.ค. 2569)
   เหตุผล: CARTO เปลี่ยนนโยบาย basemap ชุดนั้นต้องมีกุญแจแล้ว ทั้งภาพปกติและ retina
   ยิงตรงทั้งแบบมีและไม่มี Referer ได้ไฟล์เดียวกันที่ **มีลายน้ำ "API KEY REQUIRED" ทับทั้งผืน**
   แผนที่จึงเสียหน้าตาสำหรับผู้ใช้ทุกคน ไม่ใช่แค่บางเครื่อง

   tile ของ OSM ฟรี ไม่ต้องมีกุญแจ และมีชื่อสถานที่ภาษาไทยด้วย
   **แลกมาด้วยสีที่จัดกว่าโทนครีม-ทองของแบรนด์** — ถ้าอยากได้หน้าตาพาสเทลแบบเดิม
   ให้สมัครกุญแจ CARTO แล้วเปลี่ยนกลับเป็น
     `https://basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png?api_key=...`
   **ถ้าเปลี่ยนผู้ให้บริการ ต้องแก้บรรทัด attribution ท้ายแผนที่ให้ตรงด้วยเสมอ**
   (กติกาข้อ "แผนที่" ใน docs/DESIGN.md — ห้ามลบ attribution ของ tile)

   ไม่ใส่ `@2x` เพราะ OSM ไม่มีชุด retina ให้ */
const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

/* ---------- Web Mercator: องศา → พิกเซลของโลกที่ zoom z ---------- */
const worldSize = (z) => TILE_SIZE * 2 ** z;

const lngToX = (lng, z) => ((lng + 180) / 360) * worldSize(z);

const latToY = (lat, z) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * worldSize(z);
};

/* ทางกลับ: พิกเซลของโลก → องศา (ใช้ตอนผู้ใช้คลิกเลือกจุดบนแผนที่) */
const xToLng = (x, z) => (x / worldSize(z)) * 360 - 180;

const yToLat = (y, z) => {
  const n = Math.PI * (1 - (2 * y) / worldSize(z));
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/* ระยะที่ถือว่าหมุด "ทับกัน" แล้วต้องรวมเป็นกลุ่ม (พิกเซลบนจอ) */
const CLUSTER_RADIUS = 36;

/** สถานะที่ "หนักที่สุด" ของกลุ่ม — กลุ่มต้องเตือนเท่าฟาร์มที่แย่ที่สุดในกลุ่ม */
const worstStatus = (list) =>
  list.some((f) => f.status === "warning")
    ? "warning"
    : list.some((f) => f.status === "offline")
      ? "offline"
      : "good";

/**
 * รวมหมุดที่อยู่ใกล้กันเกินไปให้เป็นกลุ่มเดียว (เช่น เชียงใหม่กับลำพูนที่ห่างกัน ~25 กม.
 * ตอนซูมออกจะทับกันจนคลิกไม่ได้) — ซูมเข้าแล้วกลุ่มจะแยกออกเองตามระยะจริง
 */
function clusterPoints(points) {
  const groups = [];
  for (const p of points) {
    const near = groups.find(
      (g) => Math.hypot(g.x - p.x, g.y - p.y) < CLUSTER_RADIUS
    );
    if (near) {
      near.items.push(p.farm);
      near.x = (near.x * (near.items.length - 1) + p.x) / near.items.length;
      near.y = (near.y * (near.items.length - 1) + p.y) / near.items.length;
    } else {
      groups.push({ x: p.x, y: p.y, items: [p.farm] });
    }
  }
  return groups;
}

/* ขนาดโดยประมาณของป้ายชื่อ — ใช้ตรวจว่าป้ายจะทับกันไหม (เผื่อไว้กว้างกว่าจริงเล็กน้อย) */
const LABEL_W = 200;
const LABEL_H = 48;
const LABEL_GAP = 21; // ระยะจากจุดพิกัดถึงขอบป้าย

/**
 * เลือกข้างของป้ายชื่อ: วางขวาก่อน ถ้าไปทับป้ายที่วางไปแล้วหรือล้นขอบขวา ให้สลับไปซ้าย
 * ทำให้ฟาร์มที่อยู่ใกล้กัน (เช่น เชียงใหม่–ลำพูน) อ่านชื่อได้ทั้งคู่
 */
function placeLabels(groups, mapW) {
  const placed = [];
  const overlaps = (b) =>
    placed.some((p) => !(b.x2 < p.x1 || b.x1 > p.x2 || b.y2 < p.y1 || b.y1 > p.y2));

  return [...groups]
    .sort((a, b) => a.y - b.y)
    .map((g) => {
      const cy = g.items.length > 1 ? g.y : g.y - 22; // กลุ่มวางกลางวงกลม, หมุดเดี่ยววางที่หัวหมุด
      const y1 = cy - LABEL_H / 2;
      const y2 = cy + LABEL_H / 2;
      const right = { x1: g.x + LABEL_GAP, x2: g.x + LABEL_GAP + LABEL_W, y1, y2 };
      const left = { x1: g.x - LABEL_GAP - LABEL_W, x2: g.x - LABEL_GAP, y1, y2 };

      const preferLeft = right.x2 > mapW || overlaps(right);
      const useLeft = preferLeft && left.x1 > 0 && !overlaps(left);

      placed.push(useLeft ? left : right);
      return { ...g, labelSide: useLeft ? "left" : "right" };
    });
}

/** หา view ที่พอดีกับจุดทั้งหมด (zoom สูงสุดที่ยังใส่ได้ครบ) */
function fitView(rawPoints, w, h) {
  /* คัดเฉพาะจุดที่พิกัดใช้ได้จริง — จุดเสีย 1 จุดลากกรอบทั้งแผนที่ไปคนละทวีปได้
     และถ้าไม่เหลือจุดเลย ให้เปิดมาที่ประเทศไทย ไม่ใช่ลองจิจูด 0 กลางมหาสมุทร */
  const valid = rawPoints.filter(hasPin);
  const points = valid.length > 0 ? valid : THAILAND_BOUNDS;

  /* หมุดเดียวไม่มีกรอบให้จัด ถ้าปล่อยตามสูตรจะได้ zoom สูงสุดคือระดับถนน
     ซึ่งดูไม่ออกว่าอยู่จังหวัดไหน — ตรึงไว้ที่ระดับที่ยังเห็นเมืองรอบ ๆ */
  if (points.length === 1) {
    const [p] = points;
    return { cx: lngToX(p.lng, SINGLE_ZOOM), cy: latToY(p.lat, SINGLE_ZOOM), z: SINGLE_ZOOM };
  }

  // จอแคบเผื่อขอบเยอะเท่าจอกว้างไม่ได้ ไม่งั้นจะซูมออกจนแผนที่ไม่มีประโยชน์
  const padX = Math.min(FIT_PAD_X, w * 0.2);
  const padY = Math.min(FIT_PAD_Y, h * 0.15);

  for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
    const xs = points.map((p) => lngToX(p.lng, z));
    const ys = points.map((p) => latToY(p.lat, z));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    if (maxX - minX + padX * 2 <= w && maxY - minY + padY * 2 <= h) {
      return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, z };
    }
  }
  const xs = points.map((p) => lngToX(p.lng, MIN_ZOOM));
  const ys = points.map((p) => latToY(p.lat, MIN_ZOOM));
  return {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cy: (Math.min(...ys) + Math.max(...ys)) / 2,
    z: MIN_ZOOM,
  };
}

/**
 * @param onPick ถ้าส่งมา แผนที่จะกลายเป็น "โหมดเลือกจุด" — คลิกที่ไหนก็ได้บนแผนที่
 *   แล้วคืนพิกัดของจุดนั้นกลับไป (ใช้ในป๊อบอัพเพิ่ม/แก้ไขฟาร์ม จะได้ไม่ต้องพิมพ์ตัวเลขเอง)
 */
export default function FarmMap({ farms, selectedId, onSelect, onPick = null }) {
  const t = useT();
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const movedRef = useRef(false);
  /* ผู้ใช้เลื่อน/ซูมเองแล้วหรือยัง — ถ้าแล้วห้ามรีเซ็ตกรอบทับตอนจอเปลี่ยนขนาด */
  const touchedRef = useRef(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(null);

  /* วัดขนาดกรอบ — แผนที่ต้องรู้ขนาดจริงถึงจะคำนวณ tile ได้
     วัดตรง ๆ ทันทีก่อน แล้วค่อยให้ ResizeObserver คอยตามตอนจอเปลี่ยนขนาด
     (ถ้ารอ ResizeObserver อย่างเดียว แท็บที่ถูกซ่อนอยู่จะไม่ได้ callback → แผนที่ว่างเปล่า) */
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;

    const measure = (w, h) =>
      setSize((s) => {
        const next = { w: Math.round(w), h: Math.round(h) };
        return s.w === next.w && s.h === next.h ? s : next;
      });

    const rect = el.getBoundingClientRect();
    measure(rect.width, rect.height);

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      measure(width, height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* จัดกรอบให้เห็นทุกฟาร์มพอดี — ทำตอนรู้ขนาดครั้งแรก และตอนจอเปลี่ยนขนาด
     (แต่ถ้าผู้ใช้เลื่อน/ซูมเองไปแล้ว ต้องไม่ไปรีเซ็ตมุมมองของเขา) */
  useEffect(() => {
    if (!size.w || !size.h || touchedRef.current) return;
    setView(fitView(farms, size.w, size.h));
  }, [size, farms]);

  const fitAll = useCallback(() => {
    if (!size.w || !size.h) return;
    touchedRef.current = false;
    setView(fitView(farms, size.w, size.h));
  }, [farms, size]);

  /** ซูมโดยตรึงจุด (ax, ay) ในกรอบไว้กับที่ — เหมือนซูมด้วยล้อเมาส์ในแผนที่ทั่วไป */
  const zoomTo = useCallback(
    (nextZoom, ax, ay) =>
      setView((v) => {
        if (!v) return v;
        const z = clamp(Math.round(nextZoom), MIN_ZOOM, MAX_ZOOM);
        if (z === v.z) return v;
        touchedRef.current = true;
        const scale = 2 ** (z - v.z);
        const offX = ax - size.w / 2;
        const offY = ay - size.h / 2;
        return {
          z,
          cx: (v.cx + offX) * scale - offX,
          cy: (v.cy + offY) * scale - offY,
        };
      }),
    [size]
  );

  const zoomBy = (step) => zoomTo((view?.z ?? MIN_ZOOM) + step, size.w / 2, size.h / 2);

  /* ซูมด้วยล้อเมาส์ — ต้องกด Ctrl/⌘ ค้าง ไม่งั้นล้อจะไปแย่งการเลื่อนหน้าเพจ */
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setView((v) =>
        v
          ? (() => {
              const z = clamp(v.z + (e.deltaY < 0 ? 1 : -1), MIN_ZOOM, MAX_ZOOM);
              if (z === v.z) return v;
              touchedRef.current = true;
              const scale = 2 ** (z - v.z);
              const offX = e.clientX - rect.left - rect.width / 2;
              const offY = e.clientY - rect.top - rect.height / 2;
              return {
                z,
                cx: (v.cx + offX) * scale - offX,
                cy: (v.cy + offY) * scale - offY,
              };
            })()
          : v
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* ---------- ลากเลื่อน (ใช้ pointer event ครอบคลุมทั้งเมาส์และนิ้ว) ---------- */
  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, dist: 0, id: e.pointerId, captured: false };
    movedRef.current = false;
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    d.dist += Math.abs(dx) + Math.abs(dy);
    if (d.dist > 4) {
      movedRef.current = true;
      touchedRef.current = true;
      /* จับ pointer ไว้ก็ต่อเมื่อ "ลากจริง" แล้วเท่านั้น — ถ้าจับตั้งแต่ pointerdown
         เบราว์เซอร์จะเปลี่ยนเป้าหมายของ click ทำให้กดหมุดไม่ติด */
      if (!d.captured) {
        e.currentTarget.setPointerCapture?.(d.id);
        d.captured = true;
      }
    }
    setView((v) => {
      if (!v) return v;
      const world = worldSize(v.z);
      return {
        ...v,
        cx: clamp(v.cx - dx, 0, world),
        cy: clamp(v.cy - dy, size.h / 2, world - size.h / 2),
      };
    });
  };

  const endDrag = (e) => {
    const d = dragRef.current;
    if (d?.captured) e.currentTarget.releasePointerCapture?.(d.id);
    dragRef.current = null;
  };

  /* คลิกบนแผนที่เพื่อวางหมุด (เฉพาะโหมดเลือกจุด)
     - ต้องไม่ใช่การลาก (movedRef) ไม่งั้นเลื่อนแผนที่ทีก็ย้ายหมุดที
     - ตั้ง touchedRef ไว้ด้วย เพราะพอหมุดย้าย farms จะเปลี่ยน ถ้าไม่กันไว้
       ตัวจัดกรอบจะซูมพรวดไปหาหมุดใหม่ทุกครั้งที่คลิก */
  const onPickClick = (e) => {
    if (!onPick || !view || movedRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = view.cx - size.w / 2 + (e.clientX - rect.left);
    const y = view.cy - size.h / 2 + (e.clientY - rect.top);
    touchedRef.current = true;
    onPick({ lat: yToLat(y, view.z), lng: xToLng(x, view.z) });
  };

  const onDoubleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    zoomTo((view?.z ?? MIN_ZOOM) + 1, e.clientX - rect.left, e.clientY - rect.top);
  };

  /* ---------- คำนวณ tile และตำแหน่งหมุดจาก view ปัจจุบัน ---------- */
  const tiles = [];
  const markers = [];

  if (view && size.w && size.h) {
    const left = view.cx - size.w / 2;
    const top = view.cy - size.h / 2;
    const n = 2 ** view.z;

    for (let ty = Math.floor(top / TILE_SIZE); ty <= Math.floor((top + size.h) / TILE_SIZE); ty++) {
      if (ty < 0 || ty >= n) continue;
      for (
        let tx = Math.floor(left / TILE_SIZE);
        tx <= Math.floor((left + size.w) / TILE_SIZE);
        tx++
      ) {
        tiles.push({
          key: `${view.z}/${tx}/${ty}`,
          url: TILE_URL(view.z, ((tx % n) + n) % n, ty),
          x: tx * TILE_SIZE - left,
          y: ty * TILE_SIZE - top,
        });
      }
    }

    const visible = [];
    for (const farm of farms) {
      /* กันหมุดผี — ฟาร์มที่พิกัดว่าง/ไม่ใช่ตัวเลข จะถูกคำนวณเป็นละติจูด-ลองจิจูด 0
         แล้วไปโผล่กลางมหาสมุทรแอตแลนติก */
      if (!hasPin(farm)) continue;
      const x = lngToX(farm.lng, view.z) - left;
      const y = latToY(farm.lat, view.z) - top;
      if (x < -80 || x > size.w + 80 || y < -80 || y > size.h + 80) continue;
      visible.push({ farm, x, y });
    }
    markers.push(...placeLabels(clusterPoints(visible), size.w));
  }

  return (
    <div className={"farm-map" + (onPick ? " is-picking" : "")}>
      <div
        className="farm-map-frame"
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={onPickClick}
        onDoubleClick={onDoubleClick}
        role="application"
        aria-label={
          onPick
            ? t("แผนที่เลือกตำแหน่งฟาร์ม คลิกบนแผนที่เพื่อวางหมุด ลากเพื่อเลื่อน")
            : t("แผนที่ตำแหน่งฟาร์มสุกร ลากเพื่อเลื่อน กด Ctrl ค้างพร้อมหมุนล้อเพื่อซูม")
        }
      >
        <div className="farm-map-tiles" aria-hidden="true">
          {tiles.map((t) => (
            <img
              key={t.key}
              className="farm-map-tile"
              src={t.url}
              alt=""
              draggable="false"
              /* ห้ามใช้ loading="lazy" — tile ถูกวางด้วย transform เบราว์เซอร์จะคิดว่า
                 อยู่นอกจอแล้วไม่ยอมโหลด เราคัดกรอง tile ที่มองเห็นเองอยู่แล้ว */
              decoding="async"
              style={{ transform: `translate3d(${t.x}px, ${t.y}px, 0)` }}
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          ))}
        </div>

        {markers.map(({ items, x, y, labelSide }) => {
          const isCluster = items.length > 1;
          const status = isCluster ? worstStatus(items) : items[0].status;
          const isSelected = !isCluster && items[0].id === selectedId;

          return (
            <button
              key={items.map((f) => f.id).join("+")}
              type="button"
              className={
                `farm-marker is-${status} label-${labelSide}` +
                (isCluster ? " is-cluster" : "") +
                (isSelected ? " is-selected" : "")
              }
              style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}
              aria-pressed={isSelected}
              onClick={() => {
                if (movedRef.current) return; // เพิ่งลากแผนที่อยู่ ไม่นับเป็นการคลิกหมุด
                if (isCluster) {
                  zoomTo(view.z + 2, x, y); // ซูมเข้าให้กลุ่มแยกออกจากกัน
                  return;
                }
                onSelect(isSelected ? null : items[0].id);
              }}
            >
              {isCluster ? (
                <span className="farm-marker-cluster">
                  <span className="farm-marker-cluster-num num">{items.length}</span>
                </span>
              ) : (
                <svg className="farm-marker-pin" viewBox="0 0 24 32" width="26" height="34">
                  <path
                    d="M12 0C5.4 0 0 5.3 0 11.9 0 20.5 12 32 12 32s12-11.5 12-20.1C24 5.3 18.6 0 12 0z"
                    fill="currentColor"
                  />
                  <circle cx="12" cy="11.7" r="4.8" fill="var(--bg-surface)" />
                </svg>
              )}
              <span className="farm-marker-label">
                {isCluster ? t("{n} ฟาร์ม", { n: items.length }) : t(items[0].name)}
                <span className="farm-marker-sub">
                  {isCluster
                    ? items.map((f) => t(f.province)).join(" · ")
                    : t(items[0].province)}
                </span>
              </span>
            </button>
          );
        })}

        <div className="farm-map-zoom">
          <button
            type="button"
            onClick={() => zoomBy(1)}
            disabled={(view?.z ?? MIN_ZOOM) >= MAX_ZOOM}
            aria-label={t("ซูมเข้า")}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoomBy(-1)}
            disabled={(view?.z ?? MIN_ZOOM) <= MIN_ZOOM}
            aria-label={t("ซูมออก")}
          >
            −
          </button>
          <button type="button" onClick={fitAll} aria-label={t("ดูทุกฟาร์มพอดีจอ")}>
            <Icon name="expand" size={18} />
          </button>
        </div>

        <p className="farm-map-credit">© OpenStreetMap contributors</p>
      </div>

      <p className="farm-map-hint">
        {t("ลากเพื่อเลื่อนแผนที่ · ดับเบิลคลิกหรือปุ่ม + / − เพื่อซูม · คลิกหมุดเพื่อดูข้อมูลฟาร์ม")}
      </p>
    </div>
  );
}
