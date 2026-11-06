/**
 * ตู้กลางรับข้อมูลจากกล่องของทีมอื่น (T1.347)
 *
 * ═══ โจทย์ ═══
 * ทั้งโปรเจกต์มี 5 กล่อง — BOX-muey (PLC) · BOX-jew (กล้อง AI) · BOX-dy (Easy Pairing)
 * · BOX-fern (Voice AI) และ BOX-mew ตัวนี้ ซึ่งถูกกำหนดให้เป็น **ที่รวมข้อมูลตรงกลาง**
 * ทุกกล่องส่งเข้ามาได้ และ **เจ้าของ box-mew เป็นคนกำหนดว่าใครดึงอะไรไปใช้ได้**
 *
 * ก่อนหน้านี้ไม่มีทางให้ใครส่งข้อมูลเข้ามาเลย — ไม่มี POST รับข้อมูลสักเส้น
 * ทางเดียวที่ข้อมูลเข้าได้คือสะพานบนเครื่องผู้พัฒนาเขียนลง Postgres ตรง ๆ
 *
 * ═══ ★ ทำไมไม่ยัดทุกอย่างลง `sensor_reading` ═══
 * ตารางนั้นผูกกับ "ฟาร์ม → โรงเรือน → อุปกรณ์" ซึ่งเป็นรูปของงานเลี้ยงสุกรโดยเฉพาะ
 * ข้อมูลจากทีมอื่นไม่เข้าทรงนั้น — ข้อความถาม-ตอบของวอยซ์ไม่มีโรงเรือน
 * ผลตรวจจับจากกล้องมีทั้งตัวเลขและไฟล์ ส่วน Easy Pairing ใช้ได้ทั้งแปลงพืชและโรงเรือน
 * ยัดเข้าไปจะต้องปล่อย barn_id ว่าง แล้วทุกคิวรีเดิมที่สมมติว่ามีโรงเรือนจะเริ่มเพี้ยน
 *
 * ═══ แยกสองตารางตามนิสัยข้อมูล ═══
 *   `ingest_reading`  ตัวเลขตามเวลา — ถี่ จำนวนมาก ขนาดเล็ก (hypertable + บีบอัด)
 *   `ingest_event`    เหตุการณ์/ข้อความ/ไฟล์ — ไม่ถี่ แต่ละแถวใหญ่กว่า
 *
 * ═══ ★★ ไฟล์: เก็บ "ที่อยู่" ไม่เก็บตัวไฟล์ ═══
 * วัดแล้วบนกล่องจริง (26 ต.ค. 2569) ดิสก์ 1.8 TB ว่าง 1.4 TB — ภาพนิ่งกับคลิปสั้นเก็บไหว
 * แต่ **วิดีโอต่อเนื่อง 21 กล้องกินราว 13 TB ต่อเดือน** ซึ่งเต็มใน 3 วัน
 * ตารางนี้จึงเก็บแค่ URL ขนาด และชนิดไฟล์ ส่วนตัวไฟล์อยู่ที่ไหนก็ได้
 * ★ ดิสก์เป็น overlay แปลว่ากล่องรันในคอนเทนเนอร์ พื้นที่ที่เห็นแชร์กับโฮสต์ อย่าวางแผนใช้เต็ม
 */

export const disableTransaction = false;

export const up = (pgm) => {
  pgm.sql(`
    /* ---------- 1. ทะเบียนกล่องที่ส่งข้อมูลเข้ามาได้ ---------- */
    create table if not exists source_box (
      id          uuid primary key default gen_random_uuid(),
      code        text not null unique,
      name        text not null,
      /* ★ เก็บแฮชเท่านั้น — กุญแจตัวจริงโชว์ครั้งเดียวตอนออกให้ แล้วไม่มีใครอ่านย้อนได้อีก
         ถ้าเก็บตัวจริงไว้ ใครอ่านฐานได้ก็สวมรอยเป็นกล่องนั้นได้ทันที */
      key_hash    text not null,
      /* ปิดกล่องได้โดยไม่ต้องลบ — ลบแล้วข้อมูลเก่าจะหาที่มาไม่เจอ */
      active      boolean not null default true,
      note        text,
      created_at  timestamptz not null default now(),
      last_seen_at timestamptz
    );

    comment on table source_box is
      'กล่องของแต่ละทีมที่ส่งข้อมูลเข้าตู้กลาง — code เช่น muey, jew, dy, fern';

    /* ---------- 2. ชุดข้อมูลที่ไหลเข้ามา (ระบบจดให้เองเมื่อเจอของใหม่) ---------- */
    create table if not exists ingest_stream (
      id          uuid primary key default gen_random_uuid(),
      box_id      uuid not null references source_box(id) on delete cascade,
      /* ชื่อที่ฝั่งผู้ส่งตั้งเอง เช่น "env.temp" หรือ "camera.count" */
      name        text not null,
      kind        text not null check (kind in ('reading', 'event', 'file')),
      unit        text,
      label       text,
      first_seen_at timestamptz not null default now(),
      last_seen_at  timestamptz,
      /* นับไว้ให้เจ้าของตู้เห็นว่าชุดไหนมีของจริง ชุดไหนส่งมาครั้งเดียวแล้วเงียบ */
      sample_count bigint not null default 0,
      unique (box_id, name)
    );

    comment on table ingest_stream is
      'ชุดข้อมูลหนึ่งชุด = กล่องหนึ่งตัวส่งค่าชนิดหนึ่งเข้ามา — ขึ้นทะเบียนอัตโนมัติเมื่อเจอครั้งแรก';

    /* ---------- 3. ใครดึงชุดไหนไปใช้ได้ ---------- */
    create table if not exists stream_grant (
      stream_id   uuid not null references ingest_stream(id) on delete cascade,
      /* ผู้รับสิทธิ์เป็น "กล่อง" ตัวหนึ่ง — ทีมอื่นดึงด้วยกุญแจของกล่องตัวเอง */
      grantee_id  uuid not null references source_box(id) on delete cascade,
      granted_at  timestamptz not null default now(),
      granted_by  uuid references app_user(id),
      primary key (stream_id, grantee_id)
    );

    comment on table stream_grant is
      'ค่าตั้งต้นคือไม่มีสิทธิ์ — แถวในตารางนี้คือการเปิดให้ทีละชุด ไม่มีแถว = ดึงไม่ได้';

    /* ---------- 4. ตัวเลขตามเวลา ---------- */
    create table if not exists ingest_reading (
      stream_id   uuid not null references ingest_stream(id) on delete cascade,
      at          timestamptz not null,
      value       double precision not null,
      /* เวลาที่ตู้กลางได้รับจริง — ต่างจากคอลัมน์ at ที่เป็นเวลาที่ฝั่งผู้ส่งบอกว่าวัดได้
         ★ สองค่านี้ต่างกันได้มากตอนผู้ส่งส่งย้อนหลังมาเป็นก้อน ต้องแยกไว้ถึงจะไล่ปัญหาได้ */
      received_at timestamptz not null default now(),
      primary key (stream_id, at)
    );

    /* ---------- 5. เหตุการณ์ ข้อความ และไฟล์ ---------- */
    create table if not exists ingest_event (
      id          bigserial primary key,
      stream_id   uuid not null references ingest_stream(id) on delete cascade,
      at          timestamptz not null,
      received_at timestamptz not null default now(),
      /* เนื้อหาอิสระ — ฝั่งผู้ส่งกำหนดรูปเอง ตู้กลางไม่บังคับโครง */
      payload     jsonb,
      /* ★ ไฟล์เก็บแค่ที่อยู่ ไม่เก็บตัวไฟล์ ดูเหตุผลหัวไฟล์ */
      file_url    text,
      file_type   text,
      file_bytes  bigint
    );

    create index if not exists ingest_event_stream_at_idx
      on ingest_event (stream_id, at desc);
  `);

  /* hypertable ต้องสร้างหลังตารางมีอยู่แล้ว — ใช้รูปแบบเดียวกับ sensor_reading */
  pgm.sql(`
    select create_hypertable('ingest_reading', 'at',
      chunk_time_interval => interval '7 days', if_not_exists => true);
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    drop table if exists ingest_reading;
    drop table if exists ingest_event;
    drop table if exists stream_grant;
    drop table if exists ingest_stream;
    drop table if exists source_box;
  `);
};
