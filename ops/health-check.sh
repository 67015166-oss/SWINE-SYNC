#!/bin/sh
# ตรวจสุขภาพระบบ SWINE SYNC ด้วยคำสั่งเดียว (T1.298)
#
# ทำไมต้องมี: ระบบนี้มีหลายชิ้นอยู่คนละเครื่อง และ **เวลาพังมันเงียบ**
# 25–28 ก.ย. 2569 กล่องดับ 3 วันไม่มีใครรู้ · 29 ก.ย. ข้อมูลหยุดไหลอีก 34 ชั่วโมง
# ไฟล์นี้มีไว้ให้คนที่เพิ่งมารับช่วงต่อ ตอบคำถาม "ตอนนี้ยังดีอยู่ไหม" ได้ใน 30 วินาที
#
# รัน:  sh ops/health-check.sh
# อ่านอย่างเดียวทั้งหมด — ไม่แก้ ไม่ลบ ไม่ส่งอะไรออกไปข้างนอก (ยิง health ของกล่องอย่างเดียว)
#
# รหัสออก: 0 = ปกติทั้งหมด · 1 = มีอย่างน้อยหนึ่งเรื่องที่ต้องไปดู
set -u

cd "$(dirname "$0")/.." || exit 1
[ -f .env ] && . ./.env 2>/dev/null

PROBLEMS=0
ok()   { printf "  [ ดี ]  %s\n" "$1"; }
bad()  { printf "  [ !! ]  %s\n" "$1"; printf "          ที่ต้องทำ: %s\n" "$2"; PROBLEMS=$((PROBLEMS + 1)); }
warn() { printf "  [ ? ]   %s\n" "$1"; }
head_() { printf "\n%s\n" "$1"; }

echo "═══ ตรวจสุขภาพ SWINE SYNC · $(date '+%d/%m/%Y %H:%M') ═══"

# ─── 1. เครื่องหลัก (กล่อง box-mew) ────────────────────────────────
head_ "1. เครื่องหลัก — ฐานข้อมูล · API · บอทไลน์ · เครื่องคิดแจ้งเตือน"
URL="${PRIMARY_HEALTH_URL:-https://mew.plotnexuslab.com/api/health}"
CODE=$(curl -s -m 15 -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null)
if [ "$CODE" = "200" ]; then
  ok "$URL ตอบ 200"
else
  # 000 = ต่อไม่ติดเลย · 503 = ขอบนอกอยู่แต่แอปในกล่องไม่ได้รัน
  # ★ คนดูแลแดชบอร์ดไม่มีสิทธิ์เปิดกล่องเอง — ต้องแจ้งคนที่มีสิทธิ์ (ตั้งชื่อได้ที่ PRIMARY_OWNER)
  bad "$URL ตอบ $CODE — ระหว่างนี้ไม่มีการแจ้งเตือนเข้าไลน์เลย" \
      "แจ้ง${PRIMARY_OWNER:-ผู้ดูแลกล่อง (คนที่มีสิทธิ์ที่ lab.plotnexuslab.com/box)} ให้เปิดกลับมา"
fi

# ─── 2. คอนเทนเนอร์บนเครื่องนี้ ────────────────────────────────────
head_ "2. คอนเทนเนอร์บนเครื่องนี้"
if ! docker info >/dev/null 2>&1; then
  bad "Docker ไม่ทำงาน" "เปิดโปรแกรม Docker Desktop"
else
  for c in swine-db swine-api swine-web swine-bridge influxdb; do
    if [ -n "$(docker ps -q -f name="^${c}$" 2>/dev/null)" ]; then
      ok "$c ทำงานอยู่"
    else
      bad "$c ไม่ได้ทำงาน" "docker compose up -d"
    fi
  done
fi

# ─── 3. ข้อมูลเซนเซอร์ยังไหลอยู่ไหม ───────────────────────────────
head_ "3. ข้อมูลเซนเซอร์ (ต้นทาง MQTT → Node-RED → InfluxDB)"
if pgrep -f node-red >/dev/null 2>&1; then
  ok "Node-RED ทำงานอยู่"
else
  bad "Node-RED ไม่ได้ทำงาน" "launchctl kickstart -k gui/\$(id -u)/com.swinesync.nodered"
fi

STATE=$(docker exec swine-bridge cat /state/dataflow-watch.json 2>/dev/null)
if [ -n "$STATE" ]; then
  case "$STATE" in
    *'"status":"up"'*) ok "ตัวเฝ้าข้อมูลบอกว่าปกติ" ;;
    *'"status":"down"'*)
      REASON=$(printf '%s' "$STATE" | sed -n 's/.*"lastReason":"\([^"]*\)".*/\1/p')
      # ★ ห้ามขึ้นหัวเรื่องว่า "ข้อมูลหยุดไหล" เอง (T1.317) — ตัวเฝ้ารายงานได้สองแบบ
      #   คือ "ดิสก์ใกล้เต็มแต่ข้อมูลยังไหล" กับ "ข้อมูลหยุดแล้ว" ซึ่งเร่งด่วนไม่เท่ากัน
      #   เขียนทับเป็น "หยุดไหล" ทุกกรณีทำให้คนตกใจผิดเรื่อง แล้วเลิกเชื่อการแจ้งเตือน
      #   ตัวเหตุผลที่ตัวเฝ้าส่งมาบอกครบอยู่แล้ว ใช้เป็นหัวเรื่องตรง ๆ
      bad "ตัวเฝ้าข้อมูลเตือน — ${REASON:-ไม่รู้สาเหตุ}" \
          "ถ้าเป็นเรื่องดิสก์ให้ลบไฟล์ · ถ้าไม่ใช่ ให้ตรวจ Node-RED และตู้ควบคุมที่ฟาร์ม" ;;
    *) warn "ตัวเฝ้าข้อมูลยังไม่ได้ตรวจรอบแรก (สะพานเพิ่งเริ่ม)" ;;
  esac
else
  warn "อ่านสถานะตัวเฝ้าข้อมูลไม่ได้ (สะพานอาจไม่ได้ทำงาน)"
fi

# ─── 4. ดิสก์ของเครื่องที่เก็บข้อมูล ──────────────────────────────
head_ "4. ดิสก์"
# ★ บน macOS `df /` คือวอลุ่มระบบแบบอ่านอย่างเดียว — รายงาน "ใช้ไป 60%" ทั้งที่วอลุ่มข้อมูลเต็ม 98%
#   ของจริงอยู่ที่ /System/Volumes/Data (เจอเองตอนเขียนไฟล์นี้ 30 ก.ย. 2569)
DISK_AT="/"
[ -d /System/Volumes/Data ] && DISK_AT="/System/Volumes/Data"
USED=$(df -h "$DISK_AT" 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $5}')
AVAIL=$(df -h "$DISK_AT" 2>/dev/null | awk 'NR==2 {print $4}')
if [ -n "$USED" ] && [ "$USED" -ge 95 ] 2>/dev/null; then
  bad "ใช้ไปแล้ว ${USED}% เหลือ ${AVAIL} ($DISK_AT) — เขียนข้อมูลลงฐานไม่ได้เมื่อไร ข้อมูลหายถาวร" \
      "ลบไฟล์ในเครื่อง · หาตัวที่กินที่ด้วย: sudo du -xh -d 2 / | sort -h | tail -25"
else
  ok "ใช้ไป ${USED}% เหลือ ${AVAIL} ($DISK_AT)"
fi

# ─── 5. ตัวเฝ้าระวังทั้งสองตัวเปิดส่งไลน์อยู่ไหม ──────────────────
head_ "5. ตัวเฝ้าระวัง"
PSTATE=$(docker exec swine-bridge cat /state/primary-watch.json 2>/dev/null)
[ -n "$PSTATE" ] && ok "ตัวเฝ้าเครื่องหลักเดินอยู่" || warn "ยังไม่มีไฟล์สถานะของตัวเฝ้าเครื่องหลัก"
for v in PRIMARY_WATCH_NOTIFY FLOW_WATCH_NOTIFY; do
  VAL=$(docker exec swine-bridge printenv "$v" 2>/dev/null)
  case "$VAL" in
    0) warn "$v = 0 — ตรวจอยู่แต่ **ยังไม่ส่งไลน์** (ตั้งเป็น 1 ใน .env แล้ว docker compose up -d bridge)" ;;
    "") warn "$v ไม่ได้ตั้งไว้" ;;
    *) ok "$v = $VAL (ส่งไลน์จริง)" ;;
  esac
done

# ─── 6. เครื่องนี้จะหลับไหม ────────────────────────────────────────
# ★ ทำไมต้องตรวจ: 3–5 พ.ย. 2569 ข้อมูลหายไป 19 ใน 20 ส่วนทุกคืน **โดยไม่มี error เลย**
#   เครื่องนี้ตั้งไว้ว่าใช้แบตแล้วหลับหลังว่าง 1 นาที · ตอนหลับ Node-RED ไม่ได้ฟัง MQTT
#   และ broker เป็น QoS 0 ไม่เก็บย้อนหลัง — **ที่ขาดไปกู้ไม่ได้**
#   อาการนี้ดูจาก log ไม่เห็น เพราะทุกโปรแกรมยัง "รันอยู่" ตามปกติ
head_ "6. เครื่องนี้จะหลับไหม"
if command -v pmset >/dev/null 2>&1; then
  if pmset -g batt 2>/dev/null | grep -q "'AC Power'"; then
    SRC="AC"
  else
    SRC="BATT"
  fi
  # ดึงค่า sleep ของบล็อกที่ตรงกับแหล่งไฟที่ใช้อยู่จริง
  SLEEP_MIN=$(pmset -g custom 2>/dev/null | awk -v want="$SRC" '
    /^Battery Power:/ { blk = "BATT"; next }
    /^AC Power:/      { blk = "AC";   next }
    blk == want && $1 == "sleep" { print $2; exit }')
  if [ "${SLEEP_MIN:-0}" = "0" ]; then
    ok "ไม่หลับ (แหล่งไฟ: $SRC · sleep = ${SLEEP_MIN:-ไม่พบค่า})"
  else
    bad "เครื่องใช้ $SRC อยู่ และตั้งให้หลับหลังว่าง ${SLEEP_MIN} นาที — ตอนหลับจะเก็บค่าได้แค่เศษเดียวโดยไม่มี error ให้เห็น" \
        "เสียบสายชาร์จไว้ — ค่าของฝั่ง AC คือไม่หลับ (ย้าย Node-RED ไปกล่องไม่ใช่ทางออก ดู RUNBOOK หัวข้อกติกาข้อมูลขององค์กร)"
  fi
else
  warn "ไม่ใช่ macOS จึงข้ามการตรวจเรื่องหลับ (ถ้าเครื่องนี้เป็นตัวรับ MQTT ต้องตั้งไม่ให้หลับเอง)"
fi

# ─── สรุป ─────────────────────────────────────────────────────────
echo ""
if [ "$PROBLEMS" -eq 0 ]; then
  echo "═══ ไม่พบปัญหา ═══"
else
  echo "═══ พบ $PROBLEMS เรื่องที่ต้องไปดู (บรรทัดที่ขึ้น [ !! ]) ═══"
fi
echo "รายละเอียดของแต่ละเรื่องอยู่ใน docs/RUNBOOK.md"
[ "$PROBLEMS" -eq 0 ] || exit 1
