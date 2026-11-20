-- Hosted MCP/edge audit events become queryable without replacing the log copy.
BEGIN;
CREATE TABLE IF NOT EXISTS "external_agent_audit_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identity_id" TEXT,
  "credential_id" TEXT,
  "effect" TEXT NOT NULL,
  "tool" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "scope_decision" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "trace_id" TEXT,
  "receipt_id" TEXT,
  "replayed" BOOLEAN,
  "duration_ms" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_agent_audit_events_identity_id_fkey" FOREIGN KEY ("identity_id")
    REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "external_agent_audit_events_identity_id_created_at_idx" ON "external_agent_audit_events"("identity_id", "created_at");
CREATE INDEX IF NOT EXISTS "external_agent_audit_events_identity_id_request_id_idx" ON "external_agent_audit_events"("identity_id", "request_id");
CREATE INDEX IF NOT EXISTS "external_agent_audit_events_identity_id_credential_id_created_at_idx" ON "external_agent_audit_events"("identity_id", "credential_id", "created_at");
COMMIT;
