import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { getProfile } from "@/lib/auth";
import { getFile, StorageNotFoundError } from "@/lib/storage";
import { findReadableFile } from "@/server/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tipe yang boleh ditampilkan inline di browser. Lainnya (Office, dan terutama
// SVG/HTML bila kelak diizinkan) dipaksa diunduh (attachment).
const INLINE_SAFE = new Set(["application/pdf", "image/jpeg", "image/png"]);

/** Menyajikan file privat dari disk, setelah cek login & izin. Streaming. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  const actor = await getProfile();
  if (!actor || actor.status !== "aktif") return new NextResponse("Unauthorized", { status: 401 });

  const file = await findReadableFile(actor, id);
  // 404 (bukan 403) agar keberadaan file tidak bocor ke yang tidak berhak
  if (!file) return new NextResponse("File tidak ditemukan", { status: 404 });

  let opened;
  try {
    opened = await getFile(file.storageKey);
  } catch (e) {
    if (e instanceof StorageNotFoundError) return new NextResponse("File tidak ditemukan", { status: 404 });
    throw e;
  }

  if (file.kind === "assessment") {
    await db().insert(auditLog).values({ actorId: actor.id, aksi: "akses_asesmen", target: file.id });
  }

  const wantDownload = req.nextUrl.searchParams.get("download") === "1";
  const forceAttachment = !INLINE_SAFE.has(file.mime) || /svg|html|xml|javascript/i.test(file.mime);
  const disposition = wantDownload || forceAttachment ? "attachment" : "inline";
  const asciiName = file.originalName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");

  return new NextResponse(Readable.toWeb(opened.stream) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(opened.size),
      "Content-Disposition": `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
