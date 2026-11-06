"""สร้างรูปสำหรับเอกสารเสนอพี่เลี้ยง — ใช้ผลจริงจากฐาน ไม่มีตัวเลขสมมติ

รัน:  docker compose exec wx-lab python /home/jovyan/work/make_charts.py
รูปออกที่ weather/lab/exports/charts/ แล้วเอาไปฝังในเอกสาร Word
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # หา baseline.py ข้าง ๆ กัน
import numpy as np, pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error
import baseline as B

OUT = "/home/jovyan/work/exports/charts"
GOLD, INK, MUTED, RED, GREEN, BLUE = "#8A6A1F", "#1F2933", "#5B6873", "#9B2C2C", "#1E6B41", "#2B6CB0"
plt.rcParams.update({"figure.dpi": 160, "axes.edgecolor": "#D9CDB4",
                     "axes.labelcolor": INK, "text.color": INK,
                     "xtick.color": MUTED, "ytick.color": MUTED,
                     "axes.grid": True, "grid.color": "#EDE6D6", "grid.linewidth": 0.8})

df = B.load()

fc = B.load_openmeteo_forecast()

def evaluate(target):
    rows, keep = [], None
    for h in B.HORIZONS:
        X, y, p = B.build(df, target, h)
        Xtr, Xte, ytr, yte, pte = B.split(X, y, p)
        usable = [c for c in Xtr.columns if Xtr[c].nunique(dropna=True) >= 2]
        Xtr, Xte = Xtr[usable], Xte[usable]
        m = HistGradientBoostingRegressor(max_iter=400, learning_rate=0.06, max_depth=6,
                                          early_stopping=True, validation_fraction=0.15,
                                          random_state=42).fit(Xtr, ytr)
        pred = m.predict(Xte)
        mae_wx, _ = B.openmeteo_mae(fc, yte, h)
        rows.append(dict(h=h, persist=mean_absolute_error(yte, pte),
                         openmeteo=mae_wx,
                         model=mean_absolute_error(yte, pred)))
        if h == 6:
            keep = pd.DataFrame({"จริง": yte.values, "โมเดลทาย": pred,
                                 "ทายเท่าเดิม": pte.values}, index=yte.index)
    return pd.DataFrame(rows), keep

def bars(res, title, fname):
    """สามแท่งต่อหนึ่งช่วงเวลา — ตัวเทียบขั้นต่ำ · พยากรณ์ฟรี · โมเดลเรา"""
    fig, ax = plt.subplots(figsize=(7.8, 3.6))
    x = np.arange(len(res)); w = 0.27
    ax.bar(x - w, res.persist, w, label="ทายว่าเท่าเดิม (ตัวเทียบขั้นต่ำ)", color="#C9BFA6")
    ax.bar(x, res.openmeteo, w, label="ใช้พยากรณ์ฟรี Open-Meteo ตรง ๆ", color=BLUE)
    ax.bar(x + w, res.model, w, label="โมเดลที่เทรนเอง", color=GOLD)
    for i, r in res.iterrows():
        ax.text(i + w, r.model + 0.04, f"{r.model:.2f}", ha="center", fontsize=8, color=INK)
        ax.text(i - w, r.persist + 0.04, f"{r.persist:.2f}", ha="center", fontsize=8, color=MUTED)
        if r.openmeteo == r.openmeteo:   # ไม่ใช่ NaN
            ax.text(i, r.openmeteo + 0.04, f"{r.openmeteo:.2f}", ha="center", fontsize=8, color=BLUE)
    ax.set_xticks(x); ax.set_xticklabels([f"{h} ชม." for h in res.h])
    ax.set_ylabel("ความคลาดเคลื่อนเฉลี่ย (°C)", labelpad=8)
    ax.set_xlabel("ทำนายล่วงหน้ากี่ชั่วโมง")
    ax.set_title(title + "   (แท่งยิ่งเตี้ยยิ่งดี)", fontsize=12, color=INK, pad=10)
    ax.legend(frameon=False, fontsize=9)
    for s in ("top", "right"): ax.spines[s].set_visible(False)
    fig.tight_layout(); fig.savefig(f"{OUT}/{fname}", bbox_inches="tight"); plt.close(fig)

def lines(keep, title, fname, n=120):
    d = keep.tail(n)
    fig, ax = plt.subplots(figsize=(7.4, 3.2))
    ax.plot(d.index, d["จริง"], color=INK, lw=2.0, label="ค่าที่เกิดขึ้นจริง")
    ax.plot(d.index, d["โมเดลทาย"], color=GOLD, lw=1.8, ls="--", label="โมเดลทายล่วงหน้า 6 ชม.")
    ax.set_ylabel("อุณหภูมิ (°C)")
    ax.set_title(title, fontsize=12, color=INK, pad=34)
    ax.legend(frameon=False, fontsize=9, ncol=2, loc="lower center",
              bbox_to_anchor=(0.5, 1.06))
    for s in ("top", "right"): ax.spines[s].set_visible(False)
    fig.autofmt_xdate(); fig.tight_layout()
    fig.savefig(f"{OUT}/{fname}", bbox_inches="tight"); plt.close(fig)

barn_res, barn_keep = evaluate("barn_temp_c")
mast_res, mast_keep = evaluate("mast_temp_c")
bars(barn_res, "ทำนายอุณหภูมิ “ในเล้า”", "01-barn-bars.png")
bars(mast_res, "ทำนายอุณหภูมิ “ข้างนอกที่ฟาร์ม”", "02-mast-bars.png")
lines(barn_keep, "อุณหภูมิในเล้า — ของจริงเทียบกับที่โมเดลทายไว้ล่วงหน้า 6 ชั่วโมง", "03-barn-lines.png")

# กราฟที่ 4 — ทำไมต้องมีโมเดลของเราเอง แทนที่จะใช้ Open-Meteo ตรง ๆ
d = df[["mast_temp_c", "wx_temp_c", "barn_temp_c"]].dropna()
d = d[d.index >= d.index.max() - pd.Timedelta(days=5)]
fig, ax = plt.subplots(figsize=(7.4, 3.2))
ax.plot(d.index, d.wx_temp_c,   color=BLUE, lw=1.8, label="Open-Meteo (อากาศของพื้นที่)")
ax.plot(d.index, d.mast_temp_c, color=RED,  lw=1.8, label="เสาวัดที่ฟาร์มจริง")
ax.plot(d.index, d.barn_temp_c, color=GREEN, lw=1.8, label="ในเล้าจริง")
ax.set_ylabel("อุณหภูมิ (°C)")
ax.set_title("อากาศของพื้นที่ · อากาศที่ฟาร์ม · อากาศในเล้า — ไม่ใช่ตัวเดียวกัน", fontsize=12, color=INK, pad=34)
ax.legend(frameon=False, fontsize=9, ncol=3, loc="lower center",
          bbox_to_anchor=(0.5, 1.06))
for s in ("top", "right"): ax.spines[s].set_visible(False)
fig.autofmt_xdate(); fig.tight_layout()
fig.savefig(f"{OUT}/04-three-lines.png", bbox_inches="tight"); plt.close(fig)

barn_res.to_csv(f"{OUT}/barn.csv", index=False)
mast_res.to_csv(f"{OUT}/mast.csv", index=False)
print(barn_res); print(mast_res); print("เขียนรูปแล้ว")
