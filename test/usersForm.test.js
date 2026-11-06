/**
 * ฟอร์มเพิ่มผู้ใช้ต้องมีช่องครบทุกช่องที่หลังบ้านบังคับ (T1.252)
 *
 * เจอจริง 15 ก.ย. 2569: ตอนแก้ฟอร์มเป็น 4 ระดับ ช่อง "รหัสผ่านชั่วคราว" หลุดหายไปทั้งช่อง
 * build · lint · เทสต์เดิมผ่านหมด แต่กดเพิ่มผู้ใช้กี่ครั้งหลังบ้านก็ปฏิเสธ (ไม่มีรหัสผ่าน)
 * เทสต์นี้อ่านซอร์สตรง ๆ — ไม่ต้องมี DOM หรือ React ก็จับอาการนี้ได้
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/pages/Users.jsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../server/src/modules/users/route.js", import.meta.url), "utf8");

/** ส่วนของฟอร์มเพิ่มผู้ใช้ ตั้งแต่ onSubmit={addUser} ถึง </form> ตัวแรก */
const addForm = src.slice(src.indexOf("onSubmit={addUser}"), src.indexOf("</form>", src.indexOf("onSubmit={addUser}")));

test("ฟอร์มเพิ่มผู้ใช้หาเจอ", () => {
  assert.ok(addForm.length > 0);
});

for (const field of ["username", "displayName", "email", "role", "password"]) {
  test(`มีช่องกรอก ${field} ผูกกับ form.${field}`, () => {
    assert.match(addForm, new RegExp(`value=\\{form\\.${field}\\}`), `ช่อง ${field} หายไปจากฟอร์มเพิ่มผู้ใช้`);
  });
  test(`หลังบ้านอ่าน ${field} จาก req.body (ชื่อต้องตรงกับฟอร์ม)`, () => {
    assert.match(server, new RegExp(`req\\.body\\?\\.${field}`));
  });
}

/** ฟอร์มแก้ไขบัญชี (T1.253) — ตั้งแต่ onSubmit={saveEdit} ถึง </form> */
const editForm = src.slice(src.indexOf("onSubmit={saveEdit}"), src.indexOf("</form>", src.indexOf("onSubmit={saveEdit}")));

for (const field of ["username", "displayName", "email", "role"]) {
  test(`ฟอร์มแก้ไขมีช่อง ${field}`, () => {
    assert.match(editForm, new RegExp(`value=\\{editing\\.${field}\\}`), `ช่อง ${field} หายไปจากฟอร์มแก้ไข`);
  });
}

test("หลังบ้านรับแก้ username กับ email ใน PATCH และลบบัญชีได้จริง (ไม่ใช่แค่ปิด)", () => {
  assert.match(server, /req\.body\?\.username !== undefined/);
  assert.match(server, /req\.body\?\.email !== undefined/);
  assert.match(server, /delete from app_user where id = \$1/);
});

test("ข้อความผิดพลาดขึ้นในฟอร์มด้วย ไม่ใช่แค่บนสุดของหน้า", () => {
  assert.match(addForm, /us-form-error/);
});

test("คำสั่งของแต่ละบัญชีอยู่ในเมนูเฟืองท้ายแถว ครบ 4 คำสั่ง (T1.254)", () => {
  const menu = src.slice(src.indexOf("<ActionMenu"), src.indexOf("/>", src.indexOf("<ActionMenu")));
  for (const id of ["edit", "password", "active", "delete"]) assert.match(menu, new RegExp(`id: "${id}"`), id);
});
