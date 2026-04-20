ALTER TABLE "expenses" ADD COLUMN "reversal_of" integer;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_reversal_of_expenses_id_fk" FOREIGN KEY ("reversal_of") REFERENCES "public"."expenses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_one_reversal_per_original" ON "expenses" USING btree ("reversal_of") WHERE "expenses"."reversal_of" IS NOT NULL AND "expenses"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_no_self_reversal" CHECK ("expenses"."reversal_of" IS NULL OR "expenses"."reversal_of" <> "expenses"."id");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_reversal_amount_negative" CHECK ("expenses"."reversal_of" IS NULL OR "expenses"."amount" < 0);