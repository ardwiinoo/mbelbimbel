// Riwayat pencatatan aksi sensitif (invoice, honor): siapa, kapan, melakukan apa.
import { rupiah } from "./format";

export type AuditItem = { at: string; oleh: string | null; aksi: string; detail: Record<string, unknown> | null };

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : 0);

/** Kalimat singkat untuk satu entri riwayat. */
export function auditLabel(aksi: string, d: Record<string, unknown> | null): string {
  switch (aksi) {
    case "invoice_terbit":
      return `Menerbitkan invoice ${str(d?.nomor)} (${num(d?.sesi)} sesi, ${rupiah(num(d?.total))})`;
    case "invoice_lunas":
      return `Menandai lunas${d?.tgl_bayar ? ` (dibayar ${str(d.tgl_bayar)})` : ""}`;
    case "invoice_batal_lunas":
      return "Membatalkan status lunas";
    case "honor_tunjangan":
      return `Mengatur tunjangan ${rupiah(num(d?.tunjangan))}${d?.keterangan ? ` (${str(d.keterangan)})` : ""}`;
    case "honor_lunas":
      return `Menandai honor lunas (${num(d?.sesi)} sesi, ${rupiah(num(d?.total))}${d?.tgl_bayar ? `, transfer ${str(d.tgl_bayar)}` : ""})`;
    case "honor_batal_lunas":
      return "Membatalkan honor lunas";
    default:
      return aksi;
  }
}
