import { aliasedTable, and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, invoiceCounters, invoiceItems, invoices, programs, sessions, students, users } from "@/db/schema";
import { assertAdmin, UserError, type Actor } from "../authz";

const tutorUser = aliasedTable(users, "tutor_user");

export type ReadySession = {
  id: string;
  mulai_at: string;
  student_id: string;
  program_id: string;
  students: { nama: string; kelas: string | null } | null;
  profiles: { nama: string } | null;
};
export type InvoiceRow = {
  id: string;
  nomor: string;
  tgl_terbit: string;
  jumlah_sesi: number;
  total: number;
  status_bayar: "lunas" | "belum_lunas";
  tgl_bayar: string | null;
  students: { nama: string; kelas: string | null; ortu_nama: string | null; ortu_wa: string | null } | null;
  programs: { nama: string } | null;
};

/** Sesi Hadir + Belum Rekap (Daftar Siap Tagih). Admin saja. */
export async function listReadyToBill(actor: Actor): Promise<ReadySession[]> {
  assertAdmin(actor);
  const rows = await db()
    .select({ s: sessions, nama: students.nama, kelas: students.kelas, tNama: tutorUser.nama })
    .from(sessions)
    .innerJoin(students, eq(students.id, sessions.studentId))
    .innerJoin(tutorUser, eq(tutorUser.id, sessions.tutorId))
    .where(and(eq(sessions.statusKehadiran, "hadir"), eq(sessions.statusTagihan, "belum_rekap"), isNull(sessions.invoiceId)))
    .orderBy(asc(sessions.mulaiAt));
  return rows.map(({ s, nama, kelas, tNama }) => ({
    id: s.id,
    mulai_at: s.mulaiAt.toISOString(),
    student_id: s.studentId,
    program_id: s.programId,
    students: { nama, kelas },
    profiles: { nama: tNama },
  }));
}

export async function listInvoices(actor: Actor, limit = 100): Promise<InvoiceRow[]> {
  assertAdmin(actor);
  const rows = await db()
    .select({ i: invoices, s: students, pNama: programs.nama })
    .from(invoices)
    .innerJoin(students, eq(students.id, invoices.studentId))
    .innerJoin(programs, eq(programs.id, invoices.programId))
    .orderBy(desc(invoices.tglTerbit), desc(invoices.nomor))
    .limit(limit);
  return rows.map(({ i, s, pNama }) => ({
    id: i.id,
    nomor: i.nomor,
    tgl_terbit: i.tglTerbit.toISOString(),
    jumlah_sesi: i.jumlahSesi,
    total: i.total,
    status_bayar: i.statusBayar,
    tgl_bayar: i.tglBayar,
    students: { nama: s.nama, kelas: s.kelas, ortu_nama: s.ortuNama, ortu_wa: s.ortuWa },
    programs: { nama: pNama },
  }));
}

/**
 * Terbitkan invoice dalam SATU transaksi (pengganti RPC issue_invoice):
 * kunci sesi (FOR UPDATE) → validasi → nomor urut per bulan (upsert counter)
 * → snapshot tarif ke invoice_items → sesi jadi Terekap. Gagal = rollback semua.
 */
export async function issueInvoice(actor: Actor | null, studentId: string, programId: string, sessionIds: string[]) {
  assertAdmin(actor);
  const uuid = /^[0-9a-f-]{36}$/i;
  const ids = [...new Set(sessionIds)];
  if (!ids.length) throw new UserError("Pilih minimal satu sesi");
  if (ids.length > 200 || ![studentId, programId, ...ids].every((v) => uuid.test(v))) throw new UserError("Data tidak valid");

  return db().transaction(async (tx) => {
    const locked = await tx
      .select({ id: sessions.id, studentId: sessions.studentId, programId: sessions.programId, mulaiAt: sessions.mulaiAt, k: sessions.statusKehadiran, t: sessions.statusTagihan, inv: sessions.invoiceId })
      .from(sessions)
      .where(inArray(sessions.id, ids))
      .orderBy(asc(sessions.id))
      .for("update");
    const valid = locked.filter(
      (s) => s.studentId === studentId && s.programId === programId && s.k === "hadir" && s.t === "belum_rekap" && !s.inv,
    );
    if (valid.length !== ids.length) throw new UserError("Sebagian sesi sudah terekap atau tidak valid, muat ulang halaman");

    const [prog] = await tx.select({ tarif: programs.tarifPerPertemuan }).from(programs).where(eq(programs.id, programId));
    if (!prog) throw new UserError("Program tidak ditemukan");

    const { rows } = await tx.execute<{ periode: string }>(sql`select to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM') as periode`);
    const periode = rows[0].periode;
    const [counter] = await tx
      .insert(invoiceCounters)
      .values({ periode, lastNumber: 1 })
      .onConflictDoUpdate({ target: invoiceCounters.periode, set: { lastNumber: sql`${invoiceCounters.lastNumber} + 1` } })
      .returning({ n: invoiceCounters.lastNumber });
    const nomor = `INV/${periode.replace("-", "/")}/${String(counter.n).padStart(2, "0")}`;

    const [inv] = await tx
      .insert(invoices)
      .values({ nomor, studentId, programId, jumlahSesi: valid.length, total: valid.length * prog.tarif, createdBy: actor.id })
      .returning({ id: invoices.id });
    await tx.insert(invoiceItems).values(valid.map((s) => ({ invoiceId: inv.id, sessionId: s.id, tanggal: s.mulaiAt, tarifSnapshot: prog.tarif })));
    await tx.update(sessions).set({ statusTagihan: "terekap", invoiceId: inv.id }).where(inArray(sessions.id, ids));
    return { id: inv.id, message: `Invoice ${nomor} terbit` };
  });
}

export async function setPaid(actor: Actor | null, id: string, lunas: boolean, tglBayar?: string) {
  assertAdmin(actor);
  if (tglBayar && !/^\d{4}-\d{2}-\d{2}$/.test(tglBayar)) throw new UserError("Tanggal bayar tidak valid");
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  if (tglBayar && tglBayar > today) throw new UserError("Tanggal bayar tidak boleh di masa depan");
  const r = await db()
    .update(invoices)
    .set({ statusBayar: lunas ? "lunas" : "belum_lunas", tglBayar: lunas ? tglBayar || today : null })
    .where(eq(invoices.id, id))
    .returning({ id: invoices.id });
  if (!r.length) throw new UserError("Invoice tidak ditemukan");
  return lunas ? "Ditandai Lunas" : "Ditandai Belum Lunas";
}

/** Data nota PDF dari snapshot (tarif di invoice_items, bukan tarif master saat ini). */
export async function getInvoicePdfData(actor: Actor | null, id: string) {
  assertAdmin(actor);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db()
    .select({ i: invoices, s: students, pNama: programs.nama })
    .from(invoices)
    .innerJoin(students, eq(students.id, invoices.studentId))
    .innerJoin(programs, eq(programs.id, invoices.programId))
    .where(eq(invoices.id, id));
  if (!row) return null;
  const items = await db()
    .select({ tanggal: invoiceItems.tanggal, tarif: invoiceItems.tarifSnapshot })
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, id))
    .orderBy(asc(invoiceItems.tanggal));
  const [cfg] = await db().select().from(appSettings).where(eq(appSettings.id, 1));
  return {
    nomor: row.i.nomor,
    tgl_terbit: row.i.tglTerbit.toISOString(),
    total: row.i.total,
    status_bayar: row.i.statusBayar,
    tgl_bayar: row.i.tglBayar,
    student: { nama: row.s.nama, kelas: row.s.kelas, ortu_nama: row.s.ortuNama, ortu_wa: row.s.ortuWa, alamat: row.s.alamat },
    program: row.pNama,
    items: items.map((it) => ({ tanggal: it.tanggal.toISOString(), tarif_snapshot: it.tarif })),
    settings: {
      nama_bimbel: cfg?.namaBimbel ?? "Bimbel",
      alamat: cfg?.alamat ?? null,
      rekening: cfg?.rekening ?? null,
      wa_admin: cfg?.waAdmin ?? null,
    },
  };
}
