"""
โมเดลตั้งต้นสำหรับพยากรณ์ — ตัวเทียบที่ทุกโมเดลรุ่นต่อไปต้องเอาชนะให้ได้

═══ ทำไมต้องมีไฟล์นี้ก่อนไปลองโมเดลใหญ่ ═══
งานพยากรณ์อากาศมีกับดักที่ทำให้คนหลงดีใจกันมานับไม่ถ้วน: อุณหภูมิอีกหนึ่งชั่วโมง
ข้างหน้า **เกือบเท่ากับตอนนี้เสมอ** โมเดลอะไรก็ตามที่แค่ทายว่า "เท่าเดิม"
ก็ได้ค่าความคลาดเคลื่อนต่ำจนดูเก่งแล้ว

ถ้าไม่มีตัวเทียบนี้ เราจะเทรนโมเดลใหญ่ ๆ ได้ MAE 0.4 °C แล้วคิดว่าสำเร็จ
ทั้งที่การทายว่า "เท่าเดิม" ได้ 0.45 °C — แปลว่าโมเดลทั้งตัวมีค่าเท่ากับศูนย์
สคริปต์นี้จึงพิมพ์ทั้งสองค่าคู่กันเสมอ และบอกตรง ๆ ว่าเอาชนะได้กี่เปอร์เซ็นต์

═══ วิธีใช้ ═══
    python baseline.py                       ทำนายอุณหภูมิในเล้า ล่วงหน้า 1·3·6·12·24 ชม.
    python baseline.py --target mast_temp_c  ทำนายอุณหภูมิข้างนอกที่ฟาร์ม
    python baseline.py --target barn_thi     ทำนายดัชนีความเครียดร้อน
"""

import argparse
import os

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error

DB_URL = os.environ.get(
    "DATABASE_URL", "postgresql://wx:wx@wx-db:5432/wx"
).replace("postgresql://", "postgresql+psycopg2://")

# ชั่วโมงล่วงหน้าที่จะทำนาย — เริ่มจากสั้นไปยาว เพราะยิ่งไกลยิ่งยาก
HORIZONS = [1, 3, 6, 12, 24]

# ย้อนดูอดีตกี่ชั่วโมง — 1,2,3 จับการเปลี่ยนแปลงระยะสั้น ส่วน 24 จับรอบวัน
LAGS = [1, 2, 3, 6, 12, 24]


def load() -> pd.DataFrame:
    """อ่านตารางฟีเจอร์รายชั่วโมงที่ view เตรียมไว้ให้แล้ว"""
    from sqlalchemy import create_engine

    engine = create_engine(DB_URL)
    df = pd.read_sql("select * from v_feature_1h order by at", engine, parse_dates=["at"])
    df = df.set_index("at").sort_index()
    print(f"อ่านมา {len(df):,} ชั่วโมง  ({df.index.min()} ถึง {df.index.max()})")
    return df


def load_openmeteo_forecast() -> pd.DataFrame:
    """
    ดึงค่าที่ Open-Meteo "ทำนายไว้ล่วงหน้า" ออกมาเป็นตัวเทียบอีกตัว

    ═══ ทำไมต้องมีตัวเทียบตัวนี้ นอกเหนือจาก "ทายว่าเท่าเดิม" ═══
    "ทายว่าเท่าเดิม" เป็นเกณฑ์ขั้นต่ำ — ชนะไม่ได้แปลว่าโมเดลไร้ประโยชน์
    แต่คำถามที่พี่เลี้ยงและผู้บริหารถามจริง ๆ คือ
    **"ในเมื่อมีพยากรณ์อากาศฟรีอยู่แล้ว ทำไมต้องเทรนเอง"**
    ตัวเทียบตัวนี้ตอบคำถามนั้นเป็นตัวเลข: ถ้าเอาพยากรณ์ของ Open-Meteo
    มาใช้ตรง ๆ กับฟาร์มนี้ จะพลาดกี่องศา

    **ต้องกรองด้วย issued_at ไม่ใช่หยิบค่าล่าสุด** — ตาราง fcst เก็บค่าเดียวกัน
    หลายรอบ (ทำนายไว้เมื่อวาน · เมื่อเช้า · เมื่อชั่วโมงที่แล้ว) ถ้าไม่กรอง
    จะได้ตัวที่ทำนายก่อนเวลาจริงแค่ชั่วโมงเดียว ซึ่งง่ายกว่ามากและเทียบกันไม่แฟร์
    """
    from sqlalchemy import create_engine

    fc = pd.read_sql(
        """select valid_at, issued_at, value
           from fcst
           where station = 'openmeteo_kpp' and measure = 'temp_c'""",
        create_engine(DB_URL), parse_dates=["valid_at", "issued_at"],
    )
    if fc.empty:
        return fc
    fc["lead"] = fc["valid_at"] - fc["issued_at"]
    return fc


def openmeteo_mae(fc: pd.DataFrame, truth: pd.Series, horizon: int):
    """
    ความคลาดเคลื่อนของพยากรณ์ Open-Meteo ที่ระยะล่วงหน้าเดียวกับโมเดล

    คืน (mae, จำนวนชั่วโมงที่เทียบได้) — ถ้าเทียบได้น้อยกว่า 24 ชั่วโมงคืน None
    เพราะตัวเลขจากกลุ่มตัวอย่างเล็กกว่านั้นชี้นำผิดมากกว่าช่วย

    ═══ วิธีเลือกว่าจะเอาคำทำนายรอบไหนมาเทียบ ═══
    เลือก **รอบล่าสุดที่ทำนายไว้ก่อนเวลาจริงอย่างน้อย h ชั่วโมง**
    ซึ่งตรงกับคำถามว่า "ถ้าตอนนั้นอยากรู้ล่วงหน้า h ชั่วโมง จะมีอะไรให้ใช้"

    **เคยเขียนเป็น "ระยะล่วงหน้าเท่ากับ h พอดี" แล้วใช้ไม่ได้** — `issued_at`
    คือเวลาที่ไปดึงข้อมูลมาจริง ๆ ซึ่งมีเศษนาที (เช่น 18:03:12) พอเอาไปลบกับ
    `valid_at` ที่ลงตัวชั่วโมง แล้วปัดเป็นจำนวนเต็ม ระยะจะกระเด็นไปมาระหว่าง
    h กับ h−1 ทำให้แต่ละกลุ่มเหลือไม่กี่แถว เทียบได้จริงแค่ 12 จาก 61 ชั่วโมง
    """
    if fc.empty:
        return None, 0

    # ═══ ต้องเลื่อน index ของ truth ก่อน — พลาดตรงนี้แล้วเทียบผิดชั่วโมงเงียบ ๆ ═══
    # build() ทำเป้าหมายด้วย shift(-horizon) ดังนั้น yte **มี index เป็นเวลา t
    # แต่ค่าข้างในเป็นความจริงของเวลา t+h** ส่วนตาราง fcst ใช้ valid_at ซึ่งคือ t+h ตรง ๆ
    # เอามาต่อกันดื้อ ๆ จะได้ค่าที่ห่างกัน h ชั่วโมง — ตัวเลขออกมาดูสมเหตุสมผล
    # แต่ผิดทั้งตาราง จึงต้องบวก h เข้าไปที่ index ให้ตรงความหมายก่อน
    truth = truth.copy()
    truth.index = truth.index + pd.Timedelta(hours=horizon)

    elig = fc[fc["lead"] >= pd.Timedelta(hours=horizon)]
    at_h = (
        elig.sort_values("issued_at")
        .groupby("valid_at")
        .tail(1)                       # รอบล่าสุดที่ยังทันเงื่อนไข h ชั่วโมง
        .set_index("valid_at")["value"]
        .sort_index()
    )
    # sort=True ชัด ๆ — ไม่งั้น pandas เตือนว่าค่าตั้งต้นกำลังจะเปลี่ยน
    both = pd.concat(
        [truth.rename("จริง"), at_h.rename("ทำนาย")], axis=1, sort=True
    ).dropna()
    if len(both) < 24:
        return None, len(both)
    return float((both["จริง"] - both["ทำนาย"]).abs().mean()), len(both)


def add_lags(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    """
    เติมค่าย้อนหลังเป็นคอลัมน์ใหม่

    **ต้องใช้ shift() เท่านั้น ห้ามใช้ rolling ที่มองไปข้างหน้า** — pandas ทำ
    rolling แบบ center=True ได้ ซึ่งดึงค่าจากอนาคตเข้ามาโดยที่โค้ดหน้าตาปกติมาก
    เจอทีหลังยากที่สุดในบรรดาบั๊กของงานพยากรณ์
    """
    # สร้างคอลัมน์ใหม่ทั้งหมดก่อน แล้วค่อยต่อทีเดียวด้วย concat
    # (ใส่ทีละคอลัมน์เข้า DataFrame เดิมทำให้ pandas เตือนเรื่อง fragmentation
    #  และช้าลงเรื่อย ๆ ตามจำนวนคอลัมน์ — ที่นี่มีเป็นร้อยคอลัมน์)
    pieces = {}
    for c in cols:
        if c not in df.columns:
            continue
        for lag in LAGS:
            pieces[f"{c}_lag{lag}"] = df[c].shift(lag)
        # อัตราการเปลี่ยนแปลง — บอกว่ากำลังร้อนขึ้นหรือเย็นลง ซึ่งค่าดิบไม่ได้บอก
        pieces[f"{c}_delta1"] = df[c] - df[c].shift(1)
        pieces[f"{c}_delta3"] = df[c] - df[c].shift(3)
    return pd.concat([df, pd.DataFrame(pieces, index=df.index)], axis=1)


def build(df: pd.DataFrame, target: str, horizon: int):
    """
    ประกอบชุดข้อมูลสำหรับหนึ่งระยะเวลาที่จะทำนาย

    เป้าหมายคือค่าของ `target` ที่เวลา t+horizon ส่วนตัวแปรต้นทั้งหมดเป็นของ
    เวลา t หรือก่อนหน้า — ไม่มีอะไรจากอนาคตหลุดเข้ามาได้เลย
    """
    base_cols = [
        c for c in [
            "barn_temp_c", "barn_rh", "barn_thi", "barn_airflow_ms", "barn_power_kw",
            "mast_temp_c", "mast_rh", "mast_wind_ms", "mast_light_lux",
            "wx_temp_c", "wx_rh", "wx_dew_c", "wx_pres_msl_hpa",
            "wx_cloud_pct", "wx_wind_ms", "wx_rad_wm2", "wx_rain_mm",
        ] if c in df.columns
    ]
    time_cols = [c for c in ["hour_sin", "hour_cos", "doy_sin", "doy_cos"] if c in df.columns]

    feat = add_lags(df[base_cols + time_cols], base_cols)
    y = df[target].shift(-horizon)

    # ค่าปัจจุบันของสิ่งที่จะทำนาย — เก็บไว้เป็นคำตอบของ "โมเดลทายว่าเท่าเดิม"
    persistence = df[target]

    data = feat.copy()
    data["__y"] = y
    data["__persist"] = persistence
    data = data.dropna(subset=["__y", "__persist"])

    # แถวที่ตัวแปรต้นหายไปทั้งแถวไม่มีประโยชน์ แต่หายบางตัวยังใช้ได้
    # (HistGradientBoosting รับ NaN ได้เอง จึงไม่ต้องเติมค่าให้เดาผิด ๆ)
    data = data[data[base_cols].notna().sum(axis=1) >= max(3, len(base_cols) // 3)]

    X = data.drop(columns=["__y", "__persist"])
    return X, data["__y"], data["__persist"]


def split(X, y, p, test_ratio=0.2):
    """
    แบ่งข้อมูลตามเวลา **ห้ามสุ่ม**

    train_test_split ที่ shuffle=True (ค่าตั้งต้นของ sklearn) จะเอาชั่วโมงที่ 14:00
    ของวันหนึ่งไปอยู่ชุดทดสอบ แล้วให้ 13:00 กับ 15:00 ของวันเดียวกันอยู่ชุดเทรน
    เท่ากับโมเดลได้เห็นคำตอบล้อมรอบไว้แล้ว คะแนนจะสวยผิดปกติและใช้จริงไม่ได้
    """
    n = len(X)
    cut = int(n * (1 - test_ratio))
    return (X.iloc[:cut], X.iloc[cut:], y.iloc[:cut], y.iloc[cut:], p.iloc[cut:])


def run(df: pd.DataFrame, target: str):
    if target not in df.columns:
        raise SystemExit(f"ไม่มีคอลัมน์ '{target}' ในตารางฟีเจอร์")

    fc = load_openmeteo_forecast()

    print(f"\n═══ ทำนาย: {target} ═══")
    print(f"{'ล่วงหน้า':>9} {'แถวที่ใช้':>10} {'ทายเท่าเดิม':>13} "
          f"{'Open-Meteo':>12} {'โมเดล':>10} {'ดีขึ้น':>9}")
    print("─" * 70)

    results = []
    for h in HORIZONS:
        X, y, p = build(df, target, h)
        if len(X) < 200:
            print(f"{h:>7} ชม. {len(X):>10}  ข้อมูลน้อยเกินไป ยังเทรนไม่ได้")
            continue

        Xtr, Xte, ytr, yte, pte = split(X, y, p)

        # ═══ ตัดคอลัมน์ที่ไม่มีอะไรให้เรียนรู้ — **ต้องดูจากชุดเทรนเท่านั้น** ═══
        # คอลัมน์ที่ในชุดเทรนว่างทั้งคอลัมน์ หรือมีค่าเดียวทั้งคอลัมน์ ไม่ได้ช่วยอะไร
        # และ **ทำให้ scikit-learn ล้มทั้งตัว** ตอนแบ่งช่วงค่า (สร้าง bin จากค่าที่ต่างกัน
        # น้อยกว่าสองค่าไม่ได้ → ValueError: window shape cannot be larger than input array shape)
        #
        # **ดูจาก X ทั้งก้อนไม่พอ** — เคยเขียนแบบนั้นแล้วยังล้มเหมือนเดิม เพราะคอลัมน์
        # barn_* มีค่าเฉพาะช่วงท้าย ซึ่งตกไปอยู่ในชุดทดสอบทั้งหมด ชุดเทรนจึงยังว่างอยู่ดี
        # และการดูจากชุดทดสอบด้วยก็เป็นการแอบดูอนาคต ซึ่งผิดหลักตั้งแต่ต้น
        usable = [c for c in Xtr.columns if Xtr[c].nunique(dropna=True) >= 2]
        dropped = Xtr.shape[1] - len(usable)
        Xtr, Xte = Xtr[usable], Xte[usable]

        model = HistGradientBoostingRegressor(
            max_iter=400,
            learning_rate=0.06,
            max_depth=6,
            # หยุดเองเมื่อไม่ดีขึ้น — กันโมเดลจำข้อมูลเทรนจนใช้กับของใหม่ไม่ได้
            early_stopping=True,
            validation_fraction=0.15,
            random_state=42,
        )
        model.fit(Xtr, ytr)
        pred = model.predict(Xte)

        mae_model = mean_absolute_error(yte, pred)
        mae_persist = mean_absolute_error(yte, pte)
        gain = (1 - mae_model / mae_persist) * 100 if mae_persist else 0.0

        # ตัวเทียบตัวที่สอง — วัดบนชุดทดสอบชุดเดียวกัน ไม่ใช่คนละช่วงเวลา
        mae_wx, n_wx = openmeteo_mae(fc, yte, h)

        gain = (1 - mae_model / mae_persist) * 100 if mae_persist else 0.0
        mark = "✓" if gain > 0 else "✗"
        wx_txt = f"{mae_wx:>12.3f}" if mae_wx is not None else f"{'—':>12}"
        note = f"  (ใช้ {len(usable)} ตัวแปร · ตัดที่ว่างทิ้ง {dropped})" if dropped else ""
        print(f"{h:>7} ชม. {len(X):>10} {mae_persist:>12.3f} {wx_txt} "
              f"{mae_model:>10.3f} {gain:>7.1f}% {mark}{note}")

        results.append({
            "horizon_h": h,
            "n": len(X),
            "mae_persistence": round(mae_persist, 4),
            "mae_openmeteo": None if mae_wx is None else round(mae_wx, 4),
            "n_openmeteo": n_wx,
            "mae_model": round(mae_model, 4),
            "rmse_model": round(float(np.sqrt(mean_squared_error(yte, pred))), 4),
            "gain_pct": round(gain, 2),
            "gain_vs_openmeteo_pct": (
                None if not mae_wx else round((1 - mae_model / mae_wx) * 100, 2)
            ),
        })

    print("\nอ่านตารางนี้ยังไง:")
    print("  ทายเท่าเดิม = ทายว่าอีก h ชั่วโมงค่าจะเท่ากับตอนนี้ (หน่วยเดียวกับสิ่งที่ทำนาย)")
    print("  Open-Meteo  = เอาพยากรณ์ฟรีมาใช้กับฟาร์มนี้ตรง ๆ พลาดกี่องศา")
    print("                (ใช้ค่าที่ทำนายไว้ล่วงหน้า h ชั่วโมงพอดี ไม่ใช่ค่าที่เพิ่งทำนาย)")
    print("  ดีขึ้น      = โมเดลลดความคลาดเคลื่อนจากการทายเท่าเดิมได้กี่เปอร์เซ็นต์")
    print("  **ถ้าติดลบ แปลว่าโมเดลยังไม่มีประโยชน์** ต้องหาฟีเจอร์เพิ่มหรือข้อมูลเพิ่ม")
    if fc.empty:
        print("\n  ยังไม่มีค่าพยากรณ์เก็บไว้เลย — ช่อง Open-Meteo จึงว่าง")
    elif any(r["mae_openmeteo"] is None for r in results):
        print("\n  ช่อง Open-Meteo ที่เป็น — คือมีชั่วโมงให้เทียบไม่ถึง 24 ชั่วโมง")
        print("  ตัวเก็บข้อมูลเพิ่งเริ่มบันทึกค่าพยากรณ์ ปล่อยไว้อีกสองสัปดาห์แล้วช่องจะเต็มเอง")
    return pd.DataFrame(results)


def main():
    ap = argparse.ArgumentParser(description="โมเดลตั้งต้นสำหรับพยากรณ์อากาศฟาร์มสุกร")
    ap.add_argument("--target", default="barn_temp_c",
                    help="คอลัมน์ที่จะทำนาย เช่น barn_temp_c · mast_temp_c · barn_thi "
                         "· wx_temp_c (ใช้ทดสอบว่าท่อทั้งเส้นทำงาน เพราะมีข้อมูลเยอะแล้ว)")
    ap.add_argument("--out", default=None, help="เขียนผลเป็นไฟล์ CSV")
    args = ap.parse_args()

    df = load()
    have = df[args.target].notna().sum() if args.target in df.columns else 0
    if have < 500:
        print(f"\n⚠ มีค่าของ {args.target} แค่ {have} ชั่วโมง")
        print("  ข้อมูลยังน้อยเกินกว่าจะเชื่อผลได้ — ปล่อยให้ตัวเก็บข้อมูลเดินไปอีกสักพัก")
        print("  หรือ backfill เพิ่ม (ดู README หัวข้อ “เติมข้อมูลย้อนหลัง”)")

    res = run(df, args.target)
    if args.out is not None and len(res):
        res.to_csv(args.out, index=False)
        print(f"\nเขียนผลไว้ที่ {args.out}")


if __name__ == "__main__":
    main()
