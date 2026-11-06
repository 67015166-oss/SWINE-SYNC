import { Router } from "express";
import { query } from "../../db/pool.js";
import { badRequest, notFound } from "../../lib/error.js";
import { requireAuth } from "../../lib/auth.js";
import { barnTwin, barnScenario } from "../../twin/barnTwin.js";

export const readingsRouter = Router();

/* ข้อมูลฟาร์มจริงทั้งหมด — **ต้องล็อกอินก่อน** (T1.242)
   เดิมอ่านได้โดยไม่มี token และเว็บพอร์ต 8080 เปิดรับทั้งวง Wi-Fi ใครในวงเดียวกันก็ดึงได้ */
readingsRouter.use(requireAuth);

const METRICS = ["temp_c", "humidity", "nh3", "co2", "h2s", "wind_ms", "light_lux"];

async function barnOr404(id) {
  const { rows } = await query(`select id, code, name, farm_id from barn where id = $1`, [id]);
  if (rows.length === 0) throw notFound("โรงเรือนนี้");
  return rows[0];
}

/** GET /api/barns/:id/readings/latest — ค่าล่าสุดทุก metric + เวลาที่วัด */
readingsRouter.get("/:id/readings/latest", async (req, res, next) => {
  try {
    const barn = await barnOr404(req.params.id);
    const { rows } = await query(
      `select metric, value, at, outdoor, device_count from v_barn_current where barn_id = $1`,
      [barn.id],
    );
    res.json({ barnId: barn.id, readings: rows });
  } catch (err) { next(err); }
});

/**
 * GET /api/barns/:id/readings?range=24h&metrics=temp_c,humidity
 *
 * `range` เป็นตัวเลือกความละเอียดในตัว — หน้าเว็บขอเป็นช่วงเวลาอย่างเดียว
 * ไม่ต้องรู้ว่าข้างล่างมีชั้นสรุปกี่ชั้น (docs/BACKEND.md ข้อ 5)
 */
readingsRouter.get("/:id/readings", async (req, res, next) => {
  try {
    const barn = await barnOr404(req.params.id);

    const range = String(req.query.range || "24h");
    const match = range.match(/^(\d+)(h|d)$/);
    if (!match) throw badRequest("range ต้องอยู่ในรูป เช่น 24h หรือ 7d", { got: range });
    const amount = Number(match[1]);
    const unit = match[2];
    if (amount < 1 || amount > 365) throw badRequest("range อยู่นอกช่วงที่รองรับ", { got: range });

    const metrics = String(req.query.metrics || "temp_c,humidity")
      .split(",")
      .map((m) => m.trim())
      .filter((m) => METRICS.includes(m));
    if (metrics.length === 0) throw badRequest("metrics ไม่มีค่าที่รู้จักเลย", { known: METRICS });

    const hours = unit === "h" ? amount : amount * 24;
    // ≤48 ชม. สรุปรายชั่วโมง · ยาวกว่านั้นสรุปรายวัน
    const hourly = hours <= 48;

    /* **ห้ามกลับไปอ่าน `sensor_hourly` / `sensor_daily` ตรง ๆ**
       continuous aggregate สองตัวนั้น group by (bucket, barn_id, metric) เท่านั้น
       ไม่ได้แยก "ในโรงเรือน" กับ "นอกโรงเรือน" ออกจากกัน — ทั้งที่เซนเซอร์ทั้งสองแบบ
       ผูกกับโรงเรือนหลังเดียวกัน ค่า temp_c ที่ได้จึงเป็นค่าเฉลี่ยของในกับนอกปนกัน
       (วัดจริง 31 ส.ค. 2569: ในโรงเรือน 27.12 °C · นอกโรงเรือน 26.10 °C
        แต่ sensor_hourly รายงาน 26.59 °C ซึ่งไม่ใช่ทั้งสองอย่าง)

       ที่นี่จึงสรุปจากตารางดิบพร้อม join `device` เพื่อแยกด้วยธง `outdoor`
       ข้อมูลระดับแสนแถวยังเร็วอยู่มากเพราะมี index (barn_id, metric, at desc)
       ถ้าวันหนึ่งข้อมูลโตจนช้า ให้เพิ่มคอลัมน์ `outdoor` ลง `sensor_reading`
       แล้วสร้าง continuous aggregate ใหม่ที่ group by ธงนั้นด้วย */
    const { rows } = await query(
      `select time_bucket($4::interval, sr.at ${hourly ? "" : ", 'Asia/Bangkok'"}) as at,
              sr.metric, d.outdoor,
              avg(sr.value) as value, min(sr.value) as min, max(sr.value) as max, count(*)::int as n
       from sensor_reading sr
       join device d on d.id = sr.device_id
       where sr.barn_id = $1 and sr.metric = any($2::text[])
         and sr.at >= now() - ($3 || ' hours')::interval
       group by 1, 2, 3
       order by 1`,
      [barn.id, metrics, String(hours), hourly ? "1 hour" : "1 day"],
    );

    res.json({ barnId: barn.id, range, resolution: hourly ? "hour" : "day", points: rows });
  } catch (err) { next(err); }
});

/**
 * GET /api/barns/:id/power/latest — ค่าล่าสุดจากมิเตอร์ไฟของโรงเรือน
 *
 * ★ **ข้อความเดิมที่นี่ล้าสมัยแล้ว** เคยเขียนว่ามิเตอร์ไม่ส่ง kW และหน่วยสะสม
 *   แต่ตรวจของจริง 8 ต.ค. 2569 พบว่า**ส่งมาครบ** — `power_kw` 2.95 · `kwh_total` 7509.25
 *   (94,157 แถว ค่าใหม่เข้าทุก ~30 วินาที) จึงคิด "ใช้ไปวันนี้/เดือนนี้" ได้จริง
 *
 * ยังไม่ส่งคือ **ตัวประกอบกำลัง (power factor)** ซึ่งยังเป็น null
 * ★ ห้ามคำนวณ kW ให้เองโดยเดาตัวประกอบกำลัง เพราะจะกลายเป็นตัวเลขที่ดูน่าเชื่อแต่ผิด
 *   — และตอนนี้ไม่ต้องคำนวณแล้วด้วย เพราะมิเตอร์บอก kW มาตรง ๆ
 */
readingsRouter.get("/:id/power/latest", async (req, res, next) => {
  try {
    const barn = await barnOr404(req.params.id);
    const { rows } = await query(
      `select p.at, p.voltage, p.current_a, p.current_b, p.current_c,
              p.frequency, p.power_kw, p.kwh_total, d.code as device_code
       from power_reading p
       join device d on d.id = p.device_id
       where p.barn_id = $1
       order by p.at desc
       limit 1`,
      [barn.id],
    );

    if (rows.length === 0) {
      return res.json({ barnId: barn.id, reading: null });
    }

    const r = rows[0];

    /* `kwh_total` เป็นเลขสะสมของมิเตอร์ (นับขึ้นเรื่อย ๆ ไม่รีเซ็ต)
       หน้าจอถามว่า "ใช้ไปวันนี้/เดือนนี้" ซึ่งคือ **ส่วนต่าง** ไม่ใช่ตัวเลขสะสม
       จึงต้องเอา ค่าสูงสุด − ค่าต่ำสุด ของช่วงนั้น
       ต้องระบุ 'Asia/Bangkok' ไม่งั้น "วันนี้" จะเริ่มนับตอน 7 โมงเช้า */
    const { rows: [usage] } = await query(
      `select
         max(kwh_total) filter (where at >= date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')
           - min(kwh_total) filter (where at >= date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok') as today_kwh,
         max(kwh_total) filter (where at >= date_trunc('month', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')
           - min(kwh_total) filter (where at >= date_trunc('month', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok') as month_kwh,
         /* เริ่มนับจากจุดไหน — ถ้าเราเพิ่งเริ่มเก็บตอนสาย ตัวเลข "วันนี้" ไม่ได้ครอบคลุมทั้งวัน
            หน้าจอต้องบอกให้ชัด ไม่งั้นคนอ่านจะนึกว่าฟาร์มใช้ไฟแค่นั้นจริง ๆ */
         min(at) filter (where at >= date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok') as today_from,
         min(at) filter (where at >= date_trunc('month', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok') as month_from
       from power_reading
       where barn_id = $1 and kwh_total is not null`,
      [barn.id],
    );

    res.json({
      barnId: barn.id,
      reading: {
        at: r.at,
        deviceCode: r.device_code,
        voltage: r.voltage,
        currents: { a: r.current_a, b: r.current_b, c: r.current_c },
        frequency: r.frequency,
        powerKw: r.power_kw,
        kwhTotal: r.kwh_total,
        /* null = ยังไม่มีข้อมูลพอจะบอกส่วนต่าง (เพิ่งเริ่มเก็บ หรือมิเตอร์ไม่ส่ง kWh) */
        todayKwh: usage?.today_kwh ?? null,
        monthKwh: usage?.month_kwh ?? null,
        todayFrom: usage?.today_from ?? null,
        monthFrom: usage?.month_from ?? null,
      },
    });
  } catch (err) { next(err); }
});

/** GET /api/barns/:id/sensor-map — ค่าล่าสุดแยกตามโซน (ผังเซนเซอร์ A–D) */
readingsRouter.get("/:id/sensor-map", async (req, res, next) => {
  try {
    const barn = await barnOr404(req.params.id);
    const { rows } = await query(
      `select d.code, d.zone, d.outdoor,
              coalesce(
                jsonb_object_agg(c.metric, jsonb_build_object('value', c.value, 'at', c.at))
                  filter (where c.metric is not null),
                '{}'::jsonb
              ) as readings
       from device d
       left join v_device_current c on c.device_id = d.id
       where d.barn_id = $1 and d.kind = 'sensor' and d.active
       group by d.id
       order by d.outdoor, d.zone`,
      [barn.id],
    );
    res.json({ barnId: barn.id, nodes: rows });
  } catch (err) { next(err); }
});

/**
 * GET /api/barns/:id/twin — แบบจำลองโรงเรือนชั้นที่ 2 (T1.261)
 * แบบจำลองความร้อนที่หาจากข้อมูลจริง + ความแม่นที่วัดจากช่วงที่ไม่เคยเห็น
 * + เทียบ "ของจริงตอนนี้" กับ "ที่แบบจำลองคาด" (รายละเอียดใน server/src/twin/barnTwin.js)
 */
readingsRouter.get("/:id/twin", async (req, res, next) => {
  try {
    const barn = await barnOr404(req.params.id);
    res.json(await barnTwin(barn.id));
  } catch (err) { next(err); }
});

/**
 * GET /api/barns/:id/twin/scenario — แบบจำลองชั้นที่ 3 (T1.262)
 * วัตถุดิบสำหรับจำลองสถานการณ์ฝั่งหน้าเว็บ: พารามิเตอร์ · จุดเริ่ม · แดด/อากาศ 24 ชม. ข้างหน้า · วันที่ร้อนที่สุด
 */
readingsRouter.get("/:id/twin/scenario", async (req, res, next) => {
  try {
    const barn = await barnOr404(req.params.id);
    res.json(await barnScenario(barn.id));
  } catch (err) { next(err); }
});

