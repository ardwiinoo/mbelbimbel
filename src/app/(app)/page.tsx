import Link from "next/link";
import { Users, CalendarCheck, Receipt, Wallet, ArrowRight, Clock } from "lucide-react";
import { isAdminRole } from "@/lib/roles";
import { requireProfile } from "@/lib/auth";
import { Pill, KEHADIRAN, EmptyState } from "@/components/app/ui";
import { rupiah, jam, tanggal } from "@/lib/format";
import { listSessions } from "@/server/services/sessions";
import { adminSummary } from "@/server/services/dashboard";

function todayWib() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

function Stat({ icon: Icon, label, value, sub, href }: { icon: typeof Users; label: string; value: string; sub?: string; href: string }) {
  return (
    <Link href={href} className="group rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" /> {label}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Link>
  );
}

export default async function Beranda() {
  const profile = await requireProfile();
  const isAdmin = isAdminRole(profile.role);
  const today = todayWib();

  const [todaySessions, summary] = await Promise.all([
    listSessions(profile, { from: today, to: today }), // tentor: otomatis hanya miliknya
    isAdmin ? adminSummary(profile) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{tanggal(new Date())}</p>
        <h1 className="text-xl font-bold md:text-2xl">Halo, {profile.nama} 👋</h1>
      </div>
      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={Users} label="Siswa aktif" value={String(summary.siswaAktif)} href="/siswa" />
          <Stat icon={CalendarCheck} label="Les hari ini" value={String(todaySessions.length)} href="/jadwal" />
          <Stat icon={Receipt} label="Siap ditagih" value={rupiah(summary.siapTagihTotal)} sub={`${summary.siapTagihSesi} sesi belum rekap`} href="/invoice" />
          <Stat icon={Wallet} label="Belum lunas" value={rupiah(summary.belumLunasTotal)} sub={`${summary.belumLunasInvoice} invoice`} href="/invoice" />
        </div>
      )}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Jadwal hari ini</h2>
          <Link href="/jadwal" className="flex items-center gap-1 text-sm text-primary hover:underline">
            Semua jadwal <ArrowRight className="size-4" />
          </Link>
        </div>
        {!todaySessions.length ? (
          <EmptyState title="Tidak ada les hari ini" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {todaySessions.map((st) => (
              <Link key={st.id} href="/jadwal" className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 hover:border-primary/40">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                    <Clock className="size-4" /> {jam(st.mulai_at)} - {jam(st.selesai_at)}
                  </p>
                  <p className="font-semibold">
                    {st.students?.nama} <span className="font-normal text-muted-foreground">• {st.students?.kelas}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {st.programs?.nama}
                    {isAdmin && ` • ${st.profiles?.nama}`}
                  </p>
                </div>
                <Pill color={KEHADIRAN[st.status_kehadiran].color}>{KEHADIRAN[st.status_kehadiran].label}</Pill>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
