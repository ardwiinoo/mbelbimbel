"use client";
// Dialog konfirmasi bergaya aplikasi (pengganti window.confirm).
// Pemakaian di mana saja (client):  if (!(await confirmDialog({ title: "Hapus?", tone: "danger" }))) return;
// <ConfirmHost /> dipasang sekali di root layout.
import { useEffect, useState, type ReactNode } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title: string;
  desc?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = aksi menghapus/menimpa (tombol merah) */
  tone?: "danger" | "default";
};

type Req = ConfirmOptions & { resolve: (ok: boolean) => void };
let push: ((r: Req) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  // Cadangan bila host belum terpasang (seharusnya tidak terjadi)
  if (!push) return Promise.resolve(window.confirm(opts.title));
  return new Promise((resolve) => push!({ ...opts, resolve }));
}

export function ConfirmHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    push = (r) => {
      // Ditunda ke luar lingkup pemanggil: bila confirmDialog() dipanggil di dalam startTransition(async …),
      // setState di sini ikut "transisi" yang baru selesai setelah dialog dijawab → dialog tak pernah tampil (macet).
      setTimeout(() => {
        setReq(r);
        setOpen(true);
      }, 0);
    };
    return () => {
      push = null;
    };
  }, []);

  function close(ok: boolean) {
    req?.resolve(ok);
    setOpen(false);
  }

  const danger = req?.tone === "danger";
  const Icon = danger ? AlertTriangle : HelpCircle;
  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => !o && close(false)} onOpenChangeComplete={(o) => !o && setReq(null)}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-[70] bg-black/25 transition-opacity duration-150 supports-backdrop-filter:backdrop-blur-xs data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-popover p-5 text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
          {req && (
            <>
              <div className="flex gap-3.5">
                <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", danger ? "bg-red-50 text-red-600" : "bg-primary/10 text-primary")}>
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 space-y-1.5 pt-0.5">
                  <AlertDialog.Title className="text-base leading-snug font-semibold">{req.title}</AlertDialog.Title>
                  {req.desc && <AlertDialog.Description className="text-sm leading-relaxed text-muted-foreground">{req.desc}</AlertDialog.Description>}
                </div>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <AlertDialog.Close render={<Button variant="outline" />}>{req.cancelLabel ?? "Batal"}</AlertDialog.Close>
                <Button autoFocus className={cn(danger && "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600/40")} onClick={() => close(true)}>
                  {req.confirmLabel ?? "Ya, lanjutkan"}
                </Button>
              </div>
            </>
          )}
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
