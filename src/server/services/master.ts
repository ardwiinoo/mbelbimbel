import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { appSettings, programs, studentPrograms, students, users } from "@/db/schema";
import { assertAdmin, UserError, type Actor } from "../authz";

// ---------- opsi dropdown (admin) ----------
export async function programOptions(actor: Actor) {
  assertAdmin(actor);
  return db()
    .select({ id: programs.id, nama: programs.nama, kategori: programs.kategori })
    .from(programs)
    .where(eq(programs.aktif, true))
    .orderBy(asc(programs.nama));
}

export async function tutorOptions(actor: Actor) {
  assertAdmin(actor);
  return db()
    .select({ id: users.id, nama: users.nama })
    .from(users)
    .where(and(eq(users.role, "tentor"), eq(users.status, "aktif")))
    .orderBy(asc(users.nama));
}

/** Pasangan siswa+program aktif untuk form jadwal. */
export async function studentProgramOptions(actor: Actor) {
  assertAdmin(actor);
  const rows = await db()
    .select({
      id: studentPrograms.id,
      tutorId: studentPrograms.tutorId,
      studentId: students.id,
      studentNama: students.nama,
      kelas: students.kelas,
      programNama: programs.nama,
    })
    .from(studentPrograms)
    .innerJoin(students, eq(students.id, studentPrograms.studentId))
    .innerJoin(programs, eq(programs.id, studentPrograms.programId))
    .where(and(eq(students.status, "aktif"), isNull(students.deletedAt)))
    .orderBy(asc(students.nama));
  return rows.map((r) => ({
    id: r.id,
    tutor_id: r.tutorId,
    students: { id: r.studentId, nama: r.studentNama, kelas: r.kelas },
    programs: { nama: r.programNama },
  }));
}

// ---------- tentor ----------
export async function listTutors(actor: Actor) {
  assertAdmin(actor);
  const rows = await db()
    .select({ id: users.id, nama: users.nama, email: users.email, noWa: users.noWa, spesialisasi: users.spesialisasi, status: users.status })
    .from(users)
    .where(eq(users.role, "tentor"))
    .orderBy(asc(users.nama));
  return rows.map((r) => ({ id: r.id, nama: r.nama, email: r.email, no_wa: r.noWa, spesialisasi: r.spesialisasi, status: r.status }));
}

const tutorSchema = z.object({
  id: z.string().uuid(),
  nama: z.string().trim().min(2, "Nama minimal 2 huruf"),
  spesialisasi: z.string().trim().min(2, "Spesialisasi wajib diisi"),
  no_wa: z.string().trim().optional().transform((v) => v || null),
});

/** Admin hanya boleh mengedit data profil TENTOR (bukan peran/status — itu Super Admin). */
export async function saveTutor(actor: Actor | null, input: z.input<typeof tutorSchema>) {
  assertAdmin(actor);
  const p = tutorSchema.safeParse(input);
  if (!p.success) throw new UserError(p.error.issues[0].message);
  const r = await db()
    .update(users)
    .set({ nama: p.data.nama, spesialisasi: p.data.spesialisasi, noWa: p.data.no_wa, updatedAt: new Date() })
    .where(and(eq(users.id, p.data.id), eq(users.role, "tentor")))
    .returning({ id: users.id });
  if (!r.length) throw new UserError("Tentor tidak ditemukan");
  return "Data tentor diperbarui";
}

// ---------- program & tarif (tarif hanya untuk admin) ----------
export async function listProgramsWithTarif(actor: Actor) {
  assertAdmin(actor);
  const rows = await db().select().from(programs).orderBy(asc(programs.nama));
  return rows.map((p) => ({
    id: p.id,
    nama: p.nama,
    kategori: p.kategori,
    jenjang: p.jenjang,
    tarif_per_pertemuan: p.tarifPerPertemuan,
    aktif: p.aktif,
  }));
}

const programSchema = z.object({
  id: z.string().uuid().optional(),
  nama: z.string().trim().min(2),
  kategori: z.enum(["privat", "kelompok", "abk"]),
  jenjang: z.string().trim().min(1, "Jenjang wajib diisi"),
  tarif_per_pertemuan: z.coerce.number().int().min(0, "Tarif tidak valid"),
  aktif: z.boolean(),
});

export async function saveProgram(actor: Actor | null, input: z.input<typeof programSchema>) {
  assertAdmin(actor);
  const p = programSchema.safeParse(input);
  if (!p.success) throw new UserError(p.error.issues[0].message);
  const { id, tarif_per_pertemuan, ...rest } = p.data;
  const data = { ...rest, tarifPerPertemuan: tarif_per_pertemuan };
  try {
    if (id) await db().update(programs).set(data).where(eq(programs.id, id));
    else await db().insert(programs).values(data);
  } catch (e) {
    if ((e as { cause?: { code?: string } }).cause?.code === "23505") throw new UserError("Nama program sudah ada");
    throw e;
  }
  return "Program disimpan. Invoice lama tidak terpengaruh.";
}

// ---------- pengaturan ----------
const settingsSchema = z.object({
  nama_bimbel: z.string().trim().min(2, "Nama bimbel wajib diisi"),
  alamat: z.string().trim().transform((v) => v || null),
  rekening: z.string().trim().transform((v) => v || null),
  wa_admin: z.string().trim().transform((v) => v || null),
  link_drive_konten: z
    .string()
    .trim()
    .refine((v) => !v || /^https:\/\//.test(v), "Link Drive harus diawali https://")
    .transform((v) => v || null),
  absen_buka_menit: z.coerce.number().int().min(0).max(240),
  absen_tutup_menit: z.coerce.number().int().min(0).max(480),
});

export async function saveSettings(actor: Actor | null, input: z.input<typeof settingsSchema>) {
  assertAdmin(actor);
  const p = settingsSchema.safeParse(input);
  if (!p.success) throw new UserError(p.error.issues[0].message);
  const v = p.data;
  const data = {
    namaBimbel: v.nama_bimbel,
    alamat: v.alamat,
    rekening: v.rekening,
    waAdmin: v.wa_admin,
    linkDriveKonten: v.link_drive_konten,
    absenBukaMenit: v.absen_buka_menit,
    absenTutupMenit: v.absen_tutup_menit,
    updatedAt: new Date(),
  };
  await db().insert(appSettings).values({ id: 1, ...data }).onConflictDoUpdate({ target: appSettings.id, set: data });
  return "Pengaturan disimpan";
}
