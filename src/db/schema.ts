import { relations, sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  unique,
  uuid,
  primaryKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// ---------- ENUM ----------
/** Level akses per modul: read = Lihat, write = Kelola (termasuk Lihat). */
export const permissionLevel = pgEnum("permission_level", ["read", "write"]);
export const activeStatus = pgEnum("active_status", ["aktif", "nonaktif"]);
export const programKategori = pgEnum("program_kategori", ["privat", "kelompok", "abk"]);
export const statusKehadiran = pgEnum("status_kehadiran", ["terjadwal", "hadir", "tidak_hadir", "batal"]);
export const statusTagihan = pgEnum("status_tagihan", ["belum_rekap", "terekap", "dibebaskan"]);
export const statusBayar = pgEnum("status_bayar", ["belum_lunas", "lunas"]);
export const fileKind = pgEnum("file_kind", ["assessment", "attendance", "report", "material", "signature", "logo"]);

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
/** Kolom jejak "oleh siapa" (null untuk data lama sebelum fitur ini / akun yang dihapus). */
const byUser = (name: string) => uuid(name).references((): AnyPgColumn => users.id, { onDelete: "set null" });
const updatedAtOpt = () => ts("updated_at");

// ---------- AKUN & SESI ----------
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    nama: text("nama").notNull(),
    noWa: text("no_wa"),
    /** Mengajar: bisa di-assign ke siswa/jadwal, absen foto, lihat data miliknya. */
    isTutor: boolean("is_tutor").notNull().default(false),
    /** Super Admin: semua akses + kelola semua akun. Tersembunyi dari pengelola akun lain. */
    isSuperuser: boolean("is_superuser").notNull().default(false),
    spesialisasi: text("spesialisasi"),
    /** Honor per sesi (Rp). Dikunci ke slip saat honor ditandai lunas. 0 = belum diisi. */
    tarifHonor: integer("tarif_honor").notNull().default(0),
    /** Nomor rekening / e-wallet untuk pembayaran honor. */
    rekening: text("rekening"),
    /** Gambar tanda tangan (PNG/JPG) yang dicetak di slip honor yang ditandai lunas oleh akun ini. Kosong = tanpa gambar. */
    ttdFileId: uuid("ttd_file_id").references((): AnyPgColumn => files.id, { onDelete: "set null" }),
    /** Kelompok mapel tentor di Resource Timeline (1 tentor = 1 mapel). Null = belum diatur. */
    mapelKategori: text("mapel_kategori").references((): AnyPgColumn => mapelCategories.key, { onUpdate: "cascade" }),
    status: activeStatus("status").notNull().default("aktif"),
    createdAt: createdAt(),
    createdBy: byUser("created_by"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: byUser("updated_by"),
  },
  (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`), check("users_tarif_honor_nonneg", sql`${t.tarifHonor} >= 0`)],
);

/**
 * Kategori mapel untuk Jadwal (warna, kelompok tentor, tarif honor khusus). Daftar awal diisi migrasi;
 * admin bisa menambah/mengubah. "key" tetap (dipakai sebagai rujukan); "lainnya" selalu ada sebagai cadangan.
 */
export const mapelCategories = pgTable(
  "mapel_categories",
  {
    key: text("key").primaryKey(),
    label: text("label").notNull(),
    /** Label pendek untuk pil filter. */
    short: text("short").notNull(),
    /** Warna latar pastel & warna titik/tepi, format #RRGGBB (divalidasi: dipakai langsung di CSS). */
    bg: text("bg").notNull(),
    dot: text("dot").notNull(),
    urut: integer("urut").notNull().default(0),
    aktif: boolean("aktif").notNull().default(true),
    createdAt: createdAt(),
    createdBy: byUser("created_by"),
    updatedAt: updatedAtOpt(),
    updatedBy: byUser("updated_by"),
  },
  (t) => [
    check("mapel_categories_key_fmt", sql`${t.key} ~ '^[a-z0-9_]{2,30}$'`),
    check("mapel_categories_bg_fmt", sql`${t.bg} ~ '^#[0-9A-Fa-f]{6}$'`),
    check("mapel_categories_dot_fmt", sql`${t.dot} ~ '^#[0-9A-Fa-f]{6}$'`),
  ],
);

/** Akses per modul per akun. Modul divalidasi di kode (src/lib/access.ts). Tanpa baris = tanpa akses. */
export const userPermissions = pgTable(
  "user_permissions",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    module: text("module").notNull(),
    level: permissionLevel("level").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.module] })],
);

/** Token sesi disimpan sebagai hash SHA-256; token asli hanya ada di cookie. */
export const userSessions = pgTable(
  "user_sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    userAgent: text("user_agent"),
  },
  (t) => [index("user_sessions_user_idx").on(t.userId)],
);

// ---------- PENGATURAN ----------
export const appSettings = pgTable(
  "app_settings",
  {
    id: integer("id").primaryKey().default(1),
    namaBimbel: text("nama_bimbel").notNull().default("Bimbel Cerdas"),
    alamat: text("alamat"),
    rekening: text("rekening"),
    waAdmin: text("wa_admin"),
    linkDriveKonten: text("link_drive_konten"),
    absenBukaMenit: integer("absen_buka_menit").notNull().default(30),
    absenTutupMenit: integer("absen_tutup_menit").notNull().default(60),
    /** true = tentor boleh absen susulan kapan pun setelah jam mulai (batas "tutup" diabaikan). */
    absenSusulanBebas: boolean("absen_susulan_bebas").notNull().default(false),
    /** Logo & tagline untuk kop PDF (nota, slip honor). */
    logoFileId: uuid("logo_file_id").references((): AnyPgColumn => files.id, { onDelete: "set null" }),
    tagline: text("tagline"),
    /** Kota untuk baris tanda tangan di slip ("Yogyakarta, 30 November 2026"). */
    kota: text("kota"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: byUser("updated_by"),
  },
  (t) => [check("app_settings_singleton", sql`${t.id} = 1`)],
);

// ---------- FILE (isi di disk UPLOAD_DIR, DB hanya metadata) ----------
export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: fileKind("kind").notNull(),
  /** Path relatif terhadap UPLOAD_DIR, mis. "attendance/2026/11/<uuid>.jpg" */
  storageKey: text("storage_key").notNull().unique(),
  originalName: text("original_name").notNull(),
  mime: text("mime").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  /** "bucket/path" asal di Supabase Storage (hanya untuk script migrasi) */
  legacyKey: text("legacy_key").unique(),
});

// ---------- MASTER ----------
export const programs = pgTable(
  "programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nama: text("nama").notNull().unique(),
    kategori: programKategori("kategori").notNull(),
    /** Warna & kelompok di Jadwal. Terpisah dari "kategori" (privat/kelompok/abk) yang menentukan jenis layanan. */
    mapelKategori: text("mapel_kategori").notNull().default("lainnya").references(() => mapelCategories.key, { onUpdate: "cascade" }),
    jenjang: text("jenjang").notNull(),
    tarifPerPertemuan: integer("tarif_per_pertemuan").notNull(),
    aktif: boolean("aktif").notNull().default(true),
    createdAt: createdAt(),
    createdBy: byUser("created_by"),
    updatedAt: updatedAtOpt(),
    updatedBy: byUser("updated_by"),
  },
  (t) => [check("programs_tarif_nonneg", sql`${t.tarifPerPertemuan} >= 0`)],
);

export const students = pgTable("students", {
  id: uuid("id").primaryKey().defaultRandom(),
  nama: text("nama").notNull(),
  /** Nama panggilan: dipakai di Jadwal & tampilan tentor. Kosong → pakai nama lengkap. */
  panggilan: text("panggilan"),
  tanggalLahir: date("tanggal_lahir", { mode: "string" }),
  kelas: text("kelas"),
  sekolah: text("sekolah"),
  alamat: text("alamat"),
  ortuNama: text("ortu_nama"),
  ortuWa: text("ortu_wa"),
  status: activeStatus("status").notNull().default("aktif"),
  deletedAt: ts("deleted_at"),
  deletedBy: byUser("deleted_by"),
  createdAt: createdAt(),
  createdBy: byUser("created_by"),
  updatedAt: updatedAtOpt(),
  updatedBy: byUser("updated_by"),
});

export const studentPrograms = pgTable(
  "student_programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    programId: uuid("program_id").notNull().references(() => programs.id),
    tutorId: uuid("tutor_id").references(() => users.id),
    createdAt: createdAt(),
    createdBy: byUser("created_by"),
    updatedAt: updatedAtOpt(),
    updatedBy: byUser("updated_by"),
  },
  (t) => [unique("student_programs_student_program_uq").on(t.studentId, t.programId), index("student_programs_tutor_idx").on(t.tutorId)],
);

export const studentAssessments = pgTable("student_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  fileId: uuid("file_id").notNull().references(() => files.id),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  uploadedAt: ts("uploaded_at").notNull().defaultNow(),
});

// ---------- INVOICE ----------
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  nomor: text("nomor").notNull().unique(),
  tglTerbit: ts("tgl_terbit").notNull().defaultNow(),
  studentId: uuid("student_id").notNull().references(() => students.id),
  programId: uuid("program_id").notNull().references(() => programs.id),
  jumlahSesi: integer("jumlah_sesi").notNull(),
  total: integer("total").notNull(),
  statusBayar: statusBayar("status_bayar").notNull().default("belum_lunas"),
  tglBayar: date("tgl_bayar", { mode: "string" }),
  /** Siapa & kapan mencatat pelunasan. Berbeda dari updated_by (berubah pada setiap perubahan); kosong bila belum lunas. */
  dibayarOleh: uuid("dibayar_oleh").references(() => users.id, { onDelete: "set null" }),
  dibayarPada: ts("dibayar_pada"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAtOpt(),
  updatedBy: byUser("updated_by"),
});

export const invoiceCounters = pgTable("invoice_counters", {
  periode: text("periode").primaryKey(), // YYYY-MM
  lastNumber: integer("last_number").notNull().default(0),
});

// ---------- HONOR TENTOR ----------
/**
 * Slip honor per tentor per bulan. Nilai di sini adalah SNAPSHOT saat ditandai lunas
 * (tarif, jumlah sesi, rekening) sehingga perubahan tarif/rekening berikutnya tidak mengubah slip lama.
 * Slip berstatus belum_lunas hanya menyimpan tunjangan; angka lain dihitung langsung dari absensi.
 */
export const honorSlips = pgTable(
  "honor_slips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nomor: text("nomor").notNull().unique(),
    periode: text("periode").notNull(), // YYYY-MM (bulan WIB dari jam mulai sesi)
    tutorId: uuid("tutor_id").notNull().references(() => users.id),
    totalSesi: integer("total_sesi").notNull(),
    subtotal: integer("subtotal").notNull(),
    tunjangan: integer("tunjangan").notNull().default(0),
    tunjanganKet: text("tunjangan_ket"),
    total: integer("total").notNull(),
    rekening: text("rekening"),
    statusBayar: statusBayar("status_bayar").notNull().default("belum_lunas"),
    tglBayar: date("tgl_bayar", { mode: "string" }),
    /** Siapa & kapan mencatat honor lunas; dan siapa & kapan terakhir mengatur tunjangan. Riwayat lengkap ada di audit_log. */
    dibayarOleh: uuid("dibayar_oleh").references(() => users.id, { onDelete: "set null" }),
    dibayarPada: ts("dibayar_pada"),
    tunjanganOleh: uuid("tunjangan_oleh").references(() => users.id, { onDelete: "set null" }),
    tunjanganPada: ts("tunjangan_pada"),
    createdAt: createdAt(),
    createdBy: byUser("created_by"),
    updatedAt: updatedAtOpt(),
    updatedBy: byUser("updated_by"),
  },
  (t) => [
    unique("honor_slips_tutor_periode_uq").on(t.tutorId, t.periode),
    check("honor_slips_periode_fmt", sql`${t.periode} ~ '^[0-9]{4}-[0-9]{2}$'`),
    check("honor_slips_tunjangan_nonneg", sql`${t.tunjangan} >= 0`),
  ],
);

export const honorCounters = pgTable("honor_counters", {
  periode: text("periode").primaryKey(), // YYYY-MM
  lastNumber: integer("last_number").notNull().default(0),
});

/**
 * Tarif honor khusus per kategori mapel untuk satu tentor (mis. Calistung Rp 40.000, ABK Rp 55.000).
 * Mapel tanpa baris di sini memakai users.tarif_honor (tarif standar tentor).
 */
export const tutorHonorRates = pgTable(
  "tutor_honor_rates",
  {
    tutorId: uuid("tutor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    mapelKategori: text("mapel_kategori").notNull().references(() => mapelCategories.key, { onUpdate: "cascade" }),
    tarif: integer("tarif").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tutorId, t.mapelKategori] }), check("tutor_honor_rates_nonneg", sql`${t.tarif} >= 0`)],
);

// ---------- JADWAL & ABSENSI ----------
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id").notNull().references(() => students.id),
    programId: uuid("program_id").notNull().references(() => programs.id),
    tutorId: uuid("tutor_id").notNull().references(() => users.id),
    mulaiAt: ts("mulai_at").notNull(),
    selesaiAt: ts("selesai_at").notNull(),
    statusKehadiran: statusKehadiran("status_kehadiran").notNull().default("terjadwal"),
    statusTagihan: statusTagihan("status_tagihan").notNull().default("belum_rekap"),
    absenAt: ts("absen_at"),
    fotoFileId: uuid("foto_file_id").references(() => files.id),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    akurasiM: doublePrecision("akurasi_m"),
    catatanAdmin: text("catatan_admin"),
    invoiceId: uuid("invoice_id").references(() => invoices.id),
    /** Terisi saat honor tentor bulan itu ditandai lunas; sesi terkunci dari perubahan sejak itu. */
    honorSlipId: uuid("honor_slip_id").references(() => honorSlips.id),
    /** Tarif honor sesi ini yang dibekukan saat slip lunas (null = belum dibayarkan honornya). */
    honorTarif: integer("honor_tarif"),
    createdAt: createdAt(),
    createdBy: byUser("created_by"),
    updatedAt: updatedAtOpt(),
    updatedBy: byUser("updated_by"),
  },
  (t) => [
    check("sessions_time_order", sql`${t.selesaiAt} > ${t.mulaiAt}`),
    check("sessions_honor_tarif_nonneg", sql`${t.honorTarif} is null or ${t.honorTarif} >= 0`),
    index("sessions_tutor_mulai_idx").on(t.tutorId, t.mulaiAt),
    index("sessions_mulai_idx").on(t.mulaiAt),
    index("sessions_honor_slip_idx").on(t.honorSlipId).where(sql`${t.honorSlipId} is not null`),
    index("sessions_ready_idx")
      .on(t.studentId, t.programId)
      .where(sql`${t.statusKehadiran} = 'hadir' and ${t.statusTagihan} = 'belum_rekap'`),
  ],
);

export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").notNull().unique().references(() => sessions.id),
  tanggal: ts("tanggal").notNull(),
  tarifSnapshot: integer("tarif_snapshot").notNull(),
});

// ---------- LAPORAN & MATERI ----------
export const progressReports = pgTable(
  "progress_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id").notNull().references(() => students.id),
    programId: uuid("program_id").references(() => programs.id),
    tutorId: uuid("tutor_id").notNull().references(() => users.id),
    fileId: uuid("file_id").notNull().references(() => files.id),
    periode: text("periode"),
    catatan: text("catatan"),
    uploadedAt: ts("uploaded_at").notNull().defaultNow(),
    /** Diisi saat laporan diedit (ganti file/periode). */
    updatedAt: ts("updated_at"),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    deletedAt: ts("deleted_at"),
    deletedBy: byUser("deleted_by"),
  },
  (t) => [index("progress_reports_tutor_idx").on(t.tutorId)],
);

export const materials = pgTable("materials", {
  id: uuid("id").primaryKey().defaultRandom(),
  judul: text("judul").notNull(),
  kategori: text("kategori").notNull(),
  jenjang: text("jenjang").notNull(),
  fileId: uuid("file_id").notNull().references(() => files.id),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedBy: byUser("updated_by"),
  deletedAt: ts("deleted_at"),
  deletedBy: byUser("deleted_by"),
  createdAt: createdAt(),
});

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  aksi: text("aksi").notNull(),
  target: text("target"),
  detail: jsonb("detail"),
  createdAt: createdAt(),
});

// ---------- RELASI (untuk db.query.*) ----------
export const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
  user: one(users, { fields: [userPermissions.userId], references: [users.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  permissions: many(userPermissions),
  sessions: many(sessions),
  assignments: many(studentPrograms),
}));

export const studentsRelations = relations(students, ({ many }) => ({
  programs: many(studentPrograms),
  assessments: many(studentAssessments),
}));

export const programsRelations = relations(programs, ({ many }) => ({
  students: many(studentPrograms),
}));

export const studentProgramsRelations = relations(studentPrograms, ({ one }) => ({
  student: one(students, { fields: [studentPrograms.studentId], references: [students.id] }),
  program: one(programs, { fields: [studentPrograms.programId], references: [programs.id] }),
  tutor: one(users, { fields: [studentPrograms.tutorId], references: [users.id] }),
}));

export const studentAssessmentsRelations = relations(studentAssessments, ({ one }) => ({
  student: one(students, { fields: [studentAssessments.studentId], references: [students.id] }),
  file: one(files, { fields: [studentAssessments.fileId], references: [files.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  student: one(students, { fields: [sessions.studentId], references: [students.id] }),
  program: one(programs, { fields: [sessions.programId], references: [programs.id] }),
  tutor: one(users, { fields: [sessions.tutorId], references: [users.id] }),
  invoice: one(invoices, { fields: [sessions.invoiceId], references: [invoices.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  student: one(students, { fields: [invoices.studentId], references: [students.id] }),
  program: one(programs, { fields: [invoices.programId], references: [programs.id] }),
  items: many(invoiceItems),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
}));

export const progressReportsRelations = relations(progressReports, ({ one }) => ({
  student: one(students, { fields: [progressReports.studentId], references: [students.id] }),
  program: one(programs, { fields: [progressReports.programId], references: [programs.id] }),
  tutor: one(users, { fields: [progressReports.tutorId], references: [users.id] }),
  file: one(files, { fields: [progressReports.fileId], references: [files.id] }),
}));

export const materialsRelations = relations(materials, ({ one }) => ({
  file: one(files, { fields: [materials.fileId], references: [files.id] }),
}));
