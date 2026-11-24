"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Plus, Pencil, MessageCircle, ShieldCheck, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Td, Pill, EmptyState, SectionHeader } from "@/components/app/ui";
import { Pager, SearchBox, Toolbar, useClientList } from "@/components/app/table-kit";
import { FormDialog, Field } from "@/components/app/form-dialog";
import { rupiah, waLink, KATEGORI_LABEL } from "@/lib/format";
import { saveTutor, saveProgram } from "./actions";
import { AppSelect } from "@/components/app/app-select";
import type { MapelKey } from "@/lib/mapel";
import { useMapel, useMapelOptions } from "@/components/app/mapel-context";
import { MapelBadge } from "@/components/app/mapel-badge";

export type TutorRow = {
  id: string; nama: string; email: string | null; no_wa: string | null; spesialisasi: string | null; mapel_kategori: MapelKey; tarif_honor: number | null; tarif_mapel: { mapel: MapelKey; tarif: number }[] | null; rekening: string | null; status: "aktif" | "nonaktif";
};
export type ProgramRow = {
  id: string; nama: string; kategori: "privat" | "kelompok" | "abk"; mapel_kategori: MapelKey; jenjang: string; tarif_per_pertemuan: number; aktif: boolean;
};

export function TutorsTable({ tutors, canEdit, canManageAccounts, showHonor, editHonor }: { tutors: TutorRow[]; canEdit: boolean; canManageAccounts: boolean; /** akses Honor (Lihat) */ showHonor: boolean; /** akses Honor (Kelola) */ editHonor: boolean }) {
  const [editing, setEditing] = useState<TutorRow | null>(null);
  const { of: mapelOf } = useMapel();
  const list = useClientList(tutors, (t) => `${t.nama} ${t.spesialisasi ?? ""} ${mapelOf(t.mapel_kategori).label} ${t.no_wa ?? ""} ${t.email ?? ""}`);
  const action = canManageAccounts ? (
    <Link href="/pengguna" className={buttonVariants()}>
      <ShieldCheck /> Buat / kelola akun tentor
    </Link>
  ) : (
    <p className="text-xs text-muted-foreground">Akun tentor baru & akses dikelola di menu Pengguna & Akses.</p>
  );
  return (
    <section className="space-y-4">
      <SectionHeader title="A. Data Tentor" actions={action} />
      <Toolbar>
        <SearchBox value={list.q} onChange={list.setQ} placeholder="Cari nama, mapel, WA…" />
      </Toolbar>
      {list.total === 0 ? (
        <EmptyState title={tutors.length ? "Tidak ditemukan" : "Belum ada tentor"} />
      ) : (
        <DataTable head={["Nama Tentor", "Mapel utama", "Spesialisasi", "No. WhatsApp", ...(showHonor ? ["Honor / Sesi", "Rekening / E-Wallet"] : []), "Akun Login", "Status", ...(canEdit ? [""] : [])]}>
          {list.rows.map((t) => (
            <tr key={t.id}>
              <Td className="font-medium">{t.nama}</Td>
              <Td><MapelBadge mapel={t.mapel_kategori} /></Td>
              <Td>{t.spesialisasi ?? "-"}</Td>
              <Td>
                {t.no_wa ? (
                  <a href={waLink(t.no_wa)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-emerald-700 hover:underline">
                    <MessageCircle className="size-3.5" /> {t.no_wa}
                  </a>
                ) : "-"}
              </Td>
              {showHonor && (
                <Td className="font-medium tabular-nums">
                  {t.tarif_honor ? rupiah(t.tarif_honor) : <span className="text-amber-700">Belum diisi</span>}
                  {!!t.tarif_mapel?.length && (
                    <p className="text-xs font-normal text-muted-foreground" title={t.tarif_mapel.map((x) => `${mapelOf(x.mapel).label}: ${rupiah(x.tarif)}`).join(" • ")}>
                      +{t.tarif_mapel.length} tarif khusus
                    </p>
                  )}
                </Td>
              )}
              {showHonor && <Td className="max-w-44 text-muted-foreground">{t.rekening ?? "-"}</Td>}
              <Td className="text-muted-foreground">{t.email}</Td>
              <Td><Pill color={t.status === "aktif" ? "green" : "gray"}>{t.status === "aktif" ? "Aktif" : "Nonaktif"}</Pill></Td>
              {canEdit && <Td><Button size="sm" variant="outline" onClick={() => setEditing(t)}><Pencil /> Edit</Button></Td>}
            </tr>
          ))}
        </DataTable>
      )}
      <Pager page={list.page} pages={list.pages} total={list.total} pageSize={list.pageSize} onPage={list.setPage} />
      {editing && <TutorDialog tutor={editing} editHonor={editHonor} onClose={() => setEditing(null)} />}
    </section>
  );
}

function TutorDialog({ tutor, editHonor, onClose }: { tutor: TutorRow; editHonor: boolean; onClose: () => void }) {
  const [pending, start] = useTransition();
  const mapelOptions = useMapelOptions([tutor.mapel_kategori, ...(tutor.tarif_mapel ?? []).map((x) => x.mapel)]);
  // Tarif khusus per mapel (opsional): mapel tanpa baris memakai tarif standar
  const [rates, setRates] = useState<{ mapel: string; tarif: string }[]>((tutor.tarif_mapel ?? []).map((x) => ({ mapel: x.mapel, tarif: String(x.tarif) })));
  const { register, handleSubmit, control } = useForm({
    defaultValues: { nama: tutor.nama, spesialisasi: tutor.spesialisasi ?? "", mapel_kategori: tutor.mapel_kategori, no_wa: tutor.no_wa ?? "", tarif_honor: tutor.tarif_honor ?? 0, rekening: tutor.rekening ?? "" },
  });
  return (
    <FormDialog title="Edit Tentor" desc={tutor.email ?? undefined} onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={handleSubmit((v) =>
          start(async () => {
            const { tarif_honor, rekening, ...base } = v;
            const tarif_mapel = rates.filter((x) => x.mapel).map((x) => ({ mapel: x.mapel as MapelKey, tarif: Number(x.tarif) || 0 }));
            const r = await saveTutor({ ...base, ...(editHonor ? { tarif_honor: Number(tarif_honor), tarif_mapel, rekening } : {}), id: tutor.id });
            if (r.ok) { toast.success(r.message); onClose(); } else toast.error(r.error);
          }),
        )}
      >
        <Field label="Nama *"><Input {...register("nama")} /></Field>
        <Field label="Mapel utama di Jadwal *" hint="Menentukan kelompok tentor di Resource Timeline. Tentor boleh mengajar mapel lain; warna kotak jadwal mengikuti program siswanya.">
          <Controller control={control} name="mapel_kategori" render={({ field }) => (
            <AppSelect value={field.value} onChange={field.onChange} options={mapelOptions} />
          )} />
        </Field>
        <Field label="Spesialisasi / keterangan *"><Input placeholder="Calistung, SD Umum" {...register("spesialisasi")} /></Field>
        <Field label="No. WhatsApp"><Input inputMode="tel" {...register("no_wa")} /></Field>
        {editHonor && (
          <>
            <Field label="Tarif honor standar per sesi (Rp)" hint="Dikali jumlah sesi yang sudah absen tiap bulan. Dikunci ke slip saat honor ditandai lunas.">
              <Input type="number" min={0} step={1000} {...register("tarif_honor")} />
            </Field>
            <div className="space-y-2">
              <p className="text-sm font-medium">Tarif khusus per mapel <span className="font-normal text-muted-foreground">(opsional)</span></p>
              <p className="text-xs text-muted-foreground">Untuk sesi program dengan mapel tertentu (mis. ABK lebih tinggi). Mapel yang tidak diisi memakai tarif standar di atas.</p>
              {rates.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <AppSelect
                    className="flex-1"
                    aria-label="Mapel"
                    value={row.mapel}
                    placeholder="Pilih mapel"
                    onChange={(v) => setRates((a) => a.map((x, j) => (j === i ? { ...x, mapel: v } : x)))}
                    options={mapelOptions.filter((o) => o.value === row.mapel || !rates.some((x) => x.mapel === o.value))}
                  />
                  <Input
                    className="w-36"
                    type="number"
                    min={0}
                    step={1000}
                    aria-label="Tarif per sesi"
                    placeholder="Rp / sesi"
                    value={row.tarif}
                    onChange={(e) => setRates((a) => a.map((x, j) => (j === i ? { ...x, tarif: e.target.value } : x)))}
                  />
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Hapus tarif mapel" onClick={() => setRates((a) => a.filter((_, j) => j !== i))}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              ))}
              {rates.length < mapelOptions.length && (
                <Button type="button" size="sm" variant="outline" onClick={() => setRates((a) => [...a, { mapel: "", tarif: "" }])}>
                  <Plus /> Tambah tarif mapel
                </Button>
              )}
            </div>
            <Field label="Rekening / e-wallet" hint="Tujuan pembayaran honor; tampil di slip.">
              <Input placeholder="BCA 1234567890 a.n. Kak Aulia" {...register("rekening")} />
            </Field>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan"}</Button>
        </div>
      </form>
    </FormDialog>
  );
}

export function ProgramsTable({ programs, canEdit }: { programs: ProgramRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<ProgramRow | "new" | null>(null);
  const list = useClientList(programs, (p) => `${p.nama} ${p.kategori} ${p.jenjang}`);
  return (
    <section className="space-y-4">
      <SectionHeader title="B. Master Program & Tarif" actions={canEdit ? <Button onClick={() => setEditing("new")}><Plus /> Tambah Program</Button> : undefined} />
      <Toolbar>
        <SearchBox value={list.q} onChange={list.setQ} placeholder="Cari program, jenjang…" />
      </Toolbar>
      {list.total === 0 ? (
        <EmptyState title={programs.length ? "Tidak ditemukan" : "Belum ada program"} />
      ) : (
        <DataTable head={["Nama Program", "Kategori", "Mapel (warna)", "Jenjang", "Tarif per Pertemuan", "Status", ...(canEdit ? [""] : [])]}>
          {list.rows.map((p) => (
            <tr key={p.id}>
              <Td className="font-medium">{p.nama}</Td>
              <Td>{KATEGORI_LABEL[p.kategori]}</Td>
              <Td><MapelBadge mapel={p.mapel_kategori} /></Td>
              <Td>{p.jenjang}</Td>
              <Td className="font-medium tabular-nums">{rupiah(p.tarif_per_pertemuan)}</Td>
              <Td><Pill color={p.aktif ? "green" : "gray"}>{p.aktif ? "Aktif" : "Nonaktif"}</Pill></Td>
              {canEdit && <Td><Button size="sm" variant="outline" onClick={() => setEditing(p)}><Pencil /> Edit</Button></Td>}
            </tr>
          ))}
        </DataTable>
      )}
      <Pager page={list.page} pages={list.pages} total={list.total} pageSize={list.pageSize} onPage={list.setPage} />
      {editing && <ProgramDialog program={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function ProgramDialog({ program, onClose }: { program: ProgramRow | null; onClose: () => void }) {
  const [pending, start] = useTransition();
  const mapelOptions = useMapelOptions([program?.mapel_kategori]);
  const { register, handleSubmit, control } = useForm({
    defaultValues: {
      nama: program?.nama ?? "", kategori: program?.kategori ?? "privat", mapel_kategori: program?.mapel_kategori ?? "lainnya", jenjang: program?.jenjang ?? "",
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
          <Controller control={control} name="kategori" render={({ field }) => (
            <AppSelect value={field.value} onChange={field.onChange}
              options={[{ value: "privat", label: "Privat" }, { value: "kelompok", label: "Kelompok" }, { value: "abk", label: "ABK" }]} />
          )} />
        </Field>
        <Field label="Mapel (warna di Jadwal)" className="sm:col-span-2" hint="Satu kategori mapel = satu warna tetap di kotak jadwal.">
          <Controller control={control} name="mapel_kategori" render={({ field }) => (
            <AppSelect value={field.value} onChange={field.onChange} options={mapelOptions} />
          )} />
        </Field>
        <Field label="Jenjang *"><Input placeholder="TK / SD" {...register("jenjang")} /></Field>
        <Field label="Tarif per pertemuan (Rp) *"><Input type="number" min={0} step={1000} {...register("tarif_per_pertemuan")} /></Field>
        <Field label="Status">
          <label className="flex h-9 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" {...register("aktif")} className="size-4 cursor-pointer" /> Program aktif</label>
        </Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan"}</Button>
        </div>
      </form>
    </FormDialog>
  );
}
