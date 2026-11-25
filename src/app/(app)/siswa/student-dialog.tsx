"use client";
import { useTransition } from "react";
import { Controller, useForm, useFieldArray, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Info, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { rupiah, tanggal, tanggalJam } from "@/lib/format";
import { FormDialog, Field } from "@/components/app/form-dialog";
import { saveStudent, type StudentInput } from "./actions";
import type { StudentRow } from "./students-view";
import { AppSelect } from "@/components/app/app-select";
import { DatePicker } from "@/components/app/date-picker";

type Opt = { id: string; nama: string };

/** "Dibuat 21 Nov 2026 oleh Admin • diubah 22 Nov 2026 (10.15) oleh Kak Bayu" */
function auditText(a: StudentRow["audit"]) {
  const parts = [`Dibuat ${tanggal(a.created_at, false)}${a.created_by ? ` oleh ${a.created_by}` : ""}`];
  if (a.updated_at) parts.push(`diubah ${tanggalJam(a.updated_at)}${a.updated_by ? ` oleh ${a.updated_by}` : ""}`);
  return parts.join(" • ");
}

type FormValues = Omit<StudentInput, "programs"> & {
  /** orig = program baris ini saat dialog dibuka ("" = baris baru); dikirim sebagai "dari" agar pasangan lama→baru jelas */
  programs: { program_id: string; tutor_id: string; orig: string }[];
};

export function StudentDialog({
  student,
  programs,
  tutors,
  onClose,
}: {
  student: StudentRow | null;
  programs: (Opt & { kategori: string; tarif: number | null })[];
  tutors: Opt[];
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const { register, control, handleSubmit } = useForm<FormValues>({
    defaultValues: {
      nama: student?.nama ?? "",
      panggilan: student?.panggilan ?? "",
      tanggal_lahir: student?.tanggal_lahir ?? "",
      kelas: student?.kelas ?? "",
      sekolah: student?.sekolah ?? "",
      alamat: student?.alamat ?? "",
      ortu_nama: student?.ortu_nama ?? "",
      ortu_wa: student?.ortu_wa ?? "",
      status: student?.status ?? "aktif",
      programs: student?.student_programs.map((p) => ({ program_id: p.program_id, tutor_id: p.tutor_id ?? "", orig: p.program_id })) ?? [
        { program_id: "", tutor_id: "", orig: "" },
      ],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "programs" });

  // Pemberitahuan sebelum simpan: mengganti program ikut memindahkan sesi yang belum ditagih (tarif ikut berubah)
  const watched = useWatch({ control, name: "programs" });
  const rowsNow = watched ?? [];
  const nowIds = rowsNow.map((p) => p.program_id).filter(Boolean);
  const origIds = student?.student_programs.map((p) => p.program_id) ?? [];
  const removedIds = student ? origIds.filter((x) => !nowIds.includes(x)) : [];
  const addedIds = student ? nowIds.filter((x) => !origIds.includes(x)) : [];
  const nameOf = (pid: string) => programs.find((p) => p.id === pid)?.nama ?? student?.student_programs.find((p) => p.program_id === pid)?.programs?.nama ?? "program";
  const hargaOf = (pid: string) => {
    const t = programs.find((p) => p.id === pid)?.tarif;
    return t != null ? ` (${rupiah(t)} / pertemuan)` : "";
  };
  // pasangan lama → baru dari baris yang programnya diganti
  const pairs = student
    ? rowsNow.filter((p) => p.orig && p.program_id && p.orig !== p.program_id && !nowIds.includes(p.orig)).map((p) => ({ dari: p.orig, ke: p.program_id }))
    : [];
  const unpairedAdded = addedIds.filter((x) => !pairs.some((p) => p.ke === x));
  const lines: string[] = pairs.map((p) => `${nameOf(p.dari)} → ${nameOf(p.ke)}${hargaOf(p.ke)}`);
  if (unpairedAdded.length === 1 && removedIds.some((x) => !pairs.some((p) => p.dari === x))) {
    lines.push(`program lama lainnya → ${nameOf(unpairedAdded[0])}${hargaOf(unpairedAdded[0])}`);
  } else if (unpairedAdded.length === 1 && pairs.length === 0 && removedIds.length === 0) {
    lines.length = 0; // hanya menambah program, tidak ada yang diganti
  }
  let swapNotice: { tone: "info" | "warn"; text: string } | null = null;
  if (lines.length) {
    swapNotice = {
      tone: "info",
      text: `Program diganti: ${lines.join("; ")}. Sesi yang belum ditagih ikut pindah ke program baru, jadi tagihannya memakai tarif baru. Sesi yang sudah masuk invoice tetap memakai data lama.`,
    };
  } else if (removedIds.length > 0 && addedIds.length > 0) {
    swapNotice = {
      tone: "warn",
      text: "Program dihapus lalu ditambah di baris lain, jadi pasangannya tidak jelas dan sesi yang sudah ada tidak dipindahkan otomatis. Ganti program langsung di barisnya (pilih ulang di dropdown yang sama) agar sesi yang belum ditagih ikut pindah.",
    };
  }

  const onSubmit = (v: FormValues) =>
    start(async () => {
      const res = await saveStudent({
        ...v,
        id: student?.id,
        programs: v.programs.filter((p) => p.program_id).map((p) => ({ program_id: p.program_id, tutor_id: p.tutor_id || null, dari: p.orig || null })),
      });
      if (res.ok) {
        toast.success(res.message);
        onClose();
      } else toast.error(res.error);
    });

  return (
    <FormDialog
      title={student ? "Edit Siswa" : "Tambah Siswa"}
      desc={student ? auditText(student.audit) : undefined}
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2">
        <Field label="Nama lengkap *">
          <Input {...register("nama", { required: true })} />
        </Field>
        <Field label="Nama panggilan" hint="Dipakai di Jadwal & tampilan tentor">
          <Input placeholder="mis. Said" {...register("panggilan")} />
        </Field>
        <Field label="Tanggal lahir" hint="Ketik DD/MM/YYYY atau pilih dari kalender. Umur dihitung otomatis">
          <Controller control={control} name="tanggal_lahir" render={({ field }) => (
            <DatePicker typeable placeholder="DD/MM/YYYY" max={new Date().toISOString().slice(0, 10)} value={field.value ?? ""} onChange={field.onChange} />
          )} />
        </Field>
        <Field label="Kelas">
          <Input placeholder="Kelas 4 SD" {...register("kelas")} />
        </Field>
        <Field label="Sekolah" className="sm:col-span-2">
          <Input {...register("sekolah")} />
        </Field>
        <Field label="Alamat" className="sm:col-span-2">
          <Textarea rows={2} {...register("alamat")} />
        </Field>
        <Field label="Nama orang tua">
          <Input placeholder="Ibu Sari" {...register("ortu_nama")} />
        </Field>
        <Field label="No. WA orang tua">
          <Input inputMode="tel" placeholder="0812-3456-7890" {...register("ortu_wa")} />
        </Field>
        <Field label="Status">
          <Controller control={control} name="status" render={({ field }) => (
            <AppSelect value={field.value ?? "aktif"} onChange={field.onChange} options={[{ value: "aktif", label: "Aktif" }, { value: "nonaktif", label: "Nonaktif" }]} />
          )} />
        </Field>

        <div className="space-y-2 sm:col-span-2">
          <p className="text-sm font-medium">Program & tentor pengampu</p>
          {fields.map((f, i) => (
            <div key={f.id} className="flex gap-2">
              <Controller control={control} name={`programs.${i}.program_id`} render={({ field }) => (
                <AppSelect value={field.value} onChange={field.onChange} placeholder="Pilih program" aria-label="Program"
                  options={programs.filter((p) => p.id === field.value || !nowIds.includes(p.id)).map((p) => ({ value: p.id, label: p.nama }))} />
              )} />
              <Controller control={control} name={`programs.${i}.tutor_id`} render={({ field }) => (
                <AppSelect value={field.value} onChange={field.onChange} placeholder="Pilih tentor" aria-label="Tentor"
                  options={tutors.map((t) => ({ value: t.id, label: t.nama }))} />
              )} />
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Hapus program">
                <X />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => append({ program_id: "", tutor_id: "", orig: "" })}>
            <Plus /> Tambah program
          </Button>
          {swapNotice && (
            <p
              role="status"
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${swapNotice.tone === "info" ? "border-blue-200 bg-blue-50 text-blue-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}
            >
              <Info className="mt-0.5 size-3.5 shrink-0" />
              {swapNotice.text}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan"}</Button>
        </div>
      </form>
    </FormDialog>
  );
}
