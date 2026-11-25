"use client";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { waLink } from "@/lib/format";

/**
 * Bagikan file ke orang tua via WhatsApp.
 * HP yang mendukung Web Share API: file langsung dilampirkan.
 * Selain itu: file diunduh lalu chat wa.me dibuka (lampirkan manual).
 */
type ShareArgs = { fileUrl: string; fileName: string; phone: string | null; text: string };

/** Unduh file lalu bagikan lewat share sheet / buka WhatsApp. Galat ditampilkan sebagai toast. */
export async function shareFileViaWa({ fileUrl, fileName, phone, text }: ShareArgs) {
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error("File tidak dapat diambil");
    const blob = await res.blob();
    const file = new File([blob], fileName, { type: blob.type || "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    if (phone) window.open(waLink(phone, text), "_blank");
    toast.info("File diunduh. Lampirkan file tersebut di chat WhatsApp.");
  } catch (e) {
    if ((e as DOMException)?.name !== "AbortError") toast.error("Gagal membagikan file");
  }
}

export function ShareWaButton({
  fileUrl, fileName, phone, text, label = "Bagikan via WA", size = "sm", className,
}: {
  fileUrl: string; fileName: string; phone: string | null; text: string; label?: string; size?: "sm" | "xs" | "default"; className?: string;
}) {
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      await shareFileViaWa({ fileUrl, fileName, phone, text });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size={size} variant="outline" onClick={share} disabled={busy} className={cn("text-emerald-700", className)}>
      {busy ? <Loader2 className="animate-spin" /> : <MessageCircle />} {label}
    </Button>
  );
}
