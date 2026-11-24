import type { Metadata } from "next";
import { requireProfile, getSettings } from "@/lib/auth";
import { Sidebar, BottomNav, MobileTopBar } from "@/components/app/app-nav";
import { MapelProvider } from "@/components/app/mapel-context";
import { listMapel } from "@/server/services/mapel";

// Semua halaman app butuh sesi + DB → selalu render saat request, tidak pernah saat build.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  // Favicon bernomor versi (id file logo) → browser langsung memuat ulang saat logo diganti; tanpa logo = ikon bawaan.
  const s = await getSettings().catch(() => null);
  const href = s?.logo_file_id ? `/api/branding/logo?v=${s.logo_file_id}` : "/icons/icon-192.png";
  return { icons: { icon: [{ url: href }], shortcut: [{ url: href }] } };
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const profile = await requireProfile();
  const [settings, mapel] = await Promise.all([getSettings(), listMapel()]);
  const props = {
    access: { isSuperuser: profile.isSuperuser, isTutor: profile.isTutor, perms: profile.perms },
    nama: profile.nama,
    namaBimbel: settings?.nama_bimbel ?? "Bimbel",
    logoId: settings?.logo_file_id ?? null,
  };
  return (
    <MapelProvider list={mapel}>
    <div className="flex min-h-dvh flex-1">
      <Sidebar {...props} />
      <main className="min-w-0 flex-1 pb-28 md:pb-10">
        <MobileTopBar {...props} />
        <div className="mx-auto w-full max-w-6xl px-4 pt-5 pb-4 md:px-8 md:pt-9">{children}</div>
      </main>
      <BottomNav {...props} />
    </div>
    </MapelProvider>
  );
}
