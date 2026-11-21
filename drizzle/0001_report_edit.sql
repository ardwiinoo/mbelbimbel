ALTER TABLE "progress_reports" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "progress_reports" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;