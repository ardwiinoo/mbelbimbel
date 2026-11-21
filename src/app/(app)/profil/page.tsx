import { requireProfile } from "@/lib/auth";
import { accountLabel, levelOf, MODULES } from "@/lib/access";
import { Pill } from "@/components/app/ui";
import { tanggal } from "@/lib/format";
import { PageHeader } from "@/components/app/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InstallCard } from "@/components/app/install-app";
import { getOwnProfile } from "@/server/services/users";
import { EmailForm, PasswordForm } from "./forms";

export const metadata = { title: "Profil" };

export default async function ProfilPage() {
  const me = await requireProfile();
  const p = await getOwnProfile(me);

  return (
    <>
      <PageHeader title="Profil Saya" desc="Data akun, ganti email & password login, dan pasang aplikasi." />
      <div className="grid max-w-3xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{p.nama}</CardTitle>
            <CardDescription>
              {accountLabel(p)}
              {p.spesialisasi && ` • ${p.spesialisasi}`} • terdaftar {tanggal(p.createdAt, false)}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <p>
              <span className="text-muted-foreground">Email login:</span> {p.email}
            </p>
            <p>
              <span className="text-muted-foreground">No. WhatsApp:</span> {p.noWa ?? "-"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Akses Saya</CardTitle>
            <CardDescription>
              {p.isSuperuser ? "Super Admin: semua akses, termasuk kelola akun." : "Diatur oleh pengelola akun. Hubungi admin bila butuh akses tambahan."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {p.isTutor && <Pill color="blue">Mengajar (tentor)</Pill>}
            {MODULES.map((m) => {
              const lv = levelOf(p, m.key);
              return lv ? (
                <Pill key={m.key} color={lv === "write" ? "green" : "gray"}>
                  {m.label}: {lv === "write" ? "Kelola" : "Lihat"}
                </Pill>
              ) : null;
            })}
            {!p.isTutor && !p.isSuperuser && !Object.keys(p.perms).length && <span className="text-sm text-muted-foreground">Belum ada akses.</span>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pasang Aplikasi</CardTitle>
          </CardHeader>
          <CardContent>
            <InstallCard />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ganti Email Login</CardTitle>
            <CardDescription>Langsung berlaku untuk login berikutnya.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmailForm current={p.email} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ganti Password</CardTitle>
            <CardDescription>
              Lupa password? Minta Super Admin mereset lewat menu Pengguna. Setelah diganti, perangkat lain otomatis keluar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
