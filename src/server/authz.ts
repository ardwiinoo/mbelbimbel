// Otorisasi di kode server. Akses berbasis PER MODUL (Lihat/Kelola) + status
// "Mengajar" (tentor) + Super Admin. Semua service memanggil helper di sini.
import { and, eq, isNull } from "drizzle-orm";
import type { DB, Tx } from "@/db";
import { db } from "@/db";
import { studentPrograms, students, userPermissions } from "@/db/schema";
import { can, isModule, type Level, type Module, type Permissions } from "@/lib/access";

export type Actor = {
  id: string;
  nama: string;
  status: "aktif" | "nonaktif";
  isSuperuser: boolean;
  isTutor: boolean;
  perms: Permissions;
};

/** Kesalahan yang aman ditampilkan ke pengguna. */
export class UserError extends Error {}
export class ForbiddenError extends UserError {
  constructor(msg = "Anda tidak punya akses untuk aksi ini") {
    super(msg);
  }
}

export function assertActive(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor || actor.status !== "aktif") throw new ForbiddenError("Sesi tidak valid, silakan login ulang");
}

/** Wajib punya akses modul pada level tertentu (Super Admin selalu lolos). */
export function assertCan(actor: Actor | null | undefined, module: Module, level: Level = "read"): asserts actor is Actor {
  assertActive(actor);
  if (!can(actor, module, level)) throw new ForbiddenError();
}

/** Wajib punya SALAH SATU dari akses yang disebut. */
export function assertAny(actor: Actor | null | undefined, rules: [Module, Level][]): asserts actor is Actor {
  assertActive(actor);
  if (!rules.some(([m, l]) => can(actor, m, l))) throw new ForbiddenError();
}

/** Wajib berstatus Mengajar (tentor). */
export function assertTutor(actor: Actor | null | undefined): asserts actor is Actor {
  assertActive(actor);
  if (!actor.isTutor) throw new ForbiddenError("Hanya untuk akun yang mengajar (tentor)");
}

export function assertSuperuser(actor: Actor | null | undefined): asserts actor is Actor {
  assertActive(actor);
  if (!actor.isSuperuser) throw new ForbiddenError("Hanya Super Admin");
}

/**
 * Cakupan data untuk modul yang punya "data milik sendiri" (siswa, jadwal, laporan):
 * - "all"  : punya akses Lihat modul → semua data
 * - "own"  : tidak punya akses modul tapi Mengajar → hanya data miliknya
 * Tidak keduanya → ditolak.
 */
export function scopeOf(actor: Actor | null | undefined, module: Module): "all" | "own" {
  assertActive(actor);
  if (can(actor, module, "read")) return "all";
  if (actor.isTutor) return "own";
  throw new ForbiddenError();
}

/** Baca akses per modul seorang user dari DB (baris modul tak dikenal diabaikan). */
export async function loadPermissions(userId: string, q: DB | Tx = db()): Promise<Permissions> {
  const rows = await q.select({ module: userPermissions.module, level: userPermissions.level }).from(userPermissions).where(eq(userPermissions.userId, userId));
  const perms: Permissions = {};
  for (const r of rows) if (isModule(r.module)) perms[r.module] = r.level;
  return perms;
}

/** Pengganti teaches_student(): tentor mengampu siswa aktif (tidak terhapus) ini? */
export async function teachesStudent(tutorId: string, studentId: string, q: DB | Tx = db()) {
  const rows = await q
    .select({ id: studentPrograms.id })
    .from(studentPrograms)
    .innerJoin(students, eq(students.id, studentPrograms.studentId))
    .where(and(eq(studentPrograms.studentId, studentId), eq(studentPrograms.tutorId, tutorId), isNull(students.deletedAt)))
    .limit(1);
  return rows.length > 0;
}
