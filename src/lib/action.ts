import "server-only";
import { getProfile } from "@/lib/auth";
import { UserError, type Actor } from "@/server/authz";

export type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };

/** Actor dari sesi saat ini (null bila tidak login). Validasi peran dilakukan di service. */
export async function currentActor(): Promise<Actor | null> {
  const p = await getProfile();
  return p ? { id: p.id, role: p.role, status: p.status, nama: p.nama } : null;
}

const PG_MESSAGES: Record<string, string> = {
  "23505": "Data sudah ada (duplikat)",
  "23503": "Data masih dipakai atau rujukan tidak ditemukan",
  "23514": "Data tidak memenuhi aturan",
  "22P02": "Format data tidak valid",
};

/** Ubah error apa pun menjadi pesan yang aman ditampilkan (tanpa detail internal). */
export function toUserMessage(e: unknown): string {
  if (e instanceof UserError) return e.message;
  const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  if (code && PG_MESSAGES[code]) return PG_MESSAGES[code];
  console.error("[action]", e);
  return "Terjadi kesalahan di server. Coba lagi.";
}

/**
 * Jalankan service dengan actor sesi saat ini.
 * `fn` mengembalikan pesan sukses (dan opsional id).
 */
export async function runAction(
  fn: (actor: Actor | null) => Promise<string | { message: string; id?: string }>,
): Promise<ActionResult> {
  try {
    const r = await fn(await currentActor());
    return typeof r === "string" ? { ok: true, message: r } : { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: toUserMessage(e) };
  }
}
