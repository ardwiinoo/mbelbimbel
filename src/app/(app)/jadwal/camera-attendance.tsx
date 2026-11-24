"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { X, SwitchCamera, Camera, RotateCcw, Send, MapPin, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { postForm } from "@/lib/post-form";
import { tanggal, jam } from "@/lib/format";
import type { SessionRow } from "./schedule-view";

type Geo = { lat: number; lng: number; acc: number };
const MAX_SIDE = 1280;

/**
 * Absen foto langsung dari kamera:
 * - Hanya getUserMedia + canvas; tidak ada <input type="file"> → galeri tertutup.
 * - GPS wajib; tombol Kirim nonaktif tanpa lokasi.
 * - Waktu resmi = now() di server (RPC submit_attendance). Watermark hanya bukti visual.
 */
export function CameraAttendance({
  session, tutorName, onClose, onDone,
}: {
  session: SessionRow; tutorName: string; onClose: () => void; onDone: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [camError, setCamError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [sending, setSending] = useState(false);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const [camKey, setCamKey] = useState(0); // naikkan untuk membuka ulang kamera

  const requestGeo = useCallback(() => {
    if (!navigator.geolocation) return; // ditangani saat render (geoUnsupported)
    navigator.geolocation.getCurrentPosition(
      (p) => setGeo({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (err) =>
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Izin lokasi ditolak. Aktifkan lokasi (GPS) & izinkan situs ini mengakses lokasi."
            : "Lokasi belum didapat. Pastikan GPS aktif lalu coba lagi.",
        ),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
    );
  }, []);

  // Buka kamera. setState hanya dipanggil setelah await (async), dengan flag pembatalan.
  useEffect(() => {
    if (shot || !navigator.mediaDevices?.getUserMedia) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch((e: DOMException) => {
        if (cancelled) return;
        setCamError(
          e?.name === "NotAllowedError"
            ? "Izin kamera ditolak. Aktifkan izin kamera untuk situs ini di pengaturan browser, lalu coba lagi."
            : "Kamera tidak bisa dibuka. Tutup aplikasi lain yang memakai kamera lalu coba lagi.",
        );
      });
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [facing, shot, camKey]);

  useEffect(() => {
    requestGeo();
  }, [requestGeo]);

  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  const camUnsupported = typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia;
  const geoUnsupported = typeof navigator !== "undefined" && !navigator.geolocation;
  const camMsg = camUnsupported
    ? "Browser tidak mendukung kamera. Gunakan Chrome/Safari terbaru dan pastikan situs memakai HTTPS."
    : camError;
  const geoMsg = geoUnsupported ? "Perangkat tidak mendukung GPS." : geoError;

  const retryCamera = () => {
    setCamError(null);
    setReady(false);
    setCamKey((k) => k + 1);
  };
  const retryGeo = () => {
    setGeoError(null);
    requestGeo();
  };

  async function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * scale);
    const h = Math.round(v.videoHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(v, 0, 0, w, h);

    // Watermark
    const now = new Date();
    const lines = [
      `HADIR • ${tanggal(now)} ${jam(now)} WIB`,
      `Tentor: ${tutorName} • Siswa: ${session.students?.nama ?? "-"}`,
      geo ? `Lokasi: ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)} (±${Math.round(geo.acc)} m)` : "Lokasi: belum tersedia",
    ];
    const fs = Math.max(11, Math.round(w / 56));
    const pad = Math.round(fs * 0.7);
    const gap = Math.round(fs * 0.35);
    const boxH = lines.length * (fs + gap) + pad * 2 - gap;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, h - boxH, w, boxH);
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    ctx.textBaseline = "top";
    lines.forEach((l, i) => ctx.fillText(l, pad, h - boxH + pad + i * (fs + gap), w - pad * 2));

    // Kompres: target < 300 KB
    let blob: Blob | null = null;
    for (const q of [0.7, 0.6, 0.5, 0.4]) {
      blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
      if (blob && blob.size < 300 * 1024) break;
    }
    if (!blob) return toast.error("Gagal mengambil foto");
    stopStream();
    setShot({ blob, url: URL.createObjectURL(blob) });
  }

  async function send() {
    if (!shot || !geo) return;
    setSending(true);
    // Foto + GPS dikirim bersama; server mengecek pemilik sesi, jendela waktu, & GPS,
    // lalu menyimpan foto dan status Hadir dalam satu transaksi.
    const form = new FormData();
    form.set("session_id", session.id);
    form.set("lat", String(geo.lat));
    form.set("lng", String(geo.lng));
    form.set("akurasi", String(geo.acc));
    form.set("photo", shot.blob, "absen.jpg");
    const res = await postForm("/api/attendance", form);
    setSending(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.message ?? "Absen berhasil! Status: Hadir");
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{session.students?.nama}</p>
          <p className="truncate text-xs text-white/70">
            {session.programs?.nama} • {jam(session.mulai_at)} - {jam(session.selesai_at)}
          </p>
        </div>
        <Button size="icon" variant="ghost" className="text-white hover:bg-white/10" onClick={onClose} aria-label="Tutup">
          <X />
        </Button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {shot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot.url} alt="Hasil foto" className="max-h-full max-w-full object-contain" />
        ) : camMsg ? (
          <div className="max-w-xs space-y-3 p-6 text-center">
            <AlertTriangle className="mx-auto size-10 text-amber-400" />
            <p className="text-sm">{camMsg}</p>
            {!camUnsupported && <Button variant="secondary" onClick={retryCamera}>Coba lagi</Button>}
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              onLoadedData={() => setReady(true)}
              className={`max-h-full max-w-full object-contain ${facing === "user" ? "-scale-x-100" : ""}`}
            />
            {!ready && <Loader2 className="absolute size-8 animate-spin" />}
          </>
        )}
      </div>

      <div className="space-y-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-center gap-2 text-xs">
          <MapPin className="size-4" />
          {geo ? (
            <span className="text-emerald-300">Lokasi OK (±{Math.round(geo.acc)} m)</span>
          ) : geoMsg ? (
            <span className="text-amber-300">
              {geoMsg}{" "}
              {!geoUnsupported && <button className="underline" onClick={retryGeo}>Coba lagi</button>}
            </span>
          ) : (
            <span className="text-white/70">Mencari lokasi GPS...</span>
          )}
        </div>
        <p className="text-center text-xs text-white/60">Foto Anda bersama siswa. Waktu absen dicatat oleh server.</p>

        {shot ? (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" className="h-12" disabled={sending} onClick={() => { setReady(false); setShot(null); }}>
              <RotateCcw /> Ulangi
            </Button>
            <Button className="h-12 bg-emerald-600 hover:bg-emerald-700" disabled={!geo || sending} onClick={send}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />} Kirim
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-8">
            <div className="size-12" />
            <button
              onClick={capture}
              disabled={!ready}
              aria-label="Ambil foto"
              className="flex size-18 items-center justify-center rounded-full border-4 border-white bg-white/20 transition active:scale-95 disabled:opacity-40"
            >
              <Camera className="size-8" />
            </button>
            <Button
              size="icon-lg"
              variant="ghost"
              className="size-12 text-white hover:bg-white/10"
              onClick={() => { setReady(false); setFacing((f) => (f === "user" ? "environment" : "user")); }}
              aria-label="Ganti kamera"
            >
              <SwitchCamera className="size-6" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
