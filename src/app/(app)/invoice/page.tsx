import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { listInvoices, listReadyToBill } from "@/server/services/invoices";
import { listProgramsWithTarif } from "@/server/services/master";
import { ReadyToBill, InvoiceHistory } from "./views";

export const metadata = { title: "Invoice & Tagihan" };

export default async function InvoicePage() {
  const me = await requireAdmin();
  const [sessions, programs, invoices] = await Promise.all([listReadyToBill(me), listProgramsWithTarif(me), listInvoices(me)]);

  return (
    <>
      <PageHeader
        title="Invoice & Tagihan"
        desc="Tagihan dihitung otomatis dari sesi berstatus Hadir yang belum direkap. Satu invoice = satu siswa + satu program."
      />
      <div className="space-y-8">
        <ReadyToBill sessions={sessions} programs={programs} />
        <InvoiceHistory invoices={invoices} />
      </div>
    </>
  );
}
