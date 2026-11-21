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
} from "drizzle-orm/pg-core";

// ---------- ENUM ----------
export const userRole = pgEnum("user_role", ["super_admin", "admin", "tentor"]);
export const activeStatus = pgEnum("active_status", ["aktif", "nonaktif"]);
export const programKategori = pgEnum("program_kategori", ["privat", "kelompok", "abk"]);
export const statusKehadiran = pgEnum("status_kehadiran", ["terjadwal", "hadir", "tidak_hadir", "batal"]);
export const statusTagihan = pgEnum("status_tagihan", ["belum_rekap", "terekap"]);
export const statusBayar = pgEnum("status_bayar", ["belum_lunas", "lunas"]);
export const fileKind = pgEnum("file_kind", ["assessment", "attendance", "report", "material"]);

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

// ---------- AKUN & SESI ----------
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    nama: text("nama").notNull(),
    noWa: text("no_wa"),
    role: userRole("role").notNull().default("tentor"),
    spesialisasi: text("spesialisasi"),
    status: activeStatus("status").notNull().default("aktif"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`)],
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
    updatedAt: ts("updated_at").notNull().defaultNow(),
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
    jenjang: text("jenjang").notNull(),
    tarifPerPertemuan: integer("tarif_per_pertemuan").notNull(),
    aktif: boolean("aktif").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [check("programs_tarif_nonneg", sql`${t.tarifPerPertemuan} >= 0`)],
);

export const students = pgTable("students", {
  id: uuid("id").primaryKey().defaultRandom(),
  nama: text("nama").notNull(),
  tanggalLahir: date("tanggal_lahir", { mode: "string" }),
  kelas: text("kelas"),
  sekolah: text("sekolah"),
  alamat: text("alamat"),
  ortuNama: text("ortu_nama"),
  ortuWa: text("ortu_wa"),
  status: activeStatus("status").notNull().default("aktif"),
  deletedAt: ts("deleted_at"),
  createdAt: createdAt(),
});

export const studentPrograms = pgTable(
  "student_programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    programId: uuid("program_id").notNull().references(() => programs.id),
    tutorId: uuid("tutor_id").references(() => users.id),
    createdAt: createdAt(),
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
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const invoiceCounters = pgTable("invoice_counters", {
  periode: text("periode").primaryKey(), // YYYY-MM
  lastNumber: integer("last_number").notNull().default(0),
});

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
    createdAt: createdAt(),
  },
  (t) => [
    check("sessions_time_order", sql`${t.selesaiAt} > ${t.mulaiAt}`),
    index("sessions_tutor_mulai_idx").on(t.tutorId, t.mulaiAt),
    index("sessions_mulai_idx").on(t.mulaiAt),
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
    deletedAt: ts("deleted_at"),
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
  deletedAt: ts("deleted_at"),
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
export const usersRelations = relations(users, ({ many }) => ({
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
