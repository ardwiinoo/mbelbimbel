import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <WifiOff className="size-10 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Tidak ada koneksi internet</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Aplikasi butuh internet untuk memuat data dan mengirim absen. Periksa koneksi Anda lalu coba lagi.
      </p>
    </main>
  );
}
