/** Post-Prisma preparation. The caller supplies a dedicated connection, not a pool. */
export interface AgentRegistryMigrationClient {
  query(sql: string): Promise<unknown>;
}

export async function prepareAIAgentRegistry(client: AgentRegistryMigrationClient): Promise<void> {
  await client.query('BEGIN');
  try {
    // Serialize concurrent migrator starts before reading the durable cutover marker.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ai-agent-registry-v2'))");
    await client.query(`
      ALTER TABLE ai_agent_conversation_bindings ADD COLUMN IF NOT EXISTS provider_id TEXT;
      ALTER TABLE ai_agent_conversation_bindings ADD COLUMN IF NOT EXISTS model_id TEXT;
      CREATE TABLE IF NOT EXISTS ai_agent_registry_migrations (id TEXT PRIMARY KEY);
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ai_agent_instances'::regclass AND conname = 'ai_agent_instances_web_driver_check') THEN
          ALTER TABLE ai_agent_instances ADD CONSTRAINT ai_agent_instances_web_driver_check
            CHECK (driver = 'mastra' AND native_config IS NULL AND legacy_connection_id IS NULL);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ai_agent_instances'::regclass AND conname = 'ai_agent_instances_revision_check') THEN
          ALTER TABLE ai_agent_instances ADD CONSTRAINT ai_agent_instances_revision_check CHECK (revision > 0);
        END IF;
      END $$;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM ai_agent_registry_migrations WHERE id = 'legacy-mastra-v2') THEN
          -- Keep names, connection IDs and model defaults; never read or copy credentials.
          -- Only an unoccupied canonical default can receive an explicitly default provider.
          CREATE TEMP TABLE agent_registry_backfill ON COMMIT DROP AS
          SELECT p.identity_id, p.id AS connection_id, p.name, p.is_active,
                 NULLIF(btrim(p.default_model), '') AS model_id,
                 CASE WHEN p.is_default AND
                   row_number() OVER (PARTITION BY p.identity_id ORDER BY p.is_default DESC, p.id) = 1 AND
                   NOT EXISTS (SELECT 1 FROM ai_agent_instances a WHERE a.identity_id = p.identity_id AND a.instance_id = 'mastra')
                 THEN 'mastra' ELSE 'mastra-legacy-' || md5(p.id) END AS instance_id
          FROM ai_provider_configs p WHERE p.deleted_at IS NULL;
          IF EXISTS (SELECT 1 FROM agent_registry_backfill WHERE length(btrim(name)) NOT BETWEEN 1 AND 120 OR length(model_id) > 512) THEN
            RAISE EXCEPTION 'Legacy Agent name/model cannot be migrated without data loss';
          END IF;
          INSERT INTO ai_agent_instances (id, identity_id, instance_id, driver, name, accent_color, enabled, revision, created_at, updated_at)
          SELECT md5(identity_id || ':' || instance_id), identity_id, instance_id, 'mastra',
                 CASE WHEN instance_id = 'mastra' THEN 'Mastra' ELSE name END,
                 '#6469da', is_active, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM agent_registry_backfill;
          INSERT INTO ai_agent_instance_bindings (id, identity_id, instance_id, connection_id, model_id)
          SELECT md5(identity_id || ':' || instance_id || ':' || connection_id), identity_id, instance_id, connection_id, model_id
          FROM agent_registry_backfill WHERE model_id IS NOT NULL;
          -- No conversation claims: historical provider/model selections remain their original facts.
          INSERT INTO ai_agent_registry_migrations (id) VALUES ('legacy-mastra-v2');
        END IF;
      END $$;
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
