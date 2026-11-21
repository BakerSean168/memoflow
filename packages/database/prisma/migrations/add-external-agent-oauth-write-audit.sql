-- OAuth write receipts and audit rows carry credential provenance (#1054).
BEGIN;
ALTER TABLE "external_mutation_receipts"
  ADD COLUMN IF NOT EXISTS "credential_type" TEXT,
  ADD COLUMN IF NOT EXISTS "client_id" TEXT,
  ADD COLUMN IF NOT EXISTS "consent_scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "external_agent_audit_events"
  ADD COLUMN IF NOT EXISTS "credential_type" TEXT,
  ADD COLUMN IF NOT EXISTS "client_id" TEXT,
  ADD COLUMN IF NOT EXISTS "consent_scopes_hash" TEXT;
COMMIT;
