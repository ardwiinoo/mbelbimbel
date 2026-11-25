"use client";
// Pop-up detail sebuah sesi di Resource Timeline: bukti kehadiran + aksi cepat admin.
import type { ReactNode } from "react";
import { AlertTriangle, Check, MapPin, MessageCircle, Pencil, ShieldCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useTransition } from "react";
import { undoWaiveSession } from "./actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { FormDialog } from "@/components/app/form-dialog";
import { Pill, KEHADIRAN } from "@/components/app/ui";
import { fileHref } from "@/components/app/file-link";
import { jam, tanggal, tanggalJam, waLink } from "@/lib/format";
import { useMapel } from "@/components/app/mapel-context";
import { KIND_LABEL, type ConflictKind } from "@/lib/session-conflicts";
import { cn } from "@/lib/utils";
import type { SessionRow, TimelineTutor } from "@/server/services/sessions";

/** Status tampilan di timeline: dihitung dari status DB + jam server/klien. */
export type VisualStatus = "hadir" | "belum_absen" | "terjadwal" | "tidak_hadir" | "batal";

export function visualStatus(s: SessionRow, now: number): VisualStatus {
  if (s.status_kehadiran !== "terjadwal") return s.status_kehadiran;
  return now > new Date(s.selesai_at).getTime() ? "belum_absen" : "terjadwal";
}

const STATUS_TEXT: Record<VisualStatus, { label: string; cls: string }> = {
  hadir: { label: "Sudah absen", cls: "text-green-700" },
  belum_absen: { label: "Belum absen", cls: "text-red-600" },
  terjadwal: { label: "Terjadwal", cls: "text-muted-foreground" },
  tidak_hadir: { label: "Tidak hadir", cls: "text-red-600" },
  batal: { label: "Batal", cls: "text-muted-foreground" },
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function SessionDetail({
  s,
  tutor,
  now,
  canManage,
  isSuperuser = false,
  conflicts,
  absenSlot,
  onEdit,
  onOverride,
  onClose,
}: {
  s: SessionRow;
  tutor: TimelineTutor | undefined;
  now: number;
  canManage: boolean;
  /** Super Admin: boleh membatalkan pembebasan tagihan */
  isSuperuser?: boolean;
  /** Sesi lain yang bentrok dengan sesi ini (kosong = aman). */
  conflicts: { session: SessionRow; kinds: ConflictKind[] }[];
  /** Tombol Absen bila sesi ini milik akun yang sedang login (admin sekaligus tentor). */
  absenSlot?: ReactNode;
  onEdit: () => void;
  onOverride: () => void;
  onClose: () => void;
}) {
  const vs = visualStatus(s, now);
  const [undoing, startUndo] = useTransition();
  const canUndoWaive = isSuperuser && s.status_kehadiran === "hadir" && s.status_tagihan === "dibebaskan";
  const m = useMapel().of(s.programs?.mapel);
  const editable = canManage && s.status_tagihan === "belum_rekap";
  const lateMin = s.absen_at ? Math.round((new Date(s.absen_at).getTime() - new Date(s.mulai_at).getTime()) / 60_000) : 0;
  const remindText = `Halo Kak ${s.profiles?.nama ?? ""}, jadwal les ${s.students?.nama ?? ""}${s.students?.kelas ? ` (${s.students.kelas})` : ""} tanggal ${tanggal(s.mulai_at)} pukul ${jam(s.mulai_at)} belum diabsen ya. Mohon segera absen di aplikasi 🙏`;

  return (
    <FormDialog title="Detail Bukti Kehadiran" desc={`${s.students?.nama ?? "-"} • ${s.profiles?.nama ?? "-"}`} onClose={onClose}>
      <div className="space-y-2.5">
        <Row label="Siswa">
          {s.students?.nama}
          {s.students?.panggilan && <span className="text-muted-foreground"> “{s.students.panggilan}”</span>}{" "}
          {s.students?.kelas && <span className="text-muted-foreground">• {s.students.kelas}</span>}
        </Row>
        <Row label="Program">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: m.dot }} aria-hidden />
            {s.programs?.nama}
          </span>
        </Row>
        <Row label="Jadwal">
          {tanggal(s.mulai_at)} • {jam(s.mulai_at)} – {jam(s.selesai_at)}
        </Row>
        <Row label="Status">
          <span className={cn("inline-flex items-center gap-1.5 font-semibold", STATUS_TEXT[vs].cls)}>
            {vs === "hadir" && <Check className="size-4" strokeWidth={3} />}
            {vs === "belum_absen" && <span className="flex size-4 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white">!</span>}
            {STATUS_TEXT[vs].label}
          </span>
          {s.status_kehadiran === "hadir" && s.status_tagihan === "terekap" && <Pill color="blue">Sudah masuk invoice</Pill>}
          {s.status_kehadiran === "hadir" && s.status_tagihan === "dibebaskan" && <Pill color="gray">Tagihan dibebaskan</Pill>}
        </Row>
        {s.absen_at && (
          <Row label="Jam absen">
            <span className="tabular-nums">{tanggalJam(s.absen_at)} WIB</span> <span className="text-xs text-muted-foreground">(waktu server)</span>
            <p className={cn("text-xs", lateMin > 0 ? "font-medium text-amber-700" : "text-green-700")}>
              {lateMin > 0 ? `Absen jam ${jam(s.absen_at)} • Telat ${lateMin} menit` : "Tepat waktu"}
            </p>
          </Row>
        )}
        {s.catatan_admin && <Row label="Catatan admin">{s.catatan_admin}</Row>}
      </div>

      {conflicts.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-4 text-amber-600" /> Bentrok dengan {conflicts.length} sesi lain
          </p>
          <ul className="mt-1.5 space-y-1 text-xs">
            {conflicts.map((c) => (
              <li key={c.session.id}>
                <b>{c.kinds.map((k) => KIND_LABEL[k]).join(" & ")}</b>: {jam(c.session.mulai_at)} – {jam(c.session.selesai_at)} — {c.session.students?.nama}
                {c.session.students?.kelas ? ` (${c.session.students.kelas})` : ""}, {c.session.programs?.nama} · tentor {c.session.profiles?.nama}
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.foto_file_id ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileHref(s.foto_file_id)} alt="Foto bukti hadir" className="max-h-96 w-full rounded-lg border bg-black/5 object-contain" loading="lazy" />
      ) : (
        s.status_kehadiran === "hadir" && <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Absen manual oleh admin (tanpa foto)</p>
      )}
      {s.lat != null && s.lng != null && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <MapPin className="size-4 text-muted-foreground" /> {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
            {s.akurasi_m != null && <span className="text-xs text-muted-foreground">±{Math.round(s.akurasi_m)} m</span>}
          </span>
          <a href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noopener" className="font-medium text-primary hover:underline">
            Buka di Google Maps
          </a>
        </div>
      )}

      {absenSlot}

      <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
        {vs === "belum_absen" && tutor?.no_wa && (
          <a href={waLink(tutor.no_wa, remindText)} target="_blank" rel="noopener" className={cn(buttonVariants({ variant: "outline" }), "mr-auto text-emerald-700")}>
            <MessageCircle /> Ingatkan via WA
          </a>
        )}
        {canUndoWaive && (
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={undoing}
            onClick={() =>
              startUndo(async () => {
                const r = await undoWaiveSession(s.id);
                if (r.ok) {
                  toast.success(r.message);
                  onClose();
                } else toast.error(r.error);
              })
            }
          >
            <Undo2 /> Batalkan pembebasan tagihan
          </Button>
        )}
        {editable && (
          <>
            <Button variant="outline" onClick={onEdit}>
              <Pencil /> Edit
            </Button>
            <Button variant={vs === "belum_absen" ? "default" : "outline"} onClick={onOverride}>
              <ShieldCheck /> Ubah Status
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={onClose}>
          Tutup
        </Button>
      </div>
      <p className="sr-only">{KEHADIRAN[s.status_kehadiran].label}</p>
    </FormDialog>
  );
}
