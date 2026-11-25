import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { invoices, sessions, users } from "@/db/schema";
import { can } from "@/lib/access";
import { assertActive, type Actor } from "../authz";

/** "YYYY-MM" bulan berjalan (WIB). */
export function currentMonthWib() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
}

const monthOf = (col: typeof sessions.mulaiAt | typeof invoices.tglTerbit) => sql`to_char(${col} at time zone 'Asia/Jakarta', 'YYYY-MM')`;

export type MonthlyAnalytics = {
  month: string;
  /** null = akun tidak punya akses jadwal & bukan tentor */
  sessions: null | {
    scope: "all" | "own";
    total: number;
    byStatus: { terjadwal: number; hadir: number; tidak_hadir: number; batal: number };
    /** Status penagihan sesi hadir. Null bila akun tanpa akses Invoice (tentor tidak melihat urusan tagihan). */
    rekap: { terekap: number; belum: number } | null;
    /** les HADIR per minggu ke-1..5 dalam bulan */
    weekly: number[];
    /** les HADIR per tentor (hanya scope "all"), terbesar dulu */
    perTutor: { nama: string; hadir: number }[];
  };
  /** null = tanpa akses Invoice */
  money: null | { terbit: number; nilaiTerbit: number; lunas: number; belumLunas: number };
};

/**
 * Ringkasan satu bulan untuk Beranda. Isi menyesuaikan akses:
 * - akses Jadwal (Lihat) → semua sesi; tentor tanpa akses Jadwal → hanya sesinya
 * - akses Invoice (Lihat) → angka keuangan
 */
export async function monthlyAnalytics(actor: Actor, monthInput?: string): Promise<MonthlyAnalytics> {
  assertActive(actor);
  const month = /^\d{4}-\d{2}$/.test(monthInput ?? "") ? monthInput! : currentMonthWib();
  const seeAll = can(actor, "jadwal", "read");
  const seeOwn = !seeAll && actor.isTutor;

  let sessionPart: MonthlyAnalytics["sessions"] = null;
  if (seeAll || seeOwn) {
    const where = and(sql`${monthOf(sessions.mulaiAt)} = ${month}`, seeAll ? undefined : eq(sessions.tutorId, actor.id));
    const [statusRows, weekRows, tutorRows] = await Promise.all([
      db()
        .select({ status: sessions.statusKehadiran, tagihan: sessions.statusTagihan, n: count() })
        .from(sessions)
        .where(where)
        .groupBy(sessions.statusKehadiran, sessions.statusTagihan),
      db()
        .select({
          week: sql<number>`least(5, ((extract(day from ${sessions.mulaiAt} at time zone 'Asia/Jakarta')::int - 1) / 7) + 1)`.mapWith(Number),
          n: count(),
        })
        .from(sessions)
        .where(and(where, eq(sessions.statusKehadiran, "hadir")))
        .groupBy(sql`1`),
      seeAll
        ? db()
            .select({ nama: users.nama, n: count() })
            .from(sessions)
            .innerJoin(users, eq(users.id, sessions.tutorId))
            .where(and(where, eq(sessions.statusKehadiran, "hadir")))
            .groupBy(users.id, users.nama)
            .orderBy(desc(count()))
            .limit(8)
        : Promise.resolve([]),
    ]);

    const byStatus = { terjadwal: 0, hadir: 0, tidak_hadir: 0, batal: 0 };
    const rekap = { terekap: 0, belum: 0 };
    for (const r of statusRows) {
      byStatus[r.status] += r.n;
      if (r.status === "hadir" && r.tagihan === "terekap") rekap.terekap += r.n;
      else if (r.status === "hadir" && r.tagihan === "belum_rekap") rekap.belum += r.n; // "dibebaskan" tidak ditagih, jadi tidak dihitung
    }
    const weekly = [0, 0, 0, 0, 0];
    for (const w of weekRows) weekly[w.week - 1] = w.n;
    sessionPart = {
      scope: seeAll ? "all" : "own",
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      byStatus,
      rekap: can(actor, "invoice", "read") ? rekap : null,
      weekly,
      perTutor: tutorRows.map((t) => ({ nama: t.nama, hadir: t.n })),
    };
  }

  let money: MonthlyAnalytics["money"] = null;
  if (can(actor, "invoice", "read")) {
    const [m] = await db()
      .select({
        terbit: count(),
        nilai: sql<number>`coalesce(sum(${invoices.total}), 0)`.mapWith(Number),
        lunas: sql<number>`coalesce(sum(${invoices.total}) filter (where ${invoices.statusBayar} = 'lunas'), 0)`.mapWith(Number),
      })
      .from(invoices)
      .where(sql`${monthOf(invoices.tglTerbit)} = ${month}`);
    money = { terbit: m.terbit, nilaiTerbit: m.nilai, lunas: m.lunas, belumLunas: m.nilai - m.lunas };
  }

  return { month, sessions: sessionPart, money };
}
