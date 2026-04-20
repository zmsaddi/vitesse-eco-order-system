ALTER TABLE "invoices" ADD COLUMN "vendor_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payments_history" jsonb DEFAULT '[]'::jsonb NOT NULL;