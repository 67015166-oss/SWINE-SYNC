#!/bin/sh
# สร้างใบรับรองของเราเองให้หน้าเว็บสาธิตเปิดผ่าน https ได้
#
# **ทำไมต้องมี** — เบราว์เซอร์ปิดไมโครโฟนและกล้องทั้งหน้าเมื่อหน้านั้นเปิดผ่าน http
# ที่ไม่ใช่ localhost เปิดแดชบอร์ดจากมือถือด้วยเลข IP เมื่อไหร่ วอยซ์กับกล้องใช้ไม่ได้ทันที
#
# ใบรับรองนี้ **เราออกเอง ไม่มีใครรับรอง** เบราว์เซอร์จะเตือนครั้งแรกว่าไม่ปลอดภัย
# กดผ่านไปหนึ่งครั้ง (Advanced → Proceed) แล้วหน้านั้นจะนับเป็นหน้าปลอดภัยเต็มตัว
# ไมค์กับกล้องใช้ได้ตามปกติ — ใช้สำหรับสาธิตในเครือข่ายของเราเท่านั้น
# **ห้ามเอาไปใช้กับของจริงที่คนนอกเข้าถึง** ของจริงต้องใช้ใบรับรองที่มีคนออกให้
#
# ใช้: sh ops/make-cert.sh [ชื่อโฮสต์หรือ IP เพิ่มเติม ...]
# กุญแจไปอยู่ที่ ops/certs/ ซึ่ง .gitignore กันไว้แล้ว — **ห้าม commit กุญแจส่วนตัว**

set -e
DIR="$(cd "$(dirname "$0")" && pwd)/certs"
mkdir -p "$DIR"

# รวมชื่อที่จะเข้าถึงได้: localhost + IP ของเครื่องนี้ + ที่ใส่เพิ่มมาเอง
NAMES="DNS:localhost,IP:127.0.0.1"
for ip in $(ifconfig 2>/dev/null | awk '/inet /{print $2}' | grep -v '^127\.'); do
  NAMES="$NAMES,IP:$ip"
done
for extra in "$@"; do
  case "$extra" in
    [0-9]*.[0-9]*.[0-9]*.[0-9]*) NAMES="$NAMES,IP:$extra" ;;
    *) NAMES="$NAMES,DNS:$extra" ;;
  esac
done

CONF="$(mktemp)"
cat > "$CONF" <<EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = SWINE SYNC demo
[ext]
subjectAltName = $NAMES
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
EOF

openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 825 \
  -keyout "$DIR/server.key" -out "$DIR/server.crt" -config "$CONF" -extensions ext
rm -f "$CONF"
chmod 600 "$DIR/server.key"

echo
echo "ใบรับรองพร้อมแล้วที่ $DIR"
echo "ครอบคลุม: $NAMES"
echo "ขั้นต่อไป: docker compose up -d --build web  แล้วเปิด https://<ไอพีของเครื่องนี้>:8443"
