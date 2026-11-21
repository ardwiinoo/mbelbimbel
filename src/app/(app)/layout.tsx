import { requireProfile, getSettings } from "@/lib/auth";
import { Sidebar, BottomNav } from "@/components/app/app-nav";

// Semua halaman app butuh sesi + DB → selalu render saat request, tidak pernah saat build.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const profile = await requireProfile();
  const settings = await getSettings();
  const props = { role: profile.role, nama: profile.nama, namaBimbel: settings?.nama_bimbel ?? "Bimbel" };
  return (
    <div className="flex min-h-dvh flex-1">
      <Sidebar {...props} />
      <main className="min-w-0 flex-1 pb-24 md:pb-8">
        <div className="mx-auto w-full max-w-6xl px-4 py-5 md:px-8 md:py-8">{children}</div>
      </main>
      <BottomNav {...props} />
    </div>
  );
}
