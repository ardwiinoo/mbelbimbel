// Kit gaya bersama untuk semua PDF buatan sistem (nota tagihan, slip honor).
// Satu tempat untuk ukuran font, jarak, dan kop agar tampilan konsisten dan teks panjang
// (alamat, nama program) membungkus di kolomnya sendiri, tidak menabrak kolom sebelahnya.
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Branding } from "@/server/pdf-branding";
import { BULAN_NAMA } from "@/lib/timeline-range";

export const BLUE = "#1e3a8a";
export const INK = "#1f2937";
export const MUTED = "#6b7280";
export const LINE = "#e5e7eb";

/** Skala tipografi: isi 10pt, tabel 9.5pt, label 8pt; jarak antarbaris 1.4 agar mudah dibaca. */
export const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 60, paddingHorizontal: 40, fontSize: 10, fontFamily: "Helvetica", color: INK, lineHeight: 1.4 },
  // kop
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: BLUE, paddingBottom: 12, marginBottom: 18 },
  brandRow: { flex: 1, flexDirection: "row", alignItems: "flex-start", paddingRight: 18 },
  logo: { width: 54, height: 54, objectFit: "contain", marginRight: 10 },
  brandText: { flex: 1 },
  brand: { fontSize: 17, fontFamily: "Helvetica-Bold", color: BLUE, lineHeight: 1.25 },
  tagline: { fontSize: 9.5, color: INK, marginTop: 1 },
  addr: { fontSize: 8.5, color: MUTED, marginTop: 3 },
  titleBox: { width: 196, alignItems: "flex-end" },
  title: { fontSize: 17, fontFamily: "Helvetica-Bold", color: BLUE, textAlign: "right", lineHeight: 1.25 },
  titleLine: { fontSize: 9.5, textAlign: "right", marginTop: 2 },
  // blok isi
  row: { flexDirection: "row" },
  col: { flex: 1, minWidth: 0, paddingRight: 14 },
  label: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: MUTED },
  small: { fontSize: 8.5, color: MUTED },
  // tabel
  th: { flexDirection: "row", alignItems: "center", backgroundColor: BLUE, color: "#fff", paddingVertical: 7, paddingHorizontal: 8, fontFamily: "Helvetica-Bold", fontSize: 9, marginTop: 18 },
  tr: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: LINE, fontSize: 9.5 },
  cell: { minWidth: 0, paddingRight: 6 },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
  // ringkasan
  totalBar: { backgroundColor: BLUE, color: "#fff", paddingVertical: 8, paddingHorizontal: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", fontFamily: "Helvetica-Bold" },
  stamp: { alignSelf: "flex-start", paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10, fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  box: { padding: 11, borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  footer: { position: "absolute", bottom: 26, left: 40, right: 40, textAlign: "center", fontSize: 8, color: "#9ca3af" },
});

/** Kop: logo + nama + tagline + alamat di kiri (membungkus), judul dokumen di kanan (lebar tetap). */
export function PdfHeader({ b, title, lines }: { b: Branding; title: string; lines: string[] }) {
  return (
    <View style={s.header}>
      <View style={s.brandRow}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- Image react-pdf, bukan <img> HTML */}
        {b.logo && <Image src={{ data: b.logo.data, format: b.logo.format }} style={s.logo} />}
        <View style={s.brandText}>
          <Text style={s.brand}>{b.nama_bimbel}</Text>
          {b.tagline && <Text style={s.tagline}>{b.tagline}</Text>}
          {b.alamat && <Text style={s.addr}>{b.alamat}</Text>}
          {b.wa_admin && <Text style={s.addr}>WA: {b.wa_admin}</Text>}
        </View>
      </View>
      <View style={s.titleBox}>
        <Text style={s.title}>{title}</Text>
        {lines.map((l) => (
          <Text key={l} style={s.titleLine}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** "2026-11-30" → "30 November 2026" */
export function tanggalPanjang(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d} ${BULAN_NAMA[m - 1]} ${y}`;
}
