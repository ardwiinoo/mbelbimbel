import { and, asc, count, desc, eq, exists, gt, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, files, invoices, programs, sessions, studentAssessments, studentPrograms, students, users } from "@/db/schema";
import { rupiah } from "@/lib/format";
import { can } from "@/lib/access";
import { assertCan, assertSuperuser, scopeOf, UserError, type Actor } from "../authz";
import { detachFileRow, purgeStoredFiles, withUploadedFile } from "../files";
import { alias } from "drizzle-orm/pg-core";

const creatorUser = alias(users, "creator_user");
const updaterUser = alias(users, "updater_user");

export type StudentRow = {
  id: string;
  nama: string;
  /** Nama panggilan (opsional). Tampilan: panggilan ?? nama. */
  panggilan: string | null;
  tanggal_lahir: string | null;
  kelas: string | null;
  sekolah: string | null;
  alamat: string | null;
  ortu_nama: string | null;
  ortu_wa: string | null;
  status: "aktif" | "nonaktif";
  /** jejak "oleh siapa" (null untuk data lama sebelum fitur ini) */
  audit: { created_at: string; created_by: string | null; updated_at: string | null; updated_by: string | null };
  student_programs: {
    id: string;
    program_id: string;
    tutor_id: string | null;
    programs: { nama: string; kategori: string } | null;
    profiles: { nama: string } | null;
  }[];
  /** Hanya diisi untuk pemegang akses Asesmen. Selain itu tidak pernah dikirim. */
  student_assessments?: { id: string; file_id: string; file_name: string; uploaded_at: string }[];
};

/**
 * Daftar siswa sesuai hak akses (pengganti RLS students/student_programs):
 * - akses Data Siswa (Lihat): semua siswa + semua program (+ asesmen bila punya akses Asesmen)
 * - tentor: hanya siswa yang ia ampu, hanya baris program miliknya, TANPA asesmen
 *   dan TANPA data pribadi (alamat, sekolah, tanggal lahir, kontak orang tua) — hanya nama, kelas & program.
 */
export async function listStudents(actor: Actor): Promise<StudentRow[]> {
  const admin = scopeOf(actor, "siswa") === "all"; // "own" = tentor: hanya siswa yang diampu
  const withAssessment = can(actor, "asesmen", "read");

  const rowsWithAudit = await db()
    .select({ s: students, cNama: creatorUser.nama, uNama: updaterUser.nama })
    .from(students)
    .leftJoin(creatorUser, eq(creatorUser.id, students.createdBy))
    .leftJoin(updaterUser, eq(updaterUser.id, students.updatedBy))
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
  const studentRows = rowsWithAudit.map((r) => ({ ...r.s, cNama: r.cNama, uNama: r.uNama }));
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

  const asmRows = withAssessment
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
    panggilan: s.panggilan,
    tanggal_lahir: admin ? s.tanggalLahir : null,
    kelas: s.kelas,
    sekolah: admin ? s.sekolah : null,
    alamat: admin ? s.alamat : null,
    ortu_nama: admin ? s.ortuNama : null,
    ortu_wa: admin ? s.ortuWa : null,
    status: s.status,
    audit: { created_at: s.createdAt.toISOString(), created_by: s.cNama, updated_at: s.updatedAt?.toISOString() ?? null, updated_by: s.uNama },
    student_programs: spRows
      .filter((r) => r.studentId === s.id)
      .map((r) => ({
        id: r.id,
        program_id: r.programId,
        tutor_id: r.tutorId,
        programs: { nama: r.programNama, kategori: r.kategori },
        profiles: r.tutorNama ? { nama: r.tutorNama } : null,
      })),
    ...(withAssessment
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
  panggilan: opt,
  tanggal_lahir: opt,
  kelas: opt,
  sekolah: opt,
  alamat: opt,
  ortu_nama: opt,
  ortu_wa: opt,
  status: z.enum(["aktif", "nonaktif"]),
  programs: z
    .array(z.object({ program_id: z.string().uuid(), tutor_id: z.string().uuid().nullable(), /** program asal baris ini sebelum diganti (dikirim form agar pasangan lama→baru jelas) */ dari: z.string().uuid().nullish() }))
    .refine((a) => new Set(a.map((x) => x.program_id)).size === a.length, "Program tidak boleh dobel"),
});
export type StudentInput = z.input<typeof studentSchema>;

export async function saveStudent(actor: Actor | null, input: StudentInput) {
  assertCan(actor, "siswa", "write");
  const parsed = studentSchema.safeParse(input);
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  const { id, programs: progs, ...v } = parsed.data;
  const data = {
    nama: v.nama,
    panggilan: v.panggilan,
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
      const r = await tx
        .update(students)
        .set({ ...data, updatedAt: new Date(), updatedBy: actor.id })
        .where(and(eq(students.id, id), isNull(students.deletedAt)))
        .returning({ id: students.id });
      if (!r.length) throw new UserError("Siswa tidak ditemukan");
    } else {
      const [r] = await tx.insert(students).values({ ...data, createdBy: actor.id }).returning({ id: students.id });
      studentId = r.id;
    }
    // sinkronkan program + tentor pengampu
    const keep = progs.map((p) => p.program_id);
    const before = id ? (await tx.select({ p: studentPrograms.programId }).from(studentPrograms).where(eq(studentPrograms.studentId, studentId!))).map((x) => x.p) : [];
    const removed = before.filter((p) => !keep.includes(p));
    const added = keep.filter((p) => !before.includes(p));
    await tx
      .delete(studentPrograms)
      .where(and(eq(studentPrograms.studentId, studentId!), keep.length ? notInArray(studentPrograms.programId, keep) : undefined));
    for (const p of progs) {
      await tx
        .insert(studentPrograms)
        .values({ studentId: studentId!, programId: p.program_id, tutorId: p.tutor_id, createdBy: actor.id })
        .onConflictDoUpdate({
          target: [studentPrograms.studentId, studentPrograms.programId],
          set: { tutorId: p.tutor_id, updatedAt: new Date(), updatedBy: actor.id },
        });
    }

    // Program diganti: sesi yang BELUM direkap/ditagih ikut pindah ke program baru, sehingga tagihannya memakai tarif baru.
    // Sesi yang sudah masuk invoice (data lama) tidak disentuh; honor yang sudah lunas tetap utuh (tarif di-snapshot per sesi).
    // Pasangan lama→baru diambil dari baris form (dari → program_id). Sisa sesi dari program yang tidak lagi diikuti
    // dan tak berpasangan ikut ke satu program tujuan yang jelas (program baru yang belum berpasangan, atau satu-satunya pasangan).
    const pairs = progs.filter((p) => p.dari && p.dari !== p.program_id && !keep.includes(p.dari) && before.includes(p.dari)).map((p) => ({ dari: p.dari!, ke: p.program_id }));
    const pairedFrom = new Set(pairs.map((x) => x.dari));
    const pairedTo = new Set(pairs.map((x) => x.ke));
    const unpairedAdded = added.filter((x) => !pairedTo.has(x));
    const plan = [...pairs];
    // Sisa sesi (dari program yang dilepas / sudah yatim) ikut ke satu program tujuan yang jelas
    const leftoverTarget = unpairedAdded.length === 1 ? unpairedAdded[0] : pairs.length === 1 && unpairedAdded.length === 0 ? pairs[0].ke : null;
    if (removed.length > 0 && leftoverTarget) plan.push({ dari: "*", ke: leftoverTarget });
    const movedInfo: { dari: string; ke: string; n: number }[] = [];
    for (const step of plan) {
      const cond = [eq(sessions.studentId, studentId!), eq(sessions.statusTagihan, "belum_rekap"), isNull(sessions.invoiceId)];
      if (step.dari === "*") {
        // sisa: semua sesi belum ditagih dari program yang tidak diikuti lagi dan belum dipasangkan
        const skip = [...keep, ...pairedFrom];
        cond.push(notInArray(sessions.programId, skip));
      } else {
        cond.push(eq(sessions.programId, step.dari));
      }
      const moved = await tx
        .update(sessions)
        .set({ programId: step.ke, updatedAt: new Date(), updatedBy: actor.id })
        .where(and(...cond))
        .returning({ id: sessions.id });
      if (moved.length) movedInfo.push({ dari: step.dari, ke: step.ke, n: moved.length });
    }
    let note = "";
    if (movedInfo.length) {
      const ids = [...new Set(movedInfo.flatMap((m) => [m.ke, ...(m.dari === "*" ? [] : [m.dari])]))];
      const names = new Map((await tx.select({ id: programs.id, nama: programs.nama, tarif: programs.tarifPerPertemuan }).from(programs).where(inArray(programs.id, ids))).map((p) => [p.id, p] as const));
      const total = movedInfo.reduce((s, m) => s + m.n, 0);
      const ringkas = [...new Set(movedInfo.map((m) => m.ke))].map((k) => `${names.get(k)?.nama} (${rupiah(names.get(k)?.tarif ?? 0)} / pertemuan)`).join(", ");
      await tx.insert(auditLog).values({
        actorId: actor.id,
        aksi: "pindah_program_sesi",
        target: studentId!,
        detail: { sesi: total, pindah: movedInfo.map((m) => ({ dari: m.dari === "*" ? "program lama" : names.get(m.dari)?.nama, ke: names.get(m.ke)?.nama, sesi: m.n })) },
      });
      note = `. ${total} sesi yang belum ditagih dipindah ke ${ringkas}`;
    } else if (removed.length > 0 && added.length > 0 && pairs.length === 0 && unpairedAdded.length !== 1) {
      note = ". Beberapa program berubah tanpa pasangan yang jelas, sesi yang sudah ada tidak dipindahkan otomatis";
    }
    return { id: studentId!, message: id ? `Data siswa diperbarui${note}` : "Siswa ditambahkan" };
  });
}

export type StudentDeleteSummary = {
  nama: string;
  /** Sesi Hadir yang belum masuk invoice (belum ditagih dan belum dibebaskan) */
  hadir_belum_ditagih: number;
  invoice_belum_lunas: number;
  /** Sesi yang masih terjadwal; akan dibatalkan saat siswa dihapus */
  sesi_terjadwal: number;
};

type Q = Pick<typeof import("@/db").db extends () => infer D ? D : never, "select">;
async function deleteSummary(q: Q, studentId: string): Promise<StudentDeleteSummary | null> {
  const [st] = await q.select({ nama: students.nama }).from(students).where(and(eq(students.id, studentId), isNull(students.deletedAt)));
  if (!st) return null;
  const [hadir] = await q
    .select({ n: count() })
    .from(sessions)
    .where(and(eq(sessions.studentId, studentId), eq(sessions.statusKehadiran, "hadir"), eq(sessions.statusTagihan, "belum_rekap"), isNull(sessions.invoiceId)));
  const [inv] = await q.select({ n: count() }).from(invoices).where(and(eq(invoices.studentId, studentId), eq(invoices.statusBayar, "belum_lunas")));
  const [jad] = await q.select({ n: count() }).from(sessions).where(and(eq(sessions.studentId, studentId), eq(sessions.statusKehadiran, "terjadwal")));
  return { nama: st.nama, hadir_belum_ditagih: hadir.n, invoice_belum_lunas: inv.n, sesi_terjadwal: jad.n };
}

/** Ringkasan data terkait sebelum menghapus siswa (untuk dialog konfirmasi). */
export async function studentDeleteSummary(actor: Actor | null, id: string): Promise<StudentDeleteSummary> {
  assertCan(actor, "siswa", "write");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new UserError("Siswa tidak ditemukan");
  const s = await deleteSummary(db(), id);
  if (!s) throw new UserError("Siswa tidak ditemukan");
  return s;
}

/**
 * Bebaskan tagihan: sesi Hadir siswa yang belum ditagih ditandai "dibebaskan" (tidak akan ditagihkan, mis. siswa berhenti).
 * Sesi tidak dihapus, jadi honor tentor untuk sesi itu tetap dihitung. Tercatat di audit log. Butuh akses Kelola Invoice.
 */
export async function waiveStudentBilling(actor: Actor | null, studentId: string) {
  assertCan(actor, "invoice", "write");
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) throw new UserError("Siswa tidak ditemukan");
  return db().transaction(async (tx) => {
    const [st] = await tx.select({ nama: students.nama }).from(students).where(and(eq(students.id, studentId), isNull(students.deletedAt)));
    if (!st) throw new UserError("Siswa tidak ditemukan");
    const moved = await tx
      .update(sessions)
      .set({ statusTagihan: "dibebaskan", updatedAt: new Date(), updatedBy: actor.id })
      .where(and(eq(sessions.studentId, studentId), eq(sessions.statusKehadiran, "hadir"), eq(sessions.statusTagihan, "belum_rekap"), isNull(sessions.invoiceId)))
      .returning({ id: sessions.id });
    if (!moved.length) throw new UserError("Tidak ada sesi yang perlu dibebaskan");
    await tx.insert(auditLog).values({ actorId: actor.id, aksi: "bebaskan_tagihan", target: studentId, detail: { siswa: st.nama, sesi: moved.length } });
    return `${moved.length} sesi dibebaskan dari tagihan (honor tentor tetap dihitung).`;
  });
}

/**
 * Hapus siswa (soft delete). Ditolak bila masih ada tagihan terbuka (sesi Hadir belum ditagih atau invoice belum lunas):
 * selesaikan dulu (terbitkan/lunasi, hapus invoice, atau bebaskan tagihan). Sesi yang masih terjadwal dibatalkan otomatis.
 * Invoice lunas, honor, dan riwayat sesi Hadir tetap sebagai arsip.
 */
export async function softDeleteStudent(actor: Actor | null, id: string) {
  assertCan(actor, "siswa", "write");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new UserError("Siswa tidak ditemukan");
  return db().transaction(async (tx) => {
    await tx.select({ id: students.id }).from(students).where(eq(students.id, id)).for("update");
    const sum = await deleteSummary(tx, id);
    if (!sum) throw new UserError("Siswa tidak ditemukan");
    if (sum.hadir_belum_ditagih > 0 || sum.invoice_belum_lunas > 0) {
      const bagian = [
        sum.hadir_belum_ditagih > 0 ? `${sum.hadir_belum_ditagih} sesi Hadir belum ditagih` : "",
        sum.invoice_belum_lunas > 0 ? `${sum.invoice_belum_lunas} invoice belum lunas` : "",
      ].filter(Boolean);
      throw new UserError(`${sum.nama} masih punya ${bagian.join(" dan ")}. Selesaikan atau bebaskan tagihannya dulu.`);
    }
    await tx
      .update(students)
      .set({ deletedAt: new Date(), deletedBy: actor.id, status: "nonaktif", updatedAt: new Date(), updatedBy: actor.id })
      .where(eq(students.id, id));
    const batal = await tx
      .update(sessions)
      .set({ statusKehadiran: "batal", catatanAdmin: AUTO_BATAL, updatedAt: new Date(), updatedBy: actor.id })
      .where(and(eq(sessions.studentId, id), eq(sessions.statusKehadiran, "terjadwal")))
      .returning({ id: sessions.id });
    await tx.insert(auditLog).values({ actorId: actor.id, aksi: "hapus_siswa", target: id, detail: { siswa: sum.nama, sesi_dibatalkan: batal.length } });
    return batal.length ? `Siswa dihapus. ${batal.length} sesi terjadwal dibatalkan.` : "Siswa dihapus (soft delete)";
  });
}

const AUTO_BATAL = "Dibatalkan otomatis: siswa dihapus";

export type DeletedStudentRow = {
  id: string;
  nama: string;
  kelas: string | null;
  programs: string[];
  deleted_at: string;
  deleted_by: string | null;
  sesi_hadir: number;
  sesi_dibebaskan: number;
  sesi_batal_otomatis: number;
  invoice_lunas: number;
  invoice_belum_lunas: number;
};

/** Daftar siswa yang dihapus (soft delete) beserta ringkasan data terkait. Hanya Super Admin. */
export async function listDeletedStudents(actor: Actor | null): Promise<DeletedStudentRow[]> {
  assertSuperuser(actor);
  const deleter = alias(users, "deleter_user");
  const rows = await db()
    .select({ s: students, oleh: deleter.nama })
    .from(students)
    .leftJoin(deleter, eq(deleter.id, students.deletedBy))
    .where(isNotNull(students.deletedAt))
    .orderBy(desc(students.deletedAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.s.id);
  const progRows = await db()
    .select({ sid: studentPrograms.studentId, nama: programs.nama })
    .from(studentPrograms)
    .innerJoin(programs, eq(programs.id, studentPrograms.programId))
    .where(inArray(studentPrograms.studentId, ids));
  const sesRows = await db()
    .select({ sid: sessions.studentId, k: sessions.statusKehadiran, t: sessions.statusTagihan, cat: sessions.catatanAdmin, n: count() })
    .from(sessions)
    .where(inArray(sessions.studentId, ids))
    .groupBy(sessions.studentId, sessions.statusKehadiran, sessions.statusTagihan, sessions.catatanAdmin);
  const invRows = await db()
    .select({ sid: invoices.studentId, st: invoices.statusBayar, n: count() })
    .from(invoices)
    .where(inArray(invoices.studentId, ids))
    .groupBy(invoices.studentId, invoices.statusBayar);
  return rows.map(({ s, oleh }) => {
    const mine = sesRows.filter((x) => x.sid === s.id);
    const sum = (f: (x: (typeof mine)[number]) => boolean) => mine.filter(f).reduce((a, x) => a + x.n, 0);
    const inv = invRows.filter((x) => x.sid === s.id);
    return {
      id: s.id,
      nama: s.nama,
      kelas: s.kelas,
      programs: [...new Set(progRows.filter((p) => p.sid === s.id).map((p) => p.nama))],
      deleted_at: s.deletedAt!.toISOString(),
      deleted_by: oleh,
      sesi_hadir: sum((x) => x.k === "hadir"),
      sesi_dibebaskan: sum((x) => x.k === "hadir" && x.t === "dibebaskan"),
      sesi_batal_otomatis: sum((x) => x.k === "batal" && x.cat === AUTO_BATAL),
      invoice_lunas: inv.filter((x) => x.st === "lunas").reduce((a, x) => a + x.n, 0),
      invoice_belum_lunas: inv.filter((x) => x.st === "belum_lunas").reduce((a, x) => a + x.n, 0),
    };
  });
}

/**
 * Pulihkan siswa yang dihapus (Super Admin): aktif kembali di Data Siswa. Sesi yang dibatalkan otomatis saat penghapusan
 * dan jamnya belum lewat dikembalikan ke terjadwal; yang jamnya sudah lewat tetap batal. Data lain tidak berubah.
 */
export async function restoreStudent(actor: Actor | null, id: string) {
  assertSuperuser(actor);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new UserError("Siswa tidak ditemukan");
  return db().transaction(async (tx) => {
    const [st] = await tx.select({ nama: students.nama }).from(students).where(and(eq(students.id, id), isNotNull(students.deletedAt))).for("update");
    if (!st) throw new UserError("Siswa tidak ditemukan di data terhapus");
    await tx
      .update(students)
      .set({ deletedAt: null, deletedBy: null, status: "aktif", updatedAt: new Date(), updatedBy: actor.id })
      .where(eq(students.id, id));
    const back = await tx
      .update(sessions)
      .set({ statusKehadiran: "terjadwal", catatanAdmin: null, updatedAt: new Date(), updatedBy: actor.id })
      .where(and(eq(sessions.studentId, id), eq(sessions.statusKehadiran, "batal"), eq(sessions.catatanAdmin, AUTO_BATAL), gt(sessions.mulaiAt, new Date())))
      .returning({ id: sessions.id });
    await tx.insert(auditLog).values({ actorId: actor.id, aksi: "pulihkan_siswa", target: id, detail: { siswa: st.nama, sesi_dipulihkan: back.length } });
    return back.length ? `${st.nama} dipulihkan. ${back.length} sesi terjadwal dikembalikan.` : `${st.nama} dipulihkan.`;
  });
}

/**
 * Upload / ganti dokumen asesmen ABK — butuh akses Asesmen (Kelola).
 * Satu siswa = satu dokumen aktif: dokumen lama dihapus (DB + disk) saat diganti.
 */
export async function addAssessment(actor: Actor | null, studentId: string, file: File | null) {
  assertCan(actor, "asesmen", "write");
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
