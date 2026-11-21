// Data demo (blueprint klien). Dipakai oleh `pnpm seed` dan opsional saat start
// (SEED_DEMO=true pada DB kosong). Memakai service yang sama dengan aplikasi.
import { count } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, files, materials, programs, progressReports, sessions, studentAssessments, studentPrograms, students, users } from "@/db/schema";
import { saveFile } from "@/lib/storage";
import type { Actor } from "./authz";
import { hashPassword } from "./password";
import { issueInvoice, setPaid } from "./services/invoices";

export const DEMO_PASSWORD = "Demo12345!";

function minimalPdf(title: string, lines: string[]) {
  const esc = (s: string) => s.replace(/[()\\]/g, (c) => "\\" + c);
  const body = [`BT /F1 20 Tf 60 760 Td (${esc(title)}) Tj ET`, ...lines.map((l, i) => `BT /F1 12 Tf 60 ${720 - i * 20} Td (${esc(l)}) Tj ET`)].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

async function storePdf(kind: "assessment" | "report" | "material", name: string, buf: Buffer, by: string) {
  const { key, size } = await saveFile({ category: kind, ext: "pdf", data: buf });
  const [f] = await db().insert(files).values({ kind, storageKey: key, originalName: name, mime: "application/pdf", size, createdBy: by }).returning({ id: files.id });
  return f.id;
}

const WIB = 7 * 3600_000;
const todayWib = () => new Date(Date.now() + WIB).toISOString().slice(0, 10);
function at(dayOffset: number, hhmm: string) {
  const d = new Date(`${todayWib()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return new Date(`${d.toISOString().slice(0, 10)}T${hhmm}:00+07:00`);
}
const nowPlus = (min: number) => new Date(Date.now() + min * 60_000);

/** Seed data demo. Menolak jalan bila sudah ada akun (aman dijalankan ulang). */
export async function seedDemo(log: (m: string) => void = console.log) {
  const [{ n }] = await db().select({ n: count() }).from(users);
  if (n > 0) {
    log("Seed dilewati: database sudah berisi akun.");
    return false;
  }
  const pw = await hashPassword(DEMO_PASSWORD);

  await db()
    .insert(appSettings)
    .values({
      id: 1,
      namaBimbel: "Bimbel Cerdas Bantul",
      alamat: "Jl. Parangtritis Km 5, Bantul, Yogyakarta",
      rekening: "BCA 1234567890 a.n. Bimbel Cerdas Bantul\nBRI 0987-01-000123-50-1 a.n. Bimbel Cerdas Bantul",
      waAdmin: "0811-2233-4455",
      linkDriveKonten: "https://drive.google.com/drive/folders/contoh-folder-konten",
    })
    .onConflictDoUpdate({ target: appSettings.id, set: { namaBimbel: "Bimbel Cerdas Bantul", waAdmin: "0811-2233-4455" } });

  const mk = (email: string, nama: string, role: "super_admin" | "admin" | "tentor", noWa: string, spesialisasi: string | null = null) =>
    db().insert(users).values({ email, passwordHash: pw, nama, role, noWa, spesialisasi }).returning({ id: users.id }).then((r) => r[0].id);
  await mk("superadmin@bimbel.test", "Pak Owner", "super_admin", "0811-0000-0001");
  const adminId = await mk("admin@bimbel.test", "Admin Bimbel", "admin", "0811-2233-4455");
  const aulia = await mk("aulia@bimbel.test", "Kak Aulia", "tentor", "0812-1111-2222", "Calistung, SD Umum");
  const dimas = await mk("dimas@bimbel.test", "Kak Dimas", "tentor", "0813-3333-4444", "ABK, Pendampingan Fokus");
  const rina = await mk("rina@bimbel.test", "Kak Rina", "tentor", "0856-5555-6666", "Fisika, Matematika SMP");

  const progs = await db()
    .insert(programs)
    .values([
      { nama: "Privat Calistung", kategori: "privat", jenjang: "TK / SD", tarifPerPertemuan: 60000 },
      { nama: "ABK Calistung", kategori: "abk", jenjang: "TK / SD", tarifPerPertemuan: 100000 },
      { nama: "Kelompok Fisika", kategori: "kelompok", jenjang: "SMP", tarifPerPertemuan: 50000 },
      { nama: "Privat TKA SD", kategori: "privat", jenjang: "6 SD", tarifPerPertemuan: 75000 },
    ])
    .returning({ id: programs.id, nama: programs.nama });
  const P = Object.fromEntries(progs.map((p) => [p.nama, p.id]));

  const y = new Date().getFullYear();
  const sts = await db()
    .insert(students)
    .values([
      { nama: "Alya Putri", tanggalLahir: `${y - 8}-03-14`, kelas: "Kelas 2 SD", sekolah: "SDIT Al-Hikmah", alamat: "Jl. Merpati No. 12, Bantul", ortuNama: "Bapak Hendra", ortuWa: "0813-9876-5432" },
      { nama: "Budi Utama", tanggalLahir: `${y - 10}-01-20`, kelas: "Kelas 4 SD", sekolah: "SDN 1 Potorono", alamat: "Perum Griya Indah Blok B", ortuNama: "Ibu Sari", ortuWa: "0812-3456-7890" },
      { nama: "Siti Aminah", tanggalLahir: `${y - 14}-02-02`, kelas: "Kelas 8 SMP", sekolah: "SMPN 2 Banguntapan", alamat: "Jl. Wonosari Km 7", ortuNama: "Ibu Ratna", ortuWa: "0857-1122-3344" },
    ])
    .returning({ id: students.id, nama: students.nama });
  const S = Object.fromEntries(sts.map((s) => [s.nama, s.id]));

  await db().insert(studentPrograms).values([
    { studentId: S["Alya Putri"], programId: P["ABK Calistung"], tutorId: dimas },
    { studentId: S["Budi Utama"], programId: P["Privat Calistung"], tutorId: aulia },
    { studentId: S["Siti Aminah"], programId: P["Kelompok Fisika"], tutorId: rina },
  ]);

  // asesmen ABK (privat)
  const asmFile = await storePdf("assessment", "asesmen-awal.pdf", minimalPdf("Hasil Asesmen Awal - Alya Putri", ["Dokumen RAHASIA - hanya Admin.", "Catatan psikolog: (contoh data demo)"]), adminId);
  await db().insert(studentAssessments).values({ studentId: S["Alya Putri"], fileId: asmFile, uploadedBy: adminId });

  type NewSession = typeof sessions.$inferInsert;
  const hadir = (st: string, pr: string, tutorId: string, d: number, a: string, b: string): NewSession => ({
    studentId: S[st], programId: P[pr], tutorId, mulaiAt: at(d, a), selesaiAt: at(d, b),
    statusKehadiran: "hadir", absenAt: at(d, a), lat: -7.8441, lng: 110.3381, akurasiM: 12, catatanAdmin: "Data demo (tanpa foto)",
  });
  const terjadwal = (st: string, pr: string, tutorId: string, mulaiAt: Date, selesaiAt: Date): NewSession => ({
    studentId: S[st], programId: P[pr], tutorId, mulaiAt, selesaiAt,
  });
  const sesi = await db()
    .insert(sessions)
    .values([
      ...[-21, -14, -7, -2].map((d) => hadir("Budi Utama", "Privat Calistung", aulia, d, "16:00", "17:00")),
      ...[-20, -13, -6, -1].map((d) => hadir("Alya Putri", "ABK Calistung", dimas, d, "15:30", "17:00")),
      ...[-24, -17, -10, -3].map((d) => hadir("Siti Aminah", "Kelompok Fisika", rina, d, "18:20", "19:50")),
      // bisa langsung dicoba absen setelah seed
      terjadwal("Budi Utama", "Privat Calistung", aulia, nowPlus(10), nowPlus(70)),
      terjadwal("Alya Putri", "ABK Calistung", dimas, nowPlus(5), nowPlus(95)),
      terjadwal("Siti Aminah", "Kelompok Fisika", rina, nowPlus(15), nowPlus(105)),
      terjadwal("Budi Utama", "Privat Calistung", aulia, at(5, "16:00"), at(5, "17:00")),
      terjadwal("Alya Putri", "ABK Calistung", dimas, at(6, "15:30"), at(6, "17:00")),
      terjadwal("Siti Aminah", "Kelompok Fisika", rina, at(4, "18:20"), at(4, "19:50")),
    ])
    .returning({ id: sessions.id, studentId: sessions.studentId, status: sessions.statusKehadiran });

  // laporan
  const repFile = await storePdf("report", "Laporan Budi - Oktober.pdf", minimalPdf("Laporan Perkembangan - Budi Utama", ["Program: Privat Calistung", "Tentor: Kak Aulia", "Membaca: lancar suku kata 2", "Menulis: rapi, perlu latihan huruf kapital"]), aulia);
  await db().insert(progressReports).values({ studentId: S["Budi Utama"], programId: P["Privat Calistung"], tutorId: aulia, fileId: repFile, periode: "Oktober 2026" });

  // bank materi
  const mats: [string, string, string][] = [
    ["Modul Calistung Jilid 1 (Mengenal Huruf)", "Calistung", "TK/SD"],
    ["Bank Soal Latihan TKA SD Paket A", "TKA SD", "Kelas 6 SD"],
    ["Rangkuman Rumus & Soal Fisika Dasar", "Fisika", "SMP"],
  ];
  for (const [i, [judul, kategori, jenjang]] of mats.entries()) {
    const fid = await storePdf("material", `${judul}.pdf`, minimalPdf(judul, [`Kategori: ${kategori}`, `Jenjang: ${jenjang}`, "File contoh untuk demo."]), adminId);
    await db().insert(materials).values({ judul, kategori, jenjang, fileId: fid, uploadedBy: adminId, updatedAt: new Date(Date.now() - (i * 3 + 2) * 86400_000) });
  }

  // invoice contoh lewat service yang sama dengan UI
  const adminActor: Actor = { id: adminId, role: "admin", status: "aktif", nama: "Admin Bimbel" };
  const sitiIds = sesi.filter((s) => s.studentId === S["Siti Aminah"] && s.status === "hadir").map((s) => s.id);
  const inv1 = await issueInvoice(adminActor, S["Siti Aminah"], P["Kelompok Fisika"], sitiIds.slice(0, 2));
  await issueInvoice(adminActor, S["Siti Aminah"], P["Kelompok Fisika"], sitiIds.slice(2));
  await setPaid(adminActor, inv1.id, true, todayWib());

  log(`Seed demo selesai. Password semua akun: ${DEMO_PASSWORD}`);
  log("  superadmin@bimbel.test (Super Admin) | admin@bimbel.test (Admin)");
  log("  aulia@bimbel.test / dimas@bimbel.test / rina@bimbel.test (Tentor)");
  return true;
}

/** Pastikan baris pengaturan ada. */
export async function ensureSettings() {
  await db().insert(appSettings).values({ id: 1 }).onConflictDoNothing();
}

/** Buat Super Admin pertama dari env bila belum ada akun sama sekali (untuk VPS). */
export async function bootstrapSuperAdmin(log: (m: string) => void = console.log) {
  const email = process.env.BOOTSTRAP_SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_SUPERADMIN_PASSWORD;
  if (!email || !password) return;
  const [{ n }] = await db().select({ n: count() }).from(users);
  if (n > 0) return;
  if (password.length < 12) throw new Error("BOOTSTRAP_SUPERADMIN_PASSWORD minimal 12 karakter");
  await db().insert(users).values({ email, passwordHash: await hashPassword(password), nama: "Super Admin", role: "super_admin" });
  log(`Super Admin awal dibuat: ${email}. Hapus BOOTSTRAP_SUPERADMIN_PASSWORD dari .env setelah login.`);
}

