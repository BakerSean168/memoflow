-- S4-2302A: canonical Scheduler runtime truth.
--
-- The default deploy path is Prisma schema reconciliation (`prisma db push`).
-- This DDL mirrors the canonical Prisma models for databases maintained through
-- the repository's explicit/manual migration lane.
CREATE TABLE IF NOT EXISTS "scheduled_invocations" (
  "id" TEXT NOT NULL,
  "identity_id" TEXT NOT NULL,
  "owner_type" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "scheduling_key" TEXT NOT NULL,
  "handler_key" TEXT NOT NULL,
  "payload_version" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "run_at" TIMESTAMP(3) NOT NULL,
  "source_revision" JSONB,
  "retry_enabled" BOOLEAN NOT NULL DEFAULT true,
  "max_retries" INTEGER NOT NULL,
  "initial_delay_ms" INTEGER NOT NULL,
  "max_delay_ms" INTEGER NOT NULL,
  "backoff_multiplier" DOUBLE PRECISION NOT NULL,
  "priority" TEXT NOT NULL,
  "timeout_ms" INTEGER,
  "status" TEXT NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP(3),
  "claim_token" TEXT,
  "claim_expires_at" TIMESTAMP(3),
  "fencing_token" INTEGER NOT NULL DEFAULT 0,
  "name" TEXT,
  "tags" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "scheduled_invocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scheduled_invocations_identity_id_fkey"
    FOREIGN KEY ("identity_id") REFERENCES "accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_invocations_owner_key_unique"
  ON "scheduled_invocations"("identity_id", "owner_type", "owner_id", "scheduling_key");

CREATE INDEX IF NOT EXISTS "scheduled_invocations_due_idx"
  ON "scheduled_invocations"("identity_id", "status", "next_attempt_at");

CREATE INDEX IF NOT EXISTS "scheduled_invocations_owner_idx"
  ON "scheduled_invocations"("identity_id", "owner_type", "owner_id");

CREATE TABLE IF NOT EXISTS "invocation_attempts" (
  "id" TEXT NOT NULL,
  "identity_id" TEXT NOT NULL,
  "invocation_id" TEXT NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL,
  "finished_at" TIMESTAMP(3),
  "outcome" TEXT NOT NULL,
  "result" JSONB,
  "failure_code" TEXT,
  "failure_message" TEXT,
  "failure_retryable" BOOLEAN,
  "worker_id" TEXT,
  "claim_token" TEXT,
  "fencing_token" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "invocation_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invocation_attempts_identity_id_fkey"
    FOREIGN KEY ("identity_id") REFERENCES "accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "invocation_attempts_invocation_id_fkey"
    FOREIGN KEY ("invocation_id") REFERENCES "scheduled_invocations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "invocation_attempts_number_unique"
  ON "invocation_attempts"("invocation_id", "attempt_number");

CREATE INDEX IF NOT EXISTS "invocation_attempts_lookup_idx"
  ON "invocation_attempts"("identity_id", "invocation_id", "created_at");
