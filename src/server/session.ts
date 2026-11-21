import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { userSessions, users } from "@/db/schema";

export const SESSION_COOKIE = "bimbel_sid";
export const SESSION_TTL_DAYS = 30;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Buat sesi baru. Yang disimpan di DB hanya hash token. */
export async function createSession(userId: string, userAgent?: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400_000);
  await db()
    .insert(userSessions)
    .values({ id: hashToken(token), userId, expiresAt, userAgent: userAgent?.slice(0, 300) ?? null });
  // bersihkan sesi kedaluwarsa milik user ini (murah, tanpa cron)
  await db().delete(userSessions).where(and(eq(userSessions.userId, userId), lt(userSessions.expiresAt, new Date())));
  return { token, expiresAt };
}

/** Kembalikan user pemilik token bila sesi masih berlaku. Status (aktif/nonaktif) dicek pemanggil. */
export async function findSessionUser(token: string) {
  if (!token || token.length > 100) return null;
  const rows = await db()
    .select({
      id: users.id,
      email: users.email,
      nama: users.nama,
      noWa: users.noWa,
      role: users.role,
      spesialisasi: users.spesialisasi,
      status: users.status,
    })
    .from(userSessions)
    .innerJoin(users, eq(users.id, userSessions.userId))
    .where(and(eq(userSessions.id, hashToken(token)), gt(userSessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteSession(token: string) {
  if (token) await db().delete(userSessions).where(eq(userSessions.id, hashToken(token)));
}

/** Logout paksa semua perangkat (mis. saat akun dinonaktifkan / password direset). */
export async function deleteUserSessions(userId: string) {
  await db().delete(userSessions).where(eq(userSessions.userId, userId));
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}
