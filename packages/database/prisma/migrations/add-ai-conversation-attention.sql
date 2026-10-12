-- P73: durable, owner-scoped Agent attention projection. No prompts or tool inputs.
BEGIN;
CREATE TABLE IF NOT EXISTS "ai_conversation_attention" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identity_id" TEXT NOT NULL,
  "runtime_kind" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "run_sequence" INTEGER NOT NULL DEFAULT 0,
  "state" TEXT NOT NULL DEFAULT 'normal',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "seen_revision" INTEGER NOT NULL DEFAULT 0,
  "run_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_conversation_attention_identity_conversation_key"
    UNIQUE ("identity_id", "runtime_kind", "conversation_id"),
  CONSTRAINT "ai_conversation_attention_identity_id_fkey"
    FOREIGN KEY ("identity_id") REFERENCES "accounts" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_conversation_attention_state_check"
    CHECK ("state" IN ('normal','working','input','approval','failed','done')),
  CONSTRAINT "ai_conversation_attention_kind_check"
    CHECK ("runtime_kind" IN ('builtin','local_agent')),
  CONSTRAINT "ai_conversation_attention_revision_check"
    CHECK ("revision" > 0 AND "seen_revision" >= 0 AND "seen_revision" <= "revision")
);
CREATE INDEX IF NOT EXISTS "ai_conversation_attention_identity_idx"
  ON "ai_conversation_attention" ("identity_id");
COMMIT;
