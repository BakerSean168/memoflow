-- AI Goal native review single-writer lease. Additive: no existing user
-- goals, Mastra run snapshots or conversations are modified.
-- Rows are retained on release/expiry so the fencing generation is monotone.
BEGIN;
CREATE TABLE IF NOT EXISTS "ai_goal_surface_leases" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identity_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "owner_token" TEXT,
  "fence" INTEGER NOT NULL DEFAULT 1,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ai_goal_surface_leases_identity_id_run_id_key"
  ON "ai_goal_surface_leases" ("identity_id", "run_id");
CREATE INDEX IF NOT EXISTS "ai_goal_surface_leases_expires_at_idx"
  ON "ai_goal_surface_leases" ("expires_at");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_goal_surface_leases_identity_id_fkey'
  ) THEN
    ALTER TABLE "ai_goal_surface_leases"
    ADD CONSTRAINT "ai_goal_surface_leases_identity_id_fkey"
    FOREIGN KEY ("identity_id") REFERENCES "accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
COMMIT;
