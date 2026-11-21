// Uji otorisasi di kode server (pengganti RLS) + keamanan file & upload.
// Jalankan pada data demo segar:  pnpm db:reset && pnpm test:authz
// Bagian HTTP ikut dijalankan bila BASE_URL di-set (mis. BASE_URL=http://localhost:3000).
import { existsSync } from "node:fs";
import path from "node:path";
import { and, count, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { auditLog, files, materials, sessions, studentAssessments, students, users } from "../src/db/schema";
import { getFile, saveFile } from "../src/lib/storage";
import type { Actor } from "../src/server/authz";
import { findReadableFile } from "../src/server/files";
import { createSession, findSessionUser } from "../src/server/session";
import * as inv from "../src/server/services/invoices";
import * as master from "../src/server/services/master";
import * as mat from "../src/server/services/materials";
import * as rep from "../src/server/services/reports";
import * as ses from "../src/server/services/sessions";
import * as stu from "../src/server/services/students";
import * as usr from "../src/server/services/users";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "✅" : "❌"} ${name}${ok ? "" : `  ${detail}`}`);
}
async function rejects(name: string, fn: () => Promise<unknown>, match?: RegExp) {
  try {
    await fn();
    check(name, false, "(tidak ditolak)");
  } catch (e) {
    const msg = (e as Error).message;
    check(name, !match || match.test(msg), msg);
  }
}

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PDF = Buffer.from("%PDF-1.4\n%%EOF\n");
const file = (bytes: Buffer, name: string, type = "") => new File([new Uint8Array(bytes)], name, { type });

/** File sudah hilang dari tabel files DAN dari disk? */
async function fileGone(fileId: string, key?: string) {
  const rows = await db().select().from(files).where(eq(files.id, fileId));
  const onDisk = key ? existsSync(path.resolve(process.env.UPLOAD_DIR || "/app/uploads", key)) : false;
  return rows.length === 0 && !onDisk;
}
async function keyOf(fileId: string) {
  const [f] = await db().select({ k: files.storageKey }).from(files).where(eq(files.id, fileId));
  return f?.k;
}

async function actor(email: string): Promise<Actor> {
  const [u] = await db().select().from(users).where(eq(users.email, email));
  if (!u) throw new Error(`Akun ${email} tidak ada — jalankan pnpm db:reset dulu`);
  return { id: u.id, role: u.role, status: u.status, nama: u.nama };
}

async function main() {
  const sup = await actor("superadmin@bimbel.test");
  const admin = await actor("admin@bimbel.test");
  const aulia = await actor("aulia@bimbel.test");
  const rina = await actor("rina@bimbel.test");
  const S = Object.fromEntries((await db().select({ id: students.id, nama: students.nama }).from(students)).map((s) => [s.nama, s.id]));
  const [asm] = await db().select().from(studentAssessments);
  const [mat0] = await db().select().from(materials);

  console.log("\nAsesmen privat");
  {
    const list = await stu.listStudents(aulia);
    check("data siswa untuk tentor tidak berisi asesmen", list.every((s) => s.student_assessments === undefined));
    check("tentor tidak bisa membaca file asesmen", (await findReadableFile(aulia, asm.fileId)) === null);
    check("admin bisa membaca file asesmen", (await findReadableFile(admin, asm.fileId)) !== null);
    await rejects("tentor tidak bisa upload asesmen", () => stu.addAssessment(aulia, S["Alya Putri"], file(PDF, "x.pdf")), /admin/i);
  }

  console.log("\nData milik sendiri saja");
  {
    const list = await stu.listStudents(aulia);
    check("tentor hanya melihat siswanya (Budi)", list.length === 1 && list[0].nama === "Budi Utama", JSON.stringify(list.map((s) => s.nama)));
    check("baris program tentor hanya yang ia ampu", list.every((s) => s.student_programs.every((p) => p.tutor_id === aulia.id)));
    const s = await ses.listSessions(aulia, { from: "2020-01-01", to: "2030-12-31" });
    check("tentor hanya melihat sesi miliknya", s.length > 0 && s.every((x) => x.tutor_id === aulia.id));
    const s2 = await ses.listSessions(aulia, { from: "2020-01-01", to: "2030-12-31", tutor: rina.id });
    check("filter tutor lain diabaikan untuk tentor", s2.every((x) => x.tutor_id === aulia.id));
    const { rows: r } = await rep.listReports(aulia);
    check("tentor hanya melihat laporannya", r.every((x) => x.profiles?.nama === "Kak Aulia"));
    const { rows: r2 } = await rep.listReports(rina);
    check("tentor lain tidak melihat laporan Aulia", r2.length === 0);
    await rejects("tentor tidak bisa melihat daftar tentor", () => master.listTutors(aulia), /admin/i);
    await rejects("tentor tidak bisa melihat daftar pengguna", () => usr.listUsers(aulia), /Super Admin/i);
  }

  console.log("\nTarif & invoice tertutup untuk tentor");
  {
    await rejects("tentor tidak bisa melihat master tarif", () => master.listProgramsWithTarif(aulia), /admin/i);
    const list = await stu.listStudents(aulia);
    check("data program untuk tentor tanpa tarif", !JSON.stringify(list).includes("tarif"));
    await rejects("tentor tidak bisa melihat invoice", () => inv.listInvoices(aulia), /admin/i);
    await rejects("tentor tidak bisa menerbitkan invoice", () => inv.issueInvoice(aulia, S["Budi Utama"], S["Budi Utama"], []), /admin/i);
    await rejects("tentor tidak bisa membuka PDF invoice", () => inv.getInvoicePdfData(aulia, S["Budi Utama"]), /admin/i);
    check("admin bisa melihat tarif", (await master.listProgramsWithTarif(admin)).length === 4);
  }

  console.log("\nAbsen");
  {
    const mine = (await ses.listSessions(aulia, { from: "2020-01-01", to: "2030-12-31", status: "terjadwal" })).sort((a, b) => a.mulai_at.localeCompare(b.mulai_at));
    const now = mine[0];
    const later = mine[mine.length - 1];
    const [rinaSesi] = await db().select().from(sessions).where(and(eq(sessions.tutorId, rina.id), eq(sessions.statusKehadiran, "terjadwal")));
    const gps = { lat: -7.84, lng: 110.33, akurasi: 9 };
    const filesBefore = (await db().select({ n: count() }).from(files))[0].n;

    await rejects("tentor tidak bisa absen sesi tentor lain", () => ses.submitAttendance(aulia, { sessionId: rinaSesi.id, ...gps, photo: file(JPG, "a.jpg") }), /tidak ditemukan/);
    await rejects("absen di luar jendela waktu ditolak", () => ses.submitAttendance(aulia, { sessionId: later.id, ...gps, photo: file(JPG, "a.jpg") }), /jendela/);
    await rejects("absen tanpa GPS ditolak", () => ses.submitAttendance(aulia, { sessionId: now.id, lat: NaN, lng: NaN, akurasi: NaN, photo: file(JPG, "a.jpg") }), /GPS/);
    await rejects("foto bukan JPEG ditolak", () => ses.submitAttendance(aulia, { sessionId: now.id, ...gps, photo: file(PNG, "a.jpg") }), /Tipe file/);
    await rejects("admin tidak bisa absen atas nama tentor", () => ses.submitAttendance(admin, { sessionId: now.id, ...gps, photo: file(JPG, "a.jpg") }), /tentor/i);
    const filesAfterFail = (await db().select({ n: count() }).from(files))[0].n;
    check("upload yang ditolak tidak meninggalkan file/metadata", filesAfterFail === filesBefore, `${filesBefore} → ${filesAfterFail}`);

    const t = await ses.submitAttendance(aulia, { sessionId: now.id, ...gps, photo: file(JPG, "absen.jpg") });
    const [{ dbNow }] = (await db().execute<{ dbNow: Date }>(sql`select now() as "dbNow"`)).rows;
    check("absen valid berhasil, waktu dari server DB", t instanceof Date && Math.abs(new Date(dbNow).getTime() - t.getTime()) < 60_000);
    await rejects("absen tidak bisa diulang", () => ses.submitAttendance(aulia, { sessionId: now.id, ...gps, photo: file(JPG, "a.jpg") }), /sudah diabsen/);
    const [after] = await db().select().from(sessions).where(eq(sessions.id, now.id));
    check("tentor pemilik bisa membaca foto absennya", (await findReadableFile(aulia, after.fotoFileId!)) !== null);
    check("tentor lain tidak bisa membaca foto itu", (await findReadableFile(rina, after.fotoFileId!)) === null);
    await rejects("tentor tidak bisa override kehadiran", () => ses.setAttendanceStatus(aulia, now.id, "terjadwal", "x"), /admin/i);
    const fotoKey = await keyOf(after.fotoFileId!);
    await ses.setAttendanceStatus(admin, now.id, "terjadwal", "reset demo");
    check("reset ke Terjadwal menghapus foto absen lama (DB + disk)", await fileGone(after.fotoFileId!, fotoKey));
  }

  console.log("\nLaporan, materi & keamanan file");
  {
    const [sp] = (await rep.listMyAssignments(aulia));
    await rejects("upload laporan untuk siswa yang bukan bimbingannya ditolak", () => rep.uploadReport(aulia, { studentId: S["Siti Aminah"], programId: sp.program_id, periode: null, file: file(PDF, "l.pdf") }), /tidak mengampu/);
    await rejects("upload laporan non-PDF ditolak (isi PNG)", () => rep.uploadReport(aulia, { studentId: sp.student_id, programId: sp.program_id, periode: null, file: file(PNG, "l.pdf") }), /Tipe file/);
    await rejects("upload laporan PDF berekstensi .exe ditolak", () => rep.uploadReport(aulia, { studentId: sp.student_id, programId: sp.program_id, periode: null, file: file(PDF, "l.exe") }), /Tipe file/);
    await rep.uploadReport(aulia, { studentId: sp.student_id, programId: sp.program_id, periode: "Uji", file: file(PDF, "laporan.pdf") });
    check("upload laporan valid berhasil", (await rep.listReports(aulia)).rows.some((r) => r.periode === "Uji"));

    // ---- edit laporan (salah upload) ----
    const mineRep = (await rep.listReports(aulia)).rows.find((r) => r.periode === "Uji")!;
    await rejects("tentor lain tidak bisa edit laporan Aulia", () => rep.updateReport(rina, { reportId: mineRep.id, periode: "x", file: null }), /tidak ditemukan/);
    await rejects("edit laporan dengan file non-PDF ditolak", () => rep.updateReport(aulia, { reportId: mineRep.id, periode: "x", file: file(PNG, "a.pdf") }), /Tipe file/);
    const oldRepKey = await keyOf(mineRep.file_id);
    await rep.updateReport(aulia, { reportId: mineRep.id, periode: "Uji (revisi)", file: file(PDF, "revisi.pdf") });
    const ed = (await rep.listReports(aulia)).rows.find((r) => r.id === mineRep.id)!;
    check("tentor bisa edit laporannya + ganti file", ed.periode === "Uji (revisi)" && ed.file_id !== mineRep.file_id && ed.file_name === "revisi.pdf");
    check("tercatat diedit oleh tentor", ed.edited_by === "Kak Aulia" && !!ed.edited_at);
    check("ganti file laporan → file lama terhapus (DB + disk)", await fileGone(mineRep.file_id, oldRepKey));
    await rep.updateReport(admin, { reportId: mineRep.id, periode: "Uji (koreksi admin)", file: null });
    const ed2 = (await rep.listReports(admin, { q: "koreksi admin" })).rows[0];
    check("admin bisa edit laporan tentor, tercatat nama admin", ed2?.edited_by === "Admin Bimbel");
    check("pencarian laporan di DB (q)", (await rep.listReports(admin, { q: "zzz-tidak-ada" })).total === 0);
    const pg = await rep.listReports(admin, { page: 1, pageSize: 1 });
    check("paging laporan di DB (pageSize)", pg.rows.length === 1 && pg.total >= 2);
    check("pencarian aman dari wildcard %", (await rep.listReports(admin, { q: "%" })).total === 0);

    check("tentor bisa membaca file bank materi", (await findReadableFile(aulia, mat0.fileId)) !== null);

    const oldMatKey = await keyOf(mat0.fileId);
    await mat.saveMaterial(admin, { id: mat0.id, judul: "Modul (revisi)", kategori: "Calistung", jenjang: "TK/SD", file: file(PDF, "modul-baru.pdf") });
    const [matNow] = await db().select().from(materials).where(eq(materials.id, mat0.id));
    check("ganti file materi → file lama terhapus (DB + disk)", matNow.fileId !== mat0.fileId && (await fileGone(mat0.fileId, oldMatKey)));
    mat0.fileId = matNow.fileId;

    const oldAsmKey = await keyOf(asm.fileId);
    await stu.addAssessment(admin, asm.studentId, file(PDF, "asesmen-baru.pdf"));
    const asmNow = await db().select().from(studentAssessments).where(eq(studentAssessments.studentId, asm.studentId));
    check("ganti asesmen → hanya 1 dokumen aktif, file lama terhapus", asmNow.length === 1 && (await fileGone(asm.fileId, oldAsmKey)));
    asm.fileId = asmNow[0].fileId;
    await rejects("tentor tidak bisa upload materi", () => mat.saveMaterial(aulia, { judul: "x", kategori: "x", jenjang: "x", file: file(PDF, "x.pdf") }), /admin/i);
    await mat.softDeleteMaterial(admin, mat0.id);
    check("materi yang dihapus tidak bisa dibaca tentor", (await findReadableFile(aulia, mat0.fileId)) === null);
    check("…tapi tetap bisa dibaca admin", (await findReadableFile(admin, mat0.fileId)) !== null);
    await db().update(materials).set({ deletedAt: null }).where(eq(materials.id, mat0.id));

    await rejects("storage menolak path traversal (getFile)", () => getFile("../../etc/passwd"), /tidak valid/);
    await rejects("storage menolak key absolut", () => getFile("/etc/passwd"), /tidak valid/);
    await rejects("storage menolak kategori aneh (saveFile)", () => saveFile({ category: "../x", ext: "pdf", data: PDF }), /tidak valid/);
    check("findReadableFile menolak id bukan uuid", (await findReadableFile(admin, "../../x")) === null);
    const [f] = await db().select().from(files).limit(1);
    check("DB menyimpan key relatif (bukan absolut)", !path.isAbsolute(f.storageKey) && !f.storageKey.includes(".."));
    check("file benar-benar ada di UPLOAD_DIR", existsSync(path.resolve(process.env.UPLOAD_DIR || "/app/uploads", f.storageKey)));
  }

  console.log("\nSuper Admin & aturan peran");
  {
    const base = { nama: "x", role: "admin" as const, status: "aktif" as const };
    await rejects("admin tidak bisa membuat akun", () => usr.createUser(admin, { ...base, email: "z@z.test", password: "12345678" }), /Super Admin/);
    await rejects("admin tidak bisa mengubah peran", () => usr.updateUser(admin, { ...base, id: aulia.id }), /Super Admin/);
    await rejects("admin tidak bisa reset password", () => usr.resetPassword(admin, aulia.id, "12345678"), /Super Admin/);
    await rejects("admin tidak bisa mengedit profil non-tentor lewat edit tentor", () => master.saveTutor(admin, { id: sup.id, nama: "Hacked", spesialisasi: "Hacked spec" }), /tidak ditemukan/);
    await master.saveTutor(admin, { id: aulia.id, nama: "Kak Aulia", spesialisasi: "Calistung, SD Umum", no_wa: "0812-1111-2222" });
    check("admin tetap bisa edit data tentor", true);
    await rejects("Super Admin terakhir tidak bisa diturunkan", () => usr.updateUser(sup, { id: sup.id, nama: "Pak Owner", role: "admin", status: "aktif" }), /minimal satu Super Admin/);
    await rejects("Super Admin terakhir tidak bisa dinonaktifkan", () => usr.updateUser(sup, { id: sup.id, nama: "Pak Owner", role: "super_admin", status: "nonaktif" }), /minimal satu Super Admin/);

    const { token } = await createSession(rina.id);
    await usr.updateUser(sup, { id: rina.id, nama: "Kak Rina", role: "tentor", status: "nonaktif", spesialisasi: "Fisika, Matematika SMP" });
    check("menonaktifkan akun memutus sesi loginnya", (await findSessionUser(token)) === null);
    await rejects("akun nonaktif tidak bisa login", () => usr.authenticate("rina@bimbel.test", "Demo12345!"), /nonaktif/);
    await rejects("actor nonaktif ditolak service", () => stu.listStudents({ ...rina, status: "nonaktif" }), /Sesi tidak valid/);
    await usr.updateUser(sup, { id: rina.id, nama: "Kak Rina", role: "tentor", status: "aktif", spesialisasi: "Fisika, Matematika SMP" });
    const [{ n }] = await db().select({ n: count() }).from(auditLog).where(eq(auditLog.aksi, "ubah_akun"));
    check("perubahan akun tercatat di audit log", n >= 2);
    check("Super Admin punya semua hak admin", (await inv.listInvoices(sup)).total > 0);
    const lunas = await inv.listInvoices(admin, { status: "lunas" });
    check("filter invoice lunas di DB", lunas.rows.every((i) => i.status_bayar === "lunas") && lunas.summary.all >= lunas.total);
  }

  console.log("\nProfil sendiri");
  {
    await rejects("ganti email: password salah ditolak", () => usr.changeOwnEmail(aulia, "aulia2@bimbel.test", "salah"), /Password saat ini salah/);
    await rejects("ganti email: email dipakai akun lain ditolak", () => usr.changeOwnEmail(aulia, "admin@bimbel.test", "Demo12345!"), /sudah dipakai/);
    await usr.changeOwnEmail(aulia, "Aulia.Baru@Bimbel.test", "Demo12345!");
    check("ganti email berhasil, login pakai email baru", typeof (await usr.authenticate("aulia.baru@bimbel.test", "Demo12345!")) === "string");
    const keep = (await createSession(aulia.id)).token;
    const other = (await createSession(aulia.id)).token;
    await rejects("ganti password: password lama salah ditolak", () => usr.changeOwnPassword(aulia, "salah", "PasswordBaru1"), /salah/);
    await usr.changeOwnPassword(aulia, "Demo12345!", "PasswordBaru1", keep);
    check("ganti password: sesi perangkat ini tetap", (await findSessionUser(keep)) !== null);
    check("ganti password: sesi perangkat lain diputus", (await findSessionUser(other)) === null);
    await rejects("password lama tidak bisa login lagi", () => usr.authenticate("aulia.baru@bimbel.test", "Demo12345!"), /salah/);
    await usr.resetPassword(sup, aulia.id, "Demo12345!");
    check("Super Admin bisa reset password user (lupa password)", typeof (await usr.authenticate("aulia.baru@bimbel.test", "Demo12345!")) === "string");
    await usr.changeOwnEmail(aulia, "aulia@bimbel.test", "Demo12345!");
  }

  console.log("\nLogin");
  {
    await rejects("password salah ditolak", () => usr.authenticate("aulia@bimbel.test", "salah"), /salah/);
    await rejects("email tak terdaftar ditolak dengan pesan sama", () => usr.authenticate("tidakada@bimbel.test", "x"), /Email atau password salah/);
    for (let i = 0; i < 8; i++) await usr.authenticate("dimas@bimbel.test", "salah").catch(() => {});
    await rejects("rate limit setelah 8 percobaan", () => usr.authenticate("dimas@bimbel.test", "Demo12345!"), /Terlalu banyak/);
    check("login benar berhasil", typeof (await usr.authenticate("aulia@bimbel.test", "Demo12345!")) === "string");
  }

  const base = process.env.BASE_URL;
  if (base) {
    console.log(`\nHTTP (${base})`);
    const cookie = async (a: Actor) => `bimbel_sid=${(await createSession(a.id)).token}`;
    const get = (url: string, c?: string) => fetch(base + url, { headers: c ? { cookie: c } : {}, redirect: "manual" });
    const cAul = await cookie(aulia);
    const cAdm = await cookie(admin);

    check("tanpa login /api/files → 401", (await get(`/api/files/${asm.fileId}`)).status === 401);
    check("tentor GET asesmen → 404", (await get(`/api/files/${asm.fileId}`, cAul)).status === 404);
    const ra = await get(`/api/files/${asm.fileId}`, cAdm);
    check("admin GET asesmen → 200 PDF", ra.status === 200 && ra.headers.get("content-type") === "application/pdf");
    check("header X-Content-Type-Options: nosniff", ra.headers.get("x-content-type-options") === "nosniff");
    check("isi file benar (streaming)", (await ra.text()).startsWith("%PDF"));
    const rd = await get(`/api/files/${asm.fileId}?download=1`, cAdm);
    check("?download=1 → Content-Disposition attachment", rd.headers.get("content-disposition")?.startsWith("attachment") ?? false);
    check("id traversal → 404", (await get(`/api/files/..%2F..%2Fetc%2Fpasswd`, cAdm)).status === 404);
    check("tentor GET PDF invoice → 403", (await get(`/api/invoices/${S["Budi Utama"]}/pdf`, cAul)).status === 403);

    const fd = new FormData();
    fd.set("session_id", "x");
    fd.set("photo", file(JPG, "a.jpg"));
    const noOrigin = await fetch(base + "/api/attendance", { method: "POST", body: fd, headers: { cookie: cAul } });
    check("POST upload tanpa Origin (CSRF) → 403", noOrigin.status === 403);
    const evil = await fetch(base + "/api/attendance", { method: "POST", body: fd, headers: { cookie: cAul, origin: "https://evil.test" } });
    check("POST upload dari origin lain → 403", evil.status === 403);
    const own = await fetch(base + "/api/assessments", { method: "POST", body: fd, headers: { cookie: cAul, origin: new URL(base).origin } });
    check("tentor POST asesmen → ditolak", own.status === 400 && /admin/i.test((await own.json()).error));
  }

  console.log(`\nHasil: ${pass} lulus, ${fail} gagal`);
  if (fail) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
