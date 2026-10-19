-- AI-owned external handle metadata; applied by the maintained Prisma reconciliation.
CREATE TABLE IF NOT EXISTS ai_assisted_workflows (
 id TEXT PRIMARY KEY, identity_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 connection_id TEXT NOT NULL, kind TEXT NOT NULL, run_id TEXT NOT NULL UNIQUE,
 request_key TEXT NOT NULL, request_digest TEXT NOT NULL, request_json TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, view_json TEXT, pending_json TEXT,
 step_key TEXT, steps_json TEXT NOT NULL DEFAULT '[]', created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(identity_id, connection_id, request_key)
);
CREATE INDEX IF NOT EXISTS ai_assisted_workflows_identity_id_connection_id_idx
 ON ai_assisted_workflows(identity_id, connection_id);
