CREATE TYPE "public"."permission_level" AS ENUM('read', 'write');--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"user_id" uuid NOT NULL,
	"module" text NOT NULL,
	"level" "permission_level" NOT NULL,
	CONSTRAINT "user_permissions_user_id_module_pk" PRIMARY KEY("user_id","module")
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "progress_reports" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "student_programs" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "student_programs" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "student_programs" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_tutor" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_superuser" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_programs" ADD CONSTRAINT "student_programs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_programs" ADD CONSTRAINT "student_programs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- ===== Konversi data: peran lama (role) → akses per modul. Hak akses tiap akun tetap SAMA. =====
UPDATE "users" SET "is_superuser" = ("role" = 'super_admin'), "is_tutor" = ("role" = 'tentor');--> statement-breakpoint
-- Admin lama: Kelola semua modul operasional (TANPA "pengguna", sama seperti sebelumnya)
INSERT INTO "user_permissions" ("user_id", "module", "level")
SELECT u."id", m."module", 'write'::"permission_level"
FROM "users" u
CROSS JOIN (VALUES ('siswa'), ('asesmen'), ('tentor'), ('jadwal'), ('laporan'), ('materi'), ('invoice'), ('pengaturan')) AS m("module")
WHERE u."role" = 'admin'
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Tentor lama: tetap bisa membaca Bank Materi
INSERT INTO "user_permissions" ("user_id", "module", "level")
SELECT u."id", 'materi', 'read'::"permission_level" FROM "users" u WHERE u."role" = 'tentor'
ON CONFLICT DO NOTHING;
