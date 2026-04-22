-- Phase 5.1a hardening — notification_preferences UNIQUE(user_id, notification_type, channel).
--
-- 26_Notifications.md §"جدول notification_preferences" declares this uniqueness
-- constraint explicitly. The initial schema shipped the columns but not the
-- constraint, which means listPreferences()'s lazy-seed of 14 default rows
-- could race: two concurrent first-time GETs for the same user could each
-- detect "no row exists" for a given (type, 'in_app') pair and each insert
-- one — producing duplicates. The UNIQUE constraint both enforces the
-- documented invariant and provides the conflict target the service layer
-- now uses with ON CONFLICT DO NOTHING for idempotent seeding.
--
-- No data backfill needed: the table is brand-new in 5.1a (shipped empty in
-- 0000), so there cannot yet be duplicate rows.

ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_user_type_channel_unique"
  UNIQUE ("user_id", "notification_type", "channel");
