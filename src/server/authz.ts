// Otorisasi di kode server (pengganti RLS). Semua service menerima `actor`
// dan memanggil helper di sini sebelum membaca/menulis data.
import { and, eq, isNull } from "drizzle-orm";
import type { DB, Tx } from "@/db";
import { db } from "@/db";
import { studentPrograms, students } from "@/db/schema";
import { isAdminRole, isSuperAdmin, type Role } from "@/lib/roles";

export type Actor = { id: string; role: Role; status: "aktif" | "nonaktif"; nama: string };

/** Kesalahan yang aman ditampilkan ke pengguna. */
export class UserError extends Error {}
export class ForbiddenError extends UserError {
  constructor(msg = "Anda tidak punya akses") {
    super(msg);
  }
}

export function assertActive(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor || actor.status !== "aktif") throw new ForbiddenError("Sesi tidak valid, silakan login ulang");
}
export function assertAdmin(actor: Actor | null | undefined): asserts actor is Actor {
  assertActive(actor);
  if (!isAdminRole(actor.role)) throw new ForbiddenError("Hanya admin");
}
export function assertSuperAdmin(actor: Actor | null | undefined): asserts actor is Actor {
  assertActive(actor);
  if (!isSuperAdmin(actor.role)) throw new ForbiddenError("Hanya Super Admin");
}
export function assertTentor(actor: Actor | null | undefined): asserts actor is Actor {
  assertActive(actor);
  if (actor.role !== "tentor") throw new ForbiddenError("Hanya tentor");
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
