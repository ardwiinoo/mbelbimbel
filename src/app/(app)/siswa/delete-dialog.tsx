"use client";
// Konfirmasi hapus siswa: menampilkan data terkait; hapus hanya bisa bila tagihan terbuka sudah beres.
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/app/form-dialog";
import type { StudentDeleteSummary } from "@/server/services/students";
import { loadStudentDeleteSummary, softDeleteStudent, waiveStudentBilling } from "./actions";

export function DeleteStudentDialog({ student, canWaive, onClose }: { student: { id: string; nama: string }; canWaive: boolean; onClose: () => void }) {
  const [sum, setSum] = useState<StudentDeleteSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);
  useEffect(() => {
    let stale = false;
    loadStudentDeleteSummary(student.id).then((r) => {
      if (stale) return;
      if (r.ok) {
        setSum(r.data);
        setError(null);
      } else setError(r.error);
    });
    return () => {
      stale = true;
    };
  }, [student.id, tick]);

  const blocked = !!sum && (sum.hadir_belum_ditagih > 0 || sum.invoice_belum_lunas > 0);

  function waive() {
    start(async () => {
      const r = await waiveStudentBilling(student.id);
      if (r.ok) {
        toast.success(r.message);
        reload();
      } else toast.error(r.error);
    });
  }
  function remove() {
    start(async () => {
      const r = await softDeleteStudent(student.id);
      if (r.ok) {
        toast.success(r.message);
        onClose();
      } else {
        toast.error(r.error);
        reload();
      }
    });
  }

  return (
    <FormDialog title={`Hapus ${student.nama}?`} desc="Siswa hilang dari daftar. Datanya tetap tersimpan dan bisa dipulihkan oleh Super Admin." onClose={onClose}>
      {!sum && !error && <p className="py-4 text-center text-sm text-muted-foreground">Memeriksa data terkait…</p>}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {sum && (
        <>
          <ul className="divide-y rounded-lg border text-sm">
            <Row ok={sum.hadir_belum_ditagih === 0} label="Sesi Hadir belum ditagih" value={sum.hadir_belum_ditagih} />
            <Row ok={sum.invoice_belum_lunas === 0} label="Invoice belum lunas" value={sum.invoice_belum_lunas} />
            <Row ok label="Sesi terjadwal (akan dibatalkan otomatis)" value={sum.sesi_terjadwal} neutral />
          </ul>

          {blocked ? (
            <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                Siswa tidak bisa dihapus selama masih ada tagihan terbuka. Selesaikan dulu salah satu cara berikut:
              </p>
              <ul className="list-disc space-y-1 pl-9 text-xs">
                {sum.hadir_belum_ditagih > 0 && <li>Terbitkan invoice untuk sesi Hadir di menu Invoice, atau bebaskan tagihannya bila siswa berhenti dan tidak akan ditagih (honor tentor tetap dihitung).</li>}
                {sum.invoice_belum_lunas > 0 && <li>Lunasi, atau hapus invoice yang tidak jadi, di menu Invoice.</li>}
              </ul>
              <div className="flex flex-wrap gap-2 pl-9">
                <Link href="/invoice" className="inline-flex h-8 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted">
                  Buka menu Invoice
                </Link>
                {canWaive && sum.hadir_belum_ditagih > 0 && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={waive}>
                    {pending && <Loader2 className="animate-spin" />} Bebaskan tagihan ({sum.hadir_belum_ditagih} sesi)
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              Tidak ada tagihan terbuka. Invoice lunas dan riwayat honor tetap tersimpan sebagai arsip.
            </p>
          )}
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Batal</Button>
        <Button className="bg-red-600 text-white hover:bg-red-700" disabled={pending || !sum || blocked} onClick={remove}>
          {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} Hapus siswa
        </Button>
      </div>
    </FormDialog>
  );
}

function Row({ label, value, ok, neutral }: { label: string; value: number; ok: boolean; neutral?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <span>{label}</span>
      <span className={`font-semibold tabular-nums ${neutral ? "" : ok ? "text-green-700" : "text-red-700"}`}>{value}</span>
    </li>
  );
}
