-- ROUTINE-3401: durable snooze/suppress state for the routine wall-clock lane.
--
-- The default deploy path is Prisma schema reconciliation (`prisma db push`),
-- which propagates `routine_temporary_overrides` from the shared schema
-- automatically. This DDL only helps an explicit/manual migration of a database
-- that predates the lane and is maintained outside Prisma's reconciliation
-- (same convention as add-routine-occurrences.sql).
CREATE TABLE IF NOT EXISTS "routine_temporary_overrides" (
  "identity_id" TEXT NOT NULL,
  "routine_id" TEXT NOT NULL,
  "override_json" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "routine_temporary_overrides_pkey" PRIMARY KEY ("identity_id", "routine_id")
);