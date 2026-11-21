import { and, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { invoices, programs, sessions, students } from "@/db/schema";
import { assertAdmin, type Actor } from "../authz";

/** Ringkasan Beranda admin. */
export async function adminSummary(actor: Actor) {
  assertAdmin(actor);
  const [[st], [ready], [unpaid]] = await Promise.all([
    db().select({ n: count() }).from(students).where(and(eq(students.status, "aktif"), isNull(students.deletedAt))),
    db()
      .select({ n: count(), total: sql<number>`coalesce(sum(${programs.tarifPerPertemuan}), 0)::int` })
      .from(sessions)
      .innerJoin(programs, eq(programs.id, sessions.programId))
      .where(and(eq(sessions.statusKehadiran, "hadir"), eq(sessions.statusTagihan, "belum_rekap"))),
    db()
      .select({ n: count(), total: sql<number>`coalesce(sum(${invoices.total}), 0)::int` })
      .from(invoices)
      .where(eq(invoices.statusBayar, "belum_lunas")),
  ]);
  return {
    siswaAktif: st.n,
    siapTagihSesi: ready.n,
    siapTagihTotal: Number(ready.total),
    belumLunasInvoice: unpaid.n,
    belumLunasTotal: Number(unpaid.total),
  };
}
