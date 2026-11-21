export type NavItem = {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  superOnly?: boolean;
  tentorLabel?: string;
};

export const NAV: NavItem[] = [
  { href: "/", label: "Beranda", icon: "home" },
  { href: "/siswa", label: "Data Siswa", icon: "users", tentorLabel: "Siswa Saya" },
  { href: "/tentor", label: "Tentor & Tarif", icon: "briefcase", adminOnly: true },
  { href: "/jadwal", label: "Jadwal & Absensi", icon: "calendar" },
  { href: "/laporan", label: "Laporan", icon: "file-text" },
  { href: "/materi", label: "Bank Materi", icon: "book" },
  { href: "/invoice", label: "Invoice", icon: "receipt", adminOnly: true },
  { href: "/pengguna", label: "Pengguna", icon: "shield", superOnly: true },
  { href: "/pengaturan", label: "Pengaturan", icon: "settings", adminOnly: true },
];
