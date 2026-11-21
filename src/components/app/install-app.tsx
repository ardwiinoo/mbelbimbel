"use client";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Download, Share, MoreVertical, PlusSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstall } from "@/lib/pwa-install";

/** Kartu install lengkap (halaman Profil): tombol bila didukung, atau panduan manual. */
export function InstallCard() {
  const { installed, canPrompt, platform, install } = useInstall();
  const [showHelp, setShowHelp] = useState(false);

  if (installed) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-700">
        <CheckCircle2 className="size-4" /> Aplikasi sudah terpasang di perangkat ini.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Pasang aplikasi di layar utama agar bisa dibuka seperti aplikasi biasa (tanpa membuka browser).
      </p>
      <Button
        onClick={async () => {
          if (!canPrompt) {
            // Browser tidak menawarkan install otomatis → selalu beri respons yang terlihat
            setShowHelp(true);
            toast.info("Browser belum menawarkan install otomatis. Ikuti langkah di bawah tombol ini.");
            return;
          }
          try {
            const r = await install();
            if (r === "accepted") toast.success("Aplikasi sedang dipasang. Cek layar utama HP Anda.");
            else if (r === "dismissed") toast.info("Install dibatalkan. Tekan tombol lagi kapan saja.");
            else {
              setShowHelp(true);
              toast.info("Ikuti langkah manual di bawah tombol ini.");
            }
          } catch {
            setShowHelp(true);
            toast.error("Dialog install gagal dibuka. Ikuti langkah manual di bawah.");
          }
        }}
      >
        <Download /> Install Aplikasi
      </Button>
      {(showHelp || platform === "ios") && <InstallHelp platform={platform} />}
    </div>
  );
}

function InstallHelp({ platform }: { platform: "ios" | "android" | "desktop" }) {
  const steps =
    platform === "ios"
      ? [
          <>Buka di <b>Safari</b>, <b>Chrome</b>, atau <b>Edge</b> (iOS 16.4 ke atas)</>,
          <>
            Ketuk tombol <Share className="inline size-4" /> <b>Bagikan</b> — di Safari ada di bar bawah, di Chrome/Edge di kanan kolom alamat
          </>,
          <>Pilih <PlusSquare className="inline size-4" /> <b>Tambah ke Layar Utama</b> (bila tidak terlihat, geser daftar ke bawah)</>,
        ]
      : platform === "android"
        ? [
            <>Buka di <b>Chrome</b></>,
            <>Ketuk menu <MoreVertical className="inline size-4" /> di kanan atas</>,
            <>
              Pilih <b>Tambahkan ke layar utama</b> (di sebagian versi: <b>Instal aplikasi</b>), lalu pilih <b>Instal</b>
            </>,
          ]
        : [
            <>Buka di <b>Chrome</b> atau <b>Edge</b></>,
            <>Klik ikon install di ujung kanan kolom alamat, atau menu <MoreVertical className="inline size-4" /></>,
            <>Pilih <b>Install Bimbel App</b></>,
          ];
  return (
    <ol className="list-decimal space-y-1 rounded-lg bg-muted/60 p-3 pl-7 text-sm">
      {steps.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
      {platform === "android" && (
        <li className="list-none pt-2 text-muted-foreground">
          <b className="text-foreground">Opsi install tidak muncul / sebelumnya macet di &quot;Menginstal…&quot;?</b>
          <span className="mt-1 block">
            1) Setelan HP → Aplikasi → cari <b>Bimbel</b> → Uninstall (sisa install lama, kadang tanpa ikon).
            <br />
            2) Chrome → Setelan → Setelan situs → Semua situs → situs ini → <b>Hapus &amp; reset</b>.
            <br />
            3) Tutup Chrome sepenuhnya, buka lagi, lalu tekan tombol Install.
          </span>
        </li>
      )}
    </ol>
  );
}

/** Tombol kecil di navigasi, hanya tampil bila browser mengizinkan install & belum terpasang. */
export function InstallNavButton({ className }: { className?: string }) {
  const { installed, canPrompt, install } = useInstall();
  if (installed || !canPrompt) return null;
  return (
    <button onClick={() => install()} className={className}>
      <Download className="size-4" /> Install Aplikasi
    </button>
  );
}
