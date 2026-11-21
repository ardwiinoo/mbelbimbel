import { requireProfile, getSettings } from "@/lib/auth";
import { Sidebar, BottomNav, MobileTopBar } from "@/components/app/app-nav";

// Semua halaman app butuh sesi + DB → selalu render saat request, tidak pernah saat build.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const profile = await requireProfile();
  const settings = await getSettings();
  const props = {
    access: { isSuperuser: profile.isSuperuser, isTutor: profile.isTutor, perms: profile.perms },
    nama: profile.nama,
    namaBimbel: settings?.nama_bimbel ?? "Bimbel",
  };
  return (
    <div className="flex min-h-dvh flex-1">
      <Sidebar {...props} />
      <main className="min-w-0 flex-1 pb-28 md:pb-10">
        <MobileTopBar {...props} />
        <div className="mx-auto w-full max-w-6xl px-4 pt-5 pb-4 md:px-8 md:pt-9">{children}</div>
      </main>
      <BottomNav {...props} />
    </div>
  );
}
