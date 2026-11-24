"use client";
// Unggah / ganti / hapus satu gambar (logo bimbel, tanda tangan). Server memvalidasi isi file (PNG/JPG) & ukuran;
// pemeriksaan di sini hanya untuk umpan balik cepat.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fileHref } from "@/components/app/file-link";
import { confirmDialog } from "@/components/app/confirm";
import { postForm } from "@/lib/post-form";

const MAX = 2 * 1024 * 1024;

export function ImageUpload({
  endpoint,
  fileId,
  emptyText,
  hint,
  alt,
  removeTitle,
}: {
  /** Rute POST yang menerima field "file" atau "hapus=1". */
  endpoint: string;
  fileId: string | null;
  emptyText: string;
  hint?: string;
  alt: string;
  removeTitle: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function send(form: FormData) {
    setBusy(true);
    const r = await postForm(endpoint, form);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (r.ok) {
      toast.success(r.message);
      router.refresh();
    } else toast.error(r.error);
  }

  function onPick(f: File | undefined) {
    if (!f) return;
    if (!["image/png", "image/jpeg"].includes(f.type)) return toast.error("Format harus PNG atau JPG");
    if (f.size > MAX) return toast.error("Maksimal 2 MB");
    const form = new FormData();
    form.set("file", f);
    void send(form);
  }

  async function remove() {
    const ok = await confirmDialog({ title: removeTitle, desc: "Gambar dihapus permanen dari server.", confirmLabel: "Hapus", tone: "danger" });
    if (!ok) return;
    const form = new FormData();
    form.set("hapus", "1");
    await send(form);
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex h-24 w-48 items-center justify-center overflow-hidden rounded-lg border bg-white p-2">
        {fileId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileHref(fileId)} alt={alt} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="px-2 text-center text-xs text-muted-foreground">{emptyText}</span>
        )}
      </div>
      <div className="space-y-2">
        <input ref={inputRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => onPick(e.target.files?.[0])} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />} {fileId ? "Ganti gambar" : "Unggah gambar"}
          </Button>
          {fileId && (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={remove}>
              <Trash2 className="text-destructive" /> Hapus
            </Button>
          )}
        </div>
        {hint && <p className="max-w-xs text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
