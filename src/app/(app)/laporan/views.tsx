"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, FileText, ChevronDown, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Td, EmptyState, Pill } from "@/components/app/ui";
import { FileLinks, fileHref } from "@/components/app/file-link";
import { FormDialog, Field } from "@/components/app/form-dialog";
import { ShareWaButton } from "@/components/app/share-wa";
import { Pager, SearchBox, ServerPager, ServerSearch, Toolbar, useClientList } from "@/components/app/table-kit";
import { postForm } from "@/lib/post-form";
import { tanggal, tanggalJam } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AssignmentRow, ReportRow } from "@/server/services/reports";

export type { AssignmentRow, ReportRow };

function shareText(r: ReportRow) {
  return `Assalamu'alaikum ${r.students?.ortu_nama ?? "Bapak/Ibu"}, berikut laporan perkembangan belajar ${r.students?.nama}${r.periode ? ` periode ${r.periode}` : ""}. Terima kasih.`;
}

/** "Diedit oleh X • 21 Nov 2026 (10.15)" */
function EditedNote({ r, className }: { r: ReportRow; className?: string }) {
  if (!r.edited_at) return null;
  return (
    <p className={cn("text-xs text-amber-700", className)}>
      Diedit oleh <b>{r.edited_by}</b> • {tanggalJam(r.edited_at)}
    </p>
  );
}

export function AdminReports({ reports, total, page }: { reports: ReportRow[]; total: number; page: number }) {
  const [editing, setEditing] = useState<ReportRow | null>(null);
  return (
    <div className="space-y-4">
      <Toolbar>
        <ServerSearch placeholder="Cari siswa, tentor, program, atau periode..." />
      </Toolbar>
      {!reports.length ? (
        <EmptyState title="Tidak ada laporan" desc="Belum ada laporan masuk, atau tidak cocok dengan pencarian." />
      ) : (
        <DataTable head={["Tanggal Upload", "Siswa & Kelas", "Program", "Tentor", "Periode", "File Laporan"]}>
          {reports.map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap">
                <p className="font-medium">{tanggal(r.uploaded_at, false)}</p>
                <p className="text-xs text-muted-foreground">{tanggalJam(r.uploaded_at).split(" ").pop()}</p>
              </Td>
              <Td>
                <p className="font-medium">{r.students?.nama}</p>
                <p className="text-xs text-muted-foreground">{r.students?.kelas}</p>
              </Td>
              <Td>{r.programs?.nama ?? "-"}</Td>
              <Td>{r.profiles?.nama}</Td>
              <Td>
                <p>{r.periode ?? "-"}</p>
                <EditedNote r={r} />
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1.5">
                  <FileLinks fileId={r.file_id} />
                  <ShareWaButton fileUrl={fileHref(r.file_id)} fileName={r.file_name || "laporan.pdf"} phone={r.students?.ortu_wa ?? null} text={shareText(r)} label="WA" />
                  <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                    <Pencil /> Edit
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
        </DataTable>
      )}
      <ServerPager total={total} page={page} />
      {editing && <ReportDialog mode={{ kind: "edit", report: editing }} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function TutorReports({ assignments, reports }: { assignments: AssignmentRow[]; reports: ReportRow[] }) {
  const [uploading, setUploading] = useState<AssignmentRow | null>(null);
  const [editing, setEditing] = useState<ReportRow | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const active = assignments.filter((a) => a.students && a.students.status === "aktif");
  const list = useClientList(active, (a) => `${a.students?.nama} ${a.students?.kelas} ${a.programs?.nama}`, 10);

  if (!active.length) return <EmptyState title="Belum ada siswa bimbingan" desc="Admin belum meng-assign siswa ke Anda." />;

  return (
    <div className="space-y-4">
      <Toolbar>
        <SearchBox value={list.q} onChange={list.setQ} placeholder="Cari nama siswa atau program..." />
      </Toolbar>
      {list.total === 0 && <EmptyState title="Tidak ditemukan" desc="Coba kata kunci lain." />}
      <div className="space-y-3">
        {list.rows.map((a) => {
          const own = reports.filter((r) => r.student_id === a.student_id && (r.program_id === a.program_id || !r.program_id));
          const last = own[0];
          const isOpen = open === a.id;
          return (
            <div key={a.id} className="rounded-xl border bg-card">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-0.5">
                  <p className="font-medium">
                    {a.students?.nama} <span className="font-normal text-muted-foreground">• {a.students?.kelas}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">{a.programs?.nama}</p>
                  <p className="text-xs">
                    Laporan terakhir: {last ? <b>{tanggal(last.uploaded_at, false)}</b> : <Pill color="amber">Belum ada</Pill>}
                  </p>
                </div>
                <div className="flex gap-2">
                  {own.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setOpen(isOpen ? null : a.id)}>
                      Riwayat ({own.length}) <ChevronDown className={isOpen ? "rotate-180" : ""} />
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setUploading(a)}>
                    <Upload /> Upload PDF
                  </Button>
                </div>
              </div>
              {isOpen && (
                <div className="divide-y border-t">
                  {own.map((r) => (
                    <div key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-2 text-sm">
                        <FileText className="mt-0.5 size-4 shrink-0 text-red-600" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{r.periode || r.file_name}</p>
                          <p className="text-xs text-muted-foreground">Diunggah {tanggalJam(r.uploaded_at)}</p>
                          <EditedNote r={r} />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <FileLinks fileId={r.file_id} />
                        <ShareWaButton fileUrl={fileHref(r.file_id)} fileName={r.file_name || "laporan.pdf"} phone={a.students?.ortu_wa ?? null} text={shareText(r)} label="WA" />
                        <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                          <Pencil /> Edit
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Pager page={list.page} pages={list.pages} total={list.total} pageSize={list.pageSize} onPage={list.setPage} />
      {uploading && <ReportDialog mode={{ kind: "new", a: uploading }} onClose={() => setUploading(null)} />}
      {editing && <ReportDialog mode={{ kind: "edit", report: editing }} onClose={() => setEditing(null)} />}
    </div>
  );
}

type DialogMode = { kind: "new"; a: AssignmentRow } | { kind: "edit"; report: ReportRow };

/** Upload baru ATAU edit (ganti file dan/atau periode). Edit: file opsional. */
function ReportDialog({ mode, onClose }: { mode: DialogMode; onClose: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const isEdit = mode.kind === "edit";
  const [file, setFile] = useState<File | null>(null);
  const [periode, setPeriode] = useState(isEdit ? (mode.report.periode ?? "") : "");
  const [busy, setBusy] = useState(false);
  const title = isEdit ? "Edit Laporan" : "Upload Laporan PDF";
  const desc = isEdit
    ? `${mode.report.students?.nama} — ${mode.report.programs?.nama ?? ""}`
    : `${mode.a.students?.nama} — ${mode.a.programs?.nama}`;

  function pick(f: File | undefined) {
    if (!f) return;
    const isPdf = f.type === "application/pdf" && f.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) return toast.error("Hanya file PDF yang diterima");
    if (f.size > 10 * 1024 * 1024) return toast.error("Maksimal 10 MB");
    setFile(f);
  }

  async function submit() {
    if (!isEdit && !file) return toast.error("Pilih file PDF");
    setBusy(true);
    const form = new FormData();
    if (isEdit) form.set("report_id", mode.report.id);
    else {
      form.set("student_id", mode.a.student_id);
      form.set("program_id", mode.a.program_id);
    }
    form.set("periode", periode);
    if (file) form.set("file", file);
    const res = await postForm("/api/reports", form);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.message ?? "Tersimpan");
    onClose();
    router.refresh();
  }

  return (
    <FormDialog title={title} desc={desc} onClose={onClose}>
      <Field label="Periode / catatan (opsional)">
        <Input placeholder="mis. November 2026" value={periode} onChange={(e) => setPeriode(e.target.value)} />
      </Field>
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed p-6 text-sm text-muted-foreground hover:bg-muted"
      >
        <FileText className="size-8 text-red-600" />
        {file ? (
          <span className="font-medium text-foreground">{file.name}</span>
        ) : isEdit ? (
          <>
            <span>Ketuk untuk mengganti file PDF (opsional)</span>
            <span className="text-xs">File saat ini: {mode.report.file_name}</span>
          </>
        ) : (
          "Ketuk untuk memilih file PDF (maks 10 MB)"
        )}
      </button>
      {isEdit && <p className="text-xs text-muted-foreground">Perubahan dicatat dengan nama Anda dan waktunya. File lama tetap tersimpan di arsip.</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Batal
        </Button>
        <Button disabled={busy || (!isEdit && !file)} onClick={submit}>
          {busy && <Loader2 className="animate-spin" />} {isEdit ? "Simpan" : "Upload"}
        </Button>
      </div>
    </FormDialog>
  );
}
