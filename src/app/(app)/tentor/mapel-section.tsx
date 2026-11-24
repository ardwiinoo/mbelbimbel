"use client";
// Pengelola kategori mapel: nilai awal dari sistem, admin bisa menambah/mengubah nama & warna.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Td, Pill, SectionHeader } from "@/components/app/ui";
import { FormDialog, Field } from "@/components/app/form-dialog";
import { confirmDialog } from "@/components/app/confirm";
import { COLOR_PRESETS, FALLBACK_KEY, HEX } from "@/lib/mapel";
import { cn } from "@/lib/utils";
import type { MapelAdminRow } from "@/server/services/mapel";
import { deleteMapelCategory, saveMapelCategory } from "./actions";

function Preview({ label, bg, dot }: { label: string; bg: string; dot: string }) {
  const ok = HEX.test(bg) && HEX.test(dot);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={ok ? { background: bg, borderColor: `${dot}55` } : undefined}
    >
      <span className="size-2 rounded-full" style={ok ? { background: dot } : undefined} aria-hidden />
      {label || "Contoh"}
    </span>
  );
}

export function MapelSection({ rows, canEdit }: { rows: MapelAdminRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<MapelAdminRow | "new" | null>(null);
  const [pending, start] = useTransition();

  function remove(r: MapelAdminRow) {
    start(async () => {
      const ok = await confirmDialog({
        title: `Hapus kategori "${r.label}"?`,
        desc: "Hanya kategori yang belum dipakai program/tentor manapun yang bisa dihapus.",
        confirmLabel: "Hapus",
        tone: "danger",
      });
      if (!ok) return;
      const res = await deleteMapelCategory(r.key);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }

  return (
    <section className="space-y-4">
      <SectionHeader
        title="C. Kategori Mapel & Warna"
        actions={canEdit ? <Button onClick={() => setEditing("new")}><Plus /> Tambah Kategori</Button> : undefined}
      />
      <p className="-mt-2 text-sm text-muted-foreground">
        Satu kategori = satu warna tetap di Jadwal (kotak sesi, filter, kelompok tentor) dan dasar tarif honor khusus. Nilai awal sudah disediakan; tambahkan bila ada mapel baru.
      </p>
      <DataTable head={["Kategori", "Label Filter", "Dipakai", "Status", ...(canEdit ? [""] : [])]}>
        {rows.map((r) => (
          <tr key={r.key}>
            <Td><Preview label={r.label} bg={r.bg} dot={r.dot} /></Td>
            <Td className="text-muted-foreground">{r.short}</Td>
            <Td className="text-sm tabular-nums">
              {r.dipakai.program} program • {r.dipakai.tentor} tentor
            </Td>
            <Td><Pill color={r.aktif ? "green" : "gray"}>{r.aktif ? "Aktif" : "Nonaktif"}</Pill></Td>
            {canEdit && (
              <Td>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(r)}><Pencil /> Edit</Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Hapus kategori"
                    title={r.key === FALLBACK_KEY ? "Kategori cadangan, tidak bisa dihapus" : r.dipakai.program + r.dipakai.tentor > 0 ? "Masih dipakai, nonaktifkan saja" : "Hapus kategori"}
                    disabled={pending || r.key === FALLBACK_KEY || r.dipakai.program + r.dipakai.tentor > 0}
                    onClick={() => remove(r)}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </Td>
            )}
          </tr>
        ))}
      </DataTable>
      {editing && <MapelDialog row={editing === "new" ? null : editing} nextUrut={Math.max(0, ...rows.filter((r) => r.key !== FALLBACK_KEY).map((r) => r.urut)) + 10} onClose={() => setEditing(null)} />}
    </section>
  );
}

function MapelDialog({ row, nextUrut, onClose }: { row: MapelAdminRow | null; nextUrut: number; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [label, setLabel] = useState(row?.label ?? "");
  const [short, setShort] = useState(row?.short ?? "");
  const [bg, setBg] = useState(row?.bg ?? COLOR_PRESETS[7].bg);
  const [dot, setDot] = useState(row?.dot ?? COLOR_PRESETS[7].dot);
  const [urut, setUrut] = useState(String(row?.urut ?? nextUrut));
  const [aktif, setAktif] = useState(row?.aktif ?? true);
  const [custom, setCustom] = useState(false);
  const isFallback = row?.key === FALLBACK_KEY;

  return (
    <FormDialog title={row ? "Edit Kategori Mapel" : "Tambah Kategori Mapel"} desc={row ? `Kunci: ${row.key} (tetap)` : "Pilih warna pastel; warna titik otomatis menyesuaikan."} onClose={onClose}>
      <Field label="Nama kategori *" hint="Tampil di form, badge, dan kelompok tentor di Jadwal.">
        <Input value={label} maxLength={40} placeholder="mis. Matematika SMA & UTBK" onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label="Label filter (pendek)" hint="Teks di pil filter Jadwal. Kosong = sama dengan nama.">
        <Input value={short} maxLength={20} placeholder="mis. Mtk SMA" onChange={(e) => setShort(e.target.value)} />
      </Field>

      <div className="space-y-2">
        <p className="text-sm font-medium">Warna</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Pilihan warna">
          {COLOR_PRESETS.map((c) => {
            const on = !custom && c.bg.toUpperCase() === bg.toUpperCase() && c.dot.toUpperCase() === dot.toUpperCase();
            return (
              <button
                key={c.bg}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`Warna ${c.dot}`}
                onClick={() => { setBg(c.bg); setDot(c.dot); setCustom(false); }}
                className={cn("flex size-9 items-center justify-center rounded-full border-2 transition", on ? "ring-2 ring-offset-2" : "hover:scale-105")}
                style={{ background: c.bg, borderColor: c.dot, ...(on ? { ["--tw-ring-color" as string]: c.dot } : {}) }}
              >
                <span className="size-2.5 rounded-full" style={{ background: c.dot }} />
              </button>
            );
          })}
          <button type="button" onClick={() => setCustom((v) => !v)} className={cn("rounded-full border px-3 text-xs font-medium hover:bg-muted", custom && "bg-muted ring-2 ring-foreground/15")}>
            Kustom
          </button>
        </div>
        {custom && (
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="color" value={HEX.test(bg) ? bg.toLowerCase() : "#ffffff"} onChange={(e) => setBg(e.target.value)} className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5" /> Latar (pastel)
            </label>
            <label className="flex items-center gap-2">
              <input type="color" value={HEX.test(dot) ? dot.toLowerCase() : "#000000"} onChange={(e) => setDot(e.target.value)} className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5" /> Titik / tepi
            </label>
          </div>
        )}
        <div className="flex items-center gap-2 pt-1 text-sm text-muted-foreground">
          Pratinjau: <Preview label={label || "Nama kategori"} bg={bg} dot={dot} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Urutan" hint="Kecil tampil lebih dulu.">
          <Input type="number" min={0} max={999} value={urut} onChange={(e) => setUrut(e.target.value)} />
        </Field>
        <Field label="Status">
          <label className="flex h-9 cursor-pointer items-center gap-2 text-sm select-none">
            <input type="checkbox" role="switch" checked={aktif} disabled={isFallback} onChange={(e) => setAktif(e.target.checked)} />
            {aktif ? "Aktif (bisa dipilih)" : "Nonaktif"}
          </label>
        </Field>
      </div>
      {isFallback && <p className="text-xs text-muted-foreground">Kategori cadangan: dipakai bila mapel belum diatur, jadi selalu aktif.</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Batal</Button>
        <Button
          disabled={pending || label.trim().length < 2 || !HEX.test(bg) || !HEX.test(dot)}
          onClick={() =>
            start(async () => {
              const r = await saveMapelCategory({ key: row?.key, label, short, bg, dot, urut: Number(urut) || 0, aktif });
              if (r.ok) { toast.success(r.message); onClose(); } else toast.error(r.error);
            })
          }
        >
          {pending ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </FormDialog>
  );
}
