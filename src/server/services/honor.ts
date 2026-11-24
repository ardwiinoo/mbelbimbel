import { and, asc, count, desc, eq, gte, inArray, isNull, lt, min, max, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { db, type Tx } from "@/db";
import * as schema from "@/db/schema";
import { auditLog, honorCounters, honorSlips, invoices, mapelCategories, programs, sessions, students, tutorHonorRates, users } from "@/db/schema";
import { wibToIso } from "@/lib/format";
import type { AuditItem } from "@/lib/audit-label";
import type { MapelKey } from "@/lib/mapel";
import { assertCan, UserError, type Actor } from "../authz";
import { readStoredFile } from "../files";
import { loadBranding, type Branding } from "../pdf-branding";

// Honor tentor = sesi berstatus HADIR (sudah absen, termasuk absen manual admin) pada bulan WIB dari jam mulai,
// masing-masing dikali tarif honor tentor untuk MAPEL program sesi itu (tarif khusus per mapel, selain itu tarif
// standar tentor), ditambah tunjangan/bonus. Saat ditandai lunas, tarif tiap sesi di-SNAPSHOT (sessions.honor_tarif)
// dan sesi dikunci (sessions.honor_slip_id) supaya angka yang sudah dibayar tidak berubah diam-diam.

type Exec = PgDatabase<NodePgQueryResultHKT, typeof schema>;
const PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;
const uuidRe = /^[0-9a-f-]{36}$/i;

function assertPeriode(periode: string) {
  if (!PERIODE.test(periode)) throw new UserError("Periode tidak valid");
}

/** Batas bulan WIB: [from, to) */
function monthBounds(periode: string) {
  const [y, m] = periode.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { from: new Date(wibToIso(`${periode}-01`, "00:00")), to: new Date(wibToIso(next, "00:00")) };
}

const todayWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

// ---------- tarif ----------
type Rate = { def: number; by: Map<MapelKey, number> };
const rateOf = (r: Rate | undefined, mapel: MapelKey) => r?.by.get(mapel) ?? r?.def ?? 0;

async function loadRates(exec: Exec, tutors: { id: string; tarifHonor: number }[]): Promise<Map<string, Rate>> {
  const map = new Map<string, Rate>(tutors.map((t) => [t.id, { def: t.tarifHonor, by: new Map() }]));
  if (!tutors.length) return map;
  const rows = await exec.select().from(tutorHonorRates).where(inArray(tutorHonorRates.tutorId, tutors.map((t) => t.id)));
  for (const r of rows) map.get(r.tutorId)?.by.set(r.mapelKategori, r.tarif);
  return map;
}

export type HonorRow = {
  tutor_id: string;
  nama: string;
  mapel: MapelKey;
  aktif: boolean;
  no_wa: string | null;
  rekening: string | null;
  /** Sesi hadir yang dihitung (lunas: nilai snapshot slip). */
  sesi: number;
  /** Rentang tarif per sesi yang dipakai (sama bila hanya satu tarif). */
  tarif_min: number;
  tarif_max: number;
  subtotal: number;
  tunjangan: number;
  tunjangan_ket: string | null;
  total: number;
  /** Ada sesi hadir yang tarifnya masih 0 (tarif belum diisi) — belum bisa dibayar. */
  tarif_kosong: boolean;
  slip: { id: string; nomor: string; status_bayar: "belum_lunas" | "lunas"; tgl_bayar: string | null } | null;
  /** Sesi hadir bulan itu yang belum masuk slip lunas (muncul bila ada absen susulan setelah dibayar). */
  sesi_baru: number;
  /** Akuntabilitas: siapa & kapan mencatat honor lunas (null bila belum lunas). */
  dicatat: { oleh: string | null; pada: string | null } | null;
  /** Siapa & kapan terakhir mengatur tunjangan. */
  tunjangan_oleh: string | null;
  tunjangan_pada: string | null;
};

type TutorLite = { id: string; nama: string; noWa: string | null; mapel: MapelKey | null; status: "aktif" | "nonaktif"; tarifHonor: number; rekening: string | null };

async function loadTutors(actor: Actor, onlyId?: string): Promise<TutorLite[]> {
  return db()
    .select({ id: users.id, nama: users.nama, noWa: users.noWa, mapel: users.mapelKategori, status: users.status, tarifHonor: users.tarifHonor, rekening: users.rekening })
    .from(users)
    // Super Admin tersembunyi dari akun lain (konsisten dengan daftar Pengguna & timeline)
    .where(and(eq(users.isTutor, true), actor.isSuperuser ? undefined : eq(users.isSuperuser, false), onlyId ? eq(users.id, onlyId) : undefined))
    .orderBy(asc(users.nama));
}

/** Hitungan langsung (bukan snapshot): jumlah sesi hadir & subtotal untuk satu tentor. */
async function computeLive(exec: Exec, tutor: { id: string; tarifHonor: number }, from: Date, to: Date) {
  const rates = (await loadRates(exec, [tutor])).get(tutor.id);
  const groups = await exec
    .select({ mapel: programs.mapelKategori, n: count() })
    .from(sessions)
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(and(eq(sessions.tutorId, tutor.id), eq(sessions.statusKehadiran, "hadir"), gte(sessions.mulaiAt, from), lt(sessions.mulaiAt, to)))
    .groupBy(programs.mapelKategori);
  return {
    n: groups.reduce((a, g) => a + g.n, 0),
    subtotal: groups.reduce((a, g) => a + g.n * rateOf(rates, g.mapel), 0),
    zero: groups.filter((g) => rateOf(rates, g.mapel) === 0).map((g) => g.mapel),
  };
}

async function buildRows(actor: Actor, periode: string, onlyId?: string): Promise<HonorRow[]> {
  const { from, to } = monthBounds(periode);
  const tutors = await loadTutors(actor, onlyId);
  const [rates, groups, slips] = await Promise.all([
    loadRates(db(), tutors),
    db()
      .select({ tutorId: sessions.tutorId, mapel: programs.mapelKategori, n: count() })
      .from(sessions)
      .innerJoin(programs, eq(programs.id, sessions.programId))
      .where(and(eq(sessions.statusKehadiran, "hadir"), gte(sessions.mulaiAt, from), lt(sessions.mulaiAt, to)))
      .groupBy(sessions.tutorId, programs.mapelKategori),
    db().select().from(honorSlips).where(eq(honorSlips.periode, periode)),
  ]);
  const paidIds = slips.filter((s) => s.statusBayar === "lunas").map((s) => s.id);
  const locked = paidIds.length
    ? await db()
        .select({ slipId: sessions.honorSlipId, lo: min(sessions.honorTarif), hi: max(sessions.honorTarif) })
        .from(sessions)
        .where(inArray(sessions.honorSlipId, paidIds))
        .groupBy(sessions.honorSlipId)
    : [];
  const lockedBy = new Map(locked.map((l) => [l.slipId, l]));
  const actorIds = [...new Set(slips.flatMap((s) => [s.dibayarOleh, s.tunjanganOleh]).filter((x): x is string => !!x))];
  const names = new Map(
    (actorIds.length ? await db().select({ id: users.id, nama: users.nama }).from(users).where(inArray(users.id, actorIds)) : []).map((u) => [u.id, u.nama] as const),
  );
  const slipBy = new Map(slips.map((s) => [s.tutorId, s]));

  return tutors
    .filter((t) => t.status === "aktif" || groups.some((g) => g.tutorId === t.id) || slipBy.has(t.id))
    .map((t) => {
      const slip = slipBy.get(t.id);
      const mine = groups.filter((g) => g.tutorId === t.id);
      const rate = rates.get(t.id);
      const live = mine.reduce((a, g) => a + g.n, 0);
      const liveSub = mine.reduce((a, g) => a + g.n * rateOf(rate, g.mapel), 0);
      const used = mine.map((g) => rateOf(rate, g.mapel));
      const paid = slip?.statusBayar === "lunas";
      const lk = slip ? lockedBy.get(slip.id) : undefined;
      const tarifMin = paid ? (lk?.lo ?? 0) : used.length ? Math.min(...used) : t.tarifHonor;
      const tarifMax = paid ? (lk?.hi ?? 0) : used.length ? Math.max(...used) : t.tarifHonor;
      const tunjangan = slip?.tunjangan ?? 0;
      const subtotal = paid ? slip!.subtotal : liveSub;
      return {
        tutor_id: t.id,
        nama: t.nama,
        mapel: t.mapel ?? "lainnya",
        aktif: t.status === "aktif",
        no_wa: t.noWa,
        rekening: paid ? slip!.rekening : t.rekening,
        sesi: paid ? slip!.totalSesi : live,
        tarif_min: tarifMin,
        tarif_max: tarifMax,
        subtotal,
        tunjangan,
        tunjangan_ket: slip?.tunjanganKet ?? null,
        total: paid ? slip!.total : subtotal + tunjangan,
        tarif_kosong: !paid && used.some((u) => u === 0),
        slip: slip ? { id: slip.id, nomor: slip.nomor, status_bayar: slip.statusBayar, tgl_bayar: slip.tglBayar } : null,
        sesi_baru: paid ? Math.max(0, live - slip!.totalSesi) : 0,
        dicatat: paid ? { oleh: slip!.dibayarOleh ? (names.get(slip!.dibayarOleh) ?? null) : null, pada: slip!.dibayarPada?.toISOString() ?? null } : null,
        tunjangan_oleh: slip?.tunjanganOleh ? (names.get(slip.tunjanganOleh) ?? null) : null,
        tunjangan_pada: slip?.tunjanganPada?.toISOString() ?? null,
      };
    });
}

/** Rekap honor semua tentor pada satu periode (YYYY-MM). */
export async function listHonor(actor: Actor | null, periode: string): Promise<HonorRow[]> {
  assertCan(actor, "honor", "read");
  assertPeriode(periode);
  return buildRows(actor, periode);
}

async function nextNomor(tx: Tx, periode: string) {
  const [c] = await tx
    .insert(honorCounters)
    .values({ periode, lastNumber: 1 })
    .onConflictDoUpdate({ target: honorCounters.periode, set: { lastNumber: sql`${honorCounters.lastNumber} + 1` } })
    .returning({ n: honorCounters.lastNumber });
  return `SLIP/${periode.replace("-", "/")}/${String(c.n).padStart(3, "0")}`;
}

async function loadTutorTx(tx: Tx, actor: Actor, tutorId: string) {
  const [t] = await tx
    .select({ id: users.id, nama: users.nama, tarifHonor: users.tarifHonor, rekening: users.rekening })
    .from(users)
    .where(and(eq(users.id, tutorId), eq(users.isTutor, true), actor.isSuperuser ? undefined : eq(users.isSuperuser, false)))
    .limit(1);
  if (!t) throw new UserError("Tentor tidak ditemukan");
  return t;
}

const adjustSchema = z.object({
  tutor_id: z.string().regex(uuidRe, "Tentor tidak valid"),
  periode: z.string(),
  tunjangan: z.coerce.number().int("Tunjangan harus bilangan bulat").min(0, "Tunjangan tidak boleh negatif").max(100_000_000, "Tunjangan terlalu besar"),
  catatan: z.string().trim().max(200, "Keterangan maksimal 200 karakter").optional().transform((v) => v || null),
});

/** Atur tunjangan transport/bonus untuk satu tentor pada satu periode (hanya selama belum lunas). */
export async function saveHonorAdjustment(actor: Actor | null, input: z.input<typeof adjustSchema>) {
  assertCan(actor, "honor", "write");
  const p = adjustSchema.safeParse(input);
  if (!p.success) throw new UserError(p.error.issues[0].message);
  const v = p.data;
  assertPeriode(v.periode);
  const { from, to } = monthBounds(v.periode);

  return db().transaction(async (tx) => {
    const t = await loadTutorTx(tx, actor, v.tutor_id);
    const [slip] = await tx.select().from(honorSlips).where(and(eq(honorSlips.tutorId, t.id), eq(honorSlips.periode, v.periode))).for("update");
    if (slip?.statusBayar === "lunas") throw new UserError("Honor sudah lunas. Batalkan status lunas dulu untuk mengubah tunjangan.");

    const live = await computeLive(tx, t, from, to);
    const snapshot = {
      totalSesi: live.n,
      subtotal: live.subtotal,
      tunjangan: v.tunjangan,
      tunjanganKet: v.catatan,
      total: live.subtotal + v.tunjangan,
      rekening: t.rekening,
      tunjanganOleh: actor.id,
      tunjanganPada: new Date(),
    };
    let slipId = slip?.id;
    if (slip) {
      await tx.update(honorSlips).set({ ...snapshot, updatedAt: new Date(), updatedBy: actor.id }).where(eq(honorSlips.id, slip.id));
    } else {
      const nomor = await nextNomor(tx, v.periode);
      const [ins] = await tx.insert(honorSlips).values({ nomor, periode: v.periode, tutorId: t.id, ...snapshot, createdBy: actor.id }).returning({ id: honorSlips.id });
      slipId = ins.id;
    }
    await tx.insert(auditLog).values({ actorId: actor.id, aksi: "honor_tunjangan", target: slipId, detail: { tutor: t.nama, periode: v.periode, tunjangan: v.tunjangan, keterangan: v.catatan } });
    return "Tunjangan disimpan";
  });
}

const paySchema = z.object({
  tutor_id: z.string().regex(uuidRe, "Tentor tidak valid"),
  periode: z.string(),
  lunas: z.boolean(),
  tgl_bayar: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal bayar tidak valid").optional(),
});

/**
 * Tandai honor lunas (snapshot tarif per sesi + kunci sesi) atau batalkan lunas (buka kunci).
 * Berjalan dalam satu transaksi dengan penguncian baris.
 */
export async function setHonorPaid(actor: Actor | null, input: z.input<typeof paySchema>) {
  assertCan(actor, "honor", "write");
  const p = paySchema.safeParse(input);
  if (!p.success) throw new UserError(p.error.issues[0].message);
  const v = p.data;
  assertPeriode(v.periode);
  const today = todayWib();
  if (v.tgl_bayar && v.tgl_bayar > today) throw new UserError("Tanggal bayar tidak boleh di masa depan");
  const { from, to } = monthBounds(v.periode);

  return db().transaction(async (tx) => {
    const t = await loadTutorTx(tx, actor, v.tutor_id);
    const [slip] = await tx.select().from(honorSlips).where(and(eq(honorSlips.tutorId, t.id), eq(honorSlips.periode, v.periode))).for("update");

    if (!v.lunas) {
      if (!slip || slip.statusBayar !== "lunas") throw new UserError("Honor ini belum berstatus lunas");
      await tx.update(honorSlips).set({ statusBayar: "belum_lunas", tglBayar: null, dibayarOleh: null, dibayarPada: null, updatedAt: new Date(), updatedBy: actor.id }).where(eq(honorSlips.id, slip.id));
      await tx.update(sessions).set({ honorSlipId: null, honorTarif: null }).where(eq(sessions.honorSlipId, slip.id));
      await tx.insert(auditLog).values({ actorId: actor.id, aksi: "honor_batal_lunas", target: slip.id, detail: { tutor: t.nama, periode: v.periode, total: slip.total } });
      return "Status lunas dibatalkan. Sesi bulan itu bisa dikoreksi kembali.";
    }

    if (slip?.statusBayar === "lunas") throw new UserError("Honor ini sudah lunas");

    const rows = await tx
      .select({ id: sessions.id, mapel: programs.mapelKategori })
      .from(sessions)
      .innerJoin(programs, eq(programs.id, sessions.programId))
      .where(and(eq(sessions.tutorId, t.id), eq(sessions.statusKehadiran, "hadir"), gte(sessions.mulaiAt, from), lt(sessions.mulaiAt, to), isNull(sessions.honorSlipId)))
      .orderBy(asc(sessions.id))
      .for("update", { of: sessions });
    if (!rows.length) throw new UserError("Belum ada sesi yang sudah absen pada periode ini");

    const rate = (await loadRates(tx, [t])).get(t.id);
    const priced = rows.map((r) => ({ id: r.id, tarif: rateOf(rate, r.mapel), mapel: r.mapel }));
    const cats = await tx.select({ key: mapelCategories.key, label: mapelCategories.label }).from(mapelCategories);
    const labelOf = (k: string) => cats.find((c) => c.key === k)?.label ?? k;
    const zero = [...new Set(priced.filter((x) => x.tarif === 0).map((x) => labelOf(x.mapel)))];
    if (zero.length) throw new UserError(`Tarif honor untuk ${zero.join(", ")} belum diisi (isi di menu Tentor & Tarif)`);

    const subtotal = priced.reduce((a, x) => a + x.tarif, 0);
    const tunjangan = slip?.tunjangan ?? 0;
    const snapshot = {
      totalSesi: rows.length,
      subtotal,
      tunjangan,
      tunjanganKet: slip?.tunjanganKet ?? null,
      total: subtotal + tunjangan,
      rekening: t.rekening,
      statusBayar: "lunas" as const,
      tglBayar: v.tgl_bayar || today,
      dibayarOleh: actor.id,
      dibayarPada: new Date(),
    };
    let slipId = slip?.id;
    if (slip) {
      await tx.update(honorSlips).set({ ...snapshot, updatedAt: new Date(), updatedBy: actor.id }).where(eq(honorSlips.id, slip.id));
    } else {
      const nomor = await nextNomor(tx, v.periode);
      const [ins] = await tx.insert(honorSlips).values({ nomor, periode: v.periode, tutorId: t.id, ...snapshot, createdBy: actor.id }).returning({ id: honorSlips.id });
      slipId = ins.id;
    }
    // bekukan tarif per sesi (dikelompokkan per tarif supaya sedikit query)
    const byTarif = new Map<number, string[]>();
    for (const x of priced) byTarif.set(x.tarif, [...(byTarif.get(x.tarif) ?? []), x.id]);
    for (const [tarif, ids] of byTarif) await tx.update(sessions).set({ honorSlipId: slipId, honorTarif: tarif }).where(inArray(sessions.id, ids));
    await tx.insert(auditLog).values({ actorId: actor.id, aksi: "honor_lunas", target: slipId, detail: { tutor: t.nama, periode: v.periode, sesi: rows.length, total: snapshot.total, tgl_bayar: snapshot.tglBayar } });
    return `Honor ${t.nama} ditandai lunas (${rows.length} sesi)`;
  });
}

export type HonorPdfItem = {
  siswa: string;
  panggilan: string | null;
  kelas: string | null;
  program: string;
  /** Hanya ABK: label kategori ditampilkan di samping kelas. */
  abk: boolean;
  /** Tanggal mengajar "YYYY-MM-DD" (WIB), urut. */
  tanggal: string[];
  sesi: number;
  tarif: number;
  subtotal: number;
};

export type HonorPdfData = {
  nomor: string | null;
  periode: string;
  tutor: { nama: string; mapel: MapelKey; mapel_label: string; rekening: string | null };
  sesi: number;
  subtotal: number;
  tunjangan: number;
  tunjangan_ket: string | null;
  total: number;
  status_bayar: "belum_lunas" | "lunas";
  tgl_bayar: string | null;
  /** Tanggal pada baris tanda tangan: tanggal bayar (lunas) atau hari ini (draf). */
  tgl_ttd: string;
  items: HonorPdfItem[];
  branding: Branding;
  /** Penandatangan: admin yang menandai lunas (draf: akun yang mencetak). ttd kosong = tanpa gambar. */
  signer: { nama: string; ttd: { data: Buffer; format: "png" | "jpg" } | null } | null;
};

/** Data slip PDF. Lunas = snapshot (tarif per sesi & sesi terkunci); belum lunas = draf hitungan saat ini. */
export async function getHonorPdfData(actor: Actor | null, tutorId: string, periode: string): Promise<HonorPdfData | null> {
  assertCan(actor, "honor", "read");
  if (!uuidRe.test(tutorId) || !PERIODE.test(periode)) return null;
  const [row] = await buildRows(actor, periode, tutorId);
  if (!row) return null;
  const { from, to } = monthBounds(periode);
  const paid = row.slip?.status_bayar === "lunas";

  const [tutor] = await db().select({ id: users.id, tarifHonor: users.tarifHonor }).from(users).where(eq(users.id, tutorId));
  const rate = (await loadRates(db(), [tutor])).get(tutorId);
  const sessRows = await db()
    .select({
      mulai: sessions.mulaiAt,
      honorTarif: sessions.honorTarif,
      studentId: students.id,
      siswa: students.nama,
      panggilan: students.panggilan,
      kelas: students.kelas,
      programId: programs.id,
      program: programs.nama,
      kategori: programs.kategori,
      mapel: programs.mapelKategori,
    })
    .from(sessions)
    .innerJoin(students, eq(students.id, sessions.studentId))
    .innerJoin(programs, eq(programs.id, sessions.programId))
    .where(
      paid
        ? eq(sessions.honorSlipId, row.slip!.id)
        : and(eq(sessions.tutorId, tutorId), eq(sessions.statusKehadiran, "hadir"), gte(sessions.mulaiAt, from), lt(sessions.mulaiAt, to)),
    )
    .orderBy(asc(students.nama), asc(sessions.mulaiAt));

  // satu baris per siswa + program + tarif (tarif yang dibekukan saat lunas, atau tarif saat ini untuk draf)
  const groups = new Map<string, HonorPdfItem>();
  for (const r of sessRows) {
    const tarif = paid ? (r.honorTarif ?? 0) : rateOf(rate, r.mapel);
    const key = `${r.studentId}|${r.programId}|${tarif}`;
    const g = groups.get(key) ?? { siswa: r.siswa, panggilan: r.panggilan, kelas: r.kelas, program: r.program, abk: r.kategori === "abk", tanggal: [], sesi: 0, tarif, subtotal: 0 };
    g.tanggal.push(new Date(r.mulai.getTime() + 7 * 3600_000).toISOString().slice(0, 10));
    g.sesi += 1;
    g.subtotal += tarif;
    groups.set(key, g);
  }

  const branding = await loadBranding();
  const signerId = paid ? ((await db().select({ p: honorSlips.dibayarOleh, u: honorSlips.updatedBy, c: honorSlips.createdBy }).from(honorSlips).where(eq(honorSlips.id, row.slip!.id)))[0] ?? null) : null;
  const signerUserId = paid ? (signerId?.p ?? signerId?.u ?? signerId?.c ?? null) : actor.id;
  let signer: HonorPdfData["signer"] = null;
  if (signerUserId) {
    const [u] = await db().select({ nama: users.nama, ttd: users.ttdFileId }).from(users).where(eq(users.id, signerUserId));
    if (u) {
      const img = await readStoredFile(u.ttd);
      signer = { nama: u.nama, ttd: img ? { data: img.data, format: img.format } : null };
    }
  }

  return {
    nomor: row.slip?.nomor ?? null,
    periode,
    tutor: {
      nama: row.nama,
      mapel: row.mapel,
      mapel_label: (await db().select({ label: mapelCategories.label }).from(mapelCategories).where(eq(mapelCategories.key, row.mapel)))[0]?.label ?? "-",
      rekening: row.rekening,
    },
    sesi: row.sesi,
    subtotal: row.subtotal,
    tunjangan: row.tunjangan,
    tunjangan_ket: row.tunjangan_ket,
    total: row.total,
    status_bayar: row.slip?.status_bayar ?? "belum_lunas",
    tgl_bayar: row.slip?.tgl_bayar ?? null,
    tgl_ttd: paid && row.slip?.tgl_bayar ? row.slip.tgl_bayar : todayWib(),
    items: [...groups.values()],
    branding,
    signer,
  };
}

export type HonorInvoiceInfo = {
  /** Sesi hadir tentor ini pada periode, dan berapa yang sudah / belum masuk invoice. */
  sesi_total: number;
  sesi_ditagih: number;
  sesi_belum_ditagih: number;
  invoices: {
    id: string;
    nomor: string;
    tgl_terbit: string;
    siswa: string;
    kelas: string | null;
    program: string;
    /** Berapa sesi tentor ini (pada periode) yang ada di invoice itu, dari total sesi invoice. */
    sesi_tentor: number;
    jumlah_sesi: number;
    total: number;
    status_bayar: "lunas" | "belum_lunas";
    tgl_bayar: string | null;
  }[];
};

/**
 * Invoice yang memuat sesi tentor ini pada periode — untuk dicek admin sebelum menandai honor lunas
 * (mis. memastikan sesi sudah ditagih / sudah dibayar siswa). Butuh akses Honor DAN Invoice.
 */
export async function getHonorInvoices(actor: Actor | null, tutorId: string, periode: string): Promise<HonorInvoiceInfo> {
  assertCan(actor, "honor", "read");
  assertCan(actor, "invoice", "read");
  if (!uuidRe.test(tutorId)) throw new UserError("Tentor tidak valid");
  assertPeriode(periode);
  if (!(await loadTutors(actor, tutorId)).length) throw new UserError("Tentor tidak ditemukan");
  const { from, to } = monthBounds(periode);

  const groups = await db()
    .select({ invoiceId: sessions.invoiceId, n: count() })
    .from(sessions)
    .where(and(eq(sessions.tutorId, tutorId), eq(sessions.statusKehadiran, "hadir"), gte(sessions.mulaiAt, from), lt(sessions.mulaiAt, to)))
    .groupBy(sessions.invoiceId);
  const ids = groups.flatMap((g) => (g.invoiceId ? [g.invoiceId] : []));
  const rows = ids.length
    ? await db()
        .select({ i: invoices, siswa: students.nama, kelas: students.kelas, program: programs.nama })
        .from(invoices)
        .innerJoin(students, eq(students.id, invoices.studentId))
        .innerJoin(programs, eq(programs.id, invoices.programId))
        .where(inArray(invoices.id, ids))
        .orderBy(desc(invoices.tglTerbit))
    : [];
  const perInvoice = new Map(groups.map((g) => [g.invoiceId, g.n]));
  const total = groups.reduce((a, g) => a + g.n, 0);
  const ditagih = groups.filter((g) => g.invoiceId).reduce((a, g) => a + g.n, 0);
  return {
    sesi_total: total,
    sesi_ditagih: ditagih,
    sesi_belum_ditagih: total - ditagih,
    invoices: rows.map((r) => ({
      id: r.i.id,
      nomor: r.i.nomor,
      tgl_terbit: r.i.tglTerbit.toISOString(),
      siswa: r.siswa,
      kelas: r.kelas,
      program: r.program,
      sesi_tentor: perInvoice.get(r.i.id) ?? 0,
      jumlah_sesi: r.i.jumlahSesi,
      total: r.i.total,
      status_bayar: r.i.statusBayar,
      tgl_bayar: r.i.tglBayar,
    })),
  };
}

/** Riwayat pencatatan honor satu tentor pada satu periode (tunjangan, lunas, batal lunas). Terbaru dulu. */
export async function getHonorHistory(actor: Actor | null, tutorId: string, periode: string): Promise<AuditItem[]> {
  assertCan(actor, "honor", "read");
  if (!uuidRe.test(tutorId) || !PERIODE.test(periode)) return [];
  const [slip] = await db().select({ id: honorSlips.id }).from(honorSlips).where(and(eq(honorSlips.tutorId, tutorId), eq(honorSlips.periode, periode)));
  if (!slip) return [];
  const rows = await db()
    .select({ a: auditLog, nama: users.nama })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(and(eq(auditLog.target, slip.id), sql`${auditLog.aksi} like 'honor\_%'`))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(50);
  return rows.map(({ a, nama }) => ({ at: a.createdAt.toISOString(), oleh: nama ?? null, aksi: a.aksi, detail: (a.detail as Record<string, unknown> | null) ?? null }));
}
