"use client";
import { useMapel } from "@/components/app/mapel-context";
import { cn } from "@/lib/utils";

/** Titik + nama mapel dengan warna kategori (dari pengaturan kategori mapel). */
export function MapelBadge({ mapel, className }: { mapel: string | null | undefined; className?: string }) {
  const m = useMapel().of(mapel);
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap text-foreground", className)}
      style={{ background: m.bg, borderColor: `${m.dot}55` }}
    >
      <span className="size-2 rounded-full" style={{ background: m.dot }} aria-hidden />
      {m.label}
    </span>
  );
}
