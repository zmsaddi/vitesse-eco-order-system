CREATE TABLE "notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"notification_type" text NOT NULL,
	"channel" text DEFAULT 'in_app' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"click_target" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"resource" text NOT NULL,
	"action" text NOT NULL,
	"allowed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_bonus_rates" (
	"username" text PRIMARY KEY NOT NULL,
	"seller_fixed" numeric(19, 2),
	"seller_percentage" numeric(5, 2),
	"driver_fixed" numeric(19, 2),
	"updated_by" text,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'seller' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"profit_share_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"profit_share_start" date,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('pm', 'gm', 'manager', 'seller', 'driver', 'stock_keeper'))
);
--> statement-breakpoint
CREATE TABLE "voice_rate_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "settings_key_check" CHECK ("settings"."key" IN ('shop_name', 'shop_legal_form', 'shop_siren', 'shop_siret', 'shop_ape', 'shop_vat_number', 'shop_address', 'shop_city', 'shop_email', 'shop_website', 'shop_iban', 'shop_bic', 'shop_capital_social', 'shop_rcs_city', 'shop_rcs_number', 'shop_penalty_rate_annual', 'shop_recovery_fee_eur', 'vat_rate', 'invoice_currency', 'seller_bonus_fixed', 'seller_bonus_percentage', 'driver_bonus_fixed', 'max_discount_seller_pct', 'max_discount_manager_pct', 'vin_required_categories', 'driver_custody_cap_eur', 'sku_limit', 'max_images_per_product', 'voice_rate_limit_per_min', 'voice_max_audio_seconds', 'voice_min_audio_ms', 'auto_refresh_interval_ms', 'activity_log_retention_days', 'voice_logs_retention_days', 'read_notifications_retention_days', 'neon_hours_used_this_month'))
);
--> statement-breakpoint
CREATE TABLE "gift_pool" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" numeric(19, 2) NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_counts" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"counted_by" text NOT NULL,
	"count_date" text NOT NULL,
	"expected_quantity" numeric(19, 2) NOT NULL,
	"actual_quantity" numeric(19, 2) NOT NULL,
	"variance" numeric(19, 2) NOT NULL,
	"notes" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"product_name" text NOT NULL,
	"product_id" integer,
	"purchase_id" integer,
	"old_buy_price" numeric(19, 2) DEFAULT '0' NOT NULL,
	"new_buy_price" numeric(19, 2) DEFAULT '0' NOT NULL,
	"old_sell_price" numeric(19, 2) DEFAULT '0' NOT NULL,
	"new_sell_price" numeric(19, 2) DEFAULT '0' NOT NULL,
	"changed_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_commission_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"seller_fixed_per_unit" numeric(19, 2),
	"seller_pct_overage" numeric(5, 2),
	"driver_fixed_per_delivery" numeric(19, 2),
	"active" boolean DEFAULT true NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone,
	CONSTRAINT "product_commission_rules_category_unique" UNIQUE("category")
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"url" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"unit" text DEFAULT '',
	"buy_price" numeric(19, 2) DEFAULT '0' NOT NULL,
	"sell_price" numeric(19, 2) DEFAULT '0' NOT NULL,
	"stock" numeric(19, 2) DEFAULT '0' NOT NULL,
	"low_stock_threshold" integer DEFAULT 3 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"description_ar" text DEFAULT '',
	"description_long" text DEFAULT '',
	"specs" jsonb DEFAULT '{}'::jsonb,
	"catalog_visible" boolean DEFAULT true NOT NULL,
	"notes" text DEFAULT '',
	"created_by" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone,
	CONSTRAINT "products_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"latin_name" text DEFAULT '',
	"phone" text DEFAULT '',
	"email" text DEFAULT '',
	"address" text DEFAULT '',
	"description_ar" text DEFAULT '',
	"notes" text DEFAULT '',
	"created_by" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" serial NOT NULL,
	"date" text NOT NULL,
	"amount" numeric(19, 2) NOT NULL,
	"payment_method" text DEFAULT 'كاش' NOT NULL,
	"purchase_id" serial NOT NULL,
	"notes" text DEFAULT '',
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '',
	"address" text DEFAULT '',
	"notes" text DEFAULT '',
	"credit_due_from_supplier" numeric(19, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"product_name_cached" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"quantity" numeric(19, 2) NOT NULL,
	"unit_price" numeric(19, 2) NOT NULL,
	"cost_price" numeric(19, 2) NOT NULL,
	"line_total" numeric(19, 2) NOT NULL,
	"is_gift" boolean DEFAULT false NOT NULL,
	"vin" text DEFAULT '',
	"commission_rule_snapshot" jsonb NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"ref_code" text DEFAULT '' NOT NULL,
	"date" text NOT NULL,
	"client_id" integer NOT NULL,
	"client_name_cached" text NOT NULL,
	"client_phone_cached" text DEFAULT '',
	"status" text DEFAULT 'محجوز' NOT NULL,
	"payment_method" text DEFAULT 'كاش' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"discount_type" text,
	"discount_value" numeric(19, 2),
	"total_amount" numeric(19, 2) DEFAULT '0' NOT NULL,
	"advance_paid" numeric(19, 2) DEFAULT '0' NOT NULL,
	"notes" text DEFAULT '',
	"delivery_date" text,
	"confirmation_date" timestamp with time zone,
	"created_by" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"due_date" text NOT NULL,
	"amount" numeric(19, 2) NOT NULL,
	"paid_amount" numeric(19, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"client_name_cached" text NOT NULL,
	"date" text NOT NULL,
	"type" text DEFAULT 'collection' NOT NULL,
	"payment_method" text DEFAULT 'كاش' NOT NULL,
	"amount" numeric(19, 2) NOT NULL,
	"notes" text DEFAULT '',
	"created_by" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(19, 2) NOT NULL,
	"payment_method" text DEFAULT 'كاش' NOT NULL,
	"comptable_class" text,
	"notes" text DEFAULT '',
	"created_by" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"ref_code" text DEFAULT '' NOT NULL,
	"date" text NOT NULL,
	"supplier_id" integer NOT NULL,
	"supplier_name_cached" text NOT NULL,
	"product_id" integer NOT NULL,
	"item_name_cached" text NOT NULL,
	"category" text DEFAULT '',
	"quantity" numeric(19, 2) NOT NULL,
	"unit_price" numeric(19, 2) NOT NULL,
	"total" numeric(19, 2) NOT NULL,
	"payment_method" text DEFAULT 'كاش' NOT NULL,
	"paid_amount" numeric(19, 2) DEFAULT '0' NOT NULL,
	"payment_status" text DEFAULT 'paid' NOT NULL,
	"notes" text DEFAULT '',
	"created_by" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"ref_code" text DEFAULT '' NOT NULL,
	"date" text NOT NULL,
	"order_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"client_name_cached" text NOT NULL,
	"client_phone_cached" text DEFAULT '',
	"address" text DEFAULT '',
	"status" text DEFAULT 'قيد الانتظار' NOT NULL,
	"assigned_driver_id" integer,
	"assigned_driver_username_cached" text DEFAULT '',
	"notes" text DEFAULT '',
	"confirmation_date" timestamp with time zone,
	"created_by" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'قيد الانتظار' NOT NULL,
	"assigned_driver_id" integer NOT NULL,
	"related_entity_type" text NOT NULL,
	"related_entity_id" integer NOT NULL,
	"amount_hint" numeric(19, 2),
	"notes" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"line_number" integer NOT NULL,
	"product_name_frozen" text NOT NULL,
	"quantity" numeric(19, 2) NOT NULL,
	"unit_price_ttc_frozen" numeric(19, 2) NOT NULL,
	"line_total_ttc_frozen" numeric(19, 2) NOT NULL,
	"vat_rate_frozen" numeric(5, 2) NOT NULL,
	"vat_amount_frozen" numeric(19, 2) NOT NULL,
	"ht_amount_frozen" numeric(19, 2) NOT NULL,
	"is_gift" boolean DEFAULT false NOT NULL,
	"vin_frozen" text DEFAULT '',
	CONSTRAINT "invoice_lines_invoice_line_unique" UNIQUE("invoice_id","line_number")
);
--> statement-breakpoint
CREATE TABLE "invoice_sequence" (
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_sequence_year_month_unique" UNIQUE("year","month")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"ref_code" text NOT NULL,
	"date" text NOT NULL,
	"delivery_date" text,
	"order_id" integer NOT NULL,
	"delivery_id" integer NOT NULL,
	"avoir_of_id" integer,
	"client_name_frozen" text NOT NULL,
	"client_phone_frozen" text DEFAULT '',
	"client_email_frozen" text DEFAULT '',
	"client_address_frozen" text DEFAULT '',
	"payment_method" text DEFAULT 'كاش' NOT NULL,
	"seller_name_frozen" text DEFAULT '',
	"driver_name_frozen" text DEFAULT '',
	"total_ttc_frozen" numeric(19, 2) NOT NULL,
	"total_ht_frozen" numeric(19, 2) NOT NULL,
	"tva_amount_frozen" numeric(19, 2) NOT NULL,
	"vat_rate_frozen" numeric(5, 2) NOT NULL,
	"prev_hash" text,
	"row_hash" text NOT NULL,
	"status" text DEFAULT 'مؤكد' NOT NULL,
	"pdf_url" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_ref_code_unique" UNIQUE("ref_code"),
	CONSTRAINT "invoices_avoir_negative_check" CHECK (("invoices"."avoir_of_id" IS NULL) OR ("invoices"."total_ttc_frozen"::numeric < 0))
);
--> statement-breakpoint
CREATE TABLE "bonuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"username" text NOT NULL,
	"role" text NOT NULL,
	"order_id" integer NOT NULL,
	"order_item_id" integer,
	"delivery_id" integer NOT NULL,
	"date" text NOT NULL,
	"fixed_part" numeric(19, 2) DEFAULT '0' NOT NULL,
	"overage_part" numeric(19, 2) DEFAULT '0' NOT NULL,
	"total_bonus" numeric(19, 2) NOT NULL,
	"settlement_id" integer,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"notes" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profit_distribution_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"base_period_start" text NOT NULL,
	"base_period_end" text NOT NULL,
	"net_profit" numeric(19, 2) NOT NULL,
	"distributable" numeric(19, 2) NOT NULL,
	"distributed" numeric(19, 2) DEFAULT '0' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profit_distributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"username" text NOT NULL,
	"base_amount" numeric(19, 2) NOT NULL,
	"percentage" numeric(5, 2) NOT NULL,
	"amount" numeric(19, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"user_id" integer NOT NULL,
	"username" text NOT NULL,
	"role" text NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(19, 2) NOT NULL,
	"payment_method" text DEFAULT 'كاش' NOT NULL,
	"notes" text DEFAULT '',
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "treasury_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"owner_user_id" integer,
	"parent_account_id" integer,
	"balance" numeric(19, 2) DEFAULT '0' NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treasury_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"category" text NOT NULL,
	"from_account_id" integer,
	"to_account_id" integer,
	"amount" numeric(19, 2) NOT NULL,
	"reference_type" text,
	"reference_id" integer,
	"notes" text DEFAULT '',
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer,
	"username" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer,
	"entity_ref_code" text,
	"details" jsonb,
	"ip_address" text,
	"prev_hash" text,
	"row_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cancellations" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"cancelled_by" text NOT NULL,
	"cancelled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"refund_amount" numeric(19, 2) DEFAULT '0' NOT NULL,
	"return_to_stock" integer NOT NULL,
	"seller_bonus_action" text NOT NULL,
	"driver_bonus_action" text NOT NULL,
	"delivery_status_before" text,
	"notes" text,
	"prev_hash" text,
	"row_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text NOT NULL,
	"endpoint" text NOT NULL,
	"username" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"status_code" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_key_endpoint_pk" PRIMARY KEY("key","endpoint")
);
--> statement-breakpoint
CREATE TABLE "ai_corrections" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"username" text NOT NULL,
	"transcript" text NOT NULL,
	"ai_output" text NOT NULL,
	"user_correction" text NOT NULL,
	"action_type" text NOT NULL,
	"field_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_patterns" (
	"id" serial PRIMARY KEY NOT NULL,
	"pattern_type" text NOT NULL,
	"spoken_text" text NOT NULL,
	"correct_value" text NOT NULL,
	"field_name" text NOT NULL,
	"frequency" integer DEFAULT 1 NOT NULL,
	"last_used" timestamp with time zone DEFAULT now() NOT NULL,
	"username" text DEFAULT '',
	CONSTRAINT "ai_patterns_unique" UNIQUE("spoken_text","correct_value","field_name","username")
);
--> statement-breakpoint
CREATE TABLE "entity_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"source" text DEFAULT 'user' NOT NULL,
	"frequency" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_aliases_type_norm_unique" UNIQUE("entity_type","normalized_alias")
);
--> statement-breakpoint
CREATE TABLE "voice_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"username" text NOT NULL,
	"transcript" text DEFAULT '',
	"normalized_text" text DEFAULT '',
	"action_type" text DEFAULT '',
	"action_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"debug_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_logs_status_check" CHECK ("voice_logs"."status" IN ('pending', 'processed', 'saved', 'abandoned', 'edited_and_saved', 'groq_error'))
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bonus_rates" ADD CONSTRAINT "user_bonus_rates_username_users_username_fk" FOREIGN KEY ("username") REFERENCES "public"."users"("username") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_rate_limits" ADD CONSTRAINT "voice_rate_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_pool" ADD CONSTRAINT "gift_pool_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedule" ADD CONSTRAINT "payment_schedule_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_assigned_driver_id_users_id_fk" FOREIGN KEY ("assigned_driver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_tasks" ADD CONSTRAINT "driver_tasks_assigned_driver_id_users_id_fk" FOREIGN KEY ("assigned_driver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profit_distributions" ADD CONSTRAINT "profit_distributions_group_id_profit_distribution_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."profit_distribution_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profit_distributions" ADD CONSTRAINT "profit_distributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_accounts" ADD CONSTRAINT "treasury_accounts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_movements" ADD CONSTRAINT "treasury_movements_from_account_id_treasury_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."treasury_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_movements" ADD CONSTRAINT "treasury_movements_to_account_id_treasury_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."treasury_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellations" ADD CONSTRAINT "cancellations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bonuses_seller_unique" ON "bonuses" USING btree ("delivery_id","order_item_id","role") WHERE "bonuses"."role" = 'seller' AND "bonuses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bonuses_driver_unique" ON "bonuses" USING btree ("delivery_id","role") WHERE "bonuses"."role" = 'driver' AND "bonuses"."deleted_at" IS NULL;