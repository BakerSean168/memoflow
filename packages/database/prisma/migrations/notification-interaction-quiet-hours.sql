-- N4-2402B: replace generic NotificationHistory with typed NotificationInteraction
-- and move user DND to Product-Time aware QuietHours. Legacy product data is not retained (ADR-111).

DROP TABLE IF EXISTS "notification_history";

ALTER TABLE "notification_preferences"
  DROP COLUMN IF EXISTS "do_not_disturb",
  DROP COLUMN IF EXISTS "rate_limit",
  ADD COLUMN IF NOT EXISTS "quiet_hours" TEXT;

CREATE TABLE IF NOT EXISTS "notification_interactions" (
  "id" TEXT PRIMARY KEY,
  "idempotency_key" TEXT NOT NULL UNIQUE,
  "identity_id" TEXT NOT NULL,
  "notification_id" TEXT NOT NULL,
  "action_key" TEXT NOT NULL,
  "action_kind" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "command_receipt_id" TEXT,
  "outcome" TEXT NOT NULL,
  "correlation_id" TEXT,
  "causation_id" TEXT,
  CONSTRAINT "notification_interactions_identity_id_fkey"
    FOREIGN KEY ("identity_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "notification_interactions_notification_id_fkey"
    FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "notification_interactions_identity_id_occurred_at_idx"
  ON "notification_interactions"("identity_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "notification_interactions_notification_id_occurred_at_idx"
  ON "notification_interactions"("notification_id", "occurred_at");
