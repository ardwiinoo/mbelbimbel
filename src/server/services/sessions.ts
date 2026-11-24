import { and, asc, eq, gt, gte, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "@/db";
import { appSettings, auditLog, programs, sessions, studentPrograms, students, users } from "@/db/schema";
import { jam, wibToIso } from "@/lib/format";
import { conflictKinds, type ConflictKind, type Slot } from "@/lib/session-conflicts";
import { addDays } from "@/lib/timeline-range";
import { can } from "@/lib/access";
import type { MapelKey } from "@/lib/mapel";
import { assertActive, assertCan, assertTutor, ForbiddenError, scopeOf, UserError, type Actor } from "../authz";
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
  students: { id: string; nama: string; panggilan: string | null; kelas: string | null } | null;
  programs: { id: string; nama: string; mapel: MapelKey } | null;
  profiles: { nama: string } | null;
};

export type SessionFilters = { from: string; to: string; tutor?: string; status?: string; student?: string; limit?: number };

const tutorUser = alias(users, "tutor_user");

/** Daftar sesi. Tentor SELALU dibatasi ke sesi miliknya (pengganti RLS sessions). */
export async function listSessions(actor: Actor, f: SessionFilters): Promise<SessionRow[]> {
  // Akses Jadwal (Lihat) → semua sesi; tanpa akses tapi Mengajar → hanya sesi miliknya
  const admin = scopeOf(actor, "jadwal") === "all";
  const status = ["terjadwal", "hadir", "tidak_hadir", "batal"].includes(f.status ?? "") ? (f.status as Kehadiran) : undefined;
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

  const rows = await db()
    .select({
      s: sessions,
      studentNama: students.nama,
      studentPanggilan: students.panggilan,
      kelas: students.kelas,
      programNama: programs.nama,
      programMapel: programs.mapelKategori,
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
    .limit(Math.min(Math.max(f.limit ?? 300, 1), 5000));

  return rows.map(({ s, studentNama, studentPanggilan, kelas, programNama, programMapel, tutorNama }) => ({
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
    students: { id: s.studentId, nama: studentNama, panggilan: studentPanggilan, kelas },
    programs: { id: s.programId, nama: programNama, mapel: programMapel },
    profiles: { nama: tutorNama },
  }));
}

export type TimelineTutor = {
  id: string;
  nama: string;
  mapel: MapelKey;
  aktif: boolean;
  /** Hanya untuk pemegang Jadwal (Kelola) — dipakai tombol "Ingatkan via WA". */
  no_wa: string | null;
};

/** Baris tentor untuk Resource Timeline (butuh akses Jadwal Lihat). */
export async function timelineTutors(actor: Actor | null): Promise<TimelineTutor[]> {
  assertCan(actor, "jadwal", "read");
  const rows = await db()
    .select({ id: users.id, nama: users.nama, mapel: users.mapelKategori, status: users.status, noWa: users.noWa })
    .from(users)
    // Super Admin tersembunyi dari akun lain (konsisten dengan daftar Pengguna)
    .where(and(eq(users.isTutor, true), actor.isSuperuser ? undefined : eq(users.isSuperuser, false)))
    .orderBy(asc(users.nama));
  const wa = can(actor, "jadwal", "write");
  return rows.map((r) => ({ id: r.id, nama: r.nama, mapel: r.mapel ?? "lainnya", aktif: r.status === "aktif", no_wa: wa ? r.noWa : null }));
}

/** Jumlah sesi (tanpa yang batal) per tentor pada bulan WIB dari tanggal "YYYY-MM-DD". */
export async function monthSessionCounts(actor: Actor | null, anyDayInMonth: string): Promise<Record<string, number>> {
  // Pemegang akses Jadwal: semua tentor. Tentor biasa: hanya hitungan sesinya sendiri.
  assertActive(actor);
  const all = can(actor, "jadwal", "read");
  if (!all && !actor.isTutor) throw new ForbiddenError();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anyDayInMonth)) throw new UserError("Tanggal tidak valid");
  const [y, m] = anyDayInMonth.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = `${y}-${String(m).padStart(2, "0")}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  const rows = await db()
    .select({ tutorId: sessions.tutorId, n: sql<number>`count(*)::int` })
    .from(sessions)
    .where(and(gte(sessions.mulaiAt, new Date(wibToIso(first, "00:00"))), lte(sessions.mulaiAt, new Date(wibToIso(last, "23:59"))), ne(sessions.statusKehadiran, "batal"), all ? undefined : eq(sessions.tutorId, actor.id)))
    .groupBy(sessions.tutorId);
  return Object.fromEntries(rows.map((r) => [r.tutorId, r.n]));
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
  const [t] = await db().select({ id: users.id }).from(users).where(and(eq(users.id, tutorId), eq(users.isTutor, true), eq(users.status, "aktif"))).limit(1);
  if (!t) throw new UserError("Tentor tidak valid atau nonaktif");
}

export async function createSessions(actor: Actor | null, input: z.input<typeof createSchema>) {
  assertCan(actor, "jadwal", "write");
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
      createdBy: actor.id,
    };
  });
  await db().insert(sessions).values(rows);
  return `${rows.length} jadwal dibuat`;
}

// ---------- Cek bentrok jadwal (peringatan, bukan blokir) ----------
const conflictSchema = z.object({
  tutor_id: z.string().uuid(),
  /** Jadwal baru: pasangan siswa+program yang dipilih. */
  student_program_id: z.string().uuid().optional(),
  /** Mengubah jadwal: sesi yang sedang diedit (dikecualikan dari hasil, dan sumber siswa/program). */
  session_id: z.string().uuid().optional(),
  tanggal: ymd,
  jam_mulai: hhmm,
  jam_selesai: hhmm,
  ulang_minggu: z.coerce.number().int().min(1).max(12).default(1),
});

export type ConflictInfo = { tanggal: string; jenis: ConflictKind; jam: string; siswa: string; kelas: string | null; program: string; tentor: string };

/**
 * Sesi lain yang bentrok dengan jadwal yang akan disimpan (semua minggu ulangan ikut dicek).
 * Aturan bentrok: src/lib/session-conflicts.ts — kelas kelompok (program & jam persis sama) bukan bentrok.
 * Input yang belum lengkap (form masih diisi) mengembalikan daftar kosong, bukan error.
 */
export async function findConflicts(actor: Actor | null, input: z.input<typeof conflictSchema>): Promise<ConflictInfo[]> {
  assertCan(actor, "jadwal", "write");
  const p = conflictSchema.safeParse(input);
  if (!p.success) return [];
  const v = p.data;
  if (v.jam_selesai <= v.jam_mulai) return [];

  let studentId: string | undefined;
  let programId: string | undefined;
  if (v.session_id) {
    const [s] = await db().select({ studentId: sessions.studentId, programId: sessions.programId }).from(sessions).where(eq(sessions.id, v.session_id)).limit(1);
    studentId = s?.studentId;
    programId = s?.programId;
  } else if (v.student_program_id) {
    const [sp] = await db().select({ studentId: studentPrograms.studentId, programId: studentPrograms.programId }).from(studentPrograms).where(eq(studentPrograms.id, v.student_program_id)).limit(1);
    studentId = sp?.studentId;
    programId = sp?.programId;
  }
  if (!studentId || !programId) return [];

  const occ = Array.from({ length: v.ulang_minggu }, (_, i) => {
    const ds = addDays(v.tanggal, 7 * i);
    return { ds, start: new Date(wibToIso(ds, v.jam_mulai)).getTime(), end: new Date(wibToIso(ds, v.jam_selesai)).getTime() };
  });
  const from = new Date(Math.min(...occ.map((o) => o.start)));
  const to = new Date(Math.max(...occ.map((o) => o.end)));

  const rows = await db()
    .select({ s: sessions, siswa: students.nama, kelas: students.kelas, program: programs.nama, tentor: tutorUser.nama })
    .from(sessions)
    .innerJoin(students, eq(students.id, sessions.studentId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .innerJoin(tutorUser, eq(tutorUser.id, sessions.tutorId))
    .where(
      and(
        or(eq(sessions.tutorId, v.tutor_id), eq(sessions.studentId, studentId)),
        ne(sessions.statusKehadiran, "batal"),
        lt(sessions.mulaiAt, to),
        gt(sessions.selesaiAt, from),
        v.session_id ? ne(sessions.id, v.session_id) : undefined,
      ),
    )
    .limit(500);

  const out: ConflictInfo[] = [];
  for (const o of occ) {
    const mine: Slot = { id: "baru", tutorId: v.tutor_id, studentId, programId, start: o.start, end: o.end, cancelled: false };
    for (const r of rows) {
      const other: Slot = { id: r.s.id, tutorId: r.s.tutorId, studentId: r.s.studentId, programId: r.s.programId, start: r.s.mulaiAt.getTime(), end: r.s.selesaiAt.getTime(), cancelled: false };
      for (const jenis of conflictKinds(mine, other)) {
        out.push({ tanggal: o.ds, jenis, jam: `${jam(r.s.mulaiAt)} – ${jam(r.s.selesaiAt)}`, siswa: r.siswa, kelas: r.kelas, program: r.program, tentor: r.tentor });
      }
    }
  }
  return out.slice(0, 10);
}

const editSchema = z.object({ id: z.string().uuid(), tutor_id: z.string().uuid(), tanggal: ymd, jam_mulai: hhmm, jam_selesai: hhmm });

export async function updateSession(actor: Actor | null, input: z.input<typeof editSchema>) {
  assertCan(actor, "jadwal", "write");
  const p = editSchema.safeParse(input);
  if (!p.success) throw new UserError("Data tidak valid");
  const v = p.data;
  if (v.jam_selesai <= v.jam_mulai) throw new UserError("Jam selesai harus setelah jam mulai");
  await assertActiveTutor(v.tutor_id);
  const r = await db()
    .update(sessions)
    .set({
      tutorId: v.tutor_id,
      mulaiAt: new Date(wibToIso(v.tanggal, v.jam_mulai)),
      selesaiAt: new Date(wibToIso(v.tanggal, v.jam_selesai)),
      updatedAt: new Date(),
      updatedBy: actor.id,
    })
    .where(and(eq(sessions.id, v.id), eq(sessions.statusTagihan, "belum_rekap"), isNull(sessions.honorSlipId)))
    .returning({ id: sessions.id });
  if (!r.length) throw new UserError("Sesi sudah terekap ke invoice atau honornya sudah dibayar, tidak bisa diubah");
  return "Jadwal diperbarui";
}

/** Override admin: absen manual / tidak hadir / batal / reset ke terjadwal. */
export async function setAttendanceStatus(actor: Actor | null, id: string, status: Kehadiran, alasan: string) {
  assertCan(actor, "jadwal", "write");
  if (!["terjadwal", "hadir", "tidak_hadir", "batal"].includes(status)) throw new UserError("Status tidak valid");
  if (status === "hadir" && alasan.trim().length < 3) throw new UserError("Alasan absen manual wajib diisi");
  const patch: Partial<typeof sessions.$inferInsert> = {
    statusKehadiran: status,
    catatanAdmin: alasan.trim() || null,
    updatedAt: new Date(),
    updatedBy: actor.id,
  };
  if (status === "hadir") patch.absenAt = new Date();
  // Reset ke Terjadwal: foto lama dihapus (tentor akan absen ulang dengan foto baru)
  if (status === "terjadwal") Object.assign(patch, { absenAt: null, fotoFileId: null, lat: null, lng: null, akurasiM: null });
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new UserError("Sesi tidak ditemukan");
  const oldKey = await db().transaction(async (tx) => {
    const [cur] = await tx
      .select({ fotoFileId: sessions.fotoFileId })
      .from(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.statusTagihan, "belum_rekap"), isNull(sessions.honorSlipId)))
      .for("update");
    if (!cur) throw new UserError("Sesi sudah terekap ke invoice atau honornya sudah dibayar, tidak bisa diubah");
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
  assertTutor(actor);
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
    const bebas = cfg?.absenSusulanBebas ?? false; // absen susulan: batas "tutup" diabaikan
    const { rows } = await tx.execute<{ now: Date }>(sql`select now() as now`);
    const now = new Date(rows[0].now);
    if (now.getTime() < s.mulaiAt.getTime() - buka * 60_000 || (!bebas && now.getTime() > s.selesaiAt.getTime() + tutup * 60_000)) {
      throw new UserError("Di luar jendela waktu absen");
    }

    await tx
      .update(sessions)
      .set({
        statusKehadiran: "hadir",
        absenAt: now,
        fotoFileId: fileId,
        lat,
        lng,
        akurasiM: Number.isFinite(akurasi) ? akurasi : null,
        updatedAt: now,
        updatedBy: actor.id,
      })
      .where(eq(sessions.id, sessionId));
    return now;
  });
}

/** Baris tunggal untuk akun tentor (melihat jadwalnya sendiri sebagai timeline satu baris). */
export async function ownTimelineTutor(actor: Actor | null): Promise<TimelineTutor[]> {
  assertTutor(actor);
  const [u] = await db().select({ id: users.id, nama: users.nama, mapel: users.mapelKategori }).from(users).where(eq(users.id, actor.id));
  return u ? [{ id: u.id, nama: u.nama, mapel: u.mapel ?? "lainnya", aktif: true, no_wa: null }] : [];
}
