import Link from "next/link";
import { Users, CalendarCheck, Receipt, Wallet, ArrowRight, Clock, FileCheck2 } from "lucide-react";
import { can } from "@/lib/access";
import { requireProfile } from "@/lib/auth";
import { Pill, KEHADIRAN, EmptyState, SectionHeader } from "@/components/app/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedBar, ColumnChart, RankedBars } from "@/components/app/charts";
import { MonthPicker } from "@/components/app/month-picker";
import { rupiah, jam, tanggal, namaBulan, siswaLabel } from "@/lib/format";
import { listSessions } from "@/server/services/sessions";
import { dashboardSummary } from "@/server/services/dashboard";
import { currentMonthWib, monthlyAnalytics } from "@/server/services/analytics";

function todayWib() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

function Stat({ icon: Icon, label, value, sub, href }: { icon: typeof Users; label: string; value: string; sub?: string; href: string }) {
  return (
    <Link href={href} className="group rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" /> {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </Link>
  );
}

export default async function Beranda({ searchParams }: PageProps<"/">) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const seeAllSessions = can(profile, "jadwal", "read");
  const canSeeSessions = seeAllSessions || profile.isTutor;
  const today = todayWib();
  const thisMonth = currentMonthWib();

  const [todaySessions, summary, analytics] = await Promise.all([
    canSeeSessions ? listSessions(profile, { from: today, to: today }) : Promise.resolve([]),
    dashboardSummary(profile),
    monthlyAnalytics(profile, typeof sp.bulan === "string" ? sp.bulan : undefined),
  ]);
  const tiles = [
    summary.siswaAktif !== null && { icon: Users, label: "Siswa aktif", value: String(summary.siswaAktif), href: "/siswa" },
    canSeeSessions && { icon: CalendarCheck, label: "Les hari ini", value: String(todaySessions.length), href: "/jadwal" },
    summary.siapTagih && { icon: Receipt, label: "Siap ditagih", value: rupiah(summary.siapTagih.total), sub: `${summary.siapTagih.sesi} sesi belum rekap`, href: "/invoice" },
    summary.belumLunas && { icon: Wallet, label: "Belum lunas", value: rupiah(summary.belumLunas.total), sub: `${summary.belumLunas.invoice} invoice`, href: "/invoice" },
  ].filter(Boolean) as { icon: typeof Users; label: string; value: string; sub?: string; href: string }[];

  const s = analytics.sessions;
  const m = analytics.money;
  const own = s?.scope === "own";

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">{tanggal(new Date())}</p>
        <h1 className="mt-0.5 text-[1.375rem] leading-tight font-bold tracking-tight md:text-[1.75rem]">Halo, {profile.nama} 👋</h1>
      </div>

      {tiles.length > 1 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <Stat key={t.label} {...t} />
          ))}
        </div>
      )}

      {canSeeSessions && (
        <section className="space-y-3">
          <SectionHeader
            title="Jadwal hari ini"
            actions={
              <Link href="/jadwal" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                Semua jadwal <ArrowRight className="size-4" />
              </Link>
            }
          />
          {!todaySessions.length ? (
            <EmptyState title="Tidak ada les hari ini" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {todaySessions.map((st) => (
                <Link key={st.id} href="/jadwal" className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 hover:border-primary/40">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                      <Clock className="size-4" /> {jam(st.mulai_at)} – {jam(st.selesai_at)}
                    </p>
                    <p className="mt-1 truncate font-semibold">
                      {siswaLabel(st.students)} <span className="font-normal text-muted-foreground">• {st.students?.kelas}</span>
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {st.programs?.nama}
                      {seeAllSessions && ` • ${st.profiles?.nama}`}
                    </p>
                  </div>
                  <Pill color={KEHADIRAN[st.status_kehadiran].color}>{KEHADIRAN[st.status_kehadiran].label}</Pill>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {(s || m) && (
        <section className="space-y-4">
          <SectionHeader
            title={`Ringkasan ${namaBulan(analytics.month)}`}
            desc={own ? "Angka les Anda sebagai tentor." : "Les, rekap tagihan, dan keuangan bulan terpilih."}
            actions={<MonthPicker value={analytics.month} current={thisMonth} />}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            {s && (
              <Card>
                <CardHeader>
                  <CardTitle>Status les</CardTitle>
                  <CardDescription>
                    {s.total} sesi di bulan ini{own ? " (milik Anda)" : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SegmentedBar
                    unit=" sesi"
                    parts={[
                      { label: "Hadir", value: s.byStatus.hadir, color: "blue" },
                      { label: "Terjadwal", value: s.byStatus.terjadwal, color: "orange" },
                      { label: "Tidak hadir", value: s.byStatus.tidak_hadir, color: "aqua" },
                      { label: "Batal", value: s.byStatus.batal, color: "red" },
                    ]}
                  />
                </CardContent>
              </Card>
            )}
            {s?.rekap && (
              <Card>
                <CardHeader>
                  <CardTitle>Rekap tagihan</CardTitle>
                  <CardDescription>Dari {s.byStatus.hadir} les yang sudah hadir</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <SegmentedBar
                    unit=" sesi"
                    parts={[
                      { label: "Sudah direkap", value: s.rekap.terekap, color: "blue" },
                      { label: "Belum direkap", value: s.rekap.belum, color: "orange" },
                    ]}
                  />
                  {s.rekap.belum > 0 && can(profile, "invoice", "write") && (
                    <Link href="/invoice" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                      <FileCheck2 className="size-4" /> Terbitkan invoice untuk {s.rekap.belum} sesi <ArrowRight className="size-4" />
                    </Link>
                  )}
                </CardContent>
              </Card>
            )}
            {s && (
              <Card>
                <CardHeader>
                  <CardTitle>Les hadir per minggu</CardTitle>
                  <CardDescription>Minggu ke-1 s/d ke-5 dalam bulan</CardDescription>
                </CardHeader>
                <CardContent>
                  <ColumnChart valueLabel="les hadir" data={s.weekly.map((v, i) => ({ label: `Mg ${i + 1}`, value: v }))} />
                </CardContent>
              </Card>
            )}
            {s && s.scope === "all" && (
              <Card>
                <CardHeader>
                  <CardTitle>Les hadir per tentor</CardTitle>
                  <CardDescription>8 tentor teratas bulan ini</CardDescription>
                </CardHeader>
                <CardContent>
                  <RankedBars valueLabel="les hadir" data={s.perTutor.map((t) => ({ label: t.nama, value: t.hadir }))} />
                </CardContent>
              </Card>
            )}
            {m && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Keuangan</CardTitle>
                  <CardDescription>Invoice yang terbit di bulan ini</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Diterbitkan</p>
                      <p className="text-lg font-semibold tabular-nums">{rupiah(m.nilaiTerbit)}</p>
                      <p className="text-xs text-muted-foreground">{m.terbit} invoice</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Sudah lunas</p>
                      <p className="text-lg font-semibold tabular-nums">{rupiah(m.lunas)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Piutang</p>
                      <p className="text-lg font-semibold tabular-nums">{rupiah(m.belumLunas)}</p>
                    </div>
                  </div>
                  <SegmentedBar
                    tall={false}
                    parts={[
                      { label: "Lunas", value: m.lunas, color: "blue" },
                      { label: "Belum lunas", value: m.belumLunas, color: "orange" },
                    ]}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      )}

      {!canSeeSessions && !m && tiles.length <= 1 && (
        <EmptyState title="Selamat datang" desc="Gunakan menu untuk membuka modul yang menjadi akses Anda." />
      )}
    </div>
  );
}
