-- Additive Profile import archive staging for `ai-conversation-messages@1` (#865).
-- Staging data is technical transfer state: it is never business data and is
-- swept 72 hours after creation (chunks are also deleted immediately on commit).
BEGIN;

CREATE TABLE IF NOT EXISTS "profile_import_archives" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identity_id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "operation_id" TEXT,
  "archive_digest" TEXT NOT NULL,
  "codec" TEXT NOT NULL,
  "chunk_count" INTEGER NOT NULL,
  "uncompressed_bytes" INTEGER NOT NULL,
  "archive_state" TEXT NOT NULL,
  "computed_manifest" TEXT,
  "parsed_content" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "profile_import_archives_identity_id_request_id_key"
  ON "profile_import_archives" ("identity_id", "request_id");

CREATE UNIQUE INDEX IF NOT EXISTS "profile_import_archives_operation_id_key"
  ON "profile_import_archives" ("operation_id");

CREATE INDEX IF NOT EXISTS "profile_import_archives_created_at_idx"
  ON "profile_import_archives" ("created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profile_import_archives_identity_id_fkey'
  ) THEN
    ALTER TABLE "profile_import_archives"
      ADD CONSTRAINT "profile_import_archives_identity_id_fkey"
      FOREIGN KEY ("identity_id") REFERENCES "accounts"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profile_import_archives_operation_id_fkey'
  ) THEN
    ALTER TABLE "profile_import_archives"
      ADD CONSTRAINT "profile_import_archives_operation_id_fkey"
      FOREIGN KEY ("operation_id") REFERENCES "profile_import_operations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "profile_import_archive_chunks" (
  "archive_id" TEXT NOT NULL,
  "index" INTEGER NOT NULL,
  "digest" TEXT NOT NULL,
  "bytes" BYTEA NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("archive_id", "index"),
  CONSTRAINT "profile_import_archive_chunks_archive_id_fkey"
    FOREIGN KEY ("archive_id") REFERENCES "profile_import_archives"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

COMMIT;
