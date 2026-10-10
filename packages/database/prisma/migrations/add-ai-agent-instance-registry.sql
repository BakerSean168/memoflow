-- Agent Instance Registry V2: credential-free Agent identity is independent of Provider onboarding.
-- ADDITIVE ONLY. No existing AI providers, SecretVault rows or conversations are rewritten.
BEGIN;
CREATE TABLE IF NOT EXISTS "ai_agent_instances" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identity_id" TEXT NOT NULL,
  "instance_id" TEXT NOT NULL,
  "driver" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "accent_color" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "native_config" JSONB,
  "legacy_connection_id" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_agent_instances_identity_id_instance_id_key" UNIQUE ("identity_id","instance_id"),
  CONSTRAINT "ai_agent_instances_identity_id_fkey" FOREIGN KEY ("identity_id")
    REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_agent_instances_web_driver_check" CHECK ("driver" = 'mastra'),
  CONSTRAINT "ai_agent_instances_revision_check" CHECK ("revision" > 0)
);
CREATE INDEX IF NOT EXISTS "ai_agent_instances_identity_id_idx" ON "ai_agent_instances"("identity_id");

CREATE TABLE IF NOT EXISTS "ai_agent_instance_bindings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identity_id" TEXT NOT NULL,
  "instance_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "model_id" TEXT NOT NULL,
  CONSTRAINT "ai_agent_instance_bindings_identity_id_instance_id_connection_id_key"
    UNIQUE ("identity_id","instance_id","connection_id"),
  CONSTRAINT "ai_agent_instance_bindings_identity_id_fkey" FOREIGN KEY ("identity_id")
    REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_agent_instance_bindings_identity_id_instance_id_fkey" FOREIGN KEY ("identity_id","instance_id")
    REFERENCES "ai_agent_instances" ("identity_id","instance_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ai_agent_instance_bindings_identity_id_connection_id_idx"
  ON "ai_agent_instance_bindings"("identity_id","connection_id");

-- Cross-owner binding is not acceptable even if a transaction fails to check it.
-- Provider connections are soft-deletable, so deletion/disable is guarded in application logic;
-- this composite FK enforces ownership and physical presence only.
CREATE UNIQUE INDEX IF NOT EXISTS "ai_provider_configs_identity_id_id_key"
  ON "ai_provider_configs"("identity_id","id");
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_agent_instance_bindings_identity_id_connection_id_fkey'
  ) THEN
    ALTER TABLE "ai_agent_instance_bindings"
      ADD CONSTRAINT "ai_agent_instance_bindings_identity_id_connection_id_fkey"
      FOREIGN KEY ("identity_id", "connection_id")
      REFERENCES "ai_provider_configs"("identity_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
-- The first selected Agent owns the conversation until that conversation is deleted.
-- A missing row is a legacy conversation; no migration of historical chats is performed.
CREATE UNIQUE INDEX IF NOT EXISTS "ai_conversations_identity_id_id_key"
  ON "ai_conversations"("identity_id", "id");
CREATE TABLE IF NOT EXISTS "ai_agent_conversation_bindings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identity_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "instance_id" TEXT NOT NULL,
  CONSTRAINT "ai_agent_conversation_bindings_identity_id_conversation_id_key"
    UNIQUE ("identity_id", "conversation_id"),
  CONSTRAINT "ai_agent_conversation_bindings_identity_id_conversation_id_fkey"
    FOREIGN KEY ("identity_id", "conversation_id")
    REFERENCES "ai_conversations"("identity_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_agent_conversation_bindings_identity_id_instance_id_fkey"
    FOREIGN KEY ("identity_id", "instance_id")
    REFERENCES "ai_agent_instances"("identity_id", "instance_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ai_agent_conversation_bindings_identity_id_instance_id_idx"
  ON "ai_agent_conversation_bindings"("identity_id", "instance_id");
COMMIT;
