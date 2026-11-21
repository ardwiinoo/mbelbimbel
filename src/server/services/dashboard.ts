import { and, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { invoices, programs, sessions, students } from "@/db/schema";
import { can } from "@/lib/access";
import { assertActive, type Actor } from "../authz";

/** Ringkasan Beranda: hanya angka yang boleh dilihat akun ini (null = tidak punya akses). */
export async function dashboardSummary(actor: Actor) {
  assertActive(actor);
  const seeStudents = can(actor, "siswa", "read");
  const seeBilling = can(actor, "invoice", "read");
  const [st, ready, unpaid] = await Promise.all([
    seeStudents
      ? db().select({ n: count() }).from(students).where(and(eq(students.status, "aktif"), isNull(students.deletedAt)))
      : Promise.resolve(null),
    seeBilling
      ? db()
          .select({ n: count(), total: sql<number>`coalesce(sum(${programs.tarifPerPertemuan}), 0)::int` })
          .from(sessions)
          .innerJoin(programs, eq(programs.id, sessions.programId))
          .where(and(eq(sessions.statusKehadiran, "hadir"), eq(sessions.statusTagihan, "belum_rekap")))
      : Promise.resolve(null),
    seeBilling
      ? db()
          .select({ n: count(), total: sql<number>`coalesce(sum(${invoices.total}), 0)::int` })
          .from(invoices)
          .where(eq(invoices.statusBayar, "belum_lunas"))
      : Promise.resolve(null),
  ]);
  return {
    siswaAktif: st ? st[0].n : null,
    siapTagih: ready ? { sesi: ready[0].n, total: Number(ready[0].total) } : null,
    belumLunas: unpaid ? { invoice: unpaid[0].n, total: Number(unpaid[0].total) } : null,
  };
}
