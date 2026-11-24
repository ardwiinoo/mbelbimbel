"use client";
// Riwayat pencatatan aksi sensitif (invoice, honor): siapa, kapan, melakukan apa — terbaru dulu.
import { useEffect, useState } from "react";
import { auditLabel, type AuditItem } from "@/lib/audit-label";
import { tanggalJam } from "@/lib/format";

export function HistoryPanel({ load }: { load: () => Promise<AuditItem[]> }) {
  const [items, setItems] = useState<AuditItem[] | null>(null);
  useEffect(() => {
    let stale = false;
    load()
      .then((r) => !stale && setItems(r))
      .catch(() => !stale && setItems([]));
    return () => {
      stale = true;
    };
    // load dibuat ulang tiap render induk; riwayat cukup dimuat sekali saat dialog dibuka
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!items) return <p className="text-xs text-muted-foreground">Memuat riwayat…</p>;
  if (!items.length) return <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Belum ada catatan.</p>;
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {items.map((i) => (
        <li key={`${i.at}-${i.aksi}`} className="px-3 py-2">
          <p>{auditLabel(i.aksi, i.detail)}</p>
          <p className="text-xs text-muted-foreground">
            {tanggalJam(i.at)} • dicatat oleh <b className="font-medium text-foreground">{i.oleh ?? "(akun dihapus)"}</b>
          </p>
        </li>
      ))}
    </ul>
  );
}
