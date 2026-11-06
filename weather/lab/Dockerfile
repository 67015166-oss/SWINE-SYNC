# ที่ทำงานสำหรับเทรนโมเดล — JupyterLab + pandas + scikit-learn
#
# ═══ ทำไมใช้ image สำเร็จรูป แทนที่จะ pip install เอง ═══
# รอบแรกเขียนเป็น `FROM python:3.12-slim` แล้ว pip install ทุกอย่าง — build ไม่จบใน
# 30 นาที ลองแยกทดสอบพบว่า **แค่คำนวณ dependency ของ jupyterlab อย่างเดียวก็เกิน 4 นาที**
# (เน็ตจากเครือข่ายนี้เข้า pypi ช้ามาก — หน้า index หน้าเดียวใช้ 3.7 วินาที
#  ตรงกับที่ docs/RUNBOOK.md เตือนไว้เรื่องเครือข่าย CPF ทำ TLS interception)
#
# image ของโครงการ Jupyter มี pandas · numpy · scikit-learn · matplotlib · scipy
# มาให้ครบแล้ว **ดึงจาก registry ไม่ผ่าน pypi** ซึ่งเร็วปกติ
# เหลือแค่สองตัวเล็ก ๆ ที่ต้องลงเอง คือตัวต่อ PostgreSQL
#
# ไม่ปักเวอร์ชันของ base image ไว้โดยตั้งใจ — โครงการ Jupyter ออก tag เป็นวันที่
# ซึ่งเดาเองแล้วผิดง่าย ถ้าวันหลังอยากล็อกให้ build ซ้ำได้เป๊ะ ให้ดู tag จริงที่
# quay.io/jupyter/scipy-notebook แล้วมาใส่แทน latest
FROM quay.io/jupyter/scipy-notebook:latest

# ═══ ฟอนต์ไทยสำหรับกราฟ ═══
# ฟอนต์ที่มากับ matplotlib (DejaVu Sans) **ไม่มีตัวอักษรไทยเลย** ชื่อแกนและหัวกราฟ
# ภาษาไทยจะกลายเป็นกล่องสี่เหลี่ยมทั้งหมด และ matplotlib เตือนเป็นร้อยบรรทัด
# แต่ยังวาดกราฟออกมาให้ จึงเป็นข้อบกพร่องที่มองข้ามได้ง่ายถ้าไม่เปิดรูปดูจริง
# (ลงจาก apt ของ Debian ไม่ใช่ pypi จึงไม่ติดปัญหาเน็ตช้าเหมือนข้างบน)
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-thai-tlwg \
 && rm -rf /var/lib/apt/lists/*
USER ${NB_UID}

# สองตัวนี้ image ต้นทางไม่มีให้ — ใช้ต่อฐาน TimescaleDB
# (แค่สองตัวและเป็น wheel สำเร็จ จึงลงเร็วแม้เน็ตช้า)
RUN pip install --no-cache-dir psycopg2-binary SQLAlchemy

# ตั้งให้ทุกกราฟใช้ฟอนต์ไทยเป็นค่าตั้งต้น ไม่ต้องไปเขียนซ้ำในทุกสมุด
# (Loma มากับ fonts-thai-tlwg และอ่านง่ายที่ขนาดเล็ก)
RUN mkdir -p /home/jovyan/.config/matplotlib \
 && printf 'font.family: Loma\naxes.unicode_minus: False\n' \
    > /home/jovyan/.config/matplotlib/matplotlibrc \
 && rm -rf /home/jovyan/.cache/matplotlib
# ═══ บรรทัด rm -rf ข้างบนขาดไม่ได้ ═══
# image ต้นทางสร้างแคชรายชื่อฟอนต์ของ matplotlib ติดมาตั้งแต่ตอน build ของเขา
# ฟอนต์ที่เราเพิ่งลงจึงไม่อยู่ในแคชนั้น matplotlib จะขึ้น "Font family 'Loma' not found"
# แล้ว **ถอยไปใช้ DejaVu เงียบ ๆ** ได้กราฟที่ภาษาไทยเป็นกล่องสี่เหลี่ยมเหมือนเดิม
# (เจอจริงตอนทดสอบ — ฟอนต์อยู่ใน /usr/share/fonts ครบแต่ matplotlib มองไม่เห็น)

# image นี้รันเป็นผู้ใช้ jovyan และเริ่ม JupyterLab ให้เองอยู่แล้ว
# ไม่ต้องเขียน CMD ทับ — เขียนทับแล้วจะข้ามสคริปต์เตรียมสิทธิ์ของเขาไป
WORKDIR /home/jovyan/work
COPY --chown=${NB_UID}:${NB_GID} baseline.py make_charts.py ./

ENV TZ=Asia/Bangkok

# การปิดถามรหัสอยู่ที่ `command:` ใน docker-compose.yml ไม่ได้อยู่ที่นี่
# (ตั้งเป็น ENV แล้วไม่มีผล — เหตุผลเขียนไว้ตรงนั้น)
