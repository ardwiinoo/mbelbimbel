import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { currentActor } from "@/lib/action";
import { can } from "@/lib/access";
import { getHonorPdfData } from "@/server/services/honor";
import { HonorDoc } from "./honor-doc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Slip honor PDF dibuat on-demand. Lunas = snapshot slip; belum lunas = draf hitungan saat ini. Hanya pemegang akses Honor. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/honor/[tutorId]/[periode]/pdf">) {
  const { tutorId, periode } = await ctx.params;
  const actor = await currentActor();
  if (!actor || actor.status !== "aktif" || !can(actor, "honor", "read")) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const data = await getHonorPdfData(actor, tutorId, periode);
  if (!data) return new NextResponse("Slip tidak ditemukan", { status: 404 });

  // Gambar logo/ttd yang headernya valid tapi isinya rusak bisa membuat render gagal: ulangi tanpa gambar
  // supaya slip tetap bisa diunduh.
  let buf: Buffer;
  try {
    buf = await renderToBuffer(<HonorDoc d={data} />);
  } catch (e) {
    console.error("[pdf] slip honor gagal dirender dengan gambar, mengulang tanpa logo/ttd", e);
    buf = await renderToBuffer(
      <HonorDoc d={{ ...data, branding: { ...data.branding, logo: null }, signer: data.signer ? { ...data.signer, ttd: null } : null }} />,
    );
  }
  const safeName = data.tutor.nama.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "tentor";
  const filename = `Slip-Honor-${safeName}-${data.periode}.pdf`;
  const download = req.nextUrl.searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
