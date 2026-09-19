-- P4-2301B / ADR-080: conflict is a derived Planner read model, never CalendarEntry truth.
ALTER TABLE "schedules"
  DROP COLUMN IF EXISTS "has_conflict",
  DROP COLUMN IF EXISTS "conflicting_schedules";
