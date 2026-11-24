import { can, type AccessSubject } from "@/lib/access";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Menu tampil bila fungsi ini true untuk akun yang login. */
  visible: (s: AccessSubject) => boolean;
  /** Label alternatif bila hanya melihat data milik sendiri (tentor). */
  ownLabel?: string;
  ownWhen?: (s: AccessSubject) => boolean;
};

export const NAV: NavItem[] = [
  { href: "/", label: "Beranda", icon: "home", visible: () => true },
  {
    href: "/siswa",
    label: "Data Siswa",
    icon: "users",
    visible: (s) => can(s, "siswa") || s.isTutor,
    ownLabel: "Siswa Saya",
    ownWhen: (s) => !can(s, "siswa"),
  },
  { href: "/tentor", label: "Tentor & Tarif", icon: "briefcase", visible: (s) => can(s, "tentor") },
  {
    href: "/jadwal",
    label: "Jadwal & Absensi",
    icon: "calendar",
    visible: (s) => can(s, "jadwal") || s.isTutor,
    ownLabel: "Jadwal Saya",
    ownWhen: (s) => !can(s, "jadwal"),
  },
  { href: "/laporan", label: "Laporan", icon: "file-text", visible: (s) => can(s, "laporan") || s.isTutor },
  { href: "/materi", label: "Bank Materi", icon: "book", visible: (s) => can(s, "materi") },
  { href: "/invoice", label: "Invoice", icon: "receipt", visible: (s) => can(s, "invoice") },
  { href: "/honor", label: "Honor Tentor", icon: "wallet", visible: (s) => can(s, "honor") },
  { href: "/pengguna", label: "Pengguna & Akses", icon: "shield", visible: (s) => can(s, "pengguna") },
  { href: "/pengaturan", label: "Pengaturan", icon: "settings", visible: (s) => can(s, "pengaturan") },
];

/** Urutan prioritas menu di bottom-nav HP (4 slot + "Lainnya"). */
export const MOBILE_PRIORITY = ["/", "/jadwal", "/siswa", "/invoice", "/laporan", "/materi"];
