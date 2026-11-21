"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Plus, Pencil, MessageCircle, ShieldCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Td, Pill, EmptyState, selectClass } from "@/components/app/ui";
import { FormDialog, Field } from "@/components/app/form-dialog";
import { rupiah, waLink, KATEGORI_LABEL } from "@/lib/format";
import { saveTutor, saveProgram } from "./actions";

export type TutorRow = {
  id: string; nama: string; email: string | null; no_wa: string | null; spesialisasi: string | null; status: "aktif" | "nonaktif";
};
export type ProgramRow = {
  id: string; nama: string; kategori: "privat" | "kelompok" | "abk"; jenjang: string; tarif_per_pertemuan: number; aktif: boolean;
};

function SectionTitle({ title, action }: { title: string; action: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">{title}</h2>
      {action}
    </div>
  );
}

export function TutorsTable({ tutors, isSuper }: { tutors: TutorRow[]; isSuper: boolean }) {
  const [editing, setEditing] = useState<TutorRow | null>(null);
  const action = isSuper ? (
    <Link href="/pengguna" className={buttonVariants({ size: "sm" })}>
      <ShieldCheck /> Buat / kelola akun tentor
    </Link>
  ) : (
    <p className="text-xs text-muted-foreground">Akun tentor baru, status, & reset password dikelola Super Admin.</p>
  );
  return (
    <section>
      <SectionTitle title="A. Data Tentor" action={action} />
      {tutors.length === 0 ? (
        <EmptyState title="Belum ada tentor" />
      ) : (
        <DataTable head={["Nama Tentor", "Spesialisasi / Mapel", "No. WhatsApp", "Akun Login", "Status", ""]}>
          {tutors.map((t) => (
            <tr key={t.id}>
              <Td className="font-semibold">{t.nama}</Td>
              <Td>{t.spesialisasi ?? "-"}</Td>
              <Td>
                {t.no_wa ? (
                  <a href={waLink(t.no_wa)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-emerald-700 hover:underline">
                    <MessageCircle className="size-3.5" /> {t.no_wa}
                  </a>
                ) : "-"}
              </Td>
              <Td className="text-muted-foreground">{t.email}</Td>
              <Td><Pill color={t.status === "aktif" ? "green" : "gray"}>{t.status === "aktif" ? "Aktif" : "Nonaktif"}</Pill></Td>
              <Td><Button size="sm" variant="outline" onClick={() => setEditing(t)}><Pencil /> Edit</Button></Td>
            </tr>
          ))}
        </DataTable>
      )}
      {editing && <TutorDialog tutor={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function TutorDialog({ tutor, onClose }: { tutor: TutorRow; onClose: () => void }) {
  const [pending, start] = useTransition();
  const { register, handleSubmit } = useForm({
    defaultValues: { nama: tutor.nama, spesialisasi: tutor.spesialisasi ?? "", no_wa: tutor.no_wa ?? "" },
  });
  return (
    <FormDialog title="Edit Tentor" desc={tutor.email ?? undefined} onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={handleSubmit((v) =>
          start(async () => {
            const r = await saveTutor({ ...v, id: tutor.id });
            if (r.ok) { toast.success(r.message); onClose(); } else toast.error(r.error);
          }),
        )}
      >
        <Field label="Nama *"><Input {...register("nama")} /></Field>
        <Field label="Spesialisasi / Mapel *"><Input placeholder="Calistung, SD Umum" {...register("spesialisasi")} /></Field>
        <Field label="No. WhatsApp"><Input inputMode="tel" {...register("no_wa")} /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan"}</Button>
        </div>
      </form>
    </FormDialog>
  );
}

export function ProgramsTable({ programs }: { programs: ProgramRow[] }) {
  const [editing, setEditing] = useState<ProgramRow | "new" | null>(null);
  return (
    <section>
      <SectionTitle title="B. Master Program & Tarif" action={<Button size="sm" onClick={() => setEditing("new")}><Plus /> Tambah Program</Button>} />
      <DataTable head={["Nama Program", "Kategori", "Jenjang", "Tarif per Pertemuan", "Status", ""]}>
        {programs.map((p) => (
          <tr key={p.id}>
            <Td className="font-semibold">{p.nama}</Td>
            <Td>{KATEGORI_LABEL[p.kategori]}</Td>
            <Td>{p.jenjang}</Td>
            <Td className="font-medium tabular-nums">{rupiah(p.tarif_per_pertemuan)}</Td>
            <Td><Pill color={p.aktif ? "green" : "gray"}>{p.aktif ? "Aktif" : "Nonaktif"}</Pill></Td>
            <Td><Button size="sm" variant="outline" onClick={() => setEditing(p)}><Pencil /> Edit</Button></Td>
          </tr>
        ))}
      </DataTable>
      {editing && <ProgramDialog program={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function ProgramDialog({ program, onClose }: { program: ProgramRow | null; onClose: () => void }) {
  const [pending, start] = useTransition();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      nama: program?.nama ?? "", kategori: program?.kategori ?? "privat", jenjang: program?.jenjang ?? "",
      tarif_per_pertemuan: program?.tarif_per_pertemuan ?? 0, aktif: program?.aktif ?? true,
    },
  });
  return (
    <FormDialog title={program ? "Edit Program" : "Tambah Program"} desc="Tarif di-snapshot saat invoice terbit, jadi perubahan tidak mengubah invoice lama." onClose={onClose}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={handleSubmit((v) =>
          start(async () => {
            const r = await saveProgram({ ...v, id: program?.id });
            if (r.ok) { toast.success(r.message); onClose(); } else toast.error(r.error);
          }),
        )}
      >
        <Field label="Nama program *" className="sm:col-span-2"><Input placeholder="Privat Calistung" {...register("nama")} /></Field>
        <Field label="Kategori">
          <select className={selectClass} {...register("kategori")}>
            <option value="privat">Privat</option>
            <option value="kelompok">Kelompok</option>
            <option value="abk">ABK</option>
          </select>
        </Field>
        <Field label="Jenjang *"><Input placeholder="TK / SD" {...register("jenjang")} /></Field>
        <Field label="Tarif per pertemuan (Rp) *"><Input type="number" min={0} step={1000} {...register("tarif_per_pertemuan")} /></Field>
        <Field label="Status">
          <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" {...register("aktif")} className="size-4" /> Aktif</label>
        </Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan"}</Button>
        </div>
      </form>
    </FormDialog>
  );
}
