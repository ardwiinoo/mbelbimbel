"use client";
import { useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/app/form-dialog";
import { ImageUpload } from "@/components/app/image-upload";
import { saveSettings } from "./actions";

type S = {
  nama_bimbel: string; alamat: string | null; rekening: string | null; wa_admin: string | null;
  link_drive_konten: string | null; absen_buka_menit: number; absen_tutup_menit: number; absen_susulan_bebas: boolean;
  logo_file_id: string | null; tagline: string | null; kota: string | null;
};

export function SettingsForm({ s, readOnly, canLogo }: { s: S; readOnly: boolean; canLogo: boolean }) {
  const [pending, start] = useTransition();
  const { register, handleSubmit, control } = useForm({
    defaultValues: {
      nama_bimbel: s.nama_bimbel, alamat: s.alamat ?? "", rekening: s.rekening ?? "", wa_admin: s.wa_admin ?? "",
      link_drive_konten: s.link_drive_konten ?? "", absen_buka_menit: s.absen_buka_menit, absen_tutup_menit: s.absen_tutup_menit,
      absen_susulan_bebas: s.absen_susulan_bebas,
      tagline: s.tagline ?? "",
      kota: s.kota ?? "",
    },
  });
  const bebas = useWatch({ control, name: "absen_susulan_bebas" });
  return (
    <form
      className="grid max-w-3xl gap-4"
      onSubmit={handleSubmit((v) => start(async () => {
        const r = await saveSettings(v);
        if (r.ok) toast.success(r.message); else toast.error(r.error);
      }))}
    >
      {/* Logo punya izin sendiri (admin Invoice/Honor juga boleh), jadi di luar fieldset */}
      <Card>
        <CardHeader><CardTitle>Logo</CardTitle></CardHeader>
        <CardContent>
          {canLogo ? (
            <ImageUpload
              endpoint="/api/settings/logo"
              fileId={s.logo_file_id}
              alt="Logo bimbel"
              emptyText="Belum ada logo"
              removeTitle="Hapus logo bimbel?"
              hint="PNG (latar transparan lebih baik) atau JPG, maks 2 MB. Tampil di kop nota & slip PDF."
            />
          ) : (
            <p className="text-sm text-muted-foreground">{s.logo_file_id ? "Logo sudah diatur." : "Belum ada logo."} Anda tidak punya akses mengubahnya.</p>
          )}
        </CardContent>
      </Card>
      {/* Akses Lihat saja → semua isian nonaktif */}
      <fieldset disabled={readOnly} className="contents">
      <Card>
        <CardHeader><CardTitle>Identitas & Nota</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <Field label="Nama bimbel"><Input {...register("nama_bimbel")} /></Field>
          <Field label="Tagline" hint="Satu baris di bawah nama bimbel pada kop nota & slip PDF."><Input maxLength={120} placeholder="Lembaga Bimbingan Belajar & Pendampingan Anak" {...register("tagline")} /></Field>
          <Field label="Alamat"><Textarea rows={2} {...register("alamat")} /></Field>
          <Field label="Kota" hint="Untuk baris tanda tangan slip honor, mis. &quot;Yogyakarta, 30 November 2026&quot;."><Input maxLength={60} placeholder="Yogyakarta" {...register("kota")} /></Field>
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
          <Field label="Tutup (menit setelah jam selesai)" hint={bebas ? "Tidak berlaku: absen susulan sedang diizinkan tanpa batas." : undefined}>
            <Input type="number" min={0} disabled={bebas} {...register("absen_tutup_menit")} />
          </Field>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/30 p-3 select-none sm:col-span-2">
            <input type="checkbox" role="switch" className="mt-0.5" {...register("absen_susulan_bebas")} />
            <span className="text-sm">
              <b>Izinkan absen susulan (tanpa batas waktu)</b>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Tombol Absen tidak dikunci meski jam les sudah lewat, jadi tentor yang lupa tetap bisa absen. Absen susulan tetap tercatat dengan jam server,
                sehingga admin melihat keterlambatannya (mis. &quot;Telat 25 menit&quot;) di pop-up jadwal.
              </span>
            </span>
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-2">Dicek di server saat absen. Di luar jendela, admin tetap bisa mengabsenkan manual dari menu Jadwal.</p>
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
