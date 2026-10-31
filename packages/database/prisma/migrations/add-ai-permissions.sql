-- Agent business permissions are owner scoped and synced for Desktop and cloud MCP.
BEGIN;
CREATE TABLE IF NOT EXISTS "ai_permission_settings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identity_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "record_json" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_permission_settings_identity_id_fkey" FOREIGN KEY ("identity_id")
    REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ai_permission_settings_identity_id_idx" ON "ai_permission_settings"("identity_id");

CREATE TABLE IF NOT EXISTS "ai_permission_rules" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identity_id" TEXT NOT NULL,
  "agent_id" TEXT,
  "record_json" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_permission_rules_identity_id_fkey" FOREIGN KEY ("identity_id")
    REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ai_permission_rules_identity_id_agent_id_idx" ON "ai_permission_rules"("identity_id", "agent_id");

CREATE TABLE IF NOT EXISTS "ai_permission_audit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identity_id" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "record_json" TEXT NOT NULL,
  CONSTRAINT "ai_permission_audit_identity_id_fkey" FOREIGN KEY ("identity_id")
    REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ai_permission_audit_identity_id_occurred_at_idx" ON "ai_permission_audit"("identity_id", "occurred_at");
COMMIT;
