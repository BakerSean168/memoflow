-- R4-2201B / ADR-077: separate Routine business occurrence resolution from
-- Scheduler/worker reliability status, and make interaction writes replay-safe.
ALTER TABLE "routine_occurrences"
  ALTER COLUMN "scheduled_for" DROP NOT NULL;

ALTER TABLE "routine_occurrences"
  ADD COLUMN IF NOT EXISTS "trigger_kind" TEXT NOT NULL DEFAULT 'WallClock',
  ADD COLUMN IF NOT EXISTS "became_due_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "resolution_state" TEXT NOT NULL DEFAULT 'Open',
  ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolution_kind" TEXT,
  ADD COLUMN IF NOT EXISTS "resolution_reason" TEXT;

ALTER TABLE "routine_interactions"
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;

-- There is no production data in the current cutover, but make the migration
-- safe for local/staging rows created before this column existed.
UPDATE "routine_interactions"
   SET "idempotency_key" = 'legacy:' || "id"
 WHERE "idempotency_key" IS NULL;

ALTER TABLE "routine_interactions"
  ALTER COLUMN "idempotency_key" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "routine_interactions_idempotency_key_key"
  ON "routine_interactions"("idempotency_key");
