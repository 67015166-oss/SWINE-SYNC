/** error รูปแบบเดียวกันทุกเส้นทาง: { error: { code, message, details? } } */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what) => new AppError(404, "not_found", `ไม่พบ${what}`);
export const badRequest = (message, details) => new AppError(400, "bad_request", message, details);

/** ตัวจับ error กลาง — ต้องเป็น middleware ตัวสุดท้ายเสมอ */
export function errorHandler(log) {
  // eslint-disable-next-line no-unused-vars -- express ดูจำนวน argument เพื่อรู้ว่าเป็น error handler
  return (err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) log.error({ err, path: req.path }, "คำขอล้มเหลว");
    res.status(status).json({
      error: {
        code: err.code || "internal",
        message: status >= 500 ? "เกิดข้อผิดพลาดภายในระบบ" : err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  };
}
