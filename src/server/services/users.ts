import { and, asc, count, eq, gte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, sessions, users } from "@/db/schema";
import type { Role } from "@/lib/roles";
import { assertSuperAdmin, UserError, type Actor } from "../authz";
import { dummyVerify, hashPassword, verifyPassword } from "../password";
import { deleteUserSessions } from "../session";

// ---------- LOGIN ----------
// Rate limit sederhana di memori (1 container). Cukup untuk menahan tebak password.
const attempts = new Map<string, { n: number; until: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60_000;

export async function authenticate(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  const now = Date.now();
  const a = attempts.get(email);
  if (a && a.until > now && a.n >= MAX_ATTEMPTS) {
    throw new UserError("Terlalu banyak percobaan login. Coba lagi dalam 15 menit.");
  }
  const [u] = await db()
    .select({ id: users.id, passwordHash: users.passwordHash, status: users.status })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  const ok = u ? await verifyPassword(password, u.passwordHash) : (await dummyVerify(password), false);
  if (!ok) {
    const cur = a && a.until > now ? a : { n: 0, until: now + WINDOW_MS };
    attempts.set(email, { n: cur.n + 1, until: cur.until });
    throw new UserError("Email atau password salah");
  }
  attempts.delete(email);
  if (u!.status !== "aktif") throw new UserError("Akun Anda nonaktif. Hubungi admin.");
  return u!.id;
}

// ---------- KELOLA AKUN (Super Admin) ----------
export type UserRow = {
  id: string;
  email: string | null;
  nama: string;
  no_wa: string | null;
  role: Role;
  spesialisasi: string | null;
  status: "aktif" | "nonaktif";
  created_at: string;
};

export async function listUsers(actor: Actor): Promise<UserRow[]> {
  assertSuperAdmin(actor);
  const rows = await db().select().from(users).orderBy(asc(users.role), asc(users.nama));
  return rows.map((u) => ({
    id: u.id,
    email: u.email,
    nama: u.nama,
    no_wa: u.noWa,
    role: u.role,
    spesialisasi: u.spesialisasi,
    status: u.status,
    created_at: u.createdAt.toISOString(),
  }));
}

const roleEnum = z.enum(["super_admin", "admin", "tentor"]);
const opt = z.string().trim().optional().transform((v) => v || null);
const tutorNeedsSpec = (v: { role: string; spesialisasi: string | null }) => v.role !== "tentor" || !!v.spesialisasi;

const createSchema = z
  .object({
    nama: z.string().trim().min(2, "Nama minimal 2 huruf"),
    email: z.string().trim().toLowerCase().email("Email tidak valid"),
    password: z.string().min(8, "Password minimal 8 karakter").max(200),
    role: roleEnum,
    no_wa: opt,
    spesialisasi: opt,
  })
  .refine(tutorNeedsSpec, { message: "Spesialisasi wajib untuk tentor" });

export async function createUser(actor: Actor | null, input: z.input<typeof createSchema>) {
  assertSuperAdmin(actor);
  const p = createSchema.safeParse(input);
  if (!p.success) throw new UserError(p.error.issues[0].message);
  const v = p.data;
  const passwordHash = await hashPassword(v.password);
  try {
    const [u] = await db()
      .insert(users)
      .values({ email: v.email, passwordHash, nama: v.nama, noWa: v.no_wa, role: v.role, spesialisasi: v.role === "tentor" ? v.spesialisasi : null })
      .returning({ id: users.id });
    await db().insert(auditLog).values({ actorId: actor.id, aksi: "buat_akun", target: u.id, detail: { email: v.email, role: v.role } });
    return { id: u.id, message: `Akun ${v.email} dibuat` };
  } catch (e) {
    if ((e as { cause?: { code?: string } }).cause?.code === "23505") throw new UserError("Email sudah terdaftar");
    throw e;
  }
}

const updateSchema = z
  .object({
    id: z.string().uuid(),
    nama: z.string().trim().min(2, "Nama minimal 2 huruf"),
    role: roleEnum,
    status: z.enum(["aktif", "nonaktif"]),
    no_wa: opt,
    spesialisasi: opt,
  })
  .refine(tutorNeedsSpec, { message: "Spesialisasi wajib untuk tentor" });

/**
 * Ubah akun (pengganti trigger guard_profile_update):
 * - hanya Super Admin
 * - Super Admin aktif terakhir tidak boleh diturunkan/dinonaktifkan
 * - perubahan peran/status dicatat di audit_log
 */
export async function updateUser(actor: Actor | null, input: z.input<typeof updateSchema>) {
  assertSuperAdmin(actor);
  const p = updateSchema.safeParse(input);
  if (!p.success) throw new UserError(p.error.issues[0].message);
  const { id, ...v } = p.data;

  const before = await db().transaction(async (tx) => {
    // Kunci semua Super Admin aktif agar dua permintaan bersamaan tidak sama-sama lolos.
    const supers = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "super_admin"), eq(users.status, "aktif")))
      .orderBy(asc(users.id))
      .for("update");
    const [old] = await tx.select().from(users).where(eq(users.id, id)).for("update");
    if (!old) throw new UserError("Akun tidak ditemukan");

    const wasActiveSuper = old.role === "super_admin" && old.status === "aktif";
    const staysActiveSuper = v.role === "super_admin" && v.status === "aktif";
    if (wasActiveSuper && !staysActiveSuper && supers.filter((s) => s.id !== id).length === 0) {
      throw new UserError("Harus selalu ada minimal satu Super Admin aktif");
    }

    await tx
      .update(users)
      .set({ nama: v.nama, role: v.role, status: v.status, noWa: v.no_wa, spesialisasi: v.role === "tentor" ? v.spesialisasi : null, updatedAt: new Date() })
      .where(eq(users.id, id));

    if (old.role !== v.role || old.status !== v.status) {
      await tx.insert(auditLog).values({
        actorId: actor.id,
        aksi: "ubah_akun",
        target: id,
        detail: { email: old.email, role_lama: old.role, role_baru: v.role, status_lama: old.status, status_baru: v.status },
      });
    }
    return old;
  });

  // Akun dinonaktifkan → putus semua sesi login perangkatnya
  if (v.status === "nonaktif") await deleteUserSessions(id);

  let message = "Akun diperbarui";
  if (before.role === "tentor" && v.role !== "tentor") {
    const [{ n }] = await db()
      .select({ n: count() })
      .from(sessions)
      .where(and(eq(sessions.tutorId, id), eq(sessions.statusKehadiran, "terjadwal"), gte(sessions.mulaiAt, new Date())));
    if (n) message += `. Perhatian: ${n} jadwal mendatang masih atas nama akun ini, alihkan di menu Jadwal.`;
  }
  return message;
}

export async function resetPassword(actor: Actor | null, id: string, password: string) {
  assertSuperAdmin(actor);
  if (password.length < 8 || password.length > 200) throw new UserError("Password minimal 8 karakter");
  const r = await db()
    .update(users)
    .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning({ id: users.id });
  if (!r.length) throw new UserError("Akun tidak ditemukan");
  // logout paksa perangkat lain, kecuali bila mereset password sendiri
  if (id !== actor.id) await deleteUserSessions(id);
  await db().insert(auditLog).values({ actorId: actor.id, aksi: "reset_password", target: id });
  return "Password direset";
}

/** Dipakai bootstrap: ada akun sama sekali? */
export async function hasAnyUser() {
  const [{ n }] = await db().select({ n: count() }).from(users).where(ne(users.email, ""));
  return n > 0;
}
