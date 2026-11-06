"""
ทำนายไปข้างหน้าจริง แล้วเขียนผลเป็นไฟล์ JSON ให้แดชบอร์ดหยิบไปแสดง

═══ ต่างจาก baseline.py ยังไง ═══
`baseline.py` ตอบคำถามว่า **"โมเดลนี้เชื่อได้แค่ไหน"** — ย้อนไปวัดกับอดีตที่รู้คำตอบแล้ว
ไฟล์นี้ตอบคำถามว่า **"แล้วอีกกี่ชั่วโมงข้างหน้าจะกี่องศา"** — ทำนายของจริงที่ยังไม่เกิด
สองอย่างนี้ต้องมาคู่กันเสมอ ตัวเลขทำนายที่ไม่มีค่าความคลาดเคลื่อนกำกับคือตัวเลขลอย ๆ
หน้าจอจึงได้รับทั้งสองอย่างในไฟล์เดียว และแสดงคู่กันเสมอ

═══ ทำไมตัดฟีเจอร์ของเซนเซอร์ในเล้าทิ้ง (`--drop-prefix barn_`) ═══
เซนเซอร์ในเล้าเงียบไปตั้งแต่ 8 ก.ย. 2569 08:31 ถ้าเทรนโดยใช้ค่าพวกนั้นเป็นตัวแปรต้น
โมเดลจะพึ่งมันในตอนเทรน แล้วตอนทำนายจริงกลับไม่มีให้ใช้ — คะแนนในตารางจะสวยกว่า
ความแม่นจริงโดยไม่มีอะไรฟ้อง **ตัวเลขที่ประกาศต้องมาจากโมเดลตัวเดียวกับที่ใช้ทำนายจริง**
จึงตัดทิ้งทั้งตอนเทรนและตอนวัด ไม่ใช่ตัดเฉพาะตอนทำนาย

═══ วิธีใช้ ═══
    python predict.py                              เขียน models/forecast-mast_temp_c.json
    python predict.py --target barn_temp_c         (ต้องมีเซนเซอร์ในเล้าที่ยังส่งอยู่)
    python predict.py --out /path/ไฟล์.json
"""

import argparse
import json
import os
from datetime import timedelta

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error

import baseline
from baseline import DB_URL, add_lags, openmeteo_mae

# ระยะล่วงหน้าที่จะทำนาย — ถี่ช่วงต้นเพราะกราฟช่วงนั้นคนดูบ่อยที่สุด
HORIZONS = [1, 2, 3, 4, 6, 8, 12, 18, 24]

# ชั่วโมงย้อนหลังที่แนบไปกับไฟล์ ให้หน้าจอวาดเส้น "ที่ผ่านมา" ต่อกับเส้นทำนายได้
HISTORY_HOURS = 48

# ที่ทำนายได้ — คำอธิบายของแต่ละค่าที่หน้าจอต้องใช้ รวมอยู่ที่นี่ที่เดียว
#
# `wx` คือชื่อ measure ใน `fcst` ที่เอามาเทียบ **ต้องเป็นค่าเดียวกันจริง ๆ**
#      ไม่มีของคู่กันให้ใส่ None ดีกว่าจับคู่มั่ว แล้วได้ตารางที่ดูสมเหตุสมผลแต่เทียบผิดของ
#
# `bounds` คือขอบเขตที่ค่านั้นเป็นไปได้จริงในโลก **ต้องมีเสมอถ้าค่ามีขอบ**
#      โมเดลไม่รู้ว่าลมติดลบไม่ได้ ทำนายจริงได้ −0.02 m/s ออกมาแล้ว (10 ก.ย. 2569)
#      ตัวเลขติดลบบนหน้าจอทำให้คนเลิกเชื่อทั้งการ์ด ทั้งที่โมเดลชนะทุกตัวเทียบ
#      ตัดที่ขอบตอนแสดงผลเท่านั้น ไม่ได้ไปยุ่งกับตอนวัดคะแนน คะแนนจึงยังเป็นของจริง
TARGETS = {
    "mast_temp_c": {
        "label": "อุณหภูมิข้างนอกที่ฟาร์ม", "unit": "°C",
        "source": "เสาอากาศของฟาร์ม", "wx": "temp_c", "bounds": None,
    },
    "mast_rh": {
        "label": "ความชื้นข้างนอกที่ฟาร์ม", "unit": "%RH",
        "source": "เสาอากาศของฟาร์ม", "wx": "rh", "bounds": (0, 100),
    },
    "mast_wind_ms": {
        "label": "ความเร็วลมที่ฟาร์ม", "unit": "m/s",
        "source": "เสาอากาศของฟาร์ม", "wx": "wind_ms", "bounds": (0, None),
    },
    "barn_temp_c": {
        "label": "อุณหภูมิในเล้า", "unit": "°C",
        "source": "เซนเซอร์ในเล้า R", "wx": None, "bounds": None,
    },
    "barn_thi": {
        "label": "ดัชนีความเครียดร้อนของสุกร", "unit": "",
        "source": "เซนเซอร์ในเล้า R", "wx": None, "bounds": None,
    },
}


def clip(value: float, bounds) -> float:
    """ดันค่าที่ทำนายกลับเข้าขอบเขตที่เป็นไปได้จริง — ใช้ตอนแสดงผลเท่านั้น"""
    if bounds is None:
        return value
    lo, hi = bounds
    if lo is not None:
        value = max(lo, value)
    if hi is not None:
        value = min(hi, value)
    return value

# ตัวแปรต้นชุดเดียวกับ baseline.py — ต้องตรงกัน ไม่งั้นตัวเลขสองที่เทียบกันไม่ได้
BASE_CANDIDATES = [
    "barn_temp_c", "barn_rh", "barn_thi", "barn_airflow_ms", "barn_power_kw",
    "mast_temp_c", "mast_rh", "mast_wind_ms", "mast_light_lux",
    "wx_temp_c", "wx_rh", "wx_dew_c", "wx_pres_msl_hpa",
    "wx_cloud_pct", "wx_wind_ms", "wx_rad_wm2", "wx_rain_mm",
]


def engine():
    from sqlalchemy import create_engine
    return create_engine(DB_URL)


def load() -> pd.DataFrame:
    df = pd.read_sql("select * from v_feature_1h order by at", engine(), parse_dates=["at"])
    return df.set_index("at").sort_index()


def load_fcst(measure: str) -> pd.DataFrame:
    """
    คำพยากรณ์ทั้งหมดของค่าหนึ่งจาก Open-Meteo — ใช้เป็นตัวเทียบตอนให้คะแนน

    เหมือน `baseline.load_openmeteo_forecast()` ทุกอย่าง ต่างแค่เลือก measure ได้
    (ของเดิมตรึงไว้ที่ temp_c เพราะตอนนั้นทำนายแต่อุณหภูมิ)
    """
    if measure is None:
        return pd.DataFrame()
    fc = pd.read_sql(
        """select valid_at, issued_at, value
           from fcst
           where station = 'openmeteo_kpp' and measure = %(m)s""",
        engine(), params={"m": measure}, parse_dates=["valid_at", "issued_at"],
    )
    if fc.empty:
        return fc
    fc["lead"] = fc["valid_at"] - fc["issued_at"]
    return fc


def openmeteo_ahead(measure: str, after: pd.Timestamp, until: pd.Timestamp) -> dict:
    """
    คำพยากรณ์ของ Open-Meteo สำหรับชั่วโมงข้างหน้า — เอาไว้วางเทียบกับของเราบนกราฟเดียวกัน

    หยิบ **รอบที่ทำนายล่าสุด** ต่างจากตอนวัดคะแนนที่ต้องกรองด้วยระยะล่วงหน้า
    เพราะตรงนี้ไม่ได้เอาไปให้คะแนนใคร แค่บอกว่า "ถ้าดูพยากรณ์ฟรีตอนนี้จะเห็นเลขนี้"
    """
    if measure is None:
        return {}
    fc = pd.read_sql(
        """select valid_at, issued_at, value
           from fcst
           where station = 'openmeteo_kpp' and measure = %(m)s and valid_at > %(a)s
             and valid_at <= %(b)s""",
        engine(),
        params={"m": measure, "a": after.to_pydatetime(), "b": until.to_pydatetime()},
        parse_dates=["valid_at", "issued_at"],
    )
    if fc.empty:
        return {}
    latest = fc.sort_values("issued_at").groupby("valid_at").tail(1)
    return {row.valid_at: float(row.value) for row in latest.itertuples()}


def feature_frame(df: pd.DataFrame, drop_prefix: tuple[str, ...]):
    base = [c for c in BASE_CANDIDATES
            if c in df.columns and not c.startswith(drop_prefix)]
    feat = add_lags(df[base], base)
    return feat, base


def train_and_predict(df, feat, base, target: str, h: int, fc: pd.DataFrame, bounds=None):
    """
    เทรนหนึ่งโมเดลสำหรับหนึ่งระยะล่วงหน้า แล้วคืนทั้งคะแนนและคำทำนายของจริง

    **แถวที่ใช้ทำนายจริงคือแถวที่ยังไม่มีคำตอบ** ซึ่งเป็นแถวที่ `build()` ของ baseline
    ทิ้งไปตอน dropna พอดี ที่นี่จึงแยกสองอย่างออกจากกัน: ชุดเทรนคัดจากแถวที่มีคำตอบ
    ส่วนแถวทำนายหยิบจากท้ายตารางที่ตัวแปรต้นยังครบพอ
    """
    y = df[target].shift(-h)
    enough = feat[base].notna().sum(axis=1) >= max(3, len(base) // 3)

    fit_rows = enough & y.notna() & df[target].notna()
    X, yy, persist = feat[fit_rows], y[fit_rows], df[target][fit_rows]
    if len(X) < 200:
        return None

    cut = int(len(X) * 0.8)
    Xtr, Xte, ytr, yte, pte = X[:cut], X[cut:], yy[:cut], yy[cut:], persist[cut:]

    # คอลัมน์ที่ในชุดเทรนมีค่าเดียว/ว่างทั้งคอลัมน์ ทำให้ sklearn ล้ม (ดูเหตุผลใน baseline.py)
    usable = [c for c in Xtr.columns if Xtr[c].nunique(dropna=True) >= 2]
    Xtr, Xte = Xtr[usable], Xte[usable]

    def fresh():
        return HistGradientBoostingRegressor(
            max_iter=400, learning_rate=0.06, max_depth=6,
            early_stopping=True, validation_fraction=0.15, random_state=42,
        )

    scorer = fresh().fit(Xtr, ytr)
    mae_model = float(mean_absolute_error(yte, scorer.predict(Xte)))
    mae_persist = float(mean_absolute_error(yte, pte))
    mae_wx, n_wx = openmeteo_mae(fc, yte, h)

    # ═══ ตัวเทียบตัวที่สาม: "ชั่วโมงนี้ของวัน เฉลี่ยแล้วกี่องศา" ═══
    # จำเป็นเฉพาะตอนทำนายไกล ๆ และเป็นตัวที่เปิดโปงได้ว่าโมเดลกำลังทำอะไรอยู่จริง ๆ
    #
    # "ทายว่าเท่าเดิม" อ่อนแรงที่ระยะครึ่งวัน (36 ชม. พลาด 5.9 °C) แต่แข็งที่ทุกทวีคูณ
    # ของ 24 ชม. เพราะอากาศวนรอบวัน ➜ พอทำนายไกล ๆ โมเดลที่แค่จำรอบวันได้
    # ก็จะดูเก่งทันทีโดยไม่ได้รู้เรื่องอากาศเลยสักนิด
    #
    # ตัวเทียบนี้คือ "รอบวันล้วน ๆ ไม่มีอย่างอื่น" ถ้าโมเดลชนะมันไม่ขาด
    # แปลว่าโมเดลก็แค่ท่องรอบวัน ไม่ได้ทำนายอากาศ — **ห้ามเอาไปโฆษณาว่าทำนายได้ 7 วัน**
    #
    # ค่าเฉลี่ยต้องคิดจาก **ชุดเทรนเท่านั้น** คิดรวมชุดทดสอบคือการแอบดูอนาคต
    clim = ytr.groupby((ytr.index + timedelta(hours=h)).hour).mean()
    guess = pd.Series((yte.index + timedelta(hours=h)).hour, index=yte.index).map(clim)
    mae_clim = (
        float(mean_absolute_error(yte, guess)) if guess.notna().all() else None
    )

    # ═══ เทรนใหม่ด้วยข้อมูลทั้งหมดก่อนเอาไปทำนายจริง ═══
    # ตัวที่ใช้ให้คะแนนเห็นแค่ 80% แรก ซึ่งจบไปหลายวันแล้ว เอามาทำนายพรุ่งนี้จะเสียของ
    # แต่คะแนนต้องมาจากตัวที่ไม่เคยเห็นชุดทดสอบเท่านั้น จึงต้องเป็นคนละตัว
    final = fresh().fit(X[usable], yy)

    live = feat[enough].iloc[-1:]
    pred = clip(float(final.predict(live[usable])[0]), bounds)
    return {
        "horizon_h": h,
        "valid_at": (live.index[-1] + timedelta(hours=h)).isoformat(),
        "pred": round(pred, 2),
        "mae_model": round(mae_model, 3),
        "mae_persistence": round(mae_persist, 3),
        "mae_climatology": None if mae_clim is None else round(mae_clim, 3),
        "mae_openmeteo": None if mae_wx is None else round(mae_wx, 3),
        "n_openmeteo": n_wx,
        "gain_pct": round((1 - mae_model / mae_persist) * 100, 1) if mae_persist else 0.0,
        "n_train": int(len(X)),
        "n_test": int(len(Xte)),
    }


def main():
    ap = argparse.ArgumentParser(description="ทำนายไปข้างหน้าแล้วเขียนไฟล์ให้แดชบอร์ด")
    ap.add_argument("--target", default="mast_temp_c", choices=sorted(TARGETS))
    ap.add_argument("--drop-prefix", default="barn_",
                    help="คำนำหน้าคอลัมน์ที่จะไม่ใช้เป็นตัวแปรต้น คั่นด้วยจุลภาค "
                         "(ค่าตั้งต้นตัดของในเล้าทิ้ง เพราะเซนเซอร์เงียบอยู่)")
    ap.add_argument("--stale-hours", type=float, default=3.0,
                    help="ถ้าค่าล่าสุดเก่ากว่านี้ ถือว่าแหล่งข้อมูลเงียบ แล้วไม่เขียนคำทำนาย")
    ap.add_argument("--horizons", default=None,
                    help="ระยะล่วงหน้าเป็นชั่วโมง คั่นด้วยจุลภาค เช่น 24,48,72,168 "
                         "(ไม่ใส่ = ใช้ชุดมาตรฐาน 1–24 ชม.)")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    target = args.target
    horizons = (
        sorted({int(x) for x in args.horizons.split(",") if x.strip()})
        if args.horizons
        else HORIZONS
    )
    drop = tuple(p for p in args.drop_prefix.split(",") if p)
    # ทำนายอะไรอยู่ ห้ามตัดคอลัมน์นั้นทิ้ง ไม่งั้นเหลือแต่ตัวแปรของแหล่งอื่นล้วน
    drop = tuple(p for p in drop if not target.startswith(p))

    df = load()
    meta = TARGETS[target]
    label, unit, source = meta["label"], meta["unit"], meta["source"]
    wx_measure, bounds = meta["wx"], meta["bounds"]

    seen = df[target].dropna()
    if seen.empty:
        raise SystemExit(f"ไม่มีค่าของ {target} ในคลังเลย")

    last_at = seen.index[-1]
    age_h = (pd.Timestamp.now(tz=last_at.tz) - last_at).total_seconds() / 3600
    print(f"อ่านมา {len(df):,} ชั่วโมง · มีค่าของ {target} {len(seen):,} ชั่วโมง")
    print(f"ค่าล่าสุด {seen.iloc[-1]:.2f} เมื่อ {last_at} (เก่า {age_h:.1f} ชม.)")

    feat, base = feature_frame(df, drop)
    print(f"ตัวแปรต้น {len(base)} ตัว (ตัดคำนำหน้า {', '.join(drop) or '—'}) "
          f"→ {feat.shape[1]} คอลัมน์หลังเติมค่าย้อนหลัง")

    stale = age_h > args.stale_hours
    rows = []
    # โหลดคำพยากรณ์ของ Open-Meteo ครั้งเดียวแล้วส่งต่อ — ของเดิมโหลดใหม่ทุกระยะล่วงหน้า
    # (9 รอบต่อหนึ่งเป้าหมาย) ซึ่งเป็นคำถามเดิมกับฐานเป๊ะ ๆ ทุกครั้ง
    fc = load_fcst(wx_measure)
    if stale:
        print(f"\n⚠ ค่าล่าสุดเก่ากว่า {args.stale_hours} ชม. — ไม่เขียนคำทำนาย")
        print("  ทำนายจากค่าที่หยุดอัปเดตแล้วได้ตัวเลขที่ดูปกติแต่ผิด ซึ่งอันตรายกว่าไม่มีเลย")
    else:
        for h in horizons:
            got = train_and_predict(df, feat, base, target, h, fc, bounds)
            if got is None:
                print(f"{h:>3} ชม. — ข้อมูลน้อยเกินไป")
                continue
            rows.append(got)
            wx = "—" if got["mae_openmeteo"] is None else f"{got['mae_openmeteo']:.2f}"
            cl = "—" if got["mae_climatology"] is None else f"{got['mae_climatology']:.2f}"
            print(f"{h:>3} ชม.  ทำนาย {got['pred']:>6.2f}  "
                  f"±{got['mae_model']:.2f}  (เท่าเดิม {got['mae_persistence']:.2f} · "
                  f"รอบวันล้วน {cl} · Open-Meteo {wx})")

    hist = seen.tail(HISTORY_HOURS)
    horizon_end = last_at + timedelta(hours=max(horizons))
    wx_ahead = openmeteo_ahead(wx_measure, last_at, horizon_end)
    for r in rows:
        v = pd.Timestamp(r["valid_at"])
        r["openmeteo_pred"] = wx_ahead.get(v)

    out = {
        "generated_at": pd.Timestamp.now(tz="Asia/Bangkok").isoformat(),
        "target": target,
        "label": label,
        "unit": unit,
        "source": source,
        "openmeteo_measure": wx_measure,
        "stale": bool(stale),
        "latest": {"at": last_at.isoformat(), "value": round(float(seen.iloc[-1]), 2)},
        "coverage": {
            "hours_with_target": int(len(seen)),
            "hours_total": int(len(df)),
            "from": seen.index[0].isoformat(),
            "to": last_at.isoformat(),
        },
        "features": {"count": int(feat.shape[1]), "dropped_prefix": list(drop)},
        "history": [
            {"at": t.isoformat(), "value": round(float(v), 2)}
            for t, v in hist.items() if np.isfinite(v)
        ],
        "horizons": rows,
    }

    path = args.out or f"/home/jovyan/work/models/forecast-{target}.json"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
    print(f"\nเขียนไว้ที่ {path}")


if __name__ == "__main__":
    baseline.HORIZONS = HORIZONS
    main()
