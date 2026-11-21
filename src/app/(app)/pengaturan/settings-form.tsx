"use client";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/app/form-dialog";
import { saveSettings } from "./actions";

type S = {
  nama_bimbel: string; alamat: string | null; rekening: string | null; wa_admin: string | null;
  link_drive_konten: string | null; absen_buka_menit: number; absen_tutup_menit: number;
};

export function SettingsForm({ s, readOnly }: { s: S; readOnly: boolean }) {
  const [pending, start] = useTransition();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      nama_bimbel: s.nama_bimbel, alamat: s.alamat ?? "", rekening: s.rekening ?? "", wa_admin: s.wa_admin ?? "",
      link_drive_konten: s.link_drive_konten ?? "", absen_buka_menit: s.absen_buka_menit, absen_tutup_menit: s.absen_tutup_menit,
    },
  });
  return (
    <form
      className="grid max-w-3xl gap-4"
      onSubmit={handleSubmit((v) => start(async () => {
        const r = await saveSettings(v);
        if (r.ok) toast.success(r.message); else toast.error(r.error);
      }))}
    >
      {/* Akses Lihat saja → semua isian nonaktif */}
      <fieldset disabled={readOnly} className="contents">
      <Card>
        <CardHeader><CardTitle>Identitas & Nota</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <Field label="Nama bimbel"><Input {...register("nama_bimbel")} /></Field>
          <Field label="Alamat"><Textarea rows={2} {...register("alamat")} /></Field>
          <Field label="Info rekening / pembayaran (tampil di nota PDF)">
            <Textarea rows={3} placeholder="BCA 1234567890 a.n. Bimbel Cerdas" {...register("rekening")} />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Kontak & Tautan</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="No. WA admin" hint="Untuk tombol usulan materi tentor."><Input inputMode="tel" {...register("wa_admin")} /></Field>
          <Field label="Link folder Google Drive (video konten)" hint="Tombol pintas di halaman Jadwal."><Input placeholder="https://drive.google.com/..." {...register("link_drive_konten")} /></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Jendela Waktu Absen</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Buka (menit sebelum jam mulai)"><Input type="number" min={0} {...register("absen_buka_menit")} /></Field>
          <Field label="Tutup (menit setelah jam selesai)"><Input type="number" min={0} {...register("absen_tutup_menit")} /></Field>
          <p className="text-xs text-muted-foreground sm:col-span-2">Dicek di server saat absen. Di luar jendela, admin bisa mengabsenkan manual dari menu Jadwal.</p>
        </CardContent>
      </Card>
      </fieldset>
      {readOnly ? (
        <p className="text-sm text-muted-foreground">Anda hanya punya akses Lihat untuk Pengaturan.</p>
      ) : (
        <div><Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan Pengaturan"}</Button></div>
      )}
    </form>
  );
}
