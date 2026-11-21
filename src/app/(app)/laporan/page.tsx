import { isAdminRole } from "@/lib/roles";
import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { listMyAssignments, listReports } from "@/server/services/reports";
import { TutorReports, AdminReports } from "./views";

export const metadata = { title: "Laporan Perkembangan" };

export default async function LaporanPage({ searchParams }: PageProps<"/laporan">) {
  const profile = await requireProfile();

  if (isAdminRole(profile.role)) {
    const sp = await searchParams;
    const q = typeof sp.q === "string" ? sp.q : "";
    const page = Math.max(1, Number(sp.page) || 1);
    const { rows, total } = await listReports(profile, { q, page, pageSize: 20 }); // paging di DB
    return (
      <>
        <PageHeader title="Laporan Perkembangan" desc="Semua laporan PDF yang diunggah tentor. Admin bisa mengedit bila ada salah upload." />
        <AdminReports reports={rows} total={total} page={page} />
      </>
    );
  }

  // Tentor: hanya laporan miliknya (jumlahnya kecil), dikelompokkan per siswa.
  const [{ rows }, assignments] = await Promise.all([listReports(profile, { pageSize: 500 }), listMyAssignments(profile)]);
  return (
    <>
      <PageHeader
        title="Laporan Perkembangan"
        desc="Ketik laporan di Word, ekspor ke PDF, lalu unggah di sini. Salah upload? Pakai tombol Edit di riwayat."
      />
      <TutorReports assignments={assignments} reports={rows} />
    </>
  );
}
