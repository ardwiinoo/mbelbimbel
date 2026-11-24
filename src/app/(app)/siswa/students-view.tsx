"use client";
import { useMemo, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, MessageCircle, Upload, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Td, Pill, EmptyState } from "@/components/app/ui";
import { FilterRow, filterSelectClass, Pager, SearchBox, Toolbar, useClientList } from "@/components/app/table-kit";
import { FileLinks } from "@/components/app/file-link";
import { umur, waLink, KATEGORI_LABEL, tanggal, siswaLabel } from "@/lib/format";
import { postForm } from "@/lib/post-form";
import type { StudentRow } from "@/server/services/students";
import { StudentDialog } from "./student-dialog";
import { softDeleteStudent } from "./actions";
import { AppSelect } from "@/components/app/app-select";
import { confirmDialog } from "@/components/app/confirm";

export type { StudentRow };

/** Izin halaman Siswa untuk akun yang login (dihitung di server). */
export type StudentPerm = { viewAll: boolean; manage: boolean; asesmen: "read" | "write" | null };

type Opt = { id: string; nama: string };

const searchText = (s: StudentRow) =>
  [s.nama, s.panggilan, s.kelas, s.sekolah, s.alamat, s.ortu_nama, s.ortu_wa, ...s.student_programs.map((p) => `${p.programs?.nama} ${p.profiles?.nama ?? ""}`)].join(" ");

export function StudentsView({
  perm,
  students,
  programs,
  tutors,
}: {
  perm: StudentPerm;
  students: StudentRow[];
  programs: (Opt & { kategori: string })[];
  tutors: Opt[];
}) {
  const [fProgram, setFProgram] = useState("");
  const [fStatus, setFStatus] = useState("aktif");
  const [fTutor, setFTutor] = useState("");
  const [editing, setEditing] = useState<StudentRow | null | "new">(null);

  const filtered = useMemo(
    () =>
      students.filter(
        (s) =>
          (!fStatus || s.status === fStatus) &&
          (!fProgram || s.student_programs.some((p) => p.program_id === fProgram)) &&
          (!fTutor || s.student_programs.some((p) => p.tutor_id === fTutor)),
      ),
    [students, fProgram, fStatus, fTutor],
  );
  // Cari di nama, kelas, sekolah, orang tua, WA, dan program
  const list = useClientList(filtered, searchText);
  const rows = list.rows;

  const statusPill = (s: StudentRow) => (
    <Pill color={s.status === "aktif" ? "green" : "gray"}>{s.status === "aktif" ? "Aktif" : "Nonaktif"}</Pill>
  );

  return (
    <div className="space-y-4">
      <Toolbar>
        <SearchBox value={list.q} onChange={list.setQ} placeholder={perm.viewAll ? "Cari siswa, kelas, orang tua…" : "Cari siswa atau kelas…"} />
        {perm.viewAll && (
          <FilterRow>
            <AppSelect className={filterSelectClass} value={fProgram} onChange={setFProgram} aria-label="Program"
              options={[{ value: "", label: "Semua program" }, ...programs.map((p) => ({ value: p.id, label: p.nama }))]} />
            <AppSelect className={filterSelectClass} value={fTutor} onChange={setFTutor} aria-label="Tentor"
              options={[{ value: "", label: "Semua tentor" }, ...tutors.map((t) => ({ value: t.id, label: t.nama }))]} />
            <AppSelect className={filterSelectClass} value={fStatus} onChange={setFStatus} aria-label="Status"
              options={[{ value: "", label: "Semua status" }, ...[{ value: "aktif", label: "Aktif" }, { value: "nonaktif", label: "Nonaktif" }]]} />
          </FilterRow>
        )}
        {perm.manage && (
          <Button onClick={() => setEditing("new")}>
            <Plus /> Tambah Siswa
          </Button>
        )}
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState
          title="Belum ada siswa"
          desc={perm.viewAll ? "Tambahkan siswa pertama atau ubah filter." : "Belum ada siswa yang di-assign ke Anda."}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable
              head={[
                "Profil Siswa",
                ...(perm.viewAll ? ["Alamat"] : []),
                "Program",
                ...(perm.viewAll ? ["Orang Tua & WA"] : []),
                ...(perm.asesmen ? ["Dokumen Asesmen"] : []),
                "Status",
                ...(perm.manage ? [""] : []),
              ]}
            >
              {rows.map((s) => (
                <tr key={s.id}>
                  <Td><ProfileCell s={s} forTutor={!perm.viewAll} /></Td>
                  {perm.viewAll && <Td className="max-w-48 text-muted-foreground">{s.alamat ?? "-"}</Td>}
                  <Td><ProgramCell s={s} showTutor={perm.viewAll} /></Td>
                  {perm.viewAll && <Td><ParentCell s={s} /></Td>}
                  {perm.asesmen && <Td><AssessmentCell s={s} canUpload={perm.asesmen === "write"} /></Td>}
                  <Td>{statusPill(s)}</Td>
                  {perm.manage && <Td><RowActions s={s} onEdit={() => setEditing(s)} /></Td>}
                </tr>
              ))}
            </DataTable>
          </div>
          <div className="grid gap-3 md:hidden">
            {rows.map((s) => (
              <div key={s.id} className="overflow-hidden rounded-xl border bg-card">
                <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
                  <ProfileCell s={s} forTutor={!perm.viewAll} />
                  {statusPill(s)}
                </div>
                <dl className="grid gap-3 border-t px-4 py-3.5 text-sm">
                  <CardRow label="Program">
                    <ProgramCell s={s} showTutor={perm.viewAll} />
                  </CardRow>
                  {perm.viewAll && (
                    <CardRow label="Orang tua">
                      <ParentCell s={s} />
                    </CardRow>
                  )}
                  {perm.viewAll && s.alamat && <CardRow label="Alamat">{s.alamat}</CardRow>}
                  {perm.asesmen && s.student_programs.some((p) => p.programs?.kategori === "abk") && (
                    <CardRow label="Asesmen">
                      <AssessmentCell s={s} canUpload={perm.asesmen === "write"} />
                    </CardRow>
                  )}
                </dl>
                {perm.manage && (
                  <div className="flex justify-end border-t bg-muted/30 px-4 py-2.5">
                    <RowActions s={s} onEdit={() => setEditing(s)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <Pager page={list.page} pages={list.pages} total={list.total} pageSize={list.pageSize} onPage={list.setPage} />

      {perm.manage && editing && (
        <StudentDialog
          student={editing === "new" ? null : editing}
          programs={programs}
          tutors={tutors}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** Baris label–isi pada kartu HP. */
function CardRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] gap-3">
      <dt className="pt-px text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function ProfileCell({ s, forTutor }: { s: StudentRow; forTutor: boolean }) {
  const u = umur(s.tanggal_lahir);
  return (
    <div>
      <p>
        <span className="font-semibold">{forTutor ? siswaLabel(s) : s.nama}</span>
        {!forTutor && s.panggilan && <span className="text-muted-foreground"> “{s.panggilan}”</span>}
        {u !== null && <span className="text-muted-foreground"> ({u} Th)</span>}
      </p>
      <p className="text-xs text-muted-foreground">{[s.kelas, s.sekolah].filter(Boolean).join(" • ") || "-"}</p>
    </div>
  );
}

function ProgramCell({ s, showTutor }: { s: StudentRow; showTutor: boolean }) {
  if (!s.student_programs.length) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="space-y-1">
      {s.student_programs.map((sp) => (
        <div key={sp.id}>
          <p>
            <b className={sp.programs?.kategori === "abk" ? "" : "font-normal"}>
              {KATEGORI_LABEL[sp.programs?.kategori ?? ""]}
            </b>{" "}
            • {sp.programs?.nama.replace(/^(Privat|ABK|Kelompok)\s/, "")}
          </p>
          {showTutor && (
            <p className="text-xs text-muted-foreground">Tentor: {sp.profiles?.nama ?? "belum ditetapkan"}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function ParentCell({ s }: { s: StudentRow }) {
  return (
    <div>
      <p>{s.ortu_nama ?? "-"}</p>
      {s.ortu_wa && (
        <a
          href={waLink(s.ortu_wa)}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"
        >
          <MessageCircle className="size-3" /> {s.ortu_wa}
        </a>
      )}
    </div>
  );
}

function AssessmentCell({ s, canUpload }: { s: StudentRow; canUpload: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const isAbk = s.student_programs.some((p) => p.programs?.kategori === "abk");
  if (!isAbk) return <span className="text-muted-foreground">-</span>;
  const latest = [...(s.student_assessments ?? [])].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))[0];

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (!["application/pdf", "image/jpeg", "image/png"].includes(f.type)) return toast.error("Format harus PDF/JPG/PNG");
    if (f.size > 10 * 1024 * 1024) return toast.error("Maksimal 10 MB");
    if (
      latest &&
      !(await confirmDialog({
        title: `Ganti dokumen asesmen ${s.nama}?`,
        desc: (
          <>
            File lama <b className="text-foreground">{latest.file_name ?? "dokumen"}</b> akan <b className="text-foreground">dihapus permanen</b> dan diganti{" "}
            <b className="text-foreground">{f.name}</b>.
          </>
        ),
        confirmLabel: "Ganti file",
        tone: "danger",
      }))
    ) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.set("student_id", s.id);
    form.set("file", f);
    const res = await postForm("/api/assessments", form);
    setBusy(false);
    if (res.ok) {
      toast.success(res.message);
      router.refresh();
    } else toast.error(res.error);
  }

  return (
    <div className="space-y-1.5">
      {latest ? (
        <>
          <Pill color="blue">
            <Lock className="size-3" /> Ada ({latest.file_name?.split(".").pop()?.toUpperCase()})
          </Pill>
          <p className="text-[11px] text-muted-foreground">{tanggal(latest.uploaded_at, false)}</p>
          <FileLinks fileId={latest.file_id} />
        </>
      ) : (
        <Pill color="amber">Belum ada</Pill>
      )}
      {canUpload && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            hidden
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <Button size="sm" variant={latest ? "ghost" : "outline"} disabled={busy} onClick={() => inputRef.current?.click()}>
            <Upload /> {busy ? "Mengunggah..." : latest ? "Ganti file" : "Upload asesmen"}
          </Button>
          {latest && <p className="text-[11px] text-muted-foreground">Mengganti file akan menghapus file lama.</p>}
        </>
      )}
    </div>
  );
}

function RowActions({ s, onEdit }: { s: StudentRow; onEdit: () => void }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="outline" onClick={onEdit}>
        <Pencil /> Edit
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label="Hapus"
        onClick={async () => {
          const ok = await confirmDialog({
            title: `Hapus ${s.nama}?`,
            desc: "Siswa hilang dari daftar, tetapi datanya tetap tersimpan dan bisa dipulihkan oleh Super Admin.",
            confirmLabel: "Hapus",
            tone: "danger",
          });
          if (!ok) return;
          start(async () => {
            const r = await softDeleteStudent(s.id);
            if (r.ok) toast.success(r.message);
            else toast.error(r.error);
          });
        }}
      >
        <Trash2 className="text-destructive" />
      </Button>
    </div>
  );
}
