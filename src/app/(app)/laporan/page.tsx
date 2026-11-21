import { requireAccessOrTutor } from "@/lib/auth";
import { can } from "@/lib/access";
import { PageHeader, SectionHeader } from "@/components/app/ui";
import { listMyAssignments, listReports } from "@/server/services/reports";
import { TutorReports, AdminReports } from "./views";

export const metadata = { title: "Laporan Perkembangan" };

export default async function LaporanPage({ searchParams }: PageProps<"/laporan">) {
  const me = await requireAccessOrTutor("laporan");
  const viewAll = can(me, "laporan", "read");
  const canEditAll = can(me, "laporan", "write");

  // Bagian "Laporan Siswa Saya" untuk akun yang mengajar (termasuk admin sekaligus tentor)
  const own = me.isTutor
    ? await Promise.all([listReports(me, { pageSize: 500, mine: true }), listMyAssignments(me)])
    : null;

  // Bagian "Semua Laporan" untuk pemegang akses Laporan (paging & cari di DB)
  let all: { rows: Awaited<ReturnType<typeof listReports>>["rows"]; total: number; page: number } | null = null;
  if (viewAll) {
    const sp = await searchParams;
    const q = typeof sp.q === "string" ? sp.q : "";
    const page = Math.max(1, Number(sp.page) || 1);
    const r = await listReports(me, { q, page, pageSize: 20 });
    all = { ...r, page };
  }

  return (
    <>
      <PageHeader
        title="Laporan Perkembangan"
        desc={
          viewAll
            ? "Laporan PDF dari tentor. Bisa diedit bila ada salah upload; setiap perubahan tercatat."
            : "Ketik laporan di Word, ekspor ke PDF, lalu unggah di sini. Salah upload? Pakai tombol Edit di riwayat."
        }
      />
      <div className="space-y-10">
        {own && (
          <section className="space-y-4">
            {viewAll && <SectionHeader title="Laporan Siswa Saya" desc="Siswa yang Anda ampu sebagai tentor." />}
            <TutorReports assignments={own[1]} reports={own[0].rows} />
          </section>
        )}
        {all && (
          <section className="space-y-4">
            {own && <SectionHeader title="Semua Laporan" />}
            <AdminReports reports={all.rows} total={all.total} page={all.page} meId={me.id} canEditAll={canEditAll} />
          </section>
        )}
      </div>
    </>
  );
}
