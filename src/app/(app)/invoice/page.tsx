import { requireAccess } from "@/lib/auth";
import { can } from "@/lib/access";
import { PageHeader } from "@/components/app/ui";
import { listInvoices, listReadyToBill } from "@/server/services/invoices";
import { listProgramsWithTarif } from "@/server/services/master";
import { ReadyToBill, InvoiceHistory } from "./views";

export const metadata = { title: "Invoice & Tagihan" };

export default async function InvoicePage({ searchParams }: PageProps<"/invoice">) {
  const me = await requireAccess("invoice", "read");
  const canWrite = can(me, "invoice", "write");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const [sessions, programs, history] = await Promise.all([
    listReadyToBill(me),
    listProgramsWithTarif(me),
    listInvoices(me, { q, status, page, pageSize: 20 }), // paging di DB
  ]);

  return (
    <>
      <PageHeader
        title="Invoice & Tagihan"
        desc="Tagihan dihitung otomatis dari sesi berstatus Hadir yang belum direkap. Satu invoice = satu siswa + satu program."
      />
      <div className="space-y-10">
        <ReadyToBill sessions={sessions} programs={programs} canWrite={canWrite} />
        <InvoiceHistory invoices={history.rows} total={history.total} summary={history.summary} page={page} status={status} canWrite={canWrite} />
      </div>
    </>
  );
}
