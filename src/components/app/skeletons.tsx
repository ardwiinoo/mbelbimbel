// Skeleton halaman: bentuknya meniru tata letak asli supaya transisi terasa mulus.
import { cn } from "@/lib/utils";

/** Blok skeleton yang tetap terlihat di atas latar kaca/gradasi. */
export function Bone({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-foreground/[0.07]", className)} />;
}

function HeaderBones() {
  return (
    <div className="mb-6 space-y-2.5">
      <Bone className="h-7 w-48 md:h-8 md:w-64" />
      <Bone className="h-4 w-full max-w-md" />
    </div>
  );
}

/** Halaman daftar: judul, toolbar cari/filter, lalu tabel (desktop) atau kartu (HP). */
export function ListSkeleton() {
  return (
    <div role="status" aria-label="Memuat">
      <HeaderBones />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Bone className="h-9 flex-1" />
        <div className="flex gap-2">
          <Bone className="h-9 w-36" />
          <Bone className="h-9 w-36" />
          <Bone className="h-9 w-32" />
        </div>
      </div>
      {/* desktop: tabel */}
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <div className="h-11 bg-primary/90" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-6 border-t px-4 py-4">
            <div className="w-48 space-y-2">
              <Bone className="h-4 w-36" />
              <Bone className="h-3 w-24" />
            </div>
            <Bone className="h-4 flex-1" />
            <Bone className="h-4 w-28" />
            <Bone className="h-5 w-16 rounded-full" />
            <Bone className="h-8 w-20" />
          </div>
        ))}
      </div>
      {/* HP: kartu */}
      <div className="grid gap-3 md:hidden">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-start justify-between gap-3 p-4">
              <div className="space-y-2">
                <Bone className="h-4 w-40" />
                <Bone className="h-3 w-28" />
              </div>
              <Bone className="h-5 w-14 rounded-full" />
            </div>
            <div className="space-y-3 border-t px-4 py-3.5">
              <Bone className="h-3.5 w-3/4" />
              <Bone className="h-3.5 w-1/2" />
              <Bone className="h-3.5 w-2/3" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Memuat data…</span>
    </div>
  );
}

/** Beranda: sapaan, kartu angka, jadwal hari ini, kartu grafik. */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Memuat" className="space-y-8">
      <div className="space-y-2">
        <Bone className="h-4 w-32" />
        <Bone className="h-7 w-56" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-xl border bg-card p-4">
            <Bone className="h-3.5 w-24" />
            <Bone className="h-7 w-20" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <Bone className="h-5 w-36" />
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="space-y-2 rounded-xl border bg-card p-4">
              <Bone className="h-4 w-28" />
              <Bone className="h-4 w-48" />
              <Bone className="h-3.5 w-36" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="space-y-4 rounded-xl border bg-card p-5">
            <Bone className="h-5 w-32" />
            <Bone className="h-10 w-full" />
            <div className="flex gap-3">
              <Bone className="h-3.5 w-20" />
              <Bone className="h-3.5 w-24" />
              <Bone className="h-3.5 w-16" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Memuat data…</span>
    </div>
  );
}

/** Halaman form (Profil, Pengaturan): judul + kartu-kartu isian. */
export function FormSkeleton() {
  return (
    <div role="status" aria-label="Memuat">
      <HeaderBones />
      <div className="grid max-w-3xl gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-4 rounded-xl border bg-card p-5">
            <Bone className="h-5 w-40" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Bone className="h-9" />
              <Bone className="h-9" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Memuat data…</span>
    </div>
  );
}
