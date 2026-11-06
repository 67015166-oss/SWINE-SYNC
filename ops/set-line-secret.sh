#!/usr/bin/env bash
# ใส่ Channel secret ของ LINE ลง .env โดยไม่ต้องพึ่งคลิปบอร์ด (T1.276)
#
# ทำไมต้องมีสคริปต์นี้: วิธี pbpaste พลาดง่ายมาก เพราะถ้าผู้ใช้คัดลอกคำสั่งจากแชท
# มาวางในเทอร์มินัล ของในคลิปบอร์ดจะกลายเป็นคำสั่งนั้นแทน secret (เจอจริง 2 รอบ)
# และตัว secret บางตัวมีอักขระที่ทำให้ sed เพี้ยนได้
#
# ค่าที่พิมพ์เข้ามาจะไม่ถูกแสดงบนจอและไม่ถูกบันทึกลงประวัติคำสั่ง
set -euo pipefail
cd "$(dirname "$0")/.."

printf 'วาง Channel secret แล้วกด Enter (ตัวอักษรจะไม่ขึ้นบนจอ): '
read -rs SECRET
printf '\n'

SECRET="$(printf '%s' "$SECRET" | tr -d '[:space:]')"

if [ -z "$SECRET" ]; then
  echo "ไม่ได้รับค่าอะไรเลย — ยังไม่ได้แก้ไฟล์" >&2
  exit 1
fi
if ! printf '%s' "$SECRET" | grep -Eq '^[0-9a-f]{32}$'; then
  echo "รูปแบบไม่ใช่ Channel secret (ต้องเป็นตัวเลขกับ a-f รวม 32 ตัว ได้มา ${#SECRET} ตัว) — ยังไม่ได้แก้ไฟล์" >&2
  echo "ถ้าเพิ่งกด Issue มา ลองคัดลอกใหม่จากแท็บ Basic settings ในคอนโซล LINE" >&2
  exit 1
fi

# เขียนด้วย python เพื่อไม่ต้องกังวลอักขระพิเศษแบบที่ sed เจอ
SECRET="$SECRET" python3 - <<'PY'
import os, pathlib, re
env = pathlib.Path(".env")
text = env.read_text()
line = "LINE_CHANNEL_SECRET=" + os.environ["SECRET"]
if re.search(r"^LINE_CHANNEL_SECRET=.*$", text, flags=re.M):
    text = re.sub(r"^LINE_CHANNEL_SECRET=.*$", line, text, count=1, flags=re.M)
else:
    text = text.rstrip("\n") + "\n" + line + "\n"
env.write_text(text)
print("เขียนลง .env แล้ว")
PY

docker compose up -d api
echo "เสร็จแล้ว — บอก Claude ได้เลยว่าใส่ secret แล้ว"
