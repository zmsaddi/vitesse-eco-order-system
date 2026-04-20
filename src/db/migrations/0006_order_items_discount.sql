ALTER TABLE "order_items" ADD COLUMN "recommended_price" numeric(19, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "discount_type" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "discount_value" numeric(19, 2);