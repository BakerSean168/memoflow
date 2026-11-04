/**
 * Adapter-owned PowerSync/SQLite DDL shared by notification adapters.
 *
 * Only local state that is NOT owned by `@memoflow/powersync-schema` belongs
 * here. Tables declared in the canonical schema are created by PowerSync and
 * must never be re-created by an adapter.
 */

/**
 * Shared outbox table (`outbox_messages`) is adapter-owned local SQLite state.
 * `notification_dispatch_outbox` and `desktop_delivery_acks` are canonical
 * PowerSync schema tables and deliberately absent from this module.
 */
export const OUTBOX_MESSAGES_TABLE_DDL = `
      CREATE TABLE IF NOT EXISTS outbox_messages (
        id TEXT PRIMARY KEY,
        aggregate_type TEXT NOT NULL DEFAULT 'shared',
        aggregate_id TEXT NOT NULL DEFAULT 'shared',
        message_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        owner_token TEXT,
        claim_id TEXT,
        fencing_token INTEGER NOT NULL DEFAULT 0,
        lease_expires_at TEXT,
        last_heartbeat_at TEXT,
        last_error TEXT,
        next_retry_at TEXT,
        identity_id TEXT,
        idempotency_key TEXT UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        correlation_id TEXT NOT NULL DEFAULT '',
        causation_id TEXT,
        schema_version INTEGER NOT NULL DEFAULT 1,
        dispatched_at TEXT
      );
    `;

export const OUTBOX_MESSAGES_INDEX_DDLS = [
  `CREATE INDEX IF NOT EXISTS idx_om_message_type ON outbox_messages(message_type);`,
  `CREATE INDEX IF NOT EXISTS idx_om_status ON outbox_messages(status);`,
] as const;
