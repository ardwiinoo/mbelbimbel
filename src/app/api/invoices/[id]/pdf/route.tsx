import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { currentActor } from "@/lib/action";
import { can } from "@/lib/access";
import { getInvoicePdfData } from "@/server/services/invoices";
import { InvoiceDoc } from "./invoice-doc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nota PDF dibuat on-demand dari data snapshot (tarif di invoice_items). Admin saja. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/invoices/[id]/pdf">) {
  const { id } = await ctx.params;
  const actor = await currentActor();
  if (!actor || actor.status !== "aktif" || !can(actor, "invoice", "read")) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const data = await getInvoicePdfData(actor, id);
  if (!data) return new NextResponse("Invoice tidak ditemukan", { status: 404 });

  // Logo rusak tidak boleh menggagalkan nota: ulangi tanpa logo
  let buf: Buffer;
  try {
    buf = await renderToBuffer(<InvoiceDoc d={data} />);
  } catch (e) {
    console.error("[pdf] nota gagal dirender dengan logo, mengulang tanpa logo", e);
    buf = await renderToBuffer(<InvoiceDoc d={{ ...data, branding: { ...data.branding, logo: null } }} />);
  }
  const filename = `${data.nomor.replaceAll("/", "-")}.pdf`;
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
