"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BadgeCheck, Download, FileText, History, Receipt, Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/app/action-menu";
import { Input } from "@/components/ui/input";
import { DataTable, Td, EmptyState } from "@/components/app/ui";
import { FormDialog, Field } from "@/components/app/form-dialog";
import { Pager, SearchBox, Toolbar, useClientList } from "@/components/app/table-kit";
import { MonthPicker } from "@/components/app/month-picker";
import { DatePicker } from "@/components/app/date-picker";
import { MapelBadge } from "@/components/app/mapel-badge";
import { ShareWaButton } from "@/components/app/share-wa";
import { confirmDialog } from "@/components/app/confirm";
import { useMapel } from "@/components/app/mapel-context";
import { namaBulan, rupiah, tanggal, tanggalJam } from "@/lib/format";
import { BULAN_PENDEK } from "@/lib/timeline-range";
import { cn } from "@/lib/utils";
import type { HonorInvoiceInfo, HonorRow } from "@/server/services/honor";
import { loadHonorHistory, loadHonorInvoices, saveHonorAdjustment, setHonorPaid } from "./actions";
import { HistoryPanel } from "@/components/app/history-panel";

const todayWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const slipHref = (r: HonorRow, periode: string, download = true) => `/api/honor/${r.tutor_id}/${periode}/pdf${download ? "?download=1" : ""}`;
const periodeShort = (p: string) => `${BULAN_PENDEK[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
const safeName = (n: string) => n.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "tentor";

/** "BCA 1234567890 a.n. Aulia" → "BCA ….890" (nomor lengkap hanya tampil di dialog pembayaran & slip). */
function maskRekening(r: string | null) {
  if (!r) return "-";
  // nomor boleh berpemisah (0857-7777-8888); ambil digitnya, tampilkan 3 digit terakhir
  const m = /\d[\d\s.-]{4,}\d/.exec(r);
  if (!m) return r.length > 18 ? `${r.slice(0, 16)}…` : r;
  const prefix = r.slice(0, m.index).trim();
  return `${prefix ? `${prefix} ` : ""}….${m[0].replace(/\D/g, "").slice(-3)}`;
}

/** Keterangan tunjangan + siapa & kapan mengaturnya (tooltip). */
function tunjanganInfo(r: HonorRow) {
  return [r.tunjangan_ket, r.tunjangan_oleh ? `dicatat oleh ${r.tunjangan_oleh}${r.tunjangan_pada ? ` • ${tanggalJam(r.tunjangan_pada)}` : ""}` : null].filter(Boolean).join(" • ") || undefined;
}

function tarifText(r: Pick<HonorRow, "tarif_min" | "tarif_max">) {
  return r.tarif_min === r.tarif_max ? (r.tarif_min ? rupiah(r.tarif_min) : "-") : `${rupiah(r.tarif_min)} – ${rupiah(r.tarif_max)}`;
}

function StatusBadge({ lunas }: { lunas: boolean }) {
  return (
    <span className={cn("inline-block rounded-md px-2.5 py-1 text-[11px] font-bold tracking-wide whitespace-nowrap text-white uppercase", lunas ? "bg-green-600" : "bg-red-600")}>
      {lunas ? "Lunas" : "Belum dibayar"}
    </span>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "green" | "red" }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tracking-tight tabular-nums", tone === "green" && "text-green-700", tone === "red" && "text-red-700")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function HonorView({ rows, periode, current, canWrite, canEditTutor, canInvoice, meNama }: { rows: HonorRow[]; periode: string; current: string; canWrite: boolean; canEditTutor: boolean; canInvoice: boolean; meNama: string }) {
  const [adjusting, setAdjusting] = useState<HonorRow | null>(null);
  const [paying, setPaying] = useState<HonorRow | null>(null);
  const [inspecting, setInspecting] = useState<HonorRow | null>(null);
  const [history, setHistory] = useState<HonorRow | null>(null);
  const [notifying, setNotifying] = useState(false);
  const [pending, start] = useTransition();
  const { of: mapelOf } = useMapel();
  const list = useClientList(rows, (r) => `${r.nama} ${mapelOf(r.mapel).label} ${r.rekening ?? ""}`);

  const isLunas = (r: HonorRow) => r.slip?.status_bayar === "lunas";
  const total = rows.reduce((a, r) => a + r.total, 0);
  const paid = rows.filter(isLunas).reduce((a, r) => a + r.total, 0);
  const sesi = rows.reduce((a, r) => a + r.sesi, 0);
  const lunasRows = rows.filter(isLunas);

  function unpay(r: HonorRow) {
    start(async () => {
      const ok = await confirmDialog({
        title: `Batalkan lunas honor ${r.nama}?`,
        desc: "Status kembali Belum Dibayar dan sesi bulan itu dibuka lagi supaya bisa dikoreksi. Hitung ulang akan memakai tarif dan rekening terbaru.",
        confirmLabel: "Batalkan lunas",
        tone: "danger",
      });
      if (!ok) return;
      const res = await setHonorPaid({ tutor_id: r.tutor_id, periode, lunas: false });
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }

  const actions = (r: HonorRow) => (
    <div className="flex items-center gap-1.5">
      {canWrite && !isLunas(r) && (
        <Button
          size="sm"
          className="bg-green-600 text-white hover:bg-green-700"
          disabled={r.sesi === 0 || r.tarif_kosong}
          title={r.tarif_kosong ? "Isi tarif honor di menu Tentor & Tarif" : r.sesi === 0 ? "Belum ada sesi yang terekap" : undefined}
          onClick={() => setPaying(r)}
        >
          <BadgeCheck /> Tandai Lunas
        </Button>
      )}
      <ActionMenu
        items={[
          { label: "Lihat Slip", icon: <FileText />, href: slipHref(r, periode, false), newTab: true },
          { label: "Unduh Slip PDF", icon: <Download />, href: slipHref(r, periode) },
          { label: "Lihat Invoice", icon: <Receipt />, hidden: !canInvoice || r.sesi === 0, onClick: () => setInspecting(r) },
          { label: "Riwayat", icon: <History />, hidden: !r.slip, onClick: () => setHistory(r) },
          { label: "Batalkan Lunas", icon: <Undo2 />, danger: true, separator: true, hidden: !(canWrite && isLunas(r)), disabled: pending, onClick: () => unpay(r) },
        ]}
      />
    </div>
  );

  const statusCell = (r: HonorRow) => (
    <div className="space-y-1">
      <StatusBadge lunas={isLunas(r)} />
      {isLunas(r) && r.slip?.tgl_bayar && <p className="text-xs text-muted-foreground">{tanggal(`${r.slip.tgl_bayar}T12:00:00+07:00`, false)}</p>}
      {isLunas(r) && <p className="text-xs text-muted-foreground">dicatat oleh {r.dicatat?.oleh ?? "–"}</p>}
      {isLunas(r) && r.sesi_baru > 0 && <p className="text-xs font-medium text-amber-700">+{r.sesi_baru} sesi baru setelah dibayar</p>}
      {!isLunas(r) && r.sesi === 0 && !r.tarif_kosong && <p className="text-xs text-muted-foreground">Belum ada sesi terekap bulan ini, belum bisa dilunasi.</p>}
      {r.tarif_kosong && (
        <p className="text-xs font-medium text-amber-700">
          Tarif belum diisi
          {canEditTutor && (
            <>
              {" "}
              · <Link href="/tentor" className="underline">isi</Link>
            </>
          )}
        </p>
      )}
    </div>
  );

  const totalCell = (r: HonorRow) => (
    <div>
      <p className="font-semibold tabular-nums">{rupiah(r.total)}</p>
      {r.tunjangan > 0 ? (
        canWrite && !isLunas(r) ? (
          <button type="button" onClick={() => setAdjusting(r)} className="text-xs text-muted-foreground underline-offset-2 hover:underline" title={tunjanganInfo(r)}>
            incl. tunjangan {rupiah(r.tunjangan)}
          </button>
        ) : (
          <p className="text-xs text-muted-foreground" title={tunjanganInfo(r)}>incl. tunjangan {rupiah(r.tunjangan)}</p>
        )
      ) : (
        canWrite && !isLunas(r) && (
          <button type="button" onClick={() => setAdjusting(r)} className="text-xs text-blue-700 underline-offset-2 hover:underline">
            + Tunjangan
          </button>
        )
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Total honor ${namaBulan(periode)}`} value={rupiah(total)} sub={`${sesi} sesi terekap`} />
        <Stat label="Sudah dibayar" value={rupiah(paid)} tone="green" />
        <Stat label="Belum dibayar" value={rupiah(total - paid)} tone="red" />
        <Stat label="Tentor" value={String(rows.length)} />
      </div>

      <Toolbar>
        <SearchBox value={list.q} onChange={list.setQ} placeholder="Cari tentor, mapel, rekening…" />
        <MonthPicker value={periode} current={current} />
      </Toolbar>

      {list.total === 0 ? (
        <EmptyState title={rows.length ? "Tidak ditemukan" : "Belum ada tentor"} desc={rows.length ? undefined : "Tambahkan akun tentor di menu Pengguna & Akses."} />
      ) : (
        <>
          <div>
            <DataTable head={["No", "Periode", "Nama Tentor & Mapel", "Total Sesi Terekap (✓)", "Honor / Sesi", "Total Honor", "Rekening", "Status", "Aksi"]}>
              {list.rows.map((r, i) => (
                <tr key={r.tutor_id}>
                  <Td className="text-muted-foreground tabular-nums">{(list.page - 1) * list.pageSize + i + 1}</Td>
                  <Td className="whitespace-nowrap">{periodeShort(periode)}</Td>
                  <Td className="min-w-44">
                    <p className="font-semibold">
                      {r.nama}
                      {!r.aktif && <span className="ml-1 text-xs font-normal text-muted-foreground">(nonaktif)</span>}
                    </p>
                    <MapelBadge mapel={r.mapel} className="mt-1" />
                  </Td>
                  <Td className="text-center tabular-nums">{r.sesi}</Td>
                  <Td className="whitespace-nowrap tabular-nums">{tarifText(r)}</Td>
                  <Td className="min-w-36">{totalCell(r)}</Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{maskRekening(r.rekening)}</Td>
                  <Td className="min-w-40">{statusCell(r)}</Td>
                  <Td>{actions(r)}</Td>
                </tr>
              ))}
            </DataTable>
          </div>
        </>
      )}
      <Pager page={list.page} pages={list.pages} total={list.total} pageSize={list.pageSize} onPage={list.setPage} />

      {canWrite && (
        <div className="max-w-md rounded-xl border bg-card p-5">
          <h2 className="text-base font-semibold">Konfirmasi Transfer Gaji</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Setelah honor ditransfer, beri tahu tentor lewat WhatsApp lengkap dengan slip PDF-nya.
          </p>
          <Button className="mt-4 bg-green-600 text-white hover:bg-green-700" disabled={!lunasRows.length} onClick={() => setNotifying(true)}>
            <Send /> Kirim Notifikasi Gaji ke Tentor via WA
          </Button>
          {!lunasRows.length && <p className="mt-2 text-xs text-muted-foreground">Belum ada honor berstatus lunas pada {namaBulan(periode)}.</p>}
        </div>
      )}

      {adjusting && <AdjustDialog row={adjusting} periode={periode} onClose={() => setAdjusting(null)} />}
      {paying && (
        <PayDialog
          row={paying}
          periode={periode}
          meNama={meNama}
          onInspect={
            canInvoice
              ? () => {
                  setInspecting(paying);
                  setPaying(null);
                }
              : undefined
          }
          onClose={() => setPaying(null)}
        />
      )}
      {inspecting && (
        <InvoicesDialog
          row={inspecting}
          periode={periode}
          canPay={canWrite && !isLunas(inspecting) && inspecting.sesi > 0 && !inspecting.tarif_kosong}
          onPay={() => {
            setPaying(inspecting);
            setInspecting(null);
          }}
          onClose={() => setInspecting(null)}
        />
      )}
      {history && <HistoryDialog row={history} periode={periode} onClose={() => setHistory(null)} />}
      {notifying && <NotifyDialog rows={lunasRows} periode={periode} onClose={() => setNotifying(false)} />}
    </div>
  );
}

function Summary({ row, tunjangan }: { row: HonorRow; tunjangan: number }) {
  return (
    <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground">{row.sesi} sesi × {tarifText(row)}</span>
        <span className="tabular-nums">{rupiah(row.subtotal)}</span>
      </div>
      <div className="flex justify-between"><span className="text-muted-foreground">Tunjangan / bonus</span><span className="tabular-nums">{rupiah(tunjangan)}</span></div>
      <div className="flex justify-between border-t pt-1 font-semibold"><span>Total honor</span><span className="tabular-nums">{rupiah(row.subtotal + tunjangan)}</span></div>
    </div>
  );
}

function AdjustDialog({ row, periode, onClose }: { row: HonorRow; periode: string; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [tunj, setTunj] = useState(String(row.tunjangan || ""));
  const [ket, setKet] = useState(row.tunjangan_ket ?? "");
  return (
    <FormDialog title="Tunjangan / Bonus" desc={`${row.nama} • ${namaBulan(periode)}`} onClose={onClose}>
      <Field label="Tunjangan transport / bonus (Rp)" hint="Kosongkan atau 0 bila tidak ada.">
        <Input type="number" min={0} step={1000} value={tunj} onChange={(e) => setTunj(e.target.value)} />
      </Field>
      <Field label="Keterangan (opsional)">
        <Input maxLength={200} placeholder="mis. Transport lokasi jauh" value={ket} onChange={(e) => setKet(e.target.value)} />
      </Field>
      <Summary row={row} tunjangan={Math.max(0, Number(tunj) || 0)} />
      {row.tunjangan_oleh && (
        <p className="text-xs text-muted-foreground">
          Terakhir diatur oleh <b className="text-foreground">{row.tunjangan_oleh}</b>
          {row.tunjangan_pada ? ` • ${tanggalJam(row.tunjangan_pada)}` : ""}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Batal</Button>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveHonorAdjustment({ tutor_id: row.tutor_id, periode, tunjangan: Number(tunj) || 0, catatan: ket });
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

function PayDialog({ row, periode, meNama, onInspect, onClose }: { row: HonorRow; periode: string; meNama: string; onInspect?: () => void; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [tgl, setTgl] = useState(todayWib);
  return (
    <FormDialog title="Tandai Honor Lunas" desc={`${row.nama} • ${namaBulan(periode)}`} onClose={onClose}>
      <Field label="Tanggal transfer">
        <DatePicker value={tgl} max={todayWib()} onChange={setTgl} />
      </Field>
      <Summary row={row} tunjangan={row.tunjangan} />
      <p className="text-sm">
        <span className="text-muted-foreground">Transfer ke:</span> {row.rekening ?? <span className="text-amber-700">rekening belum diisi (menu Tentor & Tarif)</span>}
      </p>
      <p className="text-xs text-muted-foreground">
        Pencatatan ini atas nama <b className="text-foreground">{meNama}</b> dan tersimpan di riwayat.
      </p>
      {onInspect && (
        <button type="button" onClick={onInspect} className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline">
          Cek invoice terkait sebelum menandai lunas →
        </button>
      )}
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
        Setelah lunas, <b>{row.sesi} sesi</b> bulan ini dikunci (tidak bisa diedit atau diubah kehadirannya) dan tarif tiap sesi serta rekening disimpan di slip. Bisa dibatalkan bila perlu koreksi.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Batal</Button>
        <Button
          className="bg-green-600 text-white hover:bg-green-700"
          disabled={pending || !tgl}
          onClick={() =>
            start(async () => {
              const r = await setHonorPaid({ tutor_id: row.tutor_id, periode, lunas: true, tgl_bayar: tgl });
              if (r.ok) { toast.success(r.message); onClose(); } else toast.error(r.error);
            })
          }
        >
          {pending ? "Menyimpan..." : "Tandai Lunas"}
        </Button>
      </div>
    </FormDialog>
  );
}

/** WhatsApp tidak mengizinkan kirim massal tanpa API berbayar, jadi tiap tentor satu ketukan (slip PDF ikut terlampir di HP). */
function NotifyDialog({ rows, periode, onClose }: { rows: HonorRow[]; periode: string; onClose: () => void }) {
  return (
    <FormDialog title="Kirim Notifikasi Gaji via WhatsApp" desc={`Honor ${namaBulan(periode)} yang sudah lunas`} onClose={onClose}>
      <p className="text-xs text-muted-foreground">
        Ketuk <b>Kirim WA</b> pada tiap tentor. Di HP, slip PDF langsung terlampir; di komputer slip terunduh lalu chat WhatsApp dibuka untuk dilampirkan manual.
      </p>
      <ul className="divide-y rounded-lg border">
        {rows.map((r) => {
          const tgl = r.slip?.tgl_bayar ? tanggal(`${r.slip.tgl_bayar}T12:00:00+07:00`, false) : "";
          const text = `Halo Kak ${r.nama}, honor mengajar periode ${namaBulan(periode)} sebesar ${rupiah(r.total)} (${r.sesi} sesi) sudah ditransfer${r.rekening ? ` ke ${maskRekening(r.rekening)}` : ""}${tgl ? ` pada ${tgl}` : ""}. Slip honor terlampir. Terima kasih atas kerja samanya 🙏`;
          return (
            <li key={r.tutor_id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.nama}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {rupiah(r.total)} • {r.sesi} sesi{!r.no_wa && <span className="text-amber-700"> • No. WA belum diisi</span>}
                </p>
              </div>
              <ShareWaButton fileUrl={slipHref(r, periode, false)} fileName={`Slip-Honor-${safeName(r.nama)}-${periode}.pdf`} phone={r.no_wa} text={text} label="Kirim WA" />
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>Tutup</Button>
      </div>
    </FormDialog>
  );
}

/** Invoice yang memuat sesi tentor ini — cek penagihan sebelum honor ditandai lunas. */
function InvoicesDialog({ row, periode, canPay, onPay, onClose }: { row: HonorRow; periode: string; canPay: boolean; onPay: () => void; onClose: () => void }) {
  const [state, setState] = useState<{ data?: HonorInvoiceInfo; error?: string } | null>(null);
  useEffect(() => {
    let stale = false;
    loadHonorInvoices({ tutor_id: row.tutor_id, periode }).then((r) => {
      if (!stale) setState(r.ok ? { data: r.data } : { error: r.error });
    });
    return () => {
      stale = true;
    };
  }, [row.tutor_id, periode]);
  const d = state?.data;
  return (
    <FormDialog title="Invoice Terkait" desc={`${row.nama} • ${namaBulan(periode)}`} onClose={onClose} wide>
      {!state && <p className="py-6 text-center text-sm text-muted-foreground">Memuat invoice…</p>}
      {state?.error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
      {d && (
        <>
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full border bg-muted/50 px-2.5 py-1">{d.sesi_total} sesi terekap</span>
            <span className="rounded-full border border-green-300 bg-green-50 px-2.5 py-1 text-green-800">{d.sesi_ditagih} sudah masuk invoice</span>
            <span className={cn("rounded-full border px-2.5 py-1", d.sesi_belum_ditagih ? "border-amber-300 bg-amber-50 text-amber-900" : "bg-muted/50")}>{d.sesi_belum_ditagih} belum ditagih</span>
          </div>
          {!d.invoices.length ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Belum ada invoice yang memuat sesi tentor ini pada periode ini.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {d.invoices.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {i.nomor} <span className="font-normal text-muted-foreground">• {i.siswa}{i.kelas ? ` (${i.kelas})` : ""}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {i.program} • {i.sesi_tentor} dari {i.jumlah_sesi} sesi invoice • terbit {tanggal(i.tgl_terbit, false)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">{rupiah(i.total)}</span>
                    <StatusBadge lunas={i.status_bayar === "lunas"} />
                    <a href={`/api/invoices/${i.id}/pdf`} target="_blank" rel="noopener" className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline">
                      Lihat nota
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {d.sesi_belum_ditagih > 0 && <p className="text-xs text-amber-800">Ada sesi yang belum ditagihkan ke siswa; menu Invoice → Daftar Siap Tagih.</p>}
        </>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Tutup</Button>
        {canPay && (
          <Button className="bg-green-600 text-white hover:bg-green-700" onClick={onPay}>
            Lanjut Tandai Lunas
          </Button>
        )}
      </div>
    </FormDialog>
  );
}

function HistoryDialog({ row, periode, onClose }: { row: HonorRow; periode: string; onClose: () => void }) {
  return (
    <FormDialog title="Riwayat Pencatatan" desc={`${row.nama} • ${namaBulan(periode)}`} onClose={onClose}>
      <HistoryPanel load={() => loadHonorHistory({ tutor_id: row.tutor_id, periode }).then((r) => (r.ok ? r.data : []))} />
      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>Tutup</Button>
      </div>
    </FormDialog>
  );
}
