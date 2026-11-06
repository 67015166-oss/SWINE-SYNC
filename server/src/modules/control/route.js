import { Router } from "express";
import { logActivity } from "../../activity/log.js";
import { query } from "../../db/pool.js";
import { AppError, badRequest, notFound } from "../../lib/error.js";
import { requireAuth, requireEquipmentControl } from "../../lib/auth.js";
import { log } from "../../lib/log.js";
import { checkCommand, BARN_KEY } from "../../control/validate.js";
import { gate, TEMP_STALE_MINUTES } from "../../control/limits.js";
import { resolveDevice, defaultDevices } from "../../control/devices.js";
import { sendCommand, transportName, canSend } from "../../control/transport.js";

/**
 * ส่งคำสั่งไปตู้ควบคุมโรงเรือน (T1.284) — /api/control
 *
 *   GET  /:barnKey/state       อุณหภูมิที่ใช้ตัดสิน · เพดาน · อุปกรณ์ที่สั่งได้ · ส่งออกได้ไหม
 *   GET  /:barnKey/commands    ประวัติคำสั่ง (รวมที่ถูกปฏิเสธ)      ← ทุกคนที่ล็อกอิน
 *   POST /:barnKey/command     สั่งหนึ่งคำสั่ง                      ← ผู้ควบคุมอุปกรณ์ขึ้นไป
 *
 * ★ วันนี้ยังส่งออกไปไม่ได้ (CONTROL_TRANSPORT=hold) เพราะระบบสภาพแวดล้อมเป็นของอีกฝ่าย
 *   และสิ่งที่เราได้รับมาไม่มีช่องสั่งงาน — เส้นทางนี้จึง **ตรวจครบทุกด่านแล้วเก็บเข้าคิว**
 *   เหตุผลเต็มอยู่ใน control/transport.js · ท่าที่ใช้ตอนได้สิทธิ์อยู่ใน docs/RUNBOOK.md
 *
 * คำขอที่ด่านความปลอดภัยปฏิเสธ **ก็บันทึกลงฐาน** แล้วตอบ 422 — ไม่ใช่ตอบ error เปล่า ๆ
 * เพราะ "เคยมีคนพยายามปิดพัดลมตอน 34 °C" เป็นข้อมูลที่ต้องตอบได้
 */
export const controlRouter = Router();

controlRouter.use(requireAuth);

const keyOf = (req) => {
  const key = req.params.barnKey;
  if (!BARN_KEY.test(key)) throw badRequest("รหัสโรงเรือนไม่ถูกต้อง", { got: key });
  return key;
};

/** โรงเรือนจริงที่ตรงกับคีย์แบบหน้าเว็บ ("F-KPP-A1") — ไม่มีก็คืน null (โรงเรือนตัวอย่าง) */
async function realBarn(barnKey) {
  const { rows } = await query(
    `select b.id, b.active, f.data_source
       from barn b join farm f on f.id = b.farm_id
      where f.code || '-' || b.code = $1
      limit 1`,
    [barnKey],
  );
  return rows[0] ?? null;
}

/** เพดานอุณหภูมิที่ตกลงไว้ — กฎของโรงเรือนชนะกฎของฟาร์ม กฎของฟาร์มชนะกฎรวม */
async function tempMaxOf(barnId) {
  const { rows } = await query(
    `select threshold_max from alert_rule
      where metric = 'temp_c' and enabled and threshold_max is not null
        and (scope = 'global'
             or (scope = 'barn' and barn_id = $1)
             or (scope = 'farm' and farm_id = (select farm_id from barn where id = $1)))
      order by case scope when 'barn' then 0 when 'farm' then 1 else 2 end
      limit 1`,
    [barnId],
  );
  return rows[0]?.threshold_max ?? null;
}

/** อุณหภูมิล่าสุดของโรงเรือน + อายุของค่านั้นเป็นนาที */
async function latestTemp(barnId) {
  const { rows } = await query(
    `select value, extract(epoch from (now() - at)) / 60 as age_minutes
       from sensor_reading
      where barn_id = $1 and metric = 'temp_c'
      order by at desc
      limit 1`,
    [barnId],
  );
  if (rows.length === 0) return { tempC: null, tempAgeMinutes: null };
  return {
    tempC: Math.round(rows[0].value * 10) / 10,
    tempAgeMinutes: Math.round(Number(rows[0].age_minutes) * 10) / 10,
  };
}

/** ทะเบียนอุปกรณ์ของโรงเรือนนี้ — แถวในฐานทับค่าตั้งต้น */
async function deviceRows(barnKey) {
  const { rows } = await query(
    `select kind, device_id, duty, critical, cooling, enabled, remote_addr
       from control_device where barn_key = $1`,
    [barnKey],
  );
  return rows;
}

/** ทุกอย่างที่ด่านความปลอดภัยต้องรู้ */
async function contextOf(barnKey, kind, deviceId) {
  const barn = await realBarn(barnKey);
  const rows = await deviceRows(barnKey);
  const row = rows.find((r) => r.kind === kind && r.device_id === deviceId) ?? null;
  const device = resolveDevice(row, kind, deviceId);

  /* โรงเรือนตัวอย่างไม่มีค่าเซนเซอร์ให้ตัดสิน — ด่านอุณหภูมิจะปฏิเสธคำสั่งที่ลดความเย็นเอง
     ไม่ต้องเขียนกรณีพิเศษ และนั่นคือพฤติกรรมที่ถูก: ไม่รู้ ก็ไม่ให้ลด */
  const temp = barn ? await latestTemp(barn.id) : { tempC: null, tempAgeMinutes: null };
  const tempMax = barn ? await tempMaxOf(barn.id) : null;

  const { rows: recent } = await query(
    `select count(*)::int as n from control_command
      where barn_key = $1 and requested_at > now() - interval '1 minute'`,
    [barnKey],
  );

  return {
    barn,
    device,
    online: barn ? barn.active : true,
    tempC: temp.tempC,
    tempAgeMinutes: temp.tempAgeMinutes,
    tempMax,
    recentCount: recent[0].n,
  };
}

const COLUMNS = `id, device_kind as "deviceKind", device_id as "deviceId", action, hz,
  reason, status, gate_code as "gateCode", gate_message as "gateMessage", confirmed,
  transport, detail, temp_c as "tempC", temp_max as "tempMax",
  requested_at as "requestedAt", settled_at as "settledAt"`;

controlRouter.get("/:barnKey/state", async (req, res, next) => {
  try {
    const key = keyOf(req);
    const rows = await deviceRows(key);
    const devices = defaultDevices().map((d) => {
      const row = rows.find((r) => r.kind === d.kind && r.device_id === d.device_id);
      return resolveDevice(row, d.kind, d.device_id);
    });
    /* อุปกรณ์ที่มีในฐานแต่ไม่อยู่ในชุดตั้งต้น (โรงเรือนจริงที่มีของมากกว่า) ต้องโชว์ด้วย */
    for (const row of rows) {
      if (!devices.some((d) => d.kind === row.kind && d.device_id === row.device_id)) devices.push(row);
    }

    const barn = await realBarn(key);
    const temp = barn ? await latestTemp(barn.id) : { tempC: null, tempAgeMinutes: null };
    res.json({
      barnKey: key,
      real: Boolean(barn),
      online: barn ? barn.active : true,
      temp: { ...temp, staleAfterMinutes: TEMP_STALE_MINUTES },
      tempMax: barn ? await tempMaxOf(barn.id) : null,
      transport: transportName(),
      canSend: canSend(),
      devices,
    });
  } catch (err) { next(err); }
});

controlRouter.get("/:barnKey/commands", async (req, res, next) => {
  try {
    const key = keyOf(req);
    const { rows } = await query(
      `select ${COLUMNS} from control_command
        where barn_key = $1 order by requested_at desc limit 200`,
      [key],
    );
    res.json({ barnKey: key, commands: rows });
  } catch (err) { next(err); }
});

controlRouter.post("/:barnKey/command", requireEquipmentControl, async (req, res, next) => {
  try {
    const key = keyOf(req);

    const shape = checkCommand(req.body);
    if (!shape.ok) throw badRequest("คำสั่งไม่ถูกต้อง", { fields: shape.errors });
    const cmd = shape.value;

    const ctx = await contextOf(key, cmd.deviceKind, cmd.deviceId);
    if (!ctx.device) throw notFound(`อุปกรณ์ ${cmd.deviceId} ของโรงเรือนนี้`);

    const verdict = gate(cmd, ctx);

    /* บันทึกก่อนส่งเสมอ — ถ้าบันทึกไม่ได้ก็ไม่ต้องส่ง ดีกว่าส่งแล้วไม่รู้ว่าใครส่ง */
    const save = (status, extra) =>
      query(
        `insert into control_command
           (barn_key, device_kind, device_id, action, hz, reason, status,
            gate_code, gate_message, confirmed, transport, detail,
            temp_c, temp_max, client_id, requested_by, settled_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         on conflict (barn_key, client_id) do nothing
         returning ${COLUMNS}`,
        [
          key, cmd.deviceKind, cmd.deviceId, cmd.action, cmd.hz, cmd.reason, status,
          extra.gateCode ?? null, extra.gateMessage ?? null, cmd.confirmed,
          extra.transport ?? null, extra.detail ?? null,
          ctx.tempC, ctx.tempMax, cmd.clientId, req.user.id, extra.settled ?? null,
        ],
      );

    if (!verdict.ok) {
      await save("rejected", {
        gateCode: verdict.code,
        gateMessage: verdict.message,
        settled: new Date(),
      });
      log.warn(
        { โรงเรือน: key, อุปกรณ์: cmd.deviceId, สั่ง: cmd.action, เหตุ: verdict.code, ผู้สั่ง: req.user.id },
        "ปฏิเสธคำสั่งอุปกรณ์",
      );
      throw new AppError(422, verdict.needsConfirm ? "needs_confirm" : "unsafe_command", verdict.message, {
        gateCode: verdict.code,
        needsConfirm: Boolean(verdict.needsConfirm),
        tempC: ctx.tempC,
        tempMax: ctx.tempMax,
      });
    }

    const out = await sendCommand(cmd, ctx.device);
    const { rows } = await save(out.status, {
      transport: transportName(),
      detail: out.detail,
      gateCode: verdict.confirmedPast ?? null,
      gateMessage: verdict.confirmedPast ? "คนสั่งยืนยันข้ามกติกานี้" : null,
      settled: out.status === "sent" ? new Date() : null,
    });

    /* ส่งซ้ำด้วย clientId เดิม → do nothing → ไม่มีแถวคืน ต้องไปอ่านของเดิมมาตอบ
       ไม่งั้นหน้าจอที่กดซ้ำตอนเน็ตกระตุกจะเห็น error ทั้งที่คำสั่งเข้าไปแล้ว */
    let entry = rows[0];
    if (!entry && cmd.clientId) {
      const { rows: old } = await query(
        `select ${COLUMNS} from control_command where barn_key = $1 and client_id = $2`,
        [key, cmd.clientId],
      );
      entry = old[0];
    }

    log.info(
      { โรงเรือน: key, อุปกรณ์: cmd.deviceId, สั่ง: cmd.action, สถานะ: out.status, ผู้สั่ง: req.user.id },
      "รับคำสั่งอุปกรณ์",
    );
    /* ★ บันทึกเฉพาะคำสั่งที่ผ่านด่านแล้ว — คำสั่งที่ถูกปฏิเสธมีบันทึกของตัวเอง
       อยู่ใน control_command อยู่แล้ว และไม่ใช่ "การเปลี่ยนแปลง" ที่ต้องแจ้งใคร */
    await logActivity({ kind: "control", action: "control.command", actor: req.user,
      target: key, detail: { device: cmd.deviceId, action: cmd.action, status: out.status } });
    res.status(201).json({ command: entry, held: out.status === "held", detail: out.detail });
  } catch (err) { next(err); }
});
