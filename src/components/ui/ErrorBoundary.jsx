/**
 * ตาข่ายรับข้อผิดพลาด — กันจอขาวเมื่อมีอะไรพังตอน render
 *
 * ทำไมต้องมี: React ถอดทั้งต้นไม้ทิ้งเมื่อ render โยน error ที่ไม่มีใครรับ
 * ผลคือผู้ใช้เห็น **หน้าขาวเปล่า ๆ ทั้งจอ** ไม่มีเมนู ไม่มีปุ่ม ไม่มีทางกลับ
 * ต้องรู้เองว่าให้กด reload — ซึ่งถ้าสาเหตุมาจากข้อมูลที่ค้างใน localStorage
 * (เลย์เอาต์ที่จัดเอง ฟาร์มที่เพิ่มเอง) กด reload กี่ครั้งก็ขาวเหมือนเดิม
 *
 * ที่นี่จึงรับไว้แล้วแสดงหน้าบอกสาเหตุพร้อมทางออกสองทาง: โหลดใหม่ กับ
 * ล้างข้อมูลที่เก็บในเครื่องแล้วเริ่มใหม่ (ทางที่สองแก้เคสข้อมูลค้างได้เสมอ)
 *
 * ครอบไว้นอกสุดของแอป — นอก Provider ทุกตัว จึงรับ error ที่เกิดใน Provider เองได้ด้วย
 * ด้วยเหตุนี้ข้อความในนี้จึงเขียนเป็นภาษาไทยตรง ๆ ไม่ผ่าน t() (LangProvider อาจเป็นตัวที่พังเสียเอง)
 */
import { Component } from "react";
import Icon from "./Icon.jsx";
import "./ErrorBoundary.css";

/** คีย์ทั้งหมดที่แอปเก็บไว้ในเครื่อง — ล้างชุดนี้เท่ากับกลับไปเป็นเครื่องใหม่ */
const clearLocalData = () => {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("swine-sync:"))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    /* บางเบราว์เซอร์ห้ามเขียน localStorage — ยังกดโหลดใหม่ได้อยู่ดี */
  }
  window.location.assign("/dashboard");
};

/**
 * **ข้อความในหน้านี้เป็นภาษาไทยเสมอ ไม่ผ่าน `t()` โดยตั้งใจ**
 *
 * สองเหตุผล: (1) เป็น class component จึงใช้ hook ไม่ได้ และ (2) ตัวมันเองครอบ
 * `LangProvider` อยู่ใน main.jsx — ถ้าอ่านภาษาจาก context ที่นี่จะได้ค่าตั้งต้นเสมอ
 * อยู่ดี ไม่ใช่ภาษาที่ผู้ใช้เลือก จะย้ายเข้าไปข้างในก็ไม่ได้ เพราะต้องดักตอน
 * provider ชั้นในพังด้วย ซึ่งเป็นเคสที่หน้านี้มีไว้รับพอดี
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    /* ยังไม่มีที่ส่ง log จริง — พิมพ์ลง console ไว้ก่อนเพื่อให้ตามรอยได้ตอนพัฒนา */
    console.error("[SWINE SYNC] หน้าพังระหว่าง render:", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="eb-wrap" role="alert">
        <div className="eb-card">
          <span className="eb-icon" aria-hidden="true">
            <Icon name="warn" size={30} />
          </span>
          <h1 className="eb-title">หน้านี้แสดงผลไม่สำเร็จ</h1>
          <p className="eb-text">
            เกิดข้อผิดพลาดระหว่างเปิดหน้านี้ ข้อมูลของคุณยังอยู่ครบ —
            ลองโหลดหน้าใหม่ก่อน ถ้ายังไม่หายให้ล้างข้อมูลที่เก็บไว้ในเครื่องแล้วเริ่มใหม่
          </p>

          <div className="eb-actions">
            <button
              type="button"
              className="eb-btn is-main"
              onClick={() => window.location.reload()}
            >
              <Icon name="power" size={19} aria-hidden="true" />
              โหลดหน้านี้ใหม่
            </button>
            <button type="button" className="eb-btn" onClick={clearLocalData}>
              <Icon name="trash" size={19} aria-hidden="true" />
              ล้างข้อมูลในเครื่องแล้วเริ่มใหม่
            </button>
          </div>

          {/* รายละเอียดสำหรับคนที่ต้องแจ้งปัญหาต่อ — พับไว้ ไม่รบกวนคนทั่วไป */}
          <details className="eb-more">
            <summary>รายละเอียดทางเทคนิค</summary>
            <pre className="eb-pre">{String(error?.stack || error?.message || error)}</pre>
          </details>
        </div>
      </div>
    );
  }
}
