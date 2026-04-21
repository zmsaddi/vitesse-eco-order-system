ALTER TABLE "users" ADD COLUMN "manager_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Phase 4.2: backfill a manager_box for every existing user whose role is
-- strictly 'manager' (NOT 'pm' / 'gm' / 'admin' / etc.) and who does not
-- already own one. Idempotent: re-running produces no duplicates.
INSERT INTO "treasury_accounts" ("type", "name", "owner_user_id", "parent_account_id", "balance", "active")
SELECT 'manager_box', 'صندوق ' || u."name", u."id", NULL, 0, 1
FROM "users" u
WHERE u."role" = 'manager'
  AND u."active" = true
  AND NOT EXISTS (
    SELECT 1 FROM "treasury_accounts" ta
    WHERE ta."owner_user_id" = u."id" AND ta."type" = 'manager_box'
  );
