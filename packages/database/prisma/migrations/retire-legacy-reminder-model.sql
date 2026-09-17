-- R4-2201C / ADR-076 / ADR-111: destructive legacy Reminder retirement.
-- There is no legacy product-data migration or compatibility read path.
DROP TABLE IF EXISTS "reminder_occurrences" CASCADE;
DROP TABLE IF EXISTS "reminder_responses" CASCADE;
DROP TABLE IF EXISTS "reminder_history" CASCADE;
DROP TABLE IF EXISTS "reminder_instances" CASCADE;
DROP TABLE IF EXISTS "reminder_templates" CASCADE;
DROP TABLE IF EXISTS "reminder_groups" CASCADE;
DROP TABLE IF EXISTS "reminder_statistics" CASCADE;
DROP TABLE IF EXISTS "user_reminder_preferences" CASCADE;
