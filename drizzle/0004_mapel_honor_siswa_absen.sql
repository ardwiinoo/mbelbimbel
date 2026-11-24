ALTER TYPE "public"."file_kind" ADD VALUE 'signature';--> statement-breakpoint
ALTER TYPE "public"."file_kind" ADD VALUE 'logo';--> statement-breakpoint
CREATE TABLE "honor_counters" (
	"periode" text PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "honor_slips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nomor" text NOT NULL,
	"periode" text NOT NULL,
	"tutor_id" uuid NOT NULL,
	"total_sesi" integer NOT NULL,
	"subtotal" integer NOT NULL,
	"tunjangan" integer DEFAULT 0 NOT NULL,
	"tunjangan_ket" text,
	"total" integer NOT NULL,
	"rekening" text,
	"status_bayar" "status_bayar" DEFAULT 'belum_lunas' NOT NULL,
	"tgl_bayar" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone,
	"updated_by" uuid,
	CONSTRAINT "honor_slips_nomor_unique" UNIQUE("nomor"),
	CONSTRAINT "honor_slips_tutor_periode_uq" UNIQUE("tutor_id","periode"),
	CONSTRAINT "honor_slips_periode_fmt" CHECK ("honor_slips"."periode" ~ '^[0-9]{4}-[0-9]{2}$'),
	CONSTRAINT "honor_slips_tunjangan_nonneg" CHECK ("honor_slips"."tunjangan" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mapel_categories" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"short" text NOT NULL,
	"bg" text NOT NULL,
	"dot" text NOT NULL,
	"urut" integer DEFAULT 0 NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone,
	"updated_by" uuid,
	CONSTRAINT "mapel_categories_key_fmt" CHECK ("mapel_categories"."key" ~ '^[a-z0-9_]{2,30}$'),
	CONSTRAINT "mapel_categories_bg_fmt" CHECK ("mapel_categories"."bg" ~ '^#[0-9A-Fa-f]{6}$'),
	CONSTRAINT "mapel_categories_dot_fmt" CHECK ("mapel_categories"."dot" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
-- Daftar awal kategori mapel (dari dokumen revisi 24-11-2026). Admin bisa menambah/mengubah di menu Tentor & Tarif.
-- Harus ada SEBELUM kolom programs/users/tutor_honor_rates merujuknya (kunci asing), dan "lainnya" wajib ada (cadangan).
INSERT INTO "mapel_categories" ("key", "label", "short", "bg", "dot", "urut") VALUES
  ('calistung', 'Calistung', 'Calistung', '#DCFCE7', '#16A34A', 10),
  ('tematik', 'Tematik / TKA SD', 'Tematik / TKA', '#FEF9C3', '#CA8A04', 20),
  ('matematika', 'Matematika', 'Matematika', '#FFEDD5', '#EA580C', 30),
  ('fisika_ipa', 'Fisika & IPA', 'Fisika & IPA', '#DBEAFE', '#2563EB', 40),
  ('kimia_biologi', 'Kimia & Biologi', 'Kimia & Biologi', '#FEE2E2', '#DC2626', 50),
  ('bahasa', 'Bahasa (Indo & Inggris)', 'Bahasa', '#F3E8FF', '#9333EA', 60),
  ('abk', 'ABK & Modifikasi Perilaku', 'ABK & Perilaku', '#FCE7F3', '#DB2777', 70),
  ('lainnya', 'IPS / Program Lainnya', 'IPS / Lainnya', '#F1F5F9', '#475569', 999)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
CREATE TABLE "tutor_honor_rates" (
	"tutor_id" uuid NOT NULL,
	"mapel_kategori" text NOT NULL,
	"tarif" integer NOT NULL,
	CONSTRAINT "tutor_honor_rates_tutor_id_mapel_kategori_pk" PRIMARY KEY("tutor_id","mapel_kategori"),
	CONSTRAINT "tutor_honor_rates_nonneg" CHECK ("tutor_honor_rates"."tarif" >= 0)
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "absen_susulan_bebas" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "logo_file_id" uuid;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "kota" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "mapel_kategori" text DEFAULT 'lainnya' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "honor_slip_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "honor_tarif" integer;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "panggilan" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tarif_honor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "rekening" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ttd_file_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mapel_kategori" text;--> statement-breakpoint
ALTER TABLE "honor_slips" ADD CONSTRAINT "honor_slips_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "honor_slips" ADD CONSTRAINT "honor_slips_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "honor_slips" ADD CONSTRAINT "honor_slips_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapel_categories" ADD CONSTRAINT "mapel_categories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapel_categories" ADD CONSTRAINT "mapel_categories_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_honor_rates" ADD CONSTRAINT "tutor_honor_rates_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_honor_rates" ADD CONSTRAINT "tutor_honor_rates_mapel_kategori_mapel_categories_key_fk" FOREIGN KEY ("mapel_kategori") REFERENCES "public"."mapel_categories"("key") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_logo_file_id_files_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_mapel_kategori_mapel_categories_key_fk" FOREIGN KEY ("mapel_kategori") REFERENCES "public"."mapel_categories"("key") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_honor_slip_id_honor_slips_id_fk" FOREIGN KEY ("honor_slip_id") REFERENCES "public"."honor_slips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_ttd_file_id_files_id_fk" FOREIGN KEY ("ttd_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_mapel_kategori_mapel_categories_key_fk" FOREIGN KEY ("mapel_kategori") REFERENCES "public"."mapel_categories"("key") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "sessions_honor_slip_idx" ON "sessions" USING btree ("honor_slip_id") WHERE "sessions"."honor_slip_id" is not null;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_honor_tarif_nonneg" CHECK ("sessions"."honor_tarif" is null or "sessions"."honor_tarif" >= 0);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tarif_honor_nonneg" CHECK ("users"."tarif_honor" >= 0);
--> statement-breakpoint
-- Konversi data lama: tebak kelompok mapel dari data yang sudah ada (admin bisa mengubahnya di Tentor & Tarif).
-- Program kategori ABK -> abk; lainnya dari nama program. Tidak dikenal -> lainnya (tidak pernah error).
UPDATE "programs" SET "mapel_kategori" = CASE
  WHEN "kategori" = 'abk' THEN 'abk'
  WHEN "nama" ILIKE '%kimia%' OR "nama" ILIKE '%biologi%' THEN 'kimia_biologi'
  WHEN "nama" ILIKE '%fisika%' OR "nama" ILIKE '%ipa%' THEN 'fisika_ipa'
  WHEN "nama" ILIKE '%matematika%' OR "nama" ILIKE '%mtk%' THEN 'matematika'
  WHEN "nama" ILIKE '%bahasa%' OR "nama" ILIKE '%inggris%' OR "nama" ILIKE '%indonesia%' THEN 'bahasa'
  WHEN "nama" ILIKE '%calistung%' THEN 'calistung'
  WHEN "nama" ILIKE '%tematik%' OR "nama" ILIKE '%tka%' THEN 'tematik'
  ELSE 'lainnya'
END;
--> statement-breakpoint
-- Tentor: dari kolom spesialisasi (kosong / tidak dikenal -> lainnya supaya tetap tampil di timeline).
UPDATE "users" SET "mapel_kategori" = CASE
  WHEN coalesce("spesialisasi", '') ILIKE '%kimia%' OR coalesce("spesialisasi", '') ILIKE '%biologi%' THEN 'kimia_biologi'
  WHEN coalesce("spesialisasi", '') ILIKE '%fisika%' OR coalesce("spesialisasi", '') ILIKE '%ipa%' THEN 'fisika_ipa'
  WHEN coalesce("spesialisasi", '') ILIKE '%matematika%' OR coalesce("spesialisasi", '') ILIKE '%mtk%' THEN 'matematika'
  WHEN coalesce("spesialisasi", '') ILIKE '%bahasa%' OR coalesce("spesialisasi", '') ILIKE '%inggris%' OR coalesce("spesialisasi", '') ILIKE '%indonesia%' THEN 'bahasa'
  WHEN coalesce("spesialisasi", '') ILIKE '%abk%' OR coalesce("spesialisasi", '') ILIKE '%khusus%' OR coalesce("spesialisasi", '') ILIKE '%perilaku%' THEN 'abk'
  WHEN coalesce("spesialisasi", '') ILIKE '%calistung%' THEN 'calistung'
  WHEN coalesce("spesialisasi", '') ILIKE '%tematik%' OR coalesce("spesialisasi", '') ILIKE '%tka%' THEN 'tematik'
  ELSE 'lainnya'
END
WHERE "is_tutor" = true;
--> statement-breakpoint
-- Menu baru "Honor Tentor": akun yang sudah mengelola Invoice (Kelola) ikut mendapat Honor Tentor (Kelola).
-- Akun lain (tentor, staf lihat-saja) TIDAK diubah; Super Admin selalu punya semua akses. Aman diulang.
INSERT INTO "user_permissions" ("user_id", "module", "level")
SELECT "user_id", 'honor', 'write' FROM "user_permissions"
WHERE "module" = 'invoice' AND "level" = 'write'
ON CONFLICT ("user_id", "module") DO NOTHING;
