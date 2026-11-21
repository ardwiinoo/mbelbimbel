"use client";
import { useMemo, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, MessageCircle, Upload, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Td, Pill, EmptyState } from "@/components/app/ui";
import { Pager, SearchBox, Toolbar, useClientList } from "@/components/app/table-kit";
import { FileLinks } from "@/components/app/file-link";
import { umur, waLink, KATEGORI_LABEL, tanggal } from "@/lib/format";
import { postForm } from "@/lib/post-form";
import type { StudentRow } from "@/server/services/students";
import { StudentDialog } from "./student-dialog";
import { softDeleteStudent } from "./actions";
import { AppSelect } from "@/components/app/app-select";

export type { StudentRow };

type Opt = { id: string; nama: string };

const searchText = (s: StudentRow) =>
  [s.nama, s.kelas, s.sekolah, s.alamat, s.ortu_nama, s.ortu_wa, ...s.student_programs.map((p) => `${p.programs?.nama} ${p.profiles?.nama ?? ""}`)].join(" ");

export function StudentsView({
  isAdmin,
  students,
  programs,
  tutors,
}: {
  isAdmin: boolean;
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
        <SearchBox value={list.q} onChange={list.setQ} placeholder="Cari siswa, kelas, sekolah, orang tua, atau program..." />
        {isAdmin && (
          <div className="grid grid-cols-3 gap-2 sm:flex [&>select]:sm:w-40">
            <AppSelect className="sm:w-40" value={fProgram} onChange={setFProgram} aria-label="Program"
              options={[{ value: "", label: "Semua program" }, ...programs.map((p) => ({ value: p.id, label: p.nama }))]} />
            <AppSelect className="sm:w-40" value={fTutor} onChange={setFTutor} aria-label="Tentor"
              options={[{ value: "", label: "Semua tentor" }, ...tutors.map((t) => ({ value: t.id, label: t.nama }))]} />
            <AppSelect className="sm:w-40" value={fStatus} onChange={setFStatus} aria-label="Status"
              options={[{ value: "", label: "Semua status" }, ...[{ value: "aktif", label: "Aktif" }, { value: "nonaktif", label: "Nonaktif" }]]} />
          </div>
        )}
        {isAdmin && (
          <Button onClick={() => setEditing("new")}>
            <Plus /> Tambah Siswa
          </Button>
        )}
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState
          title="Belum ada siswa"
          desc={isAdmin ? "Tambahkan siswa pertama atau ubah filter." : "Belum ada siswa yang di-assign ke Anda."}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable
              head={[
                "Profil Siswa",
                "Alamat",
                "Program",
                "Orang Tua & WA",
                ...(isAdmin ? ["Dokumen Asesmen (Admin)"] : []),
                "Status",
                ...(isAdmin ? [""] : []),
              ]}
            >
              {rows.map((s) => (
                <tr key={s.id}>
                  <Td><ProfileCell s={s} /></Td>
                  <Td className="max-w-48 text-muted-foreground">{s.alamat ?? "-"}</Td>
                  <Td><ProgramCell s={s} isAdmin={isAdmin} /></Td>
                  <Td><ParentCell s={s} /></Td>
                  {isAdmin && <Td><AssessmentCell s={s} /></Td>}
                  <Td>{statusPill(s)}</Td>
                  {isAdmin && <Td><RowActions s={s} onEdit={() => setEditing(s)} /></Td>}
                </tr>
              ))}
            </DataTable>
          </div>
          <div className="grid gap-3 md:hidden">
            {rows.map((s) => (
              <div key={s.id} className="space-y-3 rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <ProfileCell s={s} />
                  {statusPill(s)}
                </div>
                <ProgramCell s={s} isAdmin={isAdmin} />
                {s.alamat && <p className="text-sm text-muted-foreground">{s.alamat}</p>}
                <ParentCell s={s} />
                {isAdmin && <AssessmentCell s={s} />}
                {isAdmin && <RowActions s={s} onEdit={() => setEditing(s)} />}
              </div>
            ))}
          </div>
        </>
      )}
      <Pager page={list.page} pages={list.pages} total={list.total} pageSize={list.pageSize} onPage={list.setPage} />

      {isAdmin && editing && (
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

function ProfileCell({ s }: { s: StudentRow }) {
  const u = umur(s.tanggal_lahir);
  return (
    <div>
      <p>
        <span className="font-semibold">{s.nama}</span>
        {u !== null && <span className="text-muted-foreground"> ({u} Th)</span>}
      </p>
      <p className="text-xs text-muted-foreground">{[s.kelas, s.sekolah].filter(Boolean).join(" • ") || "-"}</p>
    </div>
  );
}

function ProgramCell({ s, isAdmin }: { s: StudentRow; isAdmin: boolean }) {
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
          {isAdmin && (
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

function AssessmentCell({ s }: { s: StudentRow }) {
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
        onClick={() => {
          if (!confirm(`Hapus ${s.nama}? Data tetap tersimpan (soft delete).`)) return;
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
