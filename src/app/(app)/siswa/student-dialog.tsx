"use client";
import { useTransition } from "react";
import { Controller, useForm, useFieldArray } from "react-hook-form";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog, Field } from "@/components/app/form-dialog";
import { saveStudent, type StudentInput } from "./actions";
import type { StudentRow } from "./students-view";
import { AppSelect } from "@/components/app/app-select";

type Opt = { id: string; nama: string };

type FormValues = Omit<StudentInput, "programs"> & {
  programs: { program_id: string; tutor_id: string }[];
};

export function StudentDialog({
  student,
  programs,
  tutors,
  onClose,
}: {
  student: StudentRow | null;
  programs: (Opt & { kategori: string })[];
  tutors: Opt[];
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const { register, control, handleSubmit } = useForm<FormValues>({
    defaultValues: {
      nama: student?.nama ?? "",
      tanggal_lahir: student?.tanggal_lahir ?? "",
      kelas: student?.kelas ?? "",
      sekolah: student?.sekolah ?? "",
      alamat: student?.alamat ?? "",
      ortu_nama: student?.ortu_nama ?? "",
      ortu_wa: student?.ortu_wa ?? "",
      status: student?.status ?? "aktif",
      programs: student?.student_programs.map((p) => ({ program_id: p.program_id, tutor_id: p.tutor_id ?? "" })) ?? [
        { program_id: "", tutor_id: "" },
      ],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "programs" });

  const onSubmit = (v: FormValues) =>
    start(async () => {
      const res = await saveStudent({
        ...v,
        id: student?.id,
        programs: v.programs.filter((p) => p.program_id).map((p) => ({ program_id: p.program_id, tutor_id: p.tutor_id || null })),
      });
      if (res.ok) {
        toast.success(res.message);
        onClose();
      } else toast.error(res.error);
    });

  return (
    <FormDialog title={student ? "Edit Siswa" : "Tambah Siswa"} onClose={onClose} wide>
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2">
        <Field label="Nama lengkap *" className="sm:col-span-2">
          <Input {...register("nama", { required: true })} />
        </Field>
        <Field label="Tanggal lahir" hint="Umur dihitung otomatis">
          <Input type="date" {...register("tanggal_lahir")} />
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
                  options={programs.map((p) => ({ value: p.id, label: p.nama }))} />
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
          <Button type="button" variant="outline" size="sm" onClick={() => append({ program_id: "", tutor_id: "" })}>
            <Plus /> Tambah program
          </Button>
        </div>

        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan"}</Button>
        </div>
      </form>
    </FormDialog>
  );
}
