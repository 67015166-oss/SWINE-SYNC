/**
 * การ์ด "แผนผังเซนเซอร์" — ผังโรงเรือนแบบมองจากด้านบน
 *
 * วางด้วย flow ปกติ (แถวโซน → แถวพัดลม → แถวจุดวัด → แถวปั๊ม) ไม่ใช่พิกัดสัมบูรณ์
 * ผังจึงยุบลงมาเรียงต่อกันบนจอแคบได้เองโดยไม่ต้องเขียน media query ให้ทุกจุด
 *
 * จุดวัดที่ค่าหลุดเกณฑ์จะมีป้ายไอคอน + ข้อความกำกับ ไม่ได้บอกด้วยสีวงกลมอย่างเดียว
 */
import Card from "../ui/Card.jsx";
import Icon from "../ui/Icon.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";
import { updatedText } from "../../lib/duration.js";
import { STALE_MS } from "../../lib/api/nowReply.js";
import DataSourceBadge from "../ui/DataSourceBadge.jsx";
import { readingStatus } from "../../data/mock/climate.js";
import { FAN_COUNT } from "../../data/mock/barnSystems.js";
import { formatNumber, formatNumber1 } from "../../lib/format.js";
import "./systems.css";
import { useT } from "../../lib/i18n/useT.js";

/**
 * @param {object} map  ผังเซนเซอร์ — ของจริงจากกล่องผ่าน `sensorMapOf()` หรือของตัวอย่างจาก `getSensorMap()`
 *                      จุดที่ `silent` คือ "ไม่ส่งค่า" ซึ่งเกิดทีละจุดได้ ไม่ใช่เงียบทั้งผัง (T1.336)
 * @param {object} equipment ชุดอุปกรณ์ — `known: false` แปลว่ารู้ว่ามีอุปกรณ์อะไร
 *                      แต่ไม่รู้ว่าเดินอยู่หรือหยุด (กล่องไม่ส่งค่ากลับ) ห้ามวาดว่าหมุนอยู่
 * @param {string} barnName ชื่อโรงเรือนสำหรับหัวการ์ด
 * @param {object} comfort  ช่วงที่ถือว่าเหมาะสม (มาจากหน้าตั้งค่า)
 * @param {number} nh3Limit เกณฑ์แอมโมเนีย ppm (มาจากหน้าตั้งค่า)
 */
export default function SensorMap({ map, equipment, barnName, demo = false, comfort, nh3Limit }) {
  const t = useT();
  const nodes = map?.nodes ?? [];
  /* ★ "ส่งค่าอยู่" นับทีละจุด — ผังของจริงมีจุดที่เงียบปนกับจุดที่ยังส่งค่าได้
     (กำแพงเพชร 15 ต.ค. 2569: SENSOR-B ส่งอยู่ · SENSOR-A/C เงียบ)
     ตัดสินด้วยธงเดียวทั้งการ์ดเมื่อไร จุดที่ยังส่งค่าจะถูกลบทิ้งไปพร้อมกัน */
  const livePoints = nodes.filter((n) => !n.silent && n.tempC != null);
  const online = map?.online ?? livePoints.length > 0;
  const activeNodes = livePoints.length;
  /* จุดนอกอาคารอยู่คนละที่กับผังในเล้า — โชว์แยกแถว ห้ามนับรวมเป็นจุดวัดในเล้า */
  const outdoorNodes = map?.outdoor ?? [];
  /* กล่องไม่ส่งสถานะอุปกรณ์กลับมา — ผังต้องไม่วาดพัดลมว่าหมุนอยู่หรือหยุด */
  const equipUnknown = equipment != null && equipment.known === false;

  return (
    <Card className="sm-card">
      <header className="sm-head">
        <span className="icon-chip is-sm" aria-hidden="true">
          <Icon name="map" size={18} />
        </span>
        <h3>{t("แผนผังเซนเซอร์ · {barn}", { barn: t(barnName) })}</h3>
        {/* ผังของโรงเรือนตัวอย่างเป็นตัวเลขสมมติ — ห้ามบอกว่า "กำลังส่งค่า" (T1.241) */}
        {online && demo ? (
          <span className="ec-source">
            <DataSourceBadge source="demo" />
          </span>
        ) : (
          <span className={"ec-live" + (online ? "" : " is-off")}>
            <span className="ec-live-dot" aria-hidden="true" />
            {online
              ? t("{n} จุดวัดกำลังส่งค่า", { n: formatNumber(activeNodes) })
              : t("ทุกจุดวัดไม่ส่งค่า")}
          </span>
        )}
      </header>

      <div className="sm-plan">
        {/* หัวโซน
            ★ ทั้งคำว่า "โซน" และชื่อตำแหน่งต้องผ่าน t() (T1.318)
              คำแปลของทั้งห้าคำมีอยู่ใน en.js/zh.js ครบตั้งแต่ต้น ที่พลาดคือสองบรรทัดนี้
              ไม่ได้เรียกใช้ — บรรทัด "ป้ายโซนซ้ำในการ์ด" ข้างล่างทำถูกอยู่แล้ว
              จึงเป็นกรณีที่ **ทั้งหน้าแปลครบ ยกเว้นผังเซนเซอร์** ซึ่งมองข้ามง่าย
              เพราะต้องสลับภาษาแล้วเลื่อนลงมาถึงผังจึงจะเห็น */}
        <ol className="sm-zones">
          {nodes.map((zone) => (
            <li key={zone.id}>
              <b>{t("โซน {zone}", { zone: zone.id })}</b>
              <span>{t(zone.label)}</span>
            </li>
          ))}
        </ol>

        {/* แนวพัดลมที่ผนังด้านยาว */}
        <div className="sm-duct">
          <span className="sm-duct-line" aria-hidden="true" />
          <ul className="sm-fans">
            {(equipment?.fans ?? Array.from({ length: FAN_COUNT })).map((fan, i) => {
              const state = fan?.state ?? "offline";
              const running = state === "on" || state === "warn";
              return (
                <li key={fan?.id ?? i} className={`sm-fan is-${state}`}>
                  <span className="sm-fan-dot" aria-hidden="true">
                    <Icon name="fan" size={18} />
                  </span>
                  <span className="sm-fan-name">{fan?.id ?? `FAN ${i + 1}`}</span>
                  <span className="sr-only">
                    {state === "unknown"
                      ? t("ไม่ทราบสถานะ")
                      : running
                        ? t("กำลังทำงาน")
                        : state === "off"
                          ? t("หยุดอยู่")
                          : t("ไม่มีสัญญาณ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* จุดวัดในแต่ละโซน */}
        <ol className="sm-nodes">
          {nodes.map((node, i) => {
            /* เกณฑ์ตัดสินได้เฉพาะจุดที่มีค่า — จุดที่เงียบต้องขึ้นป้าย "ไม่ส่งค่า"
               ไม่ใช่ป้ายเขียวเพราะ `readingStatus(null)` ไม่ได้หลุดเกณฑ์ */
            const silent = node.silent === true || node.tempC == null;
            /* ★ จุดนี้ไม่เคยกรองค่าเก่าอยู่แล้ว — ค่าดิบจากหลังบ้านมาเท่าไรก็ขึ้นเท่านั้น
               แปลว่าโซนที่เงียบไปหนึ่งชั่วโมง ก็ยังขึ้นเลขเดิมโดยไม่บอกอายุ อ่านได้ว่าเป็นค่าตอนนี้
               ค่ายังค้างไว้ตามที่ผู้ใช้สั่ง แต่ต้องติดอายุกำกับไว้ (T1.345) */
            const nodeAt = node.at ? new Date(node.at).getTime() : null;
            const held =
              !silent && nodeAt != null && Number.isFinite(nodeAt) && Date.now() - nodeAt > STALE_MS;
            const temp = silent ? null : readingStatus("tempC", node.tempC, comfort);
            const humid = silent ? null : readingStatus("humidity", node.humidity, comfort);
            /* หยิบอาการที่หนักกว่ามาโชว์ป้ายเดียว ไม่งั้นการ์ดจะรกด้วยป้ายซ้อนกัน */
            const worst =
              !temp || !humid
                ? null
                : temp.tone === "good"
                  ? humid.tone === "good"
                    ? null
                    : { ...humid, what: t("ความชื้น") }
                  : { ...temp, what: t("อุณหภูมิ") };

            return (
              <li key={node.id} className={"sm-node" + (silent ? " is-silent" : "")}>
                <span className="sm-node-num num" aria-hidden="true">
                  {i + 1}
                </span>
                {/* ป้ายโซนซ้ำอยู่ในการ์ดด้วย จอแคบจึงซ่อนแถวหัวโซนได้โดยไม่เสียข้อมูล */}
                <span className="sm-node-zone">
                  {t("โซน {zone} · {label}", { zone: node.id, label: t(node.label) })}
                </span>
                <span className="sm-node-read">
                  <b className="num">
                    {node.tempC == null ? "—" : `${formatNumber1(node.tempC)} °C`}
                  </b>
                  {/* ★ จุดที่เงียบมีป้าย "ไม่ส่งค่า" กำกับอยู่แล้ว — เขียนซ้ำตรงนี้อีก
                      กลายเป็นคำเดียวกันสองที่ติดกัน ปล่อยเป็นขีดกลางพอ */}
                  <span className="num">
                    {node.humidity == null ? "—" : `${formatNumber(node.humidity)} %RH`}
                  </span>
                </span>

                {online && map.nh3Zone === node.id && (
                  <span
                    className={"sm-node-gas" + (map.nh3 > nh3Limit ? " is-high" : "")}
                  >
                    NH₃ {formatNumber(map.nh3)} ppm
                  </span>
                )}

                {silent && <StatusBadge tone="offline">{t("ไม่ส่งค่า")}</StatusBadge>}

                {held && (
                  <span className="sm-node-held">
                    <Icon name="clock" size={13} aria-hidden="true" />
                    {t("ค่าค้างไว้")} · {updatedText(t, { at: node.at })}
                  </span>
                )}

                {worst && (
                  <StatusBadge tone={worst.tone}>
                    {/* ไทยเขียนติดกัน ("อุณหภูมิสูงกว่าเกณฑ์") ส่วนอังกฤษต้องมีเว้นวรรค
                        จึงต่อคำผ่านคีย์แปล ไม่ใช่วางสอง element ติดกันเฉย ๆ */}
                    {t("{what}{status}", { what: worst.what, status: t(worst.label) })}
                  </StatusBadge>
                )}
              </li>
            );
          })}
        </ol>

        {/* ปั๊มน้ำที่ผนังท้ายโรงเรือน */}
        <ul className="sm-pumps">
          {(equipment?.pumps ?? []).map((pump) => (
            <li
              key={pump.id}
              className={
                "sm-pump" +
                (pump.running === true ? " is-on" : pump.running == null ? " is-unknown" : "")
              }
            >
              <b>{pump.id}</b>
              <span>{t(pump.duty)}</span>
              <span className="sr-only">
                {pump.running == null
                  ? t("ไม่ทราบสถานะ")
                  : pump.running
                    ? t("กำลังทำงาน")
                    : t("หยุดอยู่")}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* ★ จุดนอกอาคารอยู่นอกผัง — มีจริงในกล่อง (SENSOR-OUT) แต่ไม่ใช่โซนไหนในเล้า
          วางไว้ใต้ผังพร้อมบอกว่าวัดข้างนอก ดีกว่าทิ้งไปเฉย ๆ หรือเอาไปปนในผัง */}
      {outdoorNodes.length > 0 && (
        <ul className="sm-outdoor">
          {outdoorNodes.map((node) => (
            <li key={node.code ?? node.id}>
              <Icon name="cloud" size={16} aria-hidden="true" />
              <b>{t("จุดวัดนอกอาคาร")}</b>
              <span className="num">
                {node.tempC == null ? "—" : `${formatNumber1(node.tempC)} °C`}
              </span>
              <span className="num">
                {node.humidity == null ? t("ไม่ส่งค่า") : `${formatNumber(node.humidity)} %RH`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {equipUnknown && (
        <p className="sm-note">
          <Icon name="fan" size={16} aria-hidden="true" />
          {t(
            "พัดลมและปั๊มในผังบอกแค่ตำแหน่งที่ติดตั้ง — กล่องไม่ได้ส่งค่ากลับว่าตัวไหนเดินอยู่",
          )}
        </p>
      )}

      {/* ★ คำอธิบายทิศลมต้องพูดถึงโซนที่มีจริงในผังนั้น ไม่ใช่โซน A–D ตรึงไว้
          ผังของกล่องที่กำแพงเพชรมีจุดวัดสามโซน (A·B·C) และไม่มีเซนเซอร์ NH₃ เลย
          เขียน "โซน D" กับ "NH₃ วัดที่ท้ายโรงเรือน" ทิ้งไว้ = อธิบายผังที่ไม่มีอยู่ */}
      <p className="sm-flow">
        <Icon name="wind" size={16} aria-hidden="true" />
        {nodes.length === 0
          ? t("ยังไม่มีจุดวัดในผังของโรงเรือนนี้")
          : t("ลมไหลจากหน้าโรงเรือน (โซน {first}) ไปออกท้าย (โซน {last}) จุดท้ายจึงร้อนและอับกว่าเสมอ", {
              first: nodes[0].id,
              last: nodes.at(-1).id,
            })}
        {map?.nh3Zone != null &&
          " — " +
            t("NH₃ วัดที่โซน {zone} ซึ่งเป็นจุดที่ก๊าซสะสมมากที่สุด", { zone: map.nh3Zone })}
      </p>
    </Card>
  );
}
