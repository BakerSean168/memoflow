ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "notifications_identity_id_archived_at_created_at_idx"
  ON "notifications"("identity_id", "archived_at", "created_at");
