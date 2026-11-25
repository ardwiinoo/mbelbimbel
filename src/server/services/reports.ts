import { and, asc, count, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { auditLog, files, programs, progressReports, studentPrograms, students, users } from "@/db/schema";
import { can } from "@/lib/access";
import { assertActive, assertTutor, scopeOf, UserError, type Actor } from "../authz";
import { detachFileRow, purgeStoredFiles, withUploadedFile } from "../files";

type StudentMini = { nama: string; kelas: string | null; ortu_wa: string | null; ortu_nama: string | null };

export type ReportRow = {
  id: string;
  student_id: string;
  program_id: string | null;
  tutor_id: string;
  file_id: string;
  file_name: string;
  periode: string | null;
  catatan: string | null;
  uploaded_at: string;
  /** null bila belum pernah diedit */
  edited_at: string | null;
  edited_by: string | null;
  students: StudentMini | null;
  programs: { nama: string } | null;
  profiles: { nama: string } | null;
};

export type AssignmentRow = {
  id: string;
  student_id: string;
  program_id: string;
  students: (StudentMini & { status: string }) | null;
  programs: { nama: string } | null;
};

const tutorUser = alias(users, "tutor_user");
const editorUser = alias(users, "editor_user");

/** Pola ILIKE aman (escape % _ \) untuk pencarian teks bebas. */
export function likePattern(q: string) {
  return `%${q.trim().slice(0, 100).replace(/[\\%_]/g, (c) => "\\" + c)}%`;
}

/** mine = hanya laporan unggahan akun ini (untuk bagian "Laporan Siswa Saya"). */
export type ListOpts = { q?: string; page?: number; pageSize?: number; mine?: boolean };

/**
 * Admin: semua laporan. Tentor: hanya laporan unggahannya (pengganti RLS progress_reports).
 * Paging + pencarian dilakukan di DB (aman untuk data yang terus bertambah).
 */
export async function listReports(actor: Actor, opts: ListOpts = {}): Promise<{ rows: ReportRow[]; total: number }> {
  // Akses Laporan (Lihat) → semua; tanpa akses tapi Mengajar → hanya laporan unggahannya
  const admin = scopeOf(actor, "laporan") === "all";
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 500);
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const q = opts.q?.trim();
  const where = and(
    isNull(progressReports.deletedAt),
    admin && !opts.mine ? undefined : eq(progressReports.tutorId, actor.id),
    q
      ? or(
          ilike(students.nama, likePattern(q)),
          ilike(tutorUser.nama, likePattern(q)),
          ilike(programs.nama, likePattern(q)),
          ilike(progressReports.periode, likePattern(q)),
        )
      : undefined,
  );
  const [{ total }] = await db()
    .select({ total: count() })
    .from(progressReports)
    .innerJoin(students, eq(students.id, progressReports.studentId))
    .innerJoin(tutorUser, eq(tutorUser.id, progressReports.tutorId))
    .leftJoin(programs, eq(programs.id, progressReports.programId))
    .where(where);

  const rows = await db()
    .select({
      r: progressReports,
      fileName: files.originalName,
      sNama: students.nama,
      kelas: students.kelas,
      ortuWa: students.ortuWa,
      ortuNama: students.ortuNama,
      pNama: programs.nama,
      tNama: tutorUser.nama,
      eNama: editorUser.nama,
    })
    .from(progressReports)
    .innerJoin(files, eq(files.id, progressReports.fileId))
    .innerJoin(students, eq(students.id, progressReports.studentId))
    .innerJoin(tutorUser, eq(tutorUser.id, progressReports.tutorId))
    .leftJoin(programs, eq(programs.id, progressReports.programId))
    .leftJoin(editorUser, eq(editorUser.id, progressReports.updatedBy))
    .where(where)
    .orderBy(desc(progressReports.uploadedAt), desc(progressReports.id))
    .offset((page - 1) * pageSize)
    .limit(pageSize);
  // Revisi 24-11: tentor hanya perlu nama, kelas & jadwal. Kontak orang tua hanya untuk pemegang akses Data Siswa.
  const seeContact = can(actor, "siswa", "read");
  return { total, rows: rows.map(({ r, ...x }) => ({
    id: r.id,
    student_id: r.studentId,
    program_id: r.programId,
    tutor_id: r.tutorId,
    file_id: r.fileId,
    file_name: x.fileName,
    periode: r.periode,
    catatan: r.catatan,
    uploaded_at: r.uploadedAt.toISOString(),
    edited_at: r.updatedAt?.toISOString() ?? null,
    edited_by: r.updatedAt ? (x.eNama ?? "(akun dihapus)") : null,
    students: { nama: x.sNama, kelas: x.kelas, ortu_wa: seeContact ? x.ortuWa : null, ortu_nama: seeContact ? x.ortuNama : null },
    programs: x.pNama ? { nama: x.pNama } : null,
    profiles: { nama: x.tNama },
  })) };
}

/** Siswa + program yang diampu tentor ini. */
export async function listMyAssignments(actor: Actor): Promise<AssignmentRow[]> {
  assertTutor(actor);
  const rows = await db()
    .select({ sp: studentPrograms, s: students, pNama: programs.nama })
    .from(studentPrograms)
    .innerJoin(students, eq(students.id, studentPrograms.studentId))
    .innerJoin(programs, eq(programs.id, studentPrograms.programId))
    .where(and(eq(studentPrograms.tutorId, actor.id), isNull(students.deletedAt)))
    .orderBy(asc(students.nama));
  const seeContact = can(actor, "siswa", "read"); // tentor biasa: tanpa kontak orang tua
  return rows.map(({ sp, s, pNama }) => ({
    id: sp.id,
    student_id: sp.studentId,
    program_id: sp.programId,
    students: { nama: s.nama, kelas: s.kelas, ortu_wa: seeContact ? s.ortuWa : null, ortu_nama: seeContact ? s.ortuNama : null, status: s.status },
    programs: { nama: pNama },
  }));
}

/** Tentor upload laporan PDF untuk siswa+program yang ia ampu (pengganti RLS + Storage policy "reports"). */
export async function uploadReport(
  actor: Actor | null,
  input: { studentId: string; programId: string; periode: string | null; file: File | null },
) {
  assertTutor(actor);
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(input.studentId) || !uuid.test(input.programId)) throw new UserError("Data siswa tidak valid");
  const [own] = await db()
    .select({ id: studentPrograms.id })
    .from(studentPrograms)
    .innerJoin(students, eq(students.id, studentPrograms.studentId))
    .where(
      and(
        eq(studentPrograms.studentId, input.studentId),
        eq(studentPrograms.programId, input.programId),
        eq(studentPrograms.tutorId, actor.id),
        isNull(students.deletedAt),
      ),
    )
    .limit(1);
  if (!own) throw new UserError("Anda tidak mengampu siswa ini");

  await withUploadedFile("report", input.file, actor, async (tx, fileId) => {
    await tx.insert(progressReports).values({
      studentId: input.studentId,
      programId: input.programId,
      tutorId: actor.id,
      fileId,
      periode: input.periode?.trim().slice(0, 100) || null,
    });
  });
  return "Laporan terunggah";
}

/**
 * Edit laporan (ganti file PDF dan/atau periode) — untuk koreksi salah upload.
 * Akses Laporan (Kelola): semua laporan. Tentor: hanya laporan unggahannya sendiri.
 * Dicatat siapa & kapan mengedit; file lama dihapus agar storage tidak menumpuk.
 */
export async function updateReport(
  actor: Actor | null,
  input: { reportId: string; periode: string | null; file: File | null },
) {
  assertActive(actor);
  if (!/^[0-9a-f-]{36}$/i.test(input.reportId)) throw new UserError("Laporan tidak ditemukan");
  const [rep] = await db()
    .select({ id: progressReports.id, tutorId: progressReports.tutorId })
    .from(progressReports)
    .where(and(eq(progressReports.id, input.reportId), isNull(progressReports.deletedAt)))
    .limit(1);
  // 404 yang sama untuk "tidak ada" maupun "bukan milik Anda"
  // Boleh edit: akses Laporan (Kelola), ATAU tentor pengunggah laporan ini
  if (!rep || (!can(actor, "laporan", "write") && !(actor.isTutor && rep.tutorId === actor.id))) {
    throw new UserError("Laporan tidak ditemukan");
  }

  const patch = {
    periode: input.periode?.trim().slice(0, 100) || null,
    updatedAt: new Date(),
    updatedBy: actor.id,
  };
  const hasFile = !!input.file && input.file.size > 0;
  if (hasFile) {
    // Ganti file: arahkan ke file baru, hapus metadata file lama (1 transaksi),
    // lalu hapus file fisik lama setelah commit — supaya tidak menumpuk sampah.
    const oldKey = await withUploadedFile("report", input.file, actor, async (tx, fileId) => {
      const [cur] = await tx.select({ fileId: progressReports.fileId }).from(progressReports).where(eq(progressReports.id, rep.id)).for("update");
      await tx.update(progressReports).set({ ...patch, fileId }).where(eq(progressReports.id, rep.id));
      return detachFileRow(tx, cur?.fileId);
    });
    await purgeStoredFiles([oldKey]);
  } else {
    await db().update(progressReports).set(patch).where(eq(progressReports.id, rep.id));
  }
  return hasFile ? "Laporan diperbarui (file diganti)" : "Laporan diperbarui";
}

/**
 * Hapus laporan (mis. salah unggah): baris dan file PDF-nya dihapus permanen dari server.
 * Aturan akses sama dengan edit: akses Laporan (Kelola), atau tentor pengunggahnya. Tercatat di audit log.
 */
export async function deleteReport(actor: Actor | null, reportId: string) {
  assertActive(actor);
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) throw new UserError("Laporan tidak ditemukan");
  const key = await db().transaction(async (tx) => {
    const [rep] = await tx
      .select({ id: progressReports.id, tutorId: progressReports.tutorId, fileId: progressReports.fileId, periode: progressReports.periode, siswa: students.nama })
      .from(progressReports)
      .innerJoin(students, eq(students.id, progressReports.studentId))
      .where(and(eq(progressReports.id, reportId), isNull(progressReports.deletedAt)))
      .for("update", { of: progressReports });
    // 404 yang sama untuk "tidak ada" maupun "bukan milik Anda"
    if (!rep || (!can(actor, "laporan", "write") && !(actor.isTutor && rep.tutorId === actor.id))) {
      throw new UserError("Laporan tidak ditemukan");
    }
    await tx.delete(progressReports).where(eq(progressReports.id, rep.id));
    const k = await detachFileRow(tx, rep.fileId);
    await tx.insert(auditLog).values({ actorId: actor.id, aksi: "hapus_laporan", target: rep.id, detail: { siswa: rep.siswa, periode: rep.periode } });
    return k;
  });
  await purgeStoredFiles([key]);
  return "Laporan dihapus beserta filenya.";
}
