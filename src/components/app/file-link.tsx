import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Eye, Download } from "lucide-react";

/** URL file privat. Izin dicek server di /api/files/[id]. */
export function fileHref(fileId: string, download = false) {
  return `/api/files/${fileId}${download ? "?download=1" : ""}`;
}

export function FileLinks({ fileId, view = true, download = true }: { fileId: string; view?: boolean; download?: boolean }) {
  return (
    <div className="flex gap-1.5">
      {view && (
        <a href={fileHref(fileId)} target="_blank" rel="noopener" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <Eye /> Lihat
        </a>
      )}
      {download && (
        <a href={fileHref(fileId, true)} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <Download /> Unduh
        </a>
      )}
    </div>
  );
}
