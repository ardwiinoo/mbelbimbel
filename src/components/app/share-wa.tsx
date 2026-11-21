"use client";
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
export function ShareWaButton({
  fileUrl, fileName, phone, text, label = "Bagikan via WA", size = "sm",
}: {
  fileUrl: string; fileName: string; phone: string | null; text: string; label?: string; size?: "sm" | "xs" | "default";
}) {
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size={size} variant="outline" onClick={share} disabled={busy} className="text-emerald-700">
      {busy ? <Loader2 className="animate-spin" /> : <MessageCircle />} {label}
    </Button>
  );
}
