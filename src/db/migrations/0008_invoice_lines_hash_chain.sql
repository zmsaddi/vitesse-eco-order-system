ALTER TABLE "invoice_lines" ADD COLUMN "prev_hash" text;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD COLUMN "row_hash" text DEFAULT '' NOT NULL;