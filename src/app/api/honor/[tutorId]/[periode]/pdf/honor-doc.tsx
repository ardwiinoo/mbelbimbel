import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { PdfHeader, LINE, s, tanggalPanjang } from "@/components/pdf/pdf-kit";
import { rupiah, namaBulan, siswaLabel } from "@/lib/format";
import { BULAN_PENDEK } from "@/lib/timeline-range";
import type { HonorPdfData, HonorPdfItem } from "@/server/services/honor";

// Susunan mengikuti contoh dari klien: kop + judul, "Dibayarkan kepada" & status, tabel per siswa,
// ringkasan total, lalu blok tanda tangan (gambar hanya bila penandatangan mengunggahnya).

/** "2, 9, 16, 23 Nov 2026" — semua tanggal pada satu periode (satu bulan). */
function tanggalMengajar(days: string[]) {
  const [y, m] = days[0].split("-").map(Number);
  return `${days.map((d) => Number(d.slice(8))).join(", ")} ${BULAN_PENDEK[m - 1]} ${y}`;
}

const w = { no: 26, sesi: 44, tarif: 74, sub: 82 };

function Row({ it, no }: { it: HonorPdfItem; no: number }) {
  return (
    <View style={s.tr} wrap={false}>
      <Text style={[s.cell, { width: w.no }]}>{no}</Text>
      <View style={[s.cell, { flex: 2.1 }]}>
        <Text style={s.bold}>
          {siswaLabel({ nama: it.siswa, panggilan: it.panggilan })}
          {it.kelas ? <Text style={s.muted}> ({it.kelas})</Text> : null}
        </Text>
        <Text style={s.small}>{it.program}</Text>
      </View>
      <Text style={[s.cell, { flex: 2.2 }]}>{tanggalMengajar(it.tanggal)}</Text>
      <Text style={[s.cell, s.center, { width: w.sesi }]}>{it.sesi} Sesi</Text>
      <Text style={[s.cell, s.right, { width: w.tarif }]}>{rupiah(it.tarif)}</Text>
      <Text style={[s.cell, s.right, s.bold, { width: w.sub, paddingRight: 0 }]}>{rupiah(it.subtotal)}</Text>
    </View>
  );
}

export function HonorDoc({ d }: { d: HonorPdfData }) {
  const lunas = d.status_bayar === "lunas";
  const b = d.branding;
  const kota = b.kota ? `${b.kota}, ` : "";
  return (
    <Document title={`Slip Honor ${d.tutor.nama} ${d.periode}`} author={b.nama_bimbel}>
      <Page size="A4" style={s.page}>
        <PdfHeader b={b} title="SLIP HONOR TENTOR" lines={[`Periode: ${namaBulan(d.periode)}`, `No. Slip: ${d.nomor ?? "DRAF (belum dibayar)"}`]} />

        <View style={s.row}>
          <View style={s.col}>
            <Text style={[s.bold, { marginBottom: 4 }]}>DIBAYARKAN KEPADA:</Text>
            <Text>Nama Tentor: {d.tutor.nama}</Text>
            <Text>Bidang / Mapel: {d.tutor.mapel_label}</Text>
            <Text>Rekening: {d.tutor.rekening || "-"}</Text>
          </View>
          <View style={s.col}>
            <Text style={[s.bold, { marginBottom: 4 }]}>STATUS PEMBAYARAN:</Text>
            <Text style={[s.stamp, lunas ? { backgroundColor: "#16a34a", color: "#fff" } : { backgroundColor: "#dc2626", color: "#fff" }]}>{lunas ? "LUNAS / DITRANSFER" : "BELUM DIBAYAR"}</Text>
            {lunas && d.tgl_bayar && <Text style={{ marginTop: 5 }}>Tanggal Transfer: {tanggalPanjang(d.tgl_bayar)}</Text>}
          </View>
        </View>

        <View style={s.th}>
          <Text style={[s.cell, { width: w.no }]}>No</Text>
          <Text style={[s.cell, { flex: 2.1 }]}>Nama Siswa & Kelas</Text>
          <Text style={[s.cell, { flex: 2.2 }]}>Tanggal Mengajar (Terekap)</Text>
          <Text style={[s.cell, s.center, { width: w.sesi }]}>Jml Sesi</Text>
          <Text style={[s.cell, s.right, { width: w.tarif }]}>Honor / Sesi</Text>
          <Text style={[s.cell, s.right, { width: w.sub, paddingRight: 0 }]}>Subtotal</Text>
        </View>
        {d.items.map((it, i) => (
          <Row key={`${it.siswa}-${it.program}-${it.tarif}`} it={it} no={i + 1} />
        ))}
        {!d.items.length && (
          <View style={s.tr}>
            <Text style={s.muted}>Belum ada sesi terekap pada periode ini.</Text>
          </View>
        )}

        <View wrap={false} style={{ alignSelf: "flex-end", width: 270, marginTop: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
            <Text>Total Sesi Mengajar:</Text>
            <Text>{d.sesi} Sesi</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2, marginBottom: 6 }}>
            <Text style={{ flex: 1, paddingRight: 8 }}>Tunjangan / Bonus{d.tunjangan_ket ? ` (${d.tunjangan_ket})` : ""}:</Text>
            <Text>{rupiah(d.tunjangan)}</Text>
          </View>
          <View style={s.totalBar}>
            <Text>TOTAL HONOR DITERIMA:</Text>
            <Text>{rupiah(d.total)}</Text>
          </View>
        </View>

        {d.signer && (
          <View wrap={false} style={{ alignSelf: "flex-end", width: 200, marginTop: 28, alignItems: "center" }}>
            <Text>{kota}{tanggalPanjang(d.tgl_ttd)}</Text>
            <Text>Admin {b.nama_bimbel}</Text>
            {d.signer.ttd ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- Image react-pdf, bukan <img> HTML
              <Image src={{ data: d.signer.ttd.data, format: d.signer.ttd.format }} style={{ width: 120, height: 52, objectFit: "contain", marginVertical: 6 }} />
            ) : (
              <View style={{ height: 56 }} />
            )}
            <Text style={[s.bold, { borderTopWidth: 1, borderTopColor: LINE, paddingTop: 3 }]}>{d.signer.nama}</Text>
          </View>
        )}

        <Text style={{ marginTop: 22, fontSize: 8.5, color: "#6b7280" }}>
          Dihitung otomatis berdasarkan sesi berstatus Terekap pada sistem {b.nama_bimbel}.
          {lunas ? "" : " Slip ini masih draf: angka dapat berubah sampai honor ditandai lunas."}
        </Text>

        <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `${b.nama_bimbel} • Slip honor ${d.tutor.nama} • Halaman ${pageNumber}/${totalPages}`} />
      </Page>
    </Document>
  );
}
