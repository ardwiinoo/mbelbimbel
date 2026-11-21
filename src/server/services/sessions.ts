import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "@/db";
import { appSettings, auditLog, programs, sessions, studentPrograms, students, users } from "@/db/schema";
import { isAdminRole } from "@/lib/roles";
import { wibToIso } from "@/lib/format";
import { assertActive, assertAdmin, assertTentor, UserError, type Actor } from "../authz";
import { detachFileRow, purgeStoredFiles, withUploadedFile } from "../files";

type Kehadiran = "terjadwal" | "hadir" | "tidak_hadir" | "batal";

export type SessionRow = {
  id: string;
  mulai_at: string;
  selesai_at: string;
  status_kehadiran: Kehadiran;
  status_tagihan: "belum_rekap" | "terekap";
  absen_at: string | null;
  foto_file_id: string | null;
  lat: number | null;
  lng: number | null;
  akurasi_m: number | null;
  catatan_admin: string | null;
  tutor_id: string;
  students: { id: string; nama: string; kelas: string | null } | null;
  programs: { nama: string } | null;
  profiles: { nama: string } | null;
};

export type SessionFilters = { from: string; to: string; tutor?: string; status?: string; student?: string };

const tutorUser = alias(users, "tutor_user");

/** Daftar sesi. Tentor SELALU dibatasi ke sesi miliknya (pengganti RLS sessions). */
export async function listSessions(actor: Actor, f: SessionFilters): Promise<SessionRow[]> {
  assertActive(actor);
  const admin = isAdminRole(actor.role);
  const status = ["terjadwal", "hadir", "tidak_hadir", "batal"].includes(f.status ?? "") ? (f.status as Kehadiran) : undefined;
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

  const rows = await db()
    .select({
      s: sessions,
      studentNama: students.nama,
      kelas: students.kelas,
      programNama: programs.nama,
      tutorNama: tutorUser.nama,
    })
    .from(sessions)
    .innerJoin(students, eq(students.id, sessions.studentId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .innerJoin(tutorUser, eq(tutorUser.id, sessions.tutorId))
    .where(
      and(
        gte(sessions.mulaiAt, new Date(wibToIso(f.from, "00:00"))),
        lte(sessions.mulaiAt, new Date(wibToIso(f.to, "23:59"))),
        admin ? (uuid(f.tutor) ? eq(sessions.tutorId, uuid(f.tutor)!) : undefined) : eq(sessions.tutorId, actor.id),
        status ? eq(sessions.statusKehadiran, status) : undefined,
        uuid(f.student) ? eq(sessions.studentId, uuid(f.student)!) : undefined,
      ),
    )
    .orderBy(asc(sessions.mulaiAt))
    .limit(300);

  return rows.map(({ s, studentNama, kelas, programNama, tutorNama }) => ({
    id: s.id,
    mulai_at: s.mulaiAt.toISOString(),
    selesai_at: s.selesaiAt.toISOString(),
    status_kehadiran: s.statusKehadiran,
    status_tagihan: s.statusTagihan,
    absen_at: s.absenAt?.toISOString() ?? null,
    foto_file_id: s.fotoFileId,
    lat: s.lat,
    lng: s.lng,
    akurasi_m: s.akurasiM,
    catatan_admin: s.catatanAdmin,
    tutor_id: s.tutorId,
    students: { id: s.studentId, nama: studentNama, kelas },
    programs: { nama: programNama },
    profiles: { nama: tutorNama },
  }));
}

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createSchema = z.object({
  student_program_id: z.string().uuid("Pilih siswa & program"),
  tutor_id: z.string().uuid("Pilih tentor"),
  tanggal: ymd.or(z.literal("")).refine((v) => v, "Tanggal wajib diisi"),
  jam_mulai: hhmm,
  jam_selesai: hhmm,
  ulang_minggu: z.coerce.number().int().min(1).max(12),
});

async function assertActiveTutor(tutorId: string) {
  const [t] = await db().select({ id: users.id }).from(users).where(and(eq(users.id, tutorId), eq(users.role, "tentor"), eq(users.status, "aktif"))).limit(1);
  if (!t) throw new UserError("Tentor tidak valid atau nonaktif");
}

export async function createSessions(actor: Actor | null, input: z.input<typeof createSchema>) {
  assertAdmin(actor);
  const p = createSchema.safeParse(input);
  if (!p.success) throw new UserError(p.error.issues[0].message);
  const v = p.data;
  if (v.jam_selesai <= v.jam_mulai) throw new UserError("Jam selesai harus setelah jam mulai");
  await assertActiveTutor(v.tutor_id);
  const [sp] = await db()
    .select({ studentId: studentPrograms.studentId, programId: studentPrograms.programId })
    .from(studentPrograms)
    .where(eq(studentPrograms.id, v.student_program_id))
    .limit(1);
  if (!sp) throw new UserError("Data siswa/program tidak ditemukan");

  const rows = Array.from({ length: v.ulang_minggu }, (_, i) => {
    const d = new Date(`${v.tanggal}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i * 7);
    const ds = d.toISOString().slice(0, 10);
    return {
      studentId: sp.studentId,
      programId: sp.programId,
      tutorId: v.tutor_id,
      mulaiAt: new Date(wibToIso(ds, v.jam_mulai)),
      selesaiAt: new Date(wibToIso(ds, v.jam_selesai)),
    };
  });
  await db().insert(sessions).values(rows);
  return `${rows.length} jadwal dibuat`;
}

const editSchema = z.object({ id: z.string().uuid(), tutor_id: z.string().uuid(), tanggal: ymd, jam_mulai: hhmm, jam_selesai: hhmm });

export async function updateSession(actor: Actor | null, input: z.input<typeof editSchema>) {
  assertAdmin(actor);
  const p = editSchema.safeParse(input);
  if (!p.success) throw new UserError("Data tidak valid");
  const v = p.data;
  if (v.jam_selesai <= v.jam_mulai) throw new UserError("Jam selesai harus setelah jam mulai");
  await assertActiveTutor(v.tutor_id);
  const r = await db()
    .update(sessions)
    .set({ tutorId: v.tutor_id, mulaiAt: new Date(wibToIso(v.tanggal, v.jam_mulai)), selesaiAt: new Date(wibToIso(v.tanggal, v.jam_selesai)) })
    .where(and(eq(sessions.id, v.id), eq(sessions.statusTagihan, "belum_rekap")))
    .returning({ id: sessions.id });
  if (!r.length) throw new UserError("Sesi sudah terekap ke invoice, tidak bisa diubah");
  return "Jadwal diperbarui";
}

/** Override admin: absen manual / tidak hadir / batal / reset ke terjadwal. */
export async function setAttendanceStatus(actor: Actor | null, id: string, status: Kehadiran, alasan: string) {
  assertAdmin(actor);
  if (!["terjadwal", "hadir", "tidak_hadir", "batal"].includes(status)) throw new UserError("Status tidak valid");
  if (status === "hadir" && alasan.trim().length < 3) throw new UserError("Alasan absen manual wajib diisi");
  const patch: Partial<typeof sessions.$inferInsert> = { statusKehadiran: status, catatanAdmin: alasan.trim() || null };
  if (status === "hadir") patch.absenAt = new Date();
  // Reset ke Terjadwal: foto lama dihapus (tentor akan absen ulang dengan foto baru)
  if (status === "terjadwal") Object.assign(patch, { absenAt: null, fotoFileId: null, lat: null, lng: null, akurasiM: null });
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new UserError("Sesi tidak ditemukan");
  const oldKey = await db().transaction(async (tx) => {
    const [cur] = await tx
      .select({ fotoFileId: sessions.fotoFileId })
      .from(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.statusTagihan, "belum_rekap")))
      .for("update");
    if (!cur) throw new UserError("Sesi sudah terekap ke invoice, tidak bisa diubah");
    await tx.update(sessions).set(patch).where(eq(sessions.id, id));
    await tx.insert(auditLog).values({ actorId: actor.id, aksi: "override_absen", target: id, detail: { status, alasan, foto_dihapus: status === "terjadwal" && !!cur.fotoFileId } });
    return status === "terjadwal" ? detachFileRow(tx, cur.fotoFileId) : null;
  });
  await purgeStoredFiles([oldKey]);
  return "Status kehadiran diperbarui";
}

export type AttendanceInput = { sessionId: string; lat: number; lng: number; akurasi: number; photo: File | null };

/**
 * Absen foto oleh tentor (pengganti RPC submit_attendance). Semua cek di server:
 * pemilik sesi, status terjadwal, GPS wajib, jendela waktu (pakai now() DB).
 * Satu transaksi dengan penyimpanan foto; foto dihapus lagi bila ditolak.
 */
export async function submitAttendance(actor: Actor | null, input: AttendanceInput) {
  assertTentor(actor);
  const { sessionId, lat, lng, akurasi } = input;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new UserError("Sesi tidak ditemukan");
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new UserError("Lokasi GPS wajib diaktifkan");
  }

  return withUploadedFile("attendance", input.photo, actor, async (tx, fileId) => {
    const [s] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).for("update");
    if (!s || s.tutorId !== actor.id) throw new UserError("Sesi tidak ditemukan");
    if (s.statusKehadiran !== "terjadwal") throw new UserError("Sesi sudah diabsen atau tidak aktif");

    const [cfg] = await tx.select().from(appSettings).where(eq(appSettings.id, 1));
    const buka = cfg?.absenBukaMenit ?? 30;
    const tutup = cfg?.absenTutupMenit ?? 60;
    const { rows } = await tx.execute<{ now: Date }>(sql`select now() as now`);
    const now = new Date(rows[0].now);
    if (now.getTime() < s.mulaiAt.getTime() - buka * 60_000 || now.getTime() > s.selesaiAt.getTime() + tutup * 60_000) {
      throw new UserError("Di luar jendela waktu absen");
    }

    await tx
      .update(sessions)
      .set({ statusKehadiran: "hadir", absenAt: now, fotoFileId: fileId, lat, lng, akurasiM: Number.isFinite(akurasi) ? akurasi : null })
      .where(eq(sessions.id, sessionId));
    return now;
  });
}
