import { requireAccess } from "@/lib/auth";
import { can } from "@/lib/access";
import { PageHeader } from "@/components/app/ui";
import { listHonor } from "@/server/services/honor";
import { currentMonthWib } from "@/server/services/analytics";
import { HonorView } from "./views";

export const metadata = { title: "Honor Tentor" };

export default async function HonorPage({ searchParams }: PageProps<"/honor">) {
  const me = await requireAccess("honor", "read");
  const sp = await searchParams;
  const current = currentMonthWib();
  const bulan = typeof sp.bulan === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.bulan) ? sp.bulan : current;
  const rows = await listHonor(me, bulan);

  return (
    <>
      <PageHeader
        title="Honor Tentor – Rekap Gaji Bulanan"
        desc="Honor dihitung otomatis dari sesi terekap (centang hijau di Jadwal) × tarif honor per sesi, ditambah tunjangan. Tandai lunas setelah transfer, lalu unduh atau kirim slipnya."
      />
      <HonorView rows={rows} periode={bulan} current={current} canWrite={can(me, "honor", "write")} canEditTutor={can(me, "tentor", "write")} canInvoice={can(me, "invoice", "read")} meNama={me.nama} />
    </>
  );
}
