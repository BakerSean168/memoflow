-- SETTING-9209 / ADR-111 destructive cutover.
-- No production legacy data is retained; UserPreferenceRecord is the sole Setting truth.
DROP TABLE IF EXISTS "user_settings";
