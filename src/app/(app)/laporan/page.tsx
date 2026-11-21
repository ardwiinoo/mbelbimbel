import { isAdminRole } from "@/lib/roles";
import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { listMyAssignments, listReports } from "@/server/services/reports";
import { TutorReports, AdminReports } from "./views";

export const metadata = { title: "Laporan Perkembangan" };

export default async function LaporanPage() {
  const profile = await requireProfile();
  const reports = await listReports(profile); // tentor: otomatis hanya miliknya

  if (isAdminRole(profile.role)) {
    return (
      <>
        <PageHeader title="Laporan Perkembangan" desc="Semua laporan PDF yang diunggah tentor." />
        <AdminReports reports={reports} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Laporan Perkembangan"
        desc="Ketik laporan di Word, ekspor ke PDF, lalu unggah di sini. Unduh/bagikan ke orang tua via WhatsApp."
      />
      <TutorReports assignments={await listMyAssignments(profile)} reports={reports} />
    </>
  );
}
