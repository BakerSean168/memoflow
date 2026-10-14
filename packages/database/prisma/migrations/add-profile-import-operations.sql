-- Additive Profile Import owner table for a database that predates the
-- ProfileImportOperation Prisma model. No existing records are removed.
BEGIN;

CREATE TABLE IF NOT EXISTS "profile_import_operations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identity_id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "source_digest" TEXT NOT NULL,
  "effective_digest" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "plan_json" TEXT NOT NULL,
  "scheduling_reconciled_at" TIMESTAMP(3),
  "result_json" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "profile_import_operations_identity_id_request_id_key"
  ON "profile_import_operations" ("identity_id", "request_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profile_import_operations_identity_id_fkey'
  ) THEN
    ALTER TABLE "profile_import_operations"
      ADD CONSTRAINT "profile_import_operations_identity_id_fkey"
      FOREIGN KEY ("identity_id") REFERENCES "accounts"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
