#!/bin/sh
# ═══ ส่วนที่รันบนกล่อง — ตรวจแล้วสลับ dist-new ขึ้นเป็น dist ═══
#
# แยกเป็นไฟล์ของตัวเองเพื่อ **ทดสอบได้จริงโดยไม่ต้องแตะเว็บจริง**
# (ops/deploy-swap.sh ไปป์ไฟล์นี้เข้า ssh · test/deploySwap.test.js รันกับโฟลเดอร์ทดสอบ)
#
# ตั้ง ROOT ชี้ไปที่อื่นได้สำหรับการทดสอบ — ไม่ตั้ง = /home/dev ของจริง
#
# รหัสออก  0 = สลับแล้ว หรือไม่มีอะไรให้สลับ (ทั้งสองอย่างถือว่าปกติ)
#          1 = ของใหม่ไม่ครบ **ไม่แตะของเดิมเลย**
set -eu
cd "${ROOT:-/home/dev}"

if [ ! -d dist-new ]; then
  echo "ข้าม: ไม่มี dist-new รออยู่ — ไม่มีอะไรให้สลับ (ของรอบก่อนขึ้นไปแล้ว)"
  exit 0
fi

# ── ของใหม่ต้องครบจริงก่อนถึงจะยอมแตะของเดิม ──
[ -f dist-new/index.html ] || { echo "หยุด: dist-new ไม่มี index.html"; exit 1; }
ASSETS=$(ls dist-new/assets 2>/dev/null | wc -l | tr -d ' ')
[ "$ASSETS" -gt 0 ] || { echo "หยุด: dist-new/assets ว่าง"; exit 1; }
echo "ของใหม่พร้อม: $ASSETS ไฟล์ใน assets"

# ── หาชื่อที่ยังไม่มีใครใช้ ──
# ★★ กันเคสที่ทำให้เว็บล่มมาแล้ว: ถ้าปลายทางมีอยู่ `mv` จะไม่เขียนทับ
#   แต่**ย้ายเข้าไปซ้อนข้างใน** กลายเป็น dist-old-DATE/dist ซึ่งหาไม่เจอถ้าไม่รู้
STAMP=$(date +%Y%m%d-%H%M)
TARGET="dist-old-$STAMP"
N=1
while [ -e "$TARGET" ]; do
  TARGET="dist-old-$STAMP-$N"
  N=$((N + 1))
done

if [ -d dist ]; then
  mv dist "$TARGET"
  echo "สำรองของเดิมไว้ที่ $TARGET"
else
  echo "เตือน: ไม่มี dist เดิมอยู่แล้ว (เว็บน่าจะล่มอยู่) — วางของใหม่ลงไปเลย"
fi

mv dist-new dist
echo "สลับแล้ว: $(grep -oE 'main-[A-Za-z0-9_-]+\.js' dist/index.html | head -1)"
