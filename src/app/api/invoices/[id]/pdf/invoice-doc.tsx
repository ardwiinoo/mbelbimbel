import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { rupiah, tanggal, jam } from "@/lib/format";

const BLUE = "#1e3a8a";
const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1f2937" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: BLUE, paddingBottom: 12, marginBottom: 16 },
  brand: { fontSize: 18, fontFamily: "Helvetica-Bold", color: BLUE },
  muted: { color: "#6b7280" },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", color: BLUE, textAlign: "right" },
  row: { flexDirection: "row" },
  box: { flex: 1 },
  label: { fontSize: 8, color: "#6b7280", textTransform: "uppercase", marginBottom: 2 },
  bold: { fontFamily: "Helvetica-Bold" },
  th: { flexDirection: "row", backgroundColor: BLUE, color: "#fff", paddingVertical: 6, paddingHorizontal: 8, fontFamily: "Helvetica-Bold", marginTop: 18 },
  tr: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  c1: { width: 24 }, c2: { flex: 2 }, c3: { flex: 2 }, c4: { flex: 1, textAlign: "right" },
  total: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10, paddingHorizontal: 8 },
  totalBox: { backgroundColor: "#eff6ff", padding: 10, minWidth: 200, flexDirection: "row", justifyContent: "space-between" },
  stamp: { marginTop: 4, alignSelf: "flex-end", paddingVertical: 3, paddingHorizontal: 8, borderRadius: 3, fontFamily: "Helvetica-Bold", fontSize: 9 },
  pay: { marginTop: 28, padding: 12, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 4 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, textAlign: "center", fontSize: 8, color: "#9ca3af" },
});

export type InvoicePdfData = {
  nomor: string; tgl_terbit: string; total: number; status_bayar: string; tgl_bayar: string | null;
  student: { nama: string; kelas: string | null; ortu_nama: string | null; ortu_wa: string | null; alamat: string | null };
  program: string;
  items: { tanggal: string; tarif_snapshot: number }[];
  settings: { nama_bimbel: string; alamat: string | null; rekening: string | null; wa_admin: string | null };
};

export function InvoiceDoc({ d }: { d: InvoicePdfData }) {
  const lunas = d.status_bayar === "lunas";
  return (
    <Document title={d.nomor} author={d.settings.nama_bimbel}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>{d.settings.nama_bimbel}</Text>
            {d.settings.alamat && <Text style={s.muted}>{d.settings.alamat}</Text>}
            {d.settings.wa_admin && <Text style={s.muted}>WA: {d.settings.wa_admin}</Text>}
          </View>
          <View>
            <Text style={s.title}>NOTA TAGIHAN</Text>
            <Text style={{ textAlign: "right", marginTop: 4 }}>{d.nomor}</Text>
            <Text style={[s.muted, { textAlign: "right" }]}>Terbit: {tanggal(d.tgl_terbit)}</Text>
          </View>
        </View>

        <View style={s.row}>
          <View style={s.box}>
            <Text style={s.label}>Ditagihkan kepada</Text>
            <Text style={s.bold}>{d.student.ortu_nama ?? "Orang tua/wali"}</Text>
            {d.student.ortu_wa && <Text>{d.student.ortu_wa}</Text>}
            {d.student.alamat && <Text style={s.muted}>{d.student.alamat}</Text>}
          </View>
          <View style={s.box}>
            <Text style={s.label}>Siswa</Text>
            <Text style={s.bold}>{d.student.nama}</Text>
            <Text>{d.student.kelas ?? ""}</Text>
            <Text style={s.muted}>Program: {d.program}</Text>
          </View>
        </View>

        <View style={s.th}>
          <Text style={s.c1}>No</Text>
          <Text style={s.c2}>Tanggal Sesi</Text>
          <Text style={s.c3}>Program</Text>
          <Text style={s.c4}>Tarif</Text>
        </View>
        {d.items.map((it, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <Text style={s.c1}>{i + 1}</Text>
            <Text style={s.c2}>{tanggal(it.tanggal)} • {jam(it.tanggal)}</Text>
            <Text style={s.c3}>{d.program}</Text>
            <Text style={s.c4}>{rupiah(it.tarif_snapshot)}</Text>
          </View>
        ))}

        <View style={s.total}>
          <View>
            <View style={s.totalBox}>
              <Text style={s.bold}>TOTAL ({d.items.length} pertemuan)</Text>
              <Text style={[s.bold, { color: BLUE }]}>{rupiah(d.total)}</Text>
            </View>
            <Text style={[s.stamp, lunas ? { backgroundColor: "#dcfce7", color: "#166534" } : { backgroundColor: "#fee2e2", color: "#991b1b" }]}>
              {lunas ? `LUNAS${d.tgl_bayar ? " • " + tanggal(d.tgl_bayar, false) : ""}` : "BELUM LUNAS"}
            </Text>
          </View>
        </View>

        <View style={s.pay}>
          <Text style={s.label}>Informasi pembayaran</Text>
          <Text>{d.settings.rekening || "Hubungi admin untuk informasi pembayaran."}</Text>
          <Text style={[s.muted, { marginTop: 4 }]}>Mohon kirim bukti transfer ke WhatsApp admin{d.settings.wa_admin ? ` (${d.settings.wa_admin})` : ""}.</Text>
        </View>

        <Text style={s.footer}>Nota ini dibuat otomatis oleh sistem {d.settings.nama_bimbel}. Terima kasih atas kepercayaan Anda.</Text>
      </Page>
    </Document>
  );
}
