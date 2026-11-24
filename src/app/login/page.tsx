import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { BrandMark } from "@/components/app/brand-mark";
import { redirect } from "next/navigation";
import { getProfile, getSettings } from "@/lib/auth";

const title = "Masuk";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  // Favicon bernomor versi (id file logo) → browser langsung memuat ulang saat logo diganti; tanpa logo = ikon bawaan.
  const s = await getSettings().catch(() => null);
  const href = s?.logo_file_id ? `/api/branding/logo?v=${s.logo_file_id}` : "/icons/icon-192.png";
  return { title, icons: { icon: [{ url: href }], shortcut: [{ url: href }] } };
}

const REASON: Record<string, string> = {
  nonaktif: "Akun Anda dinonaktifkan. Hubungi admin.",
  sesi: "Sesi berakhir. Silakan masuk kembali.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Sudah login dengan sesi valid → langsung ke beranda (dicek di server, bukan di proxy)
  const [me, settings] = await Promise.all([getProfile(), getSettings().catch(() => null)]);
  if (me?.status === "aktif") redirect("/");
  const { reason } = await searchParams;
  const msg = typeof reason === "string" ? REASON[reason] : undefined;
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <BrandMark logoId={settings?.logo_file_id ?? null} className="size-14 rounded-2xl shadow-lg" iconClassName="size-8" />
          <h1 className="text-xl font-bold">{settings?.nama_bimbel ?? "Bimbel App"}</h1>
          <p className="text-sm text-muted-foreground">Masuk untuk Admin & Tentor</p>
        </div>
        {msg && <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-800 ring-1 ring-amber-600/20">{msg}</p>}
        <LoginForm />
      </div>
    </main>
  );
}
