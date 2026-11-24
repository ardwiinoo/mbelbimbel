import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, files } from "@/db/schema";
import { getFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Logo bimbel untuk halaman login, navigasi, dan favicon. Publik (logo bukan rahasia, dan halaman login
 * belum punya sesi): hanya menyajikan file bertipe "logo" yang sedang dipakai di pengaturan.
 * Tanpa logo / file hilang → arahkan ke ikon bawaan aplikasi, jadi favicon tidak pernah kosong.
 * `?v=<id file>` dari pemanggil membuat cache bisa panjang; tanpa v (favicon) cache pendek.
 */
export async function GET(req: NextRequest) {
  const fallback = () => NextResponse.redirect(new URL("/icons/icon-192.png", req.url), { status: 302, headers: { "Cache-Control": "no-cache" } });
  try {
    const [s] = await db().select({ id: appSettings.logoFileId }).from(appSettings).where(eq(appSettings.id, 1)).limit(1);
    if (!s?.id) return fallback();
    const [f] = await db().select().from(files).where(eq(files.id, s.id)).limit(1);
    if (!f || f.kind !== "logo" || !["image/png", "image/jpeg"].includes(f.mime)) return fallback();
    const opened = await getFile(f.storageKey);
    const versioned = req.nextUrl.searchParams.get("v") === f.id;
    return new NextResponse(Readable.toWeb(opened.stream) as ReadableStream<Uint8Array>, {
      headers: {
        "Content-Type": f.mime,
        "Content-Length": String(opened.size),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
      },
    });
  } catch {
    return fallback();
  }
}
