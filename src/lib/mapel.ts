// Kategori mapel (warna, kelompok tentor di Jadwal, tarif honor khusus). Daftar sebenarnya disimpan di DB
// (tabel mapel_categories) sehingga admin bisa menambah/mengubah; modul ini hanya tipe & utilitas murni.
// Aman diimpor dari server maupun client.

/** Kunci kategori (slug, mis. "calistung"). Tetap setelah dibuat karena dipakai sebagai rujukan. */
export type MapelKey = string;

export type MapelCat = { key: MapelKey; label: string; short: string; bg: string; dot: string; urut: number; aktif: boolean };

/** Kategori cadangan: selalu ada, dipakai bila kunci tidak dikenal / belum diatur. */
export const FALLBACK_KEY = "lainnya";
export const NEUTRAL: MapelCat = { key: FALLBACK_KEY, label: "IPS / Program Lainnya", short: "Lainnya", bg: "#F1F5F9", dot: "#475569", urut: 999, aktif: true };

/** Warna disimpan #RRGGBB (divalidasi karena langsung dipakai di CSS). */
export const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Cari kategori; kunci kosong/tidak dikenal jatuh ke "lainnya" (tidak pernah undefined). */
export function findMapel(list: MapelCat[], key: string | null | undefined): MapelCat {
  return list.find((m) => m.key === (key ?? FALLBACK_KEY)) ?? list.find((m) => m.key === FALLBACK_KEY) ?? NEUTRAL;
}

/** Pasangan warna siap pakai di dialog kategori: latar pastel + warna titik/tepi satu tingkat lebih pekat. */
export const COLOR_PRESETS: { bg: string; dot: string }[] = [
  { bg: "#DCFCE7", dot: "#16A34A" },
  { bg: "#FEF9C3", dot: "#CA8A04" },
  { bg: "#FFEDD5", dot: "#EA580C" },
  { bg: "#DBEAFE", dot: "#2563EB" },
  { bg: "#FEE2E2", dot: "#DC2626" },
  { bg: "#F3E8FF", dot: "#9333EA" },
  { bg: "#FCE7F3", dot: "#DB2777" },
  { bg: "#CCFBF1", dot: "#0D9488" },
  { bg: "#E0E7FF", dot: "#4F46E5" },
  { bg: "#ECFCCB", dot: "#65A30D" },
  { bg: "#CFFAFE", dot: "#0891B2" },
  { bg: "#FFE4E6", dot: "#E11D48" },
  { bg: "#FEF3C7", dot: "#D97706" },
  { bg: "#F1F5F9", dot: "#475569" },
];
