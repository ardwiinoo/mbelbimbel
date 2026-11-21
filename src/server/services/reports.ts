import { aliasedTable, and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { files, programs, progressReports, studentPrograms, students, users } from "@/db/schema";
import { isAdminRole } from "@/lib/roles";
import { assertActive, assertTentor, UserError, type Actor } from "../authz";
import { withUploadedFile } from "../files";

type StudentMini = { nama: string; kelas: string | null; ortu_wa: string | null; ortu_nama: string | null };

export type ReportRow = {
  id: string;
  student_id: string;
  program_id: string | null;
  file_id: string;
  file_name: string;
  periode: string | null;
  catatan: string | null;
  uploaded_at: string;
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

const tutorUser = aliasedTable(users, "tutor_user");

/** Admin: semua laporan. Tentor: hanya laporan unggahannya (pengganti RLS progress_reports). */
export async function listReports(actor: Actor): Promise<ReportRow[]> {
  assertActive(actor);
  const admin = isAdminRole(actor.role);
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
    })
    .from(progressReports)
    .innerJoin(files, eq(files.id, progressReports.fileId))
    .innerJoin(students, eq(students.id, progressReports.studentId))
    .innerJoin(tutorUser, eq(tutorUser.id, progressReports.tutorId))
    .leftJoin(programs, eq(programs.id, progressReports.programId))
    .where(and(isNull(progressReports.deletedAt), admin ? undefined : eq(progressReports.tutorId, actor.id)))
    .orderBy(desc(progressReports.uploadedAt))
    .limit(200);
  return rows.map(({ r, ...x }) => ({
    id: r.id,
    student_id: r.studentId,
    program_id: r.programId,
    file_id: r.fileId,
    file_name: x.fileName,
    periode: r.periode,
    catatan: r.catatan,
    uploaded_at: r.uploadedAt.toISOString(),
    students: { nama: x.sNama, kelas: x.kelas, ortu_wa: x.ortuWa, ortu_nama: x.ortuNama },
    programs: x.pNama ? { nama: x.pNama } : null,
    profiles: { nama: x.tNama },
  }));
}

/** Siswa + program yang diampu tentor ini. */
export async function listMyAssignments(actor: Actor): Promise<AssignmentRow[]> {
  assertTentor(actor);
  const rows = await db()
    .select({ sp: studentPrograms, s: students, pNama: programs.nama })
    .from(studentPrograms)
    .innerJoin(students, eq(students.id, studentPrograms.studentId))
    .innerJoin(programs, eq(programs.id, studentPrograms.programId))
    .where(and(eq(studentPrograms.tutorId, actor.id), isNull(students.deletedAt)))
    .orderBy(asc(students.nama));
  return rows.map(({ sp, s, pNama }) => ({
    id: sp.id,
    student_id: sp.studentId,
    program_id: sp.programId,
    students: { nama: s.nama, kelas: s.kelas, ortu_wa: s.ortuWa, ortu_nama: s.ortuNama, status: s.status },
    programs: { nama: pNama },
  }));
}

/** Tentor upload laporan PDF untuk siswa+program yang ia ampu (pengganti RLS + Storage policy "reports"). */
export async function uploadReport(
  actor: Actor | null,
  input: { studentId: string; programId: string; periode: string | null; file: File | null },
) {
  assertTentor(actor);
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
