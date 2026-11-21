"use client";
import { Fragment, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronRight, FilePlus2, FileText, CheckCircle2, BadgeCheck, Undo2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormDialog, Field } from "@/components/app/form-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, Td, Pill, EmptyState, selectClass } from "@/components/app/ui";
import { ShareWaButton } from "@/components/app/share-wa";
import { rupiah, tanggal, jam, bulanWib, namaBulan } from "@/lib/format";
import { cn } from "@/lib/utils";
import { issueInvoice, setPaid } from "./actions";

import type { InvoiceRow, ReadySession } from "@/server/services/invoices";

export type { InvoiceRow, ReadySession };

const pdfUrl = (id: string, download = false) => `/api/invoices/${id}/pdf${download ? "?download=1" : ""}`;

export function ReadyToBill({ sessions, programs }: { sessions: ReadySession[]; programs: { id: string; nama: string; tarif_per_pertemuan: number }[] }) {
  const months = useMemo(() => [...new Set(sessions.map((s) => bulanWib(s.mulai_at)))].sort().reverse(), [sessions]);
  const [month, setMonth] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(sessions.map((s) => s.id)));
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const programMap = useMemo(() => new Map(programs.map((p) => [p.id, p])), [programs]);
  const visible = sessions.filter((s) => !month || bulanWib(s.mulai_at) === month);

  const groups = useMemo(() => {
    const m = new Map<string, ReadySession[]>();
    for (const s of visible) {
      const k = `${s.student_id}|${s.program_id}`;
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()].sort((a, b) => (a[1][0].students?.nama ?? "").localeCompare(b[1][0].students?.nama ?? ""));
  }, [visible]);

  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const n = new Set(prev);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });

  function selectAllMonth() {
    setSelected(new Set(visible.map((s) => s.id)));
    toast.info(`Semua sesi ${month ? namaBulan(month) : ""} dipilih`);
  }

  function terbitkan(key: string, list: ReadySession[]) {
    const ids = list.filter((s) => selected.has(s.id)).map((s) => s.id);
    if (!ids.length) return toast.error("Centang minimal satu sesi");
    const [studentId, programId] = key.split("|");
    setBusyKey(key);
    start(async () => {
      const r = await issueInvoice(studentId, programId, ids);
      setBusyKey(null);
      if (r.ok) {
        toast.success(r.message, {
          action: { label: "Lihat PDF", onClick: () => window.open(pdfUrl(r.id!), "_blank") },
        });
      } else toast.error(r.error);
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-semibold">A. Daftar Siap Tagih</h2>
        <div className="flex gap-2">
          <select className={cn(selectClass, "w-auto")} value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">Semua bulan</option>
            {months.map((m) => <option key={m} value={m}>{namaBulan(m)}</option>)}
          </select>
          <Button variant="outline" onClick={selectAllMonth} disabled={!visible.length}>
            <CheckCircle2 /> Pilih semua {month ? "bulan ini" : ""}
          </Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState title="Tidak ada sesi siap tagih" desc="Sesi berstatus Hadir dan Belum Rekap akan muncul di sini." />
      ) : (
        <DataTable head={["Siswa & Kelas", "Program", "Total Hadir", "Total Tagihan", "Buat Invoice"]}>
          {groups.map(([key, list]) => {
            const prog = programMap.get(list[0].program_id);
            const tarif = prog?.tarif_per_pertemuan ?? 0;
            const chosen = list.filter((s) => selected.has(s.id));
            const isOpen = open === key;
            return (
              <Fragment key={key}>
                <tr>
                  <Td>
                    <button className="flex items-center gap-1 text-left" onClick={() => setOpen(isOpen ? null : key)}>
                      <ChevronRight className={cn("size-4 transition", isOpen && "rotate-90")} />
                      <span><b>{list[0].students?.nama}</b> — {list[0].students?.kelas}</span>
                    </button>
                  </Td>
                  <Td>{prog?.nama}<p className="text-xs text-muted-foreground">{rupiah(tarif)} / pertemuan</p></Td>
                  <Td>{chosen.length} <span className="text-muted-foreground">dari {list.length}</span> Pertemuan</Td>
                  <Td className="font-semibold tabular-nums">{rupiah(chosen.length * tarif)}</Td>
                  <Td>
                    <Button size="sm" disabled={pending || !chosen.length} onClick={() => terbitkan(key, list)}>
                      <FilePlus2 /> {busyKey === key ? "Menerbitkan..." : "Terbitkan"}
                    </Button>
                  </Td>
                </tr>
                {isOpen && (
                  <tr className="bg-muted/30">
                    <td colSpan={5} className="px-4 py-3">
                      <div className="mb-2 flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={chosen.length === list.length}
                          onCheckedChange={(v) => toggle(list.map((s) => s.id), !!v)}
                        />
                        <span>Pilih semua sesi baris ini</span>
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                        {list.map((s) => (
                          <label key={s.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                            <Checkbox checked={selected.has(s.id)} onCheckedChange={(v) => toggle([s.id], !!v)} />
                            <span>{tanggal(s.mulai_at)} • {jam(s.mulai_at)}</span>
                            <span className="ml-auto text-xs text-muted-foreground">{s.profiles?.nama}</span>
                          </label>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </DataTable>
      )}
      <p className="text-xs text-muted-foreground">Klik nama siswa untuk melihat & mencentang sesi. Sesi yang tidak dicentang tetap Belum Rekap.</p>
    </section>
  );
}

function todayWib() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Dialog konfirmasi pembayaran: pilih tanggal bayar, atau batalkan status lunas. */
function PaymentDialog({ inv, onClose }: { inv: InvoiceRow; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [tgl, setTgl] = useState(inv.tgl_bayar ?? todayWib());
  const isLunas = inv.status_bayar === "lunas";
  const run = (lunas: boolean) =>
    start(async () => {
      const r = await setPaid(inv.id, lunas, tgl);
      if (r.ok) { toast.success(`${inv.nomor}: ${r.message}`); onClose(); } else toast.error(r.error);
    });
  return (
    <FormDialog
      title={isLunas ? "Ubah Pembayaran" : "Tandai Lunas"}
      desc={`${inv.nomor} • ${inv.students?.nama} • ${rupiah(inv.total)}`}
      onClose={onClose}
    >
      <Field label="Tanggal pembayaran diterima">
        <Input type="date" value={tgl} max={todayWib()} onChange={(e) => setTgl(e.target.value)} />
      </Field>
      <p className="text-xs text-muted-foreground">Status di nota PDF ikut berubah menjadi LUNAS beserta tanggalnya.</p>
      <div className="flex flex-wrap justify-end gap-2">
        {isLunas && (
          <Button variant="ghost" className="mr-auto text-destructive" disabled={pending} onClick={() => run(false)}>
            <Undo2 /> Batalkan lunas
          </Button>
        )}
        <Button variant="outline" onClick={onClose}>Batal</Button>
        <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={pending || !tgl} onClick={() => run(true)}>
          <BadgeCheck /> {isLunas ? "Simpan tanggal" : "Tandai Lunas"}
        </Button>
      </div>
    </FormDialog>
  );
}

export function InvoiceHistory({ invoices }: { invoices: InvoiceRow[] }) {
  const [filter, setFilter] = useState<"" | "belum_lunas" | "lunas">("");
  const [paying, setPaying] = useState<InvoiceRow | null>(null);
  const rows = invoices.filter((i) => !filter || i.status_bayar === filter);
  const unpaid = invoices.filter((i) => i.status_bayar === "belum_lunas");
  const tabs = [
    { k: "", label: `Semua (${invoices.length})` },
    { k: "belum_lunas", label: `Belum Lunas (${unpaid.length})` },
    { k: "lunas", label: `Lunas (${invoices.length - unpaid.length})` },
  ] as const;

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">B. Riwayat Invoice Terbit</h2>
          {unpaid.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Piutang: <b className="text-red-700">{rupiah(unpaid.reduce((a, i) => a + i.total, 0))}</b> dari {unpaid.length} invoice
            </p>
          )}
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {tabs.map((t) => (
            <button
              key={t.k}
              onClick={() => setFilter(t.k)}
              className={cn("rounded-md px-3 py-1 text-xs font-medium", filter === t.k ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Belum ada invoice" />
      ) : (
        <DataTable head={["No. Invoice", "Tgl Terbit", "Siswa & Kelas", "Rincian", "Total", "Status Bayar", "File Nota"]}>
          {rows.map((inv) => (
            <tr key={inv.id}>
              <Td className="font-semibold whitespace-nowrap">{inv.nomor}</Td>
              <Td className="whitespace-nowrap">{tanggal(inv.tgl_terbit, false)}</Td>
              <Td><b>{inv.students?.nama}</b> ({inv.students?.kelas?.replace("Kelas ", "")})</Td>
              <Td>{inv.jumlah_sesi}x {inv.programs?.nama}</Td>
              <Td className="font-semibold tabular-nums">{rupiah(inv.total)}</Td>
              <Td>
                {inv.status_bayar === "lunas" ? (
                  <div className="space-y-1">
                    <Pill color="green">Lunas</Pill>
                    {inv.tgl_bayar && <p className="text-[11px] text-muted-foreground">{tanggal(inv.tgl_bayar, false)}</p>}
                    <button className="block text-[11px] text-muted-foreground underline hover:text-foreground" onClick={() => setPaying(inv)}>
                      ubah
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Pill color="red">Belum Lunas</Pill>
                    <Button size="xs" className="block bg-emerald-600 hover:bg-emerald-700" onClick={() => setPaying(inv)}>
                      <span className="flex items-center gap-1"><BadgeCheck className="size-3" /> Tandai Lunas</span>
                    </Button>
                  </div>
                )}
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1.5">
                  <a href={pdfUrl(inv.id)} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "sm" })}>
                    <FileText /> Lihat PDF
                  </a>
                  <ShareWaButton
                    fileUrl={pdfUrl(inv.id)}
                    fileName={`${inv.nomor.replaceAll("/", "-")}.pdf`}
                    phone={inv.students?.ortu_wa ?? null}
                    text={`Assalamu'alaikum ${inv.students?.ortu_nama ?? "Bapak/Ibu"}, berikut nota tagihan les ${inv.students?.nama} (${inv.nomor}) sebesar ${rupiah(inv.total)}. Terima kasih.`}
                    label="WA"
                  />
                </div>
              </Td>
            </tr>
          ))}
        </DataTable>
      )}
      {paying && <PaymentDialog inv={paying} onClose={() => setPaying(null)} />}
    </section>
  );
}
