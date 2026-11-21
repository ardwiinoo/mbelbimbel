import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { findSessionUser, SESSION_COOKIE } from "@/server/session";
import { loadPermissions, type Actor } from "@/server/authz";
import { can, type Level, type Module } from "@/lib/access";

/** User yang sedang login: Actor (akses) + data profil untuk tampilan. */
export type Profile = Actor & {
  email: string | null;
  no_wa: string | null;
  spesialisasi: string | null;
};

/** User dari cookie sesi (null bila tidak login / sesi kedaluwarsa). Di-cache per request. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const u = await findSessionUser(token);
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    nama: u.nama,
    no_wa: u.noWa,
    spesialisasi: u.spesialisasi,
    status: u.status,
    isTutor: u.isTutor,
    isSuperuser: u.isSuperuser,
    // Dibaca dari DB setiap request → perubahan akses langsung berlaku tanpa login ulang
    perms: u.isSuperuser ? {} : await loadPermissions(u.id),
  };
});

export async function requireProfile() {
  const p = await getProfile();
  // Cookie ada tapi sesi/akun tidak valid → keluar paksa (hapus cookie) agar tidak loop redirect.
  if (!p) redirect("/auth/signout?reason=sesi");
  if (p.status !== "aktif") redirect("/auth/signout?reason=nonaktif");
  return p;
}

/** Halaman yang butuh akses modul tertentu; tanpa akses → kembali ke Beranda. */
export async function requireAccess(module: Module, level: Level = "read") {
  const p = await requireProfile();
  if (!can(p, module, level)) redirect("/");
  return p;
}

/** Halaman yang bisa dibuka dengan akses modul ATAU sebagai tentor (data milik sendiri). */
export async function requireAccessOrTutor(module: Module) {
  const p = await requireProfile();
  if (!can(p, module, "read") && !p.isTutor) redirect("/");
  return p;
}

export type Settings = {
  nama_bimbel: string;
  alamat: string | null;
  rekening: string | null;
  wa_admin: string | null;
  link_drive_konten: string | null;
  absen_buka_menit: number;
  absen_tutup_menit: number;
};

export const getSettings = cache(async (): Promise<Settings> => {
  const [s] = await db().select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  return {
    nama_bimbel: s?.namaBimbel ?? "Bimbel",
    alamat: s?.alamat ?? null,
    rekening: s?.rekening ?? null,
    wa_admin: s?.waAdmin ?? null,
    link_drive_konten: s?.linkDriveKonten ?? null,
    absen_buka_menit: s?.absenBukaMenit ?? 30,
    absen_tutup_menit: s?.absenTutupMenit ?? 60,
  };
});
