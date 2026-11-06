/**
 * เหตุการณ์/ไฟล์ในตู้กลาง: ส่ง at เดิมซ้ำในชุดเดิม = ทับของเดิม (T1.350)
 *
 * ═══ เดิมเป็นยังไง ═══
 * เอกสารที่ส่งให้ทุกทีมบอกว่า "ส่ง at ซ้ำเวลาเดิม = ทับค่าเดิม ยิงซ้ำหลังเน็ตหลุดได้ปลอดภัย"
 * แต่ทำจริงแค่ `ingest_reading` (มี primary key (stream_id, at))
 * ส่วน `ingest_event` มีแค่ id ลำดับเลข — ส่งซ้ำเท่าไรก็เพิ่มแถวเท่านั้น
 *
 * ★ เจอจริง 29 ต.ค. 2569: กล่อง fern ส่ง vaccine.log 19 แถวสองรอบ ได้ 201 ทั้งคู่
 *   แล้วในฐานกลายเป็น 38 แถว — ทีมผู้ส่งทำตามเอกสารทุกอย่าง ผิดที่ฝั่งเรา
 *
 * ═══ ★ ทำไมเลือก "ทับตาม (stream_id, at)" ไม่ใช่ "ข้ามถ้าเนื้อหาซ้ำ" ═══
 * - ตรงกับที่เอกสารสัญญาไว้แล้วและตรงกับ reading — กติกาเดียวทุกชนิด จำง่าย
 * - ผู้ส่งแก้ของที่เคยส่งผิดได้ แค่ส่ง at เดิมพร้อมเนื้อหาใหม่
 *   (ถ้าข้ามเฉพาะเนื้อหาซ้ำ การแก้จะกลายเป็นแถวใหม่ซ้อนของผิดไว้)
 * - ⚠ ราคาที่จ่าย: สองเหตุการณ์ที่ต่างกันจริงแต่ at ตรงกันเป๊ะในชุดเดียวกัน ตัวหลังจะทับตัวแรก
 *   ผู้ส่งต้องให้ at ต่างกัน (ละเอียดถึงมิลลิวินาทีได้) หรือแยกชื่อชุด — เขียนไว้ในเอกสารแล้ว
 *
 * ═══ ล้างของซ้ำก่อนสร้าง unique ═══
 * สร้าง unique ไม่ได้ถ้ามีแถวชนกันอยู่ จึงเก็บแถวล่าสุด (id มากสุด) ของแต่ละ (stream_id, at)
 * ซึ่งตรงกับความหมาย "ตัวหลังทับตัวก่อน" ที่จะใช้จากนี้ไป แล้วนับ sample_count ใหม่จากของจริง
 */

export const disableTransaction = false;

export const up = (pgm) => {
  pgm.sql(`
    delete from ingest_event e
     using ingest_event newer
     where newer.stream_id = e.stream_id
       and newer.at = e.at
       and newer.id > e.id;

    create unique index if not exists ingest_event_stream_at_uq
      on ingest_event (stream_id, at);

    /* sample_count เดิมนับ "จำนวนครั้งที่ส่ง" ไม่ใช่จำนวนแถว — ส่งซ้ำแล้วตัวเลขพองตาม
       นับใหม่จากแถวจริงให้ตรงกับที่ผู้ส่งจะเห็นเวลาดึงข้อมูลออก */
    update ingest_stream s set sample_count = case s.kind
      when 'reading' then (select count(*) from ingest_reading r where r.stream_id = s.id)
      else (select count(*) from ingest_event e where e.stream_id = s.id)
    end;
  `);
};

export const down = (pgm) => {
  pgm.sql(`drop index if exists ingest_event_stream_at_uq;`);
};
