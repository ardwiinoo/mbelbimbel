// HANYA development: tambah 4 siswa uji untuk mencoba fitur "Hapus siswa" (peringatan tagihan, bebaskan tagihan).
// Pakai: pnpm seed:uji-hapus   (aman dijalankan ulang; siswa yang sudah ada dilewati)
import { and, eq, isNull } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { programs, studentPrograms, students, users } from "../src/db/schema";
import { loadPermissions, type Actor } from "../src/server/authz";
import * as inv from "../src/server/services/invoices";
import * as ses from "../src/server/services/sessions";
import * as stu from "../src/server/services/students";

const wibHariIni = () => new Date(Date.now() + 7 * 3600_000);
const tgl = (offsetHari: number) => new Date(wibHariIni().getTime() + offsetHari * 86400_000).toISOString().slice(0, 10);

async function actor(email: string): Promise<Actor> {
  const [u] = await db().select().from(users).where(eq(users.email, email));
  if (!u) throw new Error(`Akun ${email} tidak ada. Jalankan pnpm db:reset dulu.`);
  return { id: u.id, nama: u.nama, status: u.status, isSuperuser: u.isSuperuser, isTutor: u.isTutor, perms: await loadPermissions(u.id) };
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (process.env.NODE_ENV === "production" || !/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error("seed:uji-hapus hanya boleh untuk database lokal (127.0.0.1/localhost)");
  }
  const admin = await actor("admin@bimbel.test");
  const tutor = await actor("aulia@bimbel.test");
  const [prog] = await db().select().from(programs).where(eq(programs.aktif, true)).orderBy(programs.nama).limit(1);

  async function siswa(nama: string, jam: string, hadir: string[], terjadwal: string[], opsi?: { invoice?: boolean; lunas?: boolean }) {
    const [ada] = await db().select({ id: students.id }).from(students).where(and(eq(students.nama, nama), isNull(students.deletedAt)));
    if (ada) return console.log(`- ${nama}: sudah ada, dilewati`);
    const s = await stu.saveStudent(admin, { nama, kelas: "Kelas 3 SD", status: "aktif", programs: [{ program_id: prog.id, tutor_id: tutor.id }] });
    const [sp] = await db().select().from(studentPrograms).where(eq(studentPrograms.studentId, s.id));
    const jamSelesai = `${String(Number(jam.slice(0, 2)) + 1).padStart(2, "0")}:00`;
    for (const t of [...hadir, ...terjadwal]) {
      await ses.createSessions(admin, { student_program_id: sp.id, tutor_id: tutor.id, tanggal: t, jam_mulai: jam, jam_selesai: jamSelesai, ulang_minggu: 1 });
    }
    const rows = await ses.listSessions(admin, { from: [...hadir, ...terjadwal].sort()[0], to: [...hadir, ...terjadwal].sort().at(-1)!, student: s.id });
    const wibTanggal = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
    for (const r of rows.filter((x) => hadir.includes(wibTanggal(x.mulai_at)))) {
      await ses.setAttendanceStatus(admin, r.id, "hadir", "data uji hapus siswa");
    }
    if (opsi?.invoice) {
      const ready = (await inv.listReadyToBill(admin)).filter((x) => x.student_id === s.id).map((x) => x.id);
      const t = await inv.issueInvoice(admin, s.id, prog.id, ready);
      if (opsi.lunas) await inv.setPaid(admin, t.id, true);
    }
    console.log(`- ${nama}: dibuat`);
  }

  console.log(`Program uji: ${prog.nama}, tentor: ${tutor.nama}`);
  const lalu = [tgl(-9), tgl(-5)];
  const depan = [tgl(3), tgl(10)];
  await siswa("Uji Hapus A (ada sesi Hadir belum ditagih)", "09:00", lalu, depan);
  await siswa("Uji Hapus B (invoice belum lunas)", "10:00", lalu, [], { invoice: true });
  await siswa("Uji Hapus C (bersih, hanya sesi terjadwal)", "11:00", [], depan);
  await siswa("Uji Hapus D (invoice sudah lunas)", "13:00", lalu, [tgl(4)], { invoice: true, lunas: true });
  console.log("\nSelesai. Buka Data Siswa, cari \"Uji Hapus\", lalu pilih ⋯ → Hapus siswa.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
