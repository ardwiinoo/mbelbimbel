"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, MessageCircle, FileText, Loader2, Eye, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Td, EmptyState } from "@/components/app/ui";
import { FilterRow, filterSelectClass, Pager, SearchBox, Toolbar, useClientList } from "@/components/app/table-kit";
import { fileHref } from "@/components/app/file-link";
import { ActionMenu, type ActionItem } from "@/components/app/action-menu";
import { FormDialog, Field } from "@/components/app/form-dialog";
import { postForm } from "@/lib/post-form";
import type { MaterialRow } from "@/server/services/materials";
import { tanggal, waLink } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteMaterial } from "./actions";
import { AppSelect } from "@/components/app/app-select";
import { confirmDialog } from "@/components/app/confirm";

export type { MaterialRow };

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.doc,.docx,.ppt,.pptx,.xls,.xlsx";
const MAX = 25 * 1024 * 1024;
const previewable = (mime: string | null) => !!mime && (mime === "application/pdf" || mime.startsWith("image/"));
const materialSearchText = (m: MaterialRow) => `${m.judul} ${m.kategori} ${m.jenjang} ${m.file_name}`;
const sizeLabel = (n: number | null) => (n ? (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`) : "");

export function MaterialsView({ canManage, tutorName, waAdmin, materials }: {
  /** akses Bank Materi (Kelola) */
  canManage: boolean; tutorName: string; waAdmin: string | null; materials: MaterialRow[];
}) {
  const isAdmin = canManage;
  const [kat, setKat] = useState("");
  const [jen, setJen] = useState("");
  const [editing, setEditing] = useState<MaterialRow | "new" | null>(null);
  const [pending, start] = useTransition();

  const kategoriList = [...new Set(materials.map((m) => m.kategori))].sort();
  const jenjangList = [...new Set(materials.map((m) => m.jenjang))].sort();
  const byFilter = useMemo(() => materials.filter((m) => (!kat || m.kategori === kat) && (!jen || m.jenjang === jen)), [materials, kat, jen]);
  const list = useClientList(byFilter, materialSearchText);
  const rows = list.rows;

  function remove(m: MaterialRow) {
    start(async () => {
      const ok = await confirmDialog({
        title: `Hapus materi "${m.judul}"?`,
        desc: "Materi dan file-nya dihapus permanen dari server. Tindakan ini tidak bisa dibatalkan.",
        confirmLabel: "Hapus",
        tone: "danger",
      });
      if (!ok) return;
      const r = await deleteMaterial(m.id);
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });
  }

  const menuItems = (m: MaterialRow): ActionItem[] => [
    { label: "Lihat file", icon: <Eye />, href: fileHref(m.file_id), newTab: true, hidden: !previewable(m.mime) },
    { label: "Unduh", icon: <Download />, href: fileHref(m.file_id, true) },
    { label: "Edit", icon: <Pencil />, hidden: !isAdmin, separator: true, onClick: () => setEditing(m) },
    { label: "Hapus materi", icon: <Trash2 />, danger: true, hidden: !isAdmin, disabled: pending, onClick: () => remove(m) },
  ];

  const usulanText = `Halo Admin, saya ${tutorName} ingin mengusulkan materi untuk Bank Materi:\n\nJudul: \nKategori/Jenjang: \n\n(file saya lampirkan di chat ini)`;

  return (
    <div className="space-y-4">
      <Toolbar>
        <SearchBox value={list.q} onChange={list.setQ} placeholder="Cari judul, kategori, jenjang…" />
        <FilterRow>
          <AppSelect className={filterSelectClass} value={kat} onChange={setKat} aria-label="Kategori"
            options={[{ value: "", label: "Semua kategori" }, ...kategoriList.map((k) => ({ value: k, label: k }))]} />
          <AppSelect className={filterSelectClass} value={jen} onChange={setJen} aria-label="Jenjang"
            options={[{ value: "", label: "Semua jenjang" }, ...jenjangList.map((k) => ({ value: k, label: k }))]} />
        </FilterRow>
        {isAdmin ? (
          <Button onClick={() => setEditing("new")}><Plus /> Upload Modul</Button>
        ) : (
          <a
            href={waAdmin ? waLink(waAdmin, usulanText) : "#"}
            target="_blank"
            rel="noopener"
            onClick={(e) => { if (!waAdmin) { e.preventDefault(); toast.error("Nomor WA admin belum diatur"); } }}
            className={cn(buttonVariants(), "bg-emerald-600 hover:bg-emerald-700")}
          >
            <MessageCircle /> Kirim Usulan Materi via WA Admin
          </a>
        )}
      </Toolbar>

      {list.total === 0 ? (
        <EmptyState title={materials.length ? "Tidak ditemukan" : "Belum ada materi"} />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable head={["Judul Modul / Materi", "Kategori / Jenjang", "Tgl Update", "Aksi"]}>
              {rows.map((m) => (
                <tr key={m.id}>
                  <Td>
                    <p className="font-semibold">{m.judul}</p>
                    <p className="text-xs text-muted-foreground">{m.file_name} {sizeLabel(m.ukuran) && `• ${sizeLabel(m.ukuran)}`}</p>
                  </Td>
                  <Td>{m.kategori} • {m.jenjang}</Td>
                  <Td className="whitespace-nowrap">
                    <p>{tanggal(m.updated_at, false)}</p>
                    {m.updated_by && <p className="text-xs text-muted-foreground">oleh {m.updated_by}</p>}
                  </Td>
                  <Td><ActionMenu items={menuItems(m)} /></Td>
                </tr>
              ))}
            </DataTable>
          </div>
          <div className="grid gap-3 md:hidden">
            {rows.map((m) => (
              <div key={m.id} className="space-y-2 rounded-xl border bg-card p-4">
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold">{m.judul}</p>
                    <p className="text-xs text-muted-foreground">{m.kategori} • {m.jenjang} • {tanggal(m.updated_at, false)}{m.updated_by && ` oleh ${m.updated_by}`}</p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <ActionMenu items={menuItems(m)} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <Pager page={list.page} pages={list.pages} total={list.total} pageSize={list.pageSize} onPage={list.setPage} />
      {isAdmin && editing && <MaterialDialog m={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MaterialDialog({ m, onClose }: { m: MaterialRow | null; onClose: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [judul, setJudul] = useState(m?.judul ?? "");
  const [kategori, setKategori] = useState(m?.kategori ?? "");
  const [jenjang, setJenjang] = useState(m?.jenjang ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!judul.trim() || !kategori.trim() || !jenjang.trim()) return toast.error("Judul, kategori, jenjang wajib diisi");
    if (!m && !file) return toast.error("Pilih file materi");
    setBusy(true);
    const form = new FormData();
    if (m) form.set("id", m.id);
    form.set("judul", judul.trim());
    form.set("kategori", kategori.trim());
    form.set("jenjang", jenjang.trim());
    if (file) form.set("file", file);
    const res = await postForm("/api/materials", form);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.message ?? "Materi disimpan");
    onClose();
    router.refresh();
  }

  return (
    <FormDialog title={m ? "Edit Materi" : "Upload Modul"} onClose={onClose}>
      <Field label="Judul *"><Input value={judul} onChange={(e) => setJudul(e.target.value)} placeholder="Modul Calistung Jilid 1" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kategori *"><Input value={kategori} onChange={(e) => setKategori(e.target.value)} placeholder="Calistung" /></Field>
        <Field label="Jenjang *"><Input value={jenjang} onChange={(e) => setJenjang(e.target.value)} placeholder="TK/SD" /></Field>
      </div>
      <input
        ref={fileRef} type="file" accept={ACCEPT} hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && f.size > MAX) return toast.error("Maksimal 25 MB");
          setFile(f ?? null);
        }}
      />
      <button type="button" onClick={() => fileRef.current?.click()} className="w-full rounded-xl border-2 border-dashed p-5 text-sm text-muted-foreground hover:bg-muted">
        {file ? <span className="font-medium text-foreground">{file.name}</span> : m ? `Ganti file (saat ini: ${m.file_name})` : "Pilih file: PDF, gambar, Word, PowerPoint, Excel (maks 25 MB). Saran: PDF agar bisa langsung dilihat tanpa unduh."}
      </button>
      {m && (
        <p className={file ? "rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" : "text-xs text-muted-foreground"}>
          {file ? `File lama (${m.file_name}) akan dihapus permanen dan diganti file baru saat disimpan.` : "Mengganti file akan menghapus file lama."}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Batal</Button>
        <Button disabled={busy} onClick={submit}>{busy && <Loader2 className="animate-spin" />} Simpan</Button>
      </div>
    </FormDialog>
  );
}
