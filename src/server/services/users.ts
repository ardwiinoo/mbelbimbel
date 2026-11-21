import { and, asc, count, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db, type DB, type Tx } from "@/db";
import { auditLog, sessions, userPermissions, users } from "@/db/schema";
import { can, isModule, MODULES, withinGrantorAccess, type Module, type Permissions } from "@/lib/access";
import { assertActive, assertCan, ForbiddenError, loadPermissions, UserError, type Actor } from "../authz";
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

// ---------- KELOLA AKUN (akses "Pengguna & Akses") ----------
// Aturan keamanan (dicek di server, tidak bisa diakali lewat API):
// 1. Lihat daftar = Pengguna (Lihat); buat/ubah/reset = Pengguna (Kelola).
// 2. Akun Super Admin TERSEMBUNYI & tidak bisa disentuh oleh selain Super Admin.
// 3. Hanya Super Admin yang bisa memberi/mencabut status Super Admin.
// 4. Tidak bisa memberi akses melebihi akses sendiri, dan tidak bisa mengelola
//    akun yang aksesnya melebihi akses sendiri (anti eskalasi hak).
// 5. Bukan Super Admin tidak bisa mengubah akses akunnya sendiri.
// 6. Harus selalu ada minimal satu Super Admin aktif.
// 7. Semua perubahan tercatat (created_by/updated_by + audit_log dengan nilai lama → baru).

const creator = alias(users, "creator_user");
const updater = alias(users, "updater_user");

export type UserRow = {
  id: string;
  email: string;
  nama: string;
  no_wa: string | null;
  spesialisasi: string | null;
  status: "aktif" | "nonaktif";
  is_tutor: boolean;
  is_superuser: boolean;
  perms: Permissions;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
};

export async function listUsers(actor: Actor | null): Promise<UserRow[]> {
  assertCan(actor, "pengguna", "read");
  const rows = await db()
    .select({ u: users, cNama: creator.nama, uNama: updater.nama })
    .from(users)
    .leftJoin(creator, eq(creator.id, users.createdBy))
    .leftJoin(updater, eq(updater.id, users.updatedBy))
    .where(actor.isSuperuser ? undefined : eq(users.isSuperuser, false)) // aturan 2
    .orderBy(desc(users.isSuperuser), asc(users.nama));
  const ids = rows.map((r) => r.u.id);
  const permRows = ids.length ? await db().select().from(userPermissions).where(inArray(userPermissions.userId, ids)) : [];
  return rows.map(({ u, cNama, uNama }) => {
    const perms: Permissions = {};
    for (const p of permRows) if (p.userId === u.id && isModule(p.module)) perms[p.module] = p.level;
    return {
      id: u.id,
      email: u.email,
      nama: u.nama,
      no_wa: u.noWa,
      spesialisasi: u.spesialisasi,
      status: u.status,
      is_tutor: u.isTutor,
      is_superuser: u.isSuperuser,
      perms,
      created_at: u.createdAt.toISOString(),
      created_by: cNama ?? null,
      updated_at: u.updatedAt.toISOString(),
      updated_by: uNama ?? null,
    };
  });
}

const opt = z.string().trim().optional().transform((v) => v || null);
const permsSchema = z
  .record(z.string(), z.enum(["read", "write", ""]).optional())
  .transform((rec) => {
    const out: Permissions = {};
    for (const [k, v] of Object.entries(rec)) if (isModule(k) && (v === "read" || v === "write")) out[k] = v;
    return out;
  });
const tutorNeedsSpec = (v: { is_tutor: boolean; spesialisasi: string | null }) => !v.is_tutor || !!v.spesialisasi;

const createSchema = z
  .object({
    nama: z.string().trim().min(2, "Nama minimal 2 huruf"),
    email: z.string().trim().toLowerCase().email("Email tidak valid"),
    password: z.string().min(8, "Password minimal 8 karakter").max(200),
    is_tutor: z.boolean(),
    is_superuser: z.boolean().default(false),
    perms: permsSchema,
    no_wa: opt,
    spesialisasi: opt,
  })
  .refine(tutorNeedsSpec, { message: "Spesialisasi wajib untuk akun yang mengajar" });

const updateSchema = z
  .object({
    id: z.string().uuid(),
    nama: z.string().trim().min(2, "Nama minimal 2 huruf"),
    status: z.enum(["aktif", "nonaktif"]),
    is_tutor: z.boolean(),
    is_superuser: z.boolean(),
    perms: permsSchema,
    no_wa: opt,
    spesialisasi: opt,
  })
  .refine(tutorNeedsSpec, { message: "Spesialisasi wajib untuk akun yang mengajar" });

/** Aturan 3 & 4: akses yang diberikan tidak boleh melebihi akses pemberi. */
function assertGrantable(actor: Actor, next: { is_superuser: boolean; perms: Permissions }) {
  if (next.is_superuser && !actor.isSuperuser) throw new ForbiddenError("Hanya Super Admin yang bisa memberi status Super Admin");
  if (!withinGrantorAccess(actor, next.perms)) {
    const over = MODULES.filter((m) => next.perms[m.key] && !can(actor, m.key, next.perms[m.key]!)).map((m) => m.label);
    throw new ForbiddenError(`Tidak bisa memberi akses melebihi akses Anda sendiri (${over.join(", ")})`);
  }
}

/** Aturan 2, 4, 5: boleh-kah actor mengelola akun target ini? Target "tidak terlihat" → pesan 'tidak ditemukan'. */
async function loadManageableTarget(actor: Actor, id: string, q: DB | Tx = db(), { allowSelf = false } = {}) {
  const [t] = await q.select().from(users).where(eq(users.id, id)).limit(1);
  if (!t || (t.isSuperuser && !actor.isSuperuser)) throw new UserError("Akun tidak ditemukan");
  if (!actor.isSuperuser) {
    if (t.id === actor.id && !allowSelf) throw new ForbiddenError("Akses akun sendiri tidak bisa diubah di sini. Minta Super Admin.");
    const targetPerms = await loadPermissions(t.id, q);
    if (!withinGrantorAccess(actor, targetPerms)) throw new ForbiddenError("Tidak bisa mengelola akun yang aksesnya melebihi akses Anda");
  }
  return t;
}

async function writePerms(tx: Tx, userId: string, perms: Permissions) {
  await tx.delete(userPermissions).where(eq(userPermissions.userId, userId));
  const rows = (Object.entries(perms) as [Module, "read" | "write"][]).map(([module, level]) => ({ userId, module, level }));
  if (rows.length) await tx.insert(userPermissions).values(rows);
}

export async function createUser(actor: Actor | null, input: z.input<typeof createSchema>) {
  assertCan(actor, "pengguna", "write");
  const p = createSchema.safeParse(input);
  if (!p.success) throw new UserError(p.error.issues[0].message);
  const v = p.data;
  const perms = v.is_superuser ? {} : v.perms; // Super Admin = semua akses lewat flag
  assertGrantable(actor, { is_superuser: v.is_superuser, perms });
  const passwordHash = await hashPassword(v.password);
  try {
    const id = await db().transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          email: v.email,
          passwordHash,
          nama: v.nama,
          noWa: v.no_wa,
          isTutor: v.is_tutor,
          isSuperuser: v.is_superuser,
          spesialisasi: v.is_tutor ? v.spesialisasi : null,
          createdBy: actor.id,
          updatedBy: actor.id,
        })
        .returning({ id: users.id });
      await writePerms(tx, u.id, perms);
      await tx.insert(auditLog).values({
        actorId: actor.id,
        aksi: "buat_akun",
        target: u.id,
        detail: { email: v.email, is_tutor: v.is_tutor, is_superuser: v.is_superuser, perms },
      });
      return u.id;
    });
    return { id, message: `Akun ${v.email} dibuat` };
  } catch (e) {
    if ((e as { cause?: { code?: string } }).cause?.code === "23505") throw new UserError("Email sudah terdaftar");
    throw e;
  }
}

export async function updateUser(actor: Actor | null, input: z.input<typeof updateSchema>) {
  assertCan(actor, "pengguna", "write");
  const p = updateSchema.safeParse(input);
  if (!p.success) throw new UserError(p.error.issues[0].message);
  const { id, ...v } = p.data;
  const perms = v.is_superuser ? {} : v.perms;
  assertGrantable(actor, { is_superuser: v.is_superuser, perms });

  const before = await db().transaction(async (tx) => {
    // Kunci semua Super Admin aktif agar dua permintaan bersamaan tidak sama-sama lolos (aturan 6).
    const supers = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.isSuperuser, true), eq(users.status, "aktif")))
      .orderBy(asc(users.id))
      .for("update");
    const old = await loadManageableTarget(actor, id, tx);
    const oldPerms = await loadPermissions(id, tx);
    // Super Admin boleh mengubah akunnya sendiri, tapi tidak boleh menurunkan diri bila ia yang terakhir.
    const wasActiveSuper = old.isSuperuser && old.status === "aktif";
    const staysActiveSuper = v.is_superuser && v.status === "aktif";
    if (wasActiveSuper && !staysActiveSuper && supers.filter((s) => s.id !== id).length === 0) {
      throw new UserError("Harus selalu ada minimal satu Super Admin aktif");
    }

    await tx
      .update(users)
      .set({
        nama: v.nama,
        status: v.status,
        isTutor: v.is_tutor,
        isSuperuser: v.is_superuser,
        noWa: v.no_wa,
        spesialisasi: v.is_tutor ? v.spesialisasi : null,
        updatedAt: new Date(),
        updatedBy: actor.id,
      })
      .where(eq(users.id, id));
    await writePerms(tx, id, perms);
    await tx.insert(auditLog).values({
      actorId: actor.id,
      aksi: "ubah_akun",
      target: id,
      detail: {
        email: old.email,
        status: { lama: old.status, baru: v.status },
        mengajar: { lama: old.isTutor, baru: v.is_tutor },
        super_admin: { lama: old.isSuperuser, baru: v.is_superuser },
        akses: { lama: oldPerms, baru: perms },
      },
    });
    return old;
  });

  if (v.status === "nonaktif") await deleteUserSessions(id); // putus semua sesi login

  let message = "Akun diperbarui";
  if (before.isTutor && !v.is_tutor) {
    const [{ n }] = await db()
      .select({ n: count() })
      .from(sessions)
      .where(and(eq(sessions.tutorId, id), eq(sessions.statusKehadiran, "terjadwal"), gte(sessions.mulaiAt, new Date())));
    if (n) message += `. Perhatian: ${n} jadwal mendatang masih atas nama akun ini, alihkan di menu Jadwal.`;
  }
  return message;
}

export async function resetPassword(actor: Actor | null, id: string, password: string) {
  assertCan(actor, "pengguna", "write");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new UserError("Akun tidak ditemukan");
  if (password.length < 8 || password.length > 200) throw new UserError("Password minimal 8 karakter");
  // Reset password akun yang lebih berkuasa = pengambilalihan akun → ditolak (aturan 2 & 4)
  await loadManageableTarget(actor, id);
  await db()
    .update(users)
    .set({ passwordHash: await hashPassword(password), updatedAt: new Date(), updatedBy: actor.id })
    .where(eq(users.id, id));
  if (id !== actor.id) await deleteUserSessions(id); // logout paksa semua perangkat akun itu
  await db().insert(auditLog).values({ actorId: actor.id, aksi: "reset_password", target: id });
  return "Password direset";
}

/** Dipakai bootstrap: ada akun sama sekali? */
export async function hasAnyUser() {
  const [{ n }] = await db().select({ n: count() }).from(users).where(ne(users.email, ""));
  return n > 0;
}

// ---------- PROFIL SENDIRI (semua peran) ----------
async function assertCurrentPassword(userId: string, currentPassword: string) {
  const [u] = await db().select({ hash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u || !(await verifyPassword(currentPassword, u.hash))) throw new UserError("Password saat ini salah");
}

/** Ganti email login sendiri. Wajib konfirmasi password saat ini (tanpa verifikasi email). */
export async function changeOwnEmail(actor: Actor | null, newEmail: string, currentPassword: string) {
  assertActive(actor);
  const email = z.string().trim().toLowerCase().email("Email tidak valid").safeParse(newEmail);
  if (!email.success) throw new UserError(email.error.issues[0].message);
  await assertCurrentPassword(actor.id, currentPassword);
  try {
    await db().update(users).set({ email: email.data, updatedAt: new Date(), updatedBy: actor.id }).where(eq(users.id, actor.id));
  } catch (e) {
    if ((e as { cause?: { code?: string } }).cause?.code === "23505") throw new UserError("Email sudah dipakai akun lain");
    throw e;
  }
  await db().insert(auditLog).values({ actorId: actor.id, aksi: "ganti_email", target: actor.id, detail: { email_baru: email.data } });
  return "Email login diperbarui";
}

/**
 * Ganti password sendiri. Sesi di perangkat LAIN diputus; sesi saat ini (`keepToken`) tetap.
 */
export async function changeOwnPassword(actor: Actor | null, currentPassword: string, newPassword: string, keepToken?: string) {
  assertActive(actor);
  if (newPassword.length < 8 || newPassword.length > 200) throw new UserError("Password baru minimal 8 karakter");
  if (newPassword === currentPassword) throw new UserError("Password baru harus berbeda");
  await assertCurrentPassword(actor.id, currentPassword);
  await db().update(users).set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date(), updatedBy: actor.id }).where(eq(users.id, actor.id));
  await deleteUserSessions(actor.id, keepToken);
  await db().insert(auditLog).values({ actorId: actor.id, aksi: "ganti_password", target: actor.id });
  return "Password diperbarui. Perangkat lain otomatis keluar.";
}

export async function getOwnProfile(actor: Actor) {
  assertActive(actor);
  const [u] = await db()
    .select({ email: users.email, nama: users.nama, noWa: users.noWa, spesialisasi: users.spesialisasi, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, actor.id));
  return { ...u, isTutor: actor.isTutor, isSuperuser: actor.isSuperuser, perms: actor.perms };
}
