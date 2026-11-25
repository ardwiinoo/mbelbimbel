import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { appSettings, auditLog, programs, studentPrograms, students, tutorHonorRates, users } from "@/db/schema";
import { can } from "@/lib/access";
import { assertAny, assertCan, UserError, type Actor } from "../authz";
import { detachFileRow, purgeStoredFiles, withUploadedFile } from "../files";
import { assertMapelExist } from "./mapel";

/** Kunci kategori mapel (slug). Keberadaannya dicek di DB lewat assertMapelExist. */
const mapelKey = z.string().regex(/^[a-z0-9_]{2,30}$/, "Kategori mapel tidak valid");

// ---------- opsi dropdown (admin) ----------
export async function programOptions(actor: Actor) {
  assertAny(actor, [["siswa", "read"], ["jadwal", "read"], ["tentor", "read"]]); // nama program/tentor untuk filter & form
  const rows = await db()
    .select({ id: programs.id, nama: programs.nama, kategori: programs.kategori, tarif: programs.tarifPerPertemuan })
    .from(programs)
    .where(eq(programs.aktif, true))
    .orderBy(asc(programs.nama));
  // Tarif hanya dikirim ke akun yang boleh melihat Invoice (akun Siswa/Jadwal saja tidak perlu tahu nominal)
  const seeTarif = can(actor, "invoice", "read");
  return rows.map((p) => ({ id: p.id, nama: p.nama, kategori: p.kategori, tarif: seeTarif ? p.tarif : null }));
}

export async function tutorOptions(actor: Actor) {
  assertAny(actor, [["siswa", "read"], ["jadwal", "read"], ["tentor", "read"]]); // nama program/tentor untuk filter & form
  return db()
    .select({ id: users.id, nama: users.nama })
    .from(users)
    .where(and(eq(users.isTutor, true), eq(users.status, "aktif")))
    .orderBy(asc(users.nama));
}

/** Pasangan siswa+program aktif untuk form jadwal. */
export async function studentProgramOptions(actor: Actor) {
  assertCan(actor, "jadwal", "write");
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
  assertCan(actor, "tentor", "read");
  const rows = await db()
    .select({ id: users.id, nama: users.nama, email: users.email, noWa: users.noWa, spesialisasi: users.spesialisasi, mapel: users.mapelKategori, tarifHonor: users.tarifHonor, rekening: users.rekening, status: users.status })
    .from(users)
    .where(eq(users.isTutor, true))
    .orderBy(asc(users.nama));
  // Tarif honor & rekening hanya untuk pemegang akses Honor Tentor
  const honor = can(actor, "honor", "read");
  const rateRows = honor ? await db().select().from(tutorHonorRates) : [];
  return rows.map((r) => ({
    id: r.id,
    nama: r.nama,
    email: r.email,
    no_wa: r.noWa,
    spesialisasi: r.spesialisasi,
    mapel_kategori: r.mapel ?? "lainnya",
    tarif_honor: honor ? r.tarifHonor : null,
    tarif_mapel: honor ? rateRows.filter((x) => x.tutorId === r.id).map((x) => ({ mapel: x.mapelKategori, tarif: x.tarif })) : null,
    rekening: honor ? r.rekening : null,
    status: r.status,
  }));
}

const tutorSchema = z.object({
  id: z.string().uuid(),
  nama: z.string().trim().min(2, "Nama minimal 2 huruf"),
  spesialisasi: z.string().trim().min(2, "Spesialisasi wajib diisi"),
  mapel_kategori: mapelKey,
  tarif_honor: z.coerce.number().int("Tarif honor harus bilangan bulat").min(0, "Tarif honor tidak valid").max(10_000_000, "Tarif honor terlalu besar").optional(),
  tarif_mapel: z
    .array(z.object({ mapel: mapelKey, tarif: z.coerce.number().int("Tarif harus bilangan bulat").min(0, "Tarif tidak valid").max(10_000_000, "Tarif terlalu besar") }))
    .max(40)
    .refine((a) => new Set(a.map((x) => x.mapel)).size === a.length, "Mapel tidak boleh dobel pada tarif khusus")
    .optional(),
  rekening: z.string().trim().max(200, "Rekening maksimal 200 karakter").optional().transform((v) => (v === undefined ? undefined : v || null)),
  no_wa: z.string().trim().optional().transform((v) => v || null),
});

/** Admin hanya boleh mengedit data profil TENTOR (bukan peran/status — itu Super Admin). */
export async function saveTutor(actor: Actor | null, input: z.input<typeof tutorSchema>) {
  assertCan(actor, "tentor", "write");
  const p = tutorSchema.safeParse(input);
  if (!p.success) throw new UserError(p.error.issues[0].message);
  await assertMapelExist([p.data.mapel_kategori, ...(p.data.tarif_mapel ?? []).map((x) => x.mapel)]);
  // Tarif honor & rekening hanya diterapkan bila pengubah punya akses Honor (Kelola); selain itu diabaikan
  const honorFields = can(actor, "honor", "write")
    ? { ...(p.data.tarif_honor !== undefined && { tarifHonor: p.data.tarif_honor }), ...(p.data.rekening !== undefined && { rekening: p.data.rekening }) }
    : {};
  const canHonor = can(actor, "honor", "write");
  return db().transaction(async (tx) => {
    // Untuk jejak audit: nilai honor sebelum diubah
    const before = canHonor
      ? {
          user: (await tx.select({ nama: users.nama, tarif: users.tarifHonor, rek: users.rekening }).from(users).where(eq(users.id, p.data.id)))[0],
          rates: (await tx.select().from(tutorHonorRates).where(eq(tutorHonorRates.tutorId, p.data.id))).map((x) => ({ mapel: x.mapelKategori, tarif: x.tarif })).sort((a, b) => a.mapel.localeCompare(b.mapel)),
        }
      : null;
    const r = await tx
      .update(users)
      .set({ nama: p.data.nama, spesialisasi: p.data.spesialisasi, mapelKategori: p.data.mapel_kategori, noWa: p.data.no_wa, ...honorFields, updatedAt: new Date(), updatedBy: actor.id })
      .where(and(eq(users.id, p.data.id), eq(users.isTutor, true), actor.isSuperuser ? undefined : eq(users.isSuperuser, false)))
      .returning({ id: users.id });
    if (!r.length) throw new UserError("Tentor tidak ditemukan");
    // Tarif khusus per mapel: diganti utuh bila dikirim & pengubah punya akses Honor (Kelola)
    if (canHonor && p.data.tarif_mapel !== undefined) {
      await tx.delete(tutorHonorRates).where(eq(tutorHonorRates.tutorId, p.data.id));
      if (p.data.tarif_mapel.length) await tx.insert(tutorHonorRates).values(p.data.tarif_mapel.map((x) => ({ tutorId: p.data.id, mapelKategori: x.mapel, tarif: x.tarif })));
    }
    if (before?.user) {
      const after = p.data.tarif_mapel === undefined ? before.rates : [...p.data.tarif_mapel].sort((a, b) => a.mapel.localeCompare(b.mapel)).map((x) => ({ mapel: x.mapel, tarif: x.tarif }));
      const tarifBaru = p.data.tarif_honor ?? before.user.tarif;
      const rekBaru = p.data.rekening === undefined ? before.user.rek : p.data.rekening;
      const berubah = tarifBaru !== before.user.tarif || rekBaru !== before.user.rek || JSON.stringify(after) !== JSON.stringify(before.rates);
      if (berubah) {
        await tx.insert(auditLog).values({
          actorId: actor.id,
          aksi: "ubah_tarif_honor",
          target: p.data.id,
          detail: {
            tutor: before.user.nama,
            tarif_standar: [before.user.tarif, tarifBaru],
            tarif_mapel: [before.rates, after],
            // nomor rekening tidak disalin ke audit; cukup tercatat bahwa rekening diubah
            rekening_diubah: rekBaru !== before.user.rek,
          },
        });
      }
    }
    return "Data tentor diperbarui";
  });
}

// ---------- program & tarif (tarif hanya untuk admin) ----------
export async function listProgramsWithTarif(actor: Actor) {
  assertAny(actor, [["tentor", "read"], ["invoice", "read"]]); // halaman Invoice butuh tarif
  const rows = await db().select().from(programs).orderBy(asc(programs.nama));
  return rows.map((p) => ({
    id: p.id,
    nama: p.nama,
    kategori: p.kategori,
    mapel_kategori: p.mapelKategori,
    jenjang: p.jenjang,
    tarif_per_pertemuan: p.tarifPerPertemuan,
    aktif: p.aktif,
  }));
}

const programSchema = z.object({
  id: z.string().uuid().optional(),
  nama: z.string().trim().min(2),
  kategori: z.enum(["privat", "kelompok", "abk"]),
  mapel_kategori: mapelKey,
  jenjang: z.string().trim().min(1, "Jenjang wajib diisi"),
  tarif_per_pertemuan: z.coerce.number().int().min(0, "Tarif tidak valid"),
  aktif: z.boolean(),
});

export async function saveProgram(actor: Actor | null, input: z.input<typeof programSchema>) {
  assertCan(actor, "tentor", "write");
  const p = programSchema.safeParse(input);
  if (!p.success) throw new UserError(p.error.issues[0].message);
  await assertMapelExist([p.data.mapel_kategori]);
  const { id, tarif_per_pertemuan, mapel_kategori, ...rest } = p.data;
  const data = { ...rest, mapelKategori: mapel_kategori, tarifPerPertemuan: tarif_per_pertemuan };
  try {
    if (id) await db().update(programs).set({ ...data, updatedAt: new Date(), updatedBy: actor.id }).where(eq(programs.id, id));
    else await db().insert(programs).values({ ...data, createdBy: actor.id });
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
  absen_susulan_bebas: z.boolean(),
  tagline: z.string().trim().max(120, "Tagline maksimal 120 karakter").transform((v) => v || null),
  kota: z.string().trim().max(60, "Kota maksimal 60 karakter").transform((v) => v || null),
});

export async function saveSettings(actor: Actor | null, input: z.input<typeof settingsSchema>) {
  assertCan(actor, "pengaturan", "write");
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
    absenSusulanBebas: v.absen_susulan_bebas,
    tagline: v.tagline,
    kota: v.kota,
    updatedAt: new Date(),
    updatedBy: actor.id,
  };
  await db().insert(appSettings).values({ id: 1, ...data }).onConflictDoUpdate({ target: appSettings.id, set: data });
  return "Pengaturan disimpan";
}

/** Logo tampil di nota & slip: boleh diubah pemegang Kelola Pengaturan, Invoice, atau Honor (Super Admin otomatis). */
export function assertCanEditLogo(actor: Actor | null): asserts actor is Actor {
  if (actor && (can(actor, "pengaturan", "write") || can(actor, "invoice", "write") || can(actor, "honor", "write"))) return;
  assertCan(actor, "pengaturan", "write"); // melempar galat akses yang sama seperti biasa
}

/** Unggah / hapus logo bimbel (tampil di kop nota & slip PDF). File lama dihapus dari disk. */
export async function saveLogo(actor: Actor | null, input: { file: File | null; hapus: boolean }) {
  assertCanEditLogo(actor);
  const hasFile = !!input.file && input.file.size > 0;
  if (!hasFile && !input.hapus) throw new UserError("Pilih gambar logo");
  const write = async (tx: Tx, fileId?: string) => {
    await tx.insert(appSettings).values({ id: 1 }).onConflictDoNothing();
    const [cur] = await tx.select({ logo: appSettings.logoFileId }).from(appSettings).where(eq(appSettings.id, 1)).for("update");
    await tx.update(appSettings).set({ logoFileId: fileId ?? null, updatedAt: new Date(), updatedBy: actor.id }).where(eq(appSettings.id, 1));
    return detachFileRow(tx, cur?.logo);
  };
  const oldKey = hasFile ? await withUploadedFile("logo", input.file, actor, write) : await db().transaction((tx) => write(tx));
  await purgeStoredFiles([oldKey]);
  return hasFile ? "Logo disimpan" : "Logo dihapus";
}
