-- P4-2301A / ADR-080: destructive CalendarEntry range cutover.
-- Existing Schedule rows are intentionally not migrated; environments with legacy rows
-- must reset/reseed according to ADR-111 before applying this lane.
ALTER TABLE "schedules"
  DROP COLUMN IF EXISTS "start_time",
  DROP COLUMN IF EXISTS "end_time",
  DROP COLUMN IF EXISTS "duration",
  DROP COLUMN IF EXISTS "priority",
  ADD COLUMN IF NOT EXISTS "range_kind" TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS "timed_start" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "timed_end" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "all_day_start" TEXT,
  ADD COLUMN IF NOT EXISTS "all_day_end" TEXT;

DROP INDEX IF EXISTS "schedules_start_time_end_time_idx";
CREATE INDEX IF NOT EXISTS "schedules_timed_range_idx"
  ON "schedules"("identity_id", "range_kind", "timed_start", "timed_end");
CREATE INDEX IF NOT EXISTS "schedules_all_day_range_idx"
  ON "schedules"("identity_id", "range_kind", "all_day_start", "all_day_end");
