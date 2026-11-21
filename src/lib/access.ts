// Katalog akses per modul (dipakai server & UI). Menambah modul baru = tambah di sini
// (tanpa migrasi DB). Level: "read" (Lihat) < "write" (Kelola; otomatis termasuk Lihat).

export const MODULES = [
  { key: "siswa", label: "Data Siswa", read: "Lihat semua siswa", write: "Tambah, edit, hapus siswa & penugasan" },
  { key: "asesmen", label: "Asesmen ABK", read: "Lihat & unduh dokumen asesmen", write: "Upload / ganti dokumen asesmen" },
  { key: "tentor", label: "Tentor & Tarif", read: "Lihat data tentor & tarif program", write: "Edit data tentor, program & tarif" },
  { key: "jadwal", label: "Jadwal & Absensi", read: "Lihat semua jadwal & foto absen", write: "Buat/edit jadwal & ubah kehadiran" },
  { key: "laporan", label: "Laporan", read: "Lihat semua laporan", write: "Edit semua laporan" },
  { key: "materi", label: "Bank Materi", read: "Lihat & unduh materi", write: "Upload, edit, hapus materi" },
  { key: "invoice", label: "Invoice", read: "Lihat invoice & nota", write: "Terbitkan invoice & tandai lunas" },
  { key: "pengaturan", label: "Pengaturan", read: "Lihat pengaturan", write: "Ubah pengaturan" },
  { key: "pengguna", label: "Pengguna & Akses", read: "Lihat daftar akun", write: "Buat akun, ubah akses, reset password" },
] as const;

export type Module = (typeof MODULES)[number]["key"];
export type Level = "read" | "write";
export type Permissions = Partial<Record<Module, Level>>;

export const MODULE_KEYS = MODULES.map((m) => m.key) as Module[];
export const isModule = (v: string): v is Module => (MODULE_KEYS as string[]).includes(v);

/** Subjek pengecekan akses (dipakai server maupun UI). */
export type AccessSubject = {
  isSuperuser: boolean;
  isTutor: boolean;
  perms: Permissions;
};

const RANK: Record<Level, number> = { read: 1, write: 2 };

/** Boleh-kah subjek mengakses modul pada level tertentu? Super Admin selalu boleh. */
export function can(s: AccessSubject | null | undefined, module: Module, level: Level = "read") {
  if (!s) return false;
  if (s.isSuperuser) return true;
  const have = s.perms[module];
  return !!have && RANK[have] >= RANK[level];
}

/** Level efektif (Super Admin = write untuk semua modul). */
export function levelOf(s: AccessSubject, module: Module): Level | null {
  return s.isSuperuser ? "write" : (s.perms[module] ?? null);
}

/** Paket cepat di form akses. */
export const PRESETS: { key: string; label: string; isTutor: boolean; perms: Permissions }[] = [
  {
    key: "admin",
    label: "Admin",
    isTutor: false,
    perms: { siswa: "write", asesmen: "write", tentor: "write", jadwal: "write", laporan: "write", materi: "write", invoice: "write", pengaturan: "write" },
  },
  { key: "tentor", label: "Tentor", isTutor: true, perms: { materi: "read" } },
  {
    key: "admin_tentor",
    label: "Admin + Tentor",
    isTutor: true,
    perms: { siswa: "write", asesmen: "write", tentor: "write", jadwal: "write", laporan: "write", materi: "write", invoice: "write", pengaturan: "write" },
  },
  {
    key: "keuangan",
    label: "Keuangan",
    isTutor: false,
    perms: { siswa: "read", invoice: "write", jadwal: "read" },
  },
  {
    key: "lihat",
    label: "Hanya lihat",
    isTutor: false,
    perms: { siswa: "read", tentor: "read", jadwal: "read", laporan: "read", materi: "read", invoice: "read" },
  },
];

/** Label singkat jenis akun untuk tampilan (bukan untuk otorisasi). */
export function accountLabel(s: AccessSubject) {
  if (s.isSuperuser) return "Super Admin";
  const hasAdmin = MODULE_KEYS.some((m) => s.perms[m] === "write" && m !== "materi");
  if (s.isTutor && hasAdmin) return "Admin + Tentor";
  if (s.isTutor) return "Tentor";
  if (Object.keys(s.perms).length) return hasAdmin ? "Admin" : "Staf (lihat)";
  return "Tanpa akses";
}

/** Apakah `granted` tidak melebihi akses `grantor` (anti eskalasi hak). */
export function withinGrantorAccess(grantor: AccessSubject, granted: Permissions) {
  if (grantor.isSuperuser) return true;
  return (Object.entries(granted) as [Module, Level][]).every(([m, lv]) => can(grantor, m, lv));
}
