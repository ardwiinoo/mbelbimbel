"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Td, EmptyState, Pill } from "@/components/app/ui";
import { confirmDialog } from "@/components/app/confirm";
import { tanggalJam } from "@/lib/format";
import type { DeletedStudentRow } from "@/server/services/students";
import { restoreStudent } from "./actions";

function Related({ r }: { r: DeletedStudentRow }) {
  const items: { text: string; color: "green" | "amber" | "gray" | "blue" }[] = [];
  if (r.sesi_hadir) items.push({ text: `${r.sesi_hadir} sesi Hadir`, color: "blue" });
  if (r.sesi_dibebaskan) items.push({ text: `${r.sesi_dibebaskan} tagihan dibebaskan`, color: "gray" });
  if (r.invoice_lunas) items.push({ text: `${r.invoice_lunas} invoice lunas`, color: "green" });
  if (r.invoice_belum_lunas) items.push({ text: `${r.invoice_belum_lunas} invoice belum lunas`, color: "amber" });
  if (r.sesi_batal_otomatis) items.push({ text: `${r.sesi_batal_otomatis} sesi dibatalkan otomatis`, color: "gray" });
  if (!items.length) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((i) => (
        <Pill key={i.text} color={i.color}>{i.text}</Pill>
      ))}
    </div>
  );
}

export function DeletedView({ rows }: { rows: DeletedStudentRow[] }) {
  const [pending, start] = useTransition();

  function restore(r: DeletedStudentRow) {
    start(async () => {
      const ok = await confirmDialog({
        title: `Pulihkan ${r.nama}?`,
        desc: "Siswa aktif kembali di Data Siswa. Sesi terjadwal yang dibatalkan otomatis dan jamnya belum lewat dikembalikan ke terjadwal. Data lain tidak berubah.",
        confirmLabel: "Pulihkan",
      });
      if (!ok) return;
      const res = await restoreStudent(r.id);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }

  if (!rows.length) return <EmptyState title="Tidak ada data terhapus" desc="Siswa yang dihapus admin akan muncul di sini." />;
  return (
    <DataTable head={["Siswa & Kelas", "Program", "Dihapus", "Data terkait", "Aksi"]}>
      {rows.map((r) => (
        <tr key={r.id}>
          <Td>
            <p className="font-semibold">{r.nama}</p>
            <p className="text-xs text-muted-foreground">{r.kelas ?? "-"}</p>
          </Td>
          <Td>{r.programs.length ? r.programs.join(", ") : "-"}</Td>
          <Td className="whitespace-nowrap">
            <p>{tanggalJam(r.deleted_at)}</p>
            <p className="text-xs text-muted-foreground">oleh {r.deleted_by ?? "-"}</p>
          </Td>
          <Td><Related r={r} /></Td>
          <Td>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => restore(r)}>
              <ArchiveRestore /> Pulihkan
            </Button>
          </Td>
        </tr>
      ))}
    </DataTable>
  );
}
