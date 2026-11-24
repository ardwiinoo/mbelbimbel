import { cache } from "react";
import { and, asc, count, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, mapelCategories, programs, tutorHonorRates, users } from "@/db/schema";
import { FALLBACK_KEY, HEX, type MapelCat } from "@/lib/mapel";
import { assertCan, UserError, type Actor } from "../authz";

const toCat = (r: typeof mapelCategories.$inferSelect): MapelCat => ({ key: r.key, label: r.label, short: r.short, bg: r.bg, dot: r.dot, urut: r.urut, aktif: r.aktif });

/** Semua kategori (untuk warna & pilihan di seluruh aplikasi). Dipanggil dari layout setelah login. */
export const listMapel = cache(async (): Promise<MapelCat[]> => {
  const rows = await db().select().from(mapelCategories).orderBy(asc(mapelCategories.urut), asc(mapelCategories.label));
  return rows.map(toCat);
});

export type MapelAdminRow = MapelCat & { dipakai: { program: number; tentor: number } };

/** Daftar untuk halaman pengelola: beserta berapa program/tentor yang memakai tiap kategori. */
export async function listMapelAdmin(actor: Actor | null): Promise<MapelAdminRow[]> {
  assertCan(actor, "tentor", "read");
  const [cats, progs, tutors] = await Promise.all([
    listMapel(),
    db().select({ k: programs.mapelKategori, n: count() }).from(programs).groupBy(programs.mapelKategori),
    db().select({ k: users.mapelKategori, n: count() }).from(users).where(eq(users.isTutor, true)).groupBy(users.mapelKategori),
  ]);
  return cats.map((c) => ({
    ...c,
    dipakai: { program: progs.find((p) => p.k === c.key)?.n ?? 0, tentor: tutors.find((t) => t.k === c.key)?.n ?? 0 },
  }));
}

const hex = z.string().trim().regex(HEX, "Warna harus berformat #RRGGBB").transform((v) => v.toUpperCase());
const saveSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{2,30}$/).optional(),
  label: z.string().trim().min(2, "Nama kategori minimal 2 huruf").max(40, "Nama kategori maksimal 40 karakter"),
  short: z.string().trim().max(20, "Label pendek maksimal 20 karakter").optional(),
  bg: hex,
  dot: hex,
  urut: z.coerce.number().int().min(0).max(999).default(100),
  aktif: z.boolean().default(true),
});

const MAX_CATEGORIES = 40;

/** "Matematika SMA & UTBK" → "matematika_sma_utbk" */
function slugify(label: string) {
  const s = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28);
  return s.length >= 2 ? s : "mapel";
}

/** Tambah kategori baru (tanpa key) atau ubah yang ada (dengan key). Butuh akses Tentor & Tarif (Kelola). */
export async function saveMapel(actor: Actor | null, input: z.input<typeof saveSchema>) {
  assertCan(actor, "tentor", "write");
  const p = saveSchema.safeParse(input);
  if (!p.success) throw new UserError(p.error.issues[0].message);
  const v = p.data;
  const short = v.short || v.label;

  if (v.key) {
    if (v.key === FALLBACK_KEY && !v.aktif) throw new UserError('Kategori "lainnya" adalah cadangan dan tidak bisa dinonaktifkan');
    const r = await db()
      .update(mapelCategories)
      .set({ label: v.label, short, bg: v.bg, dot: v.dot, urut: v.urut, aktif: v.aktif, updatedAt: new Date(), updatedBy: actor.id })
      .where(eq(mapelCategories.key, v.key))
      .returning({ key: mapelCategories.key });
    if (!r.length) throw new UserError("Kategori tidak ditemukan");
    return { message: "Kategori mapel diperbarui", id: v.key };
  }

  const [{ n }] = await db().select({ n: count() }).from(mapelCategories);
  if (n >= MAX_CATEGORIES) throw new UserError(`Maksimal ${MAX_CATEGORIES} kategori mapel`);
  const exists = await db().select({ key: mapelCategories.key, label: mapelCategories.label }).from(mapelCategories);
  if (exists.some((e) => e.label.toLowerCase() === v.label.toLowerCase())) throw new UserError("Nama kategori sudah ada");
  const base = slugify(v.label);
  let key = base;
  for (let i = 2; exists.some((e) => e.key === key); i++) key = `${base.slice(0, 26)}_${i}`;
  await db().insert(mapelCategories).values({ key, label: v.label, short, bg: v.bg, dot: v.dot, urut: v.urut, aktif: v.aktif, createdBy: actor.id });
  await db().insert(auditLog).values({ actorId: actor.id, aksi: "tambah_mapel", target: key, detail: { label: v.label } });
  return { message: "Kategori mapel ditambahkan", id: key };
}

/** Hapus kategori yang belum dipakai siapa pun. Yang sudah dipakai cukup dinonaktifkan. */
export async function deleteMapel(actor: Actor | null, key: string) {
  assertCan(actor, "tentor", "write");
  if (!/^[a-z0-9_]{2,30}$/.test(key)) throw new UserError("Kategori tidak valid");
  if (key === FALLBACK_KEY) throw new UserError('Kategori "lainnya" adalah cadangan dan tidak bisa dihapus');
  const [pr, us, rt] = await Promise.all([
    db().select({ n: count() }).from(programs).where(eq(programs.mapelKategori, key)),
    db().select({ n: count() }).from(users).where(eq(users.mapelKategori, key)),
    db().select({ n: count() }).from(tutorHonorRates).where(eq(tutorHonorRates.mapelKategori, key)),
  ]);
  if (pr[0].n + us[0].n + rt[0].n > 0) throw new UserError("Kategori masih dipakai program/tentor. Nonaktifkan saja bila tidak ingin dipakai lagi.");
  const r = await db().delete(mapelCategories).where(and(eq(mapelCategories.key, key), ne(mapelCategories.key, FALLBACK_KEY))).returning({ key: mapelCategories.key });
  if (!r.length) throw new UserError("Kategori tidak ditemukan");
  await db().insert(auditLog).values({ actorId: actor.id, aksi: "hapus_mapel", target: key });
  return "Kategori mapel dihapus";
}

/** Pastikan semua kunci ada (dipakai saat menyimpan program/tentor). */
export async function assertMapelExist(keys: string[]) {
  const uniq = [...new Set(keys)];
  if (!uniq.length) return;
  const rows = await db().select({ key: mapelCategories.key }).from(mapelCategories).where(inArray(mapelCategories.key, uniq));
  if (rows.length !== uniq.length) throw new UserError("Kategori mapel tidak ditemukan");
}
