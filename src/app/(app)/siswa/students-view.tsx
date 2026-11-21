"use client";
import { useMemo, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, MessageCircle, Upload, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Td, Pill, EmptyState, selectClass } from "@/components/app/ui";
import { FileLinks } from "@/components/app/file-link";
import { umur, waLink, KATEGORI_LABEL, tanggal } from "@/lib/format";
import { postForm } from "@/lib/post-form";
import type { StudentRow } from "@/server/services/students";
import { StudentDialog } from "./student-dialog";
import { softDeleteStudent } from "./actions";

export type { StudentRow };

type Opt = { id: string; nama: string };

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
  const [q, setQ] = useState("");
  const [fProgram, setFProgram] = useState("");
  const [fStatus, setFStatus] = useState("aktif");
  const [fTutor, setFTutor] = useState("");
  const [editing, setEditing] = useState<StudentRow | null | "new">(null);

  const rows = useMemo(
    () =>
      students.filter(
        (s) =>
          (!q || s.nama.toLowerCase().includes(q.toLowerCase())) &&
          (!fStatus || s.status === fStatus) &&
          (!fProgram || s.student_programs.some((p) => p.program_id === fProgram)) &&
          (!fTutor || s.student_programs.some((p) => p.tutor_id === fTutor)),
      ),
    [students, q, fProgram, fStatus, fTutor],
  );

  const statusPill = (s: StudentRow) => (
    <Pill color={s.status === "aktif" ? "green" : "gray"}>{s.status === "aktif" ? "Aktif" : "Nonaktif"}</Pill>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cari nama siswa..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
        {isAdmin && (
          <div className="grid grid-cols-3 gap-2 md:flex">
            <select className={selectClass} value={fProgram} onChange={(e) => setFProgram(e.target.value)}>
              <option value="">Semua program</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.nama}</option>
              ))}
            </select>
            <select className={selectClass} value={fTutor} onChange={(e) => setFTutor(e.target.value)}>
              <option value="">Semua tentor</option>
              {tutors.map((t) => (
                <option key={t.id} value={t.id}>{t.nama}</option>
              ))}
            </select>
            <select className={selectClass} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">Semua status</option>
              <option value="aktif">Aktif</option>
              <option value="nonaktif">Nonaktif</option>
            </select>
          </div>
        )}
        {isAdmin && (
          <Button onClick={() => setEditing("new")} className="h-9">
            <Plus /> Tambah Siswa
          </Button>
        )}
      </div>

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
      <Button size="xs" variant="ghost" disabled={busy} onClick={() => inputRef.current?.click()}>
        <Upload /> {busy ? "Mengunggah..." : latest ? "Ganti" : "Upload"}
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
