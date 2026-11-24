ALTER TABLE "honor_slips" ADD COLUMN "dibayar_oleh" uuid;--> statement-breakpoint
ALTER TABLE "honor_slips" ADD COLUMN "dibayar_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "honor_slips" ADD COLUMN "tunjangan_oleh" uuid;--> statement-breakpoint
ALTER TABLE "honor_slips" ADD COLUMN "tunjangan_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "dibayar_oleh" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "dibayar_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "honor_slips" ADD CONSTRAINT "honor_slips_dibayar_oleh_users_id_fk" FOREIGN KEY ("dibayar_oleh") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "honor_slips" ADD CONSTRAINT "honor_slips_tunjangan_oleh_users_id_fk" FOREIGN KEY ("tunjangan_oleh") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_dibayar_oleh_users_id_fk" FOREIGN KEY ("dibayar_oleh") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Isi data lama: invoice yang sudah lunas dianggap dicatat oleh pengubah terakhirnya (updated_by) pada updated_at,
-- satu-satunya jejak yang tersedia sebelum kolom ini ada. Invoice tanpa jejak dibiarkan kosong (tidak mengarang pelaku).
UPDATE "invoices" SET "dibayar_oleh" = "updated_by", "dibayar_pada" = "updated_at"
WHERE "status_bayar" = 'lunas' AND "dibayar_oleh" IS NULL AND "updated_by" IS NOT NULL;
