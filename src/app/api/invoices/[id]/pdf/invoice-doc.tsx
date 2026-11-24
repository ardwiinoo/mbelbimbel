import { Document, Page, Text, View } from "@react-pdf/renderer";
import { PdfHeader, s } from "@/components/pdf/pdf-kit";
import { rupiah, tanggal, jam } from "@/lib/format";
import type { Branding } from "@/server/pdf-branding";

export type InvoicePdfData = {
  nomor: string;
  tgl_terbit: string;
  total: number;
  status_bayar: string;
  tgl_bayar: string | null;
  student: { nama: string; kelas: string | null; ortu_nama: string | null; ortu_wa: string | null; alamat: string | null };
  program: string;
  items: { tanggal: string; tarif_snapshot: number }[];
  branding: Branding;
};

const w = { no: 26, tarif: 86 };

export function InvoiceDoc({ d }: { d: InvoicePdfData }) {
  const lunas = d.status_bayar === "lunas";
  const b = d.branding;
  return (
    <Document title={d.nomor} author={b.nama_bimbel}>
      <Page size="A4" style={s.page}>
        <PdfHeader b={b} title="NOTA TAGIHAN" lines={[d.nomor, `Terbit: ${tanggal(d.tgl_terbit)}`]} />

        <View style={s.row}>
          <View style={s.col}>
            <Text style={s.label}>Ditagihkan kepada</Text>
            <Text style={s.bold}>{d.student.ortu_nama ?? "Orang tua/wali"}</Text>
            {d.student.ortu_wa && <Text>{d.student.ortu_wa}</Text>}
            {d.student.alamat && <Text style={s.small}>{d.student.alamat}</Text>}
          </View>
          <View style={s.col}>
            <Text style={s.label}>Siswa</Text>
            <Text style={s.bold}>{d.student.nama}</Text>
            {d.student.kelas && <Text>{d.student.kelas}</Text>}
            <Text style={s.small}>Program: {d.program}</Text>
          </View>
        </View>

        <View style={s.th}>
          <Text style={[s.cell, { width: w.no }]}>No</Text>
          <Text style={[s.cell, { flex: 2 }]}>Tanggal Sesi</Text>
          <Text style={[s.cell, { flex: 2 }]}>Program</Text>
          <Text style={[s.cell, s.right, { width: w.tarif, paddingRight: 0 }]}>Tarif</Text>
        </View>
        {d.items.map((it, i) => (
          <View key={`${it.tanggal}-${i}`} style={s.tr} wrap={false}>
            <Text style={[s.cell, { width: w.no }]}>{i + 1}</Text>
            <Text style={[s.cell, { flex: 2 }]}>
              {tanggal(it.tanggal)} • {jam(it.tanggal)}
            </Text>
            <Text style={[s.cell, { flex: 2 }]}>{d.program}</Text>
            <Text style={[s.cell, s.right, { width: w.tarif, paddingRight: 0 }]}>{rupiah(it.tarif_snapshot)}</Text>
          </View>
        ))}

        <View wrap={false} style={{ alignSelf: "flex-end", width: 270, marginTop: 14 }}>
          <View style={s.totalBar}>
            <Text>TOTAL ({d.items.length} pertemuan)</Text>
            <Text>{rupiah(d.total)}</Text>
          </View>
          <Text style={[s.stamp, { marginTop: 7, alignSelf: "flex-end" }, lunas ? { backgroundColor: "#dcfce7", color: "#166534" } : { backgroundColor: "#fee2e2", color: "#991b1b" }]}>
            {lunas ? `LUNAS${d.tgl_bayar ? ` • ${tanggal(`${d.tgl_bayar}T12:00:00+07:00`, false)}` : ""}` : "BELUM LUNAS"}
          </Text>
        </View>

        <View style={[s.box, { marginTop: 26 }]} wrap={false}>
          <Text style={s.label}>Informasi pembayaran</Text>
          <Text>{b.rekening || "Hubungi admin untuk informasi pembayaran."}</Text>
          <Text style={[s.small, { marginTop: 5 }]}>Mohon kirim bukti transfer ke WhatsApp admin{b.wa_admin ? ` (${b.wa_admin})` : ""}.</Text>
        </View>

        <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `Nota ini dibuat otomatis oleh sistem ${b.nama_bimbel}. Terima kasih atas kepercayaan Anda. • Halaman ${pageNumber}/${totalPages}`} />
      </Page>
    </Document>
  );
}
