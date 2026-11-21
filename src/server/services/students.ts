import { and, asc, eq, exists, inArray, isNull, notInArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, files, programs, studentAssessments, studentPrograms, students, users } from "@/db/schema";
import { isAdminRole } from "@/lib/roles";
import { assertActive, assertAdmin, UserError, type Actor } from "../authz";
import { detachFileRow, purgeStoredFiles, withUploadedFile } from "../files";

export type StudentRow = {
  id: string;
  nama: string;
  tanggal_lahir: string | null;
  kelas: string | null;
  sekolah: string | null;
  alamat: string | null;
  ortu_nama: string | null;
  ortu_wa: string | null;
  status: "aktif" | "nonaktif";
  student_programs: {
    id: string;
    program_id: string;
    tutor_id: string | null;
    programs: { nama: string; kategori: string } | null;
    profiles: { nama: string } | null;
  }[];
  /** Hanya diisi untuk admin. Tentor tidak pernah menerima data asesmen. */
  student_assessments?: { id: string; file_id: string; file_name: string; uploaded_at: string }[];
};

/**
 * Daftar siswa sesuai hak akses (pengganti RLS students/student_programs):
 * - admin: semua siswa + semua program + asesmen
 * - tentor: hanya siswa yang ia ampu, hanya baris program miliknya, TANPA asesmen
 */
export async function listStudents(actor: Actor): Promise<StudentRow[]> {
  assertActive(actor);
  const admin = isAdminRole(actor.role);

  const studentRows = await db()
    .select()
    .from(students)
    .where(
      and(
        isNull(students.deletedAt),
        admin
          ? undefined
          : exists(
              db()
                .select({ x: studentPrograms.id })
                .from(studentPrograms)
                .where(and(eq(studentPrograms.studentId, students.id), eq(studentPrograms.tutorId, actor.id))),
            ),
      ),
    )
    .orderBy(asc(students.nama));
  if (!studentRows.length) return [];
  const ids = studentRows.map((s) => s.id);

  const spRows = await db()
    .select({
      id: studentPrograms.id,
      studentId: studentPrograms.studentId,
      programId: studentPrograms.programId,
      tutorId: studentPrograms.tutorId,
      programNama: programs.nama,
      kategori: programs.kategori,
      tutorNama: users.nama,
    })
    .from(studentPrograms)
    .innerJoin(programs, eq(programs.id, studentPrograms.programId))
    .leftJoin(users, eq(users.id, studentPrograms.tutorId))
    .where(and(inArray(studentPrograms.studentId, ids), admin ? undefined : eq(studentPrograms.tutorId, actor.id)));

  const asmRows = admin
    ? await db()
        .select({
          id: studentAssessments.id,
          studentId: studentAssessments.studentId,
          fileId: files.id,
          fileName: files.originalName,
          uploadedAt: studentAssessments.uploadedAt,
        })
        .from(studentAssessments)
        .innerJoin(files, eq(files.id, studentAssessments.fileId))
        .where(inArray(studentAssessments.studentId, ids))
    : [];

  return studentRows.map((s) => ({
    id: s.id,
    nama: s.nama,
    tanggal_lahir: s.tanggalLahir,
    kelas: s.kelas,
    sekolah: s.sekolah,
    alamat: s.alamat,
    ortu_nama: s.ortuNama,
    ortu_wa: s.ortuWa,
    status: s.status,
    student_programs: spRows
      .filter((r) => r.studentId === s.id)
      .map((r) => ({
        id: r.id,
        program_id: r.programId,
        tutor_id: r.tutorId,
        programs: { nama: r.programNama, kategori: r.kategori },
        profiles: r.tutorNama ? { nama: r.tutorNama } : null,
      })),
    ...(admin
      ? {
          student_assessments: asmRows
            .filter((a) => a.studentId === s.id)
            .map((a) => ({ id: a.id, file_id: a.fileId, file_name: a.fileName, uploaded_at: a.uploadedAt.toISOString() })),
        }
      : {}),
  }));
}

const opt = z.string().trim().optional().transform((v) => v || null);
export const studentSchema = z.object({
  id: z.string().uuid().optional(),
  nama: z.string().trim().min(2, "Nama minimal 2 huruf"),
  tanggal_lahir: opt,
  kelas: opt,
  sekolah: opt,
  alamat: opt,
  ortu_nama: opt,
  ortu_wa: opt,
  status: z.enum(["aktif", "nonaktif"]),
  programs: z
    .array(z.object({ program_id: z.string().uuid(), tutor_id: z.string().uuid().nullable() }))
    .refine((a) => new Set(a.map((x) => x.program_id)).size === a.length, "Program tidak boleh dobel"),
});
export type StudentInput = z.input<typeof studentSchema>;

export async function saveStudent(actor: Actor | null, input: StudentInput) {
  assertAdmin(actor);
  const parsed = studentSchema.safeParse(input);
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  const { id, programs: progs, ...v } = parsed.data;
  const data = {
    nama: v.nama,
    tanggalLahir: v.tanggal_lahir,
    kelas: v.kelas,
    sekolah: v.sekolah,
    alamat: v.alamat,
    ortuNama: v.ortu_nama,
    ortuWa: v.ortu_wa,
    status: v.status,
  };

  return db().transaction(async (tx) => {
    let studentId = id;
    if (id) {
      const r = await tx.update(students).set(data).where(and(eq(students.id, id), isNull(students.deletedAt))).returning({ id: students.id });
      if (!r.length) throw new UserError("Siswa tidak ditemukan");
    } else {
      const [r] = await tx.insert(students).values(data).returning({ id: students.id });
      studentId = r.id;
    }
    // sinkronkan program + tentor pengampu
    const keep = progs.map((p) => p.program_id);
    await tx
      .delete(studentPrograms)
      .where(and(eq(studentPrograms.studentId, studentId!), keep.length ? notInArray(studentPrograms.programId, keep) : undefined));
    for (const p of progs) {
      await tx
        .insert(studentPrograms)
        .values({ studentId: studentId!, programId: p.program_id, tutorId: p.tutor_id })
        .onConflictDoUpdate({ target: [studentPrograms.studentId, studentPrograms.programId], set: { tutorId: p.tutor_id } });
    }
    return { id: studentId!, message: id ? "Data siswa diperbarui" : "Siswa ditambahkan" };
  });
}

export async function softDeleteStudent(actor: Actor | null, id: string) {
  assertAdmin(actor);
  const r = await db()
    .update(students)
    .set({ deletedAt: new Date(), status: "nonaktif" })
    .where(and(eq(students.id, id), isNull(students.deletedAt)))
    .returning({ id: students.id });
  if (!r.length) throw new UserError("Siswa tidak ditemukan");
  await db().insert(auditLog).values({ actorId: actor.id, aksi: "hapus_siswa", target: id });
  return "Siswa dihapus (soft delete)";
}

/**
 * Upload / ganti dokumen asesmen ABK — khusus admin (pengganti RLS + Storage policy "assessments").
 * Satu siswa = satu dokumen aktif: dokumen lama dihapus (DB + disk) saat diganti.
 */
export async function addAssessment(actor: Actor | null, studentId: string, file: File | null) {
  assertAdmin(actor);
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) throw new UserError("Siswa tidak ditemukan");
  const [s] = await db().select({ id: students.id }).from(students).where(and(eq(students.id, studentId), isNull(students.deletedAt))).limit(1);
  if (!s) throw new UserError("Siswa tidak ditemukan");
  const oldKeys = await withUploadedFile("assessment", file, actor, async (tx, fileId) => {
    const old = await tx
      .delete(studentAssessments)
      .where(eq(studentAssessments.studentId, studentId))
      .returning({ fileId: studentAssessments.fileId });
    await tx.insert(studentAssessments).values({ studentId, fileId, uploadedBy: actor.id });
    const keys: (string | null)[] = [];
    for (const o of old) keys.push(await detachFileRow(tx, o.fileId));
    return keys;
  });
  await purgeStoredFiles(oldKeys);
  return oldKeys.length ? "Dokumen asesmen diganti (file lama dihapus)" : "Dokumen asesmen diunggah";
}
