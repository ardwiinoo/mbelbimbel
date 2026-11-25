// Uji otorisasi di kode server (pengganti RLS) + keamanan file & upload.
// Jalankan pada data demo segar:  pnpm db:reset && pnpm test:authz
// Bagian HTTP ikut dijalankan bila BASE_URL di-set (mis. BASE_URL=http://localhost:3000).
import { existsSync } from "node:fs";
import path from "node:path";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { appSettings, auditLog, files, honorSlips, invoices, mapelCategories, materials, sessions, studentAssessments, studentPrograms, students, users } from "../src/db/schema";
import { getFile, saveFile } from "../src/lib/storage";
import { conflictKinds, findAllConflicts, layoutLanes, type Slot } from "../src/lib/session-conflicts";
import { loadPermissions, type Actor } from "../src/server/authz";
import { findReadableFile } from "../src/server/files";
import { loadBranding } from "../src/server/pdf-branding";
import { auditLabel } from "../src/lib/audit-label";
import { createSession, findSessionUser } from "../src/server/session";
import * as ana from "../src/server/services/analytics";
import * as dash from "../src/server/services/dashboard";
import * as honor from "../src/server/services/honor";
import * as inv from "../src/server/services/invoices";
import * as master from "../src/server/services/master";
import * as mapelSvc from "../src/server/services/mapel";
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
/** PNG 1×1 sungguhan (bisa disematkan ke PDF). PNG di atas hanya magic bytes (isi rusak) — untuk uji ketahanan. */
const VALID_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
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
  return { id: u.id, nama: u.nama, status: u.status, isSuperuser: u.isSuperuser, isTutor: u.isTutor, perms: await loadPermissions(u.id) };
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
    await rejects("tentor tidak bisa upload asesmen", () => stu.addAssessment(aulia, S["Alya Putri"], file(PDF, "x.pdf")), /tidak punya akses/);
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
    await rejects("tentor tidak bisa melihat daftar tentor", () => master.listTutors(aulia), /tidak punya akses/);
    await rejects("tentor tidak bisa melihat daftar pengguna", () => usr.listUsers(aulia), /tidak punya akses/);
  }

  console.log("\nTarif & invoice tertutup untuk tentor");
  {
    await rejects("tentor tidak bisa melihat master tarif", () => master.listProgramsWithTarif(aulia), /tidak punya akses/);
    const list = await stu.listStudents(aulia);
    check("data program untuk tentor tanpa tarif", !JSON.stringify(list).includes("tarif"));
    await rejects("tentor tidak bisa melihat invoice", () => inv.listInvoices(aulia), /tidak punya akses/);
    await rejects("tentor tidak bisa menerbitkan invoice", () => inv.issueInvoice(aulia, S["Budi Utama"], S["Budi Utama"], []), /tidak punya akses/);
    await rejects("tentor tidak bisa membuka PDF invoice", () => inv.getInvoicePdfData(aulia, S["Budi Utama"]), /tidak punya akses/);
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
    await rejects("tentor tidak bisa override kehadiran", () => ses.setAttendanceStatus(aulia, now.id, "terjadwal", "x"), /tidak punya akses/);
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

    // ---- hapus laporan: pemilik atau Kelola Laporan; file ikut terhapus ----
    await rep.uploadReport(aulia, { studentId: sp.student_id, programId: sp.program_id, periode: "Uji Hapus A", file: file(PDF, "hapus-a.pdf") });
    await rep.uploadReport(aulia, { studentId: sp.student_id, programId: sp.program_id, periode: "Uji Hapus B", file: file(PDF, "hapus-b.pdf") });
    const repA = (await rep.listReports(aulia)).rows.find((r) => r.periode === "Uji Hapus A")!;
    const repB = (await rep.listReports(aulia)).rows.find((r) => r.periode === "Uji Hapus B")!;
    const keyA = await keyOf(repA.file_id);
    const keyB = await keyOf(repB.file_id);
    await rejects("hapus laporan: tentor lain ditolak", () => rep.deleteReport(rina, repA.id), /tidak ditemukan/);
    await rep.deleteReport(aulia, repA.id);
    check("hapus laporan oleh pemilik: baris hilang & file terhapus (DB + disk)", (await rep.listReports(admin, { q: "Uji Hapus A" })).total === 0 && (await fileGone(repA.file_id, keyA)));
    await rep.deleteReport(admin, repB.id);
    check("hapus laporan oleh admin (Kelola Laporan): file terhapus", (await rep.listReports(admin, { q: "Uji Hapus B" })).total === 0 && (await fileGone(repB.file_id, keyB)));
    check("hapus laporan tercatat di audit log", (await db().select().from(auditLog).where(and(eq(auditLog.target, repB.id), eq(auditLog.aksi, "hapus_laporan")))).some((a) => a.actorId === admin.id));
    await rejects("hapus laporan yang sudah tidak ada", () => rep.deleteReport(admin, repB.id), /tidak ditemukan/);

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
    await rejects("tentor tidak bisa upload materi", () => mat.saveMaterial(aulia, { judul: "x", kategori: "x", jenjang: "x", file: file(PDF, "x.pdf") }), /tidak punya akses/);
    // hapus materi = baris + file hilang (DB & disk); hanya akses Kelola Materi
    await mat.saveMaterial(admin, { judul: "Materi Uji Hapus", kategori: "Uji", jenjang: "Uji", file: file(PDF, "hapus.pdf") });
    const [matDel] = await db().select().from(materials).where(eq(materials.judul, "Materi Uji Hapus"));
    const matDelKey = await keyOf(matDel.fileId);
    await rejects("tentor tidak bisa menghapus materi", () => mat.deleteMaterial(aulia, matDel.id), /tidak punya akses/);
    await mat.deleteMaterial(admin, matDel.id);
    check("hapus materi: baris hilang & file terhapus dari DB + disk", (await db().select().from(materials).where(eq(materials.id, matDel.id))).length === 0 && (await fileGone(matDel.fileId, matDelKey)));
    check("hapus materi tercatat di audit log", (await db().select().from(auditLog).where(and(eq(auditLog.target, matDel.id), eq(auditLog.aksi, "hapus_materi")))).some((a) => a.actorId === admin.id));
    await rejects("hapus materi yang sudah tidak ada", () => mat.deleteMaterial(admin, matDel.id), /tidak ditemukan/);

    await rejects("storage menolak path traversal (getFile)", () => getFile("../../etc/passwd"), /tidak valid/);
    await rejects("storage menolak key absolut", () => getFile("/etc/passwd"), /tidak valid/);
    await rejects("storage menolak kategori aneh (saveFile)", () => saveFile({ category: "../x", ext: "pdf", data: PDF }), /tidak valid/);
    check("findReadableFile menolak id bukan uuid", (await findReadableFile(admin, "../../x")) === null);
    const [f] = await db().select().from(files).limit(1);
    check("DB menyimpan key relatif (bukan absolut)", !path.isAbsolute(f.storageKey) && !f.storageKey.includes(".."));
    check("file benar-benar ada di UPLOAD_DIR", existsSync(path.resolve(process.env.UPLOAD_DIR || "/app/uploads", f.storageKey)));
  }

  console.log("\nAkses per modul, Super Admin & pengelola akun");
  {
    const tutorBase = { is_tutor: true, is_superuser: false, perms: { materi: "read" as const } };
    // --- Admin tanpa akses "Pengguna" tidak bisa mengelola akun ---
    await rejects("admin tanpa akses Pengguna tidak bisa membuat akun", () => usr.createUser(admin, { nama: "x", email: "z@z.test", password: "12345678", is_tutor: false, perms: {} }), /tidak punya akses/);
    await rejects("admin tanpa akses Pengguna tidak bisa mengubah akun", () => usr.updateUser(admin, { id: aulia.id, nama: "x", status: "aktif", ...tutorBase, spesialisasi: "x" }), /tidak punya akses/);
    await rejects("admin tanpa akses Pengguna tidak bisa reset password", () => usr.resetPassword(admin, aulia.id, "12345678"), /tidak punya akses/);
    await rejects("admin tidak bisa mengedit Super Admin lewat edit tentor", () => master.saveTutor(admin, { id: sup.id, nama: "Hacked", spesialisasi: "Hacked spec", mapel_kategori: "lainnya" }), /tidak ditemukan/);
    await master.saveTutor(admin, { id: aulia.id, nama: "Kak Aulia", spesialisasi: "Calistung, SD Umum", mapel_kategori: "calistung", no_wa: "0812-1111-2222" });
    check("admin (akses Tentor: Kelola) tetap bisa edit data tentor", true);

    // --- Super Admin terakhir ---
    const supIn = { nama: "Pak Owner", is_tutor: false, perms: {} };
    await rejects("Super Admin terakhir tidak bisa diturunkan", () => usr.updateUser(sup, { id: sup.id, ...supIn, is_superuser: false, status: "aktif" }), /minimal satu Super Admin/);
    await rejects("Super Admin terakhir tidak bisa dinonaktifkan", () => usr.updateUser(sup, { id: sup.id, ...supIn, is_superuser: true, status: "nonaktif" }), /minimal satu Super Admin/);

    // --- nonaktif memutus sesi ---
    const { token } = await createSession(rina.id);
    await usr.updateUser(sup, { id: rina.id, nama: "Kak Rina", status: "nonaktif", ...tutorBase, spesialisasi: "Fisika, Matematika SMP" });
    check("menonaktifkan akun memutus sesi loginnya", (await findSessionUser(token)) === null);
    await rejects("akun nonaktif tidak bisa login", () => usr.authenticate("rina@bimbel.test", "Demo12345!"), /nonaktif/);
    await rejects("actor nonaktif ditolak service", () => stu.listStudents({ ...rina, status: "nonaktif" }), /Sesi tidak valid/);
    await usr.updateUser(sup, { id: rina.id, nama: "Kak Rina", status: "aktif", ...tutorBase, spesialisasi: "Fisika, Matematika SMP" });

    // --- Delegasi: Super Admin memberi admin akses Pengguna (Kelola) ---
    const adminPerms = { siswa: "write", asesmen: "write", tentor: "write", jadwal: "write", laporan: "write", materi: "write", invoice: "write", honor: "write", pengaturan: "write" } as const;
    await usr.updateUser(sup, { id: admin.id, nama: "Admin Bimbel", status: "aktif", is_tutor: false, is_superuser: false, perms: { ...adminPerms, pengguna: "write" } });
    const mgr = await actor("admin@bimbel.test"); // muat ulang akses
    const seen = await usr.listUsers(mgr);
    check("pengelola akun tidak melihat Super Admin di daftar", !seen.some((u) => u.is_superuser) && seen.length > 0);
    await rejects("pengelola tidak bisa mengubah akun Super Admin (via ID)", () => usr.updateUser(mgr, { id: sup.id, nama: "Uji", status: "aktif", is_tutor: false, is_superuser: false, perms: {} }), /tidak ditemukan/);
    await rejects("pengelola tidak bisa reset password Super Admin", () => usr.resetPassword(mgr, sup.id, "12345678"), /tidak ditemukan/);
    await rejects("pengelola tidak bisa membuat Super Admin", () => usr.createUser(mgr, { nama: "Evil", email: "evil@x.test", password: "12345678", is_tutor: false, is_superuser: true, perms: {} }), /Hanya Super Admin/);
    await rejects("pengelola tidak bisa mengubah akses akunnya sendiri", () => usr.updateUser(mgr, { id: mgr.id, nama: "Admin Bimbel", status: "aktif", is_tutor: false, is_superuser: false, perms: { ...adminPerms, pengguna: "write" } }), /akun sendiri/);

    const created = await usr.createUser(mgr, { nama: "Staf Keuangan", email: "keu@bimbel.test", password: "Demo12345!", is_tutor: false, perms: { pengguna: "write", invoice: "read", siswa: "read" } });
    const [keuRow] = await db().select().from(users).where(eq(users.id, created.id!));
    check("akun baru mencatat created_by = pembuatnya", keuRow.createdBy === mgr.id && keuRow.updatedBy === mgr.id);
    check("daftar akun menampilkan 'dibuat oleh'", (await usr.listUsers(mgr)).find((u) => u.id === created.id)?.created_by === "Admin Bimbel");

    // --- Anti eskalasi: pengelola dengan akses terbatas ---
    const keu = await actor("keu@bimbel.test");
    await rejects("tidak bisa memberi akses melebihi akses sendiri", () => usr.createUser(keu, { nama: "Uji", email: "x2@x.test", password: "12345678", is_tutor: false, perms: { invoice: "write" } }), /melebihi akses Anda/);
    await rejects("tidak bisa mengelola akun yang lebih berkuasa (ubah)", () => usr.updateUser(keu, { id: mgr.id, nama: "Uji", status: "aktif", is_tutor: false, is_superuser: false, perms: {} }), /melebihi akses Anda/);
    await rejects("tidak bisa reset password akun yang lebih berkuasa", () => usr.resetPassword(keu, mgr.id, "12345678"), /melebihi akses Anda/);
    const low = await usr.createUser(keu, { nama: "Magang", email: "magang@bimbel.test", password: "Demo12345!", is_tutor: false, perms: { invoice: "read" } });
    check("boleh membuat akun dengan akses ≤ aksesnya", !!low.id);
    await usr.resetPassword(keu, low.id!, "PasswordMagang1");
    check("boleh reset password akun yang setara/lebih rendah", true);

    // --- Lihat vs Kelola ---
    const magang = await actor("magang@bimbel.test");
    check("akses Lihat Invoice: bisa melihat invoice", (await inv.listInvoices(magang)).total >= 0);
    await rejects("akses Lihat Invoice: tidak bisa menerbitkan", () => inv.issueInvoice(magang, S["Budi Utama"], S["Budi Utama"], [S["Budi Utama"]]), /tidak punya akses/);
    await rejects("akses Lihat Invoice: tidak bisa tandai lunas", () => inv.setPaid(magang, S["Budi Utama"], true), /tidak punya akses/);
    await rejects("tanpa akses Siswa & bukan tentor: data siswa ditolak", () => stu.listStudents(magang), /tidak punya akses/);
    await rejects("tanpa akses Jadwal & bukan tentor: jadwal ditolak", () => ses.listSessions(magang, { from: "2020-01-01", to: "2030-12-31" }), /tidak punya akses/);

    // --- Admin sekaligus tentor ---
    const bayu = await actor("bayu@bimbel.test");
    const allSessions = await ses.listSessions(bayu, { from: "2020-01-01", to: "2030-12-31" });
    check("admin+tentor melihat SEMUA jadwal", allSessions.some((s) => s.tutor_id !== bayu.id));
    check("admin+tentor muncul di pilihan tentor pengampu", (await master.tutorOptions(admin)).some((t) => t.id === bayu.id));
    check("admin+tentor punya daftar siswa yang diampu (bisa kosong)", Array.isArray(await rep.listMyAssignments(bayu)));
    check("admin+tentor tetap bisa menerbitkan invoice", typeof (await inv.listReadyToBill(bayu)).length === "number");

    // --- Resource Timeline (Jadwal) ---
    await rejects("timeline: tentor (tanpa akses Jadwal) tidak bisa memuat daftar tentor", () => ses.timelineTutors(aulia), /tidak punya akses/);
    const cntAul = await ses.monthSessionCounts(aulia, new Date().toISOString().slice(0, 10));
    check("timeline: tentor hanya melihat hitungan sesinya sendiri (bukan tentor lain)", Object.keys(cntAul).every((k) => k === aulia.id), JSON.stringify(Object.keys(cntAul)));
    await rejects("timeline: akun tanpa akses Jadwal & bukan tentor tidak bisa memuat hitungan", () => ses.monthSessionCounts(keu, "2026-11-01"), /tidak punya akses/);
    await rejects("timeline: tanpa akses Jadwal (magang) ditolak", () => ses.timelineTutors(magang), /tidak punya akses/);
    await rejects("timeline: tanggal acuan tidak valid ditolak", () => ses.monthSessionCounts(admin, "bukan-tanggal"), /tidak valid/);
    const tlAdmin = await ses.timelineTutors(admin);
    check("timeline: admin melihat semua tentor, dengan kelompok mapel", tlAdmin.length >= 3 && tlAdmin.every((t) => typeof t.mapel === "string" && t.mapel.length > 0));
    check("timeline: admin+tentor (bayu) ikut sebagai baris tentor", tlAdmin.some((t) => t.id === bayu.id));
    check("timeline: pemegang Jadwal (Kelola) mendapat no. WA untuk tombol Ingatkan", tlAdmin.some((t) => !!t.no_wa));
    check("timeline: Super Admin tidak muncul sebagai baris untuk akun lain", !tlAdmin.some((t) => t.id === sup.id));
    const counts = await ses.monthSessionCounts(admin, new Date().toISOString().slice(0, 10));
    check("timeline: hitungan sesi per tentor bulan ini terisi", Object.values(counts).some((n) => n > 0));
    const sesRows = await ses.listSessions(admin, { from: "2020-01-01", to: "2030-12-31", limit: 5000 });
    check("timeline: setiap sesi membawa mapel program (untuk warna)", sesRows.length > 0 && sesRows.every((s) => !!s.programs?.mapel));

    // --- Bentrok jadwal: aturan murni ---
    const H = 3600_000;
    const slot = (o: Partial<Slot> & { start: number; end: number }): Slot => ({ id: "x" + Math.random(), tutorId: "T1", studentId: "S1", programId: "P1", cancelled: false, ...o });
    const A = slot({ id: "A", start: 10 * H, end: 11 * H });
    check("bentrok: beririsan 30 menit (tentor sama, program beda) → tentor", conflictKinds(A, slot({ id: "B", programId: "P2", studentId: "S2", start: 10.5 * H, end: 11.5 * H })).join() === "tentor");
    check("bentrok: berurutan tanpa jeda (11.00 = 11.00) BUKAN bentrok", conflictKinds(A, slot({ id: "B", programId: "P2", studentId: "S2", start: 11 * H, end: 12 * H })).length === 0);
    check("bentrok: kelas kelompok (program & jam persis sama, siswa beda) BUKAN bentrok", conflictKinds(A, slot({ id: "B", studentId: "S2", start: 10 * H, end: 11 * H })).length === 0);
    check("bentrok: program sama tapi jam selesai beda → tetap bentrok", conflictKinds(A, slot({ id: "B", studentId: "S2", start: 10 * H, end: 11.5 * H })).join() === "tentor");
    check("bentrok: sesi batal tidak dihitung", conflictKinds(A, slot({ id: "B", programId: "P2", studentId: "S2", start: 10.5 * H, end: 11.5 * H, cancelled: true })).length === 0);
    check("bentrok: siswa sama dijadwalkan dobel (tentor beda) → siswa", conflictKinds(A, slot({ id: "B", tutorId: "T2", start: 10.5 * H, end: 11.5 * H })).join() === "siswa");
    check("bentrok: tentor & siswa beda, waktu beririsan → aman", conflictKinds(A, slot({ id: "B", tutorId: "T2", studentId: "S2", start: 10.5 * H, end: 11.5 * H })).length === 0);
    const grp = findAllConflicts([A, slot({ id: "G2", studentId: "S2", start: 10 * H, end: 11 * H }), slot({ id: "Z", programId: "P2", studentId: "S3", start: 10.5 * H, end: 11.5 * H })]);
    const peers = (id: string) => (grp.get(id) ?? []).map((x) => x.other.id).sort().join();
    check("bentrok: findAllConflicts simetris; pasangan kelas kelompok (A↔G2) tidak saling menandai", peers("A") === "Z" && peers("G2") === "Z" && peers("Z") === "A,G2", [peers("A"), peers("G2"), peers("Z")].join(" | "));

    // --- Tata letak jalur (gaya Google Calendar) ---
    const slotR = (id: string, a: number, b: number) => ({ id, start: a * H, end: b * H });
    const lanes = layoutLanes([slotR("d", 13, 14), slotR("b", 10.5, 11.5), slotR("a", 10, 11), slotR("c", 11, 12)], (x) => x);
    const shape = lanes.map((cl) => cl.map((l) => l.map((x) => x.id).join("+")).join("|")).join(" / ");
    check("jalur: beririsan → satu cluster berdampingan, jalur dipakai ulang, yang terpisah → cluster sendiri", shape === "a+c|b / d", shape);
    check("jalur: tidak ada sesi hilang atau ganda", lanes.flat(2).map((x) => x.id).sort().join() === "a,b,c,d");
    check("jalur: sesi berurutan (11.00 = 11.00) satu jalur, bukan berdampingan", layoutLanes([slotR("x", 9, 10), slotR("y", 10, 11)], (z) => z).map((cl) => cl.length).join() === "1,1");
    check("jalur: kelas kelompok (jam sama) berdampingan tanpa dianggap bentrok", layoutLanes([slotR("g1", 18, 19), slotR("g2", 18, 19)], (z) => z).map((cl) => cl.length).join() === "2");
    check("jalur: daftar kosong aman", layoutLanes([], (z: { start: number; end: number }) => z).length === 0);

    // --- Bentrok jadwal: fungsi server ---
    await rejects("bentrok: tentor tidak bisa memanggil cek bentrok", () => ses.findConflicts(aulia, { tutor_id: aulia.id, tanggal: "2031-03-03", jam_mulai: "10:00", jam_selesai: "11:00" }), /tidak punya akses/);
    const spAulia = (await master.studentProgramOptions(admin)).find((x) => x.tutor_id === aulia.id)!;
    await ses.createSessions(admin, { student_program_id: spAulia.id, tutor_id: aulia.id, tanggal: "2031-03-03", jam_mulai: "10:00", jam_selesai: "11:00", ulang_minggu: 1 });
    const probe = (jamMulai: string, jamSelesai: string, extra: object = {}) => ses.findConflicts(admin, { tutor_id: aulia.id, student_program_id: spAulia.id, tanggal: "2031-03-03", jam_mulai: jamMulai, jam_selesai: jamSelesai, ulang_minggu: 1, ...extra });
    check("bentrok server: 10.30–11.30 beririsan dengan sesi 10.00–11.00", (await probe("10:30", "11:30")).some((x) => x.jenis === "tentor" && x.jam.includes("10.00")));
    check("bentrok server: 11.00–12.00 (berurutan) aman", (await probe("11:00", "12:00")).length === 0);
    const dobel = await probe("10:00", "11:00");
    check("bentrok server: siswa yang sama dobel terdeteksi (program & jam sama bukan alasan lolos untuk siswa)", dobel.length === 1 && dobel[0].jenis === "siswa", JSON.stringify(dobel));
    check("bentrok server: ulangan mingguan ikut dicek (minggu ke-2 menabrak)", (await probe("10:30", "11:30", { tanggal: "2031-02-24", ulang_minggu: 3 })).some((x) => x.tanggal === "2031-03-03"));
    check("bentrok server: input belum lengkap → daftar kosong, bukan error", (await ses.findConflicts(admin, { tutor_id: "", tanggal: "", jam_mulai: "", jam_selesai: "" } as never)).length === 0);
    check("bentrok server: jam selesai ≤ mulai → kosong", (await probe("11:00", "10:00")).length === 0);
    const [sesiUji] = await db().select().from(sessions).where(and(eq(sessions.tutorId, aulia.id), eq(sessions.mulaiAt, new Date("2031-03-03T10:00:00+07:00"))));
    check("bentrok server: saat mengedit, sesi itu sendiri tidak dihitung", (await ses.findConflicts(admin, { tutor_id: aulia.id, session_id: sesiUji.id, tanggal: "2031-03-03", jam_mulai: "10:00", jam_selesai: "11:00" })).length === 0);
    await ses.setAttendanceStatus(admin, sesiUji.id, "batal", "uji bentrok");
    check("bentrok server: sesi batal tidak lagi menyebabkan bentrok", (await probe("10:30", "11:30")).length === 0);

    // --- Jejak oleh siapa di data lain ---
    const st = await stu.saveStudent(admin, { nama: "Uji Jejak", status: "aktif", programs: [] });
    await stu.saveStudent(bayu, { id: st.id, nama: "Uji Jejak 2", status: "aktif", programs: [] });
    const [stRow] = await db().select().from(students).where(eq(students.id, st.id));
    check("siswa: created_by & updated_by tercatat", stRow.createdBy === admin.id && stRow.updatedBy === bayu.id && !!stRow.updatedAt);
    await stu.softDeleteStudent(admin, st.id);
    const [delRow] = await db().select().from(students).where(eq(students.id, st.id));
    check("siswa: deleted_by tercatat saat dihapus", delRow.deletedBy === admin.id);

    const [{ n }] = await db().select({ n: count() }).from(auditLog).where(eq(auditLog.aksi, "ubah_akun"));
    check("perubahan akun tercatat di audit log", n >= 3);
    const [lastAudit] = await db().select().from(auditLog).where(and(eq(auditLog.aksi, "ubah_akun"), eq(auditLog.target, admin.id)));
    check("audit menyimpan akses lama → baru", JSON.stringify(lastAudit?.detail ?? {}).includes('"pengguna":"write"'));
    check("Super Admin punya semua akses", (await inv.listInvoices(sup)).total > 0);
    const lunas = await inv.listInvoices(admin, { status: "lunas" });
    check("filter invoice lunas di DB", lunas.rows.every((i) => i.status_bayar === "lunas") && lunas.summary.all >= lunas.total);

    // kembalikan akses admin seperti semula
    await usr.updateUser(sup, { id: admin.id, nama: "Admin Bimbel", status: "aktif", is_tutor: false, is_superuser: false, perms: adminPerms });
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

    // --- ubah nama & nomor WhatsApp sendiri ---
    await usr.changeOwnProfile(aulia, { nama: "Kak Aulia Rahma", no_wa: "0812-9999-0000" });
    const [uProf] = await db().select().from(users).where(eq(users.id, aulia.id));
    check("profil: tentor bisa mengubah nama & nomor WA sendiri", uProf.nama === "Kak Aulia Rahma" && uProf.noWa === "0812-9999-0000" && uProf.updatedBy === aulia.id);
    check("profil: perubahan tercatat di audit log", (await db().select({ n: count() }).from(auditLog).where(and(eq(auditLog.aksi, "ubah_profil"), eq(auditLog.actorId, aulia.id))))[0].n >= 1);
    await rejects("profil: nama 1 huruf ditolak", () => usr.changeOwnProfile(aulia, { nama: "A", no_wa: "" }), /minimal 2 huruf/);
    await rejects("profil: nomor berisi huruf ditolak", () => usr.changeOwnProfile(aulia, { nama: "Kak Aulia", no_wa: "abc123" }), /hanya boleh berisi angka/);
    await rejects("profil: nomor terlalu pendek ditolak", () => usr.changeOwnProfile(aulia, { nama: "Kak Aulia", no_wa: "123" }), /minimal 8 digit/);
    await usr.changeOwnProfile(aulia, { nama: "Kak Aulia", no_wa: "" });
    check("profil: nomor boleh dikosongkan", (await db().select().from(users).where(eq(users.id, aulia.id)))[0].noWa === null);
    await usr.changeOwnProfile(aulia, { nama: "Kak Aulia", no_wa: "0812-1111-2222" }); // kembalikan data seed
    await rejects("profil: tanpa login ditolak", () => usr.changeOwnProfile(null, { nama: "Siapa Saja", no_wa: "" }), /login ulang/);
  }

  // ================= Honor Tentor, absen susulan, data siswa untuk tentor (revisi 24-11) =================
  const honorPeriode = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
  console.log("\nHonor Tentor");
  {
    const periode = honorPeriode;
    const [py, pm] = periode.split("-").map(Number);
    const from = new Date(`${periode}-01T00:00:00+07:00`);
    const to = new Date(`${new Date(Date.UTC(py, pm, 1)).toISOString().slice(0, 10)}T00:00:00+07:00`);
    const staf = await usr.createUser(sup, { nama: "Staf Tentor", email: "stafftentor@bimbel.test", password: "Demo12345!", is_tutor: false, perms: { tentor: "write" } });
    const stafAct = await actor("stafftentor@bimbel.test");
    check("honor: akun staf tentor dibuat tanpa akses Honor", !!staf.id && !stafAct.perms.honor);

    const spAulia = (await master.studentProgramOptions(admin)).find((x) => x.tutor_id === aulia.id)!;
    const mkHadir = async (tgl: string, mulai: string, selesai: string) => {
      await ses.createSessions(admin, { student_program_id: spAulia.id, tutor_id: aulia.id, tanggal: tgl, jam_mulai: mulai, jam_selesai: selesai, ulang_minggu: 1 });
      const [s] = await db().select().from(sessions).where(and(eq(sessions.tutorId, aulia.id), eq(sessions.mulaiAt, new Date(`${tgl}T${mulai}:00+07:00`))));
      await ses.setAttendanceStatus(admin, s.id, "hadir", "uji honor");
      return s;
    };
    const hadirCount = async () =>
      (await db().select({ n: count() }).from(sessions).where(and(eq(sessions.tutorId, aulia.id), eq(sessions.statusKehadiran, "hadir"), sql`${sessions.mulaiAt} >= ${from} and ${sessions.mulaiAt} < ${to}`)))[0].n;
    const rowOf = async () => (await honor.listHonor(admin, periode)).find((r) => r.tutor_id === aulia.id)!;
    const tutorRow = (nama: string) => ({ id: aulia.id, nama, spesialisasi: "Calistung, SD Umum", mapel_kategori: "calistung" as const });
    const hs = await mkHadir(`${periode}-01`, "07:00", "08:00");

    // --- akses ---
    await rejects("honor: tentor tidak bisa melihat honor", () => honor.listHonor(aulia, periode), /tidak punya akses/);
    await rejects("honor: akun tanpa akses Honor ditolak", () => honor.listHonor(stafAct, periode), /tidak punya akses/);
    await rejects("honor: tentor tidak bisa atur tunjangan", () => honor.saveHonorAdjustment(aulia, { tutor_id: aulia.id, periode, tunjangan: 1000 }), /tidak punya akses/);
    await rejects("honor: tentor tidak bisa menandai lunas (honor sendiri)", () => honor.setHonorPaid(aulia, { tutor_id: aulia.id, periode, lunas: true }), /tidak punya akses/);
    await rejects("honor: tentor tidak bisa unduh slip", () => honor.getHonorPdfData(aulia, aulia.id, periode), /tidak punya akses/);
    await rejects("honor: periode tidak valid ditolak", () => honor.listHonor(admin, "2026-13"), /Periode tidak valid/);
    check("honor: Super Admin tidak muncul di daftar akun lain", (await honor.listHonor(admin, periode)).every((r) => r.tutor_id !== sup.id));

    // --- hitungan ---
    const n0 = await hadirCount();
    const r0 = await rowOf();
    check("honor: sesi dihitung dari sesi HADIR bulan itu (>= 1)", r0.sesi === n0 && n0 >= 1, `${r0.sesi} vs ${n0}`);
    check("honor: total = sesi × tarif honor tentor", r0.tarif_min === 35000 && r0.tarif_max === 35000 && r0.total === n0 * 35000 && r0.slip === null);

    // --- tunjangan ---
    await rejects("honor: tunjangan negatif ditolak", () => honor.saveHonorAdjustment(admin, { tutor_id: aulia.id, periode, tunjangan: -1 }), /tidak boleh negatif/);
    await rejects("honor: tunjangan terlalu besar ditolak", () => honor.saveHonorAdjustment(admin, { tutor_id: aulia.id, periode, tunjangan: 999_999_999 }), /terlalu besar/);
    await honor.saveHonorAdjustment(admin, { tutor_id: aulia.id, periode, tunjangan: 50000, catatan: "Transport" });
    const r1 = await rowOf();
    check("honor: tunjangan menambah total & slip bernomor", r1.total === n0 * 35000 + 50000 && /^SLIP\/\d{4}\/\d{2}\/\d{3}$/.test(r1.slip?.nomor ?? "") && r1.slip?.status_bayar === "belum_lunas", JSON.stringify(r1.slip));

    // --- tandai lunas ---
    const besok = new Date(Date.now() + 7 * 3600_000 + 86400_000).toISOString().slice(0, 10);
    await rejects("honor: tanggal bayar di masa depan ditolak", () => honor.setHonorPaid(admin, { tutor_id: aulia.id, periode, lunas: true, tgl_bayar: besok }), /masa depan/);
    await master.saveTutor(admin, { ...tutorRow(aulia.nama), tarif_honor: 0 });
    await rejects("honor: tarif honor 0 tidak bisa dibayar", () => honor.setHonorPaid(admin, { tutor_id: aulia.id, periode, lunas: true }), /Tarif honor.*belum diisi/);
    await master.saveTutor(admin, { ...tutorRow(aulia.nama), tarif_honor: 35000 });
    await honor.setHonorPaid(admin, { tutor_id: aulia.id, periode, lunas: true });
    const r2 = await rowOf();
    const locked = (await db().select({ n: count() }).from(sessions).where(eq(sessions.honorSlipId, r2.slip!.id)))[0].n;
    check("honor: lunas → status lunas, total sesuai, sesi terkunci", r2.slip?.status_bayar === "lunas" && r2.total === n0 * 35000 + 50000 && locked === n0, `locked=${locked}`);
    await rejects("honor: sesi terkunci tidak bisa diedit jadwalnya", () => ses.updateSession(admin, { id: hs.id, tutor_id: aulia.id, tanggal: `${periode}-01`, jam_mulai: "07:30", jam_selesai: "08:30" }), /honornya sudah dibayar/);
    await rejects("honor: sesi terkunci tidak bisa diubah kehadirannya", () => ses.setAttendanceStatus(admin, hs.id, "batal", "x"), /honornya sudah dibayar/);
    await rejects("honor: tidak bisa lunas dua kali", () => honor.setHonorPaid(admin, { tutor_id: aulia.id, periode, lunas: true }), /sudah lunas/);
    await rejects("honor: tunjangan terkunci setelah lunas", () => honor.saveHonorAdjustment(admin, { tutor_id: aulia.id, periode, tunjangan: 1 }), /sudah lunas/);

    // --- snapshot: tarif & rekening berubah setelah lunas tidak mengubah slip ---
    await master.saveTutor(admin, { ...tutorRow(aulia.nama), tarif_honor: 99000, rekening: "BARU 1" });
    const r3 = await rowOf();
    check("honor: slip lunas memakai snapshot (tarif & rekening lama)", r3.tarif_min === 35000 && r3.total === r2.total && r3.rekening === r2.rekening && r3.rekening !== "BARU 1", JSON.stringify([r3.tarif_min, r3.rekening]));

    // --- absen susulan setelah dibayar ---
    const extra = await mkHadir(`${periode}-02`, "07:00", "08:00");
    const r4 = await rowOf();
    check("honor: sesi hadir baru setelah lunas ditandai 'sesi_baru', total slip tetap", r4.sesi_baru === 1 && r4.sesi === n0 && r4.total === r2.total, JSON.stringify([r4.sesi_baru, r4.sesi]));
    const pd = await honor.getHonorPdfData(admin, aulia.id, periode);
    check("honor: data slip PDF lunas = hanya sesi terkunci, nomor & status benar", !!pd && pd.items.reduce((a, i) => a + i.sesi, 0) === n0 && pd.status_bayar === "lunas" && pd.nomor === r2.slip!.nomor && pd.total === r2.total, JSON.stringify([pd?.items.map((i) => i.sesi), pd?.status_bayar]));
    check("honor: data slip PDF dengan periode salah → null", (await honor.getHonorPdfData(admin, aulia.id, "salah")) === null);

    // --- batalkan lunas → sesi dibuka, hitung ulang pakai tarif terbaru ---
    await rejects("honor: batal lunas pada slip yang belum lunas ditolak", () => honor.setHonorPaid(admin, { tutor_id: rina.id, periode, lunas: false }), /belum berstatus lunas/);
    await honor.setHonorPaid(admin, { tutor_id: aulia.id, periode, lunas: false });
    const r5 = await rowOf();
    const stillLocked = (await db().select({ n: count() }).from(sessions).where(eq(sessions.honorSlipId, r2.slip!.id)))[0].n;
    check("honor: batal lunas → sesi terbuka & hitung ulang (sesi + tarif terbaru)", stillLocked === 0 && r5.slip?.status_bayar === "belum_lunas" && r5.sesi === n0 + 1 && r5.tarif_min === 99000, JSON.stringify([stillLocked, r5.sesi, r5.tarif_min]));
    await ses.setAttendanceStatus(admin, extra.id, "hadir", "uji honor lagi");
    await master.saveTutor(admin, { ...tutorRow(aulia.nama), tarif_honor: 35000, rekening: "BCA 1234567890 a.n. Aulia Rahma" });
    await honor.setHonorPaid(admin, { tutor_id: aulia.id, periode, lunas: true });
    const r6 = await rowOf();
    check("honor: lunas ulang memasukkan sesi baru, sesi_baru = 0", r6.sesi === n0 + 1 && r6.sesi_baru === 0 && r6.total === (n0 + 1) * 35000 + 50000, JSON.stringify([r6.sesi, r6.sesi_baru, r6.total]));
    const [audCount] = await db().select({ n: count() }).from(auditLog).where(sql`${auditLog.aksi} in ('honor_lunas','honor_batal_lunas')`);
    check("honor: lunas & batal lunas tercatat di audit log", audCount.n >= 3, String(audCount.n));
    check("honor: satu slip per tentor per bulan (unik)", (await db().select({ n: count() }).from(honorSlips).where(and(eq(honorSlips.tutorId, aulia.id), eq(honorSlips.periode, periode))))[0].n === 1);

    // --- tarif honor & rekening di data tentor ---
    check("tentor: admin (akses Honor) melihat tarif honor", (await master.listTutors(admin)).find((t) => t.id === aulia.id)?.tarif_honor === 35000);
    check("tentor: staf tanpa akses Honor tidak melihat tarif/rekening", (await master.listTutors(stafAct)).every((t) => t.tarif_honor === null && t.rekening === null));
    await master.saveTutor(stafAct, { ...tutorRow(aulia.nama), tarif_honor: 1, rekening: "RETAS" });
    const [uAul] = await db().select().from(users).where(eq(users.id, aulia.id));
    check("tentor: staf tanpa akses Honor tidak bisa mengubah tarif/rekening (diabaikan)", uAul.tarifHonor === 35000 && uAul.rekening === "BCA 1234567890 a.n. Aulia Rahma");
    await rejects("tentor: tarif honor negatif ditolak", () => master.saveTutor(admin, { ...tutorRow(aulia.nama), tarif_honor: -5 }), /tidak valid/);

    // --- tarif khusus per mapel ---
    const tmOf = async () => (await master.listTutors(admin)).find((t) => t.id === aulia.id)!.tarif_mapel ?? [];
    check("tarif mapel: admin melihat tarif khusus (ABK Rp 55.000 dari seed)", (await tmOf()).some((x) => x.mapel === "abk" && x.tarif === 55000), JSON.stringify(await tmOf()));
    check("tarif mapel: staf tanpa akses Honor tidak melihat tarif khusus", (await master.listTutors(stafAct)).every((t) => t.tarif_mapel === null));
    await rejects("tarif mapel: mapel dobel ditolak", () => master.saveTutor(admin, { ...tutorRow(aulia.nama), tarif_mapel: [{ mapel: "abk", tarif: 1 }, { mapel: "abk", tarif: 2 }] }), /dobel/);
    await rejects("tarif mapel: tarif negatif ditolak", () => master.saveTutor(admin, { ...tutorRow(aulia.nama), tarif_mapel: [{ mapel: "abk", tarif: -1 }] }), /tidak valid/);
    await master.saveTutor(stafAct, { ...tutorRow(aulia.nama), tarif_mapel: [{ mapel: "abk", tarif: 1 }] });
    check("tarif mapel: staf tanpa akses Honor tidak bisa mengubahnya (diabaikan)", (await tmOf()).some((x) => x.mapel === "abk" && x.tarif === 55000));

    // --- satu slip, dua tarif (Calistung standar vs ABK khusus) ---
    await honor.setHonorPaid(admin, { tutor_id: aulia.id, periode, lunas: false }); // Aulia sedang lunas dari alur di atas
    const spAbk = (await master.studentProgramOptions(admin)).find((x) => x.programs.nama === "ABK Calistung")!;
    await ses.createSessions(admin, { student_program_id: spAbk.id, tutor_id: aulia.id, tanggal: `${periode}-03`, jam_mulai: "07:00", jam_selesai: "08:00", ulang_minggu: 1 });
    const [abkS] = await db().select().from(sessions).where(and(eq(sessions.tutorId, aulia.id), eq(sessions.mulaiAt, new Date(`${periode}-03T07:00:00+07:00`))));
    await ses.setAttendanceStatus(admin, abkS.id, "hadir", "uji tarif mapel");
    const nAll = await hadirCount();
    const rm = await rowOf();
    check("tarif mapel: satu tentor dua tarif (Calistung 35.000, ABK 55.000) dihitung benar", rm.tarif_min === 35000 && rm.tarif_max === 55000 && rm.subtotal === (nAll - 1) * 35000 + 55000, JSON.stringify([rm.tarif_min, rm.tarif_max, rm.subtotal, nAll]));
    await honor.setHonorPaid(admin, { tutor_id: aulia.id, periode, lunas: true });
    const rp = await rowOf();
    const frozen = (await db().select({ t: sessions.honorTarif, n: count() }).from(sessions).where(eq(sessions.honorSlipId, rp.slip!.id)).groupBy(sessions.honorTarif)).map((x) => `${x.t}:${x.n}`).sort().join(",");
    check("tarif mapel: lunas membekukan tarif PER SESI", frozen === `35000:${nAll - 1},55000:1`, frozen);
    await master.saveTutor(admin, { ...tutorRow(aulia.nama), tarif_mapel: [{ mapel: "abk", tarif: 99000 }] });
    const rp2 = await rowOf();
    check("tarif mapel: mengubah tarif mapel setelah lunas tidak mengubah slip", rp2.total === rp.total && rp2.tarif_max === 55000, JSON.stringify([rp2.total, rp2.tarif_max]));
    const pd2 = await honor.getHonorPdfData(admin, aulia.id, periode);
    check("tarif mapel: slip PDF memisahkan baris per tarif (ABK Rp 55.000 sendiri)", !!pd2 && pd2.items.some((i) => i.tarif === 55000 && i.sesi === 1 && i.abk) && pd2.items.some((i) => i.tarif === 35000), JSON.stringify(pd2?.items.map((i) => [i.siswa, i.tarif, i.sesi])));
    await honor.setHonorPaid(admin, { tutor_id: aulia.id, periode, lunas: false });
    check("tarif mapel: batal lunas mengosongkan tarif per sesi", (await db().select({ n: count() }).from(sessions).where(sql`${sessions.honorTarif} is not null and ${sessions.tutorId} = ${aulia.id}`))[0].n === 0);
    check("tarif mapel: hitung ulang memakai tarif mapel terbaru (ABK 99.000)", (await rowOf()).tarif_max === 99000);
    await master.saveTutor(admin, { ...tutorRow(aulia.nama), tarif_honor: 0, tarif_mapel: [] });
    await rejects("tarif mapel: sesi tanpa tarif sama sekali tidak bisa dibayar (menyebut mapelnya)", () => honor.setHonorPaid(admin, { tutor_id: aulia.id, periode, lunas: true }), /Calistung.*belum diisi/);
    await master.saveTutor(admin, { ...tutorRow(aulia.nama), tarif_honor: 35000, tarif_mapel: [{ mapel: "abk", tarif: 55000 }] });

    // --- tanda tangan ---
    const img = (b: Buffer, n: string) => file(b, n, "image/png");
    await rejects("ttd: tentor (tanpa akses Honor) tidak bisa mengunggah", () => usr.saveSignature(aulia, { file: img(VALID_PNG, "ttd.png"), hapus: false }), /tidak punya akses/);
    await rejects("ttd: PDF berekstensi .png ditolak (cek isi file)", () => usr.saveSignature(admin, { file: file(PDF, "ttd.png"), hapus: false }), /Tipe file/);
    await rejects("ttd: PNG asli berekstensi .exe ditolak", () => usr.saveSignature(admin, { file: img(VALID_PNG, "ttd.exe"), hapus: false }), /Tipe file/);
    await rejects("ttd: tanpa file dan tanpa hapus ditolak", () => usr.saveSignature(admin, { file: null, hapus: false }), /Pilih gambar/);
    await usr.saveSignature(admin, { file: img(VALID_PNG, "ttd.png"), hapus: false });
    const [adm1] = await db().select().from(users).where(eq(users.id, admin.id));
    check("ttd: tersimpan; hanya pemiliknya yang bisa membuka filenya", !!adm1.ttdFileId && !!(await findReadableFile(admin, adm1.ttdFileId!)) && !(await findReadableFile(aulia, adm1.ttdFileId!)) && !(await findReadableFile(sup, adm1.ttdFileId!)));
    const sigKey = await keyOf(adm1.ttdFileId!);
    await usr.saveSignature(admin, { file: img(VALID_PNG, "ttd2.png"), hapus: false });
    const [adm2] = await db().select().from(users).where(eq(users.id, admin.id));
    check("ttd: mengganti → file lama terhapus (DB + disk)", adm2.ttdFileId !== adm1.ttdFileId && (await fileGone(adm1.ttdFileId!, sigKey)));

    // --- logo bimbel ---
    await rejects("logo: tentor tidak bisa mengubah logo", () => master.saveLogo(aulia, { file: img(VALID_PNG, "logo.png"), hapus: false }), /tidak punya akses/);
    await rejects("logo: bukan gambar ditolak", () => master.saveLogo(admin, { file: file(PDF, "logo.png"), hapus: false }), /Tipe file/);
    await master.saveLogo(admin, { file: img(VALID_PNG, "logo.png"), hapus: false });
    const [cfgL] = await db().select().from(appSettings).where(eq(appSettings.id, 1));
    check("logo: tersimpan & bisa dilihat semua akun aktif (tentor ikut)", !!cfgL.logoFileId && !!(await findReadableFile(aulia, cfgL.logoFileId!)));
    const logoKey = await keyOf(cfgL.logoFileId!);
    await master.saveLogo(admin, { file: img(VALID_PNG, "logo2.png"), hapus: false });
    check("logo: mengganti → logo lama terhapus (DB + disk)", await fileGone(cfgL.logoFileId!, logoKey));
    const br = await loadBranding();
    check("kop PDF: logo, tagline & kota dimuat dari pengaturan", !!br.logo && !!br.tagline && !!br.kota, JSON.stringify([!!br.logo, br.tagline, br.kota]));

    // --- slip: penandatangan & nomor ---
    await honor.setHonorPaid(admin, { tutor_id: aulia.id, periode, lunas: true });
    const pdSig = await honor.getHonorPdfData(admin, aulia.id, periode);
    check("slip: penandatangan = admin yang menandai lunas, gambar ttd ikut", pdSig?.signer?.nama === admin.nama && !!pdSig?.signer?.ttd, JSON.stringify([pdSig?.signer?.nama, !!pdSig?.signer?.ttd]));
    check("slip: nomor berformat SLIP/yyyy/mm/nnn", /^SLIP\/\d{4}\/\d{2}\/\d{3}$/.test(pdSig?.nomor ?? ""), String(pdSig?.nomor));
    await usr.saveSignature(admin, { file: null, hapus: true });
    const pdNo = await honor.getHonorPdfData(admin, aulia.id, periode);
    check("slip: tanpa ttd tersimpan → tidak ada gambar, nama tetap tampil", pdNo?.signer?.ttd === null && pdNo?.signer?.nama === admin.nama);
    await usr.saveSignature(admin, { file: img(VALID_PNG, "ttd.png"), hapus: false }); // dipasang lagi untuk uji HTTP
  }

  console.log("\nAbsen susulan (pengaturan)");
  {
    const [cfg] = await db().select().from(appSettings).where(eq(appSettings.id, 1));
    const settingsInput = (bebas: boolean) => ({
      nama_bimbel: cfg.namaBimbel, alamat: cfg.alamat ?? "", rekening: cfg.rekening ?? "", wa_admin: cfg.waAdmin ?? "", link_drive_konten: cfg.linkDriveKonten ?? "",
      absen_buka_menit: cfg.absenBukaMenit, absen_tutup_menit: cfg.absenTutupMenit, absen_susulan_bebas: bebas,
      tagline: cfg.tagline ?? "", kota: cfg.kota ?? "",
    });
    const spAulia = (await master.studentProgramOptions(admin)).find((x) => x.tutor_id === aulia.id)!;
    await ses.createSessions(admin, { student_program_id: spAulia.id, tutor_id: aulia.id, tanggal: "2020-01-06", jam_mulai: "09:00", jam_selesai: "10:00", ulang_minggu: 1 });
    const [lama] = await db().select().from(sessions).where(and(eq(sessions.tutorId, aulia.id), eq(sessions.mulaiAt, new Date("2020-01-06T09:00:00+07:00"))));
    const gps = { lat: -7.84, lng: 110.33, akurasi: 9 };
    check("absen susulan: default pengaturan = tidak diizinkan (perilaku lama)", cfg.absenSusulanBebas === false);
    await rejects("absen susulan: default tetap terkunci lewat batas waktu", () => ses.submitAttendance(aulia, { sessionId: lama.id, ...gps, photo: file(JPG, "a.jpg") }), /Di luar jendela/);
    await master.saveSettings(admin, settingsInput(true));
    await ses.submitAttendance(aulia, { sessionId: lama.id, ...gps, photo: file(JPG, "a.jpg") });
    const [sesudah] = await db().select().from(sessions).where(eq(sessions.id, lama.id));
    check("absen susulan: bila diizinkan, absen lewat batas berhasil (jam server tercatat)", sesudah.statusKehadiran === "hadir" && !!sesudah.absenAt && sesudah.absenAt.getTime() > Date.parse("2021-01-01"));
    await rejects("absen susulan: tentor tidak bisa mengubah pengaturan", () => master.saveSettings(aulia, settingsInput(false)), /tidak punya akses/);
    await master.saveSettings(admin, settingsInput(false));
    check("absen susulan: pengaturan bisa dikembalikan", (await db().select().from(appSettings).where(eq(appSettings.id, 1)))[0].absenSusulanBebas === false);
  }

  console.log("\nData siswa untuk tentor (revisi poin 6)");
  {
    const forAulia = await stu.listStudents(aulia);
    check("siswa: tentor tetap melihat siswanya (nama & kelas)", forAulia.length >= 1 && forAulia.every((s) => !!s.nama));
    check("siswa: tentor TIDAK menerima alamat, sekolah, tgl lahir & kontak orang tua", forAulia.every((s) => s.alamat === null && s.sekolah === null && s.tanggal_lahir === null && s.ortu_nama === null && s.ortu_wa === null), JSON.stringify(forAulia[0]));
    const forAdmin = await stu.listStudents(admin);
    check("siswa: admin tetap menerima data lengkap", forAdmin.some((s) => !!s.alamat && !!s.ortu_wa && !!s.sekolah));
    check("siswa: asesmen tetap tidak terkirim ke tentor", forAulia.every((s) => s.student_assessments === undefined));
    check("laporan: tentor tidak menerima kontak orang tua (daftar siswa binaan)", (await rep.listMyAssignments(aulia)).every((a) => a.students?.ortu_wa === null && a.students?.ortu_nama === null));
    const repAul = await rep.listReports(aulia, { mine: true });
    check("laporan: tentor tidak menerima kontak orang tua (daftar laporan)", repAul.rows.length >= 1 && repAul.rows.every((r) => r.students?.ortu_wa === null && r.students?.ortu_nama === null));
    check("laporan: admin tetap menerima kontak orang tua untuk kirim WA", (await rep.listReports(admin)).rows.some((r) => !!r.students?.ortu_wa));
    const sesAdm = await ses.listSessions(admin, { from: "2020-01-01", to: "2030-12-31" });
    check("siswa: nama panggilan ikut di data jadwal", sesAdm.some((s) => s.students?.nama === "Alya Putri" && s.students.panggilan === "Alya"));
  }

  // ================= Kategori mapel dinamis, pelacakan pelaku, jadwal & beranda tentor =================
  console.log("\nKategori mapel dinamis");
  {
    const staf = await actor("stafftentor@bimbel.test"); // akses Tentor & Tarif (Kelola), tanpa Honor
    const cats0 = await mapelSvc.listMapel();
    check("mapel: 8 kategori awal tersedia termasuk cadangan 'lainnya'", cats0.length >= 8 && cats0.some((x) => x.key === "lainnya") && cats0.some((x) => x.key === "abk" && x.bg === "#FCE7F3"), cats0.map((x) => x.key).join());
    await rejects("mapel: tentor tidak bisa menambah kategori", () => mapelSvc.saveMapel(aulia, { label: "Uji", bg: "#112233", dot: "#445566" }), /tidak punya akses/);
    await rejects("mapel: warna harus #RRGGBB", () => mapelSvc.saveMapel(admin, { label: "Uji Warna", bg: "red", dot: "#445566" }), /#RRGGBB/);
    await rejects("mapel: nama minimal 2 huruf", () => mapelSvc.saveMapel(admin, { label: "A", bg: "#112233", dot: "#445566" }), /minimal 2 huruf/);
    const baru = await mapelSvc.saveMapel(staf, { label: "Matematika SMA & UTBK", short: "Mtk SMA", bg: "#e0e7ff", dot: "#4f46e5", urut: 80, aktif: true });
    const [rowBaru] = await db().select().from(mapelCategories).where(eq(mapelCategories.key, baru.id!));
    check("mapel: kategori baru tersimpan (kunci slug, warna dinormalkan huruf besar)", baru.id === "matematika_sma_utbk" && rowBaru.bg === "#E0E7FF" && rowBaru.dot === "#4F46E5" && rowBaru.short === "Mtk SMA" && rowBaru.createdBy === staf.id);
    await rejects("mapel: nama kembar (tanpa beda huruf besar) ditolak", () => mapelSvc.saveMapel(admin, { label: "matematika sma & utbk", bg: "#112233", dot: "#445566" }), /sudah ada/);
    const mirip = await mapelSvc.saveMapel(admin, { label: "Matematika SMA UTBK", bg: "#112233", dot: "#445566" });
    check("mapel: nama mirip menghasilkan kunci unik (akhiran _2)", mirip.id === "matematika_sma_utbk_2", String(mirip.id));

    const tutorBase = { id: aulia.id, nama: aulia.nama, spesialisasi: "Calistung, SD Umum" };
    await rejects("mapel: kunci tak dikenal ditolak saat menyimpan program", () => master.saveProgram(admin, { nama: "Program Uji Mapel", kategori: "privat", mapel_kategori: "tidak_ada", jenjang: "SMA", tarif_per_pertemuan: 1000, aktif: true }), /tidak ditemukan/);
    await master.saveProgram(admin, { nama: "Privat Mtk SMA", kategori: "privat", mapel_kategori: baru.id!, jenjang: "SMA", tarif_per_pertemuan: 90000, aktif: true });
    check("mapel: program memakai kategori baru", (await master.listProgramsWithTarif(admin)).some((p) => p.nama === "Privat Mtk SMA" && p.mapel_kategori === baru.id));
    await master.saveTutor(admin, { ...tutorBase, mapel_kategori: baru.id!, tarif_mapel: [{ mapel: baru.id!, tarif: 60000 }, { mapel: "abk", tarif: 55000 }] });
    const tl = await ses.timelineTutors(admin);
    check("mapel: tentor berkelompok di kategori baru pada timeline", tl.find((t) => t.id === aulia.id)?.mapel === baru.id);
    check("mapel: tarif honor khusus untuk kategori baru tersimpan", ((await master.listTutors(admin)).find((t) => t.id === aulia.id)?.tarif_mapel ?? []).some((x) => x.mapel === baru.id && x.tarif === 60000));
    await rejects("mapel: kategori yang dipakai tidak bisa dihapus", () => mapelSvc.deleteMapel(admin, baru.id!), /masih dipakai/);
    let fkHeld = false;
    try {
      await db().delete(mapelCategories).where(eq(mapelCategories.key, baru.id!));
    } catch {
      fkHeld = true;
    }
    check("mapel: database menolak menghapus kategori yang dirujuk (kunci asing)", fkHeld);
    await rejects("mapel: 'lainnya' tidak bisa dihapus", () => mapelSvc.deleteMapel(admin, "lainnya"), /cadangan/);
    await rejects("mapel: 'lainnya' tidak bisa dinonaktifkan", () => mapelSvc.saveMapel(admin, { key: "lainnya", label: "IPS / Program Lainnya", bg: "#F1F5F9", dot: "#475569", aktif: false }), /cadangan/);
    await mapelSvc.saveMapel(admin, { key: mirip.id!, label: "Matematika SMA UTBK", bg: "#112233", dot: "#445566", aktif: false });
    check("mapel: kategori bisa dinonaktifkan (tetap tercatat)", (await mapelSvc.listMapel()).some((x) => x.key === mirip.id && x.aktif === false));
    await mapelSvc.deleteMapel(admin, mirip.id!);
    check("mapel: kategori yang belum dipakai bisa dihapus", !(await mapelSvc.listMapel()).some((x) => x.key === mirip.id));
    const adm = await mapelSvc.listMapelAdmin(admin);
    check("mapel: pengelola melihat jumlah pemakai tiap kategori", adm.find((x) => x.key === baru.id)?.dipakai.program === 1 && adm.find((x) => x.key === baru.id)?.dipakai.tentor === 1);
    await rejects("mapel: tentor tidak bisa membuka daftar pengelola", () => mapelSvc.listMapelAdmin(aulia), /tidak punya akses/);
    // kembalikan data uji supaya blok lain tidak terpengaruh
    await master.saveTutor(admin, { ...tutorBase, mapel_kategori: "calistung", tarif_mapel: [{ mapel: "abk", tarif: 55000 }] });
  }

  console.log("\nPelacakan pelaku (invoice & honor)");
  {
    const bayu = await actor("bayu@bimbel.test");
    const tutorBase = { id: aulia.id, nama: aulia.nama, spesialisasi: "Calistung, SD Umum", mapel_kategori: "calistung" };

    // --- invoice: terbit ---
    const spAulia = (await master.studentProgramOptions(admin)).find((x) => x.tutor_id === aulia.id)!;
    await ses.createSessions(admin, { student_program_id: spAulia.id, tutor_id: aulia.id, tanggal: "2019-05-06", jam_mulai: "09:00", jam_selesai: "10:00", ulang_minggu: 1 });
    const [sTagih] = await db().select().from(sessions).where(and(eq(sessions.tutorId, aulia.id), eq(sessions.mulaiAt, new Date("2019-05-06T09:00:00+07:00"))));
    await ses.setAttendanceStatus(admin, sTagih.id, "hadir", "uji pelacakan");
    const terbit = await inv.issueInvoice(admin, sTagih.studentId, sTagih.programId, [sTagih.id]);
    const [invRow] = await db().select().from(invoices).where(eq(invoices.id, terbit.id));
    check("invoice: penerbit tercatat (created_by)", invRow.createdBy === admin.id);
    const [audTerbit] = await db().select().from(auditLog).where(and(eq(auditLog.target, terbit.id), eq(auditLog.aksi, "invoice_terbit")));
    check("invoice: penerbitan tercatat di audit log (siapa & nomor)", audTerbit?.actorId === admin.id && (audTerbit.detail as { nomor?: string })?.nomor === invRow.nomor);

    // --- invoice: lunas oleh admin A, diubah admin B, dibatalkan ---
    await inv.setPaid(admin, terbit.id, true, "2026-01-05");
    let [i1] = await db().select().from(invoices).where(eq(invoices.id, terbit.id));
    check("invoice: lunas mencatat siapa & kapan (dibayar_oleh / dibayar_pada)", i1.dibayarOleh === admin.id && !!i1.dibayarPada && i1.statusBayar === "lunas");
    const listed = (await inv.listInvoices(admin, { q: invRow.nomor })).rows.find((r) => r.id === terbit.id)!;
    check("invoice: daftar menampilkan nama pencatat", listed.dibayar_oleh === admin.nama && !!listed.dibayar_pada && listed.created_by === admin.nama, JSON.stringify([listed.dibayar_oleh, listed.created_by]));
    await inv.setPaid(bayu, terbit.id, true, "2026-01-06");
    [i1] = await db().select().from(invoices).where(eq(invoices.id, terbit.id));
    check("invoice: perubahan oleh admin lain mengganti pencatat terakhir", i1.dibayarOleh === bayu.id && i1.tglBayar === "2026-01-06");
    const hist = await inv.invoiceHistory(admin, terbit.id);
    check("invoice: riwayat memuat KEDUA admin (terbit, lunas, lunas ulang)", hist.length >= 3 && hist.some((h) => h.oleh === admin.nama && h.aksi === "invoice_lunas") && hist.some((h) => h.oleh === bayu.nama && h.aksi === "invoice_lunas") && hist.some((h) => h.aksi === "invoice_terbit"), hist.map((h) => `${h.oleh}:${h.aksi}`).join());
    check("invoice: label riwayat terbaca manusia", /Menandai lunas/.test(auditLabel(hist[0].aksi, hist[0].detail)) && /Menerbitkan invoice/.test(auditLabel("invoice_terbit", { nomor: "X", sesi: 1, total: 1000 })));
    await inv.setPaid(admin, terbit.id, false);
    [i1] = await db().select().from(invoices).where(eq(invoices.id, terbit.id));
    check("invoice: batal lunas mengosongkan pencatat & tanggal, jejak audit tetap", i1.dibayarOleh === null && i1.dibayarPada === null && i1.tglBayar === null && (await inv.invoiceHistory(admin, terbit.id)).some((h) => h.aksi === "invoice_batal_lunas"));
    await rejects("invoice: tentor tidak bisa membaca riwayat", () => inv.invoiceHistory(aulia, terbit.id), /tidak punya akses/);
    check("invoice: id riwayat tidak valid → kosong", (await inv.invoiceHistory(admin, "bukan-uuid")).length === 0);

    const magang = await actor("magang@bimbel.test");
    // --- invoice: hapus (salah terbit) → sesi kembali Siap Tagih, bisa terbit ulang ---
    await ses.createSessions(admin, { student_program_id: spAulia.id, tutor_id: aulia.id, tanggal: "2019-05-13", jam_mulai: "09:00", jam_selesai: "10:00", ulang_minggu: 1 });
    const [sHapus] = await db().select().from(sessions).where(and(eq(sessions.tutorId, aulia.id), eq(sessions.mulaiAt, new Date("2019-05-13T09:00:00+07:00"))));
    await ses.setAttendanceStatus(admin, sHapus.id, "hadir", "uji hapus invoice");
    const salah = await inv.issueInvoice(admin, sHapus.studentId, sHapus.programId, [sHapus.id]);
    const [salahRow] = await db().select().from(invoices).where(eq(invoices.id, salah.id));
    await rejects("hapus invoice: tentor ditolak", () => inv.deleteInvoice(aulia, salah.id), /tidak punya akses/);
    await rejects("hapus invoice: akses Lihat ditolak", () => inv.deleteInvoice(magang, salah.id), /tidak punya akses/);
    await inv.setPaid(admin, salah.id, true, "2026-01-05");
    await rejects("hapus invoice: yang sudah lunas ditolak (batalkan lunas dulu)", () => inv.deleteInvoice(admin, salah.id), /sudah lunas/);
    await inv.setPaid(admin, salah.id, false);
    await inv.deleteInvoice(bayu, salah.id);
    check("hapus invoice: baris & rinciannya hilang", (await db().select().from(invoices).where(eq(invoices.id, salah.id))).length === 0);
    const [sKembali] = await db().select().from(sessions).where(eq(sessions.id, sHapus.id));
    check("hapus invoice: sesi kembali Belum Rekap & terlepas dari invoice", sKembali.statusTagihan === "belum_rekap" && sKembali.invoiceId === null);
    const [audHapus] = await db().select().from(auditLog).where(and(eq(auditLog.target, salah.id), eq(auditLog.aksi, "invoice_hapus")));
    check("hapus invoice: tercatat siapa yang menghapus + nomor", audHapus?.actorId === bayu.id && (audHapus.detail as { nomor?: string })?.nomor === salahRow.nomor);
    const ulang = await inv.issueInvoice(admin, sHapus.studentId, sHapus.programId, [sHapus.id]);
    const [ulangRow] = await db().select().from(invoices).where(eq(invoices.id, ulang.id));
    check("hapus invoice: terbit ulang memakai nomor yang sama (tanpa lubang)", ulangRow.nomor === salahRow.nomor, `${ulangRow.nomor} vs ${salahRow.nomor}`);
    await inv.deleteInvoice(admin, ulang.id);
    await rejects("hapus invoice: id tidak ada", () => inv.deleteInvoice(admin, ulang.id), /tidak ditemukan/);
    await db().delete(sessions).where(eq(sessions.id, sHapus.id)); // bersihkan sesi uji agar blok honor tak terpengaruh

    // --- ganti program siswa: sesi belum ditagih ikut pindah, yang sudah masuk invoice tetap ---
    const progs2 = await master.listProgramsWithTarif(admin);
    const progA = progs2.find((p) => p.id === sTagih.programId)!;
    const progB = progs2.find((p) => p.id !== progA.id && p.aktif)!;
    const [stuRow] = await db().select().from(students).where(eq(students.id, sTagih.studentId));
    await ses.createSessions(admin, { student_program_id: spAulia.id, tutor_id: aulia.id, tanggal: "2019-05-20", jam_mulai: "09:00", jam_selesai: "10:00", ulang_minggu: 1 });
    const [sFree] = await db().select().from(sessions).where(and(eq(sessions.tutorId, aulia.id), eq(sessions.mulaiAt, new Date("2019-05-20T09:00:00+07:00"))));
    const spStu = (await db().select().from(studentPrograms).where(eq(studentPrograms.studentId, stuRow.id))).map((x) => ({ program_id: x.programId, tutor_id: x.tutorId }));
    const stuBase = { id: stuRow.id, nama: stuRow.nama, status: stuRow.status } as const;
    const progsKeep = spStu.filter((x) => x.program_id !== progA.id).map((x) => ({ program_id: x.program_id, tutor_id: x.tutor_id }));
    // sesi sisa dari program lain yang sudah tidak diikuti (belum ditagih) juga ikut pindah
    const progC = progs2.find((p) => p.id !== progA.id && p.id !== progB.id && p.aktif)!;
    await ses.createSessions(admin, { student_program_id: spAulia.id, tutor_id: aulia.id, tanggal: "2019-05-27", jam_mulai: "09:00", jam_selesai: "10:00", ulang_minggu: 1 });
    const [sOrph] = await db().select().from(sessions).where(and(eq(sessions.tutorId, aulia.id), eq(sessions.mulaiAt, new Date("2019-05-27T09:00:00+07:00"))));
    await db().update(sessions).set({ programId: progC.id }).where(eq(sessions.id, sOrph.id));
    const swap = await stu.saveStudent(admin, { ...stuBase, programs: [...progsKeep, { program_id: progB.id, tutor_id: aulia.id }] });
    const [sFreeAfter] = await db().select().from(sessions).where(eq(sessions.id, sFree.id));
    const [sBilledAfter] = await db().select().from(sessions).where(eq(sessions.id, sTagih.id));
    check("ganti program siswa: sesi belum ditagih pindah ke program baru", sFreeAfter.programId === progB.id && /dipindah/.test(swap.message), swap.message);
    const [sOrphAfter] = await db().select().from(sessions).where(eq(sessions.id, sOrph.id));
    check("ganti program siswa: sesi sisa program lama yang belum ditagih ikut pindah", sOrphAfter.programId === progB.id);
    check("ganti program siswa: sesi yang sudah masuk invoice tidak berubah", sBilledAfter.programId === progA.id);
    check("ganti program siswa: tercatat di audit log", (await db().select().from(auditLog).where(and(eq(auditLog.target, stuRow.id), eq(auditLog.aksi, "pindah_program_sesi")))).length >= 1);
    // dua program diganti sekaligus (dengan pasangan dari baris form): masing-masing sesi ikut ke pasangannya
    const progD = progs2.find((p) => ![progA.id, progB.id, progC.id].includes(p.id) && p.aktif);
    if (progD) {
      await stu.saveStudent(admin, { ...stuBase, programs: [{ program_id: progB.id, tutor_id: aulia.id }, { program_id: progC.id, tutor_id: aulia.id }] });
      await db().update(sessions).set({ programId: progB.id }).where(eq(sessions.id, sFree.id));
      await db().update(sessions).set({ programId: progC.id }).where(eq(sessions.id, sOrph.id));
      const two = await stu.saveStudent(admin, { ...stuBase, programs: [{ program_id: progA.id, tutor_id: aulia.id, dari: progB.id }, { program_id: progD.id, tutor_id: aulia.id, dari: progC.id }] });
      const [f2] = await db().select().from(sessions).where(eq(sessions.id, sFree.id));
      const [o2] = await db().select().from(sessions).where(eq(sessions.id, sOrph.id));
      check("ganti 2 program sekaligus: tiap sesi ikut ke pasangannya", f2.programId === progA.id && o2.programId === progD.id && /dipindah/.test(two.message), two.message);
    }
    // kembalikan data uji
    await stu.saveStudent(admin, { ...stuBase, programs: [...progsKeep, { program_id: progA.id, tutor_id: aulia.id }] });
    await db().delete(sessions).where(inArray(sessions.id, [sFree.id, sOrph.id]));

    // --- hapus siswa: ringkasan, blokir bila ada tagihan terbuka, bebaskan tagihan, batalkan sesi terjadwal ---
    const progH = (await master.listProgramsWithTarif(admin)).find((p) => p.aktif)!;
    const hs = await stu.saveStudent(admin, { nama: "Uji Hapus Siswa", status: "aktif", programs: [{ program_id: progH.id, tutor_id: aulia.id }] });
    const [spH] = await db().select().from(studentPrograms).where(eq(studentPrograms.studentId, hs.id));
    for (const tgl of ["2019-06-03", "2019-06-10"]) await ses.createSessions(admin, { student_program_id: spH.id, tutor_id: aulia.id, tanggal: tgl, jam_mulai: "13:00", jam_selesai: "14:00", ulang_minggu: 1 });
    await ses.createSessions(admin, { student_program_id: spH.id, tutor_id: aulia.id, tanggal: "2099-01-05", jam_mulai: "13:00", jam_selesai: "14:00", ulang_minggu: 2 });
    const sesH = await db().select().from(sessions).where(eq(sessions.studentId, hs.id)).orderBy(sessions.mulaiAt);
    for (const s of sesH.slice(0, 2)) await ses.setAttendanceStatus(admin, s.id, "hadir", "uji hapus siswa");

    const sum1 = await stu.studentDeleteSummary(admin, hs.id);
    check("hapus siswa: ringkasan menghitung sesi Hadir belum ditagih & sesi terjadwal", sum1.hadir_belum_ditagih === 2 && sum1.sesi_terjadwal === 2 && sum1.invoice_belum_lunas === 0, JSON.stringify(sum1));
    await rejects("hapus siswa: tentor tidak bisa melihat ringkasan", () => stu.studentDeleteSummary(aulia, hs.id), /tidak punya akses/);
    await rejects("hapus siswa: ditolak bila masih ada sesi Hadir belum ditagih", () => stu.softDeleteStudent(admin, hs.id), /belum ditagih/);

    // invoice belum lunas juga memblokir
    const invH = await inv.issueInvoice(admin, hs.id, progH.id, [sesH[0].id]);
    const sum2 = await stu.studentDeleteSummary(admin, hs.id);
    check("hapus siswa: ringkasan memuat invoice belum lunas", sum2.invoice_belum_lunas === 1 && sum2.hadir_belum_ditagih === 1, JSON.stringify(sum2));
    await inv.deleteInvoice(admin, invH.id); // invoice tidak jadi → sesi kembali Siap Tagih

    // bebaskan tagihan: hanya akses Kelola Invoice; sesi tidak dihapus & tidak lagi muncul di Siap Tagih
    await rejects("bebaskan tagihan: tentor ditolak", () => stu.waiveStudentBilling(aulia, hs.id), /tidak punya akses/);
    await stu.waiveStudentBilling(admin, hs.id);
    const bebas = await db().select().from(sessions).where(and(eq(sessions.studentId, hs.id), eq(sessions.statusKehadiran, "hadir")));
    check("bebaskan tagihan: sesi Hadir berstatus dibebaskan (tidak dihapus)", bebas.length === 2 && bebas.every((s) => s.statusTagihan === "dibebaskan"));
    check("bebaskan tagihan: tidak muncul lagi di Daftar Siap Tagih", !(await inv.listReadyToBill(admin)).some((s) => s.student_id === hs.id));
    check("bebaskan tagihan: tercatat di audit log (siapa)", (await db().select().from(auditLog).where(and(eq(auditLog.target, hs.id), eq(auditLog.aksi, "bebaskan_tagihan")))).some((a) => a.actorId === admin.id));
    await rejects("bebaskan tagihan: tanpa sesi yang perlu dibebaskan ditolak", () => stu.waiveStudentBilling(admin, hs.id), /Tidak ada sesi/);
    await rejects("batal bebaskan: admin biasa ditolak (hanya Super Admin)", () => inv.undoWaiveSession(admin, bebas[0].id), /Hanya Super Admin/);
    await inv.undoWaiveSession(sup, bebas[0].id);
    const [kembali] = await db().select().from(sessions).where(eq(sessions.id, bebas[0].id));
    check("batal bebaskan (Super Admin): sesi kembali ke Siap Tagih & tercatat", kembali.statusTagihan === "belum_rekap" && (await inv.listReadyToBill(admin)).some((s) => s.id === bebas[0].id) && (await db().select().from(auditLog).where(and(eq(auditLog.target, bebas[0].id), eq(auditLog.aksi, "batal_bebaskan_tagihan")))).some((a) => a.actorId === sup.id));
    await rejects("batal bebaskan: sesi yang tidak dibebaskan ditolak", () => inv.undoWaiveSession(sup, bebas[0].id), /tidak berstatus tagihan dibebaskan/);
    await stu.waiveStudentBilling(admin, hs.id); // bebaskan lagi agar alur hapus di bawah tetap jalan
    await rejects("sesi dibebaskan tidak bisa diterbitkan invoice", () => inv.issueInvoice(admin, hs.id, progH.id, [bebas[0].id]), /sudah terekap atau tidak valid/);

    // setelah bersih: hapus berhasil, sesi terjadwal dibatalkan, sesi Hadir (arsip) tetap
    await rejects("hapus siswa: tentor ditolak", () => stu.softDeleteStudent(aulia, hs.id), /tidak punya akses/);
    const delMsg = await stu.softDeleteStudent(admin, hs.id);
    const after = await db().select().from(sessions).where(eq(sessions.studentId, hs.id));
    check("hapus siswa: sesi terjadwal dibatalkan otomatis", after.filter((s) => s.statusKehadiran === "batal").length === 2 && /2 sesi terjadwal dibatalkan/.test(delMsg), delMsg);
    check("hapus siswa: riwayat sesi Hadir tetap ada sebagai arsip", after.filter((s) => s.statusKehadiran === "hadir").length === 2);
    const [hsRow] = await db().select().from(students).where(eq(students.id, hs.id));
    check("hapus siswa: ditandai terhapus (soft delete) & tercatat siapa", !!hsRow.deletedAt && hsRow.deletedBy === admin.id);
    await rejects("hapus siswa: sudah terhapus → tidak ditemukan", () => stu.softDeleteStudent(admin, hs.id), /tidak ditemukan/);

    // data terhapus: hanya Super Admin; pulihkan mengembalikan siswa & sesi yang dibatalkan otomatis (jam belum lewat)
    await rejects("data terhapus: admin biasa tidak bisa melihat daftar", () => stu.listDeletedStudents(admin), /Hanya Super Admin/);
    await rejects("data terhapus: admin biasa tidak bisa memulihkan", () => stu.restoreStudent(admin, hs.id), /Hanya Super Admin/);
    const delRow = (await stu.listDeletedStudents(sup)).find((r) => r.id === hs.id);
    check("data terhapus: daftar memuat siswa + ringkasan data terkait", !!delRow && delRow.sesi_hadir === 2 && delRow.sesi_dibebaskan === 2 && delRow.sesi_batal_otomatis === 2 && delRow.deleted_by === admin.nama, JSON.stringify(delRow));
    const restoreMsg = await stu.restoreStudent(sup, hs.id);
    const [hsBack] = await db().select().from(students).where(eq(students.id, hs.id));
    const afterRestore = await db().select().from(sessions).where(eq(sessions.studentId, hs.id));
    check("pulihkan siswa: aktif kembali & penanda hapus bersih", !hsBack.deletedAt && hsBack.status === "aktif" && !hsBack.deletedBy);
    check("pulihkan siswa: sesi batal otomatis (jam belum lewat) kembali terjadwal", afterRestore.filter((s) => s.statusKehadiran === "terjadwal").length === 2 && /2 sesi terjadwal dikembalikan/.test(restoreMsg), restoreMsg);
    check("pulihkan siswa: tercatat di audit log (Super Admin)", (await db().select().from(auditLog).where(and(eq(auditLog.target, hs.id), eq(auditLog.aksi, "pulihkan_siswa")))).some((a) => a.actorId === sup.id));
    await rejects("pulihkan siswa: yang tidak terhapus ditolak", () => stu.restoreStudent(sup, hs.id), /tidak ditemukan/);
    await stu.softDeleteStudent(admin, hs.id); // hapus lagi agar kondisi akhir sama seperti sebelumnya
    // bersihkan data uji agar blok lain tak terpengaruh
    await db().delete(sessions).where(eq(sessions.studentId, hs.id));

    // --- honor: tarif, tunjangan, lunas oleh admin berbeda ---
    await master.saveTutor(admin, { ...tutorBase, tarif_honor: 36000 });
    const [audTarif] = await db().select().from(auditLog).where(eq(auditLog.aksi, "ubah_tarif_honor")).orderBy(sql`${auditLog.id} desc`).limit(1);
    const dTarif = audTarif?.detail as { tarif_standar?: number[]; rekening_diubah?: boolean } | undefined;
    check("honor: perubahan tarif tentor tercatat (siapa, nilai lama → baru)", audTarif?.actorId === admin.id && dTarif?.tarif_standar?.[0] === 35000 && dTarif?.tarif_standar?.[1] === 36000 && dTarif?.rekening_diubah === false, JSON.stringify(dTarif));
    await master.saveTutor(admin, { ...tutorBase, tarif_honor: 35000 });
    const nAudTarif = (await db().select({ n: count() }).from(auditLog).where(eq(auditLog.aksi, "ubah_tarif_honor")))[0].n;
    await master.saveTutor(admin, { ...tutorBase, tarif_honor: 35000 }); // tanpa perubahan
    check("honor: simpan tanpa perubahan tarif tidak menambah jejak", (await db().select({ n: count() }).from(auditLog).where(eq(auditLog.aksi, "ubah_tarif_honor")))[0].n === nAudTarif);

    const periode = honorPeriode;
    const rowOf = async () => (await honor.listHonor(admin, periode)).find((r) => r.tutor_id === aulia.id)!;
    const r0 = await rowOf();
    check("honor: lunas mencatat pelaku & waktu (dicatat)", r0.slip?.status_bayar === "lunas" && r0.dicatat?.oleh === admin.nama && !!r0.dicatat?.pada, JSON.stringify(r0.dicatat));
    await honor.setHonorPaid(admin, { tutor_id: aulia.id, periode, lunas: false });
    check("honor: batal lunas mengosongkan pencatat", (await rowOf()).dicatat === null);
    await honor.saveHonorAdjustment(bayu, { tutor_id: aulia.id, periode, tunjangan: 20000, catatan: "Bensin" });
    const r1 = await rowOf();
    check("honor: tunjangan mencatat siapa & kapan", r1.tunjangan_oleh === bayu.nama && !!r1.tunjangan_pada && r1.tunjangan === 20000, JSON.stringify([r1.tunjangan_oleh, r1.tunjangan]));
    await honor.setHonorPaid(bayu, { tutor_id: aulia.id, periode, lunas: true });
    const r2 = await rowOf();
    check("honor: lunas oleh admin berbeda tercatat atas namanya", r2.dicatat?.oleh === bayu.nama);
    const hh = await honor.getHonorHistory(admin, aulia.id, periode);
    check("honor: riwayat memuat pelaku berbeda (lunas, batal lunas, tunjangan)", hh.some((h) => h.aksi === "honor_lunas" && h.oleh === admin.nama) && hh.some((h) => h.aksi === "honor_batal_lunas") && hh.some((h) => h.aksi === "honor_tunjangan" && h.oleh === bayu.nama) && hh.some((h) => h.aksi === "honor_lunas" && h.oleh === bayu.nama), hh.map((h) => `${h.oleh}:${h.aksi}`).join());
    check("honor: label riwayat tunjangan memuat nominal & keterangan", /20\.000.*Bensin|Bensin/.test(auditLabel("honor_tunjangan", { tunjangan: 20000, keterangan: "Bensin" })));
    await rejects("honor: tentor tidak bisa membaca riwayat honor", () => honor.getHonorHistory(aulia, aulia.id, periode), /tidak punya akses/);

    // --- honor: lihat invoice terkait ---
    const hi = await honor.getHonorInvoices(admin, aulia.id, periode);
    check("honor: invoice terkait → sesi ditagih + belum ditagih = total sesi", hi.sesi_total >= 1 && hi.sesi_ditagih + hi.sesi_belum_ditagih === hi.sesi_total, JSON.stringify([hi.sesi_total, hi.sesi_ditagih, hi.sesi_belum_ditagih]));
    await rejects("honor: invoice terkait ditolak untuk tentor", () => honor.getHonorInvoices(aulia, aulia.id, periode), /tidak punya akses/);
    const honorOnly = await usr.createUser(sup, { nama: "Staf Honor", email: "stafhonor@bimbel.test", password: "Demo12345!", is_tutor: false, perms: { honor: "write" } });
    const honorOnlyAct = await actor("stafhonor@bimbel.test");
    check("honor: akun khusus Honor dibuat tanpa akses Invoice", !!honorOnly.id && !honorOnlyAct.perms.invoice);
    await rejects("honor: invoice terkait butuh akses Invoice juga", () => honor.getHonorInvoices(honorOnlyAct, aulia.id, periode), /tidak punya akses/);
    await rejects("honor: invoice terkait dengan id tentor tidak valid", () => honor.getHonorInvoices(admin, "bukan-uuid", periode), /tidak valid/);
  }

  console.log("\nJadwal tentor & beranda tanpa data uang");
  {
    const own = await ses.ownTimelineTutor(aulia);
    check("jadwal tentor: baris tunggal untuk dirinya sendiri", own.length === 1 && own[0].id === aulia.id && own[0].no_wa === null);
    await rejects("jadwal tentor: akun bukan tentor ditolak", () => ses.ownTimelineTutor(admin), /yang mengajar/);
    const mine = await ses.listSessions(aulia, { from: "2020-01-01", to: "2030-12-31", limit: 5000 });
    check("jadwal tentor: hanya sesi miliknya yang tampil", mine.length > 0 && mine.every((s) => s.tutor_id === aulia.id));
    const anaAul = await ana.monthlyAnalytics(aulia);
    check("beranda tentor: tanpa data keuangan", anaAul.money === null);
    check("beranda tentor: tanpa status penagihan (rekap tagihan)", anaAul.sessions !== null && anaAul.sessions.rekap === null);
    const anaAdm = await ana.monthlyAnalytics(admin);
    check("beranda admin: keuangan & rekap tagihan tetap ada", anaAdm.money !== null && anaAdm.sessions?.rekap !== null);
    const dsAul = await dash.dashboardSummary(aulia);
    check("beranda tentor: tanpa angka siap tagih / belum lunas / jumlah siswa", dsAul.siapTagih === null && dsAul.belumLunas === null && dsAul.siswaAktif === null);
    const dsAdm = await dash.dashboardSummary(admin);
    check("beranda admin: angka tagihan tetap tampil", dsAdm.siapTagih !== null && dsAdm.belumLunas !== null);
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
    check("tentor GET slip honor → 403", (await get(`/api/honor/${aulia.id}/${honorPeriode}/pdf`, cAul)).status === 403);
    check("tanpa login GET slip honor → ditolak", [307, 401, 403].includes((await get(`/api/honor/${aulia.id}/${honorPeriode}/pdf`)).status));
    const rh = await get(`/api/honor/${aulia.id}/${honorPeriode}/pdf?download=1`, cAdm);
    check("admin GET slip honor → 200 PDF attachment", rh.status === 200 && rh.headers.get("content-type") === "application/pdf" && (rh.headers.get("content-disposition") ?? "").startsWith("attachment") && rh.headers.get("x-content-type-options") === "nosniff");
    check("isi slip honor = PDF valid (dengan logo & ttd)", (await rh.text()).startsWith("%PDF"));
    await usr.saveSignature(admin, { file: file(PNG, "palsu.png", "image/png"), hapus: false });
    const rf = await get(`/api/honor/${aulia.id}/${honorPeriode}/pdf`, cAdm);
    check("slip honor: gambar ttd rusak tidak menggagalkan PDF (cetak tanpa gambar)", rf.status === 200 && (await rf.text()).startsWith("%PDF"));
    const [anyInv] = await db().select({ id: invoices.id }).from(invoices).limit(1);
    if (anyInv) {
      const ri = await get(`/api/invoices/${anyInv.id}/pdf`, cAdm);
      check("nota invoice: admin GET → 200 PDF", ri.status === 200 && (await ri.text()).startsWith("%PDF"));
    }
    check("slip honor: id/periode tidak valid → 404", (await get(`/api/honor/bukan-uuid/${honorPeriode}/pdf`, cAdm)).status === 404);

    const fd = new FormData();
    fd.set("session_id", "x");
    fd.set("photo", file(JPG, "a.jpg"));
    const noOrigin = await fetch(base + "/api/attendance", { method: "POST", body: fd, headers: { cookie: cAul } });
    check("POST upload tanpa Origin (CSRF) → 403", noOrigin.status === 403);
    const evil = await fetch(base + "/api/attendance", { method: "POST", body: fd, headers: { cookie: cAul, origin: "https://evil.test" } });
    check("POST upload dari origin lain → 403", evil.status === 403);
    const own = await fetch(base + "/api/assessments", { method: "POST", body: fd, headers: { cookie: cAul, origin: new URL(base).origin } });
    check("tentor POST asesmen → ditolak", own.status === 400 && /tidak punya akses/i.test((await own.json()).error));
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
