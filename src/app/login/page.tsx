import { LoginForm } from "./login-form";
import { GraduationCap } from "lucide-react";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";

export const metadata = { title: "Masuk" };
export const dynamic = "force-dynamic";

const REASON: Record<string, string> = {
  nonaktif: "Akun Anda dinonaktifkan. Hubungi admin.",
  sesi: "Sesi berakhir. Silakan masuk kembali.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Sudah login dengan sesi valid → langsung ke beranda (dicek di server, bukan di proxy)
  const me = await getProfile();
  if (me?.status === "aktif") redirect("/");
  const { reason } = await searchParams;
  const msg = typeof reason === "string" ? REASON[reason] : undefined;
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <GraduationCap className="size-8" />
          </div>
          <h1 className="text-xl font-bold">Bimbel App</h1>
          <p className="text-sm text-muted-foreground">Masuk untuk Admin & Tentor</p>
        </div>
        {msg && <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-800 ring-1 ring-amber-600/20">{msg}</p>}
        <LoginForm />
      </div>
    </main>
  );
}
