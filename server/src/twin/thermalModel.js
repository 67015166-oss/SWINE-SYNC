/**
 * แบบจำลองความร้อนของโรงเรือน — หัวใจของแบบจำลองโรงเรือนชั้นที่ 2 (T1.261)
 *
 * **เล้าคือระบบอันดับหนึ่ง** อุณหภูมิในเล้าวิ่งเข้าหา "จุดสมดุล" ที่อากาศนอกเล้ากับภาระไฟฟ้า
 * (พัดลม/ระบบทำความเย็น) กำหนด ด้วยความเร็วที่ขึ้นกับค่าคงที่เวลา τ ของอาคาร
 * เขียนแบบเวลาไม่ต่อเนื่อง (ARX) ที่คาบ Δt:
 *
 *     T_in[k+1] = a·T_in[k] + b·T_out[k−d] + e·kW[k] + c
 *
 *   a  → ค่าคงที่เวลา   τ = −Δt / ln(a)        (ต้อง 0 < a < 1 ถึงจะเป็นระบบที่เสถียร)
 *   b  → อัตราขยายจากอากาศนอก  K = b / (1 − a)  (นอกร้อนขึ้น 1°C ในเล้าขึ้นกี่องศาที่สภาวะคงตัว)
 *   e  → ผลของภาระไฟฟ้า  e / (1 − a)  °C ต่อ kW (ติดลบ = เปิดมากแล้วเย็นลง)
 *   d  → เวลาหน่วง หาโดยไล่ลองทีละค่าแล้วเลือกตัวที่คลาดเคลื่อนน้อยสุด
 *
 * **ข้อมูลจริงขาดเป็นช่วง ๆ** (เครื่องปิดกลางคืน · เดือนที่หายไปทั้งเดือน)
 * ห้ามลากเส้นข้ามช่องว่างเด็ดขาด — ทุกคู่ (k, k+1, k−d) ต้องอยู่ในช่วงต่อเนื่องเดียวกัน
 * ไม่งั้นแบบจำลองจะเรียนว่า "อุณหภูมิกระโดดข้ามคืนได้ในห้านาที" แล้วค่า τ เพี้ยนหมด
 *
 * ไฟล์นี้เป็นคณิตล้วน ไม่แตะฐานข้อมูล ไม่มี dependency — เทสต์เรียกตรง ๆ ได้ทั้งจากราก repo
 */

/** จำนวนเต็มบวกที่ถือว่า "ห่างกันหนึ่งคาบพอดี" — ช่องว่างมากกว่านี้ = ขาดตอน */
const sameStep = (dt, stepSec) => Math.abs(dt - stepSec) < stepSec * 0.01;

/**
 * แบ่งแถวเป็นช่วงต่อเนื่อง — แถวต้องมี t (วินาที) · tin · tout และเรียงตามเวลาแล้ว
 * แถวที่ tin หรือ tout หายถือเป็นรอยขาด (ตัดช่วงตรงนั้น)
 */
export function segmentsOf(rows, stepSec) {
  const segments = [];
  let cur = [];
  for (const r of rows) {
    const ok = Number.isFinite(r.tin) && Number.isFinite(r.tout);
    if (!ok) {
      if (cur.length) segments.push(cur);
      cur = [];
      continue;
    }
    if (cur.length && !sameStep(r.t - cur[cur.length - 1].t, stepSec)) {
      segments.push(cur);
      cur = [];
    }
    cur.push(r);
  }
  if (cur.length) segments.push(cur);
  return segments;
}

/**
 * ลบค่าที่ "ค้าง" ทิ้ง — ค่าเดิมเป๊ะติดกันตั้งแต่ minSteps คาบขึ้นไปถือว่าเซนเซอร์ไม่ได้วัดจริง
 *
 * **เจอจริง 17 ก.ย. 2569** เซนเซอร์นอกเล้าส่งอุณหภูมิค่าเดียวต่อวันมาตลอดทุกวันที่มีข้อมูล
 * (27.0 → 25.5 → 26.1 → 31.8 → 24.8) รวมถึงตอนเที่ยงวัน — อากาศจริงไม่มีทางนิ่งถึงทศนิยม
 * ถ้าเอาไปสอนแบบจำลองตรง ๆ จะได้ค่าคงที่เวลาและอัตราขยายที่ดูน่าเชื่อ แต่ไม่ได้มาจากฟิสิกส์ของเล้าเลย
 *
 * ใช้กับค่าเฉลี่ยช่อง 5 นาที: อากาศจริงสามชั่วโมงไม่มีทางได้ค่าเฉลี่ยเท่ากันทุกช่อง
 * คืนแถวชุดใหม่ (ไม่แก้ของเดิม) ที่ค่าในช่วงค้างกลายเป็น null
 */
export function maskStuck(rows, key, minSteps) {
  const out = rows.map((r) => ({ ...r }));
  let start = 0;
  for (let i = 1; i <= out.length; i++) {
    const same =
      i < out.length &&
      Number.isFinite(out[i][key]) &&
      Number.isFinite(out[i - 1][key]) &&
      Math.abs(out[i][key] - out[i - 1][key]) < 1e-6;
    if (same) continue;
    if (i - start >= minSteps && Number.isFinite(out[start][key])) {
      for (let j = start; j < i; j++) out[j][key] = null;
    }
    start = i;
  }
  return out;
}

/** แก้สมการเชิงเส้น Ax = y ด้วยการกำจัดแบบเกาส์ (เลือกแถวหลักที่ค่าสัมบูรณ์มากสุด) */
function solve(A, y) {
  const n = y.length;
  const M = A.map((row, i) => [...row, y[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** กำลังสองน้อยที่สุด — ผ่าน normal equations (ตัวแปรมีแค่ 3–4 ตัว ไม่ต้องใช้วิธีที่หนักกว่านี้) */
export function leastSquares(X, y) {
  const p = X[0].length;
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty = new Array(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let r = 0; r < p; r++) {
      Xty[r] += X[i][r] * y[i];
      for (let c = 0; c < p; c++) XtX[r][c] += X[i][r] * X[i][c];
    }
  }
  return solve(XtX, Xty);
}

/** แถวที่มีภาระไฟฟ้าใช้ได้ — ถ้าจะใช้ kW ต้องมีทุกจุดที่แบบจำลองแตะ */
const hasKw = (r) => Number.isFinite(r?.kw);

/**
 * สร้างตาราง X, y สำหรับหน่วง d คาบ — เฉพาะคู่ที่อยู่ในช่วงต่อเนื่องเดียวกันทั้งหมด
 * @returns {{X: number[][], y: number[], next: number[]}}
 */
function design(segments, lag, useKw, extras) {
  const X = [];
  const y = [];
  for (const seg of segments) {
    for (let k = lag; k + 1 < seg.length; k++) {
      if (useKw && !hasKw(seg[k])) continue;
      const row = [seg[k].tin, seg[k - lag].tout];
      if (useKw) row.push(seg[k].kw);
      for (const f of extras) row.push(f(seg[k]));
      row.push(1);
      X.push(row);
      y.push(seg[k + 1].tin);
    }
  }
  return { X, y };
}

const rmse = (errs) => (errs.length ? Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length) : null);

/** แปลงสัมประสิทธิ์ดิบเป็นค่าที่คนอ่านรู้เรื่อง — τ เป็นนาที · อัตราขยาย · ผลของไฟ */
function physical(coef, useKw, stepSec) {
  const [a, b] = coef;
  const e = useKw ? coef[2] : 0;
  const c = coef[coef.length - 1];
  const stable = a > 0 && a < 1;
  return {
    a,
    b,
    e,
    c,
    stable,
    tauMin: stable ? -stepSec / 60 / Math.log(a) : null,
    gainOut: stable ? b / (1 - a) : null,
    kwEffect: stable && useKw ? e / (1 - a) : null,
    offset: stable ? c / (1 - a) : null,
  };
}

/**
 * หาแบบจำลองจากข้อมูลจริง — ไล่ลองเวลาหน่วง 0..maxLag คาบ แล้วเลือกตัวที่คลาดเคลื่อน 1 คาบน้อยสุด
 *
 * @param {Array<{tin:number, tout:number}>[]} segments  ผลของ segmentsOf()
 * @param {{stepSec:number, maxLag?:number, useKw?:boolean}} opts
 */
export function fitThermalModel(segments, { stepSec, maxLag = 12, useKw = false, extras = [] }) {
  let best = null;
  for (let lag = 0; lag <= maxLag; lag++) {
    const { X, y } = design(segments, lag, useKw, extras);
    if (X.length < 30) continue;
    const coef = leastSquares(X, y);
    if (!coef) continue;
    const errs = X.map((row, i) => row.reduce((s, v, j) => s + v * coef[j], 0) - y[i]);
    const score = rmse(errs);
    if (!best || score < best.oneStepRmse) {
      best = { lag, coef, oneStepRmse: score, samples: X.length };
    }
  }
  if (!best) return null;
  return {
    stepSec,
    useKw,
    lag: best.lag,
    lagMin: (best.lag * stepSec) / 60,
    samples: best.samples,
    oneStepRmse: best.oneStepRmse,
    extras,
    /* สัมประสิทธิ์ของตัวแปรเสริม — อยู่ระหว่างไฟฟ้ากับค่าคงที่ในแถว */
    extraCoef: best.coef.slice(useKw ? 3 : 2, best.coef.length - 1),
    ...physical(best.coef, useKw, stepSec),
  };
}

/** ทำนายหนึ่งคาบถัดไปจากสภาพตอนนี้ */
export function stepOnce(model, tinNow, toutLagged, kwNow, row) {
  const kwTerm = model.useKw ? model.e * kwNow : 0;
  const extraTerm = (model.extras ?? []).reduce((sum, f, i) => sum + model.extraCoef[i] * f(row), 0);
  return model.a * tinNow + model.b * toutLagged + kwTerm + extraTerm + model.c;
}

/**
 * **ปล่อยให้แบบจำลองวิ่งเอง** — เริ่มจากค่าจริงจุดแรกของช่วง แล้วใช้แค่ค่าของตัวเองต่อ
 * ป้อนเฉพาะอากาศนอก (และไฟ) ที่วัดได้ ไม่แอบดูอุณหภูมิในเล้าของจริงอีกเลย
 *
 * นี่คือการวัดที่ซื่อสัตย์ของแบบจำลอง — ความแม่น "หนึ่งคาบข้างหน้า" ดูดีเกินจริงเสมอ
 * เพราะแค่ตอบว่า "ห้านาทีข้างหน้าก็ประมาณเท่าตอนนี้" ก็แม่นแล้ว
 *
 * @returns {Array<{t:number, actual:number, predicted:number|null}>}
 */
export function simulate(model, segment) {
  const out = [];
  let tin = segment[0]?.tin;
  for (let k = 0; k < segment.length; k++) {
    if (k === 0 || k - 1 < model.lag) {
      /* ยังไม่มีอากาศนอกย้อนหลังพอสำหรับเวลาหน่วง — ใช้ค่าจริงไปก่อน (ไม่นับในความคลาดเคลื่อน) */
      tin = segment[k].tin;
      out.push({ t: segment[k].t, actual: segment[k].tin, predicted: null });
      continue;
    }
    const prev = k - 1;
    const kw = model.useKw ? segment[prev].kw : 0;
    if (model.useKw && !Number.isFinite(kw)) {
      tin = segment[k].tin;
      out.push({ t: segment[k].t, actual: segment[k].tin, predicted: null });
      continue;
    }
    tin = stepOnce(model, tin, segment[prev - model.lag].tout, kw, segment[prev]);
    out.push({ t: segment[k].t, actual: segment[k].tin, predicted: tin });
  }
  return out;
}

/**
 * วัดผลแบบจำลองกับช่วงที่ไม่ได้ใช้สอน — เทียบกับ "ตัวเทียบที่โง่ที่สุด" เสมอ
 *
 *   freeRun      แบบจำลองวิ่งเองตลอดช่วง (ตัวชี้วัดหลัก)
 *   persistence  เดาว่าในเล้าคงที่เท่าจุดแรกของช่วงตลอด — ถ้าแบบจำลองแพ้ตัวนี้ แปลว่าไม่ได้เรียนอะไรเลย
 *
 * @param {number} [horizonSteps] ตัดดูเฉพาะกี่คาบแรกของแต่ละช่วง (เช่น 3 ชม. ข้างหน้า)
 */
export function evaluate(model, segments, horizonSteps = Infinity) {
  const free = [];
  const still = [];
  for (const seg of segments) {
    const sim = simulate(model, seg);
    const start = seg[0].tin;
    sim.slice(0, horizonSteps + 1).forEach((p) => {
      if (p.predicted == null) return;
      free.push(p.predicted - p.actual);
      still.push(start - p.actual);
    });
  }
  const freeRunRmse = rmse(free);
  const persistenceRmse = rmse(still);
  return {
    points: free.length,
    freeRunRmse,
    persistenceRmse,
    /** แบบจำลองดีกว่าเดาว่าคงที่กี่เปอร์เซ็นต์ (ติดลบ = แย่กว่า) */
    skill: freeRunRmse != null && persistenceRmse ? 1 - freeRunRmse / persistenceRmse : null,
  };
}

/**
 * **แบบจำลองกล่องเทา (grey-box)** — ใส่ความรู้ทางฟิสิกส์เป็นข้อบังคับ แล้วค้นหาค่าที่ทำให้
 * "แบบจำลองวิ่งเอง" ตรงกับของจริงที่สุด (output error) ไม่ใช่แค่ทายห้านาทีข้างหน้าให้ถูก
 *
 * ทำไมต้องบังคับ: ลองแบบไม่บังคับกับข้อมูลจริง (17 ก.ย. 2569) ได้อัตราขยายจากอากาศนอก **ติดลบ**
 * ทุกความละเอียด (−0.45 ถึง −2.0) = "ข้างนอกร้อนขึ้น ในเล้าเย็นลง" ทั้งที่รายชั่วโมงสองค่านี้สัมพันธ์กัน +0.62
 * สาเหตุคืออุณหภูมินอก รังสีแดด และอุณหภูมิในเล้าขึ้นลงตามรอบวันพร้อมกันหมด (collinear)
 * ข้อมูลน้อยแบบนี้ สมการแบ่งผลให้แต่ละตัวแปรมั่ว ๆ ได้ ตัวเลขที่ออกมาจึงอธิบายทางกายภาพไม่ได้
 *
 * รูปแบบ (สมดุลความร้อนอันดับหนึ่ง):
 *     T_eq[k]   = K·T_out[k−d] + S·แดด[k] + c
 *     T_in[k+1] = a·T_in[k] + (1 − a)·T_eq[k]            a = exp(−Δt/τ)
 * ข้อบังคับ: 0 ≤ K ≤ 1 (ในเล้าตามข้างนอกได้ไม่เกินหนึ่งต่อหนึ่ง) · S ≥ 0 (แดดทำให้ร้อนขึ้นเท่านั้น)
 *
 * ค้นแบบตาราง τ × K × S × หน่วง ส่วน c แก้ได้ตรง ๆ เพราะผลลัพธ์ของการจำลองเป็นเชิงเส้นใน c
 * (ผลของ c ที่ขั้น k จากจุดเริ่มคือ c·(1 − a^k))
 *
 * คืนออบเจกต์รูปเดียวกับ fitThermalModel — ใช้กับ simulate/evaluate ได้ทันที
 */
export function fitGreyBox(
  segments,
  {
    stepSec,
    extra,
    tauMinGrid = range(30, 600, 15),
    gainGrid = range(0, 1, 0.05),
    sunGrid = range(0, 10, 0.25),
    maxLag = 4,
  },
) {
  let best = null;
  for (let lag = 0; lag <= maxLag; lag++) {
    for (const tauMin of tauMinGrid) {
      const a = Math.exp(-stepSec / 60 / tauMin);
      for (const K of gainGrid) {
        for (const S of extra ? sunGrid : [0]) {
          /* จำลองโดยยังไม่ใส่ c แล้วเก็บ "ผลของ c ต่อหน่วย" ไว้แก้ c ตรง ๆ */
          let sxy = 0;
          let sxx = 0;
          const resid = [];
          const unit = [];
          for (const seg of segments) {
            let tin = seg[0].tin;
            let g = 0;
            for (let k = 1; k < seg.length; k++) {
              if (k - 1 < lag) {
                tin = seg[k].tin;
                g = 0;
                continue;
              }
              const drive = K * seg[k - 1 - lag].tout + (extra ? S * extra(seg[k - 1]) : 0);
              tin = a * tin + (1 - a) * drive;
              g = a * g + (1 - a);
              resid.push(seg[k].tin - tin);
              unit.push(g);
            }
          }
          for (let i = 0; i < resid.length; i++) {
            sxy += unit[i] * resid[i];
            sxx += unit[i] * unit[i];
          }
          if (sxx === 0) continue;
          const c = sxy / sxx;
          let sse = 0;
          for (let i = 0; i < resid.length; i++) sse += (resid[i] - c * unit[i]) ** 2;
          const score = Math.sqrt(sse / resid.length);
          if (!best || score < best.score) best = { score, lag, tauMin, a, K, S, c, n: resid.length };
        }
      }
    }
  }
  if (!best || best.n < 30) return null;
  const { a, K, S, c } = best;
  return {
    stepSec,
    useKw: false,
    lag: best.lag,
    lagMin: (best.lag * stepSec) / 60,
    samples: best.n,
    fitRmse: best.score,
    extras: extra ? [extra] : [],
    extraCoef: extra ? [(1 - a) * S] : [],
    a,
    b: (1 - a) * K,
    e: 0,
    c: (1 - a) * c,
    stable: true,
    tauMin: best.tauMin,
    gainOut: K,
    sunEffect: extra ? S : null,
    offset: c,
    kwEffect: null,
    /** ค่าไหนไปชนขอบข้อบังคับ — ชนขอบ = ข้อมูลอยากได้ค่าที่ผิดฟิสิกส์ ต้องบอกคนดู */
    atBound: {
      gainLow: K === gainGrid[0],
      gainHigh: K === gainGrid[gainGrid.length - 1],
      sunLow: extra ? S === sunGrid[0] : false,
      sunHigh: extra ? S === sunGrid[sunGrid.length - 1] : false,
      tauLow: best.tauMin === tauMinGrid[0],
      tauHigh: best.tauMin === tauMinGrid[tauMinGrid.length - 1],
    },
  };
}

/** ช่วงตัวเลขรวมปลายทั้งสองข้าง (ปัดเศษทศนิยมกันสะสม) */
function range(from, to, step) {
  const out = [];
  for (let v = from; v <= to + step / 2; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

