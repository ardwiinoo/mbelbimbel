"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, FileText, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Td, EmptyState, Pill } from "@/components/app/ui";
import { FileLinks, fileHref } from "@/components/app/file-link";
import { FormDialog, Field } from "@/components/app/form-dialog";
import { ShareWaButton } from "@/components/app/share-wa";
import { postForm } from "@/lib/post-form";
import { tanggal, tanggalJam } from "@/lib/format";

import type { AssignmentRow, ReportRow } from "@/server/services/reports";

export type { AssignmentRow, ReportRow };

function shareText(r: ReportRow) {
  return `Assalamu'alaikum ${r.students?.ortu_nama ?? "Bapak/Ibu"}, berikut laporan perkembangan belajar ${r.students?.nama}${r.periode ? ` periode ${r.periode}` : ""}. Terima kasih.`;
}

export function AdminReports({ reports }: { reports: ReportRow[] }) {
  if (!reports.length) return <EmptyState title="Belum ada laporan masuk" />;
  return (
    <DataTable head={["Tanggal Upload", "Siswa & Kelas", "Program", "Tentor", "Periode", "File Laporan"]}>
      {reports.map((r) => (
        <tr key={r.id}>
          <Td className="whitespace-nowrap"><b>{tanggal(r.uploaded_at, false)}</b> <span className="text-muted-foreground">{tanggalJam(r.uploaded_at).split(" ").pop()}</span></Td>
          <Td><b>{r.students?.nama}</b> — {r.students?.kelas}</Td>
          <Td>{r.programs?.nama ?? "-"}</Td>
          <Td>{r.profiles?.nama}</Td>
          <Td className="text-muted-foreground">{r.periode ?? "-"}</Td>
          <Td>
            <div className="flex flex-wrap gap-1.5">
              <FileLinks fileId={r.file_id} />
              <ShareWaButton fileUrl={fileHref(r.file_id)} fileName={r.file_name || "laporan.pdf"} phone={r.students?.ortu_wa ?? null} text={shareText(r)} label="WA" />
            </div>
          </Td>
        </tr>
      ))}
    </DataTable>
  );
}

export function TutorReports({ assignments, reports }: { assignments: AssignmentRow[]; reports: ReportRow[] }) {
  const [uploading, setUploading] = useState<AssignmentRow | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const active = assignments.filter((a) => a.students && a.students.status === "aktif");

  if (!active.length) return <EmptyState title="Belum ada siswa bimbingan" desc="Admin belum meng-assign siswa ke Anda." />;

  return (
    <div className="space-y-3">
      {active.map((a) => {
        const list = reports.filter((r) => r.student_id === a.student_id && (r.program_id === a.program_id || !r.program_id));
        const last = list[0];
        const isOpen = open === a.id;
        return (
          <div key={a.id} className="rounded-xl border bg-card">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p><b>{a.students?.nama}</b> — {a.students?.kelas}</p>
                <p className="text-sm text-muted-foreground">{a.programs?.nama}</p>
                <p className="mt-1 text-xs">
                  Laporan terakhir: {last ? <b>{tanggal(last.uploaded_at, false)}</b> : <Pill color="amber">Belum ada</Pill>}
                </p>
              </div>
              <div className="flex gap-2">
                {list.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setOpen(isOpen ? null : a.id)}>
                    Riwayat ({list.length}) <ChevronDown className={isOpen ? "rotate-180" : ""} />
                  </Button>
                )}
                <Button size="sm" onClick={() => setUploading(a)}><Upload /> Upload PDF</Button>
              </div>
            </div>
            {isOpen && (
              <div className="divide-y border-t">
                {list.map((r) => (
                  <div key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-2 text-sm">
                      <FileText className="mt-0.5 size-4 text-red-600" />
                      <div>
                        <p className="font-medium">{r.periode || r.file_name}</p>
                        <p className="text-xs text-muted-foreground">Diunggah {tanggalJam(r.uploaded_at)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <FileLinks fileId={r.file_id} />
                      <ShareWaButton fileUrl={fileHref(r.file_id)} fileName={r.file_name || "laporan.pdf"} phone={a.students?.ortu_wa ?? null} text={shareText(r)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {uploading && <UploadDialog a={uploading} onClose={() => setUploading(null)} />}
    </div>
  );
}

function UploadDialog({ a, onClose }: { a: AssignmentRow; onClose: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [periode, setPeriode] = useState("");
  const [busy, setBusy] = useState(false);

  function pick(f: File | undefined) {
    if (!f) return;
    const isPdf = f.type === "application/pdf" && f.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) { toast.error("Hanya file PDF yang diterima"); return; }
    if (f.size > 10 * 1024 * 1024) { toast.error("Maksimal 10 MB"); return; }
    setFile(f);
  }

  async function submit() {
    if (!file) return toast.error("Pilih file PDF");
    setBusy(true);
    const form = new FormData();
    form.set("student_id", a.student_id);
    form.set("program_id", a.program_id);
    form.set("periode", periode);
    form.set("file", file);
    const res = await postForm("/api/reports", form);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.message ?? "Laporan terunggah");
    onClose();
    router.refresh();
  }

  return (
    <FormDialog title="Upload Laporan PDF" desc={`${a.students?.nama} — ${a.programs?.nama}`} onClose={onClose}>
      <Field label="Periode / catatan (opsional)"><Input placeholder="mis. November 2026" value={periode} onChange={(e) => setPeriode(e.target.value)} /></Field>
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed p-6 text-sm text-muted-foreground hover:bg-muted"
      >
        <FileText className="size-8 text-red-600" />
        {file ? <span className="font-medium text-foreground">{file.name}</span> : "Ketuk untuk memilih file PDF (maks 10 MB)"}
      </button>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Batal</Button>
        <Button disabled={busy || !file} onClick={submit}>{busy && <Loader2 className="animate-spin" />} Upload</Button>
      </div>
    </FormDialog>
  );
}
